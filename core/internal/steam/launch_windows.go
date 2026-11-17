//go:build windows

package steam

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"syscall"
)

// LaunchGameProcess launches a Steam game via protocol or a custom game via its executable.
func LaunchGameProcess(g Game, lib Library) (string, error) {
	if !g.IsCustom {
		uri := fmt.Sprintf("steam://run/%s", g.Manifest.AppID)
		cmd := exec.Command("cmd", "/c", "start", uri)
		cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true, CreationFlags: 0x08000000}
		if err := cmd.Start(); err != nil {
			return uri, fmt.Errorf("launching steam game %s: %w", g.Manifest.AppID, err)
		}
		return uri, nil
	}

	// Resolve custom game directory
	gameDir := filepath.Join(lib.Path, "steamapps", "common", g.Manifest.InstallDir)
	if fi, err := os.Stat(gameDir); err != nil || !fi.IsDir() {
		gameDir = filepath.Join(lib.Path, g.Manifest.InstallDir)
		if fi2, err2 := os.Stat(gameDir); err2 != nil || !fi2.IsDir() {
			return "", fmt.Errorf("custom game directory not found under library %s", lib.ID)
		}
	}

	var targetExe string
	// Check if manifest specifies a launcher
	if zm, err := ReadZappManifest(gameDir); err == nil && zm != nil && zm.LauncherPath != "" {
		lp := zm.LauncherPath
		if !filepath.IsAbs(lp) {
			lp = filepath.Join(gameDir, lp)
		}
		if fi, err := os.Stat(lp); err == nil && !fi.IsDir() {
			targetExe = lp
		}
	}

	// If no launcher specified, search for executables in root of gameDir
	if targetExe == "" {
		entries, err := os.ReadDir(gameDir)
		if err == nil {
			var candidateExes []string
			for _, e := range entries {
				if e.IsDir() {
					continue
				}
				nameLower := strings.ToLower(e.Name())
				if strings.HasSuffix(nameLower, ".exe") {
					// Ignore common utility / crash / uninstall binaries
					if strings.Contains(nameLower, "unins") ||
						strings.Contains(nameLower, "crash") ||
						strings.Contains(nameLower, "update") ||
						strings.Contains(nameLower, "setup") {
						continue
					}
					candidateExes = append(candidateExes, filepath.Join(gameDir, e.Name()))
				}
			}
			if len(candidateExes) > 0 {
				// Pick the best match (e.g. matching install dir base name if possible)
				targetExe = candidateExes[0]
				baseLower := strings.ToLower(filepath.Base(gameDir))
				for _, ce := range candidateExes {
					fn := strings.ToLower(filepath.Base(ce))
					if strings.Contains(fn, baseLower) || strings.Contains(baseLower, strings.TrimSuffix(fn, ".exe")) {
						targetExe = ce
						break
					}
				}
			}
		}
	}

	if targetExe != "" {
		cmd := exec.Command(targetExe)
		cmd.Dir = filepath.Dir(targetExe)
		// DETACHED_PROCESS so the game lives independently of the core service process
		cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: false, CreationFlags: 0x00000008}
		if err := cmd.Start(); err != nil {
			return targetExe, fmt.Errorf("starting game executable %s: %w", targetExe, err)
		}
		return targetExe, nil
	}

	// Fallback: open game directory in Windows Explorer
	cmd := exec.Command("explorer", gameDir)
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true, CreationFlags: 0x08000000}
	if err := cmd.Start(); err != nil {
		return gameDir, fmt.Errorf("opening game directory in explorer: %w", err)
	}
	return gameDir, nil
}
