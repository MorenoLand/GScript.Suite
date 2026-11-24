package mcp

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"strings"
	"sync"
	"time"
)

// StdioOptions configures the stdio bridge.
type StdioOptions struct {
	// ConfigDir holds mcp.json and the endpoint file. Defaults to ConfigDir().
	ConfigDir string
	// Launch starts GSuite when it is not running. Optional.
	Launch func() error
	// LaunchWait is how long to wait for a launched GSuite to answer. Defaults to 45 seconds.
	LaunchWait time.Duration
	// Logf receives diagnostics (stderr in practice; stdout carries the protocol). Optional.
	Logf func(format string, args ...any)
}

// RunStdio bridges MCP's stdio transport to the running app's HTTP endpoint, for
// MCP clients that start a server as a subprocess. Each line read from in is one
// JSON-RPC message; each answer is written to out as one line. It returns when
// in reaches EOF or ctx ends.
func RunStdio(ctx context.Context, in io.Reader, out io.Writer, opts StdioOptions) error {
	if opts.ConfigDir == "" {
		opts.ConfigDir, _ = ConfigDir()
	}
	if opts.LaunchWait <= 0 {
		opts.LaunchWait = 45 * time.Second
	}
	if opts.Logf == nil {
		opts.Logf = func(string, ...any) {}
	}
	bridge := &stdioBridge{opts: opts, out: out, client: &http.Client{}}
	ctx, cancel := context.WithCancel(ctx)
	defer cancel()
	go bridge.forwardNotifications(ctx)

	reader := bufio.NewReaderSize(in, 1<<20)
	var inFlight sync.WaitGroup
	defer inFlight.Wait()
	for {
		line, err := reader.ReadBytes('\n')
		if message := bytes.TrimSpace(line); len(message) > 0 {
			inFlight.Add(1)
			go func() {
				defer inFlight.Done()
				bridge.forward(ctx, message)
			}()
		}
		if err != nil {
			if errors.Is(err, io.EOF) {
				return nil
			}
			return err
		}
		if ctx.Err() != nil {
			return ctx.Err()
		}
	}
}

type stdioBridge struct {
	opts   StdioOptions
	client *http.Client

	outMu sync.Mutex
	out   io.Writer

	connectMu sync.Mutex
	url       string
}

func (b *stdioBridge) write(message []byte) {
	var compact bytes.Buffer
	if json.Compact(&compact, message) != nil {
		return
	}
	compact.WriteByte('\n')
	b.outMu.Lock()
	defer b.outMu.Unlock()
	_, _ = b.out.Write(compact.Bytes())
}

// forward posts one message to the app and writes back whatever it answers.
func (b *stdioBridge) forward(ctx context.Context, message []byte) {
	body, err := b.post(ctx, message)
	if err != nil {
		b.fail(message, err)
		return
	}
	if len(bytes.TrimSpace(body)) > 0 {
		b.write(body)
	}
}

func (b *stdioBridge) post(ctx context.Context, message []byte) ([]byte, error) {
	var lastErr error
	for attempt := 0; attempt < 2; attempt++ {
		endpoint, err := b.endpoint(ctx, attempt > 0)
		if err != nil {
			return nil, err
		}
		req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(message))
		if err != nil {
			return nil, err
		}
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Accept", "application/json, text/event-stream")
		b.authorize(req)
		resp, err := b.client.Do(req)
		if err != nil {
			// The app may have been restarted on another port; look it up again once.
			lastErr = err
			continue
		}
		body, readErr := io.ReadAll(resp.Body)
		resp.Body.Close()
		if readErr != nil {
			return nil, readErr
		}
		if resp.StatusCode == http.StatusAccepted {
			return nil, nil
		}
		if resp.StatusCode != http.StatusOK && !json.Valid(body) {
			return nil, fmt.Errorf("GSuite answered %s: %s", resp.Status, strings.TrimSpace(string(body)))
		}
		return body, nil
	}
	return nil, fmt.Errorf("GSuite is not reachable: %w", lastErr)
}

func (b *stdioBridge) authorize(req *http.Request) {
	if token := LoadConfig(b.opts.ConfigDir).withEnv().Token; token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
}

// fail answers a request the app could not be reached for. Notifications get no answer.
func (b *stdioBridge) fail(message []byte, err error) {
	b.opts.Logf("gsuite mcp: %v", err)
	var req rpcRequest
	if json.Unmarshal(message, &req) != nil || req.Method == "" || req.isNotification() {
		return
	}
	response, _ := json.Marshal(rpcResponse{JSONRPC: "2.0", ID: req.ID, Error: &rpcError{Code: codeInternalError, Message: err.Error()}})
	b.write(response)
}

// endpoint returns the app's MCP URL, starting the app if it is not running.
func (b *stdioBridge) endpoint(ctx context.Context, refresh bool) (string, error) {
	b.connectMu.Lock()
	defer b.connectMu.Unlock()
	if b.url != "" && !refresh {
		return b.url, nil
	}
	b.url = ""
	found, rejected := b.probe(ctx)
	if found != "" {
		b.url = found
		return found, nil
	}
	if rejected {
		// Starting another copy would not help: the one that is running refused this token.
		return "", errors.New("GSuite is running but rejected the MCP token; make GSUITE_MCP_TOKEN match the token in GSuite's MCP settings")
	}
	if !LoadConfig(b.opts.ConfigDir).withEnv().Enabled {
		return "", errors.New("the GSuite MCP server is turned off; enable it in GSuite with the MCP button in the title bar")
	}
	if b.opts.Launch == nil {
		return "", errors.New("GSuite is not running; start GSuite and try again")
	}
	b.opts.Logf("gsuite mcp: starting GSuite")
	if err := b.opts.Launch(); err != nil {
		return "", fmt.Errorf("could not start GSuite: %w", err)
	}
	deadline := time.Now().Add(b.opts.LaunchWait)
	for time.Now().Before(deadline) {
		select {
		case <-ctx.Done():
			return "", ctx.Err()
		case <-time.After(300 * time.Millisecond):
		}
		if found, _ := b.probe(ctx); found != "" {
			b.url = found
			return found, nil
		}
	}
	return "", errors.New("GSuite was started but its MCP server did not come up; check the settings behind the MCP button in GSuite's title bar")
}

// probe returns the MCP URL of a running app, or "" when none answers. rejected reports
// that an app answered but refused the token.
func (b *stdioBridge) probe(ctx context.Context) (found string, rejected bool) {
	ports := []int{}
	if endpoint, ok := ReadEndpoint(b.opts.ConfigDir); ok {
		ports = append(ports, endpoint.Port)
	}
	if configured := LoadConfig(b.opts.ConfigDir).withEnv().Port; len(ports) == 0 || ports[0] != configured {
		ports = append(ports, configured)
	}
	for _, port := range ports {
		probeCtx, cancel := context.WithTimeout(ctx, 2*time.Second)
		req, err := http.NewRequestWithContext(probeCtx, http.MethodGet, fmt.Sprintf("http://127.0.0.1:%d/status", port), nil)
		if err != nil {
			cancel()
			continue
		}
		b.authorize(req)
		resp, err := b.client.Do(req)
		if err != nil {
			cancel()
			continue
		}
		var status struct {
			Name string `json:"name"`
		}
		decodeErr := json.NewDecoder(resp.Body).Decode(&status)
		resp.Body.Close()
		cancel()
		if resp.StatusCode == http.StatusOK && decodeErr == nil && status.Name != "" {
			return endpointURL(port), false
		}
		if resp.StatusCode == http.StatusUnauthorized {
			rejected = true
		}
	}
	return "", rejected
}

// forwardNotifications relays the app's server-to-client notifications to stdout.
// It only attaches to an app that is already running; it never starts one.
func (b *stdioBridge) forwardNotifications(ctx context.Context) {
	for ctx.Err() == nil {
		b.connectMu.Lock()
		endpoint := b.url
		b.connectMu.Unlock()
		if endpoint != "" {
			b.streamOnce(ctx, endpoint)
		}
		select {
		case <-ctx.Done():
			return
		case <-time.After(2 * time.Second):
		}
	}
}

func (b *stdioBridge) streamOnce(ctx context.Context, endpoint string) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return
	}
	req.Header.Set("Accept", "text/event-stream")
	b.authorize(req)
	resp, err := b.client.Do(req)
	if err != nil {
		return
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return
	}
	scanner := bufio.NewScanner(resp.Body)
	scanner.Buffer(make([]byte, 64<<10), 8<<20)
	for scanner.Scan() {
		if data, ok := strings.CutPrefix(scanner.Text(), "data:"); ok {
			b.write([]byte(strings.TrimSpace(data)))
		}
	}
}

// LaunchSelf starts another copy of the running executable, detached from this
// process, so the stdio bridge can bring up the app it talks to.
func LaunchSelf() error {
	exe, err := os.Executable()
	if err != nil {
		return err
	}
	cmd := exec.Command(exe)
	detach(cmd)
	if err := cmd.Start(); err != nil {
		return err
	}
	return cmd.Process.Release()
}
