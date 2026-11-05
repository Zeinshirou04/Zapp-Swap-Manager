//go:build !windows

package transfer

import "os/exec"

// hideConsole is a no-op on non-Windows platforms.
func hideConsole(cmd *exec.Cmd) {}
