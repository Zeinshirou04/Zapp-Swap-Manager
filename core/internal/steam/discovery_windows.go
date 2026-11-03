//go:build windows

package steam

import (
	"os"
	"path/filepath"
	"strings"
	"syscall"
	"unsafe"

	"golang.org/x/sys/windows/registry"
)

// steamRoots gathers candidate Steam install roots: the registry SteamPath
// first (HKCU\Software\Valve\Steam), then the standard install locations.
func steamRoots() []string {
	var roots []string
	if k, err := registry.OpenKey(registry.CURRENT_USER, `Software\Valve\Steam`, registry.QUERY_VALUE); err == nil {
		if v, _, err := k.GetStringValue("SteamPath"); err == nil {
			if p := filepath.Clean(strings.TrimSpace(v)); dirExists(p) {
				roots = append(roots, p)
			}
		}
		_ = k.Close()
	}
	for _, env := range []string{"ProgramFiles(x86)", "ProgramFiles"} {
		if base := os.Getenv(env); base != "" {
			if p := filepath.Join(base, "Steam"); dirExists(p) {
				roots = append(roots, p)
			}
		}
	}
	return roots
}

var procGetDriveTypeW = syscall.NewLazyDLL("kernel32.dll").NewProc("GetDriveTypeW")

// driveType probes the volume hosting path via GetDriveTypeW.
func driveType(path string) string {
	vol := filepath.VolumeName(path)
	if vol == "" {
		return DriveUnknown
	}
	if strings.HasPrefix(vol, `\\`) {
		return DriveNetwork // UNC path
	}
	p, err := syscall.UTF16PtrFromString(vol + string(os.PathSeparator))
	if err != nil {
		return DriveUnknown
	}
	switch v, _, _ := procGetDriveTypeW.Call(uintptr(unsafe.Pointer(p))); v {
	case 3:
		return DriveFixed // DRIVE_FIXED (HDD or SSD)
	case 2:
		return DriveRemovable // DRIVE_REMOVABLE
	case 4:
		return DriveNetwork // DRIVE_REMOTE
	default:
		return DriveUnknown
	}
}
