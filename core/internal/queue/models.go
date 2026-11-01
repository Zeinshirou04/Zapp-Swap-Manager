package queue

import (
	"database/sql"
	"fmt"
	"time"
)

// Job statuses and types (api/openapi.yaml + docs/safety.md "Queue").
const (
	StatusQueued    = "queued"
	StatusRunning   = "running"
	StatusSucceeded = "succeeded"
	StatusFailed    = "failed"
	StatusCancelled = "cancelled"

	TypePromote = "promote"
	TypeEvict   = "evict"
	TypeBackup  = "backup"
)

// Job mirrors the `Job` schema in api/openapi.yaml.
type Job struct {
	ID               string     `json:"id"`
	Type             string     `json:"type"`
	AppID            string     `json:"app_id"`
	TargetLibraryID  string     `json:"target_library_id"`
	Status           string     `json:"status"`
	ProgressPercent  float64    `json:"progress_percent"`
	BytesTransferred int64      `json:"bytes_transferred"`
	TotalBytes       int64      `json:"total_bytes"`
	Error            *string    `json:"error"`
	CreatedAt        time.Time  `json:"created_at"`
	StartedAt        *time.Time `json:"started_at"`
	CompletedAt      *time.Time `json:"completed_at"`
}

// CreateJobRequest is the input accepted from the API (plans 002/006):
// only app IDs and whitelisted library IDs — never filesystem paths.
type CreateJobRequest struct {
	Type            string `json:"type"`
	AppID           string `json:"app_id"`
	TargetLibraryID string `json:"target_library_id"`
}

// timeLayout mirrors db.go's storage format for timestamp columns.
const timeLayout = time.RFC3339Nano

// now returns the canonical UTC timestamp used for all job timestamps.
func now() time.Time { return time.Now().UTC() }

func parseTime(s string) time.Time {
	for _, l := range []string{timeLayout, time.RFC3339} {
		if t, err := time.Parse(l, s); err == nil {
			return t
		}
	}
	return time.Time{}
}

func nullTime(t *time.Time) any {
	if t == nil {
		return nil
	}
	return t.Format(timeLayout)
}

func sqlTimePtr(s sql.NullString) *time.Time {
	if !s.Valid || s.String == "" {
		return nil
	}
	t := parseTime(s.String)
	return &t
}

// scanFrom hydrates a Job from a row using the projection in jobColumns.
func (j *Job) scanFrom(scan func(dest ...any) error) error {
	var errSt, started, completed, created sql.NullString
	if err := scan(
		&j.ID, &j.Type, &j.AppID, &j.TargetLibraryID, &j.Status,
		&j.ProgressPercent, &j.BytesTransferred, &j.TotalBytes,
		&errSt, &created, &started, &completed,
	); err != nil {
		return err
	}
	j.Error = nil
	if errSt.Valid && errSt.String != "" {
		e := errSt.String
		j.Error = &e
	}
	j.CreatedAt = parseTime(created.String)
	j.StartedAt = sqlTimePtr(started)
	j.CompletedAt = sqlTimePtr(completed)
	return nil
}

// JournalEntry is one recorded step of a job (job_journal table).
type JournalEntry struct {
	ID         int64
	JobID      string
	StepIndex  int
	StepName   string
	Status     string // started | completed | failed
	RecordedAt time.Time
	Details    *string
}

func (e *JournalEntry) String() string {
	d := ""
	if e.Details != nil {
		d = " — " + *e.Details
	}
	return fmt.Sprintf("step %d %q %s%s", e.StepIndex, e.StepName, e.Status, d)
}
