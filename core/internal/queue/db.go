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
	"strings"
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
	if err := migrateJobsTypeConstraint(db); err != nil {
		db.Close()
		return nil, fmt.Errorf("migrate queue schema: %w", err)
	}
	return db, nil
}

// migrateJobsTypeConstraint upgrades existing SQLite databases whose jobs table
// CHECK constraint predates the 'remove' job type.
func migrateJobsTypeConstraint(db *sql.DB) error {
	var ddl string
	if err := db.QueryRow(`SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'jobs'`).Scan(&ddl); err != nil {
		return err
	}
	if strings.Contains(ddl, "'remove'") {
		return nil
	}

	if _, err := db.Exec(`PRAGMA foreign_keys = OFF`); err != nil {
		return err
	}
	defer func() {
		_, _ = db.Exec(`PRAGMA foreign_keys = ON`)
	}()

	tx, err := db.Begin()
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()

	stmts := []string{
		`CREATE TABLE jobs_migrated (
			id                TEXT    PRIMARY KEY,
			type              TEXT    NOT NULL CHECK (type IN ('promote', 'evict', 'backup', 'remove')),
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
		)`,
		`INSERT INTO jobs_migrated (id, type, app_id, target_library_id, status, progress_percent, bytes_transferred, total_bytes, error, created_at, started_at, completed_at)
		 SELECT id, type, app_id, target_library_id, status, progress_percent, bytes_transferred, total_bytes, error, created_at, started_at, completed_at FROM jobs`,
		`DROP TABLE jobs`,
		`ALTER TABLE jobs_migrated RENAME TO jobs`,
		`CREATE INDEX IF NOT EXISTS idx_jobs_status_order ON jobs(status, created_at)`,
		`CREATE INDEX IF NOT EXISTS idx_jobs_app_active ON jobs(app_id) WHERE status IN ('queued', 'running')`,
	}
	for _, s := range stmts {
		if _, err := tx.Exec(s); err != nil {
			return err
		}
	}
	return tx.Commit()
}

const schema = `
CREATE TABLE IF NOT EXISTS jobs (
	id                TEXT    PRIMARY KEY,
	type              TEXT    NOT NULL CHECK (type IN ('promote', 'evict', 'backup', 'remove')),
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
