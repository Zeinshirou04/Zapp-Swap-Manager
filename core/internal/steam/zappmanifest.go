package steam

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// ZappManifest represents custom metadata for non-Steam games and library entries.
type ZappManifest struct {
	ID          string     `json:"id"`
	Name        string     `json:"name"`
	InstallDir  string     `json:"install_dir"`
	CoverURL    string     `json:"cover_url,omitempty"`
	SwapEnabled bool       `json:"swap_enabled"`
	IsNativeHDD bool       `json:"is_native_hdd"`
	Tags        []string   `json:"tags,omitempty"`
	LastPlayed  *time.Time `json:"last_played,omitempty"`
}

const ZappManifestFilename = "zappmanifest.json"

// WriteZappManifest saves a manifest inside the given game directory.
func WriteZappManifest(gameDir string, zm ZappManifest) error {
	if zm.InstallDir == "" {
		zm.InstallDir = filepath.Base(gameDir)
	}
	if zm.Name == "" {
		zm.Name = zm.InstallDir
	}
	if zm.ID == "" {
		zm.ID = strings.ToLower(strings.ReplaceAll(zm.InstallDir, " ", "-"))
	}
	data, err := json.MarshalIndent(zm, "", "  ")
	if err != nil {
		return err
	}
	path := filepath.Join(gameDir, ZappManifestFilename)
	return os.WriteFile(path, data, 0644)
}

// ReadZappManifest loads a manifest from inside the given game directory if it exists.
func ReadZappManifest(gameDir string) (*ZappManifest, error) {
	path := filepath.Join(gameDir, ZappManifestFilename)
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var zm ZappManifest
	if err := json.Unmarshal(data, &zm); err != nil {
		return nil, err
	}
	return &zm, nil
}
