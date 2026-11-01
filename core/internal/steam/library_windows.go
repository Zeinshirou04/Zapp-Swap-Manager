//go:build windows

package steam

import (
	"fmt"
	"strings"
	"syscall"
	"unsafe"
)

var (
	procGetDiskFreeSpaceExW = syscall.NewLazyDLL("kernel32.dll").NewProc("GetDiskFreeSpaceExW")
	procCreateSnap          = syscall.NewLazyDLL("kernel32.dll").NewProc("CreateToolhelp32Snapshot")
	procProcess32FirstW     = syscall.NewLazyDLL("kernel32.dll").NewProc("Process32FirstW")
	procProcess32NextW      = syscall.NewLazyDLL("kernel32.dll").NewProc("Process32NextW")
	procCloseHandle         = syscall.NewLazyDLL("kernel32.dll").NewProc("CloseHandle")
)

func diskSpace(path string) (total, free int64, err error) {
	p, err := syscall.UTF16PtrFromString(path)
	if err != nil {
		return 0, 0, fmt.Errorf("disk space %q: %w", path, err)
	}
	var avail, totalBytes, freeBytes uint64
	r1, _, callErr := procGetDiskFreeSpaceExW.Call(
		uintptr(unsafe.Pointer(p)),
		uintptr(unsafe.Pointer(&avail)),
		uintptr(unsafe.Pointer(&totalBytes)),
		uintptr(unsafe.Pointer(&freeBytes)),
	)
	if r1 == 0 {
		return 0, 0, fmt.Errorf("disk space %q: GetDiskFreeSpaceExW: %v", path, callErr)
	}
	return int64(totalBytes), int64(freeBytes), nil
}

const (
	th32csSnapProcess = 0x2
	imageNameSteam    = "steam.exe"
)

type processEntry32W struct {
	dwSize              uint32
	cntUsage            uint32
	th32ProcessID       uint32
	th32DefaultHeapID   uintptr
	th32ModuleID        uint32
	cntThreads          uint32
	th32ParentProcessID uint32
	pcPriClassBase      int32
	dwFlags             uint32
	szExeFile           [syscall.MAX_PATH]uint16
}

func steamRunning() bool {
	const invalidHandle = ^uintptr(0)
	h, _, _ := procCreateSnap.Call(th32csSnapProcess, 0)
	if h == invalidHandle || h == 0 {
		return false
	}
	defer procCloseHandle.Call(h)
	entry := processEntry32W{dwSize: uint32(unsafe.Sizeof(processEntry32W{}))}
	ok, _, _ := procProcess32FirstW.Call(h, uintptr(unsafe.Pointer(&entry)))
	for ok != 0 {
		if strings.EqualFold(syscall.UTF16ToString(entry.szExeFile[:]), imageNameSteam) {
			return true
		}
		entry.dwSize = uint32(unsafe.Sizeof(entry))
		ok, _, _ = procProcess32NextW.Call(h, uintptr(unsafe.Pointer(&entry)))
	}
	return false
}
