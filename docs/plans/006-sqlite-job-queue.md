# Plan 006: SQLite FIFO Job Queue & Journaled State Machine

## Goal
Implement the strictly serial FIFO job queue and crash-resilient SQLite transaction journal in `core/internal/queue/`, managing execution of `Backup`, `Evict`, and `Promote` transfer sequences with restart recovery and cooperative cancellation per `docs/safety.md`.

## Scope
Folder: `core`
Branch: `feat/core-sqlite-queue`

## Steps
0. **Branch Setup**:
   Ensure local `main` is up to date, then check out the task branch:
   ```bash
   git checkout main
   git pull
   git checkout -b feat/core-sqlite-queue
   ```
1. **SQLite Database Driver & Schema (`core/internal/queue/db.go`)**:
   - Use a pure Go (CGO-free) SQLite driver (such as `modernc.org/sqlite`) so that cross-compilation and testing on both Windows and Linux require no C compilers.
   - Initialize tables with WAL mode enabled:
     - `jobs`:
       - `id` (TEXT PRIMARY KEY, UUID)
       - `type` (TEXT: `promote`, `evict`, `backup`)
       - `app_id` (TEXT)
       - `target_library_id` (TEXT)
       - `status` (TEXT: `queued`, `running`, `succeeded`, `failed`, `cancelled`)
       - `progress_percent` (REAL)
       - `bytes_transferred` (INTEGER)
       - `total_bytes` (INTEGER)
       - `error` (TEXT, nullable)
       - `created_at` (DATETIME)
       - `started_at` (DATETIME, nullable)
       - `completed_at` (DATETIME, nullable)
     - `job_journal`:
       - `id` (INTEGER PRIMARY KEY AUTOINCREMENT)
       - `job_id` (TEXT, references `jobs(id)`)
       - `step_index` (INTEGER)
       - `step_name` (TEXT)
       - `status` (TEXT: `started`, `completed`, `failed`)
       - `recorded_at` (DATETIME)
       - `details` (TEXT, nullable)
2. **Queue Safety Rules & FIFO Worker (`core/internal/queue/worker.go`)**:
   - **Strictly Serial FIFO**: Exactly one worker goroutine executes jobs one-by-one from the queue.
   - **Per-Game Concurrency Guard**: Never allow two active (queued or running) jobs for the same `app_id` simultaneously. Reject or queue in FIFO order. Moves must wait behind any running backup for the same game.
   - **Journaled Step Execution**:
     - Before executing any step in `transfer.Evict`, `transfer.Promote`, or `transfer.Backup`, record a `started` journal entry.
     - Execute the idempotent step.
     - Record a `completed` journal entry upon success.
   - **Cooperative Cancellation**:
     - Check for cancellation between journaled steps. Cancel takes effect between safe steps, never mid-operation.
   - **Crash Recovery on Startup**:
     - On queue startup, inspect `jobs` where `status = 'running'`.
     - Inspect the last recorded step in `job_journal`.
     - Because each sequence step is designed to be idempotent (e.g. verifying copy, moving manifest, deleting SSD copy only after verification), resume from the interrupted step or mark safely as failed. Never guess from raw folder state.
3. **Queue Interface & Repository (`core/internal/queue/queue.go`)**:
   - `Enqueue(req CreateJobRequest) (Job, error)`
   - `GetJob(id string) (Job, error)`
   - `ListJobs(statusFilter string) ([]Job, error)`
   - `CancelJob(id string) error`
4. **Unit & Integration Tests (`core/internal/queue/*_test.go`)**:
   - Test FIFO execution ordering (jobs execute strictly sequentially).
   - Test duplicate job rejection for the same `app_id`.
   - Test cancellation of queued jobs and cooperative cancellation of running jobs.
   - Test crash recovery simulation (interrupted job resumed or handled cleanly from SQLite journal).

## Files to touch
- `core/go.mod`
- `core/go.sum`
- `core/internal/queue/db.go`
- `core/internal/queue/models.go`
- `core/internal/queue/worker.go`
- `core/internal/queue/queue.go`
- `core/internal/queue/queue_test.go`
- `docs/plans/006-sqlite-job-queue.md`

## Out of scope
- HTTP route handlers connecting API to the Queue (reserved for Plan 007).
- Desktop GUI or tray icon integration (reserved for Plan 008).

## Acceptance checks
- [x] Uses a pure-Go SQLite driver that compiles and runs identically on Windows and Linux without CGO.
- [x] Enforces strictly serial FIFO execution: no concurrent jobs on the same `app_id`.
- [x] Every step is journaled in SQLite before and after execution.
- [x] Restart recovery recovers interrupted running jobs using the journal.
- [x] All unit tests pass with `go test ./...` on both Windows and Linux. (Windows runs the full suite; Linux verified via `GOOS=linux go build && go vet` — the ubuntu CI leg runs the full suite on push)
- [x] `just check` passes.

## Safety
Touches move/delete/manifest code? **YES**.
- Strictly enforces `docs/safety.md` Section "Queue":
  - Strictly serial FIFO worker.
  - Never run two jobs on the same game at once.
  - Every step journaled before and after; steps safe to repeat.
  - Resume/rollback from journal on restart.
