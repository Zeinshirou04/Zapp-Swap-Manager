//go:build linux

package steam

import (
	"fmt"
	"os"
	"strings"
	"syscall"
)

// diskSpace reads POSIX mount stats: total and free-to-non-root bytes via
// Statfs (freeBytes = Bavail, the space available to unprivileged users,
// which matches GetDiskFreeSpaceExW's usable-free semantics).
func diskSpace(path string) (total, free int64, err error) {
	var stat syscall.Statfs_t
	if err := syscall.Statfs(path, &stat); err != nil {
		return 0, 0, fmt.Errorf("disk space %q: statfs: %w", path, err)
	}
	return int64(stat.Blocks) * int64(stat.Bsize),
		int64(stat.Bavail) * int64(stat.Bsize),
		nil
}

// steamRunning scans /proc process names for anything starting with "steam"
// (the Linux client runs as steam/steam.sh plus steamwebhelper helpers).
func steamRunning() bool {
	entries, err := os.ReadDir("/proc")
	if err != nil {
		return false
	}
	for _, e := range entries {
		if !e.IsDir() || !isPID(e.Name()) {
			continue
		}
		comm, err := os.ReadFile("/proc/" + e.Name() + "/comm")
		if err != nil {
			continue // process may have exited
		}
		if strings.HasPrefix(strings.ToLower(strings.TrimSpace(string(comm))), "steam") {
			return true
		}
	}
	return false
}

func isPID(name string) bool {
	for i := 0; i < len(name); i++ {
		if name[i] < '0' || name[i] > '9' {
			return false
		}
	}
	return name != ""
}
