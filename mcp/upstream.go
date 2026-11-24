package mcp

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os/exec"
	"strconv"
	"strings"
	"sync"
	"time"
)

// upstreamHandshakeTimeout bounds initialize and tools/list, which never wait on the user.
var upstreamHandshakeTimeout = 10 * time.Second

// upstreamListWait is how long a client's tools/list waits for a refresh of the upstream's
// tools before it is answered with the list from before. GSuite's own tools must not be
// held up by a program that is slow to answer.
var upstreamListWait = 2 * time.Second

const (
	// upstreamCallTimeout bounds a tool call. It is long because the other program may be
	// showing the user a question that has no time limit of its own.
	upstreamCallTimeout = 15 * time.Minute
	// upstreamListTTL is how long a tool list is reused before it is asked for again.
	upstreamListTTL = 5 * time.Second
	// upstreamRetryAfter spaces out attempts to start a program that could not be reached.
	upstreamRetryAfter = 10 * time.Second
	// upstreamBusyWait is how long a tool list waits for a call in flight before using the cached list.
	upstreamBusyWait = 1500 * time.Millisecond
	// upstreamPingTimeout bounds the check that an idle connection still works.
	upstreamPingTimeout = 5 * time.Second
	// upstreamMaxLine bounds one message in either direction; Remote Control drops longer ones unanswered.
	upstreamMaxLine = 60 << 20
)

// upstreamIdleCheck is how long a connection may sit unused before it is checked with a
// ping ahead of the next request. The child only notices that its program has gone when it
// next writes to it, so without the check the first request after a restart would be lost.
var upstreamIdleCheck = time.Second

// upstreamCommand names the program to start and explains why it stopped.
type upstreamCommand struct {
	// Label names the program in messages.
	Label string
	// Resolve returns the executable and its arguments, looked up afresh for every start.
	Resolve func() (string, []string, error)
	// Explain turns an exit code and the tail of stderr into a reason a person can act on. Optional.
	Explain func(code int, stderr string) string
}

// upstream is a client for an MCP server that GSuite re-exposes. The server is started as
// a child process and speaks one JSON-RPC message per line on its stdio. It answers
// strictly in order, so one request is in flight at a time.
type upstream struct {
	command upstreamCommand
	version string
	// changed is called when the tool list or the connection's state changes; tools reports
	// whether the set of tool names did.
	changed func(tools bool)

	// lane holds one token; whoever takes it owns the child's stdio.
	lane chan struct{}

	mu       sync.Mutex
	proc     *upstreamProc
	tools    []json.RawMessage
	names    map[string]bool
	listedAt time.Time
	failedAt time.Time
	// refreshing is open while a refresh of the tool list runs, so only one does.
	refreshing chan struct{}
	lastErr    string
	resolved   string
	nextID     uint64
	closed     bool
}

func newUpstream(command upstreamCommand, version string, changed func(tools bool)) *upstream {
	if changed == nil {
		changed = func(bool) {}
	}
	u := &upstream{command: command, version: version, changed: changed, lane: make(chan struct{}, 1)}
	u.lane <- struct{}{}
	return u
}

// upstreamState is a snapshot for the settings UI.
type upstreamState struct {
	Connected bool
	Busy      bool
	Resolved  string
	Tools     []string
	Error     string
}

func (u *upstream) state() upstreamState {
	u.mu.Lock()
	defer u.mu.Unlock()
	state := upstreamState{Resolved: u.resolved, Error: u.lastErr, Busy: len(u.lane) == 0}
	if u.proc != nil {
		select {
		case <-u.proc.done:
		default:
			state.Connected = true
		}
	}
	for _, raw := range u.tools {
		state.Tools = append(state.Tools, toolName(raw))
	}
	return state
}

// has reports whether the upstream listed a tool of this name the last time it was asked.
func (u *upstream) has(name string) bool {
	u.mu.Lock()
	defer u.mu.Unlock()
	return u.names[name]
}

func (u *upstream) close() {
	u.mu.Lock()
	u.closed = true
	proc := u.proc
	u.proc = nil
	u.mu.Unlock()
	if proc != nil {
		proc.kill()
	}
}

func (u *upstream) acquire(ctx context.Context, wait time.Duration) bool {
	var expired <-chan time.Time
	if wait > 0 {
		timer := time.NewTimer(wait)
		defer timer.Stop()
		expired = timer.C
	}
	select {
	case <-u.lane:
		return true
	case <-expired:
		return false
	case <-ctx.Done():
		return false
	}
}

func (u *upstream) release() {
	u.lane <- struct{}{}
}

// listed returns the upstream's tools for a client's tools/list. A list that is still
// fresh, or the lack of one right after a failure, is returned as it is. Otherwise the
// list is refreshed in the background and the client waits for that only briefly: a new
// list that arrives later is announced with a list_changed notification.
func (u *upstream) listed(ctx context.Context) []json.RawMessage {
	u.mu.Lock()
	fresh := !u.listedAt.IsZero() && time.Since(u.listedAt) < upstreamListTTL
	backingOff := !u.failedAt.IsZero() && time.Since(u.failedAt) < upstreamRetryAfter
	if fresh || backingOff || u.closed {
		defer u.mu.Unlock()
		return u.tools
	}
	done := u.refreshing
	if done == nil && len(u.lane) == 0 {
		// A call is in flight and may be waiting on the user: the list from before will do.
		defer u.mu.Unlock()
		return u.tools
	}
	if done == nil {
		done = u.startRefreshLocked()
	}
	u.mu.Unlock()
	timer := time.NewTimer(upstreamListWait)
	defer timer.Stop()
	select {
	case <-done:
	case <-timer.C:
	case <-ctx.Done():
	}
	u.mu.Lock()
	defer u.mu.Unlock()
	return u.tools
}

// startRefreshLocked starts a refresh of the tool list in the background, one at a time.
// The caller holds u.mu. The channel it returns is closed when the refresh is over.
func (u *upstream) startRefreshLocked() chan struct{} {
	if u.refreshing != nil {
		return u.refreshing
	}
	done := make(chan struct{})
	u.refreshing = done
	go func() {
		u.refresh()
		u.mu.Lock()
		u.refreshing = nil
		u.mu.Unlock()
		close(done)
	}()
	return done
}

// refresh asks the upstream for its tools and records them. It runs on its own clock
// rather than a caller's: the list is shared, and one client hanging up must not cost the
// others their tools.
func (u *upstream) refresh() []json.RawMessage {
	ctx, cancel := context.WithTimeout(context.Background(), upstreamBusyWait+3*upstreamHandshakeTimeout)
	defer cancel()
	// A call in flight may be waiting on the user; do not queue the list behind it.
	if !u.acquire(ctx, upstreamBusyWait) {
		u.mu.Lock()
		defer u.mu.Unlock()
		return u.tools
	}
	defer u.release()
	proc, err := u.connect()
	if err != nil {
		u.setTools(nil, err.Error())
		return nil
	}
	result, rpcErr, transportErr := u.roundTrip(ctx, proc, "tools/list", struct{}{}, upstreamHandshakeTimeout)
	if transportErr != nil {
		u.drop(proc)
		u.setTools(nil, transportErr.Error())
		return nil
	}
	// An answer that is not a list is not a lost connection: the tools known so far stay.
	if rpcErr != nil {
		return u.setProblem(rpcErr.Message)
	}
	var listed struct {
		Tools []json.RawMessage `json:"tools"`
	}
	if err := json.Unmarshal(result, &listed); err != nil {
		return u.setProblem(u.command.Label + " sent a tool list that could not be read")
	}
	tools := listed.Tools[:0]
	for _, raw := range listed.Tools {
		if toolName(raw) != "" {
			tools = append(tools, raw)
		}
	}
	u.setTools(tools, "")
	return tools
}

func toolName(raw json.RawMessage) string {
	var tool struct {
		Name string `json:"name"`
	}
	_ = json.Unmarshal(raw, &tool)
	return tool.Name
}

// setTools records a new tool list and announces it when the set of names changed.
func (u *upstream) setTools(tools []json.RawMessage, problem string) {
	names := make(map[string]bool, len(tools))
	for _, raw := range tools {
		names[toolName(raw)] = true
	}
	u.mu.Lock()
	same := len(names) == len(u.names)
	for name := range names {
		same = same && u.names[name]
	}
	sameError := problem == u.lastErr
	u.tools, u.names, u.lastErr = tools, names, problem
	if problem == "" {
		u.listedAt, u.failedAt = time.Now(), time.Time{}
	} else {
		u.listedAt, u.failedAt = time.Time{}, time.Now()
	}
	closed := u.closed
	u.mu.Unlock()
	if (!same || !sameError) && !closed {
		go u.changed(!same)
	}
}

// setProblem records why the tool list could not be refreshed, keeping the list there is.
func (u *upstream) setProblem(problem string) []json.RawMessage {
	u.mu.Lock()
	changed := problem != u.lastErr
	u.lastErr, u.failedAt = problem, time.Now()
	tools, closed := u.tools, u.closed
	u.mu.Unlock()
	if changed && !closed {
		go u.changed(false)
	}
	return tools
}

// call runs one tool and returns the upstream's answer unchanged: a result, or the
// JSON-RPC error it gave. Problems reaching the program become an internal error.
func (u *upstream) call(ctx context.Context, name string, arguments json.RawMessage) (json.RawMessage, *rpcError) {
	label := u.command.Label
	// Calls wait their turn: the upstream answers one request at a time.
	if !u.acquire(ctx, 0) {
		return nil, &rpcError{Code: codeInternalError, Message: "the request was given up on while it waited for an earlier " + label + " request to finish (that one may be waiting for an answer in " + label + "'s window); it was not sent"}
	}
	defer u.release()
	if len(arguments) == 0 || string(arguments) == "null" {
		arguments = json.RawMessage("{}")
	}
	params := struct {
		Name      string          `json:"name"`
		Arguments json.RawMessage `json:"arguments"`
	}{name, arguments}
	for attempt := 0; ; attempt++ {
		proc, err := u.connect()
		if err != nil {
			u.setTools(nil, err.Error())
			return nil, &rpcError{Code: codeInternalError, Message: err.Error()}
		}
		result, rpcErr, transportErr := u.roundTrip(ctx, proc, "tools/call", params, upstreamCallTimeout)
		if transportErr == nil {
			u.mu.Lock()
			if rpcErr != nil && rpcErr.Code == codeInvalidParams {
				// The tool may have been switched off since it was listed: ask again next time.
				u.listedAt = time.Time{}
			}
			// A call that got through while no list is known (the program was started after
			// the last attempt to list failed) is the moment to fetch one: clients are then
			// told the tools are back. It runs once this call has let go of the lane.
			if u.listedAt.IsZero() && len(u.tools) == 0 && !u.closed {
				defer func() {
					u.mu.Lock()
					u.failedAt = time.Time{}
					u.startRefreshLocked()
					u.mu.Unlock()
				}()
			}
			u.mu.Unlock()
			return result, rpcErr
		}
		u.drop(proc)
		// A request that never left can be sent again; one that left may have been carried out.
		if !transportErr.sent && attempt == 0 {
			continue
		}
		return nil, &rpcError{Code: codeInternalError, Message: transportErr.Error()}
	}
}

// connect returns a running, initialized child, starting one if needed. The caller holds
// the lane. The check and the handshake are quick and never wait on the user, so they run
// on their own clock: a caller that gives up must not take a working connection with it.
func (u *upstream) connect() (*upstreamProc, error) {
	ctx := context.Background()
	u.mu.Lock()
	proc, closed := u.proc, u.closed
	u.mu.Unlock()
	if closed {
		return nil, errors.New("the " + u.command.Label + " bridge is turned off")
	}
	if proc != nil {
		select {
		case <-proc.done:
			u.drop(proc)
		default:
			if time.Since(proc.used()) < upstreamIdleCheck {
				return proc, nil
			}
			// Any answer, even a refusal, shows the connection works.
			if _, _, transportErr := u.roundTrip(ctx, proc, "ping", struct{}{}, upstreamPingTimeout); transportErr == nil {
				return proc, nil
			}
			u.drop(proc)
		}
	}
	command, args, err := u.command.Resolve()
	if err != nil {
		return nil, err
	}
	u.mu.Lock()
	u.resolved = command
	u.mu.Unlock()
	proc, err = startUpstream(command, args)
	if err != nil {
		return nil, fmt.Errorf("could not start %s: %w", command, err)
	}
	init := map[string]any{
		"protocolVersion": "2025-06-18",
		"capabilities":    map[string]any{},
		"clientInfo":      map[string]any{"name": "gsuite", "title": "GSuite", "version": u.version},
	}
	_, rpcErr, transportErr := u.roundTrip(ctx, proc, "initialize", init, upstreamHandshakeTimeout)
	if transportErr != nil {
		proc.kill()
		return nil, transportErr
	}
	if rpcErr != nil {
		proc.kill()
		return nil, fmt.Errorf("%s refused the connection: %s", u.command.Label, rpcErr.Message)
	}
	_ = proc.send([]byte(`{"jsonrpc":"2.0","method":"notifications/initialized"}`))
	u.mu.Lock()
	if u.closed {
		u.mu.Unlock()
		proc.kill()
		return nil, errors.New("the " + u.command.Label + " bridge is turned off")
	}
	u.proc = proc
	recovered := u.lastErr != ""
	u.lastErr, u.failedAt = "", time.Time{}
	u.mu.Unlock()
	if recovered {
		go u.changed(false)
	}
	return proc, nil
}

// drop forgets a child that can no longer be used and makes sure it is gone.
func (u *upstream) drop(proc *upstreamProc) {
	u.mu.Lock()
	if u.proc == proc {
		u.proc = nil
	}
	u.mu.Unlock()
	proc.kill()
}

// transportError is a failure to exchange a message with the child. sent reports whether
// the request had already been handed to it.
type transportError struct {
	message string
	sent    bool
}

func (e *transportError) Error() string { return e.message }

// roundTrip sends one request and waits for its answer. The caller holds the lane. After
// a transportError the child is out of step and must be dropped.
func (u *upstream) roundTrip(ctx context.Context, proc *upstreamProc, method string, params any, timeout time.Duration) (json.RawMessage, *rpcError, *transportError) {
	label := u.command.Label
	u.mu.Lock()
	u.nextID++
	id := "gsuite-" + strconv.FormatUint(u.nextID, 10)
	u.mu.Unlock()
	// Marshal compacts raw arguments, so the message is one line however the caller formatted them.
	message, err := json.Marshal(map[string]any{"jsonrpc": "2.0", "id": id, "method": method, "params": params})
	if err != nil {
		return nil, &rpcError{Code: codeInvalidParams, Message: "the arguments are not valid JSON: " + err.Error()}, nil
	}
	if len(message) > upstreamMaxLine {
		return nil, &rpcError{Code: codeInvalidParams, Message: fmt.Sprintf("the request is %d MB, more than %s accepts in one message (%d MB)", len(message)>>20, label, upstreamMaxLine>>20)}, nil
	}
	// The write runs beside the wait, so a child that has stopped reading cannot hold the
	// caller past its timeout. Giving up kills the child, which ends the write.
	written := false
	writing := make(chan error, 1)
	go func() { writing <- proc.send(message) }()
	timer := time.NewTimer(timeout)
	defer timer.Stop()
	for {
		select {
		case err := <-writing:
			if err != nil {
				return nil, nil, &transportError{message: proc.reason(u.command, label+" closed the connection")}
			}
			written, writing = true, nil
		case line := <-proc.lines:
			var response struct {
				ID     json.RawMessage `json:"id"`
				Result json.RawMessage `json:"result"`
				Error  *rpcError       `json:"error"`
			}
			if json.Unmarshal(line, &response) != nil {
				continue
			}
			var answered string
			_ = json.Unmarshal(response.ID, &answered)
			// A request that could not be parsed is answered without its id; with one request
			// in flight, that answer can only be for this one.
			unparsed := response.Error != nil && (len(response.ID) == 0 || string(response.ID) == "null")
			if answered != id && !unparsed {
				continue
			}
			proc.touch()
			if response.Error != nil {
				return nil, response.Error, nil
			}
			if len(response.Result) == 0 {
				return json.RawMessage("{}"), nil, nil
			}
			return response.Result, nil, nil
		case <-proc.done:
			// A request the child never finished reading cannot have been carried out, and
			// may be sent again. The write may have ended in the same instant the child
			// did: take its result first, and when in doubt count the request as sent.
			if writing != nil {
				select {
				case err := <-writing:
					written = err == nil
				case <-time.After(200 * time.Millisecond):
					written = true
				}
			}
			return nil, nil, &transportError{sent: written, message: proc.reason(u.command, label+" closed the connection before answering")}
		case <-timer.C:
			return nil, nil, &transportError{sent: true, message: fmt.Sprintf("%s did not answer %s within %s; if it is asking a question in its own window, the request is still carried out once that is allowed", label, method, timeout)}
		case <-ctx.Done():
			return nil, nil, &transportError{sent: true, message: "the request was cancelled here, but " + label + " cannot be told to stop: if it is asking a question in its own window, the request is still carried out once that is allowed"}
		}
	}
}

// upstreamProc is one running child process.
type upstreamProc struct {
	cmd   *exec.Cmd
	stdin io.WriteCloser
	// lines carries the child's answers, one message each.
	lines chan []byte
	// quit is closed to stop the child; done is closed once it has exited.
	quit chan struct{}
	done chan struct{}
	once sync.Once

	writeMu sync.Mutex
	usedMu  sync.Mutex
	usedAt  time.Time
	stderr  tail
	// exit is the exit code, valid once done is closed (-1 when the child was killed).
	exit int
}

func startUpstream(command string, args []string) (*upstreamProc, error) {
	cmd := exec.Command(command, args...)
	hideWindow(cmd)
	stdin, err := cmd.StdinPipe()
	if err != nil {
		return nil, err
	}
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return nil, err
	}
	proc := &upstreamProc{cmd: cmd, stdin: stdin, lines: make(chan []byte), quit: make(chan struct{}), done: make(chan struct{})}
	cmd.Stderr = &proc.stderr
	if err := cmd.Start(); err != nil {
		return nil, err
	}
	go proc.read(stdout)
	return proc, nil
}

func (p *upstreamProc) read(stdout io.Reader) {
	defer close(p.done)
	reader := bufio.NewReaderSize(stdout, 64<<10)
	for {
		line, err := readLine(reader, upstreamMaxLine+(4<<20))
		if message := bytes.TrimSpace(line); len(message) > 0 {
			select {
			case p.lines <- message:
			case <-p.quit:
			}
		}
		if err != nil {
			break
		}
	}
	// Reading stopped on end of output or on a line too long to accept; either way the
	// child is of no further use. Wait may only be called once the reads are over.
	p.kill()
	err := p.cmd.Wait()
	p.exit = p.cmd.ProcessState.ExitCode()
	if err != nil && p.exit == 0 {
		p.exit = -1
	}
}

var errLineTooLong = errors.New("message too long")

// readLine reads up to and including the next newline, refusing lines longer than max.
func readLine(reader *bufio.Reader, max int) ([]byte, error) {
	var line []byte
	for {
		chunk, err := reader.ReadSlice('\n')
		line = append(line, chunk...)
		if errors.Is(err, bufio.ErrBufferFull) {
			if len(line) > max {
				return nil, errLineTooLong
			}
			continue
		}
		return line, err
	}
}

// touch records that the child just answered; used reports when it last did.
func (p *upstreamProc) touch() {
	p.usedMu.Lock()
	p.usedAt = time.Now()
	p.usedMu.Unlock()
}

func (p *upstreamProc) used() time.Time {
	p.usedMu.Lock()
	defer p.usedMu.Unlock()
	return p.usedAt
}

func (p *upstreamProc) send(message []byte) error {
	p.writeMu.Lock()
	defer p.writeMu.Unlock()
	select {
	case <-p.done:
		return io.ErrClosedPipe
	default:
	}
	_, err := p.stdin.Write(append(message, '\n'))
	return err
}

func (p *upstreamProc) kill() {
	p.once.Do(func() {
		close(p.quit)
		_ = p.stdin.Close()
		if p.cmd.Process != nil {
			_ = p.cmd.Process.Kill()
		}
	})
}

// reason explains why the child is gone, preferring what the command knows about its exit code.
func (p *upstreamProc) reason(command upstreamCommand, fallback string) string {
	select {
	case <-p.done:
	case <-time.After(500 * time.Millisecond):
		return fallback
	}
	stderr := strings.TrimSpace(p.stderr.String())
	if command.Explain != nil {
		if explained := command.Explain(p.exit, stderr); explained != "" {
			return explained
		}
	}
	if stderr != "" {
		return fallback + ": " + stderr
	}
	return fallback
}

// tail keeps the last few kilobytes written to it.
type tail struct {
	mu   sync.Mutex
	data []byte
}

const tailLimit = 4 << 10

func (t *tail) Write(p []byte) (int, error) {
	t.mu.Lock()
	defer t.mu.Unlock()
	t.data = append(t.data, p...)
	if len(t.data) > tailLimit {
		t.data = append([]byte(nil), t.data[len(t.data)-tailLimit:]...)
	}
	return len(p), nil
}

func (t *tail) String() string {
	t.mu.Lock()
	defer t.mu.Unlock()
	return string(t.data)
}
