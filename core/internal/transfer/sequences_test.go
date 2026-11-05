package transfer

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

// setUpLibrary creates a fake library root with a steamapps folder and
// optionally a game's common folder with files and an appmanifest.
func setUpLibrary(t *testing.T, files map[string]int, manifestName string) string {
	t.Helper()
	root := t.TempDir()
	if err := os.MkdirAll(filepath.Join(root, "steamapps", "common"), 0o755); err != nil {
		t.Fatal(err)
	}
	if manifestName != "" {
		if err := os.WriteFile(filepath.Join(root, "steamapps", manifestName), []byte(`"AppState" { }`), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	for name, size := range files {
		p := filepath.Join(root, "steamapps", "common", name)
		if err := os.MkdirAll(filepath.Dir(p), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(p, make([]byte, size), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	return root
}

const (
	gameDir      = "Terraria"
	manifestName = "appmanifest_105600.acf"
	installDir   = gameDir
)

func mustFiles(t *testing.T, p string) map[string]int64 {
	t.Helper()
	st, err := MeasureTree(p)
	if err != nil {
		t.Fatal(err)
	}
	return map[string]int64{"files": st.Files, "bytes": st.Bytes}
}

// TestBackupReal exercises the full Backup sequence with real robocopy.exe.
func TestBackupReal(t *testing.T) {
	if runtime.GOOS != "windows" {
		t.Skip("robocopy.exe is Windows-only")
	}
	ctx := context.Background()
	ssd := setUpLibrary(t, map[string]int{gameDir + "/a.bin": 256, gameDir + "/sub/b.bin": 1024}, manifestName)
	hdd := setUpLibrary(t, nil, "")

	if err := Backup(ctx, Options{}, ssd, hdd, installDir); err != nil {
		t.Fatalf("Backup: %v", err)
	}
	got := mustFiles(t, filepath.Join(hdd, "steamapps", "common", gameDir))
	if got["files"] != 2 || got["bytes"] != 256+1024 {
		t.Errorf("HDD copy = %v", got)
	}

	// Second backup after source change mirrors the deletion too (small
	// drop, no confirmation needed; last metrics from the first backup).
	last := TreeStats{Files: 2, Bytes: 256 + 1024}
	if err := os.Remove(filepath.Join(ssd, "steamapps", "common", gameDir, "a.bin")); err != nil {
		t.Fatal(err)
	}
	if err := Backup(ctx, Options{LastBackup: &last}, ssd, hdd, installDir); err != nil {
		t.Fatalf("Backup 2: %v", err)
	}
	got = mustFiles(t, filepath.Join(hdd, "steamapps", "common", gameDir))
	if got["files"] != 1 || got["bytes"] != 1024 {
		t.Errorf("HDD copy after mirror = %v", got)
	}
}

// TestBackupRefusesBigDrop proves the threshold guard stops the mirror while
// the HDD master keeps its existing data.
func TestBackupRefusesBigDrop(t *testing.T) {
	if runtime.GOOS != "windows" {
		t.Skip("robocopy.exe is Windows-only")
	}
	ctx := context.Background()
	ssd := setUpLibrary(t, map[string]int{gameDir + "/a.bin": 1024, gameDir + "/b.bin": 3072}, manifestName)
	hdd := setUpLibrary(t, nil, "")

	if err := Backup(ctx, Options{}, ssd, hdd, installDir); err != nil {
		t.Fatalf("Backup: %v", err)
	}
	before := mustFiles(t, filepath.Join(hdd, "steamapps", "common", gameDir))

	// Decimate the source below 70% of the last backup, then request again.
	if err := os.Truncate(filepath.Join(ssd, "steamapps", "common", gameDir, "b.bin"), 0); err != nil {
		t.Fatal(err)
	}
	last := TreeStats{Files: 2, Bytes: 1024 + 3072}
	err := Backup(ctx, Options{LastBackup: &last}, ssd, hdd, installDir)
	if err == nil || !strings.Contains(err.Error(), "drop guard") {
		t.Fatalf("expected drop-guard refusal, got %v", err)
	}
	after := mustFiles(t, filepath.Join(hdd, "steamapps", "common", gameDir))
	if after["files"] != before["files"] || after["bytes"] != before["bytes"] {
		t.Errorf("refused backup must not touch the HDD master: %v -> %v", before, after)
	}
	// With explicit confirmation the mirror re-runs.
	if err := Backup(ctx, Options{LastBackup: &last, DropConfirmed: true}, ssd, hdd, installDir); err != nil {
		t.Fatalf("confirmed backup: %v", err)
	}
}

// TestEvictReal checks the full evict ordering: verified copy, manifest
// moved to exactly one library, then the SSD copy deleted.
func TestEvictReal(t *testing.T) {
	if runtime.GOOS != "windows" {
		t.Skip("robocopy.exe is Windows-only")
	}
	ctx := context.Background()
	ssd := setUpLibrary(t, map[string]int{gameDir + "/a.bin": 512, gameDir + "/sub/b.bin": 256}, manifestName)
	hdd := setUpLibrary(t, nil, "")

	if err := Evict(ctx, Options{}, ssd, hdd, manifestName, installDir); err != nil {
		t.Fatalf("Evict: %v", err)
	}
	if st, err := os.Stat(filepath.Join(ssd, "steamapps", "common", gameDir)); !os.IsNotExist(err) && st != nil {
		t.Errorf("SSD game folder should be deleted, stat err=%v", err)
	}
	if _, err := os.Stat(filepath.Join(ssd, "steamapps", manifestName)); !os.IsNotExist(err) {
		t.Error("SSD manifest should be gone")
	}
	if _, err := os.Stat(filepath.Join(hdd, "steamapps", manifestName)); err != nil {
		t.Error("HDD manifest should exist after evict")
	}
	got := mustFiles(t, filepath.Join(hdd, "steamapps", "common", gameDir))
	if got["files"] != 2 || got["bytes"] != 512+256 {
		t.Errorf("HDD copy = %v", got)
	}
}

// TestEvictNoDeleteOnCopyFailure proves step 4 never runs when the copy
// fails: the runner stub returns a failing robocopy exit code on the mirror.
func TestEvictNoDeleteOnCopyFailure(t *testing.T) {
	ctx := context.Background()
	ssd := setUpLibrary(t, map[string]int{gameDir + "/a.bin": 100}, manifestName)
	hdd := setUpLibrary(t, nil, "")
	ssdGame := filepath.Join(ssd, "steamapps", "common", gameDir)
	ssdManifest := filepath.Join(ssd, "steamapps", manifestName)

	restore := stubRunner(t, 16, nil) // 16 = serious error
	err := Evict(ctx, Options{}, ssd, hdd, manifestName, installDir)
	restore()
	if err == nil || !strings.Contains(err.Error(), "evict step 1") {
		t.Fatalf("expected evict step 1 failure, got %v", err)
	}
	if _, statErr := os.Stat(ssdGame); statErr != nil {
		t.Errorf("SSD game folder must survive a failed mirror: %v", statErr)
	}
	if _, statErr := os.Stat(ssdManifest); statErr != nil {
		t.Errorf("SSD manifest must survive a failed mirror: %v", statErr)
	}
}

// TestEvictNoDeleteOnVerifyFailure proves deletion waits for verification:
// the mirror "succeeds" (stub with exit 0) but the target tree is wrong.
func TestEvictNoDeleteOnVerifyFailure(t *testing.T) {
	ctx := context.Background()
	ssd := setUpLibrary(t, map[string]int{gameDir + "/a.bin": 100, gameDir + "/b.bin": 50}, manifestName)
	hdd := setUpLibrary(t, nil, "")

	// Stub the real mirror with success; then damage the destination before
	// verification runs. Simplest: damage the HDD's copy through a second
	// stub that also deletes a file on each run.
	var calls int
	stubRunner(t, 0, nil)
	orig := runRobocopy
	runRobocopy = func(ctx context.Context, src, dst string, flags ...string) (Result, error) {
		calls++
		// Dry run then real run both "succeed"; after the real /MIR, corrupt
		// the destination so verification must fail.
		_ = os.WriteFile(filepath.Join(dst, "a.bin"), make([]byte, 99), 0o644)
		return Result{ExitCode: 0}, nil
	}
	err := Evict(ctx, Options{}, ssd, hdd, manifestName, installDir)
	runRobocopy = orig
	if err == nil || !strings.Contains(err.Error(), "evict step 2") {
		t.Fatalf("expected evict step 2 (verify) failure, got %v", err)
	}
	if calls < 2 {
		t.Error("expected dry run + real mirror through the stub")
	}
	if _, statErr := os.Stat(filepath.Join(ssd, "steamapps", "common", gameDir, "b.bin")); statErr != nil {
		t.Errorf("SSD copy must be intact when verification fails: %v", statErr)
	}
	if _, statErr := os.Stat(filepath.Join(ssd, "steamapps", manifestName)); statErr != nil {
		t.Errorf("SSD manifest must remain where it was: %v", statErr)
	}
}

// TestEvictNoDeleteOnManifestConflict proves the manifest-guard stops evict
// before step 4: if the game's manifest already exists on the HDD (game
// tracked in two libraries), the evict aborts with the SSD intact.
func TestEvictNoDeleteOnManifestConflict(t *testing.T) {
	if runtime.GOOS != "windows" {
		t.Skip("robocopy.exe is Windows-only")
	}
	ctx := context.Background()
	ssd := setUpLibrary(t, map[string]int{gameDir + "/a.bin": 100}, manifestName)
	hdd := setUpLibrary(t, map[string]int{gameDir + "/a.bin": 100}, manifestName) // conflicting manifest

	err := Evict(ctx, Options{}, ssd, hdd, manifestName, installDir)
	if err == nil || !strings.Contains(err.Error(), "evict step 3") {
		t.Fatalf("expected evict step 3 (manifest) failure, got %v", err)
	}
	if _, statErr := os.Stat(filepath.Join(ssd, "steamapps", "common", gameDir, "a.bin")); statErr != nil {
		t.Errorf("SSD copy must survive a manifest conflict: %v", statErr)
	}
}

// TestPromoteReal checks the full promote sequence and that the HDD master
// copy stays intact and keeps its manifest-free data folder.
func TestPromoteReal(t *testing.T) {
	if runtime.GOOS != "windows" {
		t.Skip("robocopy.exe is Windows-only")
	}
	ctx := context.Background()
	hdd := setUpLibrary(t, map[string]int{gameDir + "/a.bin": 700, gameDir + "/b.bin": 300}, manifestName)
	ssd := setUpLibrary(t, nil, "")

	if err := Promote(ctx, Options{}, hdd, ssd, manifestName, installDir); err != nil {
		t.Fatalf("Promote: %v", err)
	}
	got := mustFiles(t, filepath.Join(ssd, "steamapps", "common", gameDir))
	if got["files"] != 2 || got["bytes"] != 1000 {
		t.Errorf("SSD copy = %v", got)
	}
	if _, err := os.Stat(filepath.Join(ssd, "steamapps", manifestName)); err != nil {
		t.Error("manifest should now live on the SSD")
	}
	if _, err := os.Stat(filepath.Join(hdd, "steamapps", manifestName)); !os.IsNotExist(err) {
		t.Error("manifest should no longer be on the HDD")
	}
	// HDD master data retained.
	kept := mustFiles(t, filepath.Join(hdd, "steamapps", "common", gameDir))
	if kept["files"] != 2 || kept["bytes"] != 1000 {
		t.Errorf("HDD master must be retained intact: %v", kept)
	}
}

// TestPromoteNoManifestMoveOnVerifyFailure proves promote never relocates
// the manifest when the copy/verify chain fails.
func TestPromoteNoManifestMoveOnVerifyFailure(t *testing.T) {
	if runtime.GOOS != "windows" {
		t.Skip("robocopy.exe is Windows-only")
	}
	ctx := context.Background()
	hdd := setUpLibrary(t, map[string]int{gameDir + "/a.bin": 100}, manifestName)
	ssd := setUpLibrary(t, map[string]int{gameDir + "/a.bin": 200}, manifestName) // pre-existing conflicting manifest

	err := Promote(ctx, Options{}, hdd, ssd, manifestName, installDir)
	if err == nil || !strings.Contains(err.Error(), "promote step 3") {
		t.Fatalf("expected promote step 3 (manifest conflict) failure, got %v", err)
	}
	if _, statErr := os.Stat(filepath.Join(hdd, "steamapps", manifestName)); statErr != nil {
		t.Errorf("HDD manifest must stay put on failure: %v", statErr)
	}
}

// TestSequentialEvictThenPromuteRoundTrip: full cycle on one game, per
// docs/safety.md "Verification before release".
func TestRoundTrip(t *testing.T) {
	if runtime.GOOS != "windows" {
		t.Skip("robocopy.exe is Windows-only")
	}
	ctx := context.Background()
	gameName := fmt.Sprintf(gameDir) // same installdir both sides
	ssd := setUpLibrary(t, map[string]int{gameDir + "/big.bin": 4096}, manifestName)
	hdd := setUpLibrary(t, nil, "")

	// Backup then evict: data must land on the HDD and disappear from SSD.
	if err := Backup(ctx, Options{}, ssd, hdd, gameName); err != nil {
		t.Fatalf("Backup: %v", err)
	}
	if err := Evict(ctx, Options{}, ssd, hdd, manifestName, gameName); err != nil {
		t.Fatalf("Evict: %v", err)
	}
	if st, err := os.Stat(filepath.Join(ssd, "steamapps", "common", gameDir)); !os.IsNotExist(err) && st != nil {
		t.Error("SSD should be clean after evict")
	}

	// Promote back: manifest returns to the SSD, HDD master retained.
	if err := Promote(ctx, Options{}, hdd, ssd, manifestName, gameName); err != nil {
		t.Fatalf("Promote: %v", err)
	}
	if _, err := os.Stat(filepath.Join(ssd, "steamapps", manifestName)); err != nil {
		t.Errorf("manifest should be back on the SSD: %v", err)
	}
	got := mustFiles(t, filepath.Join(ssd, "steamapps", "common", gameDir))
	if got["bytes"] != 4096 {
		t.Errorf("SSD after promote = %v", got)
	}
	if kept := mustFiles(t, filepath.Join(hdd, "steamapps", "common", gameDir)); kept["bytes"] != 4096 {
		t.Errorf("HDD master retained = %v", kept)
	}
}

func TestCustomGameRoundTrip(t *testing.T) {
	if runtime.GOOS != "windows" {
		t.Skip("robocopy.exe and mklink /J are Windows-only")
	}
	ctx := context.Background()
	customDir := "CustomAdventure"
	ssd := setUpLibrary(t, map[string]int{customDir + "/data.bin": 2048}, "")
	hdd := setUpLibrary(t, nil, "")

	// 1. EvictCustom: mirror SSD -> HDD, verify, delete SSD folder, create junction link
	if err := EvictCustom(ctx, Options{}, ssd, hdd, customDir); err != nil {
		t.Fatalf("EvictCustom: %v", err)
	}

	// Master copy must be on HDD
	hddFiles := mustFiles(t, filepath.Join(hdd, "steamapps", "common", customDir))
	if hddFiles["bytes"] != 2048 {
		t.Errorf("HDD master bytes = %d, want 2048", hddFiles["bytes"])
	}

	// SSD should now be a junction pointing to HDD
	ssdPath := filepath.Join(ssd, "steamapps", "common", customDir)
	if !IsJunction(ssdPath) {
		t.Errorf("expected %q on SSD to be a junction after EvictCustom", ssdPath)
	}

	// 2. PromoteCustom: remove junction, copy HDD -> SSD, verify
	if err := PromoteCustom(ctx, Options{}, hdd, ssd, customDir); err != nil {
		t.Fatalf("PromoteCustom: %v", err)
	}

	// SSD should no longer be a junction, but a real directory
	if IsJunction(ssdPath) {
		t.Errorf("expected %q on SSD to NOT be a junction after PromoteCustom", ssdPath)
	}
	ssdFiles := mustFiles(t, ssdPath)
	if ssdFiles["bytes"] != 2048 {
		t.Errorf("SSD bytes = %d, want 2048", ssdFiles["bytes"])
	}

	// HDD master copy must remain intact
	hddKept := mustFiles(t, filepath.Join(hdd, "steamapps", "common", customDir))
	if hddKept["bytes"] != 2048 {
		t.Errorf("HDD master retained bytes = %d, want 2048", hddKept["bytes"])
	}
}

func TestGenericDirectoryRoundTrip(t *testing.T) {
	if runtime.GOOS != "windows" {
		t.Skip("robocopy.exe and mklink /J are Windows-only")
	}
	ctx := context.Background()
	gameDirName := "EpicShooter"
	ssd := filepath.Join(t.TempDir(), "SSDGames")
	hdd := filepath.Join(t.TempDir(), "HDDGUID")
	if err := os.MkdirAll(filepath.Join(ssd, gameDirName), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(hdd, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(ssd, gameDirName, "game.dat"), []byte("epic_payload"), 0o644); err != nil {
		t.Fatal(err)
	}

	// Evict from generic SSD directly to generic HDD
	if err := EvictCustom(ctx, Options{}, ssd, hdd, gameDirName); err != nil {
		t.Fatalf("EvictCustom generic: %v", err)
	}

	ssdPath := filepath.Join(ssd, gameDirName)
	if !IsJunction(ssdPath) {
		t.Errorf("expected %q on SSD to be a junction", ssdPath)
	}

	hddPath := filepath.Join(hdd, gameDirName)
	if _, err := os.Stat(filepath.Join(hddPath, "game.dat")); err != nil {
		t.Errorf("expected %q on HDD to exist: %v", hddPath, err)
	}

	// Promote back
	if err := PromoteCustom(ctx, Options{}, hdd, ssd, gameDirName); err != nil {
		t.Fatalf("PromoteCustom generic: %v", err)
	}

	if IsJunction(ssdPath) {
		t.Errorf("expected %q on SSD to NOT be a junction", ssdPath)
	}
}
