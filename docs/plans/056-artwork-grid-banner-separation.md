# Plan 056: Separate Grid Cover and Banner Artwork

## Goal
Separate portrait Grid Cover artwork and Hero Banner artwork across `api/openapi.yaml`, `core/`, and `desktop/`, allowing independent customization and reset for any game via remote image URL or managed local image import without accepting raw filesystem paths in the API.

## Scope
Folder: `api`, `core`, `desktop`, `docs`
Branch: `feat/api-grid-banner-artwork`

## Steps
1. **Branch & API Contract (`api/openapi.yaml`)**:
   - Add nullable `banner_url` to `Game`, `createCustomGame`, and `updateCustomGame`.
   - Add `GET /games/{app_id}/banner` (image streaming / 302 redirect mirroring `/cover`).
   - Add `PUT /games/{app_id}/artwork` (set/clear independent `cover_url` / `banner_url` for any Steam or custom game) and `POST /games/{app_id}/artwork` (multipart binary image import for `kind=grid|banner` cached safely inside Zapp core `<AppDir>/artwork/`).
2. **Core Artwork Store, Scanner & Endpoints (`core/`)**:
   - Extend `steam.ZappManifest` and `steam.Game` with `BannerURL`.
   - Implement managed `artworkStore` (`core/internal/api/artwork.go`) validating uploaded images via magic bytes (`png`, `jpeg`, `webp`, `gif` up to 15 MiB), storing `<app_id>-<kind>.<ext>` under `<AppDir>/artwork/`, and persisting non-invasive per-game overrides in `overrides.json` so both Steam and non-Steam games support custom URLs, uploaded local images, and clearing back to defaults without touching game folders during transfers.
   - Update `createCustomGame` / `updateCustomGame` (supporting nullable `*string` `cover_url`/`banner_url` so explicit `""` clears metadata) and wire `GET /games/{app_id}/banner`, `PUT /games/{app_id}/artwork`, and `POST /games/{app_id}/artwork` in `server.go` / `handlers.go`.
   - Add unit and API tests covering separate Grid/Banner URLs, clearing back to defaults, binary upload safety (rejecting invalid MIME/path traversal), and `302` vs `200` image serving.
3. **Desktop UI & Tests (`desktop/`)**:
   - Update `desktop/src/types/api.ts`, `desktop/src/api/client.ts` (`resolveCoverUrl`, `resolveBannerUrl`, `getGameBannerUrl`, `updateGameArtwork`, `uploadGameArtwork`), and `desktop/src/components/GameDetailView.tsx` / `AddGameModal.tsx` / `GameDetailModal.tsx`.
   - In `GameDetailView.tsx`, use custom `banner_url` independently for the Hero Banner (defaulting to Steam hero -> Grid cover fallback when unset) and `cover_url` for Grid posters; add an inline/quick **"Edit Artwork"** panel or modal trigger directly in Game Details alongside separate **Grid Cover (2:3)** and **Banner (Hero)** sections (URL input, local image file upload button, and Clear/Reset action) inside Settings as well.
   - Add Vitest unit tests verifying independent Grid vs Banner rendering, separate URL editing, clearing, and local file import upload calls.
   - Audit & update `.agents/skills/zapp-ui-design/SKILL.md`.
4. **Verify**:
   - Run `just check` and verify 0 failures before committing on `feat/api-grid-banner-artwork`.

## Files to touch
- `docs/plans/056-artwork-grid-banner-separation.md`
- `api/openapi.yaml`
- `core/internal/config/config.go` (`ArtworkDir`)
- `core/internal/steam/zappmanifest.go`, `core/internal/steam/scanner.go`, `core/internal/steam/scanner_test.go`
- `core/internal/service/service.go`
- `core/internal/api/server.go`, `core/internal/api/handlers.go`, `core/internal/api/artwork.go`, `core/internal/api/api_test.go`
- `desktop/src/types/api.ts`, `desktop/src/api/client.ts`
- `desktop/src/components/GameDetailView.tsx`, `desktop/src/components/AddGameModal.tsx`, `desktop/src/components/GameDetailModal.tsx`
- `desktop/src/test/api.test.ts`, `desktop/src/test/GameDetailView.test.tsx`, `desktop/src/test/AddGameModal.test.tsx`
- `.agents/skills/zapp-ui-design/SKILL.md`

## Out of scope
- Media & Captures ShareX/ShadowPlay detection, gallery, viewer, and clipboard copy (Plan 057)

## Acceptance checks
- [x] `just check` passes
- [x] `api/openapi.yaml` defines `banner_url`, `/games/{app_id}/banner`, and `PUT`/`POST /games/{app_id}/artwork`
- [x] Setting or uploading a custom Grid Cover leaves Banner unchanged (or default fallback), and setting or uploading a custom Banner updates only the Hero Banner
- [x] Clearing Banner falls back to Steam hero / Grid image; zero raw filesystem paths are sent in artwork update/upload API requests

## Safety
Touches move/delete/manifest code? No transfer sequence changes (`sequences.go` untouched). Artwork uploads store strictly inside `<AppDir>/artwork/` keyed by validated `app_id` and `kind` (`grid`|`banner`), never accepting raw filesystem paths from HTTP input and respecting the active-job `409 Conflict` lock on `zappmanifest.json`.
