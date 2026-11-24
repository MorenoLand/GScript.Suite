package mcp

import (
	"strings"
	"syscall"
	"unsafe"
)

const processQueryLimitedInformation = 0x1000

var queryFullProcessImageName = syscall.NewLazyDLL("kernel32.dll").NewProc("QueryFullProcessImageNameW")

// runningExecutable returns the path of a running program whose executable has the given
// name (without extension), or "" when there is none or it cannot be read.
func runningExecutable(name string) string {
	snapshot, err := syscall.CreateToolhelp32Snapshot(syscall.TH32CS_SNAPPROCESS, 0)
	if err != nil {
		return ""
	}
	defer syscall.CloseHandle(snapshot)
	var entry syscall.ProcessEntry32
	entry.Size = uint32(unsafe.Sizeof(entry))
	self := uint32(syscall.Getpid())
	for err = syscall.Process32First(snapshot, &entry); err == nil; err = syscall.Process32Next(snapshot, &entry) {
		if entry.ProcessID == self || !strings.EqualFold(syscall.UTF16ToString(entry.ExeFile[:]), name+".exe") {
			continue
		}
		if path := processImagePath(entry.ProcessID); path != "" {
			return path
		}
	}
	return ""
}

func processImagePath(pid uint32) string {
	handle, err := syscall.OpenProcess(processQueryLimitedInformation, false, pid)
	if err != nil {
		return ""
	}
	defer syscall.CloseHandle(handle)
	buffer := make([]uint16, 1024)
	size := uint32(len(buffer))
	ok, _, _ := queryFullProcessImageName.Call(uintptr(handle), 0, uintptr(unsafe.Pointer(&buffer[0])), uintptr(unsafe.Pointer(&size)))
	if ok == 0 {
		return ""
	}
	return syscall.UTF16ToString(buffer[:size])
}
