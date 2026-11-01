package service

import (
	"context"
	"fmt"
	"net"
	"net/http"
	"path/filepath"
	"testing"
	"time"

	"github.com/Zeinshirou04/Zapp-Swap-Manager/core/internal/config"
	"github.com/Zeinshirou04/Zapp-Swap-Manager/core/internal/queue"
)

// freePort finds an available TCP port on 127.0.0.1.
func freePort(t *testing.T) int {
	t.Helper()
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("failed to listen on 127.0.0.1:0: %v", err)
	}
	port := ln.Addr().(*net.TCPAddr).Port
	_ = ln.Close()
	return port
}

func TestServiceLifecycle(t *testing.T) {
	tmpDir := t.TempDir()
	dbPath := filepath.Join(tmpDir, "test-queue.db")
	port := freePort(t)

	cfg := &config.Config{
		BindAddr:    fmt.Sprintf("127.0.0.1:%d", port),
		BearerToken: "test-secret-token",
		DBPath:      dbPath,
		Headless:    true,
	}

	svc, err := New(cfg, "0.1.0-test")
	if err != nil {
		t.Fatalf("New service failed: %v", err)
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	if err := svc.Start(ctx); err != nil {
		t.Fatalf("Service start failed: %v", err)
	}

	// Give the HTTP server a brief moment to listen
	client := &http.Client{Timeout: 2 * time.Second}
	url := fmt.Sprintf("http://127.0.0.1:%d/health", port)

	var resp *http.Response
	for i := 0; i < 20; i++ {
		req, err := http.NewRequest(http.MethodGet, url, nil)
		if err != nil {
			t.Fatal(err)
		}
		req.Header.Set("Authorization", "Bearer test-secret-token")

		resp, err = client.Do(req)
		if err == nil {
			break
		}
		time.Sleep(25 * time.Millisecond)
	}

	if resp == nil {
		t.Fatal("http server did not start in time")
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected HTTP 200 from /health, got %d", resp.StatusCode)
	}

	// Test graceful shutdown
	if err := svc.Stop(); err != nil {
		t.Fatalf("Stop failed: %v", err)
	}
}

func TestServiceJobExecutionRoundTrip(t *testing.T) {
	tmpDir := t.TempDir()
	dbPath := filepath.Join(tmpDir, "test-queue.db")
	port := freePort(t)

	executed := make(chan string, 1)
	fakeExecutor := func(ctx context.Context, job queue.Job, step queue.StepFunc) error {
		return step(1, "fake-step", func() error {
			executed <- job.ID
			return nil
		})
	}

	cfg := &config.Config{
		BindAddr:    fmt.Sprintf("127.0.0.1:%d", port),
		BearerToken: "test-token",
		DBPath:      dbPath,
		Headless:    true,
	}

	svc, err := NewWithExecutor(cfg, "0.1.0-test", fakeExecutor)
	if err != nil {
		t.Fatalf("NewWithExecutor failed: %v", err)
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	if err := svc.Start(ctx); err != nil {
		t.Fatalf("svc.Start failed: %v", err)
	}
	defer svc.Stop()

	job, err := svc.Queue().Enqueue(queue.CreateJobRequest{
		Type:            queue.TypeBackup,
		AppID:           "105600",
		TargetLibraryID: "hdd1",
	})
	if err != nil {
		t.Fatalf("Enqueue failed: %v", err)
	}

	select {
	case id := <-executed:
		if id != job.ID {
			t.Fatalf("expected executed job %s, got %s", job.ID, id)
		}
	case <-time.After(3 * time.Second):
		t.Fatal("timed out waiting for job to execute")
	}
}

func TestNewRejectsNilConfig(t *testing.T) {
	_, err := New(nil, "v1")
	if err == nil {
		t.Fatal("expected error with nil config, got nil")
	}
}
