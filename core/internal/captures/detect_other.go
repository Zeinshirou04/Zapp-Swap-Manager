//go:build !windows

package captures

import "path/filepath"

func queryShadowPlayRegistryPath() string { return "" }

func windowsDocumentsDir(home string) string {
	if home == "" {
		return ""
	}
	return filepath.Join(home, "Documents")
}

func windowsVideosDir(home string) string {
	if home == "" {
		return ""
	}
	return filepath.Join(home, "Videos")
}
