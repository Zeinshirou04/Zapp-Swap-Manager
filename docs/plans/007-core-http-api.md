# Plan 007: Core HTTP API Server & Authentication Middleware

## Goal
Implement the core HTTP server in `core/internal/api/` serving all endpoints declared in `api/openapi.yaml`, protected by Cloudflare Access JWT and Bearer token middleware, binding exclusively to `127.0.0.1` per `docs/safety.md`.

## Scope
Folder: `core`
Branch: `feat/core-http-api`

## Steps
0. **Branch Setup**:
   Ensure local `main` is up to date, then check out the task branch:
   ```bash
   git checkout main
   git pull
   git checkout -b feat/core-http-api
   ```
1. **Security & Authentication Middleware (`core/internal/api/auth.go`)**:
   - Provide authentication middleware supporting both schemes from `api/openapi.yaml`:
     - **BearerAuth**: Checks `Authorization: Bearer <token>` for local Desktop UI communication.
     - **CloudflareJWT**: Validates `Cf-Access-Jwt-Assertion` header for remote requests through Cloudflare Tunnel (validates audience / team domain; testable via mocked/bypass key in dev).
   - Reject unauthenticated requests with HTTP 401 / 403.
2. **HTTP Handlers (`core/internal/api/handlers.go`)**:
   - Implement handlers adhering strictly to `api/openapi.yaml`:
     - `GET /health`: Uptime, service version, and `steam_running` check (via `steam.SteamRunning()`).
     - `GET /libraries`: Whitelisted library list with refreshed disk metrics (`steam.Library`).
     - `GET /games`: Discovered games from `steam.ScanLibraries()`, with optional `state` and `library_id` query filters.
     - `GET /games/{app_id}`: Detailed game state and manifest metadata for a single game.
     - `GET /jobs`: Lists jobs from `queue.Queue` with optional `status` filter.
     - `POST /jobs`: Validates input against `CreateJobRequest` schema:
       - **Strict Safety Guard**: Only `type`, `app_id`, and `target_library_id` are accepted. Any attempt to supply raw filesystem paths is rejected with HTTP 400 (`raw_path_rejected`).
       - Enqueues job via `queue.Queue.Enqueue()`.
       - Returns HTTP 202 Accepted.
     - `GET /jobs/{job_id}`: Returns job status, progress percentage, bytes transferred, and step logs from `queue.Queue`.
     - `POST /jobs/{job_id}/cancel`: Calls `queue.Queue.CancelJob()`, returning HTTP 202 Accepted.
3. **HTTP Server & Router (`core/internal/api/server.go`)**:
   - Use Go standard library `net/http` (with standard `http.ServeMux` or lightweight router).
   - Strict binding: Binds exclusively to `127.0.0.1:<port>` (default `8765`), never `0.0.0.0`.
   - Structured JSON logging and error responses matching `ErrorResponse` schema.
   - Graceful shutdown on context cancellation.
4. **Unit & Integration Tests (`core/internal/api/*_test.go`)**:
   - Test all routes using `net/http/httptest`.
   - Test authentication middleware (valid/invalid tokens).
   - Test input validation guard: verify that payloads attempting to inject raw paths are rejected with HTTP 400.
   - Test round-trip job enqueue and status query through the API.

## Files to touch
- `core/internal/api/server.go`
- `core/internal/api/auth.go`
- `core/internal/api/handlers.go`
- `core/internal/api/api_test.go`
- `core/internal/queue/worker.go` (exported `Queue.Steps` accessor for GET /jobs/{job_id})
- `core/internal/steam/library.go` (JSON tags; `Path` is `json:"-"` so raw paths never leave the core)
- `docs/plans/007-core-http-api.md`

## Out of scope
- Windows system tray icon and background service runner (reserved for Plan 008).
- Tauri desktop client and Android mobile app frontend.

## Acceptance checks
- [x] Core HTTP server binds only to `127.0.0.1`. (Tested: `TestBindsLoopbackOnly`.)
- [x] All routes from `api/openapi.yaml` are implemented and match schemas.
- [x] Input safety invariant verified: rejects raw paths with HTTP 400. (Tested: `TestRawPathRejected`.)
- [x] Authentication middleware properly validates Bearer tokens and Cloudflare JWT header. (Tested: `TestBearerAuth`, `TestCloudflareJWT` with 2048-bit RSA keys and a JWKS injection hook.)
- [x] Unit tests pass with `go test ./...` on both Windows and Linux runners. (Windows: full suite green locally. Linux: `GOOS=linux go build ./...` + `go vet ./...` green locally; the ubuntu CI runner executes the full suite on push.)
- [x] `just check` passes. (Desktop/mobile legs are still placeholder stubs per plans 008+.)

## Safety
Touches move/delete/manifest code? No (Orchestrates queue and scanner via type-safe API).
- Enforces `docs/safety.md` Section "API input":
  - Accepts only app IDs and whitelisted library targets.
  - Builds paths server-side; rejects raw filesystem paths.
  - Binds strictly to `127.0.0.1`.
  - Validates Cloudflare Access JWT on every request.
