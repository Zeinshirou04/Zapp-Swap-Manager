# Plan 022: CORS Middleware and Desktop Transport Resilience

## Problem
In the desktop app, `fetch('http://127.0.0.1:8765/health')` threw `TypeError: Failed to fetch`.
WebView2 in Tauri runs with origin `https://tauri.localhost`. When cross-origin requests are made to `http://127.0.0.1:8765` with custom headers (`Authorization: Bearer <token>`, `Content-Type: application/json`):
1. The browser initiates an HTTP `OPTIONS` preflight request.
2. `core` lacks CORS middleware; `RequireAuth` in `core/internal/api/auth.go` intercepts the preflight and returns `401 Unauthorized` without `Access-Control-Allow-*` headers.
3. Modern Chromium also requires Private Network Access (PNA) header `Access-Control-Allow-Private-Network: true` when a secure context calls loopback.
4. WebView2 aborts the request before JavaScript can inspect the HTTP status code.

## Goals
1. Add CORS middleware to `core/internal/api/server.go`:
   - Intercepts `OPTIONS` preflight requests, responding `204 No Content` with appropriate CORS headers (`Access-Control-Allow-Origin`, `Methods`, `Headers`, `Max-Age`, and `Private-Network`).
   - Injects `Access-Control-Allow-Origin` on all HTTP responses (including `401 Unauthorized` and `403 Forbidden`) so the webview can receive proper status codes and error payloads.
2. Add `@tauri-apps/plugin-http` to `desktop` (or native invoke transport fallback):
   - Allow the desktop app to use Tauri's native Rust HTTP client (`@tauri-apps/plugin-http` or invoke) when available, completely bypassing browser webview CORS and mixed-content restrictions.
3. Unit tests in `core` validating `OPTIONS` preflight and `GET` CORS headers.
4. Verify `just check` passes.
