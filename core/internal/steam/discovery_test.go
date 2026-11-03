package steam

import (
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

func TestLibraryIDForPath(t *testing.T) {
	lib := t.TempDir()
	id := LibraryIDForPath(lib)
	if id != LibraryIDForPath(lib) {
		t.Fatalf("LibraryIDForPath not stable: %s", id)
	}
	if id != LibraryIDForPath(strings.ToUpper(lib)) {
		t.Fatalf("LibraryIDForPath must be case-insensitive: %s vs %s", id, LibraryIDForPath(strings.ToUpper(lib)))
	}
	if id == LibraryIDForPath(filepath.Join(filepath.Dir(lib), "other")) {
		t.Fatalf("LibraryIDForPath collides for different paths: %s", id)
	}
	// IDs are used as job references where paths are rejected (path-like chars forbidden).
	if strings.ContainsAny(id, `\ /: `) {
		t.Fatalf("ID not path-safe: %q", id)
	}
}

func writeLibraryFolders(t *testing.T, root string, libs []string) {
	t.Helper()
	var sb strings.Builder
	sb.WriteString("\"libraryfolders\"\n{\n")
	for i, lib := range libs {
		escaped := strings.ReplaceAll(lib, `\`, `\\`) // vdf backslash escaping
		fmt.Fprintf(&sb, "\t\"%d\"\n\t{\n\t\t\"path\"\t\t\"%s\"\n\t}\n", i, escaped)
	}
	sb.WriteString("}\n")
	if err := os.MkdirAll(filepath.Join(root, "steamapps"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, "steamapps", "libraryfolders.vdf"), []byte(sb.String()), 0o644); err != nil {
		t.Fatal(err)
	}
}

func TestDetectLibrariesFromRoots(t *testing.T) {
	libA := t.TempDir()
	libB := filepath.Join(t.TempDir(), "Nested", "SteamLibrary")
	if err := os.MkdirAll(libB, 0o755); err != nil {
		t.Fatal(err)
	}
	ph := filepath.Join(t.TempDir(), "never", "exists")
	root := t.TempDir()
	writeLibraryFolders(t, root, []string{libA, libB, ph})

	detected := DetectLibrariesFromRoots([]string{root, root})
	seen := map[string]DetectedLibrary{}
	for _, d := range detected {
		if _, dup := seen[strings.ToLower(d.Path)]; dup {
			t.Fatalf("duplicate detection for %q", d.Path)
		}
		seen[strings.ToLower(d.Path)] = d
	}
	for _, want := range []string{libA, libB, root} {
		d, ok := seen[strings.ToLower(filepath.Clean(want))]
		if !ok {
			t.Fatalf("expected %q detected, got %v", want, detected)
		}
		if d.ID == "" || d.DriveType == "" {
			t.Fatalf("library %v missing ID or drive type", d)
		}
		if d.TotalBytes <= 0 || d.FreeBytes <= 0 {
			t.Fatalf("library %v missing disk metrics", d)
		}
	}
	if _, ok := seen[strings.ToLower(ph)]; ok {
		t.Fatal("declared but nonexistent path must be skipped")
	}
}

func TestValidateLibraryPath(t *testing.T) {
	if _, err := ValidateLibraryPath(filepath.Join(t.TempDir(), "sub") + string(os.PathSeparator)); err == nil {
		t.Fatal("missing directory must be rejected")
	}
	dir := t.TempDir()
	got, err := ValidateLibraryPath(dir + string(os.PathSeparator) + "." + string(os.PathSeparator))
	if err != nil {
		t.Fatalf("existing dir rejected: %v", err)
	}
	if got != filepath.Clean(dir) {
		t.Fatalf("expected cleaned %q, got %q", filepath.Clean(dir), got)
	}
	if _, err := ValidateLibraryPath(filepath.Join("relative", "path")); err == nil {
		t.Fatal("relative path must be rejected")
	}
	file := filepath.Join(t.TempDir(), "file.txt")
	if err := os.WriteFile(file, []byte("x"), 0o644); err != nil {
		t.Fatal(err)
	}
	if _, err := ValidateLibraryPath(file); err == nil {
		t.Fatal("file must be rejected")
	}
	root := string(os.PathSeparator)
	if runtime.GOOS == "windows" {
		root = `C:\`
	}
	if _, err := ValidateLibraryPath(root); err == nil {
		t.Fatal("filesystem root must be rejected")
	}
	if _, err := ValidateLibraryPath(""); err == nil {
		t.Fatal("empty path must be rejected")
	}
}

func TestDriveTypeCoverage(t *testing.T) {
	switch dt := driveType(t.TempDir()); dt {
	case DriveFixed, DriveRemovable, DriveNetwork, DriveUnknown:
	default:
		t.Fatalf("unknown drive type %q", dt)
	}
}
