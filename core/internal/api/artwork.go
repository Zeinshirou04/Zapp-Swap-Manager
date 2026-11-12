package api

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/Zeinshirou04/Zapp-Swap-Manager/core/internal/steam"
)

const (
	artworkKindGrid   = "grid"
	artworkKindBanner = "banner"
	maxArtworkBytes   = 15 << 20 // 15 MiB limit for uploaded cover/banner artwork
	cachedPrefix      = "cached:"
)

type artworkOverride struct {
	CoverURL  *string `json:"cover_url,omitempty"`
	BannerURL *string `json:"banner_url,omitempty"`
}

// artworkStore manages cached uploaded artwork images and non-invasive per-game
// Grid Cover / Hero Banner overrides under a single directory owned by core.
type artworkStore struct {
	dir string
	mu  sync.RWMutex
}

func newArtworkStore(dir string) *artworkStore {
	if strings.TrimSpace(dir) == "" {
		dir = filepath.Join(os.TempDir(), "zapp-artwork-cache")
	}
	return &artworkStore{dir: dir}
}

func isValidAppID(appID string) bool {
	if appID == "" {
		return false
	}
	for i := 0; i < len(appID); i++ {
		if appID[i] < '0' || appID[i] > '9' {
			return false
		}
	}
	return true
}

func isValidKind(kind string) bool {
	return kind == artworkKindGrid || kind == artworkKindBanner
}

func validateArtworkURLInput(raw string) error {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return nil // Empty clears override back to default
	}
	lower := strings.ToLower(trimmed)
	if !strings.HasPrefix(lower, "http://") && !strings.HasPrefix(lower, "https://") {
		return errors.New("artwork URL must start with http:// or https:// (use POST /games/{app_id}/artwork to upload local images)")
	}
	u, err := url.ParseRequestURI(trimmed)
	if err != nil || u.Host == "" {
		return errors.New("invalid http(s) artwork URL")
	}
	return nil
}

func extForArtworkBytes(data []byte) (string, bool) {
	if len(data) == 0 {
		return "", false
	}
	sniff := data
	if len(sniff) > 512 {
		sniff = sniff[:512]
	}
	switch http.DetectContentType(sniff) {
	case "image/png":
		return ".png", true
	case "image/jpeg":
		return ".jpg", true
	case "image/webp":
		return ".webp", true
	case "image/gif":
		return ".gif", true
	default:
		return "", false
	}
}

func (s *artworkStore) indexPath() string {
	return filepath.Join(s.dir, "overrides.json")
}

func (s *artworkStore) loadLocked() (map[string]artworkOverride, error) {
	out := map[string]artworkOverride{}
	data, err := os.ReadFile(s.indexPath())
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

func (s *artworkStore) saveLocked(m map[string]artworkOverride) error {
	if err := os.MkdirAll(s.dir, 0o755); err != nil {
		return err
	}
	data, err := json.MarshalIndent(m, "", "  ")
	if err != nil {
		return err
	}
	tmp := s.indexPath() + ".tmp"
	if err := os.WriteFile(tmp, data, 0o644); err != nil {
		return err
	}
	return os.Rename(tmp, s.indexPath())
}

func (s *artworkStore) removeCachedLocked(appID, kind string) {
	prefix := appID + "-" + kind + "."
	entries, err := os.ReadDir(s.dir)
	if err != nil {
		return
	}
	for _, entry := range entries {
		if !entry.IsDir() && strings.HasPrefix(entry.Name(), prefix) {
			_ = os.Remove(filepath.Join(s.dir, entry.Name()))
		}
	}
}

// SaveUpload writes an uploaded image buffer to the artwork cache and updates the
// corresponding Grid or Banner override for appID with a cache-busting token.
func (s *artworkStore) SaveUpload(appID, kind string, data []byte) (string, error) {
	if !isValidAppID(appID) {
		return "", errors.New("invalid app_id")
	}
	if !isValidKind(kind) {
		return "", errors.New("kind must be 'grid' or 'banner'")
	}
	if len(data) == 0 {
		return "", errors.New("uploaded artwork file is empty")
	}
	if len(data) > maxArtworkBytes {
		return "", fmt.Errorf("artwork upload exceeds %d bytes limit", maxArtworkBytes)
	}
	ext, ok := extForArtworkBytes(data)
	if !ok {
		return "", errors.New("unsupported image format; upload PNG, JPEG, WebP, or GIF")
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	if err := os.MkdirAll(s.dir, 0o755); err != nil {
		return "", err
	}
	s.removeCachedLocked(appID, kind)

	dst := filepath.Join(s.dir, appID+"-"+kind+ext)
	if err := os.WriteFile(dst, data, 0o644); err != nil {
		return "", err
	}

	m, err := s.loadLocked()
	if err != nil {
		return "", err
	}
	ov := m[appID]
	ref := fmt.Sprintf("%s%s:%d", cachedPrefix, kind, time.Now().UnixNano())
	if kind == artworkKindGrid {
		ov.CoverURL = &ref
	} else {
		ov.BannerURL = &ref
	}
	m[appID] = ov
	if err := s.saveLocked(m); err != nil {
		return "", err
	}
	return ref, nil
}

// SetURLs updates or clears Grid Cover and/or Hero Banner overrides for appID.
func (s *artworkStore) SetURLs(appID string, coverURL, bannerURL *string) error {
	if !isValidAppID(appID) {
		return errors.New("invalid app_id")
	}
	if coverURL != nil {
		if err := validateArtworkURLInput(*coverURL); err != nil {
			return err
		}
	}
	if bannerURL != nil {
		if err := validateArtworkURLInput(*bannerURL); err != nil {
			return err
		}
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	m, err := s.loadLocked()
	if err != nil {
		return err
	}
	ov := m[appID]
	if coverURL != nil {
		trimmed := strings.TrimSpace(*coverURL)
		s.removeCachedLocked(appID, artworkKindGrid)
		ov.CoverURL = &trimmed
	}
	if bannerURL != nil {
		trimmed := strings.TrimSpace(*bannerURL)
		s.removeCachedLocked(appID, artworkKindBanner)
		ov.BannerURL = &trimmed
	}
	m[appID] = ov
	return s.saveLocked(m)
}

// ClearOverrideFields drops cached overrides for the provided fields (used when
// PUT /custom-games/{app_id} directly edits zappmanifest.json).
func (s *artworkStore) ClearOverrideFields(appID string, clearGrid, clearBanner bool) {
	if !isValidAppID(appID) || (!clearGrid && !clearBanner) {
		return
	}
	s.mu.Lock()
	defer s.mu.Unlock()

	m, err := s.loadLocked()
	if err != nil {
		return
	}
	ov, ok := m[appID]
	if clearGrid {
		s.removeCachedLocked(appID, artworkKindGrid)
		ov.CoverURL = nil
	}
	if clearBanner {
		s.removeCachedLocked(appID, artworkKindBanner)
		ov.BannerURL = nil
	}
	if ok {
		if ov.CoverURL == nil && ov.BannerURL == nil {
			delete(m, appID)
		} else {
			m[appID] = ov
		}
		_ = s.saveLocked(m)
	}
}

// Apply overlays any stored artwork overrides onto scanned games in place.
func (s *artworkStore) Apply(games []steam.Game) {
	if s == nil {
		return
	}
	s.mu.RLock()
	defer s.mu.RUnlock()

	m, err := s.loadLocked()
	if err != nil || len(m) == 0 {
		return
	}
	for i := range games {
		ov, ok := m[games[i].Manifest.AppID]
		if !ok {
			continue
		}
		if ov.CoverURL != nil {
			games[i].CoverURL = *ov.CoverURL
		}
		if ov.BannerURL != nil {
			games[i].BannerURL = *ov.BannerURL
		}
	}
}

// FindCachedFile locates the cached raster image for (appID, kind) if present.
func (s *artworkStore) FindCachedFile(appID, kind string) (string, bool) {
	if s == nil || !isValidAppID(appID) || !isValidKind(kind) {
		return "", false
	}
	s.mu.RLock()
	defer s.mu.RUnlock()

	prefix := appID + "-" + kind + "."
	entries, err := os.ReadDir(s.dir)
	if err != nil {
		return "", false
	}
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasPrefix(entry.Name(), prefix) {
			continue
		}
		ext := strings.ToLower(filepath.Ext(entry.Name()))
		switch ext {
		case ".png", ".jpg", ".webp", ".gif":
			return filepath.Join(s.dir, entry.Name()), true
		}
	}
	return "", false
}

func (h handlers) findGame(appID string) (*steam.Game, error) {
	games, err := h.scanGames()
	if err != nil && len(games) == 0 {
		return nil, err
	}
	for i := range games {
		gID := games[i].Manifest.AppID
		gAppID, _ := strconv.ParseInt(gID, 10, 64)
		if gID == appID || fmt.Sprint(gAppID) == appID || strings.EqualFold(games[i].Manifest.InstallDir, appID) || steam.CustomAppID(games[i].Manifest.InstallDir) == appID {
			return &games[i], nil
		}
	}
	return nil, nil
}

func serveLocalImageFile(w http.ResponseWriter, r *http.Request, localPath string) {
	f, err := os.Open(localPath)
	if err != nil {
		writeError(w, http.StatusNotFound, "cover_file_missing", fmt.Sprintf("local cover file not found: %s", err))
		return
	}
	defer f.Close()

	fi, err := f.Stat()
	if err != nil || fi.IsDir() {
		writeError(w, http.StatusNotFound, "cover_file_invalid", "cover path is not a file")
		return
	}

	ext := strings.ToLower(filepath.Ext(localPath))
	var cType string
	switch ext {
	case ".png":
		cType = "image/png"
	case ".jpg", ".jpeg":
		cType = "image/jpeg"
	case ".webp":
		cType = "image/webp"
	case ".gif":
		cType = "image/gif"
	case ".svg":
		cType = "image/svg+xml"
	case ".ico":
		cType = "image/x-icon"
	default:
		cType = "application/octet-stream"
	}

	w.Header().Set("Content-Type", cType)
	w.Header().Set("Cache-Control", "private, max-age=86400")
	http.ServeContent(w, r, filepath.Base(localPath), fi.ModTime(), f)
}

func (h handlers) serveGameArtwork(w http.ResponseWriter, r *http.Request, kind string) {
	appID := r.PathValue("app_id")
	foundGame, err := h.findGame(appID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "scan_failed", err.Error())
		return
	}
	if foundGame == nil {
		writeError(w, http.StatusNotFound, "game_not_found", "game not found")
		return
	}

	rawURL := strings.TrimSpace(foundGame.CoverURL)
	if kind == artworkKindBanner {
		rawURL = strings.TrimSpace(foundGame.BannerURL)
	}

	if strings.HasPrefix(rawURL, cachedPrefix) {
		if cachedPath, ok := h.artworkStore().FindCachedFile(foundGame.Manifest.AppID, kind); ok {
			serveLocalImageFile(w, r, cachedPath)
			return
		}
		rawURL = ""
	}

	if rawURL == "" {
		if !foundGame.IsCustom {
			asset := "header.jpg"
			if kind == artworkKindBanner {
				asset = "library_hero.jpg"
			}
			http.Redirect(w, r, fmt.Sprintf("https://cdn.cloudflare.steamstatic.com/steam/apps/%s/%s", foundGame.Manifest.AppID, asset), http.StatusFound)
			return
		}
		writeError(w, http.StatusNotFound, "no_artwork", "no "+kind+" image configured for this game")
		return
	}

	if strings.HasPrefix(rawURL, "http://") || strings.HasPrefix(rawURL, "https://") {
		http.Redirect(w, r, rawURL, http.StatusFound)
		return
	}

	// Legacy relative/local path stored in zappmanifest.json
	localPath := rawURL
	if !filepath.IsAbs(localPath) {
		libs := h.libs()
		for _, l := range libs {
			if l.ID == foundGame.LibraryID {
				p1 := filepath.Join(l.Path, "steamapps", "common", filepath.FromSlash(foundGame.Manifest.InstallDir), localPath)
				if fi, statErr := os.Stat(p1); statErr == nil && !fi.IsDir() {
					localPath = p1
					break
				}
				p2 := filepath.Join(l.Path, filepath.FromSlash(foundGame.Manifest.InstallDir), localPath)
				if fi, statErr := os.Stat(p2); statErr == nil && !fi.IsDir() {
					localPath = p2
					break
				}
			}
		}
	}

	serveLocalImageFile(w, r, localPath)
}

type updateArtworkRequest struct {
	CoverURL  *string `json:"cover_url"`
	BannerURL *string `json:"banner_url"`
}

func isHTTPURLOrEmpty(raw string) bool {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return true
	}
	lower := strings.ToLower(trimmed)
	return strings.HasPrefix(lower, "http://") || strings.HasPrefix(lower, "https://")
}

// updateGameArtwork: PUT /games/{app_id}/artwork
func (h handlers) updateGameArtwork(w http.ResponseWriter, r *http.Request) {
	appID := r.PathValue("app_id")
	foundGame, err := h.findGame(appID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "scan_failed", err.Error())
		return
	}
	if foundGame == nil {
		writeError(w, http.StatusNotFound, "game_not_found", "game not found")
		return
	}

	dec := json.NewDecoder(r.Body)
	dec.DisallowUnknownFields()
	var req updateArtworkRequest
	if err := dec.Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_request", err.Error())
		return
	}
	if req.CoverURL == nil && req.BannerURL == nil {
		writeError(w, http.StatusBadRequest, "invalid_request", "provide cover_url or banner_url")
		return
	}
	if req.CoverURL != nil && !isHTTPURLOrEmpty(*req.CoverURL) {
		writeError(w, http.StatusBadRequest, "raw_path_rejected", "filesystem paths are not accepted; use POST /games/{app_id}/artwork to upload local images")
		return
	}
	if req.BannerURL != nil && !isHTTPURLOrEmpty(*req.BannerURL) {
		writeError(w, http.StatusBadRequest, "raw_path_rejected", "filesystem paths are not accepted; use POST /games/{app_id}/artwork to upload local images")
		return
	}

	if err := h.artworkStore().SetURLs(foundGame.Manifest.AppID, req.CoverURL, req.BannerURL); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_artwork_url", err.Error())
		return
	}

	updated, err := h.findGame(foundGame.Manifest.AppID)
	if err != nil || updated == nil {
		writeError(w, http.StatusInternalServerError, "scan_failed", "failed to reload updated game")
		return
	}
	writeJSON(w, http.StatusOK, toGameJSON(*updated))
}

// uploadGameArtwork: POST /games/{app_id}/artwork (multipart form: kind=grid|banner, file=binary)
func (h handlers) uploadGameArtwork(w http.ResponseWriter, r *http.Request) {
	appID := r.PathValue("app_id")
	foundGame, err := h.findGame(appID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "scan_failed", err.Error())
		return
	}
	if foundGame == nil {
		writeError(w, http.StatusNotFound, "game_not_found", "game not found")
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, maxArtworkBytes+(1<<20))
	if err := r.ParseMultipartForm(maxArtworkBytes); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_upload", "failed to parse multipart image upload: "+err.Error())
		return
	}

	kind := strings.TrimSpace(r.FormValue("kind"))
	if kind == "" {
		kind = strings.TrimSpace(r.URL.Query().Get("kind"))
	}
	if !isValidKind(kind) {
		writeError(w, http.StatusBadRequest, "invalid_request", "kind must be 'grid' or 'banner'")
		return
	}

	f, _, err := r.FormFile("file")
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid_upload", "missing image file field: "+err.Error())
		return
	}
	defer f.Close()

	data, err := io.ReadAll(io.LimitReader(f, maxArtworkBytes+1))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid_upload", "failed reading uploaded file: "+err.Error())
		return
	}
	if len(data) > maxArtworkBytes {
		writeError(w, http.StatusRequestEntityTooLarge, "file_too_large", fmt.Sprintf("artwork upload exceeds %d MiB limit", maxArtworkBytes/(1<<20)))
		return
	}

	if _, err := h.artworkStore().SaveUpload(foundGame.Manifest.AppID, kind, data); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_image", err.Error())
		return
	}

	updated, err := h.findGame(foundGame.Manifest.AppID)
	if err != nil || updated == nil {
		writeError(w, http.StatusInternalServerError, "scan_failed", "failed to reload updated game")
		return
	}
	writeJSON(w, http.StatusOK, toGameJSON(*updated))
}
