package mcp

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

// Remote Control (RC) is the Graal server administration client. It has an MCP server of
// its own, reached by starting "RemoteControl --mcp", which forwards to the Remote Control
// that is running. GSuite can re-expose those tools next to its own, so an agent that
// built something offline can also put it on a server. Remote Control keeps deciding what
// is allowed: its options say which tools exist and whether the user is asked first.

// remoteControlName is the executable's name without extension.
const remoteControlName = "RemoteControl"

// RemoteToolPrefix starts the name of every tool Remote Control offers.
const RemoteToolPrefix = "rc_"

// RemoteActivityEvent is emitted to the frontend for each call forwarded to Remote Control.
const RemoteActivityEvent = "mcp:activity"

const remoteLogName = "remote-control.log"

// RemoteControlConfig says whether Remote Control's tools are offered and where its executable is.
type RemoteControlConfig struct {
	Enabled bool `json:"enabled"`
	// Command is the path of the Remote Control executable. Empty means: use the one that
	// is running, or the one on PATH.
	Command string `json:"command,omitempty"`
}

// RemoteStatus reports the Remote Control bridge's state to the settings UI and the tools.
type RemoteStatus struct {
	Enabled   bool     `json:"enabled"`
	Connected bool     `json:"connected"`
	Busy      bool     `json:"busy"`
	Command   string   `json:"command"`
	Resolved  string   `json:"resolved"`
	Tools     []string `json:"tools"`
	Error     string   `json:"error"`
}

func remoteControlCommand(configured string) upstreamCommand {
	return upstreamCommand{
		Label: "Remote Control",
		Resolve: func() (string, []string, error) {
			command, err := findRemoteControl(configured)
			return command, []string{"--mcp"}, err
		},
		Explain: explainRemoteControlExit,
	}
}

// findRemoteControl returns the Remote Control executable: the configured one, else the
// one that is running (so the bridge matches its version), else one on PATH.
func findRemoteControl(configured string) (string, error) {
	if configured = strings.TrimSpace(configured); configured != "" {
		if err := checkRemoteControlPath(configured); err != nil {
			return "", err
		}
		return configured, nil
	}
	if running := runningExecutable(remoteControlName); running != "" {
		return running, nil
	}
	if found, err := exec.LookPath(remoteControlName); err == nil {
		return found, nil
	}
	return "", errors.New("Remote Control was not found: start Remote Control, or set the path of its executable in GSuite's MCP settings")
}

// CheckRemoteControlPath reports why path cannot be used as the Remote Control executable.
// An empty path is fine: it means the executable is looked for.
func CheckRemoteControlPath(path string) error {
	if path = strings.TrimSpace(path); path == "" {
		return nil
	}
	return checkRemoteControlPath(path)
}

// checkRemoteControlPath refuses a configured path that cannot be the Remote Control executable.
func checkRemoteControlPath(path string) error {
	if !filepath.IsAbs(path) {
		return fmt.Errorf("give the full path of the Remote Control executable, not %q", path)
	}
	name := filepath.Base(path)
	if !strings.EqualFold(strings.TrimSuffix(name, filepath.Ext(name)), remoteControlName) {
		return fmt.Errorf("%s is not the Remote Control executable (it is named %s)", path, remoteControlName)
	}
	info, err := os.Stat(path)
	if err != nil || info.IsDir() {
		return fmt.Errorf("there is no Remote Control executable at %s", path)
	}
	return nil
}

// explainRemoteControlExit turns the exit codes of "RemoteControl --mcp" into advice.
func explainRemoteControlExit(code int, stderr string) string {
	switch code {
	case 2:
		return "Remote Control's MCP integration is turned off: tick \"Enable local MCP integration\" in Remote Control under Options > MCP"
	case 3:
		return "no running Remote Control answered: start Remote Control and tick \"Enable local MCP integration\" under Options > MCP"
	case 0, -1:
		return ""
	}
	if stderr != "" {
		return "Remote Control could not be reached: " + lastLine(stderr)
	}
	return fmt.Sprintf("Remote Control could not be reached (exit code %d)", code)
}

func lastLine(text string) string {
	lines := strings.Split(strings.TrimSpace(text), "\n")
	return strings.TrimSpace(lines[len(lines)-1])
}

// remoteLog records what was sent to Remote Control. Remote Control's own audit log has
// no way to tell that a request came through GSuite, so GSuite keeps its own.
type remoteLog struct {
	mu  sync.Mutex
	dir string
}

const remoteLogLimit = 1 << 20

type remoteLogEntry struct {
	Time    string          `json:"time"`
	Tool    string          `json:"tool"`
	Target  json.RawMessage `json:"target,omitempty"`
	Bytes   int             `json:"bytes"`
	Outcome string          `json:"outcome"`
	Millis  int64           `json:"ms"`
}

// remoteLogTargetKeys are the arguments that say what a call acted on. Contents are not logged.
var remoteLogTargetKeys = []string{"server", "from", "path", "folder", "newName", "localFolder", "files", "levels", "kind", "name", "id", "dryRun", "force"}

func (l *remoteLog) write(tool string, arguments json.RawMessage, outcome string, took time.Duration) {
	if l == nil || l.dir == "" {
		return
	}
	target := map[string]json.RawMessage{}
	var all map[string]json.RawMessage
	if json.Unmarshal(arguments, &all) == nil {
		for _, key := range remoteLogTargetKeys {
			if value, ok := all[key]; ok && len(value) <= 2048 {
				target[key] = value
			}
		}
	}
	entry := remoteLogEntry{Time: time.Now().UTC().Format(time.RFC3339), Tool: tool, Bytes: len(arguments), Outcome: outcome, Millis: took.Milliseconds()}
	if len(target) > 0 {
		entry.Target, _ = json.Marshal(target)
	}
	line, err := json.Marshal(entry)
	if err != nil {
		return
	}
	l.mu.Lock()
	defer l.mu.Unlock()
	path := filepath.Join(l.dir, remoteLogName)
	if info, err := os.Stat(path); err == nil && info.Size() > remoteLogLimit {
		_ = os.Rename(path, path+".1")
	}
	if os.MkdirAll(l.dir, 0700) != nil {
		return
	}
	file, err := os.OpenFile(path, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0600)
	if err != nil {
		return
	}
	defer file.Close()
	_, _ = file.Write(append(line, '\n'))
}

// remoteActivity is the payload of RemoteActivityEvent, shaped like the frontend's own activity entries.
type remoteActivity struct {
	Tool    string `json:"tool"`
	Time    int64  `json:"time"`
	Running bool   `json:"running,omitempty"`
	OK      bool   `json:"ok"`
	Millis  int64  `json:"ms"`
	Error   string `json:"error"`
}

// remote returns the Remote Control client, or nil while the bridge is off.
func (s *Server) remote() *upstream {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.rc
}

// applyRemoteLocked starts or stops the Remote Control client to match the configuration.
func (s *Server) applyRemoteLocked() {
	want := s.cfg.RemoteControl
	if s.rc != nil && (!want.Enabled || want.Command != s.rcCommand) {
		go s.rc.close()
		s.rc = nil
	}
	if want.Enabled && s.rc == nil {
		s.rcCommand = want.Command
		command := s.remoteCommand
		if command == nil {
			command = remoteControlCommand
		}
		s.rc = newUpstream(command(want.Command), s.opts.Version, func(tools bool) {
			if tools {
				s.broadcast("notifications/tools/list_changed")
			}
			s.opts.Emit(StatusEvent, s.Status())
		})
	}
}

// RemoteStatus reports the Remote Control bridge's state. refresh asks Remote Control for
// its tools again first, which also starts the connection.
func (s *Server) RemoteStatus(refresh bool) RemoteStatus {
	cfg := s.config().RemoteControl
	status := RemoteStatus{Enabled: cfg.Enabled, Command: cfg.Command, Tools: []string{}}
	rc := s.remote()
	if rc == nil {
		return status
	}
	if refresh {
		rc.refresh()
	}
	state := rc.state()
	status.Connected, status.Busy, status.Resolved, status.Error = state.Connected, state.Busy, state.Resolved, state.Error
	if state.Tools != nil {
		status.Tools = state.Tools
	}
	return status
}

// remoteTools returns Remote Control's tools that do not clash with one of GSuite's own.
func (s *Server) remoteTools(ctx context.Context, own map[string]bool) []json.RawMessage {
	rc := s.remote()
	if rc == nil {
		return nil
	}
	var tools []json.RawMessage
	for _, raw := range rc.listed(ctx) {
		if !own[toolName(raw)] {
			tools = append(tools, raw)
		}
	}
	return tools
}

// RemoteTool returns the definition Remote Control gave for one of its tools, as JSON, or
// "" when it lists no tool of that name.
func (s *Server) RemoteTool(name string) string {
	rc := s.remote()
	if rc == nil {
		return ""
	}
	rc.mu.Lock()
	defer rc.mu.Unlock()
	for _, raw := range rc.tools {
		if toolName(raw) == name {
			return string(raw)
		}
	}
	return ""
}

// callRemote runs one of Remote Control's tools and returns its answer unchanged.
func (s *Server) callRemote(ctx context.Context, name string, arguments json.RawMessage) (json.RawMessage, *rpcError) {
	rc := s.remote()
	if rc == nil {
		return nil, &rpcError{Code: codeInvalidParams, Message: "the Remote Control bridge is turned off: it is turned on in GSuite under MCP > Remote Control"}
	}
	started := time.Now()
	s.opts.Emit(RemoteActivityEvent, remoteActivity{Tool: name, Time: started.UnixMilli(), Running: true})
	result, rpcErr := rc.call(ctx, name, arguments)
	took := time.Since(started)
	outcome, problem := "ok", ""
	if rpcErr != nil {
		// The log and the activity list hold what happened, not what was sent: a long message may quote contents.
		problem = firstRunes(rpcErr.Message, 300)
		outcome = fmt.Sprintf("error %d: %s", rpcErr.Code, problem)
	} else {
		var answer struct {
			IsError bool `json:"isError"`
			Content []struct {
				Text string `json:"text"`
			} `json:"content"`
		}
		if json.Unmarshal(result, &answer) == nil && answer.IsError {
			problem = "the tool reported a failure"
			if len(answer.Content) > 0 {
				problem = firstRunes(answer.Content[0].Text, 300)
			}
			outcome = "failed: " + problem
		}
	}
	s.rcLog.write(name, arguments, outcome, took)
	s.opts.Emit(RemoteActivityEvent, remoteActivity{Tool: name, Time: started.UnixMilli(), OK: problem == "", Millis: took.Milliseconds(), Error: problem})
	return result, rpcErr
}

func firstRunes(text string, limit int) string {
	runes := []rune(text)
	if len(runes) <= limit {
		return text
	}
	return string(runes[:limit]) + "..."
}

// RemoteCallJSON runs one of Remote Control's tools for the frontend: the answer is a JSON object holding
// either "result" or "error", as on the wire.
func (s *Server) RemoteCallJSON(ctx context.Context, name, arguments string) string {
	result, rpcErr := s.callRemote(ctx, name, json.RawMessage(arguments))
	var answer any
	if rpcErr != nil {
		answer = map[string]any{"error": rpcErr}
	} else {
		answer = map[string]any{"result": result}
	}
	encoded, _ := json.Marshal(answer)
	return string(encoded)
}
