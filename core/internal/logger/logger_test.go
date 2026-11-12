package logger

import (
	"fmt"
	"io"
	"log/slog"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestRingBufferCapacityAndOrder(t *testing.T) {
	rb := NewRingBuffer(3)
	for i := 1; i <= 5; i++ {
		_, _ = rb.Write([]byte(fmt.Sprintf("line %d\n", i)))
	}

	lines := rb.Lines(10)
	if len(lines) != 3 {
		t.Fatalf("expected 3 lines, got %d", len(lines))
	}
	expected := []string{"line 3", "line 4", "line 5"}
	for i, want := range expected {
		if lines[i] != want {
			t.Errorf("line %d: want %q, got %q", i, want, lines[i])
		}
	}

	// Test limit
	sub := rb.Lines(2)
	if len(sub) != 2 || sub[0] != "line 4" || sub[1] != "line 5" {
		t.Errorf("unexpected subset: %v", sub)
	}
}

func TestLoggerSetupAndRotation(t *testing.T) {
	tmpDir := t.TempDir()
	logFile := filepath.Join(tmpDir, "test.log")

	// Pre-create an oversized file to test rotation
	bigData := make([]byte, MaxLogSizeBytes+10)
	if err := os.WriteFile(logFile, bigData, 0644); err != nil {
		t.Fatalf("writing big file: %v", err)
	}

	cleanup, err := Setup(logFile)
	if err != nil {
		t.Fatalf("Setup failed: %v", err)
	}
	defer cleanup()

	// Verify rotation happened
	if _, err := os.Stat(logFile + ".1"); err != nil {
		t.Errorf("expected rotated file %s.1 to exist: %v", logFile, err)
	}

	slog.Info("hello logger test", "key", "value123")

	recent := GetRecentLogs(10)
	found := false
	for _, l := range recent {
		if strings.Contains(l, "hello logger test") && strings.Contains(l, "value123") {
			found = true
			break
		}
	}
	if !found {
		t.Errorf("expected recent logs to contain log entry, got: %v", recent)
	}
}

type failingWriter struct{}

func (failingWriter) Write(_ []byte) (int, error) {
	return 0, fmt.Errorf("invalid handle")
}

func TestTolerantMultiWriterContinuesOnBrokenStdout(t *testing.T) {
	rb := NewRingBuffer(10)
	var fileBuf strings.Builder

	mw := &tolerantMultiWriter{writers: []io.Writer{failingWriter{}, rb, &fileBuf}}
	logger := slog.New(slog.NewTextHandler(mw, &slog.HandlerOptions{Level: slog.LevelInfo}))
	logger.Info("detached startup log", "status", "ok")

	lines := rb.Lines(5)
	if len(lines) != 1 || !strings.Contains(lines[0], "detached startup log") {
		t.Fatalf("expected ring buffer to capture log despite failing stdout, got %v", lines)
	}
	if !strings.Contains(fileBuf.String(), "detached startup log") {
		t.Fatalf("expected file writer to capture log despite failing stdout, got %q", fileBuf.String())
	}
}
