package mcp

import (
	"bytes"
	"crypto/subtle"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/netip"
	"net/url"
	"strings"
	"time"
)

// maxRequestBytes bounds a request body; tool arguments can carry whole files.
const maxRequestBytes = 64 << 20

const streamKeepAlive = 25 * time.Second

func (s *Server) handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("/mcp", s.serveMCP)
	mux.HandleFunc("/status", s.serveStatus)
	return s.guard(mux)
}

// guard rejects requests that did not come from this machine's own software.
//
// The server only binds loopback, so what remains is a web page in the user's
// browser reaching it. The Host check stops DNS rebinding. A request that
// carries an Origin header comes from a web page: it is refused unless the page
// is served from this machine and a token is configured, which the page then
// has to present like any other client. Without a token, only programs that are
// not web pages (MCP clients, the stdio bridge) can connect.
func (s *Server) guard(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !isLoopbackHost(r.Host) {
			http.Error(w, "forbidden host", http.StatusForbidden)
			return
		}
		if origin := r.Header.Get("Origin"); origin != "" {
			if !isLoopbackOrigin(origin) {
				http.Error(w, "forbidden origin", http.StatusForbidden)
				return
			}
			if s.config().Token == "" {
				http.Error(w, "web pages can only connect when a token is set in GSuite's MCP settings", http.StatusForbidden)
				return
			}
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Vary", "Origin")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Accept, Authorization, Mcp-Session-Id, Mcp-Protocol-Version, Last-Event-ID")
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
		}
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		if token := s.config().Token; token != "" {
			given := strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
			if subtle.ConstantTimeCompare([]byte(given), []byte(token)) != 1 {
				w.Header().Set("WWW-Authenticate", "Bearer")
				http.Error(w, "missing or wrong token", http.StatusUnauthorized)
				return
			}
		}
		next.ServeHTTP(w, r)
	})
}

func isLoopbackHost(hostport string) bool {
	host := hostport
	if h, _, err := net.SplitHostPort(hostport); err == nil {
		host = h
	}
	host = strings.Trim(host, "[]")
	if strings.EqualFold(host, "localhost") {
		return true
	}
	addr, err := netip.ParseAddr(host)
	return err == nil && addr.IsLoopback()
}

func isLoopbackOrigin(origin string) bool {
	parsed, err := url.Parse(origin)
	if err != nil || (parsed.Scheme != "http" && parsed.Scheme != "https") {
		return false
	}
	return isLoopbackHost(parsed.Host)
}

func (s *Server) serveStatus(w http.ResponseWriter, r *http.Request) {
	status := s.Status()
	writeJSON(w, http.StatusOK, map[string]any{
		"name":          s.opts.Name,
		"version":       s.opts.Version,
		"frontendReady": status.FrontendReady,
		"tools":         status.Tools,
	})
}

func (s *Server) serveMCP(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodPost:
		s.servePost(w, r)
	case http.MethodGet:
		s.serveStream(w, r)
	case http.MethodDelete:
		// Sessions are not tracked, so there is nothing to end.
		w.WriteHeader(http.StatusOK)
	default:
		w.Header().Set("Allow", "GET, POST, DELETE, OPTIONS")
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

func (s *Server) servePost(w http.ResponseWriter, r *http.Request) {
	body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, maxRequestBytes))
	if err != nil {
		writeJSON(w, http.StatusBadRequest, rpcResponse{JSONRPC: "2.0", ID: json.RawMessage("null"), Error: &rpcError{Code: codeParseError, Message: "could not read the request body"}})
		return
	}
	body = bytes.TrimSpace(body)
	if !json.Valid(body) {
		writeJSON(w, http.StatusBadRequest, rpcResponse{JSONRPC: "2.0", ID: json.RawMessage("null"), Error: &rpcError{Code: codeParseError, Message: "request body is not valid JSON"}})
		return
	}
	if len(body) > 0 && body[0] == '[' {
		var batch []json.RawMessage
		if json.Unmarshal(body, &batch) != nil || len(batch) == 0 {
			writeJSON(w, http.StatusBadRequest, rpcResponse{JSONRPC: "2.0", ID: json.RawMessage("null"), Error: &rpcError{Code: codeInvalidRequest, Message: "empty batch"}})
			return
		}
		responses := make([]*rpcResponse, 0, len(batch))
		for _, message := range batch {
			if response := s.handleMessage(r.Context(), message); response != nil {
				responses = append(responses, response)
			}
		}
		if len(responses) == 0 {
			w.WriteHeader(http.StatusAccepted)
			return
		}
		writeJSON(w, http.StatusOK, responses)
		return
	}
	response := s.handleMessage(r.Context(), body)
	if response == nil {
		w.WriteHeader(http.StatusAccepted)
		return
	}
	writeJSON(w, http.StatusOK, response)
}

// serveStream holds an event stream open for server-to-client notifications.
func (s *Server) serveStream(w http.ResponseWriter, r *http.Request) {
	flusher, ok := w.(http.Flusher)
	if !ok || !strings.Contains(r.Header.Get("Accept"), "text/event-stream") {
		w.Header().Set("Allow", "POST, DELETE, OPTIONS")
		http.Error(w, "this endpoint streams text/event-stream on GET", http.StatusMethodNotAllowed)
		return
	}
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.WriteHeader(http.StatusOK)
	flusher.Flush()
	messages, unsubscribe := s.subscribe()
	defer unsubscribe()
	keepAlive := time.NewTicker(streamKeepAlive)
	defer keepAlive.Stop()
	for {
		select {
		case message := <-messages:
			if _, err := fmt.Fprintf(w, "event: message\ndata: %s\n\n", message); err != nil {
				return
			}
		case <-keepAlive.C:
			if _, err := io.WriteString(w, ": keep-alive\n\n"); err != nil {
				return
			}
		case <-r.Context().Done():
			return
		}
		flusher.Flush()
	}
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}
