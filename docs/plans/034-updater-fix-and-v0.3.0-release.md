# Plan 034: Updater Freeze Fix and v0.3.0 Release

## Context & Objectives
1. **Fix NSIS Updater Freeze at 100%**:
   - On Windows, NSIS in `/passive` mode hung when updating because `zapp-core.exe` running in background kept `resources/zapp-core.exe` locked.
   - Additionally, calling `relaunch_app` immediately inside `downloadAndInstall` before NSIS could execute caused process collision with the active `zapp-desktop.exe`.
   - Update `stop_core_daemon` in `desktop/src-tauri/src/lib.rs` to terminate any running `zapp-core.exe` before the installer runs.
   - Update `desktop/src/api/updater.ts` to cleanly invoke `stop_core_daemon` and let `update.install()` trigger the Windows installer without calling duplicate relaunch attempts.
2. **Version Bump to `v0.3.0`**:
   - `core/cmd/zapp-core/main.go` & `winres.json` -> `0.3.0`
   - `desktop/package.json`, `package-lock.json`, `tauri.conf.json`, `Cargo.toml` -> `0.3.0`
   - `desktop/src/components/SettingsView.tsx`, `SettingsModal.tsx`, `App.tsx` -> `0.3.0`
   - `mobile/app/build.gradle.kts` -> `0.3.0` (versionCode 3)
3. **Verification**:
   - Run `just check`.
   - Submit PR for review.
   - Upon merge: Build signed artifacts and publish GitHub Release `v0.3.0` with `latest.json`.
