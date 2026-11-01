package api

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/Zeinshirou04/zapp-swap-manager/core/internal/queue"
	"github.com/Zeinshirou04/zapp-swap-manager/core/internal/steam"
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

// libraries: the whitelist with freshly scanned disk metrics.
func (h handlers) libraries(w http.ResponseWriter, _ *http.Request) {
	libs := make([]steam.Library, len(h.cfg.Libraries))
	copy(libs, h.cfg.Libraries)
	for i := range libs {
		if err := libs[i].RefreshDiskSpace(); err != nil {
			writeError(w, http.StatusInternalServerError, "disk_space", err.Error())
			return
		}
	}
	writeJSON(w, http.StatusOK, libs)
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
	}
}

func (h handlers) scanGames() ([]steam.Game, error) {
	return steam.ScanLibraries(h.cfg.Libraries)
}

// listGames: GET /games?state=&library_id=
func (h handlers) listGames(w http.ResponseWriter, r *http.Request) {
	games, err := h.scanGames()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "scan_failed", err.Error())
		return
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
		writeError(w, http.StatusInternalServerError, "scan_failed", err.Error())
		return
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
