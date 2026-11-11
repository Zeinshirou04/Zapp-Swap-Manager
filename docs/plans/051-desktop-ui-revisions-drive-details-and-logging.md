# Plan 051: Desktop UI Revisions, Drive Details Page, Queue History, and Service Logging

## Goal
Implement UI/UX streamline revisions across the Desktop overview, add a dedicated Drive Details Page with settings and game list, modernize the Transfer Queue with real-time active jobs and history, clean up unneeded backgrounds on progress indicators, and resolve core service logging during game transfers.

## Scope
Folders: `desktop/`, `core/`
Branch: `feat/desktop-ui-revisions-and-drive-details`

## Steps
0. **Branch Setup**:
   ```bash
   git checkout main
   git pull
   git checkout -b feat/desktop-ui-revisions-and-drive-details
   ```
1. **Streamline Storage Overview (`DashboardView.tsx` & `DrivesOverview.tsx`)**:
   - Remove redundant top 4 metric cards (Total games, SSD library, HDD library, Transfer queue) from `DashboardView.tsx`; go directly to Drive Storage & Allocation.
   - Remove library ID and "Fast Cache Storage" / "Master Storage" descriptions from cards in `DrivesOverview.tsx`.
   - Remove background and borders from the "Library Games Storage" size display in `DrivesOverview.tsx`, presenting the text plainly.
   - Remove "Drive Used" text label from the capacity progress bar, keeping clean percentage and free/total capacity.
   - Add a clean, recognizable clickable button with an arrow icon (`Drive Details →`) on each drive card without heavy background boxes.
   - Remove the redundant "Configured Storage Paths" box at the bottom of the Drives route in `App.tsx`.
2. **Drive Details Page (`DriveDetailView.tsx`)**:
   - Create `DriveDetailView.tsx`:
     - Header with back navigation, drive name, library ID, and drive role (Fast SSD Cache vs Master HDD Storage).
     - Hardware & storage breakdown: capacity progress bar, free space, total bytes, and filesystem root path.
     - Storage Settings: direct path editing for this drive connected to core `registerLibraries`, updating the configured path for the app and Setup Wizard.
     - Games inside this drive: interactive list and count of all games residing in this drive, with search and transfer actions.
   - Add route/state handling in `App.tsx` (`activeRoute: 'drive-detail'`, `selectedDrive: Library | null`).
3. **Remove Redundant Progress Backgrounds**:
   - In `ActiveTransferBanner.tsx`, remove the box background and border from the transfer status badge (`Moving to Fast SSD`, etc.), rendering clean text and icon.
4. **Transfer Queue & History Revamp (`QueueMonitor.tsx`)**:
   - Fix the bug where running jobs were hidden due to oldest-first `.slice(0, 10)`.
   - Separate transfers into **Active Queue** (`running`, `queued`) and **Transfer History** (`succeeded`, `failed`, `cancelled`).
   - Sort history newest-first.
   - Add rich details: timestamps, transferred / total bytes, target drive, and error messages for failed jobs.
   - Add tab switcher or distinct collapsible sections for Active Queue and Transfer History.
5. **Core Service Logging Fix (`core/internal/logger/` & `core/internal/service/`)**:
   - In `core/internal/logger/logger.go`: Always register `globalRing` with `slog.SetDefault` so in-memory logs are captured for `/logs` even if log file opening fails.
   - In `core/internal/service/service.go`: Add rich structured `slog.Info` logs in `defaultExecutor` when transfers start, step progress occurs, and jobs succeed or fail.
6. **Verification**:
   - Run `just check` to ensure all tests across `core` and `desktop` pass.

## Files to touch
- `docs/plans/051-desktop-ui-revisions-drive-details-and-logging.md`
- `desktop/src/components/DashboardView.tsx`
- `desktop/src/components/DrivesOverview.tsx`
- `desktop/src/components/DriveDetailView.tsx`
- `desktop/src/components/ActiveTransferBanner.tsx`
- `desktop/src/components/QueueMonitor.tsx`
- `desktop/src/App.tsx`
- `desktop/src/components/Sidebar.tsx`
- `desktop/src/test/DashboardView.test.tsx`
- `desktop/src/test/DrivesOverview.test.tsx`
- `desktop/src/test/QueueMonitor.test.tsx`
- `core/internal/logger/logger.go`
- `core/internal/service/service.go`

## Acceptance checks
- [ ] Redundant overview cards and backgrounds are removed.
- [ ] Each drive card has a clear clickable `Drive Details →` button.
- [ ] Drive Detail Page displays hardware info, library ID, drive type, games list, and path configuration.
- [ ] Transfer Queue lists active running jobs and full transfer history sorted newest-first.
- [ ] Background on active transfer progress badge is removed.
- [ ] Core emits structured logs during game transfers and `/logs` captures them.
- [ ] `just check` passes with 100% tests/linting.
