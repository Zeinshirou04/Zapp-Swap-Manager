//go:build windows

package transfer

import (
	"fmt"
	"os"
	"os/exec"
	"syscall"
)

const fileAttributeReparsePoint = 0x400

func defaultCreateJunction(link, target string) error {
	cmd := exec.Command("cmd.exe", "/c", "mklink", "/J", link, target)
	hideConsole(cmd)
	out, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("mklink /J %s %s: %s: %w", link, target, string(out), err)
	}
	return nil
}

func defaultIsJunction(path string) bool {
	fi, err := os.Lstat(path)
	if err != nil {
		return false
	}
	if fi.Mode()&os.ModeSymlink != 0 || fi.Mode()&os.ModeIrregular != 0 {
		return true
	}
	if data, ok := fi.Sys().(*syscall.Win32FileAttributeData); ok {
		return data.FileAttributes&fileAttributeReparsePoint != 0
	}
	return false
}
