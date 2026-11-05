package queue

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"log/slog"
	"strings"
	"time"
)

// claimNext pops the FIFO head and flips it to running. One worker goroutine
// calls this, so the claim cannot race (docs/safety.md "Queue": strictly
// serial, FIFO, one worker).
func (q *Queue) claimNext() (Job, error) {
	row := q.db.QueryRow(`SELECT `+jobColumns+` FROM jobs WHERE status = ? ORDER BY created_at, id LIMIT 1`, StatusQueued)
	var head Job
	err := head.scanFrom(row.Scan)
	if errors.Is(err, sql.ErrNoRows) {
		return Job{}, nil // nothing to do
	}
	if err != nil {
		return Job{}, err
	}
	res, err := q.db.Exec(`UPDATE jobs
		SET status = ?, started_at = ?, completed_at = NULL, error = NULL
		WHERE id = ? AND status = ?`,
		StatusRunning, nullTime(timePtr(now())), head.ID, StatusQueued)
	if err != nil {
		return Job{}, err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return Job{}, nil // status changed between read and claim; retry next loop
	}
	return q.GetJob(head.ID)
}

func timePtr(t time.Time) *time.Time { return &t }

// Journal step statuses for the job_journal table.
const (
	StatusJournalStarted   = "started"
	StatusJournalCompleted = "completed"
	StatusJournalFailed    = "failed"
)

// stepFn builds the journaling StepFunc bound to one job. Safety rules from
// docs/safety.md "Queue": every step is journaled before and after it runs,
// and cooperative cancellation is checked between journaled steps only —
// never mid-step.
func (q *Queue) stepFn(job Job) StepFunc {
	return func(index int, name string, run func() error) error {
		if q.cancelRequested(job.ID) {
			return ErrCancelled
		}
		slog.Info("job step started", "job_id", job.ID, "step", index, "name", name)
		if err := q.journal(job.ID, index, name, StatusJournalStarted, nil); err != nil {
			return err
		}
		if err := run(); err != nil {
			details := err.Error()
			slog.Error("job step failed", "job_id", job.ID, "step", index, "name", name, "err", err)
			q.journal(job.ID, index, name, StatusJournalFailed, &details)
			return err
		}
		slog.Info("job step completed", "job_id", job.ID, "step", index, "name", name)
		return q.journal(job.ID, index, name, StatusJournalCompleted, nil)
	}
}

func (q *Queue) cancelRequested(id string) bool {
	q.cancelMu.Lock()
	defer q.cancelMu.Unlock()
	return q.cancelRequests[id]
}

func (q *Queue) journal(jobID string, index int, name, status string, details *string) error {
	_, err := q.db.Exec(`INSERT INTO job_journal (job_id, step_index, step_name, status, recorded_at, details)
		VALUES (?, ?, ?, ?, ?, ?)`,
		jobID, index, name, status, nullTime(timePtr(now())), details)
	if err != nil {
		return fmt.Errorf("journal %s step %d %q %s: %w", jobID, index, name, status, err)
	}
	return nil
}

// Steps returns a job's journal entries (api GET /jobs/{job_id} step logs).
func (q *Queue) Steps(jobID string) ([]JournalEntry, error) {
	return q.journalSteps(jobID)
}

// journalSteps lists a job's journal entries in execution order.
func (q *Queue) journalSteps(jobID string) ([]JournalEntry, error) {
	rows, err := q.db.Query(`SELECT id, job_id, step_index, step_name, status, recorded_at, details
		FROM job_journal WHERE job_id = ? ORDER BY step_index, id`, jobID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var entries []JournalEntry
	for rows.Next() {
		var e JournalEntry
		var recorded sql.NullString
		var details sql.NullString
		if err := rows.Scan(&e.ID, &e.JobID, &e.StepIndex, &e.StepName, &e.Status, &recorded, &details); err != nil {
			return nil, err
		}
		e.RecordedAt = parseTime(recorded.String)
		if details.Valid && details.String != "" {
			d := details.String
			e.Details = &d
		}
		entries = append(entries, e)
	}
	return entries, rows.Err()
}

// recoverRunningJobs applies restart recovery (docs/safety.md "Queue": "On
// restart, resume or roll back from the journal. Never guess from folder
// state"). Sequence steps are idempotent by design, so an interrupted
// 'running' job is requeued from a safe point: repeating the sequence reruns
// each journaled step, and completed ones are no-ops in practice (e.g. a
// manifest already moved is left where it is by the guard layer). If a
// resumed sequence cannot proceed (e.g. the SSD copy is already gone), the
// guards reject it and the job ends failed — always decided from journal +
// guards, never by inspecting folders directly.
//
// shortcut: the drop guard replays with LastBackup=nil on this first run
// after a restart; wiring last-backup metrics into the journal arrives with
// the API server (Plan 007).
func (q *Queue) recoverRunningJobs() error {
	rows, err := q.db.Query(`SELECT id FROM jobs WHERE status = ?`, StatusRunning)
	if err != nil {
		return err
	}
	var ids []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			rows.Close()
			return err
		}
		ids = append(ids, id)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return err
	}
	for _, id := range ids {
		steps, err := q.journalSteps(id)
		if err != nil {
			return err
		}
		desc := fmt.Sprintf("requeued after restart; %d journal entries; last: none", len(steps))
		if len(steps) > 0 {
			desc = fmt.Sprintf("requeued after restart; %d journal entries; last: %s",
				len(steps), steps[len(steps)-1].String())
		}
		if _, err := q.db.Exec(`UPDATE jobs
			SET status = ?, started_at = NULL, completed_at = NULL, error = NULL
			WHERE id = ? AND status = ?`, StatusQueued, id, StatusRunning); err != nil {
			return err
		}
		if err := q.journalRecovery(id, &desc); err != nil {
			return err
		}
	}
	return nil
}

// journalRecovery records a recovery note as the tail journal entry.
func (q *Queue) journalRecovery(jobID string, details *string) error {
	var idx sql.NullInt64
	if err := q.db.QueryRow(`SELECT MAX(step_index) FROM job_journal WHERE job_id = ?`, jobID).Scan(&idx); err != nil {
		return err
	}
	_, err := q.db.Exec(`INSERT INTO job_journal (job_id, step_index, step_name, status, recorded_at, details)
		VALUES (?, ?, 'recovery', 'completed', ?, ?)`,
		jobID, int(idx.Int64)+1, nullTime(timePtr(now())), details)
	return err
}

// run is the single worker goroutine. It drains the FIFO one job at a time
// until Close: claim a job, execute it to a terminal state (journaled),
// claim the next.
func (q *Queue) run(executor Executor) {
	defer close(q.done)
	q.wakeWorker() // process recovery-requeued jobs from a fresh start
	for {
		select {
		case <-q.stop:
			return
		case <-q.wake:
		}
		for {
			select {
			case <-q.stop:
				return
			default:
			}
			job, err := q.claimNext()
			if err != nil {
				time.Sleep(25 * time.Millisecond) // transient DB hiccup; retry
				continue
			}
			if job.ID == "" {
				break // queue empty; wait for the next wake
			}
			q.execute(executor, job)
		}
	}
}

// execute runs one claimed job to a terminal state. The final status written
// here is always derived from what the executor reported through the step
// journal — never from folder state.
func (q *Queue) execute(executor Executor, job Job) {
	slog.Info("queue starting job", "job_id", job.ID, "type", job.Type, "app_id", job.AppID, "target", job.TargetLibraryID)
	result, execErr := StatusSucceeded, error(nil)
	execErr = executor(context.Background(), job, q.stepFn(job))
	switch {
	case execErr == nil:
		// success
	case q.cancelRequested(job.ID) && errors.Is(execErr, ErrCancelled):
		result = StatusCancelled
	default:
		result = StatusFailed
	}

	var msg *string
	var holder string
	if execErr != nil {
		holder = strings.TrimSpace(execErr.Error())
		if result == StatusCancelled {
			holder = "cancelled between steps"
		}
		msg = &holder
	}
	progress := 0.0
	if result == StatusSucceeded {
		progress = 100
	}
	completed := now()
	writeStatus := func() {
		_, wErr := q.db.Exec(`UPDATE jobs
			SET status = ?, progress_percent = ?, error = ?, completed_at = ?
			WHERE id = ?`,
			result, progress, msg, nullTime(&completed), job.ID)
		if wErr != nil {
			time.Sleep(25 * time.Millisecond)
			q.db.Exec(`UPDATE jobs
				SET status = ?, progress_percent = ?, error = ?, completed_at = ?
				WHERE id = ?`,
				result, progress, msg, nullTime(&completed), job.ID) // last-ditch retry; journal keeps the history
		}
	}
	writeStatus()
	switch result {
	case StatusSucceeded:
		slog.Info("queue job succeeded", "job_id", job.ID, "type", job.Type, "app_id", job.AppID)
	case StatusCancelled:
		slog.Warn("queue job cancelled", "job_id", job.ID, "type", job.Type, "app_id", job.AppID)
	default:
		slog.Error("queue job failed", "job_id", job.ID, "type", job.Type, "app_id", job.AppID, "err", execErr)
	}
}
