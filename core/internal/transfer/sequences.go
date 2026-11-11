package transfer

import (
	"context"
	"fmt"
	"io"
	"log/slog"
	"os"
	"path/filepath"
	"sync"
	"time"
)

// ProgressFunc is called periodically with in-flight transfer metrics.
type ProgressFunc func(bytesTransferred, totalBytes int64, percent float64)

// Options carries the optional context a caller (the Plan 005 queue) may
// provide: metrics from the last recorded backup, whether the user
// explicitly confirmed a >30% drop, and progress reporting.
//
// shortcut: LastBackup / DropConfirmed are wiring points for the SQLite
// journal (Plan 005); until then the queue passes LastBackup=nil.
type Options struct {
	LastBackup    *TreeStats
	DropConfirmed bool
	ProgressFn    ProgressFunc
	Robocopy      *RobocopyConfig
}

// monitorTransfer tracks destination size relative to source size during
// file copy/mirror operations and periodically reports progress and logs.
func monitorTransfer(ctx context.Context, src, dst string, fn ProgressFunc) func(success bool) {
	srcStats, err := MeasureTree(src)
	totalBytes := int64(0)
	if err == nil && srcStats.Bytes > 0 {
		totalBytes = srcStats.Bytes
	}

	initialDst, _ := MeasureTree(dst)
	initBytes := initialDst.Bytes
	if totalBytes > 0 {
		initPct := float64(initBytes) / float64(totalBytes) * 100
		if initPct > 99.9 {
			initPct = 99.9
		}
		if fn != nil {
			fn(initBytes, totalBytes, initPct)
		}
		slog.Info("transfer starting", "src", filepath.Base(src), "initial_bytes", initBytes, "total_bytes", totalBytes)
	}

	done := make(chan struct{})
	var once sync.Once
	stop := func(success bool) {
		once.Do(func() {
			close(done)
			if success && totalBytes > 0 {
				if fn != nil {
					fn(totalBytes, totalBytes, 100.0)
				}
				slog.Info("transfer completed", "src", filepath.Base(src), "total_bytes", totalBytes)
			}
		})
	}

	go func() {
		ticker := time.NewTicker(2 * time.Second)
		defer ticker.Stop()
		lastLog := time.Now()

		for {
			select {
			case <-done:
				return
			case <-ctx.Done():
				return
			case <-ticker.C:
				if totalBytes <= 0 {
					if s, err := MeasureTree(src); err == nil && s.Bytes > 0 {
						totalBytes = s.Bytes
					} else {
						continue
					}
				}

				dstStats, err := MeasureTree(dst)
				if err != nil {
					continue
				}

				curBytes := dstStats.Bytes
				pct := float64(curBytes) / float64(totalBytes) * 100
				if pct < 0 {
					pct = 0
				}
				if pct > 99.9 {
					pct = 99.9
				}

				if fn != nil {
					fn(curBytes, totalBytes, pct)
				}

				if time.Since(lastLog) >= 5*time.Second {
					slog.Info("transfer in progress",
						"game", filepath.Base(src),
						"percent", fmt.Sprintf("%.1f%%", pct),
						"transferred", fmt.Sprintf("%.2f GB", float64(curBytes)/(1024*1024*1024)),
						"total", fmt.Sprintf("%.2f GB", float64(totalBytes)/(1024*1024*1024)),
					)
					lastLog = time.Now()
				}
			}
		}
	}()

	return stop
}

// Backup mirrors an SSD cache copy onto the HDD master.
// A /L dry run is read before the real /MIR, per docs/safety.md.
func Backup(ctx context.Context, opts Options, ssdLibRoot, hddLibRoot, installDir string) error {
	src := gameFolder(ssdLibRoot, installDir)
	dst := gameFolder(hddLibRoot, installDir)
	return runMirror(ctx, opts, hddLibRoot, installDir, src, dst)
}

// runMirror holds the guard chain for SSD -> HDD mirror operations, shared
// by Backup and Evict step 1: source guard, destination guard, threshold
// guard, dry-run inspection, then /MIR.
func runMirror(ctx context.Context, opts Options, hddLibRoot, installDir, src, dst string) error {
	if err := validateInstallDir(installDir); err != nil {
		return fmt.Errorf("backup/mirror: %w", err)
	}
	if err := CheckDropGuard(src, opts.LastBackup, opts.DropConfirmed); err != nil {
		return fmt.Errorf("backup/mirror: %w", err)
	}
	if err := CheckDestination(dst, hddLibRoot, installDir); err != nil {
		return fmt.Errorf("backup/mirror: %w", err)
	}
	// Dry-run inspection: read the planned actions before mirroring, then
	// run the real mirror. Same flow for robocopy (/L then /MIR) and
	// rsync (-n then --delete).
	driverCtx := withRobocopyConfig(ctx, opts.Robocopy)
	if err := driverFn().Mirror(driverCtx, src, dst, true); err != nil {
		return fmt.Errorf("backup/mirror: dry run: %w", err)
	}
	stop := monitorTransfer(ctx, src, dst, opts.ProgressFn)
	mirrorErr := driverFn().Mirror(driverCtx, src, dst, false)
	stop(mirrorErr == nil)
	if mirrorErr != nil {
		return fmt.Errorf("backup/mirror: %w", mirrorErr)
	}
	return nil
}

// Evict removes a game from the SSD cache after the HDD master copy is
// proven good (docs/safety.md "Evict"):
//  1. final mirror SSD -> HDD (with all mirror guards),
//  2. verify file count and byte size match,
//  3. move appmanifest_<appid>.acf from SSD steamapps to HDD steamapps,
//  4. ONLY THEN delete the SSD game folder.
func Evict(ctx context.Context, opts Options, ssdLibRoot, hddLibRoot, manifestName, installDir string) error {
	registerStep := func(step int, err error) error { // step naming for verifiable error surfaces
		if err == nil {
			return nil
		}
		return fmt.Errorf("evict step %d: %w", step, err)
	}
	src := gameFolder(ssdLibRoot, installDir)
	dst := gameFolder(hddLibRoot, installDir)

	// Step 1: final mirror with the full guard chain.
	if err := registerStep(1, runMirror(ctx, opts, hddLibRoot, installDir, src, dst)); err != nil {
		return err
	}
	// Step 2: verify the HDD copy matches the SSD copy.
	if err := registerStep(2, VerifyMatch(src, dst)); err != nil {
		return err
	}
	// Step 3: move the manifest to the HDD library.
	if err := registerStep(3, MoveManifest(
		filepath.Join(steamappsFolder(ssdLibRoot), manifestName),
		filepath.Join(steamappsFolder(hddLibRoot), manifestName),
	)); err != nil {
		return err
	}
	// Step 4: delete the SSD copy, strictly after verification and manifest move.
	if err := registerStep(4, os.RemoveAll(src)); err != nil {
		return err
	}
	return nil
}

func runCopy(ctx context.Context, opts Options, dstLibRoot, installDir, src, dst string) error {
	if err := CheckSource(src); err != nil {
		return err
	}
	if err := CheckDestination(dst, dstLibRoot, installDir); err != nil {
		return err
	}
	stop := monitorTransfer(ctx, src, dst, opts.ProgressFn)
	copyErr := driverFn().Copy(withRobocopyConfig(ctx, opts.Robocopy), src, dst)
	stop(copyErr == nil)
	return copyErr
}

// Promote copies a game from the HDD master onto the SSD and relocates the
// manifest (docs/safety.md "Promote"):
//  1. copy HDD -> SSD with /E (never a mirror: the HDD master must not lose data),
//  2. verify file count and byte size match,
//  3. move appmanifest_<appid>.acf from HDD steamapps to SSD steamapps,
//  4. the HDD copy stays intact as the master backup (no deletion, ever).
func Promote(ctx context.Context, opts Options, hddLibRoot, ssdLibRoot, manifestName, installDir string) error {
	registerStep := func(step int, err error) error {
		if err == nil {
			return nil
		}
		return fmt.Errorf("promote step %d: %w", step, err)
	}
	src := gameFolder(hddLibRoot, installDir)
	dst := gameFolder(ssdLibRoot, installDir)

	if err := validateInstallDir(installDir); err != nil {
		return registerStep(1, err)
	}
	// Step 1: copy (guards: source must exist non-empty; destination is
	// built from whitelisted roots and checked against its expected form).
	if err := registerStep(1, runCopy(ctx, opts, ssdLibRoot, installDir, src, dst)); err != nil {
		return err
	}
	// Step 2: verify the SSD copy matches the HDD master.
	if err := registerStep(2, VerifyMatch(src, dst)); err != nil {
		return err
	}
	// Step 3: move the manifest to the SSD library.
	if err := registerStep(3, MoveManifest(
		filepath.Join(steamappsFolder(hddLibRoot), manifestName),
		filepath.Join(steamappsFolder(ssdLibRoot), manifestName),
	)); err != nil {
		return err
	}
	// Step 4: implicit — the HDD copy is retained untouched.
	return nil
}

// EvictCustom removes a non-Steam game from the SSD cache after the HDD
// master copy is proven good:
//  1. final mirror SSD -> HDD (with all mirror guards),
//  2. verify file count and byte size match,
//  3. delete the SSD game folder,
//  4. create an NTFS directory junction pointing to the HDD target.
func EvictCustom(ctx context.Context, opts Options, ssdLibRoot, hddLibRoot, installDir string) error {
	registerStep := func(step int, err error) error {
		if err == nil {
			return nil
		}
		return fmt.Errorf("evict custom step %d: %w", step, err)
	}
	src := gameFolder(ssdLibRoot, installDir)
	dst := gameFolder(hddLibRoot, installDir)

	// Step 1: final mirror with the full guard chain.
	if err := registerStep(1, runMirror(ctx, opts, hddLibRoot, installDir, src, dst)); err != nil {
		return err
	}
	// Step 2: verify the HDD copy matches the SSD copy.
	if err := registerStep(2, VerifyMatch(src, dst)); err != nil {
		return err
	}
	// Step 3: delete the SSD copy, strictly after verification.
	if err := registerStep(3, os.RemoveAll(src)); err != nil {
		return err
	}
	// Step 4: create Directory Junction on SSD pointing to HDD.
	if err := registerStep(4, CreateJunction(src, dst)); err != nil {
		return err
	}
	return nil
}

// PromoteCustom copies a non-Steam game from the HDD master onto the SSD:
//  1. remove existing junction on SSD if present,
//  2. copy HDD -> SSD with /E,
//  3. verify file count and byte size match,
//  4. keep the HDD copy as master backup.
func PromoteCustom(ctx context.Context, opts Options, hddLibRoot, ssdLibRoot, installDir string) error {
	registerStep := func(step int, err error) error {
		if err == nil {
			return nil
		}
		return fmt.Errorf("promote custom step %d: %w", step, err)
	}
	src := gameFolder(hddLibRoot, installDir)
	dst := gameFolder(ssdLibRoot, installDir)

	if err := validateInstallDir(installDir); err != nil {
		return registerStep(1, err)
	}
	// Remove existing junction on destination if present.
	if IsJunction(dst) {
		if err := RemoveJunction(dst); err != nil {
			return registerStep(1, fmt.Errorf("remove junction: %w", err))
		}
	}
	// Step 1: copy from HDD to SSD.
	if err := registerStep(1, runCopy(ctx, opts, ssdLibRoot, installDir, src, dst)); err != nil {
		return err
	}
	// Step 2: verify the SSD copy matches the HDD master.
	if err := registerStep(2, VerifyMatch(src, dst)); err != nil {
		return err
	}
	// Step 3: implicit — the HDD copy is retained untouched.
	return nil
}

// MoveManifest relocates appmanifest_<appid>.acf between two libraries'
// steamapps folders. It refuses to overwrite an existing destination
// (Steam treats the manifest as owning the game in exactly one library) and
// only removes the source file once the copy is verified byte-count equal,
// so a manifest is never lost and never duplicated.
func MoveManifest(src, dst string) error {
	if src == dst {
		return fmt.Errorf("move manifest: source and destination are the same")
	}
	if _, err := os.Stat(src); err != nil {
		return fmt.Errorf("move manifest: source: %w", err)
	}
	if _, err := os.Stat(dst); err == nil {
		return fmt.Errorf("move manifest: refusing to overwrite %q, manifest already exists there", dst)
	} else if !os.IsNotExist(err) {
		return fmt.Errorf("move manifest: destination: %w", err)
	}
	if err := retryOverLocking(func() error { return os.Rename(src, dst) }); err == nil {
		return nil
	}
	// Cross-volume fallback: copy then verify size, then remove the source.
	data, err := os.Open(src)
	if err != nil {
		return fmt.Errorf("move manifest: source: %w", err)
	}
	defer data.Close()
	if err := os.MkdirAll(filepath.Dir(dst), 0o755); err != nil {
		return fmt.Errorf("move manifest: destination: %w", err)
	}
	out, err := os.Create(dst)
	if err != nil {
		return fmt.Errorf("move manifest: destination: %w", err)
	}
	if _, err := io.Copy(out, data); err != nil {
		out.Close()
		os.Remove(dst) // don't leave a partial manifest behind
		return fmt.Errorf("move manifest: copy: %w", err)
	}
	info, _ := out.Stat()
	srcInfo, _ := os.Stat(src)
	if err := out.Close(); err != nil {
		os.Remove(dst)
		return fmt.Errorf("move manifest: close: %w", err)
	}
	if info == nil || srcInfo == nil || info.Size() != srcInfo.Size() {
		os.Remove(dst)
		return fmt.Errorf("move manifest: copied size mismatch, keeping source %q", src)
	}
	// Close the source handle before removing the source file; leaving it
	// open (until the deferred close, i.e. after Remove) makes Windows refuse
	// the delete with "being used by another process".
	if err := data.Close(); err != nil {
		os.Remove(dst)
		return fmt.Errorf("move manifest: source: %w", err)
	}
	data = nil
	if err := retryOverLocking(func() error { return os.Remove(src) }); err != nil {
		return fmt.Errorf("move manifest: copy succeeded but source %q could not be removed: %w", src, err)
	}
	return nil
}

// retryOverLocking retries a filesystem op a few times on failure: Defender
// and Steam briefly hold freshly written files on Windows, and a manifest
// move must not abort on that transient lock.
// shortcut: retries every error, not just "in use" ones; fine at ~100ms total.
func retryOverLocking(op func() error) error {
	var err error
	for i := 0; i < 4; i++ {
		if err = op(); err == nil {
			return nil
		}
		time.Sleep(time.Duration(i+1) * 25 * time.Millisecond)
	}
	return err
}
