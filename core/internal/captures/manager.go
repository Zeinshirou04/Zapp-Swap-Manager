package captures

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io/fs"
	"os"
	"path/filepath"
	"runtime"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/Zeinshirou04/Zapp-Swap-Manager/core/internal/config"
)

const (
	maxWalkDepth   = 5
	maxWalkEntries = 50000
	defaultLimit   = 120
	maxLimit       = 500
)

type indexedCapture struct {
	absPath string
	source  string
	mime    string
}

// AliasStore persists per-game custom capture matching keywords (e.g. window titles
// or executable names) inside <AppDir>/captures/aliases.json.
type AliasStore struct {
	path string
	mu   sync.RWMutex
}

// Manager discovers capture sources, matches screenshots/videos per game, and resolves
// opaque 32-hex IDs back to verified files strictly inside allowed capture roots.
type Manager struct {
	aliases *AliasStore
	mu      sync.RWMutex
	index   map[string]indexedCapture
	detect  func() detectedSources
}

// NewManager initializes a capture manager rooted in dir (defaults to a temp fallback when empty).
func NewManager(dir string) *Manager {
	if strings.TrimSpace(dir) == "" {
		dir = filepath.Join(os.TempDir(), "zapp-captures")
	}
	return &Manager{
		aliases: &AliasStore{path: filepath.Join(dir, "aliases.json")},
		index:   map[string]indexedCapture{},
		detect:  func() detectedSources { return detectSourcesFn() },
	}
}

// SetStaticSources overrides OS auto-detection with fixed source paths (intended for deterministic tests).
func (m *Manager) SetStaticSources(shareXRoot, shareXHistoryDB, shadowPlayRoot string) {
	m.detect = func() detectedSources {
		return detectedSources{
			shareXRoot:      shareXRoot,
			shareXHistoryDB: shareXHistoryDB,
			shadowPlayRoot:  shadowPlayRoot,
		}
	}
}

func (a *AliasStore) loadLocked() (map[string][]string, error) {
	out := map[string][]string{}
	data, err := os.ReadFile(a.path)
	if os.IsNotExist(err) {
		return out, nil
	}
	if err != nil {
		return nil, err
	}
	if err := json.Unmarshal(data, &out); err != nil {
		return nil, err
	}
	return out, nil
}

func (a *AliasStore) saveLocked(m map[string][]string) error {
	if err := os.MkdirAll(filepath.Dir(a.path), 0o755); err != nil {
		return err
	}
	data, err := json.MarshalIndent(m, "", "  ")
	if err != nil {
		return err
	}
	tmp := a.path + ".tmp"
	if err := os.WriteFile(tmp, data, 0o644); err != nil {
		return err
	}
	return os.Rename(tmp, a.path)
}

// GetAliases returns custom capture aliases for appID.
func (m *Manager) GetAliases(appID string) []string {
	if m == nil || m.aliases == nil {
		return nil
	}
	m.aliases.mu.RLock()
	defer m.aliases.mu.RUnlock()
	all, err := m.aliases.loadLocked()
	if err != nil {
		return nil
	}
	return append([]string(nil), all[appID]...)
}

// AllAliases returns all stored alias lists keyed by app_id for enriching game listings.
func (m *Manager) AllAliases() map[string][]string {
	if m == nil || m.aliases == nil {
		return map[string][]string{}
	}
	m.aliases.mu.RLock()
	defer m.aliases.mu.RUnlock()
	all, err := m.aliases.loadLocked()
	if err != nil {
		return map[string][]string{}
	}
	return all
}

// SetAliases persists sanitized custom capture aliases for appID.
func (m *Manager) SetAliases(appID string, raw []string) ([]string, error) {
	if m == nil || m.aliases == nil {
		return nil, errors.New("capture manager uninitialized")
	}
	seen := map[string]bool{}
	clean := make([]string, 0, len(raw))
	for _, s := range raw {
		t := strings.TrimSpace(s)
		if t == "" {
			continue
		}
		k := strings.ToLower(t)
		if seen[k] {
			continue
		}
		seen[k] = true
		clean = append(clean, t)
	}

	m.aliases.mu.Lock()
	defer m.aliases.mu.Unlock()
	all, err := m.aliases.loadLocked()
	if err != nil {
		return nil, err
	}
	if len(clean) == 0 {
		delete(all, appID)
	} else {
		all[appID] = clean
	}
	if err := m.aliases.saveLocked(all); err != nil {
		return nil, err
	}
	return clean, nil
}

// DetectSources summarizes detected ShareX & NVIDIA ShadowPlay sources alongside configured folders.
func (m *Manager) DetectSources(prefs config.Preferences) SourcesStatus {
	np := prefs.Normalized()
	det := m.detect()
	sharexOn := np.ShareXEnabled == nil || *np.ShareXEnabled
	shadowOn := np.ShadowPlayEnabled == nil || *np.ShadowPlayEnabled

	custom := append([]string(nil), np.CaptureFolders...)
	if custom == nil {
		custom = []string{}
	}
	return SourcesStatus{
		ShareX: ShareXSourceStatus{
			Detected:      det.shareXRoot != "" || det.shareXHistoryDB != "",
			Enabled:       sharexOn,
			RootPath:      det.shareXRoot,
			HistoryDBPath: det.shareXHistoryDB,
		},
		ShadowPlay: ShadowPlaySourceStatus{
			Detected: det.shadowPlayRoot != "" || det.shadowPlayVideos != "",
			Enabled:  shadowOn,
			RootPath: det.shadowPlayRoot,
		},
		CustomFolders: custom,
	}
}

func (m *Manager) allowedRoots(prefs config.Preferences) ([]string, detectedSources) {
	np := prefs.Normalized()
	det := m.detect()
	var roots []string
	sharexOn := np.ShareXEnabled == nil || *np.ShareXEnabled
	shadowOn := np.ShadowPlayEnabled == nil || *np.ShadowPlayEnabled

	if sharexOn && det.shareXRoot != "" {
		roots = append(roots, det.shareXRoot)
	}
	if shadowOn {
		if det.shadowPlayRoot != "" {
			roots = append(roots, det.shadowPlayRoot)
		}
		if det.shadowPlayVideos != "" {
			roots = append(roots, det.shadowPlayVideos)
		}
	}
	for _, f := range np.CaptureFolders {
		if existingDir(f) {
			roots = append(roots, filepath.Clean(f))
		}
	}
	return roots, det
}

// ScanForGame finds ShareX, NVIDIA ShadowPlay, and custom folder captures matching target.
func (m *Manager) ScanForGame(
	ctx context.Context,
	prefs config.Preferences,
	target GameTarget,
	kindFilter string,
	sourceFilter string,
	limit int,
) ScanResult {
	np := prefs.Normalized()
	det := m.detect()
	sharexOn := np.ShareXEnabled == nil || *np.ShareXEnabled
	shadowOn := np.ShadowPlayEnabled == nil || *np.ShadowPlayEnabled

	if limit <= 0 {
		limit = defaultLimit
	} else if limit > maxLimit {
		limit = maxLimit
	}

	aliases := mergeUniqueAliases(target.Aliases, m.GetAliases(target.AppID))
	target.Aliases = aliases
	terms := buildGameTerms(target)

	resultsByPath := map[string]CaptureItem{}
	indexEntries := map[string]indexedCapture{}
	checked := SourcesChecked{}

	record := func(absPath, source, folderName, windowTitle, processName string, capturedAtOverride time.Time, sizeOverride int64) {
		cleanPath := filepath.Clean(absPath)
		cKey := canonicalKey(cleanPath)
		if _, exists := resultsByPath[cKey]; exists {
			return
		}
		kind, mime, ok := MediaInfoForExt(cleanPath)
		if !ok {
			return
		}
		if kindFilter != "" && kindFilter != "all" && kind != kindFilter {
			return
		}
		matchedBy, matched := matchCapture(terms, source, folderName, filepath.Base(cleanPath), windowTitle, processName)
		if !matched {
			return
		}

		fi, err := os.Stat(cleanPath)
		if err != nil || fi.IsDir() {
			return
		}
		capAt := capturedAtOverride
		if capAt.IsZero() {
			capAt = fi.ModTime()
		}
		sz := fi.Size()
		if sz == 0 && sizeOverride > 0 {
			sz = sizeOverride
		}

		id := captureID(cleanPath)
		resultsByPath[cKey] = CaptureItem{
			ID:          id,
			Source:      source,
			Kind:        kind,
			Filename:    filepath.Base(cleanPath),
			MimeType:    mime,
			SizeBytes:   sz,
			CapturedAt:  capAt,
			WindowTitle: windowTitle,
			ProcessName: processName,
			MatchedBy:   matchedBy,
		}
		indexEntries[id] = indexedCapture{
			absPath: cleanPath,
			source:  source,
			mime:    mime,
		}
	}

	// 1. ShareX History.db + Screenshots directory
	if sharexOn && (sourceFilter == "" || sourceFilter == "all" || sourceFilter == SourceShareX) {
		histList, histByPath := readShareXHistory(det.shareXHistoryDB, 2500)
		if det.shareXRoot != "" || len(histList) > 0 {
			checked.ShareX = true
		}
		for _, h := range histList {
			if ctx.Err() != nil {
				break
			}
			// Security guard: accept history entries only inside ShareX root (or directly matching existing ShareX screenshots path when root detected).
			if det.shareXRoot != "" && !withinRoot(det.shareXRoot, h.FilePath) {
				continue
			}
			folder := immediateSubfolderName(det.shareXRoot, h.FilePath)
			record(h.FilePath, SourceShareX, folder, h.WindowTitle, h.ProcessName, h.CapturedAt, 0)
		}
		if det.shareXRoot != "" {
			walkBounded(ctx, det.shareXRoot, maxWalkDepth, func(path string, d fs.DirEntry) {
				var wt, pn string
				var ts time.Time
				if h, ok := histByPath[canonicalKey(path)]; ok {
					wt, pn, ts = h.WindowTitle, h.ProcessName, h.CapturedAt
				}
				folder := immediateSubfolderName(det.shareXRoot, path)
				record(path, SourceShareX, folder, wt, pn, ts, 0)
			})
		}
	}

	// 2. NVIDIA ShadowPlay root + shallow game subfolders / files in Videos
	if shadowOn && (sourceFilter == "" || sourceFilter == "all" || sourceFilter == SourceShadowPlay) {
		if det.shadowPlayRoot != "" || det.shadowPlayVideos != "" {
			checked.ShadowPlay = true
		}
		if det.shadowPlayRoot != "" {
			walkBounded(ctx, det.shadowPlayRoot, maxWalkDepth, func(path string, d fs.DirEntry) {
				folder := immediateSubfolderName(det.shadowPlayRoot, path)
				record(path, SourceShadowPlay, folder, "", "", time.Time{}, 0)
			})
		}
		// Secondary trimmed clips saved directly to Videos\ or Videos\<Game>\ without traversing arbitrary trees.
		if det.shadowPlayVideos != "" && canonicalKey(det.shadowPlayVideos) != canonicalKey(det.shadowPlayRoot) {
			walkBounded(ctx, det.shadowPlayVideos, 2, func(path string, d fs.DirEntry) {
				if det.shadowPlayRoot != "" && withinRoot(det.shadowPlayRoot, path) {
					return
				}
				folder := immediateSubfolderName(det.shadowPlayVideos, path)
				record(path, SourceShadowPlay, folder, "", "", time.Time{}, 0)
			})
		}
	}

	// 3. User custom capture folders
	if sourceFilter == "" || sourceFilter == "all" || sourceFilter == SourceCustom {
		for _, folderRoot := range np.CaptureFolders {
			if ctx.Err() != nil {
				break
			}
			if !existingDir(folderRoot) {
				continue
			}
			checked.Custom++
			walkBounded(ctx, folderRoot, maxWalkDepth, func(path string, d fs.DirEntry) {
				sub := immediateSubfolderName(folderRoot, path)
				record(path, SourceCustom, sub, "", "", time.Time{}, 0)
			})
		}
	}

	m.mu.Lock()
	for id, entry := range indexEntries {
		m.index[id] = entry
	}
	m.mu.Unlock()

	items := make([]CaptureItem, 0, len(resultsByPath))
	for _, it := range resultsByPath {
		items = append(items, it)
	}
	sort.SliceStable(items, func(i, j int) bool {
		if !items[i].CapturedAt.Equal(items[j].CapturedAt) {
			return items[i].CapturedAt.After(items[j].CapturedAt)
		}
		return items[i].Filename < items[j].Filename
	})
	if len(items) > limit {
		items = items[:limit]
	}

	if aliases == nil {
		aliases = []string{}
	}
	return ScanResult{
		Items:          items,
		Aliases:        aliases,
		SourcesChecked: checked,
	}
}

// OpenCapture validates opaque captureID, verifies its file still resides under an
// enabled capture root without symlink escape, and opens it read-only for streaming.
func (m *Manager) OpenCapture(captureID string, prefs config.Preferences) (*os.File, os.FileInfo, string, string, error) {
	if !isHex32(captureID) {
		return nil, nil, "", "", errors.New("invalid capture id")
	}

	m.mu.RLock()
	entry, ok := m.index[strings.ToLower(captureID)]
	m.mu.RUnlock()
	if !ok {
		return nil, nil, "", "", os.ErrNotExist
	}

	roots, _ := m.allowedRoots(prefs)
	allowed := false
	resolvedFile, err := filepath.EvalSymlinks(entry.absPath)
	if err != nil {
		return nil, nil, "", "", err
	}
	for _, root := range roots {
		resolvedRoot, rErr := filepath.EvalSymlinks(root)
		if rErr != nil {
			resolvedRoot = root
		}
		if withinRoot(resolvedRoot, resolvedFile) {
			allowed = true
			break
		}
	}
	if !allowed {
		return nil, nil, "", "", os.ErrPermission
	}

	f, err := os.Open(resolvedFile)
	if err != nil {
		return nil, nil, "", "", err
	}
	fi, err := f.Stat()
	if err != nil || fi.IsDir() {
		f.Close()
		if err != nil {
			return nil, nil, "", "", err
		}
		return nil, nil, "", "", os.ErrInvalid
	}
	return f, fi, filepath.Base(resolvedFile), entry.mime, nil
}

func walkBounded(ctx context.Context, root string, maxDepth int, visit func(path string, d fs.DirEntry)) {
	cleanRoot := filepath.Clean(root)
	if !existingDir(cleanRoot) {
		return
	}
	count := 0
	_ = filepath.WalkDir(cleanRoot, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return nil
		}
		if ctx.Err() != nil {
			return filepath.SkipAll
		}
		rel, rErr := filepath.Rel(cleanRoot, path)
		if rErr != nil || rel == "." {
			return nil
		}
		depth := strings.Count(rel, string(filepath.Separator)) + 1
		if d.IsDir() {
			if depth > maxDepth {
				return filepath.SkipDir
			}
			return nil
		}
		count++
		if count > maxWalkEntries {
			return filepath.SkipAll
		}
		visit(path, d)
		return nil
	})
}

func immediateSubfolderName(root, filePath string) string {
	if root == "" {
		return ""
	}
	rel, err := filepath.Rel(filepath.Clean(root), filepath.Clean(filePath))
	if err != nil || rel == "." || strings.HasPrefix(rel, "..") {
		return ""
	}
	parts := strings.Split(filepath.ToSlash(rel), "/")
	if len(parts) < 2 {
		return ""
	}
	return parts[0]
}

func withinRoot(root, path string) bool {
	if root == "" || path == "" {
		return false
	}
	cRoot := filepath.Clean(root)
	cPath := filepath.Clean(path)
	if runtime.GOOS == "windows" {
		cRoot = strings.ToLower(cRoot)
		cPath = strings.ToLower(cPath)
	}
	rel, err := filepath.Rel(cRoot, cPath)
	if err != nil || rel == "." {
		return false
	}
	return !strings.HasPrefix(rel, "..")
}

func canonicalKey(p string) string {
	c := filepath.Clean(p)
	if runtime.GOOS == "windows" {
		return strings.ToLower(c)
	}
	return c
}

func captureID(absPath string) string {
	sum := sha256.Sum256([]byte("zapp-cap-v1|" + canonicalKey(absPath)))
	return hex.EncodeToString(sum[:16])
}

func isHex32(s string) bool {
	if len(s) != 32 {
		return false
	}
	for i := 0; i < len(s); i++ {
		c := s[i]
		isHex := (c >= '0' && c <= '9') || (c >= 'a' && c <= 'f') || (c >= 'A' && c <= 'F')
		if !isHex {
			return false
		}
	}
	return true
}

func mergeUniqueAliases(a, b []string) []string {
	seen := map[string]bool{}
	var out []string
	for _, slice := range [][]string{a, b} {
		for _, item := range slice {
			t := strings.TrimSpace(item)
			if t == "" {
				continue
			}
			k := strings.ToLower(t)
			if seen[k] {
				continue
			}
			seen[k] = true
			out = append(out, t)
		}
	}
	return out
}
