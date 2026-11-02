# Plan 013: User Guide & Setup Documentation

## Goal
Document comprehensive setup, configuration, and end-to-end usage instructions in `README.md` for all three application layers (Core Service, Desktop Dashboard, and Mobile Remote App) along with storage safety operational guidelines.

## Scope
Folder: docs, root (`README.md`)
Branch: `docs/readme-usage-guide`

## Steps
0. **Branch Setup**:
   Ensure local `main` is up to date, then check out the task branch:
   ```bash
   git checkout main
   git pull
   git checkout -b docs/readme-usage-guide
   ```

1. **Update `README.md` with Comprehensive Usage Guide**:
   - **Prerequisites & Steam Library Setup**:
     - SSD hot cache library vs HDD cold master library.
     - Steam library folder layout and manifest placement rules.
   - **Core Service Setup & Daemon Operation**:
     - Configuration file (`config.json` in `%APPDATA%\zapp-swap-manager\config.json`) and environment variables (`ZAPP_*`).
     - CLI flags (`--port`, `--config`, `--headless`).
     - Windows system tray actions (monitoring state, opening dashboard, graceful shutdown).
   - **Desktop Dashboard (Tauri + React)**:
     - Connecting to Core (`http://127.0.0.1:8765` + Bearer token).
     - Storage drive visualization.
     - Game swap operations: Promote (HDD $\to$ SSD), Evict (SSD $\to$ HDD), and Manual Backup.
     - Monitoring and canceling active jobs in the real-time FIFO queue.
   - **Mobile Remote App (Android)**:
     - Installing the sideloaded APK (`zapp-mobile-android.apk`).
     - Remote connectivity via Cloudflare Tunnel (`cloudflared` tunnel pointing to `127.0.0.1:8765`).
     - Cloudflare Access Service Token / JWT setup.
     - Mobile UI usage, offline Room DB caching, and WorkManager background sync.
   - **Operational Safety Best Practices**:
     - Steam state recommendations (quitting Steam or ensuring games are not running/updating during swaps).
     - Storage verification invariants and safe crash recovery.

2. **Verification**:
   - Run `just check` to ensure all tests and linters pass cleanly.
   - Verify all file links in `README.md`.
   - Push branch and open pull request with passing `ci-ok`.

## Files to touch
- `README.md`
- `docs/plans/013-usage-documentation-and-release-prep.md`

## Out of scope
- Code changes in `core/`, `desktop/`, or `mobile/`.
- Modifications to `api/openapi.yaml`.

## Acceptance checks
- [x] `just check` passes
- [x] `README.md` contains complete, step-by-step setup and usage instructions
- [ ] PR created into `main` with passing `ci-ok`

## Safety
Touches move/delete/manifest code? no.
