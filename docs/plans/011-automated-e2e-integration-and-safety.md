# Plan 011: Automated End-to-End Integration Verification & Safety Guards

## Goal
Implement an automated end-to-end (E2E) integration test suite in `core/` that spins up the full `service.Service` coordinator (in-process HTTP API server + SQLite job queue worker), generates mock SSD and HDD Steam libraries with real ACF manifests, executes complete Evict and Promote cycles via the REST API, and verifies all safety invariants from `docs/safety.md`.

## Scope
Folder: `core`
Branch: `test/core-e2e-safety-guards`

## Steps
0. **Branch Setup**:
   Ensure local `main` is up to date, then check out the task branch:
   ```bash
   git checkout main
   git pull
   git checkout -b test/core-e2e-safety-guards
   ```

1. **Test Environment Harness (`core/internal/service/e2e_test.go`)**:
   - Build a test fixture using `t.TempDir()` that configures:
     - SSD library root (`ssd/steamapps/common/...` + `ssd/steamapps/appmanifest_12345.acf`).
     - HDD library root (`hdd/steamapps/common/...`).
     - Loopback HTTP server on an ephemeral port (`127.0.0.1:0`).
     - Ephemeral SQLite database file (`zapp_test.db`).
     - Secret Bearer token for authenticated API requests.
   - Initialize and start `service.New(...)` in background, ensuring graceful teardown with `defer s.Stop()`.

2. **Evict Cycle Integration Test**:
   - Place a mock game payload in the SSD library (`ssd/.../common/MyGame/data.bin`).
   - Call `POST /api/v1/jobs` with `{ "type": "evict", "app_id": "12345", "target_library_id": "hdd" }`.
   - Poll `GET /api/v1/jobs/{id}` until job completes.
   - Verify postconditions per `docs/safety.md`:
     - Target HDD folder contains identical game files and bytes.
     - `appmanifest_12345.acf` is present in `hdd/steamapps/`.
     - `appmanifest_12345.acf` is gone from `ssd/steamapps/`.
     - Source game directory on SSD is completely removed.

3. **Promote Cycle Integration Test**:
   - With the game now on HDD, call `POST /api/v1/jobs` with `{ "type": "promote", "app_id": "12345", "target_library_id": "ssd" }`.
   - Poll `GET /api/v1/jobs/{id}` until job completes.
   - Verify postconditions per `docs/safety.md`:
     - SSD folder contains identical game files and bytes.
     - `appmanifest_12345.acf` is present in `ssd/steamapps/`.
     - `appmanifest_12345.acf` is gone from `hdd/steamapps/`.
     - Master copy on HDD remains intact (never deleted).

4. **Safety Guards & API Validation Tests**:
   - Verify non-whitelisted target library is rejected (`400 Bad Request`).
   - Verify unauthenticated requests are rejected (`401 Unauthorized`).
   - Verify concurrent moves on the same App ID are prevented / queued safely.
   - Verify missing source files fail gracefully without corrupting the destination or moving the manifest prematurely.

5. **CI & Verification**:
   - Run `go test -v ./internal/service -run TestE2E` and `just check`.
   - Push branch and open pull request into `main`.

## Files to touch
- `docs/plans/011-automated-e2e-integration-and-safety.md`
- `core/internal/service/e2e_test.go`
- `core/internal/service/service.go` (if port 0 dynamic address extraction or test helpers are needed)

## Out of scope
- Desktop or Mobile UI modifications.
- Modifications to `api/openapi.yaml`.

## Acceptance checks
- [ ] `just check` passes on Windows and Linux runners
- [ ] Evict sequence completes end-to-end via HTTP API and verifies file/manifest locations
- [ ] Promote sequence completes end-to-end via HTTP API and verifies HDD copy preservation
- [ ] Safety invariants from `docs/safety.md` are tested and upheld
- [ ] PR created into `main` with passing `ci-ok`

## Safety
Touches move/delete/manifest code? yes.
- Uses `transfer.Evict` and `transfer.Promote` on test directory fixtures in `t.TempDir()`.
- Adheres strictly to `docs/safety.md`:
  - SSD data deleted ONLY after HDD copy verified and manifest moved.
  - HDD master copy NEVER deleted on promote.
  - Manifest exists in exactly one library at any time.
