package transfer

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

// dropFactor: refuse a mirror when source file count or total size drops
// below 70% of the last recorded backup (a drop of more than 30%).
const dropFactor = 0.7

func dirExists(p string) bool {
	fi, err := os.Stat(p)
	return err == nil && fi.IsDir()
}

// gameFolder resolves where a game's data lives inside a library root.
// Only ever built from a whitelisted library root and a manifest installDir.
// If the library follows the Steam structure (or if libRoot doesn't exist on disk),
// it resolves inside steamapps/common.
// For generic/standalone games libraries where libRoot exists and has no steamapps dir,
// it resolves directly under libRoot.
func gameFolder(libRoot, installDir string) string {
	if dirExists(libRoot) && !dirExists(filepath.Join(libRoot, "steamapps")) {
		return filepath.Join(libRoot, installDir)
	}
	return filepath.Join(libRoot, "steamapps", "common", installDir)
}

func steamappsFolder(libRoot string) string {
	return filepath.Join(libRoot, "steamapps")
}

// validateInstallDir rejects the parts of an installDir that could escape the
// planned path. Installdirs come from appmanifest data, which we mostly trust
// but never hand raw paths to.
func validateInstallDir(installDir string) error {
	if installDir == "" || filepath.IsAbs(installDir) || strings.Contains(installDir, "..") ||
		strings.ContainsAny(installDir, `/\:`) {
		return fmt.Errorf("unsafe install directory name %q", installDir)
	}
	return nil
}

// CheckSource enforces the source guard: the folder must exist and must not
// be empty. Used before any transfer.
func CheckSource(src string) error {
	info, err := os.Stat(src)
	if err != nil {
		return fmt.Errorf("source folder: %w", err)
	}
	if !info.IsDir() {
		return fmt.Errorf("source folder %s is not a directory", src)
	}
	st, err := MeasureTree(src)
	if err != nil {
		return fmt.Errorf("source folder: %w", err)
	}
	if st.Files == 0 {
		return fmt.Errorf("source folder %s is empty; refusing to mirror", src)
	}
	return nil
}

// ExpectedGameFolder is the only destination a mirror may target:
// <library root>\steamapps\common\<installdir> for that game.
func ExpectedGameFolder(hddLibRoot, installDir string) string {
	return gameFolder(hddLibRoot, installDir)
}

// CheckDestination enforces the destination guard: dest must resolve exactly
// to <HDD library>\steamapps\common\<installdir>.
func CheckDestination(dest, hddLibRoot, installDir string) error {
	want := ExpectedGameFolder(hddLibRoot, installDir)
	if !strings.EqualFold(filepath.Clean(dest), filepath.Clean(want)) {
		return fmt.Errorf("destination guard: got %q, expected exactly %q", dest, want)
	}
	return nil
}

// CheckDropGuard enforces the threshold guard: if last backup metrics exist,
// refuse when the source has dropped by more than 30% in file count or total
// size unless the caller carries explicit user confirmation (docs/safety.md
// mirror guards).
func CheckDropGuard(src string, last *TreeStats, confirmed bool) error {
	if err := CheckSource(src); err != nil {
		return fmt.Errorf("drop guard: %w", err)
	}
	if last == nil {
		return nil
	}
	cur, err := MeasureTree(src)
	if err != nil {
		return fmt.Errorf("drop guard: %w", err)
	}
	fileDrop := cur.Files < int64(float64(last.Files)*dropFactor)
	byteDrop := cur.Bytes < int64(float64(last.Bytes)*dropFactor)
	if !fileDrop && !byteDrop {
		return nil
	}
	if confirmed {
		return nil
	}
	if fileDrop {
		return fmt.Errorf("drop guard: source has %d files, last backup had %d (drop >30%%, needs confirmation)", cur.Files, last.Files)
	}
	return fmt.Errorf("drop guard: source is %d bytes, last backup was %d bytes (drop >30%%, needs confirmation)", cur.Bytes, last.Bytes)
}
