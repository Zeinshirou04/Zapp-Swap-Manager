# Plan 009: Desktop Dashboard (Tauri + React + TypeScript)

## Goal
Scaffold and implement the desktop dashboard in `desktop/` using Tauri, React, Vite, and TypeScript. The dashboard acts as a pure local HTTP client to the core service API (`http://127.0.0.1:8765`), allowing users to browse games, trigger promote/evict/backup jobs, monitor drive space, and inspect real-time job queue progress without any direct disk access.

## Scope
Folder: `desktop`
Branch: `feat/desktop-dashboard`

## Steps
0. **Branch Setup**:
   Ensure local `main` is up to date, then check out the task branch:
   ```bash
   git checkout main
   git pull
   git checkout -b feat/desktop-dashboard
   ```
1. **Desktop Project Scaffold (`desktop/`)**:
   - Initialize Vite + React + TypeScript in `desktop/` with Tailwind CSS or lightweight styling.
   - Configure Tauri app (`src-tauri/`) with loopback network permissions and window metadata.
   - Set up Vitest, React Testing Library, ESLint, and TypeScript configs (`tsconfig.json`).
2. **API Client & Type Definitions (`desktop/src/api/`)**:
   - TypeScript types matching `api/openapi.yaml` schemas: `Game`, `Library`, `Job`, `CreateJobRequest`, `ErrorResponse`.
   - Core API client:
     - Configurable Bearer token and base URL (`http://127.0.0.1:8765`).
     - Functions: `getHealth()`, `listLibraries()`, `listGames()`, `getGame()`, `listJobs()`, `createJob()`, `getJob()`, `cancelJob()`.
     - Error handling conforming to `ErrorResponse`.
3. **UI Components & Views (`desktop/src/components/`)**:
   - **Header & Health Indicator**: Core daemon connection status, Steam running badge, service version.
   - **Storage Drive Metrics**: Visual progress cards for SSD cache and HDD master storage showing used and free gigabytes (`listLibraries`).
   - **Game Browser & Action Controls**:
     - Game cards/table with title, App ID, size in GB, state badge (`active_ssd` vs `storage_hdd`), backup status.
     - Search & state filter (All / Active on SSD / Storage on HDD).
     - Action buttons: "Promote to SSD" (for HDD games), "Evict to HDD" and "Backup Now" (for SSD games). Confirmation modals for eviction.
   - **Real-Time Job Queue Monitor**:
     - Lists queued, running, completed, and failed jobs.
     - Live progress bar for active jobs (percentage, transferred vs total bytes).
     - Job cancellation button (`POST /jobs/{id}/cancel`).
4. **Settings / Connection Modal**:
   - Configure port and Bearer auth token with local storage persistence.
5. **Lint, Unit Tests & CI Integration**:
   - Component unit tests with mocked API responses using Vitest and MSW / fetch mocks.
   - Update `Justfile` recipe `check-desktop` to run `cd desktop && npm run lint && npm test`.
   - Update `.github/workflows/ci.yml` matrix / steps to verify desktop checks.
   - Run `just check`.

## Files to touch
- `desktop/package.json`
- `desktop/src-tauri/`
- `desktop/src/`
- `desktop/index.html`
- `desktop/vite.config.ts`
- `desktop/tsconfig.json`
- `Justfile`
- `.github/workflows/ci.yml`
- `docs/plans/009-desktop-dashboard.md`

## Out of scope
- Any direct filesystem, Robocopy, or Steam manifest manipulation (handled solely by `core/`).
- Mobile Android client (Plan 010).

## Acceptance checks
- [x] `desktop/` scaffolds cleanly with Vite, React, TypeScript, and Tauri.
- [x] API client strictly conforms to `api/openapi.yaml` endpoints and schemas. (Tested in `api.test.ts`.)
- [x] Game listing, filtering, swap triggering, and job queue monitoring work smoothly. (Tested in `GameList.test.tsx`, `DrivesOverview.test.tsx`.)
- [x] Input safety: UI only sends `app_id` and `target_library_id`; never sends filesystem paths.
- [x] `npm run lint` and `npm test` pass.
- [x] `just check` passes.

## Safety
Touches move/delete/manifest code? No (Desktop has zero filesystem access; delegates entirely to core HTTP API).
