//go:build !windows

package steam

import "time"

func CloseSteamGracefully(_ time.Duration) bool {
	return false
}

func RelaunchSteam() {}
