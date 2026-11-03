# Plan 021: Bundle Core into Desktop Installer & Robust Local Pairing

## Goal
Package `zapp-core.exe` directly inside the Tauri desktop installer (MSI and NSIS) as an all-in-one distribution, and ensure the desktop application auto-pairs with the local authentication token on startup and inside the connection retry loop with transparent error reporting and manual token override.

## Scope
Folder: `desktop`, `.github`
Branch: `fix/desktop-bundle-core-and-auth-pairing`

## Steps
0. **Branch Setup**:
   Ensure local `main` is up to date, then check out the task branch:
   ```bash
   git checkout main
   git pull
   git checkout -b fix/desktop-bundle-core-and-auth-pairing
   ```
1. **Desktop Auto-Pairing & Error Transparency**:
   - In `desktop/src/App.tsx`:
     - Before the initial `/health` probe, call `readLocalAuthToken()`. If found, store it via `setApiConfig` so that if `zapp-core` is already running, the app authenticates seamlessly on launch without requiring manual clicks.
   - In `desktop/src/components/ConnectView.tsx`:
     - Move `readLocalAuthToken()` inside the 30-attempt retry loop so that as soon as `auth.token` is written to disk by the launching core daemon, the token is picked up immediately.
     - Capture the exact error response (e.g. 401 Unauthorized vs offline/refused) and display clear diagnostic messaging instead of a generic timeout message.
     - Provide an optional/editable token input field on the Local tab, auto-populated with the detected token if available, allowing manual verification or override.
2. **Tauri Core Bundling & Binary Resolution**:
   - In `desktop/src-tauri/tauri.conf.json`:
     - Add `"resources": ["../../bin/zapp-core.exe"]` to `bundle` config so Tauri packages the core executable inside the installer.
   - In `desktop/src-tauri/src/lib.rs`:
     - Enhance `find_core_exe` to check:
       1) Alongside `zapp-desktop.exe` (`current_exe().parent().join("zapp-core.exe")`).
       2) In Tauri resource paths (`resource_dir.join("bin/zapp-core.exe")` and `resource_dir.join("zapp-core.exe")`).
       3) Development build location (`../../bin/zapp-core.exe`).
3. **Release Pipeline Integration (`.github/workflows/release.yml`)**:
   - Update `build-desktop` to depend on `build-core` (`needs: [build-core]`).
   - Download the `zapp-core-windows-x64` artifact in `build-desktop` and extract `zapp-core.exe` into `bin/zapp-core.exe` prior to executing `npm run tauri build`.
   - Result: Both NSIS and MSI installers include `zapp-core.exe` out of the box.
4. **Verification**:
   - Update unit tests in `desktop/src/test/ConnectView.test.tsx` to verify token polling and error reporting.
   - Run `just check` to ensure all linters, formatting, and tests pass.
   - Run `npm run tauri build` to verify installer generation with bundled resources.

## Files to touch
- `desktop/src/App.tsx`
- `desktop/src/components/ConnectView.tsx`
- `desktop/src/test/ConnectView.test.tsx`
- `desktop/src-tauri/src/lib.rs`
- `desktop/src-tauri/tauri.conf.json`
- `.github/workflows/release.yml`
- `docs/plans/021-bundle-core-and-robust-local-pairing.md`

## Out of scope
- Steam scanner or Robocopy transfer logic.
- Mobile client changes.

## Acceptance checks
- [ ] `just check` passes cleanly
- [ ] `readLocalAuthToken()` is called inside the connection retry loop and on startup
- [ ] ConnectView shows exact error details if authentication or startup fails
- [ ] Tauri config bundles `zapp-core.exe` in `bundle.resources`
- [ ] `release.yml` passes core binary to desktop build job
- [ ] PR created and merged to `main`

## Safety
Touches move/delete/manifest code? no.
