# Plan 017: Core Steam Library Auto-Discovery and Configuration API

## Goal
Add automatic detection of Steam installations and libraries from the Windows Registry and standard Steam paths, provide API endpoints to query detected libraries and configure SSD Cache / HDD Master roles dynamically, and persist a shared local auth token to allow zero-friction local desktop pairing.

## Scope
Folder: `api`, `core`
Branch: `feat/core-library-autodiscovery-and-api`

## Steps
0. **Branch Setup**:
   Ensure local `main` is up to date, then check out the task branch:
   ```bash
   git checkout main
   git pull
   git checkout -b feat/core-library-autodiscovery-and-api
   ```
1. **API Contract Updates (`api/openapi.yaml`)**:
   - Add `GET /libraries/detected`: scans host for installed Steam instances and returns discovered library paths and drive types.
   - Add `POST /libraries`: accepts an array of configured libraries (mapping `id`, `type` [`ssd_cache` | `hdd_master`], and `path`) to register or update the whitelist without manually editing configuration files.
2. **Core Steam Registry and Path Auto-Discovery**:
   - Implement Windows Registry inspection (`HKCU\Software\Valve\Steam\SteamPath`) and default fallback paths (`C:\Program Files (x86)\Steam`) to locate `libraryfolders.vdf`.
   - Parse `libraryfolders.vdf` using the existing VDF parser to discover all mounted Steam libraries across all drives.
   - Detect drive volume properties (total and free space, drive letter) for each library.
3. **Dynamic Library Registration & Persistence**:
   - Save configured libraries to `%APPDATA%\Zapp-Swap-Manager\config.json` upon `POST /libraries`.
   - Auto-generate a secure random 32-byte hex token in `%APPDATA%\Zapp-Swap-Manager\auth.token` if none is configured, restricting file permissions to the current Windows user so the local Desktop app can authenticate seamlessly.
4. **Verification**:
   - Unit tests for Steam path auto-discovery on Windows and POSIX fallbacks.
   - Integration tests verifying `GET /libraries/detected` and `POST /libraries`.
   - Run `just check` to ensure all linters, formatting, and tests pass.

## Files to touch
- `api/openapi.yaml`
- `core/internal/steam/discovery_windows.go`
- `core/internal/steam/discovery.go`
- `core/internal/api/handlers.go`
- `core/internal/config/config.go`
- `docs/plans/017-core-library-autodiscovery-and-api.md`

## Out of scope
- Desktop UI rendering (handled in Plans 018 and 019).
- Transfer or Robocopy engine changes.

## Acceptance checks
- [ ] `just check` passes cleanly
- [ ] `GET /libraries/detected` returns real or mock Steam libraries discovered on host
- [ ] `POST /libraries` updates whitelisted libraries in memory and persists to user config
- [ ] `%APPDATA%\Zapp-Swap-Manager\auth.token` created on first run when no token is passed
- [ ] PR created and merged to `main`

## Safety
Touches move/delete/manifest code? no. Touches API contract and auth configuration per safety protocol (requires plan confirmation).
