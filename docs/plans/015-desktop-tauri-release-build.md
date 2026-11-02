# Plan 015: Desktop Tauri Release Build and Icon Assets

## Goal
Resolve Tauri package version mismatch between NPM packages (`@tauri-apps/api` and `@tauri-apps/cli` at `2.12.x`) and Rust crates (`tauri` and `tauri-build`), and generate complete application icon assets so that `npm run tauri build` succeeds in the release workflow.

## Scope
Folder: desktop
Branch: `fix/desktop-tauri-release-build`

## Steps
0. **Branch Setup**:
   Ensure local `main` is up to date, then check out the task branch:
   ```bash
   git checkout main
   git pull
   git checkout -b fix/desktop-tauri-release-build
   ```
1. **Update Tauri Cargo Dependencies**:
   - Update `desktop/src-tauri/Cargo.toml` to align `tauri` to `"2.12"` and `tauri-build` to `"2.7"` matching installed `@tauri-apps/api@2.12.4`.
2. **Generate Desktop Icon Assets**:
   - Provide clean vector source icon `desktop/app-icon.svg` featuring the Zapp Swap Manager aesthetic (dual swap arrows + controller styling).
   - Generate standard multi-platform icon assets under `desktop/src-tauri/icons/` (`icon.ico`, `icon.png`, `128x128.png`, `Square*Logo.png`, `StoreLogo.png`, etc.) using `npx tauri icon`.
   - Update `desktop/src-tauri/tauri.conf.json` bundle icon array to reference these generated icons.
3. **Verification**:
   - Run `npm run build && npm run tauri build` locally to verify successful binary compilation and bundling.
   - Run `just check` to ensure all linters, formatting, and tests pass.

## Files to touch
- `desktop/app-icon.svg`
- `desktop/src-tauri/Cargo.toml`
- `desktop/src-tauri/tauri.conf.json`
- `desktop/src-tauri/icons/*`
- `docs/plans/015-desktop-tauri-release-build.md`

## Out of scope
- Core service logic or mobile app logic.
- Cloudflare Tunnel or Steam scanner modifications.

## Acceptance checks
- [ ] `just check` passes cleanly
- [ ] `npm run tauri build` produces release artifacts without version mismatch or missing icon errors
- [ ] PR merged to `main` and release workflow completes all builds and publishes release

## Safety
Touches move/delete/manifest code? no.
