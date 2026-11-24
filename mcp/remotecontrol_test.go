package mcp

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

// The tests never start the real Remote Control: the test binary plays "RemoteControl --mcp"
// itself when fakeRemoteEnv is set, the way the real one behaves according to its source.
const (
	fakeRemoteEnv    = "GSUITE_TEST_FAKE_RC"
	fakeRemoteDirEnv = "GSUITE_TEST_FAKE_RC_DIR"
)

func TestMain(m *testing.M) {
	if mode := os.Getenv(fakeRemoteEnv); mode != "" {
		os.Exit(fakeRemoteControl(mode, os.Getenv(fakeRemoteDirEnv)))
	}
	os.Exit(m.Run())
}

var fakeRemoteTools = []string{"rc_status", "rc_echo", "rc_denied", "rc_fail", "rc_wait", "rc_quit", "rc_badparse"}

// fakeRemoteControl answers one request per line, strictly in order, and exits with the
// real program's codes when MCP is off (2) or no Remote Control is running (3).
func fakeRemoteControl(mode, dir string) int {
	if dir != "" {
		if file, err := os.OpenFile(filepath.Join(dir, "starts.log"), os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0600); err == nil {
			fmt.Fprintln(file, mode)
			file.Close()
		}
	}
	switch mode {
	case "disabled":
		fmt.Fprintln(os.Stderr, "RC MCP integration is disabled in Options.")
		return 2
	case "absent":
		fmt.Fprintln(os.Stderr, "RC MCP bridge unavailable: no running enabled RC GUI client.")
		return 3
	}
	if mode == "hang" {
		// A Remote Control whose window has frozen: the request is read and never answered.
		_, _ = io.Copy(io.Discard, os.Stdin)
		return 0
	}
	listed := func() []string {
		if data, err := os.ReadFile(filepath.Join(dir, "tools.txt")); err == nil {
			return strings.Fields(string(data))
		}
		return fakeRemoteTools
	}
	text := func(value string, isError bool) any {
		return map[string]any{"content": []any{map[string]any{"type": "text", "text": value}}, "isError": isError}
	}
	reader := bufio.NewReaderSize(os.Stdin, 1<<20)
	for {
		line, err := reader.ReadBytes('\n')
		if len(strings.TrimSpace(string(line))) > 0 {
			var req struct {
				ID     json.RawMessage `json:"id"`
				Method string          `json:"method"`
				Params struct {
					Name      string          `json:"name"`
					Arguments json.RawMessage `json:"arguments"`
				} `json:"params"`
			}
			_ = json.Unmarshal(line, &req)
			// The real child finds out that Remote Control has gone only when it passes a request on.
			if _, gone := os.Stat(filepath.Join(dir, "gone")); gone == nil {
				_ = os.Remove(filepath.Join(dir, "gone"))
				fmt.Fprintln(os.Stderr, "RC MCP bridge connection closed: Broken pipe.")
				return 0
			}
			if len(req.ID) > 0 {
				response := map[string]any{"jsonrpc": "2.0", "id": req.ID}
				fail := func(code int, message string) {
					response["error"] = map[string]any{"code": code, "message": message}
				}
				switch req.Method {
				case "ping":
					response["result"] = map[string]any{}
				case "initialize":
					response["result"] = map[string]any{"protocolVersion": "2025-06-18", "capabilities": map[string]any{"tools": map[string]any{"listChanged": false}}, "serverInfo": map[string]any{"name": "rc", "version": "3"}}
				case "tools/list":
					if _, slow := os.Stat(filepath.Join(dir, "slowlist")); slow == nil {
						time.Sleep(300 * time.Millisecond)
					}
					if _, bad := os.Stat(filepath.Join(dir, "badlist")); bad == nil {
						fail(-32603, "Internal error: the list could not be built")
						break
					}
					tools := []any{}
					for _, name := range listed() {
						tools = append(tools, map[string]any{"name": name, "description": "Fake " + name, "inputSchema": map[string]any{"type": "object"}})
					}
					response["result"] = map[string]any{"tools": tools}
				case "tools/call":
					known := false
					for _, name := range listed() {
						known = known || name == req.Params.Name
					}
					var args struct {
						Millis int `json:"ms"`
					}
					_ = json.Unmarshal(req.Params.Arguments, &args)
					switch {
					case !known:
						fail(-32602, "Tool unavailable or disabled by MCP scope")
					case req.Params.Name == "rc_denied":
						fail(-32002, "Mutation denied by user")
					case req.Params.Name == "rc_fail":
						response["result"] = text("No connected RC server session: connect one (rc_connect_server) or name it in server.", true)
					case req.Params.Name == "rc_wait":
						time.Sleep(time.Duration(args.Millis) * time.Millisecond)
						response["result"] = text("waited", false)
					case req.Params.Name == "rc_quit":
						return 0
					case req.Params.Name == "rc_badparse":
						response["id"] = nil
						fail(-32700, "Parse error")
					default:
						response["result"] = text(string(req.Params.Arguments), false)
					}
				default:
					fail(-32601, "Method not found")
				}
				encoded, _ := json.Marshal(response)
				os.Stdout.Write(append(encoded, '\n'))
			}
		}
		if err != nil {
			return 0
		}
	}
}

// newRemoteServer returns a test server whose Remote Control bridge is on and starts the fake.
func newRemoteServer(t *testing.T, mode string) (*Server, string, string) {
	t.Helper()
	server, _, ts := newTestServer(t, true)
	dir := t.TempDir()
	t.Setenv(fakeRemoteEnv, mode)
	t.Setenv(fakeRemoteDirEnv, dir)
	server.remoteCommand = func(string) upstreamCommand {
		return upstreamCommand{Label: "Remote Control", Explain: explainRemoteControlExit, Resolve: func() (string, []string, error) {
			return os.Args[0], []string{"--mcp"}, nil
		}}
	}
	if _, err := server.Configure(Config{Token: testToken, RemoteControl: RemoteControlConfig{Enabled: true}}); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(server.Stop)
	return server, ts.URL, dir
}

func listedTools(t *testing.T, url string) []string {
	t.Helper()
	listed := rpc(t, url, `{"jsonrpc":"2.0","id":1,"method":"tools/list"}`)
	var names []string
	for _, tool := range listed["result"].(map[string]any)["tools"].([]any) {
		names = append(names, tool.(map[string]any)["name"].(string))
	}
	return names
}

func callTool(t *testing.T, url, name, arguments string) map[string]any {
	t.Helper()
	return rpc(t, url, fmt.Sprintf(`{"jsonrpc":"2.0","id":7,"method":"tools/call","params":{"name":%q,"arguments":%s}}`, name, arguments))
}

func resultText(t *testing.T, response map[string]any) string {
	t.Helper()
	result, ok := response["result"].(map[string]any)
	if !ok {
		t.Fatalf("no result in %v", response)
	}
	return result["content"].([]any)[0].(map[string]any)["text"].(string)
}

func starts(t *testing.T, dir string) int {
	t.Helper()
	data, _ := os.ReadFile(filepath.Join(dir, "starts.log"))
	return len(strings.Fields(string(data)))
}

func TestRemoteToolsAreListedAndCalled(t *testing.T) {
	_, url, dir := newRemoteServer(t, "ok")
	names := strings.Join(listedTools(t, url), " ")
	if !strings.HasPrefix(names, "echo slow rc_status rc_echo") {
		t.Fatalf("GSuite's tools should come first, then Remote Control's: %s", names)
	}
	// Arguments reach Remote Control as one line, however the agent formatted them.
	response := callTool(t, url, "rc_echo", "{\n  \"path\": \"levels/a.nw\",\n  \"text\": \"line one\\nline two\"\n}")
	if got := resultText(t, response); got != `{"path":"levels/a.nw","text":"line one\nline two"}` {
		t.Fatalf("arguments were changed on the way: %s", got)
	}
	callTool(t, url, "rc_echo", `{}`)
	if n := starts(t, dir); n != 1 {
		t.Fatalf("one child should serve every call, started %d", n)
	}
	// GSuite's own tools still go to the frontend.
	if got := resultText(t, callTool(t, url, "echo", `{"a":1}`)); got != `tools/call {"a":1}` {
		t.Fatalf("own tool was not relayed to the frontend: %s", got)
	}
}

func TestRemoteAnswersPassThroughUnchanged(t *testing.T) {
	_, url, _ := newRemoteServer(t, "ok")
	cases := []struct {
		tool    string
		code    float64
		message string
	}{
		{"rc_denied", -32002, "Mutation denied by user"},
		{"rc_not_ticked", -32602, "Tool unavailable or disabled by MCP scope"},
		{"rc_badparse", -32700, "Parse error"},
	}
	for _, c := range cases {
		response := callTool(t, url, c.tool, `{}`)
		rpcErr, ok := response["error"].(map[string]any)
		if !ok || rpcErr["code"] != c.code || rpcErr["message"] != c.message {
			t.Fatalf("%s: want error %v %q, got %v", c.tool, c.code, c.message, response)
		}
	}
	failed := callTool(t, url, "rc_fail", `{}`)
	if failed["result"].(map[string]any)["isError"] != true || !strings.Contains(resultText(t, failed), "No connected RC server session") {
		t.Fatalf("a tool failure should stay a result marked isError: %v", failed)
	}
}

func TestRemoteBridgeOffOrUnreachable(t *testing.T) {
	server, _, ts := newTestServer(t, true)
	if names := strings.Join(listedTools(t, ts.URL), " "); names != "echo slow" {
		t.Fatalf("no Remote Control tools while the bridge is off: %s", names)
	}
	off := callTool(t, ts.URL, "rc_status", `{}`)
	if message := off["error"].(map[string]any)["message"].(string); !strings.Contains(message, "bridge is turned off") {
		t.Fatalf("unexpected message: %s", message)
	}
	if status := server.RemoteStatus(true); status.Enabled || status.Connected || len(status.Tools) != 0 {
		t.Fatalf("unexpected status: %+v", status)
	}

	for mode, want := range map[string]string{
		"disabled": "MCP integration is turned off: tick \"Enable local MCP integration\" in Remote Control under Options > MCP",
		"absent":   "no running Remote Control answered",
	} {
		t.Run(mode, func(t *testing.T) {
			server, url, dir := newRemoteServer(t, mode)
			if names := strings.Join(listedTools(t, url), " "); names != "echo slow" {
				t.Fatalf("only GSuite's tools should be listed: %s", names)
			}
			if status := server.RemoteStatus(false); status.Connected || !strings.Contains(status.Error, want) {
				t.Fatalf("status should explain the problem: %+v", status)
			}
			// The list is not asked for again straight away, so a missing program is not started over and over.
			listedTools(t, url)
			listedTools(t, url)
			if n := starts(t, dir); n != 1 {
				t.Fatalf("started %d times while backing off", n)
			}
			// A call says why it cannot be made.
			response := callTool(t, url, "rc_status", `{}`)
			if message := response["error"].(map[string]any)["message"].(string); !strings.Contains(message, want) {
				t.Fatalf("unexpected message: %s", message)
			}
		})
	}
}

func TestRemoteReconnectsAfterTheChildExits(t *testing.T) {
	_, url, dir := newRemoteServer(t, "ok")
	gone := callTool(t, url, "rc_quit", `{}`)
	if message := gone["error"].(map[string]any)["message"].(string); !strings.Contains(message, "closed the connection before answering") {
		t.Fatalf("unexpected message: %s", message)
	}
	if n := starts(t, dir); n != 1 {
		t.Fatalf("a request that was sent must not be sent again; started %d", n)
	}
	if got := resultText(t, callTool(t, url, "rc_echo", `{"again":true}`)); got != `{"again":true}` {
		t.Fatalf("the next call should start a new child: %s", got)
	}
	if n := starts(t, dir); n != 2 {
		t.Fatalf("expected a second child, started %d", n)
	}
}

func TestRemoteNoticesThatRemoteControlWasRestarted(t *testing.T) {
	idle := upstreamIdleCheck
	upstreamIdleCheck = 0
	t.Cleanup(func() { upstreamIdleCheck = idle })
	_, url, dir := newRemoteServer(t, "ok")
	callTool(t, url, "rc_echo", `{}`)
	// Remote Control is closed and started again; the child from before is still there.
	if err := os.WriteFile(filepath.Join(dir, "gone"), nil, 0600); err != nil {
		t.Fatal(err)
	}
	if got := resultText(t, callTool(t, url, "rc_echo", `{"after":"restart"}`)); got != `{"after":"restart"}` {
		t.Fatalf("the call should reach the new Remote Control: %s", got)
	}
	if n := starts(t, dir); n != 2 {
		t.Fatalf("expected the stale child to be replaced, started %d", n)
	}
}

func TestRemoteThatDoesNotAnswerDoesNotHoldUpTheOwnTools(t *testing.T) {
	wait, handshake := upstreamListWait, upstreamHandshakeTimeout
	upstreamListWait, upstreamHandshakeTimeout = 150*time.Millisecond, 600*time.Millisecond
	t.Cleanup(func() { upstreamListWait, upstreamHandshakeTimeout = wait, handshake })
	server, url, _ := newRemoteServer(t, "hang")
	started := time.Now()
	if names := strings.Join(listedTools(t, url), " "); names != "echo slow" {
		t.Fatalf("only GSuite's tools should be listed: %s", names)
	}
	if took := time.Since(started); took > 500*time.Millisecond {
		t.Fatalf("tools/list waited %s for a Remote Control that does not answer", took)
	}
	// The attempt ends by itself and the reason is kept for the settings dialog.
	deadline := time.Now().Add(3 * time.Second)
	for server.RemoteStatus(false).Error == "" && time.Now().Before(deadline) {
		time.Sleep(20 * time.Millisecond)
	}
	if status := server.RemoteStatus(false); !strings.Contains(status.Error, "did not answer initialize") || status.Connected {
		t.Fatalf("unexpected status: %+v", status)
	}
}

func TestRemoteToolsSurviveAClientThatHangsUp(t *testing.T) {
	server, url, dir := newRemoteServer(t, "ok")
	if names := listedTools(t, url); len(names) != 2+len(fakeRemoteTools) {
		t.Fatalf("unexpected tools: %v", names)
	}
	rc := server.remote()
	rc.mu.Lock()
	rc.listedAt = time.Time{} // the cached list has gone stale
	rc.mu.Unlock()
	if err := os.WriteFile(filepath.Join(dir, "slowlist"), nil, 0600); err != nil {
		t.Fatal(err)
	}
	// The client that asked hangs up before Remote Control has answered.
	gone, cancel := context.WithCancel(context.Background())
	cancel()
	if tools := rc.listed(gone); len(tools) != len(fakeRemoteTools) {
		t.Fatalf("a client hanging up must not empty the tool list: %d tools", len(tools))
	}
	time.Sleep(450 * time.Millisecond)
	if status := server.RemoteStatus(false); !status.Connected || status.Error != "" || len(status.Tools) != len(fakeRemoteTools) {
		t.Fatalf("the connection should be untouched: %+v", status)
	}
	if n := starts(t, dir); n != 1 {
		t.Fatalf("the working child should have been kept, started %d", n)
	}
}

func TestRemoteToolsComeBackWhenACallFindsRemoteControlStarted(t *testing.T) {
	server, url, _ := newRemoteServer(t, "absent")
	if names := strings.Join(listedTools(t, url), " "); names != "echo slow" {
		t.Fatalf("Remote Control is not running yet: %s", names)
	}
	messages, unsubscribe := server.subscribe()
	defer unsubscribe()
	// The user starts Remote Control; the next thing that happens is a call, not a tools/list.
	t.Setenv(fakeRemoteEnv, "ok")
	if got := resultText(t, callTool(t, url, "rc_echo", `{"up":true}`)); got != `{"up":true}` {
		t.Fatalf("the call should reach the newly started Remote Control: %s", got)
	}
	select {
	case message := <-messages:
		if !strings.Contains(string(message), "notifications/tools/list_changed") {
			t.Fatalf("unexpected notification: %s", message)
		}
	case <-time.After(3 * time.Second):
		t.Fatal("clients were not told that Remote Control's tools are back")
	}
	if names := listedTools(t, url); len(names) != 2+len(fakeRemoteTools) {
		t.Fatalf("the tools should be listed again: %v", names)
	}
}

func TestRemoteKeepsItsToolsWhenAListAnswerIsBad(t *testing.T) {
	server, url, dir := newRemoteServer(t, "ok")
	if names := listedTools(t, url); len(names) != 2+len(fakeRemoteTools) {
		t.Fatalf("unexpected tools: %v", names)
	}
	if err := os.WriteFile(filepath.Join(dir, "badlist"), nil, 0600); err != nil {
		t.Fatal(err)
	}
	status := server.RemoteStatus(true)
	if len(status.Tools) != len(fakeRemoteTools) || !status.Connected || !strings.Contains(status.Error, "the list could not be built") {
		t.Fatalf("a bad answer is not a lost connection: %+v", status)
	}
	if got := resultText(t, callTool(t, url, "rc_echo", `{}`)); got != `{}` {
		t.Fatalf("calls should still go through: %s", got)
	}
}

func TestStoppingClosesTheRemoteControlConnection(t *testing.T) {
	server, url, _ := newRemoteServer(t, "ok")
	callTool(t, url, "rc_echo", `{}`)
	rc := server.remote()
	rc.mu.Lock()
	proc := rc.proc
	rc.mu.Unlock()
	if proc == nil {
		t.Fatal("expected a running child")
	}
	// Turning the bridge off ends the child; so does stopping the server.
	if _, err := server.Configure(Config{Token: testToken}); err != nil {
		t.Fatal(err)
	}
	select {
	case <-proc.done:
	case <-time.After(3 * time.Second):
		t.Fatal("the child was left running after the bridge was turned off")
	}
	if names := strings.Join(listedTools(t, url), " "); names != "echo slow" {
		t.Fatalf("Remote Control's tools should be gone: %s", names)
	}
}

func TestRemoteToolListFollowsRemoteControl(t *testing.T) {
	server, url, dir := newRemoteServer(t, "ok")
	if names := listedTools(t, url); len(names) != 2+len(fakeRemoteTools) {
		t.Fatalf("unexpected tools: %v", names)
	}
	messages, unsubscribe := server.subscribe()
	defer unsubscribe()
	// The user unticks a permission in Remote Control; it sends no notification of its own.
	if err := os.WriteFile(filepath.Join(dir, "tools.txt"), []byte("rc_status"), 0600); err != nil {
		t.Fatal(err)
	}
	if status := server.RemoteStatus(true); strings.Join(status.Tools, " ") != "rc_status" || !status.Connected {
		t.Fatalf("unexpected status: %+v", status)
	}
	select {
	case message := <-messages:
		if !strings.Contains(string(message), "notifications/tools/list_changed") {
			t.Fatalf("unexpected notification: %s", message)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("clients were not told the tool list changed")
	}
	if names := strings.Join(listedTools(t, url), " "); names != "echo slow rc_status" {
		t.Fatalf("unexpected tools: %s", names)
	}
	// A tool that was switched off answers the way Remote Control answers it.
	response := callTool(t, url, "rc_echo", `{}`)
	if rpcErr := response["error"].(map[string]any); rpcErr["code"] != float64(-32602) {
		t.Fatalf("unexpected answer: %v", response)
	}
}

func TestRemoteCallThatIsGivenUpOn(t *testing.T) {
	server, url, dir := newRemoteServer(t, "ok")
	ctx, cancel := context.WithTimeout(context.Background(), 150*time.Millisecond)
	defer cancel()
	_, rpcErr := server.callRemote(ctx, "rc_wait", json.RawMessage(`{"ms":5000}`))
	if rpcErr == nil || !strings.Contains(rpcErr.Message, "cannot be told to stop") {
		t.Fatalf("the caller should learn the request may still happen: %v", rpcErr)
	}
	// The child was out of step and is replaced; the late answer cannot be mistaken for the next one.
	if got := resultText(t, callTool(t, url, "rc_echo", `{"next":1}`)); got != `{"next":1}` {
		t.Fatalf("unexpected answer: %s", got)
	}
	if n := starts(t, dir); n != 2 {
		t.Fatalf("expected a fresh child, started %d", n)
	}

	// Calls made at the same time are answered one after the other.
	listedTools(t, url)
	done := make(chan string, 2)
	go func() {
		result, _ := server.callRemote(context.Background(), "rc_wait", json.RawMessage(`{"ms":300}`))
		done <- string(result)
	}()
	time.Sleep(50 * time.Millisecond)
	if status := server.RemoteStatus(false); !status.Busy {
		t.Fatalf("the bridge should report it is busy: %+v", status)
	}
	// The list does not queue behind a call that may be waiting on the user.
	listStarted := time.Now()
	if names := listedTools(t, url); len(names) != 2+len(fakeRemoteTools) || time.Since(listStarted) > 250*time.Millisecond {
		t.Fatalf("the cached list should be used while a call is in flight: %v after %s", names, time.Since(listStarted))
	}
	go func() {
		result, _ := server.callRemote(context.Background(), "rc_echo", json.RawMessage(`{"second":true}`))
		done <- string(result)
	}()
	first, second := <-done, <-done
	if !strings.Contains(first, "waited") || !strings.Contains(second, "second") {
		t.Fatalf("answers out of order: %s then %s", first, second)
	}
}

func TestRemoteLogRecordsTargetsNotContents(t *testing.T) {
	server, url, _ := newRemoteServer(t, "ok")
	callTool(t, url, "rc_echo", `{"server":"alpha","path":"levels/a.nw","base64":"U0VDUkVU","text":"hidden"}`)
	callTool(t, url, "rc_denied", `{"server":"alpha","levels":["a.nw"]}`)
	data, err := os.ReadFile(filepath.Join(server.opts.ConfigDir, remoteLogName))
	if err != nil {
		t.Fatal(err)
	}
	lines := strings.Split(strings.TrimSpace(string(data)), "\n")
	if len(lines) != 2 {
		t.Fatalf("expected two lines, got %q", data)
	}
	if !strings.Contains(lines[0], `"tool":"rc_echo"`) || !strings.Contains(lines[0], `"path":"levels/a.nw"`) || !strings.Contains(lines[0], `"server":"alpha"`) || !strings.Contains(lines[0], `"outcome":"ok"`) {
		t.Fatalf("unexpected line: %s", lines[0])
	}
	if strings.Contains(string(data), "U0VDUkVU") || strings.Contains(string(data), "hidden") {
		t.Fatalf("contents must not be logged: %s", data)
	}
	if !strings.Contains(lines[1], `"outcome":"error -32002: Mutation denied by user"`) {
		t.Fatalf("unexpected line: %s", lines[1])
	}
}

func TestRemoteControlExecutableIsChecked(t *testing.T) {
	dir := t.TempDir()
	for _, name := range []string{"RemoteControl", "remotecontrol.exe"} {
		path := filepath.Join(dir, name)
		if err := os.WriteFile(path, []byte("x"), 0700); err != nil {
			t.Fatal(err)
		}
		if found, err := findRemoteControl(" " + path + " "); err != nil || found != path {
			t.Fatalf("%s should be accepted: %q %v", name, found, err)
		}
	}
	if _, err := findRemoteControl("RemoteControl"); err == nil || !strings.Contains(err.Error(), "give the full path") {
		t.Fatalf("a bare name must be refused: %v", err)
	}
	other := filepath.Join(dir, "sh")
	_ = os.WriteFile(other, []byte("x"), 0700)
	if _, err := findRemoteControl(other); err == nil || !strings.Contains(err.Error(), "is not the Remote Control executable") {
		t.Fatalf("another program must be refused: %v", err)
	}
	if _, err := findRemoteControl(filepath.Join(dir, "missing", "RemoteControl")); err == nil || !strings.Contains(err.Error(), "there is no Remote Control executable") {
		t.Fatalf("a missing file must be refused: %v", err)
	}
	if got := explainRemoteControlExit(1, "Remote Control could not start: boom\nSystem.Exception: boom"); got != "Remote Control could not be reached: System.Exception: boom" {
		t.Fatalf("unexpected explanation: %s", got)
	}
}

func TestConfiguringTheBridgeKeepsTheListener(t *testing.T) {
	server := New(Options{ConfigDir: t.TempDir()})
	port := freePort(t)
	status, err := server.Configure(Config{Enabled: true, Port: port})
	if err != nil || !status.Running {
		t.Fatalf("server did not start: %+v %v", status, err)
	}
	t.Cleanup(server.Stop)
	listener := server.listener
	cfg := server.Config()
	cfg.RemoteControl = RemoteControlConfig{Enabled: true, Command: filepath.Join(t.TempDir(), "RemoteControl")}
	status, err = server.Configure(cfg)
	if err != nil || server.listener != listener || !status.RemoteControl.Enabled || status.RemoteControl.Command != cfg.RemoteControl.Command {
		t.Fatalf("changing the bridge should not restart the listener: %+v %v", status, err)
	}
	if saved := LoadConfig(server.opts.ConfigDir); saved.RemoteControl != cfg.RemoteControl || saved.Port != port {
		t.Fatalf("the bridge settings were not saved: %+v", saved)
	}
	// The other settings survive a change of the listener's settings.
	cfg.Token = "secret"
	status, err = server.Configure(cfg)
	if err != nil || server.listener == listener || !status.RemoteControl.Enabled {
		t.Fatalf("a new token should restart the listener and keep the bridge: %+v %v", status, err)
	}
}
