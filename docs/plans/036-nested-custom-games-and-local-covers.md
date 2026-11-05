# Plan 036: Nested Custom Games and Local Cover Artwork

## Context & Motivation
Non-Steam games frequently install in nested multi-level directory structures under their publisher or launcher folders (e.g. `E:\Game\GRYPHLINK\games\EndField Game`, `E:\Game\Riot Games\VALORANT`, `E:\Game\Epic Games\<Game>`). 
Users expect their non-Steam backup structure on their HDD (`O:\Game`) to match the SSD structure symmetrically (`O:\Game\GRYPHLINK\games\EndField Game`), without having to register each individual publisher folder as a separate library.
Additionally, users want to specify custom local cover images (e.g. `.png` / `.jpg`) for custom games that work reliably on both the desktop app and the remote mobile app.

---

## Safety Invariants (`docs/safety.md`)
1. **Path Safety & Traversal Prevention**:
   - Relative `install_dir` paths must be cleaned (`filepath.Clean`).
   - Must NEVER be absolute (`!filepath.IsAbs`).
   - Must NEVER contain directory traversal (`..`).
   - Must NEVER contain drive specifiers or colons (`:`).
   - Resolved path `filepath.Join(libRoot, installDir)` must strictly remain within `libRoot`.
2. **Destination Guard**:
   - Destination must resolve to `filepath.Join(hddLibRoot, installDir)`.
3. **Crash Recovery & Junction Safety**:
   - Custom games use Robocopy mirror to HDD, verification, deletion on SSD, and NTFS directory junction (`mklink /J`) back to HDD.
   - Slashes in relative paths must be handled safely across Windows path conventions.

---

## Proposed Changes

### 1. Core Safety Guards (`core/internal/transfer/guards.go`)
- Update `validateInstallDir(installDir string)` to allow safe relative subpaths (e.g. `GRYPHLINK/games/EndField Game` or `Riot Games\VALORANT`) while strictly rejecting `..`, absolute paths, and `:`.
- Ensure `gameFolder` and `ExpectedGameFolder` join relative subpaths cleanly.

### 2. Scanner & Discovery (`core/internal/steam/scanner.go`)
- Enhance scanner for generic game libraries:
  - Recursively inspect directories up to 3 levels deep (e.g. `<lib>/<Publisher>/<Category>/<Game>`).
  - Automatically detect any directory containing `zappmanifest.json` or game executables.
  - Record the normalized relative path as `installDir`.
  - Prevent duplicate parent/child directory claims.

### 3. API Handlers & Local Cover Endpoint (`core/internal/api/`)
- In `createCustomGame` / `updateCustomGame`:
  - Allow relative subpaths for `install_dir`.
  - Normalize slashes to standard path separators.
- Add `GET /games/{app_id}/cover` endpoint in `core/internal/api/handlers.go`:
  - If `cover_url` is a local file path that exists on disk, stream it with proper image `Content-Type` (`image/png`, `image/jpeg`, `image/webp`).
  - If `cover_url` is an HTTP(S) URL, redirect with `302 Found`.
  - If no cover exists, return `404 Not Found`.
  - This allows both the desktop app and the remote mobile app (via tunnel/relay) to display local images seamlessly.

### 4. API Contract (`api/openapi.yaml`)
- Document `GET /games/{app_id}/cover`.
- Clarify `install_dir` description to specify support for relative subpaths in custom games.

### 5. Desktop UI Updates (`desktop/`)
- In `GameCard.tsx`, `AddGameModal.tsx`, and `GameDetailModal.tsx`:
  - Use `/games/{app_id}/cover` or local asset URL resolver.
  - Allow browsing or pasting local image file paths and web URLs in the custom game modals.

---

## Verification Plan
1. Unit tests:
   - `core/internal/transfer`: Verify `validateInstallDir` with nested relative paths, traversal attacks, and destination guards.
   - `core/internal/steam`: Test scanner with 2-level and 3-level nested game directories (`GRYPHLINK/games/EndField Game`, `Riot Games/VALORANT`).
   - `core/internal/api`: Test `POST /custom-games` with nested `install_dir`, and `GET /games/{app_id}/cover` with local file and web URL.
   - `desktop`: Test custom cover URL resolution and modal inputs.
2. Full workspace validation:
   - Run `just check`.
