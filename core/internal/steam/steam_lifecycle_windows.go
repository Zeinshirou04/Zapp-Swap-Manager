//go:build windows

package steam

import (
	"os/exec"
	"syscall"
	"time"
)

// CloseSteamGracefully sends the exit command to Steam and waits up to timeout for it to stop.
// Returns true if Steam was running and successfully stopped.
func CloseSteamGracefully(timeout time.Duration) bool {
	if !SteamRunning() {
		return false
	}
	cmd := exec.Command("cmd", "/c", "start", "steam://exit")
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true, CreationFlags: 0x08000000}
	_ = cmd.Run()

	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		time.Sleep(400 * time.Millisecond)
		if !SteamRunning() {
			return true
		}
	}
	return false
}

// RelaunchSteam starts Steam via standard protocol URI.
func RelaunchSteam() {
	cmd := exec.Command("cmd", "/c", "start", "steam://open/main")
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true, CreationFlags: 0x08000000}
	_ = cmd.Start()
}
