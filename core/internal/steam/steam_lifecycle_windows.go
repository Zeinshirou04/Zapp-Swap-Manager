//go:build windows

package steam

import (
	"os"
	"os/exec"
	"path/filepath"
	"syscall"
	"time"
)

func findSteamExe() string {
	for _, root := range steamRoots() {
		exe := filepath.Join(root, "steam.exe")
		if info, err := os.Stat(exe); err == nil && !info.IsDir() {
			return exe
		}
	}
	return ""
}

// CloseSteamGracefully sends the shutdown command to Steam (`steam.exe -shutdown`,
// falling back to `steam://exit`) and waits up to timeout for it to stop.
// Returns true if Steam was running and successfully stopped.
func CloseSteamGracefully(timeout time.Duration) bool {
	if !SteamRunning() {
		return false
	}
	if exe := findSteamExe(); exe != "" {
		cmd := exec.Command(exe, "-shutdown")
		cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true, CreationFlags: 0x08000000}
		_ = cmd.Run()
	} else {
		cmd := exec.Command("cmd", "/c", "start", "steam://exit")
		cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true, CreationFlags: 0x08000000}
		_ = cmd.Run()
	}

	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		time.Sleep(250 * time.Millisecond)
		if !SteamRunning() {
			return true
		}
	}
	return false
}

// RelaunchSteam starts Steam quietly in the system tray (`steam.exe -silent`),
// falling back to the `steam://open/main` protocol URI if the executable path
// is unavailable.
func RelaunchSteam() {
	if exe := findSteamExe(); exe != "" {
		cmd := exec.Command(exe, "-silent")
		cmd.SysProcAttr = &syscall.SysProcAttr{CreationFlags: 0x00000008} // DETACHED_PROCESS
		if err := cmd.Start(); err == nil {
			return
		}
	}
	cmd := exec.Command("cmd", "/c", "start", "steam://open/main")
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true, CreationFlags: 0x08000000}
	_ = cmd.Start()
}
