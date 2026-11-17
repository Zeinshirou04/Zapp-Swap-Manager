//go:build !windows

package steam

import (
	"fmt"
)

// LaunchGameProcess mock/fallback on non-Windows platforms.
func LaunchGameProcess(g Game, lib Library) (string, error) {
	if !g.IsCustom {
		return fmt.Sprintf("steam://run/%s", g.Manifest.AppID), nil
	}
	return "custom", nil
}
