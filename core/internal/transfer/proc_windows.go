//go:build windows

package transfer

import (
	"os/exec"
	"syscall"
)

// hideConsole ensures that Windows console applications (such as robocopy.exe
// and cmd.exe) do not flash a terminal window on screen when invoked from the
// background service or desktop app.
func hideConsole(cmd *exec.Cmd) {
	if cmd.SysProcAttr == nil {
		cmd.SysProcAttr = &syscall.SysProcAttr{}
	}
	cmd.SysProcAttr.HideWindow = true
	cmd.SysProcAttr.CreationFlags |= 0x08000000 // CREATE_NO_WINDOW
}
