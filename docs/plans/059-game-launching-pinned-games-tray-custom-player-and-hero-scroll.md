# Plan 059: Game Launching, Pinned Games, Dynamic Core Tray Menu, Custom Media Player, and Hero Scroll Seam Fix

## Goal
Enable direct game launching from Zapp Manager (prioritizing Play over move/backup for active games), add game pinning with top-of-list sorting, dynamically render pinned games and an "Open Zapp Manager" app launcher in the Core Windows tray menu, eliminate the hero banner subpixel scroll gap/leak in Game Details, and replace default browser media elements with a custom image viewer (zoom/pan/copy) and custom video player (seeking, ±5s jump, volume, fullscreen, ready for trimming).

## Scope
Folder: `api`, `core`, `desktop`, `docs`
Branch: `feat/game-launch-pinned-tray-player`

## Steps

0. **Branch Setup**:
   Ensure local `main` is clean, then check out task branch:
   ```bash
   git checkout main
   git pull
   git checkout -b feat/game-launch-pinned-tray-player
   ```

1. **API Contract (`api/openapi.yaml`)**:
   - Extend `Game` schema with:
     - `is_pinned: boolean` (indicates whether the game is pinned to the top of lists and tray).
   - Add `POST /games/{app_id}/launch`:
     - Triggers launch of the game via Steam protocol (`steam://run/<app_id>`) for Steam titles or executes the configured/detected launcher for custom games.
     - Returns `{ "launched": true, "app_id": <int64>, "name": "<string>" }`.
   - Add `PUT /games/{app_id}/pin`:
     - Accepts `{ "pinned": boolean }` to set or clear pinned status.
     - Persists safely in Core's `<AppDir>/overrides.json` alongside artwork overrides without mutating game files mid-transfer.

2. **Core Service, Overrides & Launch Handlers (`core/`)**:
   - In `core/internal/api/artwork.go` (or `overrides.go`):
     - Extend `gameOverride` struct with `Pinned bool`.
     - Implement thread-safe `SetPinned(appID int64, pinned bool) error` and `IsPinned(appID int64) bool`.
   - In `core/internal/steam/scanner.go`:
     - Populate `Game.IsPinned` during library scans using the persistent overrides store.
   - In `core/internal/api/handlers.go`:
     - Implement `handleLaunchGame(w, r)`:
       - Validates `app_id`.
       - For Steam games (`!game.IsCustom`): executes `cmd /c start steam://run/<app_id>` with detached/hidden console attributes.
       - For custom games: verifies directory inside configured whitelisted library, checks for executable in manifest or folder, and launches.
       - Returns `200 OK` on successful process trigger.
     - Implement `handleSetPin(w, r)`:
       - Validates `app_id`, updates persistent override, and returns updated game object.
   - In `core/internal/service/service.go`:
     - Expose `svc.LaunchGame(appID int64) error` and `svc.GetPinnedGames() []steam.Game` so internal callers (including the Tray runner) can launch and query pinned games directly.

3. **Core Windows System Tray Dynamic Rebuild (`core/internal/tray/tray_windows.go`)**:
   - Update `tray_windows.go` to dynamically rebuild `r.hMenu` on each tray click (`wmLButtonUp` / `wmRButtonUp`) before calling `TrackPopupMenu`:
     - **Top Section — Pinned Games**:
       - Iterate over `svc.GetPinnedGames()`.
       - If pinned games exist, add each pinned game as an active menu item with command ID `cmdPinnedBase + i` (e.g. `▶ <Game Name>`).
       - If no games are pinned, optionally display a single disabled hint item `(No Pinned Games)`.
       - Append `mfSeparator`.
     - **Middle Section — Application Navigation & Tools**:
       - Replace "Open Web Dashboard" with **"Open Zapp Manager"** (`cmdOpenApp`).
         - Resolves `zapp-desktop.exe` / `Zapp Swap Manager.exe` beside `zapp-core.exe`, in Tauri resource paths, or in development paths; launches or foregrounds the application. Falls back to web dashboard URL if binary is absent.
       - **"Open Logs Folder"** (`cmdLogs`): opens `logger.LogDir()` in Windows Explorer.
     - **Bottom Section — Exit**:
       - Append `mfSeparator`.
       - **"Exit Zapp Swap Manager"** (`cmdExit`): cancels context and terminates cleanly.
   - Handle `cmdPinnedBase + i` in `wndProc`'s `wmCommand` switch by calling `svc.LaunchGame(pinnedAppIDs[i])`.

4. **Desktop UI: Play Button Priority & Pinned Games (`desktop/src/`)**:
   - In `desktop/src/types/api.ts` and `desktop/src/api/client.ts`:
     - Add `is_pinned?: boolean` to `Game` interface.
     - Add `launchGame(appId: number | string)` and `setGamePinned(appId: number | string, pinned: boolean)`.
   - In `desktop/src/components/GameCard.tsx`:
     - **Prioritize Play Button**:
       - When a game is on SSD (`isOnSSD === true`), render a prominent full-width **Play** button (`<Play size={14} /> Play`) instead of the secondary Backup/Evict split buttons.
       - When a game is on HDD, retain **Move to SSD** (`<Zap size={14} /> Move to SSD`) or Native HDD indicator.
       - (Backup and Evict actions remain accessible in the Game Details page and via quick contextual actions).
     - **Pin Affordance**:
       - Add a discrete Pin icon toggle button on the card (top-right overlay or beside title) using `Pin` from `lucide-react`.
       - Visual state: Filled/active purple badge when pinned, subtle hover affordance when unpinned.
       - Toggling calls `setGamePinned` with immediate optimistic update and toast notification.
   - In `desktop/src/components/GameDetailView.tsx`:
     - In the hero banner action buttons:
       - If on SSD: Display prominent **Play Game** primary button (`btn-primary` with `Play` icon) alongside `Backup to HDD` and `Evict to HDD`.
       - If on HDD: Display **Promote to SSD**.
     - Add Pin toggle button beside "Edit Artwork" and "Game Settings".
   - In `desktop/src/components/GameList.tsx` and `desktop/src/components/DashboardView.tsx`:
     - Sort pinned games (`is_pinned === true`) to the top of all game views while preserving secondary user sort preferences (name, size, last played).

5. **Desktop UI: Hero Banner Scroll Gap & Acrylic Blur Seam Fix (`GameDetailView.tsx`)**:
   - Resolve the visual gap/leak where scrolling pulls down or exposes the hero banner edge:
     - Wrap hero banner and background acrylic scrim in a dedicated container with `overflow: hidden`, `contain: paint`, and hardware acceleration (`transform: translateZ(0)`).
     - Fix outer flex spacing: eliminate excessive bottom margin/gap disconnects between the acrylic scrim and the section grid below.
     - Ensure the frosted acrylic scrim gradient transitions 100% solidly into `var(--bg-main)` at its bottom edge without subpixel clipping leaks or transparency seams.
     - Add subtle border divider matching Volt & Ink tokens to create a crisp transition when scrolling content passes underneath.

6. **Desktop UI: Custom Media Player & Image Lightbox (`CaptureViewerModal.tsx` & components)**:
   - **Custom Image Viewer**:
     - Replace static `<img>` with an interactive viewport supporting:
       - Zoom In (`+`), Zoom Out (`-`), and Reset / Fit (`100%`) controls.
       - Mouse wheel zoom with clamp (`0.5x` to `4x`).
       - Click-and-drag panning when zoomed.
       - Retain high-fidelity **Copy Image** button (direct RGBA clipboard bitmap writing via `@tauri-apps/plugin-clipboard-manager`).
   - **Custom Video Player**:
     - Remove native browser controls (`controls={false}`).
     - Build custom Volt & Ink video controls bar:
       - Central big Play/Pause overlay + bottom bar Play/Pause toggle.
       - **Seek Forward 5s (`+5s`)** and **Seek Backward 5s (`-5s`)** quick jump buttons.
       - Interactive timeline scrubber bar with loaded buffer indicator, hover time preview, and current time / total duration display.
       - Volume slider with Mute toggle.
       - Fullscreen toggle (`Fullscreen` API).
       - Keyboard shortcuts (`Space` = toggle play, `Left`/`Right` = ±5s, `f` = fullscreen, `m` = mute).
       - **Trimming Architecture**: Include structural hooks (`trimStart`, `trimEnd`, range selection markers) to allow video clip trimming in follow-up enhancements.

7. **Living Design Skill & Tests**:
   - Update `.agents/skills/zapp-ui-design/SKILL.md` documenting:
     - Play button prioritization over swap actions on SSD cards.
     - Pinned games visual indicator and sorting hierarchy.
     - Custom media player token specifications and controls layout.
     - Hero banner acrylic scroll containment pattern.
   - Add/update unit tests:
     - API tests in `core/internal/api/api_test.go` for launch and pin endpoints.
     - Vitest tests in `desktop/src/test/GameCard.test.tsx`, `desktop/src/test/GameDetailView.test.tsx`, and `desktop/src/test/CaptureViewerModal.test.tsx`.
   - Run `just check` to ensure all linters, formatting, and tests pass.

## Files to touch
- `docs/plans/059-game-launching-pinned-games-tray-custom-player-and-hero-scroll.md`
- `api/openapi.yaml`
- `core/internal/config/config.go`
- `core/internal/steam/scanner.go`
- `core/internal/service/service.go`
- `core/internal/api/artwork.go` (or `overrides.go`)
- `core/internal/api/handlers.go`
- `core/internal/api/server.go`
- `core/internal/api/api_test.go`
- `core/internal/tray/tray.go`
- `core/internal/tray/tray_windows.go`
- `desktop/src/types/api.ts`
- `desktop/src/api/client.ts`
- `desktop/src/components/GameCard.tsx`
- `desktop/src/components/GameList.tsx`
- `desktop/src/components/GameDetailView.tsx`
- `desktop/src/components/CaptureViewerModal.tsx`
- `desktop/src/components/CustomVideoPlayer.tsx` (new)
- `desktop/src/components/CustomImageViewer.tsx` (new)
- `desktop/src/test/GameCard.test.tsx`
- `desktop/src/test/GameDetailView.test.tsx`
- `desktop/src/test/CaptureViewerModal.test.tsx`
- `.agents/skills/zapp-ui-design/SKILL.md`

## Out of scope
- Steam cloud save synchronization.
- Direct video re-encoding / ffmpeg video trimming backend (the UI will establish the scrubber / range selection hooks for it).

## Acceptance checks
- [ ] `just check` passes with 0 lint, type, or test errors
- [ ] `POST /games/{app_id}/launch` launches the game via Steam or custom executable
- [ ] `PUT /games/{app_id}/pin` sets/clears pin status and persists across core restarts
- [ ] Pinned games always appear first in Desktop games library and dashboard
- [ ] Core Windows tray menu dynamically lists pinned games at the top and launches them on click
- [ ] Core Windows tray menu has "Open Zapp Manager" opening desktop executable (replaces web dashboard)
- [ ] Desktop Game Cards prioritize "Play" button for games on SSD and "Move to SSD" for games on HDD
- [ ] Game Details hero banner scroll gap/leak is eliminated with solid acrylic backdrop containment
- [ ] Custom image viewer supports zoom in/out, pan, and clipboard copy
- [ ] Custom video player supports custom controls, seek scrubber, ±5s jump buttons, and fullscreen
- [ ] `.agents/skills/zapp-ui-design/SKILL.md` updated with the new patterns

## Safety
Touches move/delete/manifest code? No.
File transfer sequences (`core/internal/transfer/sequences.go`) and manifest relocation logic remain completely untouched. Game launch and pin mutations operate exclusively through non-invasive process execution and `<AppDir>/overrides.json`, never altering Steam ACF files or game content directories.
