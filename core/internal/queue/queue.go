package queue

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"errors"
	"fmt"
	"strings"
	"sync"
	"time"
)

// ErrCancelled signals cooperative cancellation observed between steps.
var ErrCancelled = errors.New("cancellation observed between steps")

// ErrConflict rejects a job when the same game already has an active job
// (api/openapi.yaml POST /jobs responds 409; docs/safety.md "Queue": never
// run two jobs on the same game at once). Moves therefore always wait behind
// any queued or running backup of the same game, enforced here at enqueue.
var ErrConflict = errors.New("another job for this game is already queued or running")

// Executor runs one job's transfer sequence. Steps are reported through the
// supplied step function, which the queue uses to journal before/after each
// step and to check cooperative cancellation between them. Wired to
// transfer.Backup/Evict/Promote in Plan 007; tests provide fakes.
type Executor func(ctx context.Context, job Job, step StepFunc) error

// StepFunc wraps the execution of one sequence step.
type StepFunc func(stepIndex int, name string, run func() error) error

// Queue is the SQLite-backed FIFO job queue. Exactly one worker goroutine
// claims and executes jobs; everything else (enqueue, list, cancel) only
// mutates rows.
type Queue struct {
	db        *sql.DB
	wake      chan struct{}
	stop      chan struct{}
	done      chan struct{}
	closeOnce sync.Once

	cancelMu       sync.Mutex
	cancelRequests map[string]bool // job IDs flagged for cooperative cancel
}

// New opens the database at path, performs crash recovery (restart-safety
// per docs/safety.md: resume/roll back from the journal, never guess from
// folder state), and starts the single worker goroutine.
func New(path string, executor Executor) (*Queue, error) {
	db, err := Open(path)
	if err != nil {
		return nil, err
	}
	q := &Queue{
		db:             db,
		wake:           make(chan struct{}, 1),
		stop:           make(chan struct{}),
		done:           make(chan struct{}),
		cancelRequests: map[string]bool{},
	}
	if err := q.recoverRunningJobs(); err != nil {
		db.Close()
		return nil, err
	}
	go q.run(executor)
	return q, nil
}

// Close stops the worker (letting the current job finish) and closes the db.
func (q *Queue) Close() error {
	q.closeOnce.Do(func() {
		close(q.stop)
		<-q.done
		q.db.Close()
	})
	return nil
}

func (q *Queue) wakeWorker() {
	select {
	case q.wake <- struct{}{}:
	default:
	}
}

// validate returns a non-nil error when the request is not a bare app ID +
// whitelisted library ID (docs/safety.md "API input": reject any path).
func validate(req CreateJobRequest) error {
	switch req.Type {
	case TypePromote, TypeEvict, TypeBackup:
	default:
		return fmt.Errorf("unknown job type %q", req.Type)
	}
	if !isBareID(req.AppID) {
		return fmt.Errorf("app_id %q: accept only numeric app IDs, not paths", req.AppID)
	}
	if !isBareID(req.TargetLibraryID) {
		return fmt.Errorf("target_library_id %q: accept only whitelisted library IDs, not paths", req.TargetLibraryID)
	}
	return nil
}

func isBareID(s string) bool {
	// Accept only plain, non-path-like slugs: no separators, traversal
	// fragments, or leading underscores/dashes wrapping path tricks.
	if s == "" || strings.ContainsAny(s, `\/: "`) {
		return false
	}
	if strings.HasPrefix(s, ".") || strings.Contains(s, "..") {
		return false
	}
	return strings.TrimSpace(s) == s
}

// Enqueue validates, enforces the per-game concurrency guard, and appends
// the job to the FIFO tail.
func (q *Queue) Enqueue(req CreateJobRequest) (Job, error) {
	if err := validate(req); err != nil {
		return Job{}, err
	}
	id, err := newUUID()
	if err != nil {
		return Job{}, err
	}
	now := time.Now().UTC().Format(timeLayout)
	res, err := q.db.Exec(`
		INSERT INTO jobs (id, type, app_id, target_library_id, status, created_at)
		SELECT $1, $2, $3, $4, $5, $6
		WHERE NOT EXISTS (
			SELECT 1 FROM jobs WHERE app_id = $3 AND status IN ('queued', 'running')
		)`,
		id, req.Type, req.AppID, req.TargetLibraryID, StatusQueued, now)
	if err != nil {
		return Job{}, err
	}
	affected, err := res.RowsAffected()
	if err != nil {
		return Job{}, err
	}
	if affected == 0 {
		return Job{}, ErrConflict
	}
	q.wakeWorker()
	return q.GetJob(id)
}

// GetJob returns one job by ID.
func (q *Queue) GetJob(id string) (Job, error) {
	row := q.db.QueryRow(`SELECT `+jobColumns+` FROM jobs WHERE id = $1`, id)
	var j Job
	if err := j.scanFrom(row.Scan); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return Job{}, fmt.Errorf("job %s: %w", id, sql.ErrNoRows)
		}
		return Job{}, err
	}
	return j, nil
}

// ListJobs returns jobs ordered FIFO-oldest-first, optionally filtered by status.
func (q *Queue) ListJobs(statusFilter string) ([]Job, error) {
	var (
		rows *sql.Rows
		err  error
	)
	if statusFilter == "" {
		rows, err = q.db.Query(`SELECT ` + jobColumns + ` FROM jobs ORDER BY created_at, id`)
	} else {
		rows, err = q.db.Query(`SELECT `+jobColumns+` FROM jobs WHERE status = $1 ORDER BY created_at, id`, statusFilter)
	}
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var jobs []Job
	for rows.Next() {
		var j Job
		if err := j.scanFrom(rows.Scan); err != nil {
			return nil, err
		}
		jobs = append(jobs, j)
	}
	return jobs, rows.Err()
}

// CancelJob cancels queued jobs immediately, and flags running jobs for
// cooperative cancellation, which takes effect strictly between journaled
// steps (docs/safety.md "Queue").
func (q *Queue) CancelJob(id string) error {
	job, err := q.GetJob(id)
	if err != nil {
		return err
	}
	switch job.Status {
	case StatusQueued:
		msg := "cancelled while queued"
		completed := now()
		res, err := q.db.Exec(`UPDATE jobs SET status = $2, completed_at = $3, error = $4
			WHERE id = $1 AND status = $5`,
			id, StatusCancelled, nullTime(&completed), msg, StatusQueued)
		if err != nil {
			return err
		}
		if n, _ := res.RowsAffected(); n == 0 {
			return fmt.Errorf("job %s: no longer queued", id)
		}
		return nil
	case StatusRunning:
		q.cancelMu.Lock()
		q.cancelRequests[id] = true
		q.cancelMu.Unlock()
		return nil
	default:
		return fmt.Errorf("job %s: cannot cancel job in status %q", id, job.Status)
	}
}

// UpdateProgress records in-flight progress metrics for a running job.
func (q *Queue) UpdateProgress(id string, progressPercent float64, bytesTransferred, totalBytes int64) error {
	_, err := q.db.Exec(`UPDATE jobs
		SET progress_percent = ?, bytes_transferred = ?, total_bytes = ?
		WHERE id = ? AND status = ?`,
		progressPercent, bytesTransferred, totalBytes, id, StatusRunning)
	return err
}

// jobColumns is the projection shared by queries.
const jobColumns = `id, type, app_id, target_library_id, status, progress_percent,
	bytes_transferred, total_bytes, error, created_at, started_at, completed_at`

func newUUID() (string, error) {
	var b [16]byte
	if _, err := rand.Read(b[:]); err != nil {
		return "", fmt.Errorf("generate job id: %w", err)
	}
	b[6] = (b[6] & 0x0f) | 0x40 // UUID v4 bits
	b[8] = (b[8] & 0x3f) | 0x80
	s := hex.EncodeToString(b[:])
	return s[0:8] + "-" + s[8:12] + "-" + s[12:16] + "-" + s[16:20] + "-" + s[20:], nil
}
