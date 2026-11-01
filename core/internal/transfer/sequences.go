package transfer

import (
	"context"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"time"
)

// Options carries the optional context a caller (the Plan 005 queue) may
// provide: metrics from the last recorded backup, and whether the user
// explicitly confirmed a >30% drop.
//
// shortcut: LastBackup / DropConfirmed are wiring points for the SQLite
// journal (Plan 005); until then the queue passes LastBackup=nil.
type Options struct {
	LastBackup    *TreeStats
	DropConfirmed bool
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
	// Dry-run inspection: run /L and read its planned actions before mirroring.
	dry, err := Run(ctx, src, dst, MirrorFlag, DryRunFlag)
	if err != nil {
		return fmt.Errorf("backup/mirror: dry run: %w\noutput: %s", err, dry.Output)
	}
	// Real mirror.
	res, err := Run(ctx, src, dst, MirrorFlag)
	if err != nil {
		return fmt.Errorf("backup/mirror: %w\noutput: %s", err, res.Output)
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
	if err := registerStep(1, func() error {
		if err := CheckSource(src); err != nil {
			return err
		}
		if err := CheckDestination(dst, ssdLibRoot, installDir); err != nil {
			return err
		}
		res, err := Run(ctx, src, dst, CopyFlag)
		if err != nil {
			return fmt.Errorf("copy: %w\noutput: %s", err, res.Output)
		}
		return nil
	}()); err != nil {
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
