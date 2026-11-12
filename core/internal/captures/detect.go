package captures

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

type detectedSources struct {
	shareXRoot       string
	shareXHistoryDB  string
	shadowPlayRoot   string
	shadowPlayVideos string
}

type shareXAppConfig struct {
	UseCustomScreenshotsPath bool   `json:"UseCustomScreenshotsPath"`
	CustomScreenshotsPath    string `json:"CustomScreenshotsPath"`
	PersonalPath             string `json:"PersonalPath"`
}

var detectSourcesFn = defaultDetectSources

func existingDir(path string) bool {
	if strings.TrimSpace(path) == "" {
		return false
	}
	fi, err := os.Stat(path)
	return err == nil && fi.IsDir()
}

func existingFile(path string) bool {
	if strings.TrimSpace(path) == "" {
		return false
	}
	fi, err := os.Stat(path)
	return err == nil && !fi.IsDir()
}

// ValidateCaptureFolder verifies a custom capture directory entered via Preferences
// is an existing, absolute, non-root directory (mirrors library whitelist validation).
func ValidateCaptureFolder(raw string) (string, error) {
	p := strings.TrimSpace(raw)
	if p == "" {
		return "", errors.New("capture folder path cannot be empty")
	}
	p = filepath.Clean(p)
	if !filepath.IsAbs(p) {
		return "", fmt.Errorf("capture folder %q must be an absolute path", raw)
	}
	if p == filepath.VolumeName(p)+string(filepath.Separator) || p == "/" {
		return "", fmt.Errorf("refusing filesystem root %q as a capture folder", p)
	}
	fi, err := os.Stat(p)
	if err != nil {
		return "", fmt.Errorf("capture folder %q is not accessible: %w", p, err)
	}
	if !fi.IsDir() {
		return "", fmt.Errorf("capture folder %q must be a directory", p)
	}
	return p, nil
}

func defaultDetectSources() detectedSources {
	out := detectedSources{}
	home, _ := os.UserHomeDir()

	// 1. ShareX auto-detection
	var candidateDirs []string
	if docsDir := windowsDocumentsDir(home); docsDir != "" {
		candidateDirs = append(candidateDirs, filepath.Join(docsDir, "ShareX"))
	}
	if home != "" {
		candidateDirs = append(candidateDirs, filepath.Join(home, "Documents", "ShareX"))
	}
	if localApp := os.Getenv("LOCALAPPDATA"); localApp != "" {
		candidateDirs = append(candidateDirs, filepath.Join(localApp, "ShareX"))
	}
	if appData := os.Getenv("APPDATA"); appData != "" {
		candidateDirs = append(candidateDirs, filepath.Join(appData, "ShareX"))
	}

	seen := map[string]bool{}
	for _, base := range candidateDirs {
		if base == "" {
			continue
		}
		norm := strings.ToLower(filepath.Clean(base))
		if seen[norm] {
			continue
		}
		seen[norm] = true

		cfgPath := filepath.Join(base, "ApplicationConfig.json")
		root := filepath.Join(base, "Screenshots")
		hist := filepath.Join(base, "History.db")

		if data, err := os.ReadFile(cfgPath); err == nil {
			var cfg shareXAppConfig
			if jsonErr := json.Unmarshal(data, &cfg); jsonErr == nil {
				if cfg.PersonalPath != "" {
					if existingFile(filepath.Join(cfg.PersonalPath, "History.db")) {
						hist = filepath.Join(cfg.PersonalPath, "History.db")
					}
					if !cfg.UseCustomScreenshotsPath && existingDir(filepath.Join(cfg.PersonalPath, "Screenshots")) {
						root = filepath.Join(cfg.PersonalPath, "Screenshots")
					}
				}
				if cfg.UseCustomScreenshotsPath && strings.TrimSpace(cfg.CustomScreenshotsPath) != "" {
					root = filepath.Clean(strings.TrimSpace(cfg.CustomScreenshotsPath))
				}
			}
		}

		if existingDir(root) || existingFile(hist) || existingFile(cfgPath) {
			if existingDir(root) {
				out.shareXRoot = root
			}
			if existingFile(hist) {
				out.shareXHistoryDB = hist
			}
			if out.shareXRoot != "" || out.shareXHistoryDB != "" {
				break
			}
		}
	}

	// 2. NVIDIA ShadowPlay auto-detection
	var nvidiaCandidates []string
	if regPath := queryShadowPlayRegistryPath(); regPath != "" {
		nvidiaCandidates = append(nvidiaCandidates, regPath)
	}
	if vidDir := windowsVideosDir(home); vidDir != "" {
		nvidiaCandidates = append(nvidiaCandidates, filepath.Join(vidDir, "NVIDIA"))
		if existingDir(vidDir) {
			out.shadowPlayVideos = vidDir
		}
	}
	if home != "" {
		nvidiaCandidates = append(nvidiaCandidates, filepath.Join(home, "Videos", "NVIDIA"))
		if out.shadowPlayVideos == "" && existingDir(filepath.Join(home, "Videos")) {
			out.shadowPlayVideos = filepath.Join(home, "Videos")
		}
	}

	for _, cand := range nvidiaCandidates {
		if existingDir(cand) {
			out.shadowPlayRoot = filepath.Clean(cand)
			break
		}
	}
	return out
}
