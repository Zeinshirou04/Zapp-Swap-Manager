package transfer

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestExitCodeError(t *testing.T) {
	cases := []struct {
		code    int
		wantOK  bool
		wantMsg string
	}{
		{0, true, ""},
		{1, true, ""},
		{3, true, ""},
		{7, true, ""},
		{8, false, "could not be processed"},
		{9, false, "files copied"},
		{16, false, "serious error"},
		{-1, false, "robocopy exit code"},
	}
	for _, c := range cases {
		err := ExitCodeError(c.code)
		if c.wantOK && err != nil {
			t.Errorf("code %d: expected success, got %v", c.code, err)
			continue
		}
		if !c.wantOK {
			if err == nil {
				t.Errorf("code %d: expected failure, got nil", c.code)
				continue
			}
			if !strings.Contains(err.Error(), c.wantMsg) {
				t.Errorf("code %d: error %q does not mention %q", c.code, err.Error(), c.wantMsg)
			}
		}
	}
}

func TestResultOK(t *testing.T) {
	if !((Result{ExitCode: 7}).OK()) || (Result{ExitCode: 8}).OK() {
		t.Error("OK must accept 0-7 and reject >= 8")
	}
}

// captureRun stubs the runner and records constructed arguments.
func captureRun(t *testing.T, exitCode int) func(src, dst string, flags []string) {
	t.Helper()
	orig := runRobocopy
	calls := 0
	runRobocopy = func(ctx context.Context, src, dst string, flags ...string) (Result, error) {
		calls++
		return Result{ExitCode: exitCode, Output: "stub"}, nil
	}
	t.Cleanup(func() { runRobocopy = orig })
	return func(src, dst string, flags []string) {
		if calls != 1 {
			t.Fatalf("runner called %d times, want 1", calls)
		}
	}
}

func TestRunBuildsCommonFlags(t *testing.T) {
	captureRun(t, 0)
	if _, err := Run(context.Background(), `C:\s`, `C:\d`, MirrorFlag); err != nil {
		t.Fatalf("Run: %v", err)
	}
	got := buildArgs(`C:\s`, `C:\d`, MirrorFlag)
	want := []string{`C:\s`, `C:\d`, "/MIR", "/NP", "/NFL", "/NDL", "/R:2", "/W:2"}
	if len(got) != len(want) {
		t.Fatalf("args = %v", got)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Errorf("args[%d] = %q, want %q", i, got[i], want[i])
		}
	}
}

// stubRunner forces the runner outcome for failure-path tests.
func stubRunner(t *testing.T, code int, err error) func() {
	t.Helper()
	orig := runRobocopy
	runRobocopy = func(ctx context.Context, src, dst string, flags ...string) (Result, error) {
		return Result{ExitCode: code, Output: "stub output"}, err
	}
	restore := func() { runRobocopy = orig }
	t.Cleanup(restore)
	return restore
}

func makeTree(t *testing.T, root string, files map[string]int) {
	t.Helper()
	for name, size := range files {
		p := filepath.Join(root, name)
		if err := os.MkdirAll(filepath.Dir(p), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(p, make([]byte, size), 0o644); err != nil {
			t.Fatal(err)
		}
	}
}

func TestCheckSource(t *testing.T) {
	missing := filepath.Join(t.TempDir(), "nope")
	if err := CheckSource(missing); err == nil {
		t.Error("missing folder must fail")
	}
	empty := t.TempDir()
	if err := CheckSource(empty); err == nil || !strings.Contains(err.Error(), "empty") {
		t.Errorf("empty folder should fail: %v", err)
	}
	full := filepath.Join(t.TempDir(), "g")
	makeTree(t, full, map[string]int{"a.bin": 10})
	if err := CheckSource(full); err != nil {
		t.Errorf("valid source failed: %v", err)
	}
}

func TestCheckDestination(t *testing.T) {
	lib := `D:\HDDLib`
	// Engine builds dest via gameFolder (private), so recreate here.
	want := ExpectedGameFolder(lib, "Terraria")
	// The expected shape must end exactly in steamapps\common\<installdir>.
	if !strings.EqualFold(want, filepath.Join(lib, "steamapps", "common", "Terraria")) {
		t.Errorf("ExpectedGameFolder = %q", want)
	}
	if err := CheckDestination(want, lib, "Terraria"); err != nil {
		t.Errorf("correct destination rejected: %v", err)
	}
	if err := CheckDestination(filepath.Join(lib, "games", "Terraria"), lib, "Terraria"); err == nil {
		t.Error("unexpected destination must be rejected")
	}
	if err := CheckDestination(filepath.Join(lib, "steamapps", "common", "Terrariax"), lib, "Terraria"); err == nil {
		t.Error("appended path must be rejected")
	}
}

func TestValidateInstallDir(t *testing.T) {
	bad := []string{"", "..", `..\evil`, `C:\abs`, `a\..\b`}
	for _, b := range bad {
		if err := validateInstallDir(b); err == nil {
			t.Errorf("installDir %q must be rejected", b)
		}
	}
	if err := validateInstallDir("Terraria"); err != nil {
		t.Errorf("normal installDir rejected: %v", err)
	}
}

func TestCheckDropGuard(t *testing.T) {
	src := filepath.Join(t.TempDir(), "game")
	makeTree(t, src, map[string]int{"a.bin": 100, "b.bin": 100})

	if err := CheckDropGuard(src, nil, false); err != nil {
		t.Errorf("nil metrics should pass: %v", err)
	}
	// >30% drop: refuse without confirmation, allow with.
	last := TreeStats{Files: 2, Bytes: 1000}
	if err := CheckDropGuard(src, &last, false); err == nil {
		t.Error("80% byte drop without confirmation must fail")
	}
	if err := CheckDropGuard(src, &last, true); err != nil {
		t.Errorf("80%% byte drop with confirmation should pass: %v", err)
	}
	// Small drop: pass.
	last = TreeStats{Files: 2, Bytes: 200}
	if err := CheckDropGuard(src, &last, false); err != nil {
		t.Errorf("5%% drop should pass: %v", err)
	}
	// Missing/empty source fails regardless.
	tiny := filepath.Join(t.TempDir(), "emptygame")
	if err := CheckDropGuard(tiny, nil, false); err == nil {
		t.Error("empty source must fail")
	}
}

func TestVerifyMatch(t *testing.T) {
	base := t.TempDir()
	src := filepath.Join(base, "src")
	dst := filepath.Join(base, "dst")
	makeTree(t, src, map[string]int{"a.bin": 10, "sub/b.bin": 400})
	makeTree(t, dst, map[string]int{"a.bin": 10, "sub/b.bin": 400})
	if err := VerifyMatch(src, dst); err != nil {
		t.Errorf("identical trees must match: %v", err)
	}
	if err := os.Truncate(filepath.Join(dst, "sub", "b.bin"), 400-1); err != nil {
		t.Fatal(err)
	}
	if err := VerifyMatch(src, dst); err == nil {
		t.Error("size mismatch must fail")
	}
	if err := os.Remove(filepath.Join(dst, "a.bin")); err != nil {
		t.Fatal(err)
	}
	if err := VerifyMatch(src, dst); err == nil {
		t.Error("file count mismatch must fail")
	}
}

func TestMoveManifest(t *testing.T) {
	base := t.TempDir()
	from := filepath.Join(base, "a", "steamapps", "appmanifest_1.acf")
	to := filepath.Join(base, "b", "steamapps", "appmanifest_1.acf")
	if err := os.MkdirAll(filepath.Dir(from), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(from, []byte("manifest data"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := MoveManifest(from, to); err != nil {
		t.Fatalf("MoveManifest: %v", err)
	}
	if _, err := os.Stat(from); !os.IsNotExist(err) {
		t.Error("source manifest must be gone after move")
	}
	data, err := os.ReadFile(to)
	if err != nil || string(data) != "manifest data" {
		t.Errorf("moved manifest wrong: %v %q", err, data)
	}
	// Refuse overwrite: re-create source and try again onto existing dest.
	if err := os.WriteFile(from, []byte("other data"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := MoveManifest(from, to); err == nil || !strings.Contains(err.Error(), "refusing") {
		t.Errorf("move onto existing manifest must refuse, got %v", err)
	}
	if _, err := os.Stat(from); err != nil {
		t.Error("refused move must keep the source manifest")
	}
}
