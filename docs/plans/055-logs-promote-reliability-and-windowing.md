# Plan 055: Logs, Robocopy Streaming, Promote Reliability, and Windows Frame/Z-Order Fix

## Goal
Fix silent logging failure under detached Windows startup, stream live Robocopy transfer progress into service logs, keep job progress accurate (`< 100%`) through verify and manifest move steps while preventing mid-transfer `zappmanifest.json` edits, and harden desktop Win32 windowing for ShareX window selection and Always-On-Top Z-order.

## Scope
Folder: `core`, `desktop`, `docs`
Branch: `fix/core-logs-promote-window`

## Steps
0. **Branch Setup**:
   Create `fix/core-logs-promote-window` from `main`.
1. **Fault-Tolerant Multi-Writer Logger (`core/internal/logger/`)**:
   - Replace `io.MultiWriter` with a `tolerantMultiWriter` so a broken/invalid `os.Stdout` handle (from `DETACHED_PROCESS | CREATE_NO_WINDOW`) never aborts writes to `globalRing` (`GET /logs`) or `zapp-core.log`.
   - Bump `DefaultRingCapacity` to `2000` lines and add unit test covering failing stdout writer.
2. **Live Robocopy Streaming (`core/internal/transfer/robocopy.go`)**:
   - Remove `/NP` and `/NFL` on real copy/mirror transfers (keeping `/NFL /NDL /NP` on `/L` dry runs to avoid listing noise).
   - Stream stdout/stderr via pipes with a `\r`/`\n` scanner (`scanCRorLF`) and throttled `robocopyLogFilter` into `slog` so current files, percentages, retries/errors, and final summary appear live in Logs without flooding the ring buffer.
3. **Accurate Sequence Steps, Progress Stages, and Edit Lock (`core/internal/transfer/`, `core/internal/queue/`, `core/internal/service/`, `core/internal/api/`)**:
   - Wire optional `Options.StepFn` cleanly into `Promote`, `Evict`, `PromoteCustom`, `EvictCustom`, and `Backup` so `service.go` journals granular steps (`copy`/`mirror`, `verify`, `move-manifest`, `delete-ssd`/`create-junction`).
   - Cap `monitorTransfer` during Step 1 Copy/Mirror at `95.0%`, report stage progress at Step 2 Verify (`97.0%`) and Step 3 Manifest/Cleanup (`99.0%`), and let `worker.go` set `100.0%` only on `StatusSucceeded` (preserving last `progress_percent` when `StatusFailed` or `StatusCancelled`).
   - Add `Queue.HasActiveJob(appID)` and reject `PUT /custom-games/{app_id}` and `DELETE /custom-games/{app_id}` with `409 Conflict` while a job for that `app_id` is queued or running (preventing mid-transfer `zappmanifest.json` size mismatches); remove duplicate `foundGame.Tags` assignment in `handlers.go`.
4. **Desktop Transfer & Diagnostic Polish (`desktop/src/`)**:
   - Display `95–99%` stage hints (`Finishing file copy...`, `Verifying file integrity...`, `Finalizing manifest & cleanup...`) and failed stop percentage in `QueueMonitor.tsx`.
   - Lock `GameDetailView` Settings save with an inline warning when an active transfer job is queued/running, and surface `409 Conflict` API errors and startup elevation/UIPI warnings (`App.tsx` toast).
5. **Windows Frame, ShareX Window Selection & Always-On-Top Z-Order Fix (`desktop/src-tauri/`)**:
   - Add `windows-sys` (`0.61`, already present in `Cargo.lock`) under `[target.'cfg(windows)'.dependencies]` in `desktop/src-tauri/Cargo.toml` for Win32 frame/DWM/elevation checks without downloading external crates.
   - In `desktop/src-tauri/src/win_frame.rs` & `lib.rs` (`#[cfg(windows)]`), configure the main window with genuine Win32 caption frame styles + custom `WM_NCCALCSIZE` subclass (`SetWindowSubclass`), `DwmExtendFrameIntoClientArea` (`cyTopHeight = 1`), `DWMWCP_ROUND`, top-edge `WM_NCHITTEST` (`HTTOP`/`HTTOPLEFT`/`HTTOPRIGHT`), explicit `HWND_NOTOPMOST` guard, and `get_window_diagnostics` / runtime elevation warning (`UIPI` check for admin launches from NSIS `installMode: "both"`).
6. **Verify**:
   - Run `just check` and `cargo test` (`desktop/src-tauri`) and inspect all test results cleanly before committing.

## Files to touch
- `docs/plans/055-logs-promote-reliability-and-windowing.md`
- `core/internal/logger/logger.go`, `core/internal/logger/logger_test.go`
- `core/internal/transfer/robocopy.go`, `core/internal/transfer/robocopy_test.go`, `core/internal/transfer/sequences.go`, `core/internal/transfer/sequences_test.go`
- `core/internal/queue/queue.go`, `core/internal/queue/worker.go`, `core/internal/queue/queue_test.go`
- `core/internal/service/service.go`
- `core/internal/api/handlers.go`, `core/internal/api/api_test.go`
- `desktop/src-tauri/Cargo.toml`, `desktop/src-tauri/tauri.conf.json`, `desktop/src-tauri/src/lib.rs`, `desktop/src-tauri/src/win_frame.rs`
- `desktop/src/api/native.ts`, `desktop/src/App.tsx`, `desktop/src/components/QueueMonitor.tsx`, `desktop/src/components/GameDetailView.tsx`
- `desktop/src/test/QueueMonitor.test.tsx`, `desktop/src/test/GameDetailView.test.tsx`
- `.agents/skills/zapp-ui-design/SKILL.md`

## Out of scope
- Grid cover vs. banner artwork schema/UI (Plan 056)
- Media & Captures ShareX/ShadowPlay viewer and clipboard copy (Plan 057)
- Changes to `api/openapi.yaml`

## Acceptance checks
- [x] `just check` passes
- [x] Logs continue writing to ring buffer and log file even when stdout writer returns an error
- [x] Robocopy real copy/mirror streams throttled live progress lines and errors without `/NP`/`/NFL`
- [x] Promote/Evict never report `100%` before `VerifyMatch` + `MoveManifest` succeed; editing a game with an active job returns `409 Conflict`
- [x] Desktop compiles cleanly with Win32 custom caption subclass + `HWND_NOTOPMOST` + elevation diagnostics

## Safety
Touches move/delete/manifest code? Yes (`core/internal/transfer/sequences.go`, `robocopy.go`). Preserves all invariants in `docs/safety.md`: strict `VerifyMatch` before `MoveManifest` / SSD deletion, `/E` only for Promote, `/L` dry run before `/MIR`, raw paths still rejected, and blocks concurrent manifest mutation during active jobs.
