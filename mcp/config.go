package mcp

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

// DefaultPort is the loopback port the MCP server listens on unless configured otherwise.
const DefaultPort = 47848

// portFallbacks is how many ports above the configured one are tried when it is taken.
const portFallbacks = 10

const (
	configFileName   = "mcp.json"
	endpointFileName = "mcp-endpoint.json"
)

// Config is the user's MCP server configuration, stored in ConfigDir()/mcp.json.
type Config struct {
	Enabled bool   `json:"enabled"`
	Port    int    `json:"port"`
	Token   string `json:"token,omitempty"`
	// RemoteControl configures the bridge to Remote Control's own MCP server.
	RemoteControl RemoteControlConfig `json:"remoteControl"`
}

// Endpoint describes the running server. It is written next to the config so the
// stdio bridge can find the port the app actually bound.
type Endpoint struct {
	URL  string `json:"url"`
	Port int    `json:"port"`
	PID  int    `json:"pid"`
}

// DefaultConfig returns the configuration used when no config file exists.
func DefaultConfig() Config {
	return Config{Enabled: true, Port: DefaultPort}
}

// ConfigDir returns the directory that holds GSuite's MCP config and endpoint files.
func ConfigDir() (string, error) {
	base, err := os.UserConfigDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(base, "GSuite"), nil
}

// LoadConfig reads the config from dir, falling back to defaults for a missing or invalid file.
func LoadConfig(dir string) Config {
	cfg := DefaultConfig()
	data, err := os.ReadFile(filepath.Join(dir, configFileName))
	if err != nil {
		return cfg
	}
	loaded := cfg
	if json.Unmarshal(data, &loaded) != nil {
		return cfg
	}
	return loaded.normalized()
}

// SaveConfig writes the config to dir.
func SaveConfig(dir string, cfg Config) error {
	if err := os.MkdirAll(dir, 0700); err != nil {
		return err
	}
	data, err := json.MarshalIndent(cfg.normalized(), "", "  ")
	if err != nil {
		return err
	}
	// The stdio bridge re-reads the file on every request, so it is replaced whole.
	tmp, err := os.CreateTemp(dir, configFileName+".*.tmp")
	if err != nil {
		return err
	}
	defer os.Remove(tmp.Name())
	_, err = tmp.Write(append(data, '\n'))
	if err == nil {
		err = tmp.Chmod(0600)
	}
	if closeErr := tmp.Close(); err == nil {
		err = closeErr
	}
	if err != nil {
		return err
	}
	// Windows does not replace a file that another program has open, which the bridge does for a moment on every
	// request: try a few times, then write in place as a last resort.
	target := filepath.Join(dir, configFileName)
	for attempt := 0; attempt < 5; attempt++ {
		if err = os.Rename(tmp.Name(), target); err == nil {
			return nil
		}
		time.Sleep(20 * time.Millisecond)
	}
	return os.WriteFile(target, append(data, '\n'), 0600)
}

func (c Config) normalized() Config {
	if c.Port < 1 || c.Port > 65535 {
		c.Port = DefaultPort
	}
	c.Token = strings.TrimSpace(c.Token)
	c.RemoteControl.Command = strings.TrimSpace(c.RemoteControl.Command)
	return c
}

// withEnv applies the GSUITE_MCP, GSUITE_MCP_PORT and GSUITE_MCP_TOKEN overrides.
func (c Config) withEnv() Config {
	switch strings.ToLower(strings.TrimSpace(os.Getenv("GSUITE_MCP"))) {
	case "0", "false", "off", "no":
		c.Enabled = false
	case "1", "true", "on", "yes":
		c.Enabled = true
	}
	if port, err := strconv.Atoi(strings.TrimSpace(os.Getenv("GSUITE_MCP_PORT"))); err == nil && port >= 1 && port <= 65535 {
		c.Port = port
	}
	if token := strings.TrimSpace(os.Getenv("GSUITE_MCP_TOKEN")); token != "" {
		c.Token = token
	}
	return c
}

// ReadEndpoint returns the endpoint recorded by a running app, if any.
func ReadEndpoint(dir string) (Endpoint, bool) {
	var endpoint Endpoint
	data, err := os.ReadFile(filepath.Join(dir, endpointFileName))
	if err != nil || json.Unmarshal(data, &endpoint) != nil || endpoint.Port == 0 {
		return Endpoint{}, false
	}
	return endpoint, true
}

func writeEndpoint(dir string, endpoint Endpoint) {
	if os.MkdirAll(dir, 0700) != nil {
		return
	}
	data, err := json.Marshal(endpoint)
	if err != nil {
		return
	}
	_ = os.WriteFile(filepath.Join(dir, endpointFileName), data, 0600)
}

func removeEndpoint(dir string, pid int) {
	if endpoint, ok := ReadEndpoint(dir); ok && endpoint.PID == pid {
		_ = os.Remove(filepath.Join(dir, endpointFileName))
	}
}
