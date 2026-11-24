package mcp

import (
	"bytes"
	"context"
	"encoding/json"
	"strings"
	"time"
)

// Protocol revisions this server can speak, newest first.
var protocolVersions = []string{"2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"}

const (
	codeParseError     = -32700
	codeInvalidRequest = -32600
	codeMethodNotFound = -32601
	codeInvalidParams  = -32602
	codeInternalError  = -32603
)

// fallbackInstructions is sent until the frontend has registered its own.
const fallbackInstructions = "GSuite is a Graal Online editor suite. Its tools become available once the GSuite window has finished loading."

type rpcRequest struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      json.RawMessage `json:"id,omitempty"`
	Method  string          `json:"method"`
	Params  json.RawMessage `json:"params,omitempty"`
}

type rpcError struct {
	Code    int             `json:"code"`
	Message string          `json:"message"`
	Data    json.RawMessage `json:"data,omitempty"`
}

type rpcResponse struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      json.RawMessage `json:"id"`
	Result  any             `json:"result,omitempty"`
	Error   *rpcError       `json:"error,omitempty"`
}

func (r rpcRequest) isNotification() bool {
	return len(r.ID) == 0 || bytes.Equal(r.ID, []byte("null"))
}

// handleMessage answers one JSON-RPC message. It returns nil when the message needs no answer.
func (s *Server) handleMessage(ctx context.Context, raw json.RawMessage) *rpcResponse {
	var req rpcRequest
	if err := json.Unmarshal(raw, &req); err != nil {
		return &rpcResponse{JSONRPC: "2.0", ID: json.RawMessage("null"), Error: &rpcError{Code: codeInvalidRequest, Message: "invalid JSON-RPC message"}}
	}
	if req.Method == "" {
		// A response to a server request; this server sends none.
		return nil
	}
	if req.isNotification() {
		return nil
	}
	result, rpcErr := s.dispatch(ctx, req)
	response := &rpcResponse{JSONRPC: "2.0", ID: req.ID}
	if rpcErr != nil {
		response.Error = rpcErr
	} else {
		response.Result = result
	}
	return response
}

func (s *Server) dispatch(ctx context.Context, req rpcRequest) (any, *rpcError) {
	switch req.Method {
	case "initialize":
		return s.initialize(req.Params), nil
	case "ping":
		return struct{}{}, nil
	case "logging/setLevel":
		return struct{}{}, nil
	case "tools/list":
		m, rpcErr := s.manifest(ctx)
		if rpcErr != nil {
			return nil, rpcErr
		}
		tools := nonNil(m.Tools)
		if remote := s.remoteTools(ctx, m.toolNames); len(remote) > 0 {
			tools = append(append(make([]json.RawMessage, 0, len(tools)+len(remote)), tools...), remote...)
		}
		return map[string]any{"tools": tools}, nil
	case "resources/list":
		m, rpcErr := s.manifest(ctx)
		if rpcErr != nil {
			return nil, rpcErr
		}
		return map[string]any{"resources": nonNil(m.Resources)}, nil
	case "resources/templates/list":
		m, rpcErr := s.manifest(ctx)
		if rpcErr != nil {
			return nil, rpcErr
		}
		return map[string]any{"resourceTemplates": nonNil(m.ResourceTemplates)}, nil
	case "prompts/list":
		m, rpcErr := s.manifest(ctx)
		if rpcErr != nil {
			return nil, rpcErr
		}
		return map[string]any{"prompts": nonNil(m.Prompts)}, nil
	case "tools/call":
		return s.callTool(ctx, req.Params)
	case "resources/read", "prompts/get":
		if _, rpcErr := s.manifest(ctx); rpcErr != nil {
			return nil, rpcErr
		}
		return s.relay(ctx, req.Method, req.Params, s.opts.CallTimeout)
	default:
		return nil, &rpcError{Code: codeMethodNotFound, Message: "method not found: " + req.Method}
	}
}

func (s *Server) initialize(params json.RawMessage) any {
	var p struct {
		ProtocolVersion string `json:"protocolVersion"`
		ClientInfo      struct {
			Name    string `json:"name"`
			Version string `json:"version"`
		} `json:"clientInfo"`
	}
	_ = json.Unmarshal(params, &p)
	version := protocolVersions[0]
	for _, supported := range protocolVersions {
		if supported == p.ProtocolVersion {
			version = supported
			break
		}
	}
	s.noteClient(p.ClientInfo.Name, p.ClientInfo.Version)
	instructions := fallbackInstructions
	if m := s.bridge.current(); m != nil && m.Instructions != "" {
		instructions = m.Instructions
	}
	return map[string]any{
		"protocolVersion": version,
		"capabilities": map[string]any{
			"tools":     map[string]any{"listChanged": true},
			"resources": map[string]any{"listChanged": true},
			"prompts":   map[string]any{"listChanged": true},
			"logging":   map[string]any{},
		},
		"serverInfo":   map[string]any{"name": s.opts.Name, "title": s.opts.Title, "version": s.opts.Version},
		"instructions": instructions,
	}
}

// manifest returns the frontend's manifest, waiting for the frontend to load if it has to.
func (s *Server) manifest(ctx context.Context) (*manifest, *rpcError) {
	m, err := s.bridge.await(ctx, s.opts.ReadyTimeout)
	if err != nil {
		return nil, &rpcError{Code: codeInternalError, Message: err.Error()}
	}
	return m, nil
}

func (s *Server) callTool(ctx context.Context, params json.RawMessage) (any, *rpcError) {
	var p struct {
		Name string `json:"name"`
	}
	if err := json.Unmarshal(params, &p); err != nil || p.Name == "" {
		return nil, &rpcError{Code: codeInvalidParams, Message: "tools/call needs a tool name"}
	}
	m, rpcErr := s.manifest(ctx)
	if rpcErr != nil {
		return nil, rpcErr
	}
	if !m.toolNames[p.Name] {
		if rc := s.remote(); strings.HasPrefix(p.Name, RemoteToolPrefix) || (rc != nil && rc.has(p.Name)) {
			var call struct {
				Arguments json.RawMessage `json:"arguments"`
			}
			_ = json.Unmarshal(params, &call)
			result, rpcErr := s.callRemote(ctx, p.Name, call.Arguments)
			if rpcErr != nil {
				return nil, rpcErr
			}
			return result, nil
		}
		return nil, &rpcError{Code: codeInvalidParams, Message: "unknown tool: " + p.Name}
	}
	timeout := s.opts.CallTimeout
	if ms := m.Timeouts[p.Name]; ms > 0 {
		timeout = time.Duration(ms) * time.Millisecond
	}
	return s.relay(ctx, "tools/call", params, timeout)
}

func (s *Server) relay(ctx context.Context, method string, params json.RawMessage, timeout time.Duration) (any, *rpcError) {
	result, rpcErr := s.bridge.call(ctx, method, params, timeout)
	if rpcErr != nil {
		return nil, rpcErr
	}
	return result, nil
}

func nonNil(items []json.RawMessage) []json.RawMessage {
	if items == nil {
		return []json.RawMessage{}
	}
	return items
}
