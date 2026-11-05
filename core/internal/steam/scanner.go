package steam

import (
	"errors"
	"fmt"
	"hash/fnv"
	"os"
	"path/filepath"
	"strconv"
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
	IsCustom  bool
}

type customCandidate struct {
	game       Game
	isJunction bool
	libType    string
}

// ScanLibraries scans each whitelisted library for appmanifest_*.acf files
// as well as unmanifested game directories in steamapps/common. Games found in
// an ssd_cache library are active_ssd; games in an hdd_master library are storage_hdd.
// Scanning is read-only; no path from outside config is ever accepted.
func ScanLibraries(libs []Library) ([]Game, error) {
	var games []Game
	var errs []error
	seen := map[string]string{} // appid -> library ID; a manifest lives in one library at a time
	claimedDirs := map[string]bool{}

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
			if m.InstallDir != "" {
				claimedDirs[strings.ToLower(m.InstallDir)] = true
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
			games = append(games, Game{Manifest: m, State: state, LibraryID: lib.ID, IsCustom: false})
		}
	}

	// Scan unmanifested / custom directories in <lib>/steamapps/common or <lib> directly
	customCandidates := map[string][]customCandidate{} // lowerFolderName -> list of candidates
	for i := range libs {
		lib := &libs[i]
		commonDir := filepath.Join(lib.Path, "steamapps", "common")
		if !dirExists(commonDir) {
			commonDir = lib.Path
		}
		entries, err := os.ReadDir(commonDir)
		if err != nil {
			continue // No accessible directory in this library
		}
		for _, entry := range entries {
			name := entry.Name()
			nameLower := strings.ToLower(name)
			if claimedDirs[nameLower] || isIgnoredDir(name) {
				continue
			}
			fullPath := filepath.Join(commonDir, name)
			fi, err := os.Lstat(fullPath)
			if err != nil {
				continue
			}
			isJunc := (fi.Mode()&os.ModeSymlink != 0 || fi.Mode()&os.ModeIrregular != 0)
			if !fi.IsDir() && !isJunc {
				continue
			}

			var size int64
			if !isJunc {
				size = dirSize(fullPath)
			}
			appID := CustomAppID(name)
			state := StateStorageHDD
			if lib.Type == TypeSSDCache && !isJunc {
				state = StateActiveSSD
			}

			cand := customCandidate{
				game: Game{
					Manifest: Manifest{
						AppID:      appID,
						Name:       name,
						InstallDir: name,
						SizeOnDisk: size,
						BuildID:    "custom",
						StateFlags: 4,
					},
					State:     state,
					LibraryID: lib.ID,
					IsCustom:  true,
				},
				isJunction: isJunc,
				libType:    lib.Type,
			}
			customCandidates[nameLower] = append(customCandidates[nameLower], cand)
		}
	}

	// Select canonical custom game entry across libraries
	for _, candidates := range customCandidates {
		if len(candidates) == 0 {
			continue
		}
		var chosen *customCandidate
		// 1. Prefer active SSD instance (real folder on SSD cache)
		for i := range candidates {
			if candidates[i].game.State == StateActiveSSD {
				chosen = &candidates[i]
				break
			}
		}
		// 2. Otherwise prefer HDD master instance with real files
		if chosen == nil {
			for i := range candidates {
				if candidates[i].libType == TypeHDDMaster && !candidates[i].isJunction {
					chosen = &candidates[i]
					break
				}
			}
		}
		// 3. Fallback to first available candidate
		if chosen == nil {
			chosen = &candidates[0]
		}
		games = append(games, chosen.game)
	}

	return games, errors.Join(errs...)
}

func isIgnoredDir(name string) bool {
	if strings.HasPrefix(name, ".") || strings.HasPrefix(name, "__") || strings.HasPrefix(name, "$") {
		return true
	}
	switch strings.ToLower(name) {
	case "steam controller configs", "steamworks shared", "downloading", "temp", "steamapps", "system volume information", "recycle.bin", "recovery", "config":
		return true
	}
	return false
}

// CustomAppID generates a deterministic positive 64-bit integer string
// from a folder name (case-insensitive) for non-Steam games.
func CustomAppID(folderName string) string {
	h := fnv.New64a()
	h.Write([]byte(strings.ToLower(folderName)))
	val := int64(h.Sum64() & 0x7FFFFFFFFFFFFFFF)
	return strconv.FormatInt(val, 10)
}

func dirSize(path string) int64 {
	var total int64
	_ = filepath.Walk(path, func(_ string, info os.FileInfo, err error) error {
		if err == nil && info != nil && !info.IsDir() {
			total += info.Size()
		}
		return nil
	})
	return total
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
