package api

import (
	"encoding/json"
	"errors"
	"net/http"
	"os"
	"strconv"
	"strings"

	"github.com/Zeinshirou04/Zapp-Swap-Manager/core/internal/captures"
)

// getCaptureSources: GET /captures/sources
func (h handlers) getCaptureSources(w http.ResponseWriter, _ *http.Request) {
	status := h.captureManager().DetectSources(h.currentPreferences())
	writeJSON(w, http.StatusOK, status)
}

// getGameCaptures: GET /games/{app_id}/captures?kind=&source=&limit=
func (h handlers) getGameCaptures(w http.ResponseWriter, r *http.Request) {
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

	q := r.URL.Query()
	kindFilter := strings.TrimSpace(strings.ToLower(q.Get("kind")))
	if kindFilter != "" && kindFilter != "all" && kindFilter != captures.KindImage && kindFilter != captures.KindVideo {
		writeError(w, http.StatusBadRequest, "invalid_request", "kind must be all, image, or video")
		return
	}
	sourceFilter := strings.TrimSpace(strings.ToLower(q.Get("source")))
	if sourceFilter != "" && sourceFilter != "all" && sourceFilter != captures.SourceShareX && sourceFilter != captures.SourceShadowPlay && sourceFilter != captures.SourceCustom {
		writeError(w, http.StatusBadRequest, "invalid_request", "source must be all, sharex, shadowplay, or custom")
		return
	}
	limit := 120
	if lStr := strings.TrimSpace(q.Get("limit")); lStr != "" {
		n, convErr := strconv.Atoi(lStr)
		if convErr != nil || n <= 0 {
			writeError(w, http.StatusBadRequest, "invalid_request", "limit must be a positive integer")
			return
		}
		limit = n
	}

	res := h.captureManager().ScanForGame(
		r.Context(),
		h.currentPreferences(),
		captures.GameTarget{
			AppID:      foundGame.Manifest.AppID,
			Name:       foundGame.Manifest.Name,
			InstallDir: foundGame.Manifest.InstallDir,
		},
		kindFilter,
		sourceFilter,
		limit,
	)
	writeJSON(w, http.StatusOK, res)
}

type updateCaptureAliasesRequest struct {
	Aliases []string `json:"aliases"`
}

// updateGameCaptureAliases: PUT /games/{app_id}/captures/aliases
func (h handlers) updateGameCaptureAliases(w http.ResponseWriter, r *http.Request) {
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
	var req updateCaptureAliasesRequest
	if err := dec.Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_request", err.Error())
		return
	}
	if req.Aliases == nil {
		req.Aliases = []string{}
	}

	if _, err := h.captureManager().SetAliases(foundGame.Manifest.AppID, req.Aliases); err != nil {
		writeError(w, http.StatusInternalServerError, "persist_failed", err.Error())
		return
	}

	updated, err := h.findGame(foundGame.Manifest.AppID)
	if err != nil || updated == nil {
		writeError(w, http.StatusInternalServerError, "scan_failed", "failed to reload updated game")
		return
	}
	writeJSON(w, http.StatusOK, h.toGameResponse(*updated))
}

// serveCaptureFile: GET /captures/{capture_id}/file
func (h handlers) serveCaptureFile(w http.ResponseWriter, r *http.Request) {
	captureID := strings.TrimSpace(r.PathValue("capture_id"))
	f, fi, filename, mimeType, err := h.captureManager().OpenCapture(captureID, h.currentPreferences())
	if err != nil {
		switch {
		case errors.Is(err, os.ErrNotExist) || errors.Is(err, os.ErrPermission):
			writeError(w, http.StatusNotFound, "capture_not_found", "capture not found or outside enabled sources")
		default:
			writeError(w, http.StatusBadRequest, "invalid_capture_id", err.Error())
		}
		return
	}
	defer f.Close()

	w.Header().Set("Content-Type", mimeType)
	w.Header().Set("Accept-Ranges", "bytes")
	w.Header().Set("Cache-Control", "private, max-age=3600")
	http.ServeContent(w, r, filename, fi.ModTime(), f)
}
