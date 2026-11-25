//go:build !linux && !windows

package mcp

// runningExecutable finds a running program's executable. It is not implemented on this
// platform, where the path has to be configured or the program has to be on PATH.
func runningExecutable(name string) string {
	return ""
}
