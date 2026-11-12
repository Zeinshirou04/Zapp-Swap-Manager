package api

import (
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/Zeinshirou04/Zapp-Swap-Manager/core/internal/config"
	"github.com/Zeinshirou04/Zapp-Swap-Manager/core/internal/queue"
	"github.com/Zeinshirou04/Zapp-Swap-Manager/core/internal/steam"
)

type handlers struct {
	cfg     Config
	start   time.Time
	artwork *artworkStore
}

func (h handlers) artworkStore() *artworkStore {
	if h.artwork != nil {
		return h.artwork
	}
	return newArtworkStore(h.cfg.ArtworkDir)
}

// health: uptime, version, Steam process state (backup-skip guard probe).
func (h handlers) health(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{
		"uptime_seconds": int64(time.Since(h.start).Seconds()),
		"version":        h.cfg.Version,
		"steam_running":  steam.SteamRunning(),
	})
}

// logs: returns recent log lines captured in the service.
func (h handlers) logs(w http.ResponseWriter, r *http.Request) {
	limit := 200
	if l := r.URL.Query().Get("limit"); l != "" {
		if n, err := strconv.Atoi(l); err == nil && n > 0 {
			limit = n
			if limit > 1000 {
				limit = 1000
			}
		}
	}
	var lines []string
	if h.cfg.LogsFn != nil {
		lines = h.cfg.LogsFn(limit)
	}
	if lines == nil {
		lines = []string{}
	}
	writeJSON(w, http.StatusOK, map[string]any{"lines": lines})
}

// libs reports the live whitelist: the injected LibrariesFn when set, otherwise
// the static config list.
func (h handlers) libs() []steam.Library {
	if h.cfg.LibrariesFn != nil {
		return h.cfg.LibrariesFn()
	}
	return h.cfg.Libraries
}

// libraryJSON mirrors the Library schema in api/openapi.yaml.
type libraryJSON struct {
	ID         string `json:"id"`
	Name       string `json:"name"`
	Type       string `json:"type"`
	Path       string `json:"path"`
	FreeBytes  int64  `json:"free_bytes"`
	TotalBytes int64  `json:"total_bytes"`
}

func toLibraryJSON(l steam.Library) libraryJSON {
	return libraryJSON{
		ID:         l.ID,
		Name:       l.Name,
		Type:       l.Type,
		Path:       l.Path,
		FreeBytes:  l.FreeBytes,
		TotalBytes: l.TotalBytes,
	}
}

func toLibrariesJSON(libs []steam.Library) []libraryJSON {
	out := make([]libraryJSON, len(libs))
	for i, l := range libs {
		out[i] = toLibraryJSON(l)
	}
	return out
}

// libraries: the whitelist with freshly scanned disk metrics.
func (h handlers) libraries(w http.ResponseWriter, _ *http.Request) {
	libs := h.libs()
	dst := make([]steam.Library, len(libs))
	copy(dst, libs)

	for i := range dst {
		if err := dst[i].RefreshDiskSpace(); err != nil {
			writeError(w, http.StatusInternalServerError, "disk_space", err.Error())
			return
		}
	}
	writeJSON(w, http.StatusOK, toLibrariesJSON(dst))
}

// detectedLibraries: GET /libraries/detected — Steam installation
// auto-discovery (Plan 017). Read-only: nothing here enters the whitelist.
func (h handlers) detectedLibraries(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, steam.DetectLibraries())
}

// libraryInput is one POST /libraries body item.
type libraryInput struct {
	ID   string `json:"id"`
	Type string `json:"type"`
	Path string `json:"path"`
}

// registerLibraries: POST /libraries — replaces the whitelist. Every path is
// validated server-side (absolute existing directory, never a filesystem
// root) before it may enter the whitelist; jobs keep referring to libraries
// by ID only (docs/safety.md "API input").
func (h handlers) registerLibraries(w http.ResponseWriter, r *http.Request) {
	dec := json.NewDecoder(r.Body)
	dec.DisallowUnknownFields()
	var inputs []libraryInput
	if err := dec.Decode(&inputs); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_request", "body must be an array of {id?, type, path}: "+err.Error())
		return
	}
	if h.cfg.SetLibraries == nil {
		writeError(w, http.StatusNotImplemented, "not_supported", "this server was not configured to accept library registration")
		return
	}
	merged := make([]steam.Library, 0, len(inputs))
	for _, in := range inputs {
		path, err := steam.ValidateLibraryPath(in.Path)
		if err != nil {
			writeError(w, http.StatusBadRequest, "invalid_library", err.Error())
			return
		}
		if in.Type != steam.TypeSSDCache && in.Type != steam.TypeHDDMaster {
			writeError(w, http.StatusBadRequest, "invalid_library", "library type must be "+steam.TypeSSDCache+" or "+steam.TypeHDDMaster)
			return
		}
		id := in.ID
		if id == "" {
			id = steam.LibraryIDForPath(path)
		}
		if pathLike(id) {
			writeError(w, http.StatusBadRequest, "invalid_library", "library id must be a bare identifier")
			return
		}
		vol := filepath.VolumeName(path)
		var name string
		isSteam := strings.Contains(strings.ToLower(path), "steam")
		base := "Steam Library"
		if !isSteam {
			base = "Games Library"
		}
		if vol != "" {
			name = fmt.Sprintf("%s (%s Drive)", base, strings.ToUpper(vol))
		} else {
			name = filepath.Base(path)
		}
		merged = append(merged, steam.Library{ID: id, Name: name, Path: path, Type: in.Type})
	}
	for i := range merged {
		_ = merged[i].RefreshDiskSpace()
	}
	if err := h.cfg.SetLibraries(merged); err != nil {
		writeError(w, http.StatusInternalServerError, "persist_failed", err.Error())
		return
	}
	writeJSON(w, http.StatusOK, toLibrariesJSON(merged))
}

// gameJSON mirrors the Game schema in api/openapi.yaml.
type gameJSON struct {
	AppID            int64      `json:"app_id"`
	Name             string     `json:"name"`
	InstallDir       string     `json:"install_dir"`
	SizeBytes        int64      `json:"size_bytes"`
	State            string     `json:"state"`
	CurrentLibraryID string     `json:"current_library_id"`
	BuildID          string     `json:"build_id"`
	LastBackupTime   *time.Time `json:"last_backup_time"`
	LastPlayed       *time.Time `json:"last_played,omitempty"`
	BackupClean      bool       `json:"backup_clean"`
	IsCustom         bool       `json:"is_custom"`
	CoverURL         string     `json:"cover_url,omitempty"`
	BannerURL        string     `json:"banner_url,omitempty"`
	SwapEnabled      bool       `json:"swap_enabled"`
	HasHDDBackup     bool       `json:"has_hdd_backup"`
	IsNativeHDD      bool       `json:"is_native_hdd"`
	Tags             []string   `json:"tags,omitempty"`
}

func toGameJSON(g steam.Game) gameJSON {
	appID, _ := strconv.ParseInt(g.Manifest.AppID, 10, 64)
	return gameJSON{
		AppID:            appID,
		Name:             g.Manifest.Name,
		InstallDir:       g.Manifest.InstallDir,
		SizeBytes:        g.Manifest.SizeOnDisk,
		State:            g.State,
		CurrentLibraryID: g.LibraryID,
		BuildID:          g.Manifest.BuildID,
		LastPlayed:       g.LastPlayed,
		BackupClean:      false, // honest default until backup metrics are journaled
		IsCustom:         g.IsCustom,
		CoverURL:         g.CoverURL,
		BannerURL:        g.BannerURL,
		SwapEnabled:      g.SwapEnabled,
		HasHDDBackup:     g.HasHDDBackup,
		IsNativeHDD:      g.IsNativeHDD,
		Tags:             g.Tags,
	}
}

func (h handlers) scanGames() ([]steam.Game, error) {
	games, err := steam.ScanLibraries(h.libs())
	h.artworkStore().Apply(games)
	return games, err
}

// listGames: GET /games?state=&library_id=
func (h handlers) listGames(w http.ResponseWriter, r *http.Request) {
	games, err := h.scanGames()
	if err != nil {
		if len(games) == 0 {
			writeError(w, http.StatusInternalServerError, "scan_failed", err.Error())
			return
		}
		slog.Warn("games scan had non-fatal warnings", "err", err)
	}
	state, libID := r.URL.Query().Get("state"), r.URL.Query().Get("library_id")
	out := make([]gameJSON, 0, len(games))
	for _, g := range games {
		if state != "" && g.State != state {
			continue
		}
		if libID != "" && g.LibraryID != libID {
			continue
		}
		out = append(out, toGameJSON(g))
	}
	writeJSON(w, http.StatusOK, out)
}

// getGame: GET /games/{app_id}
func (h handlers) getGame(w http.ResponseWriter, r *http.Request) {
	appID := r.PathValue("app_id")
	games, err := h.scanGames()
	if err != nil {
		if len(games) == 0 {
			writeError(w, http.StatusInternalServerError, "scan_failed", err.Error())
			return
		}
		slog.Warn("game scan had non-fatal warnings", "err", err)
	}
	for _, g := range games {
		if g.Manifest.AppID == appID {
			writeJSON(w, http.StatusOK, toGameJSON(g))
			return
		}
	}
	writeError(w, http.StatusNotFound, "not_found", "no game with app ID "+appID+" in any registered library")
}

// createJob: POST /jobs. Strict safety guard: only type/app_id/
// target_library_id decode; anything path-like is rejected 400
// (raw_path_rejected); same-game conflicts answer 409.
func (h handlers) createJob(w http.ResponseWriter, r *http.Request) {
	dec := json.NewDecoder(r.Body)
	dec.DisallowUnknownFields()
	var req queue.CreateJobRequest
	if err := dec.Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "raw_path_rejected", "only job type, app_id and target_library_id are accepted: "+err.Error())
		return
	}
	if pathLike(req.Type) || pathLike(req.AppID) || pathLike(req.TargetLibraryID) {
		writeError(w, http.StatusBadRequest, "raw_path_rejected", "filesystem paths are not accepted; build locations server-side from whitelisted library IDs")
		return
	}
	job, err := h.cfg.Queue.Enqueue(req)
	switch {
	case errors.Is(err, queue.ErrConflict):
		writeError(w, http.StatusConflict, "conflict", err.Error())
	case err != nil:
		writeError(w, http.StatusBadRequest, "invalid_request", err.Error())
	default:
		writeJSON(w, http.StatusAccepted, job)
	}
}

// listJobs: GET /jobs?status=
func (h handlers) listJobs(w http.ResponseWriter, r *http.Request) {
	jobs, err := h.cfg.Queue.ListJobs(r.URL.Query().Get("status"))
	if err != nil {
		writeError(w, http.StatusInternalServerError, "query_failed", err.Error())
		return
	}
	out := make([]queue.Job, 0, len(jobs))
	out = append(out, jobs...)
	writeJSON(w, http.StatusOK, out)
}

// stepJSON matches the Job.steps items in api/openapi.yaml.
type stepJSON struct {
	At      string `json:"at"`
	Message string `json:"message"`
}

// getJob: GET /jobs/{job_id} — status, progress, and step logs.
func (h handlers) getJob(w http.ResponseWriter, r *http.Request) {
	job, err := h.cfg.Queue.GetJob(r.PathValue("job_id"))
	if err != nil {
		writeError(w, http.StatusNotFound, "not_found", err.Error())
		return
	}
	steps, err := h.cfg.Queue.Steps(job.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "query_failed", err.Error())
		return
	}
	logs := make([]stepJSON, 0, len(steps))
	for _, sj := range steps {
		entry := stepJSON{At: sj.RecordedAt.Format(time.RFC3339), Message: fmt.Sprintf("step %d %q %s", sj.StepIndex, sj.StepName, sj.Status)}
		if sj.Details != nil {
			entry.Message += ": " + *sj.Details
		}
		logs = append(logs, entry)
	}
	writeJSON(w, http.StatusOK, struct {
		queue.Job
		Steps []stepJSON `json:"steps"`
	}{job, logs})
}

// cancelJob: POST /jobs/{job_id}/cancel.
func (h handlers) cancelJob(w http.ResponseWriter, r *http.Request) {
	err := h.cfg.Queue.CancelJob(r.PathValue("job_id"))
	switch {
	case err == nil:
		writeJSON(w, http.StatusAccepted, map[string]string{"status": "cancel accepted"})
	case strings.Contains(err.Error(), "cannot cancel"):
		writeError(w, http.StatusConflict, "conflict", err.Error())
	default:
		writeError(w, http.StatusNotFound, "not_found", err.Error())
	}
}

// findGame resolves one app ID across the whitelist (fresh scan for current
// truth; never filesystem-state guessing — manifests are the source).
func findGame(libs []steam.Library, appID string) (steam.Game, error) {
	games, err := steam.ScanLibraries(libs)
	if err != nil {
		return steam.Game{}, fmt.Errorf("scan libraries: %w", err)
	}
	for _, g := range games {
		if g.Manifest.AppID == appID {
			return g, nil
		}
	}
	return steam.Game{}, fmt.Errorf("game %s not found in any whitelisted library", appID)
}

// pathLike detects filesystem-path-shaped values at the trust boundary
// (docs/safety.md "API input"). Separators, drive letters, traversal
// fragments, and whitespace are all suspect; bare IDs are safe.
func pathLike(s string) bool {
	return strings.ContainsAny(s, `\/: `) ||
		strings.HasPrefix(s, ".") ||
		strings.Contains(s, "..")
}

// getPreferences: GET /preferences
func (h handlers) getPreferences(w http.ResponseWriter, _ *http.Request) {
	if h.cfg.PreferencesFn != nil {
		writeJSON(w, http.StatusOK, h.cfg.PreferencesFn().Normalized())
		return
	}
	writeJSON(w, http.StatusOK, h.cfg.Preferences.Normalized())
}

// updatePreferences: PUT /preferences
func (h handlers) updatePreferences(w http.ResponseWriter, r *http.Request) {
	var p config.Preferences
	if h.cfg.PreferencesFn != nil {
		p = h.cfg.PreferencesFn().Normalized()
	} else {
		p = h.cfg.Preferences.Normalized()
	}
	if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_body", err.Error())
		return
	}
	p = p.Normalized()
	if h.cfg.SetPreferences != nil {
		if err := h.cfg.SetPreferences(p); err != nil {
			writeError(w, http.StatusInternalServerError, "persist_failed", err.Error())
			return
		}
	}
	writeJSON(w, http.StatusOK, p)
}

type createCustomGameInput struct {
	Name        string   `json:"name"`
	LibraryID   string   `json:"library_id"`
	InstallDir  string   `json:"install_dir"`
	CoverURL    string   `json:"cover_url,omitempty"`
	BannerURL   string   `json:"banner_url,omitempty"`
	SwapEnabled *bool    `json:"swap_enabled,omitempty"`
	IsNativeHDD *bool    `json:"is_native_hdd,omitempty"`
	Tags        []string `json:"tags,omitempty"`
}

// createCustomGame: POST /custom-games
func (h handlers) createCustomGame(w http.ResponseWriter, r *http.Request) {
	var in createCustomGameInput
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_body", err.Error())
		return
	}
	rawInstallDir := strings.TrimSpace(in.InstallDir)
	if rawInstallDir == "" {
		writeError(w, http.StatusBadRequest, "invalid_install_dir", "install_dir cannot be empty")
		return
	}
	if filepath.IsAbs(rawInstallDir) || strings.Contains(rawInstallDir, ":") || strings.Contains(rawInstallDir, "..") {
		writeError(w, http.StatusBadRequest, "invalid_install_dir", "install_dir must be a safe relative path without traversal")
		return
	}
	cleanedInstallDir := filepath.Clean(filepath.FromSlash(rawInstallDir))
	if cleanedInstallDir == "." || strings.HasPrefix(cleanedInstallDir, "..") {
		writeError(w, http.StatusBadRequest, "invalid_install_dir", "install_dir must be a valid directory path")
		return
	}
	in.InstallDir = filepath.ToSlash(cleanedInstallDir)

	libs := h.libs()
	var targetLib *steam.Library
	for i := range libs {
		if libs[i].ID == in.LibraryID {
			targetLib = &libs[i]
			break
		}
	}
	if targetLib == nil {
		writeError(w, http.StatusBadRequest, "invalid_library", "library not found in whitelist")
		return
	}

	commonDir := filepath.Join(targetLib.Path, "steamapps", "common")
	var gameDir string
	if fi, err := os.Stat(commonDir); err == nil && fi.IsDir() {
		gameDir = filepath.Join(commonDir, filepath.FromSlash(in.InstallDir))
	} else {
		gameDir = filepath.Join(targetLib.Path, filepath.FromSlash(in.InstallDir))
	}
	// Create folder if not yet existing (including intermediate parent directories)
	if err := os.MkdirAll(gameDir, 0755); err != nil {
		writeError(w, http.StatusInternalServerError, "mkdir_failed", err.Error())
		return
	}

	swapEnabled := true
	if in.SwapEnabled != nil {
		swapEnabled = *in.SwapEnabled
	}
	isNativeHDD := false
	if in.IsNativeHDD != nil {
		isNativeHDD = *in.IsNativeHDD
	}

	name := in.Name
	if name == "" {
		name = in.InstallDir
	}

	zm := steam.ZappManifest{
		ID:          strings.ToLower(strings.ReplaceAll(in.InstallDir, " ", "-")),
		Name:        name,
		InstallDir:  in.InstallDir,
		CoverURL:    in.CoverURL,
		BannerURL:   in.BannerURL,
		SwapEnabled: swapEnabled,
		IsNativeHDD: isNativeHDD,
		Tags:        in.Tags,
	}

	if err := steam.WriteZappManifest(gameDir, zm); err != nil {
		writeError(w, http.StatusInternalServerError, "write_manifest_failed", err.Error())
		return
	}

	// Rescan and return the created game
	games, err := h.scanGames()
	if err == nil {
		for _, g := range games {
			if strings.EqualFold(g.Manifest.InstallDir, in.InstallDir) {
				writeJSON(w, http.StatusCreated, toGameJSON(g))
				return
			}
		}
	}

	appID, _ := strconv.ParseInt(steam.CustomAppID(in.InstallDir), 10, 64)
	writeJSON(w, http.StatusCreated, gameJSON{
		AppID:            appID,
		Name:             name,
		InstallDir:       in.InstallDir,
		State:            targetLib.Type,
		CurrentLibraryID: targetLib.ID,
		IsCustom:         true,
		CoverURL:         in.CoverURL,
		BannerURL:        in.BannerURL,
		SwapEnabled:      swapEnabled,
		IsNativeHDD:      isNativeHDD,
		Tags:             in.Tags,
	})
}

type updateCustomGameInput struct {
	Name        string   `json:"name"`
	CoverURL    *string  `json:"cover_url,omitempty"`
	BannerURL   *string  `json:"banner_url,omitempty"`
	InstallDir  string   `json:"install_dir,omitempty"`
	LibraryID   string   `json:"library_id,omitempty"`
	SwapEnabled *bool    `json:"swap_enabled,omitempty"`
	IsNativeHDD *bool    `json:"is_native_hdd,omitempty"`
	Tags        []string `json:"tags,omitempty"`
}

// updateCustomGame: PUT /custom-games/{app_id}
func (h handlers) updateCustomGame(w http.ResponseWriter, r *http.Request) {
	appID := r.PathValue("app_id")
	var in updateCustomGameInput
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_body", err.Error())
		return
	}

	games, err := h.scanGames()
	if err != nil && len(games) == 0 {
		writeError(w, http.StatusInternalServerError, "scan_failed", err.Error())
		return
	}

	var foundGame *steam.Game
	for i := range games {
		gID := games[i].Manifest.AppID
		gAppID, _ := strconv.ParseInt(gID, 10, 64)
		if gID == appID || fmt.Sprint(gAppID) == appID || strings.EqualFold(games[i].Manifest.InstallDir, appID) || steam.CustomAppID(games[i].Manifest.InstallDir) == appID {
			foundGame = &games[i]
			break
		}
	}
	if foundGame == nil {
		writeError(w, http.StatusNotFound, "not_found", "game not found")
		return
	}

	// Refuse metadata/zappmanifest.json mutations while a transfer job is active for
	// this app_id so Step 2 (VerifyMatch) cannot observe a mid-copy source byte delta.
	if h.cfg.Queue != nil {
		if active, aErr := h.cfg.Queue.HasActiveJob(foundGame.Manifest.AppID); aErr != nil {
			writeError(w, http.StatusInternalServerError, "queue_check_failed", aErr.Error())
			return
		} else if active {
			writeError(w, http.StatusConflict, "job_active", "cannot modify game metadata while a transfer job is queued or running for this game")
			return
		}
	}

	// Locate game directory in its library
	libs := h.libs()
	var gameDir string
	for _, l := range libs {
		if l.ID == foundGame.LibraryID {
			p1 := filepath.Join(l.Path, "steamapps", "common", filepath.FromSlash(foundGame.Manifest.InstallDir))
			if _, err := os.Stat(p1); err == nil {
				gameDir = p1
				break
			}
			p2 := filepath.Join(l.Path, filepath.FromSlash(foundGame.Manifest.InstallDir))
			if _, err := os.Stat(p2); err == nil {
				gameDir = p2
				break
			}
		}
	}

	targetLibID := foundGame.LibraryID
	if in.LibraryID != "" {
		targetLibID = in.LibraryID
	}
	targetInstallDir := foundGame.Manifest.InstallDir
	if in.InstallDir != "" {
		targetInstallDir = strings.TrimPrefix(filepath.ToSlash(in.InstallDir), "/")
	}

	var targetLib *steam.Library
	for i := range libs {
		if libs[i].ID == targetLibID {
			targetLib = &libs[i]
			break
		}
	}
	if targetLib == nil {
		writeError(w, http.StatusBadRequest, "invalid_library", "target library ID not found")
		return
	}

	targetDir := filepath.Join(targetLib.Path, filepath.FromSlash(targetInstallDir))
	commonTarget := filepath.Join(targetLib.Path, "steamapps", "common", filepath.FromSlash(targetInstallDir))
	if _, err := os.Stat(commonTarget); err == nil {
		targetDir = commonTarget
	}

	if gameDir == "" {
		gameDir = targetDir
	}

	// If directory changed, clean old zappmanifest.json from previous path
	if gameDir != "" && !strings.EqualFold(filepath.Clean(gameDir), filepath.Clean(targetDir)) {
		_ = os.Remove(filepath.Join(gameDir, steam.ZappManifestFilename))
	}

	zm, _ := steam.ReadZappManifest(gameDir)
	if zm == nil {
		zm = &steam.ZappManifest{
			ID:         foundGame.Manifest.AppID,
			InstallDir: targetInstallDir,
		}
	}
	zm.InstallDir = targetInstallDir
	if in.Name != "" {
		zm.Name = in.Name
	}
	if in.CoverURL != nil {
		zm.CoverURL = strings.TrimSpace(*in.CoverURL)
	}
	if in.BannerURL != nil {
		zm.BannerURL = strings.TrimSpace(*in.BannerURL)
	}
	if in.SwapEnabled != nil {
		zm.SwapEnabled = *in.SwapEnabled
	}
	if in.IsNativeHDD != nil {
		zm.IsNativeHDD = *in.IsNativeHDD
	}
	if in.Tags != nil {
		zm.Tags = in.Tags
	}

	if err := steam.WriteZappManifest(targetDir, *zm); err != nil {
		writeError(w, http.StatusInternalServerError, "write_manifest_failed", err.Error())
		return
	}
	h.artworkStore().ClearOverrideFields(foundGame.Manifest.AppID, in.CoverURL != nil, in.BannerURL != nil)

	foundGame.Manifest.Name = zm.Name
	foundGame.Manifest.InstallDir = targetInstallDir
	foundGame.LibraryID = targetLibID
	foundGame.CoverURL = zm.CoverURL
	foundGame.BannerURL = zm.BannerURL
	foundGame.SwapEnabled = zm.SwapEnabled
	foundGame.IsNativeHDD = zm.IsNativeHDD
	foundGame.Tags = zm.Tags

	writeJSON(w, http.StatusOK, toGameJSON(*foundGame))
}

// getGameCover: GET /games/{app_id}/cover
func (h handlers) getGameCover(w http.ResponseWriter, r *http.Request) {
	h.serveGameArtwork(w, r, artworkKindGrid)
}

// getGameBanner: GET /games/{app_id}/banner
func (h handlers) getGameBanner(w http.ResponseWriter, r *http.Request) {
	h.serveGameArtwork(w, r, artworkKindBanner)
}
