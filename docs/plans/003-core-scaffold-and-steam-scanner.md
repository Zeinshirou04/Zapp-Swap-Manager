# Plan 003: Core Go Module Scaffold & Steam Library / Manifest Scanner

## Goal
Initialize the `core/` Go module, implement the Steam VDF/ACF manifest parser and library scanner, and wire up `just check-core` with comprehensive unit tests.

## Scope
Folder: `core` (and root `justfile`)
Branch: `feat/core-steam-scanner`

## Steps
1. **Initialize Go Module**:
   - Create `core/go.mod` with module path `github.com/Zeinshirou04/zapp-swap-manager/core` (Go 1.22+).
   - Use standard library where possible; if external dependencies are needed (e.g. `golang.org/x/sys/windows` for disk space queries), document reasons in commit.
2. **Implement VDF / ACF Parser (`core/internal/vdf`)**:
   - Steam `libraryfolders.vdf` and `appmanifest_<appid>.acf` use Valve's KeyValues (VDF) text format.
   - Implement a robust parser that parses KeyValue blocks into structured data, handling nested blocks, quoted keys/values, and comments (`//`).
   - Extract key manifest attributes:
     - `appid` (string/int)
     - `name` (string)
     - `installdir` (folder under `steamapps/common/`)
     - `SizeOnDisk` (int64)
     - `buildid` (string)
     - `StateFlags` (uint32: bitmask where 4 = fully installed, other bits indicate updating/downloading)
3. **Implement Steam Library & Game Scanner (`core/internal/steam`)**:
   - Define `Library` model: ID, Name, Path, Type (`ssd_cache` | `hdd_master`), FreeBytes, TotalBytes.
   - Query drive space on Windows using `GetDiskFreeSpaceExW` (or cross-platform wrapper for tests).
   - Scan library paths for `steamapps/appmanifest_*.acf`:
     - Resolve game state according to `api/openapi.yaml`:
       - Found in an `ssd_cache` library $\to$ `state: active_ssd`.
       - Found in an `hdd_master` library $\to$ `state: storage_hdd`.
     - Read manifest `StateFlags` and `buildid` to support the backup skip guards in `docs/safety.md`.
   - Provide a helper to check whether a Steam process (`steam.exe`) is currently running.
4. **Unit Tests & Fixtures (`core/internal/...`)**:
   - Provide test fixtures with sample VDF and ACF files (e.g. valid game manifest, mid-update manifest with StateFlags, and library folders VDF).
   - Test VDF parsing, manifest extraction, drive space computation, and library scanning.
5. **Update Root `justfile`**:
   - Update `check-core` recipe in root `justfile` to run real checks:
     ```just
     check-core:
         cd core && go vet ./... && go test -v ./...
     ```

## Files to touch
- `core/go.mod`
- `core/go.sum`
- `core/internal/vdf/vdf.go`
- `core/internal/vdf/vdf_test.go`
- `core/internal/steam/library.go`
- `core/internal/steam/manifest.go`
- `core/internal/steam/scanner.go`
- `core/internal/steam/scanner_test.go`
- `justfile`
- `docs/plans/003-core-scaffold-and-steam-scanner.md`

## Out of scope
- File copying, Robocopy execution, and manifest file deletion/moving (reserved for Plan 004).
- HTTP API server & route handlers (reserved for Plan 005).
- SQLite queue implementation (reserved for Plan 005/006).

## Acceptance checks
- [x] `core/go.mod` is initialized and passes `go vet ./...`.
- [x] VDF parser parses sample `appmanifest_<appid>.acf` and `libraryfolders.vdf` accurately.
- [x] Scanner extracts `appid`, `name`, `installdir`, `SizeOnDisk`, `buildid`, and `StateFlags`.
- [x] Unit tests pass with `go test ./...`.
- [x] Root `just check` executes `check-core` successfully.

## Safety
Touches move/delete/manifest code? No (Read-only inspection of manifests and disk space).
- Complies with `docs/safety.md`: Reads `StateFlags` and `buildid` required for backup safety guards; strictly enforces whitelisted library IDs rather than arbitrary paths.
