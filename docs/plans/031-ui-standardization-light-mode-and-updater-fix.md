# Plan 031: UI Standardization, Light Mode First, Storage Metrics, and Updater Fix

## Goal
Standardize the desktop UI with a clean Light Mode theme, a single focused brand color, standardized drive naming ("Steam Library (C: Drive)" in Camel Case), removal of AI-style pill badges and redundant tags ("Ready on Fast SSD"), clear distinction prioritizing Steam Library storage size over drive size, accurate before/after freed space calculations in transfer modals, improved thumbnail fallbacks, and fix updater freeze at 100%.

## Scope
Folder: `desktop`, `core`
Branch: `feat/desktop-ui-standardization-and-updater-fix`

## Steps
0. **Branch Setup**:
   Ensure local `main` is up to date, then check out the task branch:
   ```bash
   git checkout main
   git pull
   git checkout -b feat/desktop-ui-standardization-and-updater-fix
   ```

1. **Tauri Updater Freeze Fix**:
   - In `desktop/src-tauri/tauri.conf.json`:
     Add `"windows": { "installMode": "passive" }` to `plugins.updater`.
   - In `desktop/src/api/updater.ts`:
     When `download` finishes, call `stop_core_daemon`, call `update.install()`, and immediately trigger `relaunch_app` so `zapp-desktop.exe` releases file locks on itself and lets the passive NSIS installer complete seamlessly without freezing.
   - In `desktop/src/components/UpdateNotification.tsx`:
     Update state flow: when download reaches 100%, show "Installing update..." and progress bar in full, then relaunch smoothly instead of stalling or freezing.

2. **UI Standardization & Light Mode First**:
   - `desktop/src/index.css`:
     - Declare support for light and dark themes with `color-scheme: light dark` on `:root` and in `index.html`.
     - Standardize clean Light Mode palette with a single cohesive primary color (clean modern Royal Blue `#2563eb`, `#1d4ed8`):
       - `--bg-main: #f8fafc;`
       - `--bg-card: #ffffff;`
       - `--bg-card-hover: #f1f5f9;`
       - `--text-main: #0f172a;`
       - `--text-muted: #64748b;`
       - `--border-color: #e2e8f0;`
       - `--primary: #2563eb;`
       - `--primary-hover: #1d4ed8;`
     - Provide matching Dark Mode via `@media (prefers-color-scheme: dark)` or `.dark` class.
     - Remove excessive colored pill badges (`.badge-ssd`, `.badge-hdd`), remove glowing neon borders.
     - Standardize clean minimalist buttons, cards, and input fields.

3. **Standardized Drive Naming ("Steam Library (C: Drive)")**:
   - In `core/internal/api/handlers.go`:
     When registering or exposing libraries, format `Name`:
     Extract the drive letter/volume (e.g. `C:`).
     If path contains "steam" (case-insensitive):
       `Name: fmt.Sprintf("Steam Library (%s Drive)", vol)`
     Otherwise:
       `Name: fmt.Sprintf("Games Library (%s Drive)", vol)`
   - In `desktop/src/utils/format.ts`:
     Helper `formatLibraryDisplayName(lib: Library)` that guarantees standard Camel Case `"Steam Library (C: Drive)"` even if path or name is legacy.

4. **De-clutter Game Cards & Remove Redundant Badges**:
   - In `desktop/src/components/GameCard.tsx`:
     - Remove the annoying pill badge `Ready on Fast SSD` and `Stored on HDD Master`.
     - Remove `Custom / Non-Steam` pill banner.
     - Keep clean metadata: `game.name`, subtitle with size and library name (e.g. `12.4 GB • Steam Library (C: Drive)`).
     - Inline job progress bar when an active transfer is running.

5. **Prioritize Steam Library Storage Size over Drive Size**:
   - In `desktop/src/components/DrivesOverview.tsx`:
     - Calculate `libraryGamesSize` = sum of `game.size_bytes` for games in this library.
     - Primary metric prominently displayed: **Steam Library Size**: e.g. `142.5 GB` across `12 games`.
     - Secondary metric: **Drive Storage**: Free `420.0 GB` of `1.0 TB` total drive capacity.
     - Dual segmented or clean relative progress bar showing Library share of drive vs other data vs free space.
   - In `desktop/src/components/DashboardView.tsx`:
     - Update metric cards to prioritize Library Size (SSD games size / HDD games size) before total drive volume metrics.
     - Remove flashy gradient background banners and neon pills.

6. **Fix Before-and-After Freed Space in SwapConfirmModal**:
   - In `desktop/src/components/SwapConfirmModal.tsx`:
     - Fix `hddFreeAfter`:
       - For `backup`: `hdd.free_bytes - action.sizeBytes` (target HDD uses game size).
       - For `evict`: `hdd.free_bytes - (isAlreadyBackedUp ? 0 : action.sizeBytes)`, and SSD frees `ssd.free_bytes + action.sizeBytes`.
       - For `promote`: `ssd.free_bytes - action.sizeBytes`, and HDD frees `hdd.free_bytes + action.sizeBytes`.
     - Correctly display actual projected free space on both drives instead of hardcoded identical numbers.

7. **Game Artwork Fallbacks & Thumbnail Improvements**:
   - In `desktop/src/components/GameCard.tsx`:
     - Add cloudflare steam CDN as primary / fallback: `https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/${game.app_id}/header.jpg` and `capsule_616x353.jpg`.
     - When an image fails to load or for custom games:
       Render a sleek, elegant card cover with the game's title, initial letter badge, and game controller icon on a clean neutral slate background instead of an empty plain gradient.

8. **Custom Game Junction Size in Core Scanner**:
   - In `core/internal/steam/scanner.go`:
     - Ensure custom game sizes are resolved from target folders when scanned via junctions so `SizeOnDisk` is never 0.

9. **Verification**:
   - Run `just check` to ensure all core tests, desktop lint/build/tests, and mobile checks pass.

## Files to touch
- `docs/plans/031-ui-standardization-light-mode-and-updater-fix.md`
- `desktop/src-tauri/tauri.conf.json`
- `desktop/src/api/updater.ts`
- `desktop/src/components/UpdateNotification.tsx`
- `desktop/src/index.css`
- `desktop/index.html`
- `desktop/src/utils/format.ts`
- `desktop/src/components/GameCard.tsx`
- `desktop/src/components/DrivesOverview.tsx`
- `desktop/src/components/DashboardView.tsx`
- `desktop/src/components/SwapConfirmModal.tsx`
- `desktop/src/components/Sidebar.tsx`
- `desktop/src/components/Titlebar.tsx`
- `core/internal/api/handlers.go`
- `core/internal/steam/scanner.go`
- `core/internal/api/api_test.go`
- `core/internal/steam/scanner_test.go`
- `desktop/src/test/*`

## Out of scope
- Mobile app redesign.
- Changes to job queue SQLite schema.
- Changes to OpenAPI YAML endpoints.

## Acceptance checks
- [ ] `just check` passes with 0 errors (core vet & tests, desktop lint, build & tests).
- [ ] UI is standardized with clean Light Mode first and single focused primary color.
- [ ] No AI-style pills (`Ready on Fast SSD`, `SSD Cache`, `HDD Master` tags removed from game artwork).
- [ ] Drive names standardized in Camel Case e.g. `Steam Library (C: Drive)`.
- [ ] Steam Library storage size prioritized before Drive size.
- [ ] SwapConfirmModal displays accurate before and after freed space numbers.
- [ ] Fallback artwork renders title and icon for games without Steam CDN thumbnails.
- [ ] Updater config set to passive install and cleanly triggers relaunch without freezing.

## Safety
Touches move/delete/manifest code? No. Only UI presentation, library name display, and updater execution flags.
