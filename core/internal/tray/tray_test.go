package tray

import (
	"context"
	"fmt"
	"net"
	"path/filepath"
	"testing"
	"time"

	"github.com/Zeinshirou04/Zapp-Swap-Manager/core/internal/config"
	"github.com/Zeinshirou04/Zapp-Swap-Manager/core/internal/service"
)

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

func TestTrayHeadlessExecution(t *testing.T) {
	tmpDir := t.TempDir()
	dbPath := filepath.Join(tmpDir, "tray-test.db")
	port := freePort(t)

	cfg := &config.Config{
		BindAddr:    fmt.Sprintf("127.0.0.1:%d", port),
		BearerToken: "test-token",
		DBPath:      dbPath,
		Headless:    true,
	}

	svc, err := service.New(cfg, "test")
	if err != nil {
		t.Fatalf("service.New failed: %v", err)
	}

	runner := NewRunner(Actions{})

	ctx, cancel := context.WithTimeout(context.Background(), 200*time.Millisecond)
	defer cancel()

	// Should run and terminate cleanly when ctx expires
	err = runner.Run(ctx, svc)
	if err != nil {
		t.Fatalf("runner.Run failed: %v", err)
	}
}
