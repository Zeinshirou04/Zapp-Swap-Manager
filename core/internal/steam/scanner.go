package steam

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/Zeinshirou04/Zapp-Swap-Manager/core/internal/vdf"
)

// Game states from api/openapi.yaml.
const (
	StateActiveSSD  = "active_ssd"
	StateStorageHDD = "storage_hdd"
)

const manifestGlob = "appmanifest_*.acf"

// Game is one Steam game found in a scanned library.
type Game struct {
	Manifest Manifest
	State    string // StateActiveSSD or StateStorageHDD
	// Library currently holding this game's appmanifest (and thus the one
	// Steam considers it installed in). ID, not path.
	LibraryID string
}

// ScanLibraries scans each whitelisted library for appmanifest_*.acf files
// and returns the detected games. Games found in an ssd_cache library are
// active_ssd; games in an hdd_master library are storage_hdd. Scanning is
// read-only; no path from outside config is ever accepted.
func ScanLibraries(libs []Library) ([]Game, error) {
	var games []Game
	var errs []error
	seen := map[string]string{} // appid -> library ID; a manifest lives in one library at a time
	for i := range libs {
		lib := &libs[i]
		if err := lib.validate(); err != nil {
			errs = append(errs, err)
			continue
		}
		if err := lib.RefreshDiskSpace(); err != nil {
			errs = append(errs, err)
			continue
		}
		matches, err := filepath.Glob(filepath.Join(lib.Path, "steamapps", manifestGlob))
		if err != nil {
			errs = append(errs, fmt.Errorf("scan library %q: %w", lib.ID, err))
			continue
		}
		for _, path := range matches {
			data, err := os.ReadFile(path)
			if err != nil {
				errs = append(errs, fmt.Errorf("scan library %q: %w", lib.ID, err))
				continue
			}
			m, err := ParseManifest(data)
			if err != nil {
				errs = append(errs, fmt.Errorf("scan library %q: %s: %w", lib.ID, filepath.Base(path), err))
				continue
			}
			if m.AppID == "" {
				// Fall back to the filename component.
				m.AppID = appIDFromManifestFilename(path)
				if m.AppID == "" {
					continue
				}
			}
			if first := seen[m.AppID]; first != "" {
				errs = append(errs, fmt.Errorf("game %s has appmanifest in both %q and %q; expected in one library only", m.AppID, first, lib.ID))
				continue
			}
			seen[m.AppID] = lib.ID
			state := StateStorageHDD
			if lib.Type == TypeSSDCache {
				state = StateActiveSSD
			}
			games = append(games, Game{Manifest: m, State: state, LibraryID: lib.ID})
		}
	}
	return games, errors.Join(errs...)
}

func appIDFromManifestFilename(path string) string {
	normalized := strings.ReplaceAll(path, "\\", "/")
	name := normalized[strings.LastIndex(normalized, "/")+1:]
	name = strings.TrimPrefix(name, "appmanifest_")
	name = strings.TrimSuffix(name, ".acf")
	return strings.TrimSpace(name)
}

// ParseLibraryFolders extracts library paths from Steam's
// steamapps/libraryfolders.vdf. Callers map config types/IDs onto these paths.
func ParseLibraryFolders(data []byte) ([]string, error) {
	root, err := vdf.Parse(data)
	if err != nil {
		return nil, fmt.Errorf("parse libraryfolders: %w", err)
	}
	folders := root.Get("libraryfolders")
	if folders == nil {
		return nil, fmt.Errorf("parse libraryfolders: missing \"libraryfolders\" block")
	}
	var paths []string
	for _, e := range folders.Children {
		if p := e.Get("path"); p != nil && p.Value != "" {
			paths = append(paths, p.Value)
		}
	}
	return paths, nil
}
