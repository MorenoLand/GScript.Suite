package mcp

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"
)

const testManifest = `{
	"instructions": "test instructions",
	"tools": [
		{"name": "echo", "description": "Echo the arguments", "inputSchema": {"type": "object"}},
		{"name": "slow", "description": "Never answers", "inputSchema": {"type": "object"}}
	],
	"resources": [{"uri": "gsuite://docs/overview", "name": "overview"}],
	"prompts": [{"name": "build_world"}],
	"timeouts": {"slow": 50}
}`

// fakeFrontend answers relayed requests the way js/mcp/core.js does.
type fakeFrontend struct {
	server *Server
	mu     sync.Mutex
	seen   []requestEvent
}

func (f *fakeFrontend) emit(event string, data any) {
	if event != RequestEvent {
		return
	}
	req := data.(requestEvent)
	f.mu.Lock()
	f.seen = append(f.seen, req)
	f.mu.Unlock()
	var params struct {
		Name      string          `json:"name"`
		Arguments json.RawMessage `json:"arguments"`
	}
	_ = json.Unmarshal([]byte(req.Params), &params)
	if req.Method == "tools/call" && params.Name == "slow" {
		return
	}
	go func() {
		payload := fmt.Sprintf(`{"result":{"content":[{"type":"text","text":%q}]}}`, req.Method+" "+string(params.Arguments))
		_ = f.server.Resolve(req.ID, payload)
	}()
}

func newTestServer(t *testing.T, register bool) (*Server, *fakeFrontend, *httptest.Server) {
	t.Helper()
	front := &fakeFrontend{}
	server := New(Options{Version: "9.9.9", ConfigDir: t.TempDir(), Emit: front.emit, ReadyTimeout: 200 * time.Millisecond})
	front.server = server
	if register {
		if err := server.RegisterFrontend("page-1", testManifest); err != nil {
			t.Fatal(err)
		}
	}
	ts := httptest.NewServer(server.handler())
	t.Cleanup(ts.Close)
	return server, front, ts
}

func post(t *testing.T, url, body string, headers map[string]string) (*http.Response, []byte) {
	t.Helper()
	req, err := http.NewRequest(http.MethodPost, url+"/mcp", strings.NewReader(body))
	if err != nil {
		t.Fatal(err)
	}
	req.Header.Set("Content-Type", "application/json")
	for key, value := range headers {
		if key == "Host" {
			req.Host = value
			continue
		}
		req.Header.Set(key, value)
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	data, _ := io.ReadAll(resp.Body)
	return resp, data
}

func rpc(t *testing.T, url, body string) map[string]any {
	t.Helper()
	resp, data := post(t, url, body, nil)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status %d: %s", resp.StatusCode, data)
	}
	var decoded map[string]any
	if err := json.Unmarshal(data, &decoded); err != nil {
		t.Fatalf("bad response %s: %v", data, err)
	}
	return decoded
}

func TestInitializeNegotiatesVersion(t *testing.T) {
	server, _, ts := newTestServer(t, true)
	got := rpc(t, ts.URL, `{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","clientInfo":{"name":"tester","version":"1.2"}}}`)
	result := got["result"].(map[string]any)
	if result["protocolVersion"] != "2025-03-26" {
		t.Errorf("protocolVersion = %v", result["protocolVersion"])
	}
	if info := result["serverInfo"].(map[string]any); info["name"] != "gsuite" || info["version"] != "9.9.9" {
		t.Errorf("serverInfo = %v", info)
	}
	if result["instructions"] != "test instructions" {
		t.Errorf("instructions = %v", result["instructions"])
	}
	if client := server.Status().Client; client != "tester 1.2" {
		t.Errorf("client = %q", client)
	}

	got = rpc(t, ts.URL, `{"jsonrpc":"2.0","id":2,"method":"initialize","params":{"protocolVersion":"1999-01-01"}}`)
	if version := got["result"].(map[string]any)["protocolVersion"]; version != protocolVersions[0] {
		t.Errorf("unknown version negotiated to %v", version)
	}
}

func TestListsComeFromTheManifest(t *testing.T) {
	_, _, ts := newTestServer(t, true)
	tools := rpc(t, ts.URL, `{"jsonrpc":"2.0","id":1,"method":"tools/list"}`)["result"].(map[string]any)["tools"].([]any)
	if len(tools) != 2 || tools[0].(map[string]any)["name"] != "echo" {
		t.Errorf("tools = %v", tools)
	}
	resources := rpc(t, ts.URL, `{"jsonrpc":"2.0","id":2,"method":"resources/list"}`)["result"].(map[string]any)["resources"].([]any)
	if len(resources) != 1 {
		t.Errorf("resources = %v", resources)
	}
	templates := rpc(t, ts.URL, `{"jsonrpc":"2.0","id":3,"method":"resources/templates/list"}`)["result"].(map[string]any)["resourceTemplates"].([]any)
	if len(templates) != 0 {
		t.Errorf("templates = %v", templates)
	}
	prompts := rpc(t, ts.URL, `{"jsonrpc":"2.0","id":4,"method":"prompts/list"}`)["result"].(map[string]any)["prompts"].([]any)
	if len(prompts) != 1 {
		t.Errorf("prompts = %v", prompts)
	}
}

func TestListFailsUntilTheFrontendRegisters(t *testing.T) {
	server, _, ts := newTestServer(t, false)
	got := rpc(t, ts.URL, `{"jsonrpc":"2.0","id":1,"method":"tools/list"}`)
	if got["error"] == nil {
		t.Fatalf("expected an error, got %v", got)
	}
	go func() {
		time.Sleep(30 * time.Millisecond)
		_ = server.RegisterFrontend("page-1", testManifest)
	}()
	got = rpc(t, ts.URL, `{"jsonrpc":"2.0","id":2,"method":"tools/list"}`)
	if got["error"] != nil {
		t.Fatalf("a request made while the frontend loads should wait for it: %v", got)
	}
}

func TestToolCallIsRelayedToTheFrontend(t *testing.T) {
	_, front, ts := newTestServer(t, true)
	got := rpc(t, ts.URL, `{"jsonrpc":"2.0","id":"a","method":"tools/call","params":{"name":"echo","arguments":{"x":1}}}`)
	if got["id"] != "a" {
		t.Errorf("id = %v", got["id"])
	}
	text := got["result"].(map[string]any)["content"].([]any)[0].(map[string]any)["text"]
	if text != `tools/call {"x":1}` {
		t.Errorf("text = %v", text)
	}
	front.mu.Lock()
	defer front.mu.Unlock()
	if len(front.seen) != 1 || front.seen[0].Client != "page-1" {
		t.Errorf("frontend saw %v", front.seen)
	}
}

func TestToolCallErrors(t *testing.T) {
	_, _, ts := newTestServer(t, true)
	unknown := rpc(t, ts.URL, `{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"nope"}}`)
	if code := unknown["error"].(map[string]any)["code"]; code != float64(codeInvalidParams) {
		t.Errorf("unknown tool code = %v", code)
	}
	slow := rpc(t, ts.URL, `{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"slow"}}`)
	if slow["error"] == nil {
		t.Errorf("a tool that never answers should time out, got %v", slow)
	}
	missing := rpc(t, ts.URL, `{"jsonrpc":"2.0","id":3,"method":"no/such"}`)
	if code := missing["error"].(map[string]any)["code"]; code != float64(codeMethodNotFound) {
		t.Errorf("unknown method code = %v", code)
	}
}

func TestFrontendErrorsPassThrough(t *testing.T) {
	server := New(Options{ConfigDir: t.TempDir()})
	server.bridge.emit = func(event string, data any) {
		go server.Resolve(data.(requestEvent).ID, `{"error":{"code":-32002,"message":"Resource not found"}}`)
	}
	_ = server.RegisterFrontend("page-1", testManifest)
	ts := httptest.NewServer(server.handler())
	defer ts.Close()
	got := rpc(t, ts.URL, `{"jsonrpc":"2.0","id":1,"method":"resources/read","params":{"uri":"gsuite://nope"}}`)
	if rpcErr := got["error"].(map[string]any); rpcErr["code"] != float64(-32002) || rpcErr["message"] != "Resource not found" {
		t.Errorf("error = %v", rpcErr)
	}
}

func TestReloadFailsRequestsOfTheOldPage(t *testing.T) {
	server, _, ts := newTestServer(t, true)
	done := make(chan map[string]any, 1)
	go func() {
		// "slow" never answers; give it a long timeout so only the reload can end it.
		server.bridge.manifest.Timeouts["slow"] = 60000
		done <- rpc(t, ts.URL, `{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"slow"}}`)
	}()
	time.Sleep(50 * time.Millisecond)
	if err := server.RegisterFrontend("page-2", testManifest); err != nil {
		t.Fatal(err)
	}
	select {
	case got := <-done:
		if got["error"] == nil {
			t.Errorf("expected an error, got %v", got)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("request for the old page was not failed")
	}
}

func TestNotificationsAndBatches(t *testing.T) {
	_, _, ts := newTestServer(t, true)
	resp, _ := post(t, ts.URL, `{"jsonrpc":"2.0","method":"notifications/initialized"}`, nil)
	if resp.StatusCode != http.StatusAccepted {
		t.Errorf("notification status = %d", resp.StatusCode)
	}
	resp, data := post(t, ts.URL, `[{"jsonrpc":"2.0","method":"notifications/initialized"},{"jsonrpc":"2.0","id":7,"method":"ping"}]`, nil)
	var batch []map[string]any
	if err := json.Unmarshal(data, &batch); err != nil || resp.StatusCode != http.StatusOK || len(batch) != 1 || batch[0]["id"] != float64(7) {
		t.Errorf("batch answered %d %s", resp.StatusCode, data)
	}
	resp, _ = post(t, ts.URL, `{not json`, nil)
	if resp.StatusCode != http.StatusBadRequest {
		t.Errorf("invalid JSON status = %d", resp.StatusCode)
	}
}

func TestGuardRejectsForeignRequests(t *testing.T) {
	server, _, ts := newTestServer(t, true)
	ping := `{"jsonrpc":"2.0","id":1,"method":"ping"}`
	cases := []struct {
		name    string
		headers map[string]string
		want    int
	}{
		{"plain", nil, http.StatusOK},
		{"rebound host", map[string]string{"Host": "evil.example:47848"}, http.StatusForbidden},
		{"foreign origin", map[string]string{"Origin": "https://evil.example"}, http.StatusForbidden},
		{"null origin", map[string]string{"Origin": "null"}, http.StatusForbidden},
		// A page on this machine is still a web page: without a token it gets nothing.
		{"local page, no token set", map[string]string{"Origin": "http://localhost:6274"}, http.StatusForbidden},
	}
	for _, tc := range cases {
		resp, _ := post(t, ts.URL, ping, tc.headers)
		if resp.StatusCode != tc.want {
			t.Errorf("%s: status = %d, want %d", tc.name, resp.StatusCode, tc.want)
		}
	}

	server.mu.Lock()
	server.cfg.Token = "secret"
	server.mu.Unlock()
	if resp, _ := post(t, ts.URL, ping, nil); resp.StatusCode != http.StatusUnauthorized {
		t.Errorf("missing token status = %d", resp.StatusCode)
	}
	if resp, _ := post(t, ts.URL, ping, map[string]string{"Authorization": "Bearer secret"}); resp.StatusCode != http.StatusOK {
		t.Errorf("right token status = %d", resp.StatusCode)
	}
	local := map[string]string{"Origin": "http://localhost:6274"}
	if resp, _ := post(t, ts.URL, ping, local); resp.StatusCode != http.StatusUnauthorized {
		t.Errorf("local page without the token: status = %d", resp.StatusCode)
	}
	local["Authorization"] = "Bearer secret"
	resp, _ := post(t, ts.URL, ping, local)
	if resp.StatusCode != http.StatusOK || resp.Header.Get("Access-Control-Allow-Origin") != "http://localhost:6274" {
		t.Errorf("local page with the token: status = %d, CORS header %q", resp.StatusCode, resp.Header.Get("Access-Control-Allow-Origin"))
	}
	if resp, _ := post(t, ts.URL, ping, map[string]string{"Origin": "https://evil.example", "Authorization": "Bearer secret"}); resp.StatusCode != http.StatusForbidden {
		t.Errorf("foreign page with the token: status = %d", resp.StatusCode)
	}
}

func TestAbandonedRequestsAreCancelledInTheFrontend(t *testing.T) {
	var mu sync.Mutex
	var request requestEvent
	cancelled := make(chan string, 1)
	server := New(Options{ConfigDir: t.TempDir()})
	server.bridge.emit = func(event string, data any) {
		switch event {
		case RequestEvent:
			mu.Lock()
			request = data.(requestEvent)
			mu.Unlock()
		case CancelEvent:
			cancelled <- data.(cancelEvent).ID
		}
	}
	_ = server.RegisterFrontend("page-1", testManifest)
	ts := httptest.NewServer(server.handler())
	defer ts.Close()
	before := time.Now().UnixMilli()
	// "slow" has a 50 ms timeout in the manifest and the frontend never answers it.
	got := rpc(t, ts.URL, `{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"slow"}}`)
	if got["error"] == nil {
		t.Fatalf("expected a timeout error, got %v", got)
	}
	mu.Lock()
	sent := request
	mu.Unlock()
	if sent.Deadline < before+50 || sent.Deadline > time.Now().UnixMilli() {
		t.Errorf("deadline %d is not about 50 ms after %d", sent.Deadline, before)
	}
	select {
	case id := <-cancelled:
		if id != sent.ID {
			t.Errorf("cancelled %q, want %q", id, sent.ID)
		}
	case <-time.After(time.Second):
		t.Fatal("the frontend was not told the request was abandoned")
	}
}

func TestStdioBridgeDoesNotLaunchWhenTheTokenIsRejected(t *testing.T) {
	appDir, bridgeDir := t.TempDir(), t.TempDir()
	port := freePort(t)
	if err := SaveConfig(appDir, Config{Enabled: true, Port: port, Token: "right"}); err != nil {
		t.Fatal(err)
	}
	if err := SaveConfig(bridgeDir, Config{Enabled: true, Port: port, Token: "wrong"}); err != nil {
		t.Fatal(err)
	}
	server := New(Options{ConfigDir: appDir})
	if err := server.Start(); err != nil {
		t.Fatal(err)
	}
	defer server.Stop()
	launched := false
	var out bytes.Buffer
	input := `{"jsonrpc":"2.0","id":9,"method":"tools/list"}` + "\n"
	err := RunStdio(context.Background(), strings.NewReader(input), &out, StdioOptions{ConfigDir: bridgeDir, Launch: func() error { launched = true; return nil }, LaunchWait: time.Second})
	if err != nil {
		t.Fatal(err)
	}
	if launched {
		t.Error("the bridge started another GSuite although one is running")
	}
	if !strings.Contains(out.String(), "rejected the MCP token") {
		t.Errorf("answer = %s", out.String())
	}
}

func TestStreamAnnouncesListChanges(t *testing.T) {
	server, _, ts := newTestServer(t, true)
	req, _ := http.NewRequest(http.MethodGet, ts.URL+"/mcp", nil)
	req.Header.Set("Accept", "text/event-stream")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK || !strings.HasPrefix(resp.Header.Get("Content-Type"), "text/event-stream") {
		t.Fatalf("stream answered %d %s", resp.StatusCode, resp.Header.Get("Content-Type"))
	}
	lines := make(chan string, 16)
	go func() {
		scanner := bufio.NewScanner(resp.Body)
		for scanner.Scan() {
			lines <- scanner.Text()
		}
	}()
	time.Sleep(50 * time.Millisecond)
	if err := server.RegisterFrontend("page-1", testManifest); err != nil {
		t.Fatal(err)
	}
	deadline := time.After(2 * time.Second)
	for {
		select {
		case line := <-lines:
			if strings.Contains(line, "notifications/tools/list_changed") {
				return
			}
		case <-deadline:
			t.Fatal("no tools/list_changed notification on the stream")
		}
	}
}

func TestConfigRoundTripAndEnv(t *testing.T) {
	dir := t.TempDir()
	if cfg := LoadConfig(dir); cfg != DefaultConfig() {
		t.Errorf("missing file should give defaults, got %+v", cfg)
	}
	want := Config{Enabled: false, Port: 5123, Token: "abc"}
	if err := SaveConfig(dir, want); err != nil {
		t.Fatal(err)
	}
	if got := LoadConfig(dir); got != want {
		t.Errorf("loaded %+v, want %+v", got, want)
	}
	if got := (Config{Port: 99999}).normalized(); got.Port != DefaultPort {
		t.Errorf("out-of-range port normalized to %d", got.Port)
	}
	t.Setenv("GSUITE_MCP", "on")
	t.Setenv("GSUITE_MCP_PORT", "6001")
	t.Setenv("GSUITE_MCP_TOKEN", "env-token")
	if got := want.withEnv(); !got.Enabled || got.Port != 6001 || got.Token != "env-token" {
		t.Errorf("env overrides gave %+v", got)
	}
}

func freePort(t *testing.T) int {
	t.Helper()
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer listener.Close()
	return listener.Addr().(*net.TCPAddr).Port
}

func TestStartStopAndPortFallback(t *testing.T) {
	dir := t.TempDir()
	port := freePort(t)
	if err := SaveConfig(dir, Config{Enabled: true, Port: port}); err != nil {
		t.Fatal(err)
	}
	blocker, err := net.Listen("tcp", fmt.Sprintf("127.0.0.1:%d", port))
	if err != nil {
		t.Fatal(err)
	}
	defer blocker.Close()

	server := New(Options{ConfigDir: dir})
	if err := server.Start(); err != nil {
		t.Fatal(err)
	}
	status := server.Status()
	if !status.Running || status.ActivePort == port || status.ActivePort == 0 {
		t.Fatalf("expected a fallback port, got %+v", status)
	}
	if endpoint, ok := ReadEndpoint(dir); !ok || endpoint.Port != status.ActivePort {
		t.Errorf("endpoint file = %+v, %v", endpoint, ok)
	}

	status, err = server.Configure(Config{Enabled: false, Port: port})
	if err != nil || status.Running || status.Enabled {
		t.Errorf("disabling gave %+v, %v", status, err)
	}
	if _, ok := ReadEndpoint(dir); ok {
		t.Errorf("endpoint file should be removed when the server stops")
	}
	if LoadConfig(dir).Enabled {
		t.Errorf("Configure should persist the config")
	}
	server.Stop()
}

func TestStdioBridge(t *testing.T) {
	dir := t.TempDir()
	if err := SaveConfig(dir, Config{Enabled: true, Port: freePort(t), Token: "secret"}); err != nil {
		t.Fatal(err)
	}
	front := &fakeFrontend{}
	server := New(Options{ConfigDir: dir, Emit: front.emit})
	front.server = server
	_ = server.RegisterFrontend("page-1", testManifest)

	// The app is not running yet: the bridge has to launch it, then find it.
	launched := false
	launch := func() error {
		launched = true
		return server.Start()
	}
	defer server.Stop()

	input := strings.Join([]string{
		`{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18"}}`,
		`{"jsonrpc":"2.0","method":"notifications/initialized"}`,
		`{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"echo","arguments":{"hello":"world"}}}`,
	}, "\n") + "\n"
	var out bytes.Buffer
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := RunStdio(ctx, strings.NewReader(input), &out, StdioOptions{ConfigDir: dir, Launch: launch}); err != nil {
		t.Fatal(err)
	}
	if !launched {
		t.Errorf("the bridge should launch the app when it is not running")
	}
	answers := map[float64]map[string]any{}
	for _, line := range strings.Split(strings.TrimSpace(out.String()), "\n") {
		var message map[string]any
		if err := json.Unmarshal([]byte(line), &message); err != nil {
			t.Fatalf("stdout line is not JSON: %q", line)
		}
		if id, ok := message["id"].(float64); ok {
			answers[id] = message
		}
	}
	if answers[1]["result"] == nil {
		t.Errorf("no initialize result in %s", out.String())
	}
	text := fmt.Sprint(answers[2]["result"])
	if !strings.Contains(text, `tools/call {\"hello\":\"world\"}`) && !strings.Contains(text, `tools/call {"hello":"world"}`) {
		t.Errorf("tool call answer = %s", text)
	}
}

func TestStdioBridgeReportsAnUnreachableApp(t *testing.T) {
	dir := t.TempDir()
	if err := SaveConfig(dir, Config{Enabled: true, Port: freePort(t)}); err != nil {
		t.Fatal(err)
	}
	var out bytes.Buffer
	input := `{"jsonrpc":"2.0","id":5,"method":"tools/list"}` + "\n" + `{"jsonrpc":"2.0","method":"notifications/initialized"}` + "\n"
	if err := RunStdio(context.Background(), strings.NewReader(input), &out, StdioOptions{ConfigDir: dir}); err != nil {
		t.Fatal(err)
	}
	var message map[string]any
	if err := json.Unmarshal(bytes.TrimSpace(out.Bytes()), &message); err != nil {
		t.Fatalf("expected exactly one JSON answer, got %q", out.String())
	}
	if message["id"] != float64(5) || message["error"] == nil {
		t.Errorf("answer = %v", message)
	}
}
