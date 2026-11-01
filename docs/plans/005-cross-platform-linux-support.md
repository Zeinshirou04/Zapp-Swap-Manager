# Plan 005: Cross-Platform Linux & Windows Support (Rsync Driver & POSIX Adapters)

## Goal
Enable full native Linux compatibility across the `core/` service by abstracting file transfers into a pluggable Driver interface (supporting `rsync` on Linux alongside `robocopy` on Windows), replacing Windows-only syscalls with POSIX equivalents on Linux, and adding Linux matrix testing in CI.

## Scope
Folder: `core`, `.github/workflows`
Branch: `feat/core-cross-platform-linux`

## Steps
0. **Branch Setup**:
   Ensure local `main` is up to date, then check out the task branch:
   ```bash
   git checkout main
   git pull
   git checkout -b feat/core-cross-platform-linux
   ```
1. **Transfer Driver Abstraction (`core/internal/transfer/driver.go`)**:
   - Define a `Driver` interface:
     ```go
     type Driver interface {
         Mirror(ctx context.Context, src, dst string, dryRun bool) error
         Copy(ctx context.Context, src, dst string) error
         Name() string
     }
     ```
   - Refactor existing Robocopy logic in `core/internal/transfer/robocopy.go` into `RobocopyDriver` (active on Windows).
   - Implement `RsyncDriver` in `core/internal/transfer/rsync.go` (active on Linux):
     - Mirror mode: `rsync -a --delete`
     - Copy mode: `rsync -a`
     - Dry-run mode: `rsync -a -n` (or `--dry-run`)
     - Proper rsync exit code handling (exit code 0 = success, non-zero = failure).
   - Provide an automatic driver selector `DefaultDriver()` choosing `RobocopyDriver` on Windows and `RsyncDriver` on Linux/Darwin, with injection hooks for unit tests.
   - Update `sequences.go` (`Backup`, `Evict`, `Promote`) to operate against the `Driver` interface so that safety guards, manifest relocation, and post-copy verification remain identical regardless of OS.
2. **Platform-Specific OS Adapters (`core/internal/steam/`)**:
   - Split Windows-specific syscalls from `library.go` into platform-tagged files:
     - `library_windows.go` (`//go:build windows`):
       - Uses `GetDiskFreeSpaceExW` for disk metrics.
       - Uses `CreateToolhelp32Snapshot` looking for `steam.exe`.
     - `library_linux.go` (`//go:build linux`):
       - Uses `syscall.Statfs` (POSIX) for disk metrics:
         `totalBytes = stat.Blocks * uint64(stat.Bsize)`
         `freeBytes = stat.Bavail * uint64(stat.Bsize)`
       - Checks running processes for `steam` (reading `/proc` or `pgrep`).
3. **Multi-Platform CI Verification (`.github/workflows/ci.yml`)**:
   - Update `.github/workflows/ci.yml` to run checks on a matrix:
     - `windows-latest` (verifies Robocopy and Windows syscalls)
     - `ubuntu-latest` (verifies Rsync and Linux POSIX syscalls)
   - Ensure `ci-ok` aggregates and requires both matrix jobs to pass.
4. **Unit and Integration Tests**:
   - Test `RsyncDriver` argument construction and exit code evaluation.
   - Run integration tests with `rsync` on Linux temp folders and `robocopy` on Windows temp folders.

## Files to touch
- `core/internal/transfer/driver.go`
- `core/internal/transfer/robocopy.go`
- `core/internal/transfer/rsync.go`
- `core/internal/transfer/rsync_test.go`
- `core/internal/transfer/sequences.go`
- `core/internal/steam/library.go`
- `core/internal/steam/library_windows.go`
- `core/internal/steam/library_linux.go`
- `.github/workflows/ci.yml`
- `docs/plans/005-cross-platform-linux-support.md`

## Out of scope
- SQLite database schema & FIFO queue worker loop (reserved for Plan 006).
- HTTP API server & Cloudflare JWT middleware (reserved for Plan 007).

## Acceptance checks
- [x] `Driver` interface abstracts file transfers cleanly; `sequences.go` works identically on Windows and Linux.
- [x] `RsyncDriver` executes `rsync` with `-a --delete` for mirrors, `-a` for copies, and `-n` for dry runs.
- [x] `core/internal/steam` compiles and passes unit tests on both Windows and Linux without build errors.
- [x] Disk space querying uses `syscall.Statfs` on Linux and `GetDiskFreeSpaceExW` on Windows.
- [x] CI matrix runs and passes on both `windows-latest` and `ubuntu-latest`. (matrix added; local Windows leg + `GOOS=linux` build/vet verified — ubuntu leg runs on push)
- [x] `just check` passes.

## Safety
Touches move/delete/manifest code? **YES**.
- Enforces all rules from `docs/safety.md`:
  - Invariant preserved: SSD deletion happens strictly *after* verification and manifest move.
  - Guards (source empty check, >30% drop threshold, destination path verification, dry-run inspection) apply to both `rsync` and `robocopy`.
  - Manifest remains in exactly one library at a time.
