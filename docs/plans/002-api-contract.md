# Plan 002: Define OpenAPI Contract (`api/openapi.yaml`)

## Goal
Establish the definitive OpenAPI 3.0 specification in `api/openapi.yaml` governing all communication between the Core Go daemon, the Tauri Desktop UI, and the Android Mobile application.

## Scope
Folder: `api`
Branch: `feat/api-contract`

## Steps
1. Create `api/openapi.yaml` adhering to OpenAPI 3.0.3 specification.
2. Define server configurations:
   - Local: `http://127.0.0.1:8765`
   - Remote (Cloudflare Tunnel): parameterized or production URL with description.
3. Define security schemes:
   - `CloudflareJWT`: API key header `Cf-Access-Jwt-Assertion` (for remote mobile requests via Cloudflare Access).
   - `BearerAuth`: HTTP Bearer token (for local desktop / dev environment).
4. Define endpoints:
   - **System**:
     - `GET /health`: Core service uptime, version, and Steam execution state (`steam_running`: boolean).
   - **Libraries**:
     - `GET /libraries`: Lists registered Steam libraries (whitelisted IDs, label/type: `ssd_cache` or `hdd_master`, total bytes, free bytes).
   - **Games**:
     - `GET /games`: List detected games across all libraries with filters (`state`, `library_id`).
     - `GET /games/{app_id}`: Retrieve detailed state, install directory name, size, build ID, backup status, and current library for a single Steam App ID.
   - **Jobs & Queue**:
     - `GET /jobs`: List all FIFO queue jobs with status filter (`queued`, `running`, `succeeded`, `failed`, `cancelled`).
     - `POST /jobs`: Enqueue a new operation (`promote`, `evict`, `backup`). **Must accept only `app_id` and whitelisted `target_library_id`—never raw filesystem paths.**
     - `GET /jobs/{job_id}`: Status, progress percentage, bytes transferred, step logs, and error details of a specific job.
     - `POST /jobs/{job_id}/cancel`: Cancel a pending job (or signal cooperative cancel for running job).
5. Define components/schemas:
   - `Library`: `id` (string), `name` (string), `type` (`ssd_cache` | `hdd_master`), `total_bytes` (int64), `free_bytes` (int64).
   - `Game`: `app_id` (string/int), `name` (string), `install_dir` (string), `size_bytes` (int64), `state` (`active_ssd` | `storage_hdd`), `current_library_id` (string), `build_id` (string), `last_backup_time` (string datetime or null), `backup_clean` (boolean).
   - `Job`: `id` (string/uuid), `type` (`promote` | `evict` | `backup`), `app_id` (string), `target_library_id` (string), `status` (`queued` | `running` | `succeeded` | `failed` | `cancelled`), `progress_percent` (float), `bytes_transferred` (int64), `total_bytes` (int64), `error` (string or null), `created_at` (string datetime), `started_at` (string datetime or null), `completed_at` (string datetime or null).
   - `CreateJobRequest`: `type` (enum), `app_id` (string), `target_library_id` (string).
   - `ErrorResponse`: `code` (string), `message` (string), `details` (array of strings or object).

## Files to touch
- `api/openapi.yaml`

## Out of scope
- Core Go implementation of handlers and router (reserved for Plan 003).
- Client code generation in TypeScript or Kotlin (reserved for frontend plans).

## Acceptance checks
- [ ] `api/openapi.yaml` exists and is syntactically valid OpenAPI 3.0.3 YAML.
- [ ] Input safety rule satisfied: No request schema accepts raw filesystem paths. All target locations use whitelisted `target_library_id`.
- [ ] Safety invariants represented: `backup`, `evict`, `promote` job types explicitly defined with proper schema validation.
- [ ] `just check` passes.

## Safety
Touches move/delete/manifest code? No (contract specification only).
- Enforces `docs/safety.md` Section "API input": Core accepts only app IDs and whitelisted library targets; rejects raw paths; requires Cloudflare JWT / auth header validation.
