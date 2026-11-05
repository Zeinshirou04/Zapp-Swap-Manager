package api

import (
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/Zeinshirou04/Zapp-Swap-Manager/core/internal/queue"
	"github.com/Zeinshirou04/Zapp-Swap-Manager/core/internal/steam"
)

type handlers struct {
	cfg   Config
	start time.Time
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

// libraryJSON mirrors the Library schema in api/openapi.yaml without exposing
// the raw filesystem path.
type libraryJSON struct {
	ID         string `json:"id"`
	Name       string `json:"name"`
	Type       string `json:"type"`
	FreeBytes  int64  `json:"free_bytes"`
	TotalBytes int64  `json:"total_bytes"`
}

func toLibraryJSON(l steam.Library) libraryJSON {
	return libraryJSON{
		ID:         l.ID,
		Name:       l.Name,
		Type:       l.Type,
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
		merged = append(merged, steam.Library{ID: id, Name: filepath.Base(path), Path: path, Type: in.Type})
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
	BackupClean      bool       `json:"backup_clean"`
	IsCustom         bool       `json:"is_custom"`
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
		//shortcut: backup history lands with the journal wiring in Plan 00xx
		BackupClean: false, // honest default until backup metrics are journaled
		IsCustom:    g.IsCustom,
	}
}

func (h handlers) scanGames() ([]steam.Game, error) {
	return steam.ScanLibraries(h.libs())
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
