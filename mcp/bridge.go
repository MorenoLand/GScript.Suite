package mcp

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strconv"
	"sync"
	"time"
)

// RequestEvent is the name of the event that delivers a relayed request to the frontend.
// Its payload is a requestEvent; the frontend answers by calling Server.Resolve.
const RequestEvent = "mcp:request"

// CancelEvent tells the frontend that a relayed request was given up on (its payload is a
// cancelEvent), so a request still waiting in the frontend's queue is not run after its
// caller has been told it failed.
const CancelEvent = "mcp:cancel"

// requestEvent is what the frontend receives for each relayed MCP request.
type requestEvent struct {
	ID     string `json:"id"`
	Client string `json:"client"`
	Method string `json:"method"`
	Params string `json:"params"`
	// Deadline is when the caller stops waiting, in milliseconds since the Unix epoch.
	Deadline int64 `json:"deadline"`
}

type cancelEvent struct {
	ID string `json:"id"`
}

// manifest is what the frontend registers: everything the server lists without asking again.
type manifest struct {
	Instructions      string            `json:"instructions"`
	Tools             []json.RawMessage `json:"tools"`
	Resources         []json.RawMessage `json:"resources"`
	ResourceTemplates []json.RawMessage `json:"resourceTemplates"`
	Prompts           []json.RawMessage `json:"prompts"`
	// Timeouts maps a tool name to its call timeout in milliseconds.
	Timeouts map[string]int `json:"timeouts"`

	toolNames map[string]bool
}

// resolution is the frontend's answer to a relayed request.
type resolution struct {
	Result json.RawMessage `json:"result"`
	Error  *rpcError       `json:"error"`
}

var errFrontendNotReady = errors.New("the GSuite window has not finished loading")

// bridge relays requests to the frontend that registered most recently.
type bridge struct {
	emit func(event string, data any)

	mu       sync.Mutex
	client   string
	manifest *manifest
	ready    chan struct{}
	pending  map[string]chan resolution
	nextID   uint64
}

func newBridge(emit func(event string, data any)) *bridge {
	return &bridge{emit: emit, ready: make(chan struct{}), pending: make(map[string]chan resolution)}
}

// register records a frontend and its manifest. Requests in flight for a previous
// frontend are failed, since the page that was running them is gone.
func (b *bridge) register(client, manifestJSON string) error {
	if client == "" {
		return errors.New("missing client id")
	}
	var m manifest
	if err := json.Unmarshal([]byte(manifestJSON), &m); err != nil {
		return fmt.Errorf("invalid manifest: %w", err)
	}
	m.toolNames = make(map[string]bool, len(m.Tools))
	for _, raw := range m.Tools {
		var tool struct {
			Name string `json:"name"`
		}
		if err := json.Unmarshal(raw, &tool); err != nil || tool.Name == "" {
			return errors.New("invalid manifest: every tool needs a name")
		}
		m.toolNames[tool.Name] = true
	}
	b.mu.Lock()
	defer b.mu.Unlock()
	if b.client != "" && b.client != client {
		b.failPendingLocked("the GSuite window was reloaded while the request was running")
	}
	b.client = client
	if b.manifest == nil {
		close(b.ready)
	}
	b.manifest = &m
	return nil
}

func (b *bridge) failPendingLocked(message string) {
	for id, ch := range b.pending {
		ch <- resolution{Error: &rpcError{Code: codeInternalError, Message: message}}
		delete(b.pending, id)
	}
}

func (b *bridge) shutdown() {
	b.mu.Lock()
	defer b.mu.Unlock()
	b.failPendingLocked("GSuite is shutting down")
}

// current returns the registered manifest, or nil while no frontend has registered.
func (b *bridge) current() *manifest {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.manifest
}

// await blocks until a frontend has registered, the timeout passes or ctx ends.
func (b *bridge) await(ctx context.Context, timeout time.Duration) (*manifest, error) {
	if m := b.current(); m != nil {
		return m, nil
	}
	timer := time.NewTimer(timeout)
	defer timer.Stop()
	select {
	case <-b.ready:
		return b.current(), nil
	case <-timer.C:
		return nil, errFrontendNotReady
	case <-ctx.Done():
		return nil, ctx.Err()
	}
}

// call relays one request to the frontend and waits for its answer.
func (b *bridge) call(ctx context.Context, method string, params json.RawMessage, timeout time.Duration) (json.RawMessage, *rpcError) {
	if len(params) == 0 {
		params = json.RawMessage("{}")
	}
	ch := make(chan resolution, 1)
	b.mu.Lock()
	b.nextID++
	id := strconv.FormatUint(b.nextID, 10)
	client := b.client
	b.pending[id] = ch
	b.mu.Unlock()

	forget := func() {
		b.mu.Lock()
		delete(b.pending, id)
		b.mu.Unlock()
		b.emit(CancelEvent, cancelEvent{ID: id})
	}
	b.emit(RequestEvent, requestEvent{ID: id, Client: client, Method: method, Params: string(params), Deadline: time.Now().Add(timeout).UnixMilli()})

	timer := time.NewTimer(timeout)
	defer timer.Stop()
	select {
	case res := <-ch:
		if res.Error != nil {
			return nil, res.Error
		}
		if len(res.Result) == 0 {
			return json.RawMessage("{}"), nil
		}
		return res.Result, nil
	case <-timer.C:
		forget()
		return nil, &rpcError{Code: codeInternalError, Message: fmt.Sprintf("GSuite did not answer %s within %s", method, timeout)}
	case <-ctx.Done():
		forget()
		return nil, &rpcError{Code: codeInternalError, Message: "request cancelled"}
	}
}

// resolve delivers the frontend's answer for a relayed request.
func (b *bridge) resolve(id, payload string) error {
	var res resolution
	if err := json.Unmarshal([]byte(payload), &res); err != nil {
		res = resolution{Error: &rpcError{Code: codeInternalError, Message: "GSuite returned an unreadable answer: " + err.Error()}}
	}
	b.mu.Lock()
	ch, ok := b.pending[id]
	delete(b.pending, id)
	b.mu.Unlock()
	if !ok {
		return fmt.Errorf("no pending request %q", id)
	}
	ch <- res
	return nil
}
