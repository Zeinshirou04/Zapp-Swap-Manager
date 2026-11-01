// Driver abstracts the underlying file-transfer tool so the safety
// sequences (Backup, Evict, Promote) behave identically on Windows
// (robocopy) and Linux (rsync). docs/safety.md invariants live in the
// guards/verify/sequence layer, never in a driver.
package transfer

import (
	"context"
	"runtime"
)

type Driver interface {
	// Mirror replicates src onto dst, deleting extras in dst so dst equals
	// src (robocopy /MIR, rsync --delete). dryRun inspects planned actions
	// without touching anything (robocopy /L, rsync -n).
	Mirror(ctx context.Context, src, dst string, dryRun bool) error
	// Copy adds src's content into dst without deleting anything there
	// (robocopy /E, rsync -a): HDD -> SSD must never lose HDD data.
	Copy(ctx context.Context, src, dst string) error
	Name() string
}

// driverFn returns the active driver, with an injection hook for tests.
// Robocopy on Windows; rsync everywhere else (Linux/Darwin).
var driverFn = func() Driver {
	if runtime.GOOS == "windows" {
		return RobocopyDriver{}
	}
	return RsyncDriver{}
}
