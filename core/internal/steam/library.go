package steam

import (
	"fmt"
	"strings"
	"syscall"
	"unsafe"
)

// Library types from api/openapi.yaml.
const (
	TypeSSDCache  = "ssd_cache"
	TypeHDDMaster = "hdd_master"
)

// Library is a whitelisted Steam library. Only libraries known to config may
// be scanned; the API never carries raw paths, only IDs.
type Library struct {
	ID         string
	Name       string
	Path       string
	Type       string // TypeSSDCache or TypeHDDMaster
	FreeBytes  int64
	TotalBytes int64
}

// RefreshDiskSpace queries the drive hosting the library and fills
// FreeBytes/TotalBytes. Injected diskSpaceFn keeps tests platform-free.
func (l *Library) RefreshDiskSpace() error {
	total, free, err := diskSpaceFn(l.Path)
	if err != nil {
		return err
	}
	l.TotalBytes, l.FreeBytes = total, free
	return nil
}

func (l *Library) validate() error {
	switch l.Type {
	case TypeSSDCache, TypeHDDMaster:
	case "":
		return fmt.Errorf("library %q (%s): type not set, expected %s or %s", l.ID, l.Path, TypeSSDCache, TypeHDDMaster)
	default:
		return fmt.Errorf("library %q (%s): unknown type %q", l.ID, l.Path, l.Type)
	}
	if strings.TrimSpace(l.Path) == "" {
		return fmt.Errorf("library %q: empty path", l.ID)
	}
	return nil
}

// SteamRunning reports whether a steam.exe process is running. Backup skip
// guard from docs/safety.md.
func SteamRunning() bool { return steamRunningFn() }

// Test-injectable seams. shortcut: Windows-only syscall implementations, same
// as the product target (the core binds to 127.0.0.1 on Windows); cross-compile
// for CI would need a stubbed _other file.
var (
	diskSpaceFn    = diskSpaceWindows
	steamRunningFn = steamRunningWindows
)

var (
	procGetDiskFreeSpaceExW = syscall.NewLazyDLL("kernel32.dll").NewProc("GetDiskFreeSpaceExW")
	procCreateSnap          = syscall.NewLazyDLL("kernel32.dll").NewProc("CreateToolhelp32Snapshot")
	procProcess32FirstW     = syscall.NewLazyDLL("kernel32.dll").NewProc("Process32FirstW")
	procProcess32NextW      = syscall.NewLazyDLL("kernel32.dll").NewProc("Process32NextW")
	procCloseHandle         = syscall.NewLazyDLL("kernel32.dll").NewProc("CloseHandle")
)

func diskSpaceWindows(path string) (total, free int64, err error) {
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

func steamRunningWindows() bool {
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
