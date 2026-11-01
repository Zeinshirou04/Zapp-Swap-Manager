package steam

import (
	"fmt"
	"strings"
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

// SteamRunning reports whether Steam is running (for the backup-skip guard
// in docs/safety.md). steamRunningFn is provided by a platform-tagged file:
// library_windows.go (steam.exe via Toolhelp32) / library_linux.go (/proc).
func SteamRunning() bool { return steamRunningFn() }

// Test-injectable seams; the defaults are the platform implementations below
// (library_windows.go / library_linux.go, selected by Go build tags).
var (
	diskSpaceFn    = diskSpace
	steamRunningFn = steamRunning
)
