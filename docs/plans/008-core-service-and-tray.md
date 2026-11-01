# Plan 008: Core Service Daemon, Config & Windows System Tray

## Goal
Implement the core daemon entrypoint (`core/cmd/zapp-core`) that loads configuration, initializes the SQLite database, starts the FIFO queue worker and HTTP API server, and provides a lightweight Windows system tray icon for background operation and graceful shutdown.

## Scope
Folder: `core`
Branch: `feat/core-service-tray`

## Steps
0. **Branch & Repository Alignment**:
   - Check out task branch: `feat/core-service-tray`.
   - Update Go module name in `core/go.mod` and all Go internal package imports from `github.com/Zeinshirou04/zapp-swap-manager/core` to `github.com/Zeinshirou04/Zapp-Swap-Manager/core`.
   - Update `README.md` repository links to `Zapp-Swap-Manager`.
1. **Configuration Loader (`core/internal/config/config.go`)**:
   - Define service configuration:
     - API Bind Address (default `127.0.0.1:8765`, enforcing loopback only per `docs/safety.md`).
     - Bearer Token (for local Desktop UI authentication; auto-generated if missing or loaded from config/env).
     - Cloudflare Access settings (Team domain, Audience tag for JWT validation).
     - SQLite database path (default `%APPDATA%/zapp-swap-manager/queue.db` on Windows, `~/.local/share/zapp-swap-manager/queue.db` on Linux).
     - Steam library whitelist / config file.
   - Support loading from JSON file and environment variables (`ZAPP_*`).
2. **Core Service Lifecycle Coordinator (`core/internal/service/service.go`)**:
   - Tie together:
     - Database connection & migration (`queue.OpenDB`).
     - Transfer driver (`transfer.DefaultDriver()`).
     - Queue and worker (`queue.New()`, `q.StartWorker(ctx)`).
     - Steam scanner & cache.
     - HTTP API server (`api.New()`, `server.Start(ctx)`).
   - Graceful shutdown coordination across worker, HTTP server, and database.
3. **System Tray Integration (`core/internal/tray/tray_windows.go` & `tray_other.go`)**:
   - On Windows: Run a system tray icon showing service status (Running / Idle / Swapping), with context menu actions:
     - Open Web Dashboard (launches browser/desktop UI).
     - Active Jobs summary.
     - Exit / Graceful Stop.
   - On Linux/macOS (headless/POSIX fallback): Run in CLI daemon mode listening for OS signals (`SIGINT`, `SIGTERM`).
4. **Main Entrypoint (`core/cmd/zapp-core/main.go`)**:
   - CLI flags: `--config`, `--port`, `--headless` (to run without tray GUI, e.g. in test or CI environments).
   - Wire up service coordinator and tray loop.
5. **Unit & Integration Tests**:
   - Test config loading, default fallbacks, and validation (e.g. rejecting non-loopback addresses).
   - Test service lifecycle (start, API health check, graceful stop).
   - Verify `go build ./cmd/zapp-core` produces a working binary on Windows and Linux (`GOOS=linux go build`).
   - Run `just check`.

## Files to touch
- `core/internal/config/config.go`
- `core/internal/config/config_test.go`
- `core/internal/service/service.go`
- `core/internal/service/service_test.go`
- `core/internal/tray/tray.go`
- `core/internal/tray/tray_windows.go`
- `core/internal/tray/tray_other.go`
- `core/cmd/zapp-core/main.go`
- `docs/plans/008-core-service-and-tray.md`

## Out of scope
- Desktop Tauri frontend GUI application (reserved for Plan 009).
- Android mobile client (reserved for Plan 010+).

## Acceptance checks
- [ ] Config loader correctly defaults and parses settings; rejects non-loopback host bindings.
- [ ] Service coordinator starts SQLite queue worker and HTTP API server concurrently.
- [ ] Service gracefully handles shutdown signals (cancelling running context and closing DB).
- [ ] Windows tray icon displays status and menu with graceful quit.
- [ ] Headless mode `--headless` allows CLI daemon execution on both Windows and Linux without GUI errors.
- [ ] `go build ./cmd/zapp-core` builds successfully on Windows and Linux (`GOOS=linux`).
- [ ] `just check` passes.

## Safety
Touches move/delete/manifest code? No (wires existing tested modules together).
- Preserves loopback-only binding (`127.0.0.1`).
- Preserves auth requirements for HTTP API.
