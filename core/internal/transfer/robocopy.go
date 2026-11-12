// Package transfer implements the file transfer engine and the operation
// sequences (Backup, Evict, Promote) from docs/safety.md, behind a pluggable
// Driver interface (robocopy on Windows, rsync on Linux).
//
// Invariants enforced here:
//   - Robocopy exit codes 0-7 are success variants; 8+ are failures
//     (rsync: any non-zero exit code is a failure).
//   - A mirror never runs before an equivalent dry run has been read.
//   - SSD data is deleted only after the HDD copy is verified and the
//     manifest has been moved.
//   - A manifest ends up in exactly one library's steamapps folder at a time.
//
// Paths reaching this package come from whitelisted library roots + a
// manifest installDir (see docs/safety.md "API input"); the openapi contract
// guarantees clients never pass raw paths.
package transfer

import (
	"bufio"
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"os/exec"
	"strconv"
	"strings"
	"sync"
	"time"
)

// Mode flags per docs/safety.md "Directions":
// SSD -> HDD uses MIRROR (/MIR); HDD -> SSD uses COPY (/E, never mirror).
const (
	MirrorFlag = "/MIR"
	CopyFlag   = "/E"
	DryRunFlag = "/L"
)

// Common flags: suppress directory tree spam, stream per-file & % progress, robust retry policy.
var commonFlags = []string{"/NDL", "/R:2", "/W:2"}

// RobocopyConfig carries user-tunable performance and retry options.
type RobocopyConfig struct {
	Threads     int  // 1-128 (/MT:N)
	Retries     int  // 0-20 (/R:N)
	WaitSeconds int  // 0-60 (/W:N)
	Unbuffered  bool // /J
}

type robocopyCtxKey struct{}

// withRobocopyConfig attaches optional Robocopy flags to ctx for the driver.
func withRobocopyConfig(ctx context.Context, cfg *RobocopyConfig) context.Context {
	if cfg == nil {
		return ctx
	}
	cp := *cfg
	return context.WithValue(ctx, robocopyCtxKey{}, &cp)
}

func robocopyConfigFromContext(ctx context.Context) *RobocopyConfig {
	if ctx == nil {
		return nil
	}
	if cfg, ok := ctx.Value(robocopyCtxKey{}).(*RobocopyConfig); ok {
		return cfg
	}
	return nil
}

func tailFlags(cfg *RobocopyConfig) []string {
	if cfg == nil {
		return commonFlags
	}
	retries := cfg.Retries
	if retries < 0 {
		retries = 0
	} else if retries > 20 {
		retries = 20
	}
	wait := cfg.WaitSeconds
	if wait < 0 {
		wait = 0
	} else if wait > 60 {
		wait = 60
	}
	threads := cfg.Threads
	if threads <= 0 {
		threads = 8
	} else if threads > 128 {
		threads = 128
	}

	flags := []string{
		"/NDL",
		fmt.Sprintf("/R:%d", retries),
		fmt.Sprintf("/W:%d", wait),
		fmt.Sprintf("/MT:%d", threads),
	}
	if cfg.Unbuffered {
		flags = append(flags, "/J")
	}
	return flags
}

// Result carries Robocopy's exit code and captured output.
type Result struct {
	ExitCode int
	Output   string
}

// OK reports whether the exit code is a success variant (0-7).
func (r Result) OK() bool { return r.ExitCode < 8 }

// exitBits describes Robocopy's documented exit-code bit flags.
var exitBits = []struct {
	mask int
	name string
}{
	{1, "files copied"},
	{2, "extra files detected"},
	{4, "mismatches detected"},
	{8, "some files or directories could not be processed"},
	{16, "serious error, no files copied"},
}

// ExitCodeError turns a failing Robocopy exit code (>= 8) into a descriptive
// error; any success variant (0-7) returns nil.
func ExitCodeError(code int) error {
	if code >= 0 && code < 8 {
		return nil
	}
	desc := fmt.Sprintf("robocopy exit code %d:", code)
	first := true
	for _, b := range exitBits {
		if code&b.mask != 0 {
			if !first {
				desc += ";"
			}
			desc += " " + b.name
			first = false
		}
	}
	return fmt.Errorf("%s (must be 0-7)", desc)
}

var runRobocopy = runRobocopyReal

// runRobocopyReal executes robocopy.exe and streams its stdout/stderr lines
// live into slog so users see progress in real time while capturing bounded output.
// Robocopy signals success variants (0-7) through the process exit code, so
// an exec.ExitError is not an execution failure: decode the code and return
// it in the Result.
func runRobocopyReal(ctx context.Context, src, dst string, flags ...string) (Result, error) {
	dryRun := hasFlag(flags, DryRunFlag)
	tail := tailFlags(robocopyConfigFromContext(ctx))
	if dryRun {
		tail = append([]string{"/NP", "/NFL"}, tail...)
	}
	args := buildArgsWithTail(src, dst, tail, flags...)
	cmd := exec.CommandContext(ctx, "robocopy", args...)
	hideConsole(cmd)

	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return Result{}, fmt.Errorf("robocopy stdout pipe: %w", err)
	}
	stderr, err := cmd.StderrPipe()
	if err != nil {
		return Result{}, fmt.Errorf("robocopy stderr pipe: %w", err)
	}

	if err := cmd.Start(); err != nil {
		return Result{}, fmt.Errorf("run robocopy: %w", err)
	}

	streamLog := newRobocopyStreamLogger(dryRun)
	var outBuf boundedOutput
	var outMu sync.Mutex
	var wg sync.WaitGroup

	drain := func(r io.Reader, isErr bool) {
		defer wg.Done()
		sc := bufio.NewScanner(r)
		sc.Buffer(make([]byte, 0, 16*1024), 256*1024)
		sc.Split(scanCRorLF)
		for sc.Scan() {
			raw := sc.Text()
			trimmed := strings.TrimSpace(raw)
			if trimmed == "" {
				continue
			}
			outMu.Lock()
			outBuf.WriteLine(trimmed)
			outMu.Unlock()
			streamLog.LogLine(trimmed, isErr)
		}
	}

	wg.Add(2)
	go drain(stdout, false)
	go drain(stderr, true)

	wg.Wait()
	waitErr := cmd.Wait()
	res := Result{Output: outBuf.String()}
	var exitErr *exec.ExitError
	if waitErr != nil && !errors.As(waitErr, &exitErr) {
		return res, fmt.Errorf("run robocopy: %w", waitErr)
	}
	if exitErr != nil {
		res.ExitCode = exitErr.ExitCode()
	}
	return res, nil
}

func hasFlag(flags []string, target string) bool {
	for _, f := range flags {
		if strings.EqualFold(f, target) {
			return true
		}
	}
	return false
}

// scanCRorLF splits Robocopy output on both '\r' (in-place % updates) and '\n'.
func scanCRorLF(data []byte, atEOF bool) (advance int, token []byte, err error) {
	if atEOF && len(data) == 0 {
		return 0, nil, nil
	}
	for i := 0; i < len(data); i++ {
		if data[i] == '\n' {
			return i + 1, data[:i], nil
		}
		if data[i] == '\r' {
			if i+1 < len(data) && data[i+1] == '\n' {
				return i + 2, data[:i], nil
			}
			if i+1 == len(data) && !atEOF {
				return 0, nil, nil
			}
			return i + 1, data[:i], nil
		}
	}
	if atEOF {
		return len(data), data, nil
	}
	return 0, nil, nil
}

type boundedOutput struct {
	buf bytes.Buffer
}

const maxCapturedRobocopyBytes = 256 * 1024

func (b *boundedOutput) WriteLine(line string) {
	if b.buf.Len() >= maxCapturedRobocopyBytes {
		return
	}
	if b.buf.Len() > 0 {
		b.buf.WriteByte('\n')
	}
	b.buf.WriteString(line)
}

func (b *boundedOutput) String() string {
	return b.buf.String()
}

type robocopyStreamLogger struct {
	mu          sync.Mutex
	dryRun      bool
	nowFn       func() time.Time
	emitFn      func(level slog.Level, msg string, attrs ...any)
	activeFile  string
	lastFileAt  time.Time
	lastPct     float64
	lastPctAt   time.Time
	inSummary   bool
}

func newRobocopyStreamLogger(dryRun bool) *robocopyStreamLogger {
	return &robocopyStreamLogger{
		dryRun:  dryRun,
		nowFn:   time.Now,
		lastPct: -1,
		emitFn: func(level slog.Level, msg string, attrs ...any) {
			slog.Log(context.Background(), level, msg, attrs...)
		},
	}
}

func (l *robocopyStreamLogger) LogLine(line string, isStderr bool) {
	l.mu.Lock()
	defer l.mu.Unlock()

	trimmed := strings.TrimSpace(line)
	if trimmed == "" {
		return
	}
	now := l.nowFn()
	lower := strings.ToLower(trimmed)

	// Errors, retries, and access problems are always surfaced immediately.
	if isStderr ||
		strings.Contains(lower, "error ") ||
		strings.Contains(lower, "retrying") ||
		strings.Contains(lower, "waiting ") ||
		strings.Contains(lower, "failed") ||
		strings.Contains(lower, "access is denied") ||
		strings.Contains(lower, "mismatch") ||
		strings.Contains(lower, "cannot access") {
		l.emitFn(slog.LevelWarn, "robocopy", "line", trimmed)
		return
	}

	// Separator or job header/summary lines.
	if strings.HasPrefix(trimmed, "---") {
		return
	}
	if strings.HasPrefix(trimmed, "Started :") ||
		strings.HasPrefix(trimmed, "Source :") ||
		strings.HasPrefix(trimmed, "Dest :") ||
		strings.HasPrefix(trimmed, "Options :") ||
		strings.HasPrefix(trimmed, "Ended :") ||
		strings.HasPrefix(trimmed, "Speed :") ||
		strings.HasPrefix(trimmed, "Times :") ||
		strings.HasPrefix(trimmed, "Total") {
		if strings.HasPrefix(trimmed, "Total") {
			l.inSummary = true
		}
		l.emitFn(slog.LevelInfo, "robocopy", "line", trimmed)
		return
	}
	if l.inSummary && (strings.HasPrefix(trimmed, "Dirs :") ||
		strings.HasPrefix(trimmed, "Files :") ||
		strings.HasPrefix(trimmed, "Bytes :")) {
		l.emitFn(slog.LevelInfo, "robocopy", "line", trimmed)
		return
	}

	// In-place percentage updates ("12.5%", "100%").
	if strings.HasSuffix(trimmed, "%") && len(trimmed) <= 8 {
		numStr := strings.TrimSuffix(trimmed, "%")
		if pct, err := strconv.ParseFloat(strings.TrimSpace(numStr), 64); err == nil {
			if l.lastPct < 0 || pct == 100 || pct-l.lastPct >= 10 || now.Sub(l.lastPctAt) >= 3*time.Second {
				l.lastPct = pct
				l.lastPctAt = now
				if l.activeFile != "" {
					l.emitFn(slog.LevelInfo, "robocopy progress", "percent", trimmed, "file", l.activeFile)
				} else {
					l.emitFn(slog.LevelInfo, "robocopy progress", "percent", trimmed)
				}
			}
			return
		}
	}

	// File activity lines ("New File   1.2 g   pakchunk0.pak", "*EXTRA File ...", etc.).
	if l.dryRun {
		return
	}
	l.activeFile = extractRobocopyFileName(trimmed)
	if l.lastFileAt.IsZero() || now.Sub(l.lastFileAt) >= 1500*time.Millisecond {
		l.lastFileAt = now
		l.emitFn(slog.LevelInfo, "robocopy file", "detail", strings.Join(strings.Fields(trimmed), " "))
	}
}

func extractRobocopyFileName(trimmed string) string {
	// Robocopy columns are tab-separated: "<Class>\t<Size>\t<File>" (or spaces if normalized).
	if parts := strings.Split(trimmed, "\t"); len(parts) >= 3 {
		return strings.TrimSpace(parts[len(parts)-1])
	}
	fields := strings.Fields(trimmed)
	if len(fields) == 0 {
		return ""
	}
	startIdx := 0
	if fields[0] == "New" || fields[0] == "*EXTRA" || fields[0] == "EXTRA" {
		startIdx = 2 // skip "<Class1> <Class2>"
	} else if fields[0] == "Newer" || fields[0] == "Older" || fields[0] == "Modified" || fields[0] == "Same" {
		startIdx = 1
	}
	if startIdx > 0 && startIdx+1 < len(fields) {
		// Skip size token (and optional unit suffix like "g", "m", "k").
		nameIdx := startIdx + 1
		if nameIdx < len(fields)-1 && len(fields[nameIdx]) == 1 && strings.ContainsAny(fields[nameIdx], "kmgtKMGT") {
			nameIdx++
		}
		return strings.Join(fields[nameIdx:], " ")
	}
	return fields[len(fields)-1]
}

func buildArgsWithTail(src, dst string, tail []string, flags ...string) []string {
	args := []string{src, dst}
	args = append(args, flags...)
	args = append(args, tail...)
	return args
}

func buildArgs(src, dst string, flags ...string) []string {
	return buildArgsWithTail(src, dst, commonFlags, flags...)
}

// Run executes one Robocopy invocation and enforces the exit-code rule:
// 0-7 pass (the Result is returned), >= 8 fail with a descriptive error.
func Run(ctx context.Context, src, dst string, flags ...string) (Result, error) {
	res, err := runRobocopy(ctx, src, dst, flags...)
	if err != nil {
		return res, err
	}
	return res, ExitCodeError(res.ExitCode)
}

// RobocopyDriver is the Windows transfer driver over robocopy.exe.
type RobocopyDriver struct{}

func (RobocopyDriver) Name() string { return "robocopy" }

func (RobocopyDriver) Mirror(ctx context.Context, src, dst string, dryRun bool) error {
	flags := []string{MirrorFlag}
	if dryRun {
		flags = append(flags, DryRunFlag)
	}
	_, err := Run(ctx, src, dst, flags...)
	return err
}

func (RobocopyDriver) Copy(ctx context.Context, src, dst string) error {
	_, err := Run(ctx, src, dst, CopyFlag)
	return err
}
