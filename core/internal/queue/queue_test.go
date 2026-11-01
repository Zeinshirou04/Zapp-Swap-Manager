package queue

import (
	"context"
	"errors"
	"path/filepath"
	"testing"
	"time"
)

// fakeExec runs each job through a single journaled step. The gate serializes
// the tests: the worker blocks inside the first job until the test releases it.
func fakeExec(gate chan struct{}, order chan<- string) Executor {
	return func(ctx context.Context, job Job, step StepFunc) error {
		if gate != nil {
			<-gate
		}
		if err := step(1, "step-"+job.Type, func() error { return nil }); err != nil {
			return err
		}
		if order != nil {
			order <- job.AppID
		}
		return nil
	}
}

func waitFor(t *testing.T, what string, cond func() bool) {
	t.Helper()
	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		if cond() {
			return
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatalf("timeout waiting for %s", what)
}

func TestFIFOOrdering(t *testing.T) {
	dir := t.TempDir()
	gate := make(chan struct{})
	order := make(chan string, 4)
	q, err := New(filepath.Join(dir, "jobs.db"), fakeExec(gate, order))
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	t.Cleanup(func() { q.Close() })

	for _, app := range []string{"10", "20", "30"} {
		if _, err := q.Enqueue(CreateJobRequest{Type: TypeBackup, AppID: app, TargetLibraryID: "hdd0"}); err != nil {
			t.Fatalf("Enqueue %s: %v", app, err)
		}
	}
	close(gate) // release the worker; it must run the three jobs FIFO
	for _, want := range []string{"10", "20", "30"} {
		select {
		case got := <-order:
			if got != want {
				t.Fatalf("out of order: got %s, want %s", got, want)
			}
		case <-time.After(5 * time.Second):
			t.Fatalf("timeout waiting for job %s", want)
		}
	}
	waitFor(t, "all jobs complete", func() bool {
		jobs, _ := q.ListJobs(StatusRunning)
		queued, _ := q.ListJobs(StatusQueued)
		return len(jobs) == 0 && len(queued) == 0
	})
}

func TestDuplicateSameGameRejected(t *testing.T) {
	dir := t.TempDir()
	gate := make(chan struct{})
	q, err := New(filepath.Join(dir, "jobs.db"), fakeExec(gate, nil))
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	t.Cleanup(func() { q.Close() })

	req := CreateJobRequest{Type: TypeBackup, AppID: "105600", TargetLibraryID: "hdd0"}
	if _, err := q.Enqueue(req); err != nil {
		t.Fatalf("first Enqueue: %v", err)
	}
	// Still active (queued or running) -> second job for the same game is refused.
	if _, err := q.Enqueue(req); !errors.Is(err, ErrConflict) {
		t.Fatalf("want ErrConflict, got %v", err)
	}
	close(gate)
	waitFor(t, "job complete", func() bool {
		all, err := q.ListJobs("")
		if err != nil {
			return false
		}
		for _, j := range all {
			if j.Status != StatusSucceeded && j.Status != StatusFailed && j.Status != StatusCancelled {
				return false
			}
		}
		return true
	})
	// Once terminal, the same game may be queued again.
	if _, err := q.Enqueue(req); err != nil {
		t.Fatalf("Enqueue after completion: %v", err)
	}
}

func TestQueuedCancel(t *testing.T) {
	dir := t.TempDir()
	gate := make(chan struct{})
	q, err := New(filepath.Join(dir, "jobs.db"), fakeExec(gate, nil))
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	t.Cleanup(func() { q.Close() })

	first, err := q.Enqueue(CreateJobRequest{Type: TypeBackup, AppID: "10", TargetLibraryID: "hdd0"})
	if err != nil {
		t.Fatalf("Enqueue: %v", err)
	}
	second, err := q.Enqueue(CreateJobRequest{Type: TypePromote, AppID: "20", TargetLibraryID: "ssd0"})
	if err != nil {
		t.Fatalf("Enqueue: %v", err)
	}

	if err := q.CancelJob(second.ID); err != nil {
		t.Fatalf("CancelJob: %v", err)
	}
	got, err := q.GetJob(second.ID)
	if err != nil {
		t.Fatalf("GetJob: %v", err)
	}
	if got.Status != StatusCancelled || got.Error == nil || *got.Error != "cancelled while queued" {
		t.Fatalf("cancelled job = %+v", got)
	}
	// Cancelling a terminal/queued mismatch is refused.
	if err := q.CancelJob(second.ID); err == nil {
		t.Error("cancel of an already-cancelled job must be refused")
	}

	close(gate)
	waitFor(t, "queue drained", func() bool {
		queued, _ := q.ListJobs(StatusQueued)
		running, _ := q.ListJobs(StatusRunning)
		return len(queued) == 0 && len(running) == 0
	})
	if got, _ = q.GetJob(first.ID); got.Status != StatusSucceeded {
		t.Fatalf("first job = %+v, want succeeded", got)
	}
}

func TestRunningCancelCooperative(t *testing.T) {
	dir := t.TempDir()
	gate := make(chan struct{})
	q, err := New(filepath.Join(dir, "jobs.db"), fakeExec(gate, nil))
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	t.Cleanup(func() { q.Close() })

	job, err := q.Enqueue(CreateJobRequest{Type: TypeBackup, AppID: "66", TargetLibraryID: "hdd0"})
	if err != nil {
		t.Fatalf("Enqueue: %v", err)
	}
	waitFor(t, "claim", func() bool {
		j, err := q.GetJob(job.ID)
		return err == nil && j.Status == StatusRunning
	})
	// Cooperative cancel: takes effect between journaled steps only.
	if err := q.CancelJob(job.ID); err != nil {
		t.Fatalf("CancelJob: %v", err)
	}
	close(gate)

	waitFor(t, "cancel observed", func() bool {
		j, err := q.GetJob(job.ID)
		return err == nil && j.Status == StatusCancelled
	})
	got, _ := q.GetJob(job.ID)
	if got.Error == nil || *got.Error != "cancelled between steps" {
		t.Fatalf("error = %v, want 'cancelled between steps'", got.Error)
	}
	if got.CompletedAt == nil {
		t.Error("cancelled running job must have completed_at set")
	}
}

func TestEnqueueValidationRejectsPaths(t *testing.T) {
	dir := t.TempDir()
	q, err := New(filepath.Join(dir, "jobs.db"), fakeExec(nil, nil))
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	t.Cleanup(func() { q.Close() })
	bad := []CreateJobRequest{
		{Type: "rm_rf", AppID: "1", TargetLibraryID: "hdd0"},
		{Type: TypeEvict, AppID: `D:\SteamLibrary`, TargetLibraryID: "hdd0"},
		{Type: TypeEvict, AppID: "1", TargetLibraryID: "../hdd0"},
		{Type: TypeEvict, AppID: "", TargetLibraryID: "hdd0"},
	}
	for i, req := range bad {
		if _, err := q.Enqueue(req); err == nil {
			t.Errorf("case %d: expected rejection of %+v", i, req)
		}
	}
}

// TestCrashRecovery seeds the on-disk state a killed process would leave —
// a 'running' job with a journal "started" entry — then proves a fresh New()
// requeues it from the journal (never from folder state) and runs it to a
// terminal status with a recovery journal tail.
func TestCrashRecovery(t *testing.T) {
	dir := t.TempDir()
	dbPath := filepath.Join(dir, "jobs.db")

	db, err := Open(dbPath)
	if err != nil {
		t.Fatalf("Open: %v", err)
	}
	stuckID := "11111111-2222-3333-4444-555555555555"
	now := time.Now().UTC().Format(timeLayout)
	if _, err := db.Exec(`INSERT INTO jobs (id, type, app_id, target_library_id, status, progress_percent, created_at)
		VALUES (?, ?, '999', 'hdd0', ?, 10, ?)`, stuckID, TypeBackup, StatusRunning, now); err != nil {
		t.Fatalf("seed job: %v", err)
	}
	if _, err := db.Exec(`INSERT INTO job_journal (job_id, step_index, step_name, status, recorded_at)
		VALUES (?, 1, 'mirror', 'started', ?)`, stuckID, now); err != nil {
		t.Fatalf("seed journal: %v", err)
	}
	db.Close() // the "crash"

	exec := func(ctx context.Context, job Job, step StepFunc) error {
		return step(1, "mirror", func() error { return nil })
	}
	q, err := New(dbPath, exec)
	if err != nil {
		t.Fatalf("New after crash: %v", err)
	}
	t.Cleanup(func() { q.Close() })

	got, err := q.GetJob(stuckID)
	if err != nil {
		t.Fatalf("GetJob: %v", err)
	}
	if got.Status != StatusQueued && got.Status != StatusSucceeded {
		// It must at minimum be requeued (or already finishedsuccessfully).
		t.Fatalf("recovered job stuck in %q", got.Status)
	}
	waitFor(t, "recovered job completes", func() bool {
		j, err := q.GetJob(stuckID)
		return err == nil && j.Status == StatusSucceeded
	})
	// The journal must contain the recovery note appended by recovery.
	var n int
	if err := q.db.QueryRow(`SELECT COUNT(*) FROM job_journal WHERE job_id = ? AND step_name = 'recovery'`, stuckID).Scan(&n); err != nil {
		t.Fatalf("journal query: %v", err)
	}
	if n != 1 {
		t.Errorf("recovery journal entries = %d, want 1", n)
	}
}
