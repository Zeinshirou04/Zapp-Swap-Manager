// Package transfer implements the file transfer engine and the operation
// sequences (Backup, Evict, Promote) from docs/safety.md, behind a pluggable
// Driver interface (robocopy on Windows, rsync on Linux).
//
// Invariants enforced here:
//   - Robocopy exit codes 0-7 are success variants; 8+ are failures
//     (rsync: any non-zero exit code is a failure).
//   - A mirror never runs before an equivalent dry run has been read.
//   - SSD data is deleted only after the HDD copy is verified and the
//     manifest has been moved.
//   - A manifest ends up in exactly one library's steamapps folder at a time.
//
// Paths reaching this package come from whitelisted library roots + a
// manifest installDir (see docs/safety.md "API input"); the openapi contract
// guarantees clients never pass raw paths.
package transfer

import (
	"context"
	"errors"
	"fmt"
	"os/exec"
)

// Mode flags per docs/safety.md "Directions":
// SSD -> HDD uses MIRROR (/MIR); HDD -> SSD uses COPY (/E, never mirror).
const (
	MirrorFlag = "/MIR"
	CopyFlag   = "/E"
	DryRunFlag = "/L"
)

// Common flags: no progress clutter, no file/dir lists, robust retry policy.
var commonFlags = []string{"/NP", "/NFL", "/NDL", "/R:2", "/W:2"}

// Result carries Robocopy's exit code and captured output.
type Result struct {
	ExitCode int
	Output   string
}

// OK reports whether the exit code is a success variant (0-7).
func (r Result) OK() bool { return r.ExitCode < 8 }

// exitBits describes Robocopy's documented exit-code bit flags.
var exitBits = []struct {
	mask int
	name string
}{
	{1, "files copied"},
	{2, "extra files detected"},
	{4, "mismatches detected"},
	{8, "some files or directories could not be processed"},
	{16, "serious error, no files copied"},
}

// ExitCodeError turns a failing Robocopy exit code (>= 8) into a descriptive
// error; any success variant (0-7) returns nil.
func ExitCodeError(code int) error {
	if code >= 0 && code < 8 {
		return nil
	}
	desc := fmt.Sprintf("robocopy exit code %d:", code)
	first := true
	for _, b := range exitBits {
		if code&b.mask != 0 {
			if !first {
				desc += ";"
			}
			desc += " " + b.name
			first = false
		}
	}
	return fmt.Errorf("%s (must be 0-7)", desc)
}

var runRobocopy = runRobocopyReal

// runRobocopyReal executes robocopy.exe and captures its combined output.
// Robocopy signals success variants (0-7) through the process exit code, so
// an exec.ExitError is not an execution failure: decode the code and return
// it in the Result.
func runRobocopyReal(ctx context.Context, src, dst string, flags ...string) (Result, error) {
	cmd := exec.CommandContext(ctx, "robocopy", buildArgs(src, dst, flags...)...)
	out, err := cmd.CombinedOutput()
	res := Result{Output: string(out)}
	var exitErr *exec.ExitError
	if err != nil && !errors.As(err, &exitErr) {
		return res, fmt.Errorf("run robocopy: %w", err)
	}
	if exitErr != nil {
		res.ExitCode = exitErr.ExitCode()
	}
	return res, nil
}

func buildArgs(src, dst string, flags ...string) []string {
	args := []string{src, dst}
	args = append(args, flags...)
	args = append(args, commonFlags...)
	return args
}

// Run executes one Robocopy invocation and enforces the exit-code rule:
// 0-7 pass (the Result is returned), >= 8 fail with a descriptive error.
func Run(ctx context.Context, src, dst string, flags ...string) (Result, error) {
	res, err := runRobocopy(ctx, src, dst, flags...)
	if err != nil {
		return res, err
	}
	return res, ExitCodeError(res.ExitCode)
}

// RobocopyDriver is the Windows transfer driver over robocopy.exe.
type RobocopyDriver struct{}

func (RobocopyDriver) Name() string { return "robocopy" }

func (RobocopyDriver) Mirror(ctx context.Context, src, dst string, dryRun bool) error {
	flags := []string{MirrorFlag}
	if dryRun {
		flags = append(flags, DryRunFlag)
	}
	_, err := Run(ctx, src, dst, flags...)
	return err
}

func (RobocopyDriver) Copy(ctx context.Context, src, dst string) error {
	_, err := Run(ctx, src, dst, CopyFlag)
	return err
}
