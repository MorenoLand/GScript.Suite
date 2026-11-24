package main

import (
	"context"
	"fmt"
	"io/fs"
	"log"
	"os"
	"path"
	"path/filepath"
	"runtime"
	"sort"
	"strings"

	"gsuite/mcp"
)

// stdioBridgeFlag makes the executable act as an MCP stdio server that forwards
// to the running app, for MCP clients that launch servers as subprocesses.
const stdioBridgeFlag = "--mcp-stdio"

// runStdioBridge runs the stdio bridge when the process was started with
// stdioBridgeFlag. It reports whether it did, in which case main must return
// without starting the application.
func runStdioBridge() bool {
	requested := false
	for _, arg := range os.Args[1:] {
		if arg == stdioBridgeFlag {
			requested = true
		}
	}
	if !requested {
		return false
	}
	logger := log.New(os.Stderr, "", 0)
	err := mcp.RunStdio(context.Background(), os.Stdin, os.Stdout, mcp.StdioOptions{Launch: mcp.LaunchSelf, Logf: logger.Printf})
	if err != nil {
		logger.Printf("gsuite mcp: %v", err)
		os.Exit(1)
	}
	return true
}

// startMCP starts the embedded MCP server. A server that cannot start is
// reported in its status rather than stopping the app.
func (s *AppService) startMCP() {
	s.mcp = mcp.New(mcp.Options{Name: "gsuite", Title: "GSuite", Version: s.version, Emit: s.emit, Logf: log.Printf})
	// On a phone there is no agent on the same device to connect, so the server
	// stays off there unless it is turned on in the app.
	if runtime.GOOS == "android" || runtime.GOOS == "ios" {
		return
	}
	if err := s.mcp.Start(); err != nil {
		log.Printf("mcp: %v", err)
	}
}

func (s *AppService) stopMCP() {
	if s.mcp != nil {
		s.mcp.Stop()
	}
}

// McpRegister is called by the frontend once its MCP tools are defined.
func (s *AppService) McpRegister(client, manifest string) error {
	if s.mcp == nil {
		return fmt.Errorf("the MCP server is not available")
	}
	return s.mcp.RegisterFrontend(client, manifest)
}

// McpResolve is called by the frontend with its answer to a relayed MCP request.
func (s *AppService) McpResolve(id, payload string) error {
	if s.mcp == nil {
		return fmt.Errorf("the MCP server is not available")
	}
	return s.mcp.Resolve(id, payload)
}

// McpStatus reports the MCP server's state for the settings UI.
func (s *AppService) McpStatus() mcp.Status {
	if s.mcp == nil {
		return mcp.Status{Error: "the MCP server is not available"}
	}
	return s.mcp.Status()
}

// McpConfigure saves the MCP server settings and restarts it to apply them.
func (s *AppService) McpConfigure(enabled bool, port int, token string) (mcp.Status, error) {
	if s.mcp == nil {
		return mcp.Status{}, fmt.Errorf("the MCP server is not available")
	}
	cfg := s.mcp.Config()
	cfg.Enabled, cfg.Port, cfg.Token = enabled, port, token
	return s.mcp.Configure(cfg)
}

// McpConfigureRemoteControl turns the bridge to Remote Control's MCP server on or off.
// command is the path of the Remote Control executable; empty means find it.
func (s *AppService) McpConfigureRemoteControl(enabled bool, command string) (mcp.Status, error) {
	if s.mcp == nil {
		return mcp.Status{}, fmt.Errorf("the MCP server is not available")
	}
	if enabled {
		if err := mcp.CheckRemoteControlPath(command); err != nil {
			return s.mcp.Status(), err
		}
	}
	cfg := s.mcp.Config()
	cfg.RemoteControl = mcp.RemoteControlConfig{Enabled: enabled, Command: command}
	return s.mcp.Configure(cfg)
}

// McpRemoteStatus reports the state of the bridge to Remote Control. refresh connects
// and asks Remote Control for its tools again first.
func (s *AppService) McpRemoteStatus(refresh bool) mcp.RemoteStatus {
	if s.mcp == nil {
		return mcp.RemoteStatus{Error: "the MCP server is not available", Tools: []string{}}
	}
	return s.mcp.RemoteStatus(refresh)
}

// McpRemoteTool returns Remote Control's definition of one of its tools as JSON: its
// description and argument schema. It is empty when Remote Control lists no such tool.
func (s *AppService) McpRemoteTool(name string) string {
	if s.mcp == nil {
		return ""
	}
	return s.mcp.RemoteTool(name)
}

// McpRemoteCall runs one of Remote Control's tools for the frontend's own tools. The
// answer is a JSON object holding either "result" or "error", as Remote Control gave it.
func (s *AppService) McpRemoteCall(tool, arguments string) (string, error) {
	if s.mcp == nil {
		return "", fmt.Errorf("the MCP server is not available")
	}
	return s.mcp.RemoteCallJSON(context.Background(), tool, arguments), nil
}

// uploadStagingPrefix and uploadStagingMarker identify a folder GSuite made to hand
// files to Remote Control, the only kind of folder RemoveUploadStaging deletes.
const (
	uploadStagingPrefix = "gsuite-upload-"
	uploadStagingMarker = ".gsuite-upload"
)

// RemoveUploadStaging deletes a staging folder that an upload through Remote Control
// left behind. It refuses any folder GSuite did not create for that purpose.
func (s *AppService) RemoveUploadStaging(dir string) error {
	absolute, err := filepath.Abs(dir)
	if err != nil {
		return err
	}
	if !strings.HasPrefix(filepath.Base(absolute), uploadStagingPrefix) {
		return fmt.Errorf("%s is not an upload staging folder", absolute)
	}
	if info, err := os.Lstat(absolute); err != nil || !info.IsDir() {
		return fmt.Errorf("%s is not an upload staging folder", absolute)
	}
	if info, err := os.Lstat(filepath.Join(absolute, uploadStagingMarker)); err != nil || !info.Mode().IsRegular() {
		return fmt.Errorf("%s is not an upload staging folder", absolute)
	}
	return os.RemoveAll(absolute)
}

// PathInfo describes a file or directory for the frontend.
type PathInfo struct {
	Name    string `json:"name"`
	Path    string `json:"path"`
	Exists  bool   `json:"exists"`
	IsDir   bool   `json:"isDir"`
	Size    int64  `json:"size"`
	ModTime int64  `json:"modTime"`
}

// SystemInfo tells the frontend where it is running, so paths can be built correctly.
type SystemInfo struct {
	OS            string `json:"os"`
	PathSeparator string `json:"pathSeparator"`
	HomeDir       string `json:"homeDir"`
	DocumentsDir  string `json:"documentsDir"`
	ExeDir        string `json:"exeDir"`
	ExePath       string `json:"exePath"`
	WorkspaceDir  string `json:"workspaceDir"`
	Version       string `json:"version"`
}

// GetSystemInfo returns the platform, well-known directories and the app version.
func (s *AppService) GetSystemInfo() SystemInfo {
	home, _ := os.UserHomeDir()
	documents := ""
	if home != "" {
		documents = filepath.Join(home, "Documents")
		if info, err := os.Stat(documents); err != nil || !info.IsDir() {
			documents = home
		}
	}
	s.mu.RLock()
	workspace := s.lastDir
	s.mu.RUnlock()
	exe, _ := os.Executable()
	return SystemInfo{OS: runtime.GOOS, PathSeparator: string(filepath.Separator), HomeDir: home, DocumentsDir: documents, ExeDir: s.exeDir, ExePath: exe, WorkspaceDir: workspace, Version: s.version}
}

// StatPath describes path. A path that does not exist is not an error.
func (s *AppService) StatPath(path string) (PathInfo, error) {
	absolute, err := filepath.Abs(path)
	if err != nil {
		return PathInfo{}, err
	}
	info, err := os.Stat(absolute)
	if os.IsNotExist(err) {
		return PathInfo{Name: filepath.Base(absolute), Path: absolute}, nil
	}
	if err != nil {
		return PathInfo{}, err
	}
	return PathInfo{Name: info.Name(), Path: absolute, Exists: true, IsDir: info.IsDir(), Size: info.Size(), ModTime: info.ModTime().UnixMilli()}, nil
}

// ListDir returns the entries of the directory at path, directories first.
func (s *AppService) ListDir(path string) ([]PathInfo, error) {
	absolute, err := filepath.Abs(path)
	if err != nil {
		return nil, err
	}
	entries, err := os.ReadDir(absolute)
	if err != nil {
		return nil, err
	}
	result := make([]PathInfo, 0, len(entries))
	for _, entry := range entries {
		item := PathInfo{Name: entry.Name(), Path: filepath.Join(absolute, entry.Name()), Exists: true, IsDir: entry.IsDir()}
		if info, err := entry.Info(); err == nil {
			item.Size = info.Size()
			item.ModTime = info.ModTime().UnixMilli()
			// Follow links so a linked directory lists as one.
			if info.Mode()&os.ModeSymlink != 0 {
				if target, err := os.Stat(item.Path); err == nil {
					item.IsDir = target.IsDir()
					item.Size = target.Size()
				}
			}
		}
		result = append(result, item)
	}
	sort.SliceStable(result, func(i, j int) bool {
		if result[i].IsDir != result[j].IsDir {
			return result[i].IsDir
		}
		return result[i].Name < result[j].Name
	})
	return result, nil
}

// MakeDir creates the directory at path, along with any missing parents.
func (s *AppService) MakeDir(path string) error {
	return os.MkdirAll(path, 0755)
}

// CopyFile copies the file at src to dst, replacing dst if it exists.
func (s *AppService) CopyFile(src, dst string) error {
	info, err := os.Stat(src)
	if err != nil {
		return err
	}
	if info.IsDir() {
		return fmt.Errorf("%s is a directory", src)
	}
	data, err := os.ReadFile(src)
	if err != nil {
		return err
	}
	return os.WriteFile(dst, data, 0644)
}

// MoveFile moves or renames the file at src to dst, creating dst's folder. An existing
// dst is only replaced when overwrite is set. Directories are not moved.
func (s *AppService) MoveFile(src, dst string, overwrite bool) error {
	info, err := os.Lstat(src)
	if err != nil {
		return err
	}
	if !info.Mode().IsRegular() {
		return fmt.Errorf("%s is not a file", src)
	}
	target, err := os.Lstat(dst)
	if err == nil {
		if os.SameFile(info, target) {
			// The same file under another spelling: a change of case on a disk that ignores case.
			if filepath.Dir(src) == filepath.Dir(dst) && strings.EqualFold(filepath.Base(src), filepath.Base(dst)) {
				return os.Rename(src, dst)
			}
			return fmt.Errorf("%s and %s are the same file", src, dst)
		}
		if target.IsDir() {
			return fmt.Errorf("%s is a directory", dst)
		}
		if !overwrite {
			return fmt.Errorf("%s already exists", dst)
		}
	}
	if err := os.MkdirAll(filepath.Dir(dst), 0755); err != nil {
		return err
	}
	renameErr := os.Rename(src, dst)
	if renameErr == nil {
		s.reindexMoved(src, dst)
		return nil
	}
	// A rename cannot cross disks. Copy to a temporary file beside the destination and
	// rename that into place, which replaces dst (or a link at dst) the way the rename
	// would have; then remove the original.
	data, err := os.ReadFile(src)
	if err != nil {
		return renameErr
	}
	temporary := dst + ".gsuite-move"
	if err := os.WriteFile(temporary, data, info.Mode().Perm()); err != nil {
		_ = os.Remove(temporary)
		return renameErr
	}
	if err := os.Rename(temporary, dst); err != nil {
		_ = os.Remove(temporary)
		return renameErr
	}
	if err := os.Remove(src); err != nil {
		return fmt.Errorf("%s was copied to %s, but the original could not be removed: %w", src, dst, err)
	}
	s.reindexMoved(src, dst)
	return nil
}

// reindexMoved keeps the workspace's index of file names in step with a file that was
// moved or, with an empty dst, deleted: the entry that pointed at src goes, and a file
// that stays inside the workspace folder is found under its new name.
func (s *AppService) reindexMoved(src, dst string) {
	from, err := filepath.Abs(src)
	if err != nil {
		return
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if name := strings.ToLower(filepath.Base(from)); s.index[name] == from {
		delete(s.index, name)
	}
	if dst == "" || s.lastDir == "" {
		return
	}
	to, err := filepath.Abs(dst)
	if err != nil {
		return
	}
	if rel, err := filepath.Rel(s.lastDir, to); err == nil && !strings.HasPrefix(rel, "..") {
		if name := strings.ToLower(filepath.Base(to)); s.index[name] == "" {
			s.index[name] = to
		}
	}
}

// DeleteFile deletes the single file at path. It refuses directories.
func (s *AppService) DeleteFile(path string) error {
	info, err := os.Lstat(path)
	if err != nil {
		return err
	}
	if info.IsDir() {
		return fmt.Errorf("%s is a directory; only single files are deleted", path)
	}
	if err := os.Remove(path); err != nil {
		return err
	}
	s.reindexMoved(path, "")
	return nil
}

// ListBundled returns the names of the files the app ships in one of its asset
// folders, such as "images" or "ganis".
func (s *AppService) ListBundled(dir string) ([]string, error) {
	entries, err := fs.ReadDir(assets, path.Join("frontend/dist", path.Clean("/"+dir)))
	if err != nil {
		return nil, fmt.Errorf("no bundled folder %q", dir)
	}
	names := make([]string, 0, len(entries))
	for _, entry := range entries {
		if !entry.IsDir() {
			names = append(names, entry.Name())
		}
	}
	return names, nil
}

// SearchWorkspace returns the paths of scanned workspace files whose name
// contains query (case-insensitive), sorted by name. An empty query matches all.
func (s *AppService) SearchWorkspace(query string, limit int) []string {
	query = strings.ToLower(query)
	s.mu.RLock()
	names := make([]string, 0)
	for name := range s.index {
		if strings.Contains(name, query) {
			names = append(names, name)
		}
	}
	paths := make([]string, 0, len(names))
	sort.Strings(names)
	for _, name := range names {
		if limit > 0 && len(paths) >= limit {
			break
		}
		paths = append(paths, s.index[name])
	}
	s.mu.RUnlock()
	return paths
}
