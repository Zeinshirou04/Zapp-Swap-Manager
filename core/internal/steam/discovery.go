package steam

import (
	"fmt"
	"hash/fnv"
	"log/slog"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

// Drive types reported by DetectedLibrary.DriveType.
const (
	DriveFixed     = "fixed"
	DriveRemovable = "removable"
	DriveNetwork   = "network"
	DriveUnknown   = "unknown"
)

// DetectedLibrary is one Steam library folder found by auto-discovery
// (Plan 017). Unlike Library, Path crosses the API on purpose: the local
// desktop wizard shows the detected folders and registers chosen ones back
// via POST /libraries, which validates every path server-side before it may
// enter the whitelist.
type DetectedLibrary struct {
	ID         string `json:"id"`
	Path       string `json:"path"`
	DriveType  string `json:"drive_type"`
	FreeBytes  int64  `json:"free_bytes"`
	TotalBytes int64  `json:"total_bytes"`
}

// LibraryIDForPath derives the stable library ID for a path. The hex result is
// safe as a client-side job reference where raw paths are rejected
// (docs/safety.md "API input").
func LibraryIDForPath(path string) string {
	h := fnv.New64a()
	_, _ = h.Write([]byte(strings.ToLower(filepath.Clean(path))))
	return fmt.Sprintf("lib-%016x", h.Sum64())
}

// DetectLibraries scans the host for Steam installations and returns every
// library folder they report, with drive metrics. Best effort: it never
// errors, individual library skips are logged.
func DetectLibraries() []DetectedLibrary {
	return DetectLibrariesFromRoots(steamRoots())
}

// DetectLibrariesFromRoots inspects Steam install roots for
// steamapps/libraryfolders.vdf (Fall through to the 2020-era config/ location)
// and collects the declared library paths plus the root itself.
func DetectLibrariesFromRoots(roots []string) []DetectedLibrary {
	seen := map[string]bool{}
	var out []DetectedLibrary
	for _, root := range roots {
		root = filepath.Clean(root)
		if !dirExists(root) {
			continue
		}
		paths := []string{root}
		for _, loc := range []string{
			filepath.Join(root, "steamapps", "libraryfolders.vdf"),
			filepath.Join(root, "config", "libraryfolders.vdf"),
		} {
			data, err := os.ReadFile(loc)
			if err != nil {
				continue
			}
			declared, err := ParseLibraryFolders(data)
			if err != nil {
				slog.Warn("steam discovery", "root", root, "err", err)
				continue
			}
			paths = append(paths, declared...)
			break
		}
		for _, p := range paths {
			p = filepath.Clean(strings.TrimSpace(p))
			if p == "" || p == "." || !dirExists(p) {
				continue
			}
			key := strings.ToLower(p)
			if seen[key] {
				continue
			}
			seen[key] = true
			d := DetectedLibrary{ID: LibraryIDForPath(p), Path: p, DriveType: driveTypeFn(p)}
			if total, free, err := diskSpaceFn(p); err == nil {
				d.TotalBytes, d.FreeBytes = total, free
			} else {
				slog.Warn("steam discovery", "path", p, "disk_space", err)
			}
			out = append(out, d)
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Path < out[j].Path })
	return out
}

// ValidateLibraryPath admits an API-supplied candidate into the whitelist
// only if it is an absolute, existing directory and not a filesystem root.
// The cleaned path is what enters the whitelist; jobs still never carry it.
func ValidateLibraryPath(p string) (string, error) {
	cleaned := filepath.Clean(strings.TrimSpace(p))
	if cleaned == "" || cleaned == "." {
		return "", fmt.Errorf("empty library path")
	}
	if !filepath.IsAbs(cleaned) {
		return "", fmt.Errorf("library path %q must be absolute", cleaned)
	}
	vol := filepath.VolumeName(cleaned)
	if cleaned == "/" || (vol != "" && vol+string(os.PathSeparator) == cleaned) {
		return "", fmt.Errorf("filesystem root %q cannot be a library", cleaned)
	}
	fi, err := os.Stat(cleaned)
	if err != nil {
		return "", fmt.Errorf("library path %q: %w", cleaned, err)
	}
	if !fi.IsDir() {
		return "", fmt.Errorf("library path %q is not a directory", cleaned)
	}
	return cleaned, nil
}

func dirExists(p string) bool {
	fi, err := os.Stat(p)
	return err == nil && fi.IsDir()
}

// driveTypeFn is the test-injectable seam over the platform drive-type probe.
var driveTypeFn = driveType
