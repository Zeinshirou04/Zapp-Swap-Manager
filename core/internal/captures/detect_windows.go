//go:build windows

package captures

import (
	"encoding/binary"
	"os"
	"path/filepath"
	"strings"
	"unicode/utf16"

	"golang.org/x/sys/windows/registry"
)

func queryShadowPlayRegistryPath() string {
	key, err := registry.OpenKey(
		registry.CURRENT_USER,
		`SOFTWARE\NVIDIA Corporation\Global\ShadowPlay\NVSPCAPS`,
		registry.QUERY_VALUE,
	)
	if err != nil {
		return ""
	}
	defer key.Close()

	if val, _, err := key.GetStringValue("DefaultPathW"); err == nil {
		if cleaned := strings.TrimSpace(strings.TrimRight(val, "\x00")); cleaned != "" {
			return expandWindowsPath(cleaned)
		}
	}

	// Some NVIDIA GeForce Experience / NVIDIA App builds store DefaultPathW as REG_BINARY UTF-16LE.
	if raw, _, err := key.GetBinaryValue("DefaultPathW"); err == nil && len(raw) >= 2 {
		n := len(raw) / 2
		u16 := make([]uint16, n)
		for i := 0; i < n; i++ {
			u16[i] = binary.LittleEndian.Uint16(raw[i*2 : i*2+2])
		}
		decoded := strings.TrimSpace(strings.TrimRight(string(utf16.Decode(u16)), "\x00"))
		if decoded != "" {
			return expandWindowsPath(decoded)
		}
	}
	return ""
}

func windowsDocumentsDir(home string) string {
	if p := queryShellUserFolder("Personal", home); p != "" {
		return p
	}
	if home != "" {
		return filepath.Join(home, "Documents")
	}
	return ""
}

func windowsVideosDir(home string) string {
	if p := queryShellUserFolder("My Video", home); p != "" {
		return p
	}
	if home != "" {
		return filepath.Join(home, "Videos")
	}
	return ""
}

func queryShellUserFolder(name, home string) string {
	key, err := registry.OpenKey(
		registry.CURRENT_USER,
		`Software\Microsoft\Windows\CurrentVersion\Explorer\User Shell Folders`,
		registry.QUERY_VALUE,
	)
	if err != nil {
		return ""
	}
	defer key.Close()

	val, _, err := key.GetStringValue(name)
	if err != nil {
		return ""
	}
	p := expandWindowsPath(strings.TrimSpace(val))
	if strings.HasPrefix(strings.ToUpper(p), "%USERPROFILE%") && home != "" {
		p = home + p[len("%USERPROFILE%"):]
	}
	return filepath.Clean(p)
}

func expandWindowsPath(p string) string {
	if p == "" {
		return ""
	}
	home, _ := os.UserHomeDir()
	repl := []string{
		"%USERPROFILE%", home,
		"%UserProfile%", home,
		"%LOCALAPPDATA%", os.Getenv("LOCALAPPDATA"),
		"%APPDATA%", os.Getenv("APPDATA"),
	}
	r := strings.NewReplacer(repl...)
	return filepath.Clean(r.Replace(p))
}
