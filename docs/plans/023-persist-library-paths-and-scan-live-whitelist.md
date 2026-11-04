# Plan 023: Persist Library Paths in Config and Scan Live Whitelist

## Problem
Users reported that after the desktop wizard detects Steam libraries and registers them, the dashboard displays 0 games.

### Root Causes
1. **`Path` was omitted from `config.json`**:
   In `core/internal/steam/library.go`, `Library.Path` was tagged with `json:"-"` to prevent raw filesystem paths from leaking over the HTTP API (`docs/safety.md`).
   However, `config.Config` stores `[]steam.Library` directly. When `config.Save()` serialized `cfg` to `config.json`, `Path` was omitted. When `config.Load()` read `config.json`, `Path` was empty string (`""`), causing `lib.validate()` to reject the library with `"empty path"`.
2. **`h.scanGames()` scanned the static initial slice**:
   In `core/internal/api/handlers.go`, `h.scanGames()` called `steam.ScanLibraries(h.cfg.Libraries)` instead of `h.libs()`. At startup, `h.cfg.Libraries` was empty. When `POST /libraries` registered new libraries, `h.scanGames()` continued scanning the old empty slice.
3. **Existing persisted configs are missing `path`**:
   Users who already ran the wizard have `config.json` containing library IDs and drive metrics but missing `path`.

## Solution
1. **Persist `path` in `config.json` while hiding it in the HTTP API**:
   - Change `Library.Path` tag to `json:"path,omitempty"` in `core/internal/steam/library.go` so `config.Save()` and `config.Load()` preserve `path`.
   - Introduce `libraryJSON` DTO in `core/internal/api/handlers.go` containing only `[id, name, type, total_bytes, free_bytes]` matching `api/openapi.yaml`. `GET /libraries` and `POST /libraries` serialize `libraryJSON`, guaranteeing the HTTP API never exposes raw filesystem paths.
2. **Scan Live Whitelist in `/games`**:
   - Update `h.scanGames()` to call `steam.ScanLibraries(h.libs())`.
3. **Auto-heal existing configurations**:
   - In `core/internal/config/config.go`, if a loaded library has an empty `Path`, match its `ID` against `steam.DetectLibraries()` to restore the path automatically.
4. **Unit Tests & Verification**:
   - Verify `config.Save()` and `config.Load()` roundtrip library paths.
   - Verify auto-healing restores missing paths from auto-discovery.
   - Verify `GET /libraries` and `POST /libraries` responses do not include `path`.
   - Run `just check`.
