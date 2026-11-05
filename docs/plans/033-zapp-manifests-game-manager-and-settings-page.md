# Plan 033: Zapp Manifests, Real Disk Sizes, Game Detail View, and Settings Page

## Context & Objectives
1. **Accurate Steam Game Sizes**: Steam games with live patchers (Wuthering Waves, Genshin Impact, MMOs) report small launcher downloads (15-20 GB) in `appmanifest.acf` while actual game folder sizes are 100+ GB. Core scanner must measure real folder size on disk when larger than manifest `SizeOnDisk`.
2. **Zapp Manifest System for Non-Steam Games**: Instead of blind subfolder scanning, Zapp acts like Steam with its own manifest files (`zappmanifest_<id>.json`) stored in the library or config. Users create and manage game configs with custom names, custom cover URLs, and swap intent.
3. **Game Classification & Status Tags**:
   - SSD games: tagged as **Backed Up** (mirrored on HDD) or **SSD Only** (not yet backed up).
   - HDD games: tagged as **Swappable** (can move to SSD) or **Native HDD** (intended to remain on HDD).
4. **Settings Full Page**: Replace popup modal with a full page in the Sidebar (`activeTab === 'settings'`) with structured sections:
   - Connection & Tokens (core status, token, pairing QR code).
   - Steam Lifecycle & Transfer Preferences (graceful `steam -shutdown` before transfer, relaunch Steam after transfer).
   - System Preferences (Run on Startup, Theme).
   - App Updates.
5. **Game Detail View**: Clicking a game card opens a detail view with hero artwork, folder path, real size, backup status, edit metadata form, and action controls.

## Scope & Components
- `api/openapi.yaml`: Document `/preferences`, `/custom-games` CRUD, and new game metadata fields (`swap_enabled`, `has_hdd_backup`, `is_native_hdd`, `cover_url`).
- `core/`:
  - `internal/steam/`: Folder size recalculation; Zapp manifest read/write (`zappmanifest_<id>.json`).
  - `internal/config/`: Preferences persistence (Steam shutdown/relaunch, startup).
  - `internal/transfer/`: Hooks to gracefully shut down Steam before evict/promote and relaunch Steam after.
  - `internal/api/`: Handlers for preferences and custom game manifests.
- `desktop/`:
  - `components/SettingsView.tsx`: Full settings page replacing `SettingsModal.tsx`.
  - `components/GameDetailView.tsx`: Full game detail view with hero cover, path, size, actions, and metadata editor.
  - `components/AddGameModal.tsx`: Form to register non-Steam game and write Zapp manifest.
  - `components/GameCard.tsx` & `GameList.tsx`: Show tags ("SSD Only", "Backed Up", "Native HDD", "Swappable").
  - `Sidebar.tsx`: Add Settings navigation item.

## Verification
- Core unit & integration tests (`cd core && go test -v ./...` - all packages passed).
- Desktop lint, build, vitest suites (`cd desktop && npm run lint && npm run build && npm test` - 15 test files, 45 tests passed).
- Full repository check via `just check` (passed with code 0).

## Implementation Summary
- **Core Real Disk Size Calculation**: In `core/internal/steam/scanner.go`, `dirSize` calculates actual on-disk folder size; if `dirSize > m.SizeOnDisk`, it dynamically updates the game's disk size so live patchers (WuWa, Genshin, Warframe) show accurate 100+ GB sizes.
- **Core Zapp Manifests**: Created `core/internal/steam/zappmanifest.go` supporting `zappmanifest.json` per game directory with custom name, custom cover URL, swap eligibility, native HDD flag, and tag chips.
- **Core Steam Lifecycle Automation**: Created `core/internal/steam/steam_lifecycle_windows.go` (and `_other.go`) implementing graceful exit via `steam://exit` and restart via `steam://open/main`.
- **Core Preferences & API Endpoints**: Added `/preferences` (GET/PUT) and `/custom-games` (POST/PUT) with SQLite / file persistence and tests in `api_test.go`.
- **Desktop Settings View**: Added `desktop/src/components/SettingsView.tsx` as a full page in the navigation sidebar, featuring Steam lifecycle toggles, core daemon connection & tokens, test connection, restart daemon, system startup, theme preferences, and updater controls.
- **Desktop Custom Game & Detail Manager**: Created `desktop/src/components/AddGameModal.tsx` and `desktop/src/components/GameDetailModal.tsx` allowing users to register and configure non-Steam games, inspect backup status ("Backed Up", "SSD Only", "Swappable", "Native HDD"), and edit metadata.
- **API Contract**: Updated `api/openapi.yaml` documenting `/preferences`, `/custom-games`, `/custom-games/{app_id}`, and new `Game` fields.
