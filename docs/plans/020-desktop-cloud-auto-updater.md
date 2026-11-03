# Plan 020: Desktop Cloud Auto-Updater via Tauri Updater Plugin

## Goal
Enable seamless, cryptographically verified cloud auto-updates directly within the desktop application using Tauri v2's official updater plugin (`@tauri-apps/plugin-updater`) and GitHub Releases, allowing users to update the software with a single click without manually downloading installers.

## Scope
Folder: `desktop`, `.github`
Branch: `feat/desktop-cloud-auto-updater`

## Steps
0. **Branch Setup**:
   Ensure local `main` is up to date, then check out the task branch:
   ```bash
   git checkout main
   git pull
   git checkout -b feat/desktop-cloud-auto-updater
   ```
1. **Configure Tauri v2 Updater Plugin**:
   - Add `tauri-plugin-updater = "2"` to `desktop/src-tauri/Cargo.toml`.
   - Register updater plugin in `desktop/src-tauri/src/lib.rs` / `main.rs`: `.plugin(tauri_plugin_updater::Builder::new().build())`.
   - Install `@tauri-apps/plugin-updater` NPM package in `desktop/package.json`.
   - Generate signing keypair (`npx tauri signer generate`). Store public key in `tauri.conf.json` under `plugins.updater.pubkey`.
   - Configure update endpoint in `tauri.conf.json`:
     `https://github.com/Zeinshirou04/Zapp-Swap-Manager/releases/latest/download/latest.json`.
2. **Update Release CI Pipeline (`.github/workflows/release.yml`)**:
   - Add `TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` support in `Build Desktop App` step.
   - When building Tauri release, Tauri automatically signs `.msi` and `.nsis` and generates `latest.json` containing version, notes, download URLs, and cryptographic signatures.
   - Include `latest.json` in the release assets published to the GitHub Release.
3. **Desktop In-App Update UI (`desktop/src/components/UpdateNotification.tsx`)**:
   - Check for updates on startup (non-intrusively in background) and via manual "Check for Updates" button in Header & Settings.
   - When an update is detected:
     - Surface a sleek notification pill or modal: `🎉 Version vX.Y.Z is available! [View Notes] [Update Now]`.
     - When user clicks "Update Now", display real-time download and installation progress.
     - Prompt user to "Relaunch Now" to restart directly into the new version.
4. **Verification**:
   - Verify updater plugin compiles in Tauri v2 and responds cleanly to `check()`.
   - Verify simulated update payload triggers the update banner and progress display.
   - Run `just check` to ensure all linters, formatting, and tests pass.

## Files to touch
- `desktop/src-tauri/Cargo.toml`
- `desktop/src-tauri/tauri.conf.json`
- `desktop/package.json`
- `desktop/src/components/UpdateNotification.tsx`
- `desktop/src/components/Header.tsx`
- `desktop/src/components/SettingsModal.tsx`
- `desktop/src/App.tsx`
- `.github/workflows/release.yml`
- `docs/plans/020-desktop-cloud-auto-updater.md`

## Out of scope
- Core service binaries update (Core can be bundled alongside desktop updater or updated simultaneously).
- Android mobile client update (handled via Google Play or in-app APK installer in a future plan).

## Acceptance checks
- [x] `just check` passes cleanly
- [x] Tauri updater plugin configured with public key and GitHub Release endpoint
- [x] In-app "Check for Updates" button triggers check and displays up-to-date or update-available state
- [x] Release workflow configured to generate and publish signed `latest.json`
- [ ] PR created and merged to `main`

## Safety
Touches move/delete/manifest code? no. (Tauri auto-updater updates application binary in user space).
