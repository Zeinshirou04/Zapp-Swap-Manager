# Plan 057: Media & Captures (ShareX / NVIDIA ShadowPlay, In-App Viewer, Clipboard Copy)

## Goal
Auto-detect ShareX and NVIDIA ShadowPlay screenshot/video folders alongside optional user-whitelisted capture directories, match media per game (with per-game custom aliases), stream images and byte-range videos over authenticated endpoints using opaque IDs, and provide an in-app Lightbox gallery + video player + PNG-normalized **Copy Image** button.

## Scope
Folder: `api`, `core`, `desktop`, `docs`
Branch: `feat/core-media-captures`

## Dependencies Added
- **Desktop (`desktop/package.json` & `desktop/src-tauri/Cargo.toml`)**: Added `@tauri-apps/plugin-clipboard-manager` (`^2`) + `tauri-plugin-clipboard-manager` (`2`) with capability `"clipboard-manager:allow-write-image"`. Required so WebView2 on Windows can reliably write decoded RGBA image bitmaps directly to the system clipboard without Chromium permission/encoding gaps when copying screenshots to external apps (Discord, Slack, Paint, etc.).
- **Core (`core/`)**: Reuses existing `modernc.org/sqlite` (for read-only ShareX `History.db` queries) and `golang.org/x/sys/windows/registry` (for NVIDIA ShadowPlay registry detection) — zero new Go module dependencies.

## Steps
1. **API Contract (`api/openapi.yaml`)**:
   - Extend `Preferences` with `sharex_enabled` (default `true`), `shadowplay_enabled` (default `true`), and `capture_folders` (server-validated extra capture root directories).
   - Extend `Game` with `capture_aliases` (`string[]`).
   - Add `GET /captures/sources`, `GET /games/{app_id}/captures`, `PUT /games/{app_id}/captures/aliases`, and `GET /captures/{capture_id}/file` (opaque 32-hex capture IDs + HTTP `Range` support).
2. **Core Captures Engine & Endpoints (`core/`)**:
   - Create `core/internal/captures/`:
     - Auto-detect ShareX (`ApplicationConfig.json`, custom/default `Screenshots\` folder, read-only SQLite `History.db` `WindowTitle`/`ProcessName` tags).
     - Auto-detect NVIDIA ShadowPlay (`HKCU\SOFTWARE\NVIDIA Corporation\Global\ShadowPlay\NVSPCAPS\DefaultPathW` string/UTF-16LE registry lookup, `Videos\NVIDIA`, and game-named subfolders in `Videos\`).
     - Match captures against game title, install dir base name, and custom `capture_aliases`.
     - Map canonical local paths inside active allowed roots to opaque 32-hex SHA-256 IDs and stream safely with `http.ServeContent` (supporting byte-range seeking and preventing path traversal / symlink escapes).
     - Persist per-game capture aliases safely under `<AppDir>/captures/aliases.json` (plus read optional `capture_aliases` from `ZappManifest`), working for both Steam and non-Steam games without modifying game directories.
   - Update `core/internal/config`, `core/internal/steam`, `core/internal/service`, and `core/internal/api` (`server.go`, `handlers.go`, `captures_handler.go`) including CORS `Range` headers.
   - Add unit & HTTP API tests covering ShareX `History.db` + folder scan, ShadowPlay subfolder scan, custom aliases, path validation, opaque ID lookup, and HTTP byte-range `206 Partial Content` streaming.
3. **Desktop UI, Viewer, Player & Clipboard Copy (`desktop/`)**:
   - Add `@tauri-apps/plugin-clipboard-manager` + Rust plugin initialization + `clipboard-manager:allow-write-image` permission.
   - Update `desktop/src/types/api.ts` and `desktop/src/api/client.ts` (`getCaptureSources`, `getGameCaptures`, `updateGameCaptureAliases`, `getCaptureFileUrl`, and clean authenticated image fetch + canvas RGBA conversion clipboard utility `copyCaptureImage`).
   - Replace the "Coming Soon" placeholder in `GameDetailView.tsx` with a flat Volt & Ink **Media & Captures** section:
     - Source/type filter pills (`All`, `Images`, `Videos`) and inline **Match Aliases** editor (add/remove window titles or process keywords when a game uses a generic launcher window name).
     - Thumbnail grid (`aspect-ratio: 16 / 9`) displaying screenshots and video cards with badge (`ShareX` / `ShadowPlay` / `Folder`), quick **Copy Image** icon action, and **Open Viewer** click trigger.
     - Accessible modal Lightbox player (`CaptureViewerModal.tsx`) supporting full-resolution image viewing, **Copy Image** button with instant copied confirmation + toast feedback, keyboard Prev/Next/Esc navigation, and native HTML5 `<video controls>` playback with byte-range seeking.
   - Add **Media & Captures** sub-section in `SettingsView.tsx` showing auto-detected ShareX / NVIDIA ShadowPlay status & paths, toggle switches, and custom capture folders management.
   - Add Vitest component tests and update `.agents/skills/zapp-ui-design/SKILL.md`.
4. **Verify**:
   - Run `just check` and `cargo check`/`cargo test` in `desktop/src-tauri` with 0 errors before committing on `feat/core-media-captures`.

## Acceptance checks
- [x] `just check` and `cargo check` / `cargo test` in `desktop/src-tauri` pass
- [x] ShareX (`History.db` + `Screenshots`) and NVIDIA ShadowPlay (`DefaultPathW` / `Videos\NVIDIA`) captures are detected and matched per game
- [x] `GET /captures/{capture_id}/file` rejects unknown/malformed IDs (`404`/`400`), enforces allowed roots, and serves HTTP `206 Partial Content` for range requests
- [x] `GameDetailView` displays captures, opens image Lightbox and `<video>` player, edits per-game matching aliases, and copies screenshots cleanly to the clipboard
