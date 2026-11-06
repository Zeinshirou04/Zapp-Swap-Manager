# Plan 042: Cover Artwork Query Token Authentication

## Problem
In the desktop dashboard, custom non-Steam game thumbnails (such as Wuthering Waves with a local image path) fail to render in `GameCard` and `GameDetailModal`.
- Root cause: Webview `<img>` elements request `GET /games/{app_id}/cover` without custom HTTP headers. Because the core API auth middleware (`RequireAuth`) strictly validates `Authorization: Bearer ...` headers, image requests fail with `401 Unauthorized`.
- Furthermore, `GameCard.tsx`'s `handleImgError` doesn't advance `imgAttempt` on error, preventing fallbacks.

## Objectives
1. **Core API Auth (`core/internal/api/auth.go`)**:
   - Accept bearer token from query parameter `?token=<bearerToken>` in `authenticate()`.
   - Validate constant-time compare against `a.BearerToken`.
2. **Desktop API Client (`desktop/src/api/client.ts`)**:
   - Update `getGameCoverUrl(appId)` to append `?token=${encodeURIComponent(config.bearerToken)}` when `config.bearerToken` is present.
3. **Desktop GameCard Fallback (`desktop/src/components/GameCard.tsx`)**:
   - Fix `handleImgError` so if custom cover fails, it properly falls back through Steam capsule URLs or displays the fallback placeholder icon without infinite loops.
4. **Verification**:
   - Unit tests in `core/internal/api/auth_test.go` or `api_test.go` verifying query parameter `?token=...` authentication.
   - Vitest tests in desktop.
   - Run `just check`.
