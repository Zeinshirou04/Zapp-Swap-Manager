//go:build windows

package tray

import (
	"testing"
)

func TestLoadTrayIcon(t *testing.T) {
	hInst, _, _ := procGetModuleHandleW.Call(0)
	hIcon := loadTrayIcon(hInst)
	if hIcon == 0 {
		t.Fatalf("expected non-zero hIcon handle, got 0")
	}
}
