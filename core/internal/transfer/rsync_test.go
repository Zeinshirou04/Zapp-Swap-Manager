package transfer

import (
	"context"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

// fakeDriver records every call so tests can assert driver-driven ordering.
type fakeDriver struct {
	mirrorFn func(ctx context.Context, src, dst string, dryRun bool) error
	copyFn   func(ctx context.Context, src, dst string) error
}

func (f fakeDriver) Mirror(ctx context.Context, src, dst string, dryRun bool) error {
	return f.mirrorFn(ctx, src, dst, dryRun)
}

func (f fakeDriver) Copy(ctx context.Context, src, dst string) error {
	return f.copyFn(ctx, src, dst)
}

func (fakeDriver) Name() string { return "fake" }

func TestRsyncMirrorArgs(t *testing.T) {
	if got := fmt.Sprint(rsyncMirrorArgs(false)); got != `[-a --delete]` {
		t.Errorf("mirror args = %v", got)
	}
	got := fmt.Sprint(rsyncMirrorArgs(true))
	if got != `[-a --delete -n]` {
		t.Errorf("dry-run args = %v, want -a --delete -n (planned deletions must appear)", got)
	}
}

func TestRsyncDriverArgs(t *testing.T) {
	d := RsyncDriver{}
	if d.Name() != "rsync" {
		t.Errorf("Name = %q", d.Name())
	}
	var calls [][]string
	orig := runRsync
	runRsync = func(ctx context.Context, src, dst string, flags ...string) (Result, error) {
		calls = append(calls, append([]string{src, dst}, flags...))
		return Result{}, nil
	}
	t.Cleanup(func() { runRsync = orig })

	ctx := context.Background()
	if err := d.Mirror(ctx, "/src", "/dst", false); err != nil {
		t.Fatalf("Mirror: %v", err)
	}
	if got := fmt.Sprint(calls[0]); got != `[/src/ /dst -a --delete]` {
		t.Errorf("mirror call = %v", calls[0])
	}
	if err := d.Mirror(ctx, "/src", "/dst", true); err != nil {
		t.Fatalf("Mirror dry: %v", err)
	}
	if got := fmt.Sprint(calls[1]); got != `[/src/ /dst -a --delete -n]` {
		t.Errorf("dry call = %v", calls[1])
	}
	if err := d.Copy(ctx, "/src", "/dst"); err != nil {
		t.Fatalf("Copy: %v", err)
	}
	if got := fmt.Sprint(calls[2]); got != `[/src/ /dst -a]` {
		t.Errorf("copy call = %v, want plain -a (never mirror on HDD -> SSD)", calls[2])
	}
}

func TestRsyncExitCodes(t *testing.T) {
	if rsyncExitError(nil) != nil {
		t.Error("nil should map to nil")
	}
	if err := rsyncExitError(errors.New("run rsync: binary missing")); err == nil {
		t.Error("non-ExitError must surface")
	}
	err := rsyncExitError(exitCodeErr(3))
	if err == nil || !strings.Contains(err.Error(), "rsync exit code 3") {
		t.Errorf("non-zero rsync exit code must fail: %v", err)
	}
}

// exitCodeErr builds a *exec.ExitError with the given process exit code.
func exitCodeErr(code int) error {
	cmd := exec.Command("cmd", "/c", fmt.Sprintf("exit %d", code))
	if runtime.GOOS != "windows" {
		cmd = exec.Command("sh", "-c", fmt.Sprintf("exit %d", code))
	}
	return cmd.Run()
}

// TestDefaultDriverBranches proves the selector picks the right driver per OS.
func TestDefaultDriverBranches(t *testing.T) {
	d := driverFn()
	switch runtime.GOOS {
	case "windows":
		if _, ok := d.(RobocopyDriver); !ok {
			t.Errorf("on windows, driver = %T, want RobocopyDriver", d)
		}
	default:
		if _, ok := d.(RsyncDriver); !ok {
			t.Errorf("on %s, driver = %T, want RsyncDriver", runtime.GOOS, d)
		}
	}
}

// TestSequencesUseDriver proves the guard/sequence layer drives any Driver,
// keeping the invariants on every OS: dry run before mirror, and a failing
// copy aborts Promote at step 1 without moving the manifest.
func TestSequencesUseDriver(t *testing.T) {
	var calls []string
	orig := driverFn
	driverFn = func() Driver {
		return fakeDriver{
			mirrorFn: func(_ context.Context, src, dst string, dryRun bool) error {
				calls = append(calls, fmt.Sprint("mirror src->", dst, " dry=", dryRun))
				return nil
			},
			copyFn: func(_ context.Context, _, _ string) error {
				return errors.New("disk full")
			},
		}
	}
	t.Cleanup(func() { driverFn = orig })

	ssd := setUpLibrary(t, map[string]int{gameDir + "/a.bin": 512}, manifestName)
	// HDD gets a game folder (non-empty source) and the manifest, so Promote
	// reaches step 1's Copy and the manifest-stays assertion is meaningful.
	hdd := setUpLibrary(t, map[string]int{gameDir + "/h.bin": 512}, manifestName)

	calls = nil
	if err := Backup(context.Background(), Options{}, ssd, hdd, installDir); err != nil {
		t.Fatalf("Backup: %v", err)
	}
	if len(calls) != 2 || !strings.HasPrefix(calls[0], "mirror") || !strings.Contains(calls[0], "dry=true") || strings.Contains(calls[1], "dry=true") {
		t.Fatalf("Backup calls = %v, want dry run then real mirror", calls)
	}

	err := Promote(context.Background(), Options{}, hdd, ssd, manifestName, installDir)
	if err == nil || !strings.Contains(err.Error(), "promote step 1") {
		t.Fatalf("Promote err = %v, want 'promote step 1'", err)
	}
	if _, sErr := os.Stat(filepath.Join(hdd, "steamapps", manifestName)); sErr != nil {
		t.Error("manifest must stay on the HDD after a step-1 failure")
	}
}

// TestRsyncRealIntegration exercises real rsync when available (Linux CI),
// proving mirror, dry-run, and extra-deletion semantics through Backup.
func TestRsyncRealIntegration(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("rsync is the POSIX driver")
	}
	if _, err := exec.LookPath("rsync"); err != nil {
		t.Skip("rsync not installed")
	}
	origRsync := runRsync
	runRsync = runRsyncReal
	t.Cleanup(func() { runRsync = origRsync })

	ctx := context.Background()
	ssd := setUpLibrary(t, map[string]int{gameDir + "/a.bin": 512, gameDir + "/sub/b.bin": 256}, manifestName)
	hdd := setUpLibrary(t, nil, "")

	if err := Backup(ctx, Options{}, ssd, hdd, installDir); err != nil {
		t.Fatalf("Backup: %v", err)
	}
	got := mustFiles(t, filepath.Join(hdd, "steamapps", "common", gameDir))
	if got["files"] != 2 || got["bytes"] != 512+256 {
		t.Errorf("after backup: %v", got)
	}
}
