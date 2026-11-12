package captures

import (
	"path/filepath"
	"strings"
	"time"
)

const (
	SourceShareX     = "sharex"
	SourceShadowPlay = "shadowplay"
	SourceCustom     = "custom"

	KindImage = "image"
	KindVideo = "video"

	MatchedByShadowPlayFolder = "shadowplay_folder"
	MatchedByShareXHistory    = "sharex_history"
	MatchedByFilename         = "filename"
	MatchedByAlias            = "alias"
)

// CaptureItem represents a single screenshot or gameplay recording returned by the HTTP API.
// Raw filesystem paths are intentionally omitted; clients address files by opaque 32-hex ID.
type CaptureItem struct {
	ID          string    `json:"id"`
	Source      string    `json:"source"`
	Kind        string    `json:"kind"`
	Filename    string    `json:"filename"`
	MimeType    string    `json:"mime_type"`
	SizeBytes   int64     `json:"size_bytes"`
	CapturedAt  time.Time `json:"captured_at"`
	WindowTitle string    `json:"window_title,omitempty"`
	ProcessName string    `json:"process_name,omitempty"`
	MatchedBy   string    `json:"matched_by"`
}

// ShareXSourceStatus describes auto-detected ShareX paths and active status.
type ShareXSourceStatus struct {
	Detected      bool   `json:"detected"`
	Enabled       bool   `json:"enabled"`
	RootPath      string `json:"root_path,omitempty"`
	HistoryDBPath string `json:"history_db_path,omitempty"`
}

// ShadowPlaySourceStatus describes auto-detected NVIDIA ShadowPlay folders and status.
type ShadowPlaySourceStatus struct {
	Detected bool   `json:"detected"`
	Enabled  bool   `json:"enabled"`
	RootPath string `json:"root_path,omitempty"`
}

// SourcesStatus summarizes all active and discovered capture directories.
type SourcesStatus struct {
	ShareX        ShareXSourceStatus     `json:"sharex"`
	ShadowPlay    ShadowPlaySourceStatus `json:"shadowplay"`
	CustomFolders []string               `json:"custom_folders"`
}

// SourcesChecked counts which sources were included in a game scan.
type SourcesChecked struct {
	ShareX     bool `json:"sharex"`
	ShadowPlay bool `json:"shadowplay"`
	Custom     int  `json:"custom"`
}

// ScanResult is the response payload for GET /games/{app_id}/captures.
type ScanResult struct {
	Items          []CaptureItem  `json:"items"`
	Aliases        []string       `json:"aliases"`
	SourcesChecked SourcesChecked `json:"sources_checked"`
}

// GameTarget supplies the identities used to match screenshots and videos to one game.
type GameTarget struct {
	AppID      string
	Name       string
	InstallDir string
	Aliases    []string
}

type mediaSpec struct {
	kind string
	mime string
}

var supportedMedia = map[string]mediaSpec{
	".png":  {kind: KindImage, mime: "image/png"},
	".jpg":  {kind: KindImage, mime: "image/jpeg"},
	".jpeg": {kind: KindImage, mime: "image/jpeg"},
	".webp": {kind: KindImage, mime: "image/webp"},
	".gif":  {kind: KindImage, mime: "image/gif"},
	".bmp":  {kind: KindImage, mime: "image/bmp"},
	".mp4":  {kind: KindVideo, mime: "video/mp4"},
	".webm": {kind: KindVideo, mime: "video/webm"},
	".mkv":  {kind: KindVideo, mime: "video/x-matroska"},
	".mov":  {kind: KindVideo, mime: "video/quicktime"},
	".avi":  {kind: KindVideo, mime: "video/x-msvideo"},
}

// MediaInfoForExt maps a file extension to its capture kind and Content-Type MIME string.
func MediaInfoForExt(filename string) (kind string, mime string, ok bool) {
	ext := strings.ToLower(filepath.Ext(filename))
	spec, found := supportedMedia[ext]
	if !found {
		return "", "", false
	}
	return spec.kind, spec.mime, true
}
