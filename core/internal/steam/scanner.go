package steam

import (
	"errors"
	"fmt"
	"hash/fnv"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"

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
	LibraryID    string
	IsCustom     bool
	CoverURL     string
	BannerURL    string
	SwapEnabled  bool
	HasHDDBackup bool
	IsNativeHDD  bool
	Tags         []string
	LastPlayed   *time.Time
	IsPinned     bool
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
	seen := map[string]string{}     // appid -> library ID; a manifest lives in one library at a time
	seenIdx := map[string]int{}     // appid -> index in games slice
	seenHasFiles := map[string]bool{} // appid -> whether the chosen library's game folder has files
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
		commonDir := filepath.Join(lib.Path, "steamapps", "common")
		hasCommonDir := dirExists(commonDir)
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

			actualDir := filepath.Join(commonDir, m.InstallDir)
			actualHasFiles := m.InstallDir != "" && dirHasFiles(actualDir)

			// If this library has a steamapps/common directory and the manifest
			// claims the game is fully installed (StateFlags == 4), but the
			// game folder does not exist on disk at all, treat it as a stale/ghost
			// manifest (e.g. left behind after manual deletion or Steam uninstall).
			if hasCommonDir && m.InstallDir != "" && m.FullyInstalled() && !dirExists(actualDir) {
				continue
			}

			if m.InstallDir != "" {
				claimedDirs[strings.ToLower(m.InstallDir)] = true
			}

			state := StateStorageHDD
			if lib.Type == TypeSSDCache {
				state = StateActiveSSD
			}

			var coverURL string
			var bannerURL string
			swapEnabled := true
			isNativeHDD := false
			var tags []string
			if zm, err := ReadZappManifest(actualDir); err == nil && zm != nil {
				if zm.Name != "" {
					m.Name = zm.Name
				}
				if zm.CoverURL != "" {
					coverURL = zm.CoverURL
				}
				if zm.BannerURL != "" {
					bannerURL = zm.BannerURL
				}
				swapEnabled = zm.SwapEnabled
				isNativeHDD = zm.IsNativeHDD
				tags = zm.Tags
				// Live-patcher games with custom zappmanifest get true folder size
				if dirExists(actualDir) {
					realSize := dirSize(actualDir)
					if realSize > m.SizeOnDisk {
						m.SizeOnDisk = realSize
					}
				}
			} else if m.SizeOnDisk == 0 && dirExists(actualDir) {
				m.SizeOnDisk = dirSize(actualDir)
			}

			// Check if SSD game has an existing non-empty backup in an HDD master library
			hasHDDBackup := false
			if state == StateActiveSSD {
				for _, other := range libs {
					if other.Type == TypeHDDMaster {
						backupDir := filepath.Join(other.Path, "steamapps", "common", m.InstallDir)
						if !dirHasFiles(backupDir) {
							backupDir = filepath.Join(other.Path, m.InstallDir)
						}
						if dirHasFiles(backupDir) {
							hasHDDBackup = true
							break
						}
					}
				}
			} else {
				hasHDDBackup = true
			}

			var lastPlayed *time.Time
			if m.LastPlayed > 0 {
				t := time.Unix(m.LastPlayed, 0).UTC()
				lastPlayed = &t
			}

			gameEntry := Game{
				Manifest:     m,
				State:        state,
				LibraryID:    lib.ID,
				IsCustom:     false,
				CoverURL:     coverURL,
				BannerURL:    bannerURL,
				SwapEnabled:  swapEnabled,
				HasHDDBackup: hasHDDBackup,
				IsNativeHDD:  isNativeHDD,
				Tags:         tags,
				LastPlayed:   lastPlayed,
			}

			if first := seen[m.AppID]; first != "" {
				errs = append(errs, fmt.Errorf("game %s has appmanifest in both %q and %q; expected in one library only", m.AppID, first, lib.ID))
				// If the earlier entry had no files on disk but this library does,
				// prefer the library that actually holds the game files.
				if !seenHasFiles[m.AppID] && actualHasFiles {
					games[seenIdx[m.AppID]] = gameEntry
					seen[m.AppID] = lib.ID
					seenHasFiles[m.AppID] = true
				}
				continue
			}
			seen[m.AppID] = lib.ID
			seenIdx[m.AppID] = len(games)
			seenHasFiles[m.AppID] = actualHasFiles
			games = append(games, gameEntry)
		}
	}

	// Scan unmanifested / custom directories in <lib>/steamapps/common or <lib> directly
	customCandidates := map[string][]customCandidate{} // lowerRelativePath -> list of candidates
	for i := range libs {
		lib := &libs[i]
		commonDir := filepath.Join(lib.Path, "steamapps", "common")
		isSteam := dirExists(commonDir)
		if !isSteam {
			commonDir = lib.Path
		}
		dirInfos := findCustomGameDirsInLib(commonDir, claimedDirs, isSteam)
		for _, info := range dirInfos {
			name := filepath.ToSlash(info.relPath)
			nameLower := strings.ToLower(name)
			fullPath := info.fullPath
			isJunc := info.isJunction

			var size int64
			if !isJunc {
				size = dirSize(fullPath)
			}
			appID := CustomAppID(name)
			state := StateStorageHDD
			if lib.Type == TypeSSDCache && !isJunc {
				state = StateActiveSSD
			}

			gameTitle := filepath.Base(filepath.FromSlash(name))
			var coverURL string
			var bannerURL string
			swapEnabled := true
			isNativeHDD := false
			var tags []string

			// Check if zappmanifest.json exists inside this game directory
			zm := info.zm
			if zm == nil {
				zm, _ = ReadZappManifest(fullPath)
			}
			if zm != nil {
				if zm.Name != "" {
					gameTitle = zm.Name
				}
				if zm.CoverURL != "" {
					coverURL = zm.CoverURL
				}
				if zm.BannerURL != "" {
					bannerURL = zm.BannerURL
				}
				swapEnabled = zm.SwapEnabled
				isNativeHDD = zm.IsNativeHDD
				tags = zm.Tags
			}

			var lastPlayed *time.Time
			if zm != nil && zm.LastPlayed != nil {
				lastPlayed = zm.LastPlayed
			}

			cand := customCandidate{
				game: Game{
					Manifest: Manifest{
						AppID:      appID,
						Name:       gameTitle,
						InstallDir: name,
						SizeOnDisk: size,
						BuildID:    "custom",
						StateFlags: 4,
					},
					State:        state,
					LibraryID:    lib.ID,
					IsCustom:     true,
					CoverURL:     coverURL,
					BannerURL:    bannerURL,
					SwapEnabled:  swapEnabled,
					IsNativeHDD:  isNativeHDD,
					Tags:         tags,
					LastPlayed:   lastPlayed,
					IsPinned:     zm != nil && zm.IsPinned,
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
		// Propagate real folder size to the chosen candidate if chosen was a junction
		var realSize int64
		for _, c := range candidates {
			if c.game.Manifest.SizeOnDisk > 0 {
				realSize = c.game.Manifest.SizeOnDisk
				break
			}
		}
		if chosen.game.Manifest.SizeOnDisk == 0 && realSize > 0 {
			chosen.game.Manifest.SizeOnDisk = realSize
		}

		// Check if HDD backup exists (must contain actual files, not an empty leftover dir)
		hasHDDBackup := false
		if chosen.game.State == StateActiveSSD {
			for _, other := range libs {
				if other.Type == TypeHDDMaster {
					hddPath := filepath.Join(other.Path, "steamapps", "common", chosen.game.Manifest.InstallDir)
					if !dirHasFiles(hddPath) {
						hddPath = filepath.Join(other.Path, chosen.game.Manifest.InstallDir)
					}
					if dirHasFiles(hddPath) {
						hasHDDBackup = true
						break
					}
				}
			}
		} else {
			hasHDDBackup = true
		}
		chosen.game.HasHDDBackup = hasHDDBackup

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

// CustomAppID generates a deterministic safe 53-bit integer string
// (fitting within JSON/JS Number.MAX_SAFE_INTEGER) from a folder name.
func CustomAppID(folderName string) string {
	h := fnv.New64a()
	h.Write([]byte(strings.ToLower(folderName)))
	val := int64(h.Sum64() & 0x001FFFFFFFFFFFFF)
	if val == 0 {
		val = 1
	}
	return strconv.FormatInt(val, 10)
}

type sizeCacheEntry struct {
	size    int64
	expires time.Time
}

var (
	sizeCacheMu sync.RWMutex
	sizeCache   = make(map[string]sizeCacheEntry)
)

// ClearSizeCache invalidates all cached directory size measurements so
// subsequent library scans reflect fresh filesystem state immediately.
func ClearSizeCache() {
	sizeCacheMu.Lock()
	sizeCache = make(map[string]sizeCacheEntry)
	sizeCacheMu.Unlock()
}

func dirSize(path string) int64 {
	sizeCacheMu.RLock()
	if entry, ok := sizeCache[path]; ok && time.Now().Before(entry.expires) {
		sizeCacheMu.RUnlock()
		return entry.size
	}
	sizeCacheMu.RUnlock()

	var total int64
	_ = filepath.Walk(path, func(_ string, info os.FileInfo, err error) error {
		if err == nil && info != nil && !info.IsDir() {
			total += info.Size()
		}
		return nil
	})

	sizeCacheMu.Lock()
	sizeCache[path] = sizeCacheEntry{
		size:    total,
		expires: time.Now().Add(5 * time.Minute),
	}
	sizeCacheMu.Unlock()

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

type customGameDirInfo struct {
	relPath    string
	fullPath   string
	isJunction bool
	zm         *ZappManifest
}

func findCustomGameDirsInLib(baseDir string, claimedDirs map[string]bool, isSteam bool) []customGameDirInfo {
	var results []customGameDirInfo
	if !dirExists(baseDir) {
		return results
	}

	claimedRel := map[string]bool{}

	// Pass 1: Look for any zappmanifest.json up to 4 levels deep
	_ = filepath.Walk(baseDir, func(path string, info os.FileInfo, err error) error {
		if err != nil || info == nil {
			return nil
		}
		rel, err := filepath.Rel(baseDir, path)
		if err != nil {
			return nil
		}
		parts := strings.Split(rel, string(filepath.Separator))
		if len(parts) > 5 {
			if info.IsDir() {
				return filepath.SkipDir
			}
			return nil
		}
		if info.IsDir() && isIgnoredDir(info.Name()) {
			return filepath.SkipDir
		}
		if !info.IsDir() && info.Name() == ZappManifestFilename {
			gameDir := filepath.Dir(path)
			gameRel, err := filepath.Rel(baseDir, gameDir)
			if err == nil && gameRel != "." {
				relSlash := filepath.ToSlash(gameRel)
				relLower := strings.ToLower(relSlash)
				if !claimedDirs[relLower] && !claimedRel[relLower] {
					fi, _ := os.Lstat(gameDir)
					isJunc := fi != nil && (fi.Mode()&os.ModeSymlink != 0 || fi.Mode()&os.ModeIrregular != 0)
					zm, _ := ReadZappManifest(gameDir)
					results = append(results, customGameDirInfo{
						relPath:    relSlash,
						fullPath:   gameDir,
						isJunction: isJunc,
						zm:         zm,
					})
					claimedRel[relLower] = true
					// Mark all ancestor directories as claimed so they aren't treated as games
					ancestor := gameRel
					for {
						ancestor = filepath.Dir(ancestor)
						if ancestor == "." || ancestor == "" || ancestor == "/" || ancestor == "\\" {
							break
						}
						claimedRel[strings.ToLower(filepath.ToSlash(ancestor))] = true
					}
				}
			}
		}
		return nil
	})

	// Pass 2: Look for existing junctions/symlinks up to 4 levels deep
	_ = filepath.Walk(baseDir, func(path string, info os.FileInfo, err error) error {
		if err != nil || info == nil {
			return nil
		}
		rel, err := filepath.Rel(baseDir, path)
		if err != nil || rel == "." {
			return nil
		}
		parts := strings.Split(rel, string(filepath.Separator))
		if len(parts) > 4 {
			if info.IsDir() {
				return filepath.SkipDir
			}
			return nil
		}
		if info.IsDir() && isIgnoredDir(info.Name()) {
			return filepath.SkipDir
		}
		relSlash := filepath.ToSlash(rel)
		relLower := strings.ToLower(relSlash)
		if claimedDirs[relLower] || claimedRel[relLower] {
			return nil
		}

		fi, err := os.Lstat(path)
		if err == nil && fi != nil {
			isJunc := (fi.Mode()&os.ModeSymlink != 0 || fi.Mode()&os.ModeIrregular != 0)
			if isJunc {
				zm, _ := ReadZappManifest(path)
				results = append(results, customGameDirInfo{
					relPath:    relSlash,
					fullPath:   path,
					isJunction: true,
					zm:         zm,
				})
				claimedRel[relLower] = true
				ancestor := rel
				for {
					ancestor = filepath.Dir(ancestor)
					if ancestor == "." || ancestor == "" || ancestor == "/" || ancestor == "\\" {
						break
					}
					claimedRel[strings.ToLower(filepath.ToSlash(ancestor))] = true
				}
				return filepath.SkipDir
			}
		}
		return nil
	})

	if !isSteam {
		// Generic non-Steam libraries: only include games with an explicit
		// zappmanifest.json (Pass 1) or directory junctions (Pass 2).
		// Never auto-detect arbitrary unmanifested folders as games.
		return results
	}

	// Pass 3: Unmanifested directories
	// Check entries at level 1: if not an ancestor of claimed paths, check if it's a container or game
	entries, err := os.ReadDir(baseDir)
	if err == nil {
		for _, e := range entries {
			if !e.IsDir() || isIgnoredDir(e.Name()) {
				continue
			}
			lvl1Name := e.Name()
			lvl1Rel := filepath.ToSlash(lvl1Name)
			lvl1Lower := strings.ToLower(lvl1Rel)
			if claimedDirs[lvl1Lower] || claimedRel[lvl1Lower] {
				continue
			}
			lvl1Path := filepath.Join(baseDir, lvl1Name)

			// Check if lvl1 contains subdirectories that look like games (e.g. "Riot Games/VALORANT")
			subEntries, err := os.ReadDir(lvl1Path)
			hasSubGame := false
			if err == nil {
				for _, sub := range subEntries {
					if !sub.IsDir() || isIgnoredDir(sub.Name()) {
						continue
					}
					subRel := filepath.ToSlash(filepath.Join(lvl1Name, sub.Name()))
					subLower := strings.ToLower(subRel)
					if claimedRel[subLower] {
						hasSubGame = true
						break
					}
					subPath := filepath.Join(lvl1Path, sub.Name())
					if hasExecutableFile(subPath, 3) {
						hasSubGame = true
						claimedRel[subLower] = true
						results = append(results, customGameDirInfo{
							relPath:    subRel,
							fullPath:   subPath,
							isJunction: false,
						})
					}
				}
			}

			if !hasSubGame && hasExecutableFile(lvl1Path, 3) {
				// Level 1 directory itself is a real unmanifested game (contains executable files).
				// Empty or leftover residue folders (e.g., after Steam uninstall) are skipped.
				claimedRel[lvl1Lower] = true
				results = append(results, customGameDirInfo{
					relPath:    lvl1Rel,
					fullPath:   lvl1Path,
					isJunction: false,
				})
			}
		}
	}

	return results
}

var errFoundFile = errors.New("found")

// dirHasFiles reports whether path is an existing directory containing at least
// one regular file anywhere inside it.
func dirHasFiles(path string) bool {
	info, err := os.Stat(path)
	if err != nil || !info.IsDir() {
		return false
	}
	err = filepath.WalkDir(path, func(_ string, d os.DirEntry, walkErr error) error {
		if walkErr != nil {
			return nil
		}
		if !d.IsDir() {
			return errFoundFile
		}
		return nil
	})
	return errors.Is(err, errFoundFile)
}

// hasExecutableFile reports whether dir contains at least one executable file
// within maxDepth directory levels, filtering out empty folders and leftover
// config/log directories from uninstalled Steam games.
func hasExecutableFile(dir string, maxDepth int) bool {
	info, err := os.Stat(dir)
	if err != nil || !info.IsDir() {
		return false
	}
	err = filepath.WalkDir(dir, func(path string, d os.DirEntry, walkErr error) error {
		if walkErr != nil {
			return nil
		}
		rel, relErr := filepath.Rel(dir, path)
		if relErr == nil && rel != "." {
			depth := strings.Count(rel, string(filepath.Separator))
			if d.IsDir() {
				if depth >= maxDepth {
					return filepath.SkipDir
				}
				return nil
			}
		}
		if !d.IsDir() {
			ext := strings.ToLower(filepath.Ext(d.Name()))
			switch ext {
			case ".exe", ".bat", ".cmd", ".msi", ".jar", ".appimage", ".sh", ".bin":
				return errFoundFile
			}
		}
		return nil
	})
	return errors.Is(err, errFoundFile)
}
