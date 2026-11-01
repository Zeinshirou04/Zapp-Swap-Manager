# Plan 004: Robocopy Transfer Engine & Safety Invariants

## Goal
Implement the core file transfer engine using Windows Robocopy, embedding all safety guards, exit-code parsing, manifest moves, and post-copy verification sequences (Backup, Evict, Promote) defined in `docs/safety.md`.

## Scope
Folder: `core`
Branch: `feat/core-robocopy-engine`

## Steps
1. **Robocopy Command Runner (`core/internal/transfer/robocopy.go`)**:
   - Construct and execute `robocopy.exe` commands with Windows-safe arguments:
     - Common flags: `/NP` (no progress percentage clutter), `/NFL` (no file list), `/NDL` (no directory list), `/R:2` (retries), `/W:2` (wait time).
     - Mirror mode: `/MIR` (used for SSD -> HDD backup and eviction).
     - Copy mode: `/E` (used for HDD -> SSD promotion).
     - Dry-run mode: `/L` (list only, used for inspecting planned mirror actions).
   - Parse Robocopy exit codes per `docs/safety.md`:
     - Bitwise 0 through 7 are success variants (0: no files copied, 1: files copied, 2: extra files detected, 4: mismatches detected, etc.).
     - Exit code 8 and above are failures (abort and report error).
2. **Mirror Guards & Path Verification (`core/internal/transfer/guards.go`)**:
   - Enforce mandatory guards before initiating any transfer:
     - **Source Guard**: Source folder must exist and must not be empty.
     - **Threshold Guard**: If previous backup metrics exist, abort if source file count or total size drops by >30% without explicit confirmation.
     - **Destination Guard**: Destination directory must resolve exactly to `<HDD library>\steamapps\common\<installdir>`.
     - **Dry-run Inspection**: Perform `/L` pass before `/MIR` to inspect planned deletions.
3. **Verification Helpers (`core/internal/transfer/verify.go`)**:
   - Compute total file count and byte size of directory trees.
   - Verify that target matches source within tolerance before any destructive operation (SSD cleanup) is permitted.
4. **Operation Sequences (`core/internal/transfer/sequences.go`)**:
   - **`Backup(sourceSSD, targetHDD, installDir)`**:
     - Verify source folder exists and is not empty.
     - Check mirror guards (drop check).
     - Run dry run `/L` then Robocopy `/MIR`.
   - **`Evict(sourceSSD, targetHDD, manifestName, installDir)`**:
     - Step 1: Final mirror SSD $\to$ HDD.
     - Step 2: Verify file count and size match.
     - Step 3: Move `appmanifest_<appid>.acf` from SSD `steamapps/` to HDD `steamapps/`.
     - Step 4: Delete the SSD game folder **strictly after** Steps 2 and 3 succeed.
   - **`Promote(sourceHDD, targetSSD, manifestName, installDir)`**:
     - Step 1: Copy HDD $\to$ SSD (`/E`).
     - Step 2: Verify file count and size match.
     - Step 3: Move `appmanifest_<appid>.acf` from HDD `steamapps/` to SSD `steamapps/`.
     - Step 4: Retain the HDD copy intact as the master backup.
5. **Unit & Integration Tests (`core/internal/transfer/*_test.go`)**:
   - Unit tests for Robocopy exit code parsing and guard evaluation logic.
   - Integration tests executed on Windows temp folders with real `robocopy.exe`, verifying backup, evict, and promote workflows and confirming that SSD deletion is never executed if copy fails.

## Files to touch
- `core/internal/transfer/robocopy.go`
- `core/internal/transfer/guards.go`
- `core/internal/transfer/verify.go`
- `core/internal/transfer/sequences.go`
- `core/internal/transfer/robocopy_test.go`
- `core/internal/transfer/sequences_test.go`
- `docs/plans/004-robocopy-transfer-engine.md`

## Out of scope
- SQLite database schema & FIFO queue worker loop (reserved for Plan 005).
- HTTP API endpoints and Cloudflare JWT authentication (reserved for Plan 006).

## Acceptance checks
- [x] Robocopy exit codes 0-7 evaluate to success; codes $\ge 8$ return descriptive errors.
- [x] Mirror guards block transfers if source is empty, file/size count drops >30%, or target path is unexpected.
- [x] Evict sequence guarantees SSD deletion happens strictly *after* HDD copy verification and manifest move succeed.
- [x] Promote sequence retains HDD copy as master backup and safely relocates the manifest.
- [x] Integration tests pass with real `robocopy.exe` on Windows temp folders.
- [x] `just check` passes.

## Safety
Touches move/delete/manifest code? **YES**.
- Strictly enforces all invariants from `docs/safety.md`:
  - SSD data deleted ONLY after HDD verification succeeds.
  - Manifest lives in exactly one library at a time.
  - Exit code $\ge 8$ treated as failure.
  - Guards prevent mirroring empty or drastically shrunk sources.
