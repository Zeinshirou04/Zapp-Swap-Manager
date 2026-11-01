// Package queue implements the strictly serial FIFO job queue and the
// journaled, idempotent step state machine in SQLite (docs/safety.md
// "Queue"): one worker, jobs one-at-a-time, every step written to the
// journal before and after it runs, restart recovery from the journal
// (never from folder state), and cooperative cancellation between steps.
package queue

import (
	"database/sql"
	"fmt"
	"os"
	"path/filepath"
)

// driverName registers modernc.org/sqlite via driver.go (pure Go, CGO-free:
// the core must cross-compile Windows <-> Linux without a C toolchain).
const driverName = "sqlite"

// Open opens (creating if needed) the queue database and initializes the
// schema. WAL mode keeps reads (API listings) non-blocking while the
// worker writes.
func Open(path string) (*sql.DB, error) {
	if dir := filepath.Dir(path); dir != "" {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			return nil, fmt.Errorf("open queue db %q: %w", path, err)
		}
	}
	db, err := sql.Open(driverName, "file:"+path+"?_pragma=journal_mode(WAL)&_pragma=foreign_keys(ON)&_pragma=busy_timeout(5000)")
	if err != nil {
		return nil, fmt.Errorf("open queue db %q: %w", path, err)
	}
	if _, err := db.Exec(schema); err != nil {
		db.Close()
		return nil, fmt.Errorf("init queue schema: %w", err)
	}
	return db, nil
}

const schema = `
CREATE TABLE IF NOT EXISTS jobs (
	id                TEXT    PRIMARY KEY,
	type              TEXT    NOT NULL CHECK (type IN ('promote', 'evict', 'backup')),
	app_id            TEXT    NOT NULL,
	target_library_id TEXT    NOT NULL,
	status            TEXT    NOT NULL DEFAULT 'queued'
	                  CHECK (status IN ('queued', 'running', 'succeeded', 'failed', 'cancelled')),
	progress_percent  REAL    NOT NULL DEFAULT 0,
	bytes_transferred INTEGER NOT NULL DEFAULT 0,
	total_bytes       INTEGER NOT NULL DEFAULT 0,
	error             TEXT,
	created_at        TEXT    NOT NULL,
	started_at        TEXT,
	completed_at      TEXT
);

CREATE TABLE IF NOT EXISTS job_journal (
	id          INTEGER PRIMARY KEY AUTOINCREMENT,
	job_id      TEXT    NOT NULL REFERENCES jobs(id),
	step_index  INTEGER NOT NULL,
	step_name   TEXT    NOT NULL,
	status      TEXT    NOT NULL CHECK (status IN ('started', 'completed', 'failed')),
	recorded_at TEXT    NOT NULL,
	details     TEXT
);

CREATE INDEX IF NOT EXISTS idx_jobs_status_order ON jobs(status, created_at);
CREATE INDEX IF NOT EXISTS idx_jobs_app_active ON jobs(app_id) WHERE status IN ('queued', 'running');
CREATE INDEX IF NOT EXISTS idx_journal_job ON job_journal(job_id, step_index);
`
