//go:build !windows

package steam

import (
	"os"
	"path/filepath"
)

// steamRoots returns the standard POSIX Steam install locations; there is no
// registry equivalent on this platform.
func steamRoots() []string {
	var roots []string
	if home, err := os.UserHomeDir(); err == nil && home != "" {
		roots = append(roots,
			filepath.Join(home, ".local", "share", "Steam"),
			filepath.Join(home, ".steam", "steam"),
		)
	}
	return roots
}

// driveType has no cheap POSIX probe; all mounted libraries are treated as
// local fixed disks.
func driveType(path string) string { return DriveFixed }
