package logger

import (
	"bytes"
	"fmt"
	"io"
	"log/slog"
	"os"
	"path/filepath"
	"sync"

	"github.com/Zeinshirou04/Zapp-Swap-Manager/core/internal/config"
)

const (
	// MaxLogSizeBytes is 5MB before rotating to zapp-core.log.1
	MaxLogSizeBytes = 5 * 1024 * 1024
	// DefaultRingCapacity is the maximum number of recent lines kept in memory
	DefaultRingCapacity = 1000
)

// RingBuffer stores the most recent log lines in a thread-safe circular memory buffer.
type RingBuffer struct {
	mu       sync.RWMutex
	lines    []string
	capacity int
}

// NewRingBuffer creates a RingBuffer with a fixed maximum line capacity.
func NewRingBuffer(capacity int) *RingBuffer {
	if capacity <= 0 {
		capacity = DefaultRingCapacity
	}
	return &RingBuffer{
		lines:    make([]string, 0, capacity),
		capacity: capacity,
	}
}

// Write implements io.Writer, capturing log lines emitted by slog.
func (r *RingBuffer) Write(p []byte) (n int, err error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	parts := bytes.Split(p, []byte("\n"))
	for _, part := range parts {
		trimmed := bytes.TrimRight(part, "\r")
		if len(trimmed) == 0 {
			continue
		}
		str := string(trimmed)
		if len(r.lines) >= r.capacity {
			// Drop oldest line
			r.lines = r.lines[1:]
		}
		r.lines = append(r.lines, str)
	}
	return len(p), nil
}

// Lines returns up to limit of the most recent log lines (oldest to newest).
func (r *RingBuffer) Lines(limit int) []string {
	r.mu.RLock()
	defer r.mu.RUnlock()

	if limit <= 0 || limit > len(r.lines) {
		limit = len(r.lines)
	}
	start := len(r.lines) - limit
	out := make([]string, limit)
	copy(out, r.lines[start:])
	return out
}

var (
	globalRing = NewRingBuffer(DefaultRingCapacity)
)

// LogDir returns the platform-specific directory where service logs are stored.
func LogDir() string {
	return filepath.Join(config.AppDir(), "logs")
}

// LogFilePath returns the default path for zapp-core.log.
func LogFilePath() string {
	return filepath.Join(LogDir(), "zapp-core.log")
}

// GetRecentLogs retrieves up to limit recent log lines from the in-memory ring buffer.
func GetRecentLogs(limit int) []string {
	return globalRing.Lines(limit)
}

// rotateIfNeeded renames logPath to logPath.1 if it exceeds MaxLogSizeBytes.
func rotateIfNeeded(logPath string) error {
	fi, err := os.Stat(logPath)
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return err
	}
	if fi.Size() >= MaxLogSizeBytes {
		backupPath := logPath + ".1"
		_ = os.Remove(backupPath)
		return os.Rename(logPath, backupPath)
	}
	return nil
}

// Setup initializes structured logging to os.Stdout, the persistent log file,
// and the in-memory ring buffer. Returns a cleanup function that flushes and closes the file.
func Setup(customLogPath string) (func(), error) {
	logPath := customLogPath
	if logPath == "" {
		logPath = LogFilePath()
	}

	dir := filepath.Dir(logPath)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return nil, fmt.Errorf("creating log directory: %w", err)
	}

	if err := rotateIfNeeded(logPath); err != nil {
		// Non-fatal, continue trying to open log file
		slog.Warn("log rotation failed", "err", err)
	}

	f, err := os.OpenFile(logPath, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0644)
	if err != nil {
		return nil, fmt.Errorf("opening log file: %w", err)
	}

	multi := io.MultiWriter(os.Stdout, f, globalRing)
	handler := slog.NewTextHandler(multi, &slog.HandlerOptions{
		Level: slog.LevelInfo,
	})
	logger := slog.New(handler)
	slog.SetDefault(logger)

	cleanup := func() {
		_ = f.Sync()
		_ = f.Close()
	}
	return cleanup, nil
}
