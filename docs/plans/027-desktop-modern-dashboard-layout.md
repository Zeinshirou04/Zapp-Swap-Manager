# Plan 027: Desktop Modern Dashboard Layout & Browser-Style Titlebar

## Goal
Revamp the Desktop UI from a single-column layout into a modern application dashboard layout featuring a browser-style custom titlebar (with back/forward navigation, address breadcrumb, refresh, and settings), a dedicated left navigation sidebar, and distinct content sections (Dashboard overview, Games library, Drives & Storage, and Transfer Queue), while bumping the version to `0.2.6` to allow testing the in-app cloud auto-updater.

## Scope
Folders: `desktop`, `core`, `.github`, `docs`
Branch: `feat/desktop-modern-dashboard-layout`

## Background & Problem
1. Currently, all desktop views (`Header`, `DrivesOverview`, `QueueMonitor`, `GameList`) are stacked sequentially in a single scrolling column.
2. The user requested a real dashboard layout:
   - Top Titlebar matching application theme (VSCode/Browser-style) with Back/Forward history buttons, Refresh button, Address/Route pill, and Settings.
   - Left Sidebar with Home/Dashboard, Games, Drives, and Queue navigation.
   - Content Section dedicated to the active view, starting with a Home/Dashboard overview containing stats, drive meters, and quick actions.
3. The user specifically asked: *"Can work now so i can try the update feature"* — bumping to `0.2.6` and triggering a release will allow testing the one-click in-app updater from the currently installed `0.2.5` application.

## Implementation Steps

1. **Browser-Style Titlebar Component (`desktop/src/components/Titlebar.tsx`)**:
   - Header with `data-tauri-drag-region` for native window dragging.
   - Browser navigation buttons:
     - Back (`ChevronLeft`): navigates to previous route in history stack.
     - Forward (`ChevronRight`): navigates forward in history stack.
     - Refresh (`RefreshCw`): triggers active data reload (`loadData`).
   - Omnibox / route breadcrumb indicator (`zapp://dashboard`, `zapp://games`, etc.).
   - Logo / Home button.
   - Core connection status badge dropdown with online status, restart, and disconnect actions.
   - Quick settings button.

2. **Sidebar Component (`desktop/src/components/Sidebar.tsx`)**:
   - Left vertical navigation pane.
   - Nav items with active state styling and badge counts:
     - **Dashboard (Home)**: System overview, stats, recent transfers.
     - **Games Library**: Full game catalog, filters, search.
     - **Drives & Storage**: Drive capacities and Steam/non-Steam library directories.
     - **Transfer Queue**: Transfer queue and progress monitoring.
     - **Settings**: Connection and updater preferences.
   - Bottom status section displaying Steam execution status and app version (`v0.2.6`).

3. **Dashboard View Component (`desktop/src/components/DashboardView.tsx`)**:
   - Quick metrics cards (Total Games, SSD NVMe Cache, HDD Cold Storage, Active Transfers).
   - High-level Drives Overview card.
   - Active Transfer Progress banner (if jobs are running).
   - Quick action game drawer highlighting installed games on SSD with 1-click swap.

4. **App Architecture & Navigation (`desktop/src/App.tsx` & `desktop/src/index.css`)**:
   - State-driven route management with history stack (`history`, `historyIndex`, `navigate`, `goBack`, `goForward`).
   - Modern CSS Grid layout (`titlebar`, `sidebar`, `main content`) following `css-layout` principles with logical properties and clean scrolling.

5. **Version Bump to `0.2.6`**:
   - Update `desktop/package.json` to `0.2.6`.
   - Update `desktop/src-tauri/Cargo.toml` to `0.2.6`.
   - Update `desktop/src-tauri/tauri.conf.json` to `0.2.6`.
   - Update `core/cmd/zapp-core/main.go` to `0.2.6`.
   - Update `core/cmd/zapp-core/winres.json` to `0.2.6.0`.

6. **Verification & Tests**:
   - Write comprehensive unit tests for `Titlebar`, `Sidebar`, and `DashboardView`.
   - Run `just check` to ensure all tests, linters, and builds pass.
   - Create PR `feat/desktop-modern-dashboard-layout` for user merge, then push `v0.2.6` tag.

## Acceptance Checks
- [ ] Browser-style Titlebar renders with working Back, Forward, and Refresh buttons.
- [ ] Sidebar switches views cleanly between Dashboard, Games, Drives, and Queue.
- [ ] Dashboard view shows overview stats, drive meters, and quick game actions.
- [ ] `just check` passes with 0 errors across core, desktop, and mobile.
- [ ] Version bumped to `0.2.6` across all manifests.

## Safety
Touches move/delete/manifest code? No. Frontend UI architecture, layout styling, and version metadata only.
