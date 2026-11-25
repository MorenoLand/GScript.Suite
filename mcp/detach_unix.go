//go:build !windows

package mcp

import (
	"os/exec"
	"syscall"
)

// detach makes cmd outlive the bridge process and keeps it off the bridge's stdio.
func detach(cmd *exec.Cmd) {
	cmd.SysProcAttr = &syscall.SysProcAttr{Setsid: true}
}

// hideWindow keeps a helper process from opening a console window. Only Windows needs it.
func hideWindow(cmd *exec.Cmd) {}
