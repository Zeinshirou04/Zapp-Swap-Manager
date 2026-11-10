# Plan 049: Brand Color Tokens and Updater Fix

## Goal
Integrate official Zapp design color tokens (Volt & Ink semantic light and dark themes) into the desktop app and fix the updater/uninstaller failure caused by locked processes and installMode constraints.

## Scope
Folder: desktop
Branch: `feat/desktop-tokens-and-updater-fix`

## Steps
0. **Branch Setup**:
   Ensure local `main` is up to date, then check out the task branch:
   ```bash
   git checkout -b feat/desktop-tokens-and-updater-fix
   ```
1. **Design Color Tokens**:
   - Update `desktop/src/index.css` to adopt the official semantic color variables from `tokens.json` & `zapp-tokens.css`:
     - Light theme: Ink neutrals (`--bg-main: #FAFAFC`, `--bg-card: #FFFFFF`, `--text-main: #1C1B20`, `--text-muted: #5B5A60`, `--border-color: #E8E7EB`), Volt brand accents (`--primary: #6246EA`, `--primary-hover: #4C29C5`, `--primary-subtle: rgba(98, 70, 234, 0.1)`).
     - Dark theme: Dark Ink neutrals (`--bg-main: #1C1B20`, `--bg-card: #27262B`, `--text-main: #FFFFFF`, `--text-muted: rgba(255, 255, 255, 0.6)`, `--border-color: rgba(255, 255, 255, 0.1)`), Volt brand accents (`--primary: #6246EA`, `--primary-hover: #4C29C5`, `--primary-text: #9F9EFE`, `--primary-subtle: rgba(98, 70, 234, 0.2)`).
     - Drive indicators: SSD (`--ssd-color: #6246EA` in light, `#9F9EFE` in dark), HDD (`--hdd-color: #5B5A60` in light, `rgba(255, 255, 255, 0.6)` in dark).
     - Standard semantic alerts (success, warning, danger, info) matching the design token specification.
   - Refactor gradients and hardcoded colors in `LoginView.tsx`, `LibraryWizardModal.tsx`, `GameDetailView.tsx` to use Volt/Ink tokens.
2. **NSIS Installer & Uninstaller Fix**:
   - Create `desktop/src-tauri/windows/hooks.nsh` with `NSIS_HOOK_PREINSTALL` and `NSIS_HOOK_PREUNINSTALL` terminating `zapp-core.exe` and `zapp-desktop.exe` before file operations so Windows file locks do not break updates or uninstalls.
   - Update `desktop/src-tauri/tauri.conf.json`:
     - Set `installMode: "both"` so custom installation locations (like `D:\Programs\Zapp Swap Manager`) and machine installs are respected.
     - Add `installerHooks: "windows/hooks.nsh"`.
3. **In-App Updater Active Job Guard**:
   - Pass `hasActiveJobs` to `UpdateNotification.tsx` to disable or warn against running updates while a game transfer is active.
4. **Verification**:
   - Run `just check` to ensure all tests and linters pass cleanly.

## Files to touch
- `docs/plans/049-brand-color-tokens-and-updater-fix.md`
- `desktop/src/index.css`
- `desktop/src-tauri/tauri.conf.json`
- `desktop/src-tauri/windows/hooks.nsh`
- `desktop/src/components/UpdateNotification.tsx`
- `desktop/src/App.tsx`
- `desktop/src/components/LoginView.tsx`
- `desktop/src/components/LibraryWizardModal.tsx`
- `desktop/src/components/GameDetailView.tsx`

## Out of scope
- Changing core disk transfer logic or robocopy engine.
- Modifying API contract `openapi.yaml`.

## Acceptance checks
- [ ] `just check` passes (desktop tests, linter, core tests).
- [ ] Light and Dark themes use the official Volt/Ink color tokens.
- [ ] NSIS installerHooks terminates background `zapp-core.exe` before uninstall/update.
- [ ] `installMode` supports custom directories (`both`).
- [ ] Update notification warns/blocks if a transfer job is running.

## Safety
Touches move/delete/manifest code? no. (Does not touch core robocopy, manifest parser, or active disk engine).
