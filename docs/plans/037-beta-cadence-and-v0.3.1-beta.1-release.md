# Plan 037: Beta Cadence and v0.3.1-beta.1 Release

## Background & Objectives
Following discussion with the user, we are adopting a structured release cadence:
1. Feature additions and fixes are first published as a **Beta** release (e.g. `0.3.1-beta.1`).
2. A testing/cooldown ("soak") period of 1 to 2 days without new issues qualifies the build for a **Stable** release (e.g. `0.3.1`).
3. For the in-app Tauri auto-updater to correctly pick up the release, GitHub's `latest.json` updater artifact must be generated and published with the release.
4. Version numbers across `core`, `desktop`, `mobile`, and `server` must be synchronized to `0.3.1-beta.1`.

## Scope of Changes
1. **GitHub Actions Workflow (`.github/workflows/release.yml`)**:
   - Update default dispatch tag to `v0.3.1-beta.1`.
   - Ensure dynamic resolution of installer setup `.exe` filenames so `latest.json` always matches the actual bundle artifact output.
   - For beta/pre-release tags (`-beta`, `-alpha`, `-rc`), generate `latest-beta.json` alongside `latest.json`.
   - Maintain `prerelease: false` by default so GitHub exposes `latest.json` through the release download endpoint, allowing current installed apps (v0.3.0) to auto-update.
2. **Version Bump to `0.3.1-beta.1`**:
   - `core/cmd/zapp-core/main.go` -> `0.3.1-beta.1`
   - `core/cmd/zapp-core/winres.json` -> `0.3.1.1`
   - `desktop/package.json` & `desktop/package-lock.json` -> `0.3.1-beta.1`
   - `desktop/src-tauri/Cargo.toml` & `Cargo.lock` -> `0.3.1-beta.1`
   - `desktop/src-tauri/tauri.conf.json` -> `0.3.1-beta.1`
   - `desktop/src/App.tsx`, `SettingsView.tsx`, `SettingsModal.tsx`, `LoginView.tsx`, `SettingsView.test.tsx` -> `v0.3.1-beta.1`
   - `mobile/app/build.gradle.kts` -> `0.3.1-beta.1`
   - `server/internal/api/handlers.go` -> `0.3.1-beta.1`
3. **Verification**:
   - Run `just check`.
   - Open Pull Request and provide instructions for GitHub Release creation.
