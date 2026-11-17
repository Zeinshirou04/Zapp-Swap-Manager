# Plan 060: Remove from SSD, Queue-Batched Steam Lifecycle, Scanner Fixes, & Details Action Dropdown (v0.3.3-beta.4)

## Goal
1. Add a **Remove from SSD** (`remove`) operation that frees SSD cache space **without** mirroring or overwriting the existing HDD master copy (strictly refusing if no verified non-empty HDD copy exists).
2. Improve Steam lifecycle handling during transfers with **queue-batched Steam close/relaunch** (close Steam once before a batch of manifest-moving jobs and only relaunch once the queue drains, using `steam.exe -shutdown` with `steam://exit` fallback).
3. Fix scanner ghost-entry bugs where uninstalled Steam games (e.g., empty/leftover folders in `steamapps/common` or stale/duplicate `.acf` manifests) stay listed as installed on SSD.
4. Update `GameDetailView` to display a **Storage Actions dropdown** beside **Play Game** with **Backup to HDD**, **Evict to HDD**, and **Remove from SSD** (grid cards continue showing only **Play** / **Move to SSD**).
5. Bump version to `0.3.3-beta.4` across all components for release after PR merge.

## Safety Analysis (per `docs/safety.md`)
- **`RemoveSSD` (Steam)**:
  1. Validate `installDir` and verify HDD master folder (`<hdd>/steamapps/common/<installdir>`) exists and is non-empty (`CheckSource`). Verify SSD folder path (`CheckDestination`). Never writes to or mirrors HDD.
  2. Move `appmanifest_<appid>.acf` from SSD `steamapps` to HDD `steamapps` (idempotent if already moved).
  3. Strictly after steps 1–2 succeed, delete `<ssd>/steamapps/common/<installdir>`.
- **`RemoveSSDCustom` (Non-Steam)**:
  1. Validate `installDir`, verify HDD master copy exists and is non-empty (`CheckSource`), verify SSD path (`CheckDestination`). Never writes to HDD.
  2. Delete SSD folder.
  3. Create NTFS directory junction on SSD pointing to HDD target.
- **SQLite migration**: `jobs` table `CHECK` constraint migrated idempotently on existing databases to allow `'remove'`.

## Scope
- `api/openapi.yaml`: Add `remove` to `CreateJobRequest.type` and `Job.type` enums.
- `core/`:
  - `internal/queue/`: `TypeRemove`, SQLite CHECK constraint migration, `HasQueuedManifestJobs()`.
  - `internal/transfer/`: `RemoveSSD`, `RemoveSSDCustom`, and unit tests.
  - `internal/steam/`: `CloseSteamGracefully` (`steam.exe -shutdown` + fallback), scanner fixes for stale/duplicate manifests & leftover uninstall folders, `ClearSizeCache()`, and unit tests.
  - `internal/service/`: Handle `TypeRemove`, queue-batched Steam close/relaunch, clear size cache after jobs.
  - `internal/api/`: Pre-validate `remove` jobs require `active_ssd` + `HasHDDBackup`, unit tests.
- `desktop/`:
  - `src/types/api.ts`: Add `'remove'` to `JobType`.
  - `src/components/GameDetailView.tsx`: Play Game + Storage Actions dropdown (`Backup to HDD`, `Evict to HDD`, `Remove from SSD`).
  - `src/components/SwapConfirmModal.tsx`: Space projection (`hddDelta = 0`, `ssdDelta = +sizeBytes`), clear warning that SSD changes are discarded while HDD remains untouched, block if `!hasHddBackup`.
  - `src/components/QueueMonitor.tsx`, `ActiveTransferBanner.tsx`, `GameCard.tsx`, `App.tsx`: Friendly labels and routing for `remove`.
  - Update unit tests & `.agents/skills/zapp-ui-design/SKILL.md`.
- Release bump: `0.3.3-beta.4` across `core/`, `desktop/`, `mobile/`, `server/`, and `.github/workflows/release.yml`.
