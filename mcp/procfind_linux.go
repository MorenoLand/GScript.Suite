package mcp

import (
	"os"
	"path/filepath"
	"strconv"
	"strings"
)

// runningExecutable returns the path of a running program of this user whose executable
// has the given name (without extension), or "" when there is none.
func runningExecutable(name string) string {
	entries, err := os.ReadDir("/proc")
	if err != nil {
		return ""
	}
	self := os.Getpid()
	for _, entry := range entries {
		pid, err := strconv.Atoi(entry.Name())
		if err != nil || pid == self {
			continue
		}
		// The link cannot be read for another user's processes, which is the filter wanted here.
		exe, err := os.Readlink(filepath.Join("/proc", entry.Name(), "exe"))
		if err != nil || !strings.EqualFold(filepath.Base(exe), name) {
			continue
		}
		if info, err := os.Stat(exe); err == nil && !info.IsDir() {
			return exe
		}
	}
	return ""
}
