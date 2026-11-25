// Package mcp is the Model Context Protocol server built into GSuite.
//
// It speaks MCP's Streamable HTTP transport on a loopback port and relays tool
// calls, resource reads and prompt requests to the GSuite frontend, where they
// are implemented (js/mcp). This package owns the transport, its security
// checks and the server lifecycle; it knows nothing about individual tools.
package mcp

import (
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"net/http"
	"os"
	"sync"
	"time"
)

// Options configures a Server.
type Options struct {
	// Name, Title and Version identify the server to MCP clients.
	Name    string
	Title   string
	Version string
	// ConfigDir holds mcp.json and the endpoint file. Defaults to ConfigDir().
	ConfigDir string
	// Emit delivers an event to the frontend.
	Emit func(event string, data any)
	// Logf receives diagnostics. Optional.
	Logf func(format string, args ...any)
	// CallTimeout bounds a relayed request unless the tool sets its own. Defaults to 2 minutes.
	CallTimeout time.Duration
	// ReadyTimeout is how long a request waits for the frontend to register. Defaults to 20 seconds.
	ReadyTimeout time.Duration
}

// StatusEvent is the name of the event emitted to the frontend when the status changes.
const StatusEvent = "mcp:status"

// Status reports the server's state to the frontend's settings UI.
type Status struct {
	Enabled       bool   `json:"enabled"`
	Running       bool   `json:"running"`
	Port          int    `json:"port"`
	ActivePort    int    `json:"activePort"`
	URL           string `json:"url"`
	Token         string `json:"token"`
	FrontendReady bool   `json:"frontendReady"`
	Tools         int    `json:"tools"`
	Client        string `json:"client"`
	Error         string `json:"error"`
	// RemoteControl is the state of the bridge to Remote Control.
	RemoteControl RemoteStatus `json:"remoteControl"`
}

// Server is the MCP server. Create it with New, then call Start.
type Server struct {
	opts   Options
	bridge *bridge

	mu sync.Mutex
	// saved is the configuration as stored; cfg is saved with the environment's overrides applied.
	saved      Config
	cfg        Config
	listener   net.Listener
	httpServer *http.Server
	activePort int
	lastError  string
	lastClient string

	// rc is the client for Remote Control's MCP server, nil while that bridge is off.
	rc        *upstream
	rcCommand string
	rcLog     *remoteLog
	// remoteCommand replaces how the Remote Control executable is found. Tests set it.
	remoteCommand func(configured string) upstreamCommand

	subMu sync.Mutex
	subs  map[chan []byte]struct{}
}

// New creates a server. It does not listen until Start is called.
func New(opts Options) *Server {
	if opts.Name == "" {
		opts.Name = "gsuite"
	}
	if opts.Title == "" {
		opts.Title = "GSuite"
	}
	if opts.Emit == nil {
		opts.Emit = func(string, any) {}
	}
	if opts.Logf == nil {
		opts.Logf = func(string, ...any) {}
	}
	if opts.CallTimeout <= 0 {
		opts.CallTimeout = 2 * time.Minute
	}
	if opts.ReadyTimeout <= 0 {
		opts.ReadyTimeout = 20 * time.Second
	}
	if opts.ConfigDir == "" {
		opts.ConfigDir, _ = ConfigDir()
	}
	return &Server{opts: opts, bridge: newBridge(opts.Emit), subs: make(map[chan []byte]struct{}), rcLog: &remoteLog{dir: opts.ConfigDir}}
}

// Start loads the configuration and begins listening when the server is enabled.
func (s *Server) Start() error {
	s.mu.Lock()
	defer s.mu.Unlock()
	saved := LoadConfig(s.opts.ConfigDir)
	cfg := saved.withEnv()
	if cfg.Enabled && cfg.Token == "" {
		cfg.Token = NewToken()
		if cfg.Token == "" {
			return errors.New("could not generate an MCP token")
		}
		saved.Token = cfg.Token
		if err := SaveConfig(s.opts.ConfigDir, saved); err != nil {
			return err
		}
	}
	s.saved = saved
	s.cfg = cfg
	s.applyRemoteLocked()
	return s.listenLocked()
}

// Stop closes the listener and fails requests still waiting on the frontend.
func (s *Server) Stop() {
	s.mu.Lock()
	s.closeLocked()
	rc := s.rc
	s.rc = nil
	s.mu.Unlock()
	if rc != nil {
		rc.close()
	}
	s.bridge.shutdown()
}

// Config returns the configuration as it is stored, without the environment's overrides.
func (s *Server) Config() Config {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.saved
}

// Configure saves a new configuration and applies it. The listener is restarted only
// when its own settings changed, so changing the Remote Control bridge does not cut off
// the agents that are connected.
func (s *Server) Configure(cfg Config) (Status, error) {
	cfg = cfg.normalized()
	if cfg.Enabled && cfg.Token == "" {
		cfg.Token = NewToken()
		if cfg.Token == "" {
			return s.Status(), errors.New("could not generate an MCP token")
		}
	}
	s.mu.Lock()
	saveErr := SaveConfig(s.opts.ConfigDir, cfg)
	s.saved = cfg
	before := s.cfg
	s.cfg = cfg.withEnv()
	var listenErr error
	if s.cfg.Enabled != before.Enabled || s.cfg.Port != before.Port || s.cfg.Token != before.Token || (s.cfg.Enabled && s.listener == nil) {
		s.closeLocked()
		listenErr = s.listenLocked()
	}
	s.applyRemoteLocked()
	remoteChanged := s.cfg.RemoteControl != before.RemoteControl
	s.mu.Unlock()
	if remoteChanged {
		s.broadcast("notifications/tools/list_changed")
	}
	status := s.Status()
	s.opts.Emit(StatusEvent, status)
	return status, errors.Join(saveErr, listenErr)
}

// Status returns the current server state.
func (s *Server) Status() Status {
	m := s.bridge.current()
	remote := s.RemoteStatus(false)
	s.mu.Lock()
	defer s.mu.Unlock()
	status := Status{
		Enabled:       s.cfg.Enabled,
		Running:       s.listener != nil,
		Port:          s.cfg.Port,
		ActivePort:    s.activePort,
		Token:         s.cfg.Token,
		FrontendReady: m != nil,
		Client:        s.lastClient,
		Error:         s.lastError,
		RemoteControl: remote,
	}
	if m != nil {
		status.Tools = len(m.Tools)
	}
	if status.Running {
		status.URL = endpointURL(s.activePort)
	}
	return status
}

// RegisterFrontend records the frontend's manifest of tools, resources and prompts.
// client identifies the page instance, so answers from a stale page are ignored.
func (s *Server) RegisterFrontend(client, manifestJSON string) error {
	if err := s.bridge.register(client, manifestJSON); err != nil {
		return err
	}
	for _, method := range []string{"notifications/tools/list_changed", "notifications/resources/list_changed", "notifications/prompts/list_changed"} {
		s.broadcast(method)
	}
	return nil
}

// Resolve delivers the frontend's answer to a relayed request.
func (s *Server) Resolve(id, payload string) error {
	return s.bridge.resolve(id, payload)
}

func endpointURL(port int) string {
	return fmt.Sprintf("http://127.0.0.1:%d/mcp", port)
}

func (s *Server) listenLocked() error {
	s.lastError = ""
	s.activePort = 0
	if !s.cfg.Enabled {
		return nil
	}
	var listener net.Listener
	var err error
	for offset := 0; offset < portFallbacks; offset++ {
		port := s.cfg.Port + offset
		if port > 65535 {
			break
		}
		listener, err = net.Listen("tcp", fmt.Sprintf("127.0.0.1:%d", port))
		if err == nil {
			break
		}
	}
	if listener == nil {
		s.lastError = fmt.Sprintf("could not listen on port %d: %v", s.cfg.Port, err)
		s.opts.Logf("mcp: %s", s.lastError)
		return errors.New(s.lastError)
	}
	s.listener = listener
	s.activePort = listener.Addr().(*net.TCPAddr).Port
	s.httpServer = &http.Server{Handler: s.handler(), ReadHeaderTimeout: 10 * time.Second}
	server := s.httpServer
	go func() {
		if err := server.Serve(listener); err != nil && !errors.Is(err, http.ErrServerClosed) {
			s.opts.Logf("mcp: server stopped: %v", err)
		}
	}()
	writeEndpoint(s.opts.ConfigDir, Endpoint{URL: endpointURL(s.activePort), Port: s.activePort, PID: os.Getpid()})
	s.opts.Logf("mcp: listening on %s", endpointURL(s.activePort))
	return nil
}

func (s *Server) closeLocked() {
	if s.httpServer == nil {
		return
	}
	// Close rather than Shutdown: open event streams never go idle, and the port
	// has to be free again before a reconfigured listener binds it.
	_ = s.httpServer.Close()
	s.httpServer = nil
	s.listener = nil
	s.activePort = 0
	removeEndpoint(s.opts.ConfigDir, os.Getpid())
}

func (s *Server) config() Config {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.cfg
}

func (s *Server) noteClient(name, version string) {
	label := name
	if label != "" && version != "" {
		label += " " + version
	}
	s.mu.Lock()
	s.lastClient = label
	s.mu.Unlock()
	s.opts.Emit(StatusEvent, s.Status())
}

// subscribe registers a channel that receives server-to-client notifications.
func (s *Server) subscribe() (chan []byte, func()) {
	ch := make(chan []byte, 16)
	s.subMu.Lock()
	s.subs[ch] = struct{}{}
	s.subMu.Unlock()
	return ch, func() {
		s.subMu.Lock()
		delete(s.subs, ch)
		s.subMu.Unlock()
	}
}

// broadcast sends a parameterless notification to every open event stream.
func (s *Server) broadcast(method string) {
	message, _ := json.Marshal(map[string]string{"jsonrpc": "2.0", "method": method})
	s.subMu.Lock()
	defer s.subMu.Unlock()
	for ch := range s.subs {
		select {
		case ch <- message:
		default:
		}
	}
}
