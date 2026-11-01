package transfer

import (
	"context"
	"errors"
	"fmt"
	"os/exec"
	"strings"
)

// Rsync flags per plan 005: mirror = -a --delete, copy = -a,
// dry run = -a -n. The dry run keeps --delete so the safety sequence reads
// the same planned deletions the real mirror would perform.
const (
	RsyncArchiveFlag = "-a"
	RsyncDeleteFlag  = "--delete"
	RsyncDryRunFlag  = "-n"
)

// ensureTrailingSlash ensures the source directory path ends with a slash so
// that rsync copies the directory's contents into destination rather than
// copying the directory itself into destination.
func ensureTrailingSlash(p string) string {
	if strings.HasSuffix(p, "/") || strings.HasSuffix(p, "\\") {
		return p
	}
	return p + "/"
}

// RsyncDriver is the POSIX transfer driver over rsync.
type RsyncDriver struct{}

func (RsyncDriver) Name() string { return "rsync" }

func (RsyncDriver) Mirror(ctx context.Context, src, dst string, dryRun bool) error {
	_, err := runRsync(ctx, ensureTrailingSlash(src), dst, rsyncMirrorArgs(dryRun)...)
	return rsyncExitError(err)
}

func (RsyncDriver) Copy(ctx context.Context, src, dst string) error {
	_, err := runRsync(ctx, ensureTrailingSlash(src), dst, RsyncArchiveFlag)
	return rsyncExitError(err)
}

func rsyncMirrorArgs(dryRun bool) []string {
	args := []string{RsyncArchiveFlag, RsyncDeleteFlag}
	if dryRun {
		args = append(args, RsyncDryRunFlag)
	}
	return args
}

var runRsync = runRsyncReal

// rsyncExitError maps any non-zero rsync exit code to an error; rsync has
// no success variants (unlike robocopy's 0-7).
func rsyncExitError(err error) error {
	if err == nil {
		return nil
	}
	var exitErr *exec.ExitError
	if errors.As(err, &exitErr) {
		return fmt.Errorf("rsync exit code %d", exitErr.ExitCode())
	}
	return fmt.Errorf("run rsync: %w", err)
}

// runRsyncReal executes rsync and captures its combined output. rsync exits
// non-zero on failure, so an exec.ExitError is the failure signal itself.
func runRsyncReal(ctx context.Context, src, dst string, flags ...string) (Result, error) {
	args := []string{src, dst}
	args = append(args, flags...)
	cmd := exec.CommandContext(ctx, "rsync", args...)
	out, cmdErr := cmd.CombinedOutput()
	return Result{Output: string(out)}, cmdErr
}
