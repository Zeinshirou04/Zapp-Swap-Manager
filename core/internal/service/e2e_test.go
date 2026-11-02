package service

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"sync"
	"testing"
	"time"

	"github.com/Zeinshirou04/Zapp-Swap-Manager/core/internal/config"
	"github.com/Zeinshirou04/Zapp-Swap-Manager/core/internal/queue"
	"github.com/Zeinshirou04/Zapp-Swap-Manager/core/internal/steam"
)

// checkTransferTool ensures the platform transfer utility is available.
func checkTransferTool(t *testing.T) {
	t.Helper()
	if runtime.GOOS == "windows" {
		if _, err := exec.LookPath("robocopy"); err != nil {
			t.Skip("robocopy not found in PATH")
		}
	} else {
		if _, err := exec.LookPath("rsync"); err != nil {
			t.Skip("rsync not found in PATH")
		}
	}
}

// createMockGame creates game payload files and an appmanifest ACF in the specified library root.
func createMockGame(t *testing.T, libRoot, appID, name, installDir string, files map[string]int) {
	t.Helper()

	steamapps := filepath.Join(libRoot, "steamapps")
	commonDir := filepath.Join(steamapps, "common", installDir)
	if err := os.MkdirAll(commonDir, 0755); err != nil {
		t.Fatalf("failed to create common dir: %v", err)
	}

	var totalSize int64
	for relPath, size := range files {
		fullPath := filepath.Join(commonDir, relPath)
		if err := os.MkdirAll(filepath.Dir(fullPath), 0755); err != nil {
			t.Fatalf("failed to create sub dir: %v", err)
		}
		data := make([]byte, size)
		for i := range data {
			data[i] = byte((i + int(size)) % 256)
		}
		if err := os.WriteFile(fullPath, data, 0644); err != nil {
			t.Fatalf("failed to write test file %s: %v", fullPath, err)
		}
		totalSize += int64(size)
	}

	manifestContent := fmt.Sprintf(`"AppState"
{
	"appid"		"%s"
	"Universe"		"1"
	"name"		"%s"
	"StateFlags"		"4"
	"installdir"		"%s"
	"LastUpdated"		"1600000000"
	"SizeOnDisk"		"%d"
	"buildid"		"888888"
}
`, appID, name, installDir, totalSize)

	manifestPath := filepath.Join(steamapps, fmt.Sprintf("appmanifest_%s.acf", appID))
	if err := os.WriteFile(manifestPath, []byte(manifestContent), 0644); err != nil {
		t.Fatalf("failed to write manifest: %v", err)
	}
}

type e2eHarness struct {
	svc        *Service
	port       int
	baseURL    string
	token      string
	ssdRoot    string
	hddRoot    string
	httpClient *http.Client
}

func startE2EHarness(t *testing.T) *e2eHarness {
	t.Helper()
	checkTransferTool(t)

	tmpDir := t.TempDir()
	ssdRoot := filepath.Join(tmpDir, "ssd")
	hddRoot := filepath.Join(tmpDir, "hdd")

	// Ensure library directory trees exist
	for _, dir := range []string{
		filepath.Join(ssdRoot, "steamapps", "common"),
		filepath.Join(hddRoot, "steamapps", "common"),
	} {
		if err := os.MkdirAll(dir, 0755); err != nil {
			t.Fatalf("failed to create library dir %s: %v", dir, err)
		}
	}

	port := freePort(t)
	token := "e2e-secret-bearer-token"
	dbPath := filepath.Join(tmpDir, "e2e-queue.db")

	cfg := &config.Config{
		BindAddr:    fmt.Sprintf("127.0.0.1:%d", port),
		BearerToken: token,
		DBPath:      dbPath,
		Headless:    true,
		Libraries: []steam.Library{
			{ID: "ssd", Name: "SSD Library", Path: ssdRoot, Type: steam.TypeSSDCache},
			{ID: "hdd", Name: "HDD Library", Path: hddRoot, Type: steam.TypeHDDMaster},
		},
	}

	svc, err := New(cfg, "v1.0.0-e2e")
	if err != nil {
		t.Fatalf("New service failed: %v", err)
	}

	ctx, cancel := context.WithCancel(context.Background())
	if err := svc.Start(ctx); err != nil {
		cancel()
		t.Fatalf("Service start failed: %v", err)
	}

	baseURL := fmt.Sprintf("http://127.0.0.1:%d", port)
	client := &http.Client{Timeout: 5 * time.Second}

	h := &e2eHarness{
		svc:        svc,
		port:       port,
		baseURL:    baseURL,
		token:      token,
		ssdRoot:    ssdRoot,
		hddRoot:    hddRoot,
		httpClient: client,
	}
	h.waitForReady(t)

	t.Cleanup(func() {
		_ = svc.Stop()
		cancel()
	})

	return h
}

func (h *e2eHarness) waitForReady(t *testing.T) {
	t.Helper()
	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		req, err := http.NewRequest(http.MethodGet, h.baseURL+"/health", nil)
		if err == nil {
			req.Header.Set("Authorization", "Bearer "+h.token)
			resp, err := h.httpClient.Do(req)
			if err == nil {
				_ = resp.Body.Close()
				if resp.StatusCode == http.StatusOK {
					return
				}
			}
		}
		time.Sleep(25 * time.Millisecond)
	}
	t.Fatal("e2e server failed to start and respond to health check")
}

func (h *e2eHarness) post(t *testing.T, path string, body any, token string) (*http.Response, []byte) {
	t.Helper()
	var payload io.Reader
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			t.Fatalf("failed to marshal json: %v", err)
		}
		payload = bytes.NewReader(b)
	}
	req, err := http.NewRequest(http.MethodPost, h.baseURL+path, payload)
	if err != nil {
		t.Fatalf("failed to create request: %v", err)
	}
	req.Header.Set("Content-Type", "application/json")
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	resp, err := h.httpClient.Do(req)
	if err != nil {
		t.Fatalf("POST %s failed: %v", path, err)
	}
	defer resp.Body.Close()
	data, _ := io.ReadAll(resp.Body)
	return resp, data
}

func (h *e2eHarness) get(t *testing.T, path string, token string) (*http.Response, []byte) {
	t.Helper()
	req, err := http.NewRequest(http.MethodGet, h.baseURL+path, nil)
	if err != nil {
		t.Fatalf("failed to create request: %v", err)
	}
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	resp, err := h.httpClient.Do(req)
	if err != nil {
		t.Fatalf("GET %s failed: %v", path, err)
	}
	defer resp.Body.Close()
	data, _ := io.ReadAll(resp.Body)
	return resp, data
}

func (h *e2eHarness) waitForJob(t *testing.T, jobID string, timeout time.Duration) queue.Job {
	t.Helper()
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		resp, body := h.get(t, "/jobs/"+jobID, h.token)
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("unexpected status %d fetching job: %s", resp.StatusCode, string(body))
		}
		var job queue.Job
		if err := json.Unmarshal(body, &job); err != nil {
			t.Fatalf("failed to decode job: %v", err)
		}
		if job.Status == queue.StatusSucceeded || job.Status == queue.StatusFailed || job.Status == queue.StatusCancelled {
			return job
		}
		time.Sleep(50 * time.Millisecond)
	}
	t.Fatalf("timed out after %v waiting for job %s to finish", timeout, jobID)
	return queue.Job{}
}

// TestE2E_FullEvictAndPromoteCycle verifies the complete round-trip flow:
// 1. Game starts on SSD.
// 2. Client requests Evict -> Game is mirrored to HDD, manifest moved, SSD copy deleted.
// 3. Client requests Promote -> Game is copied to SSD, manifest moved, HDD master copy kept intact.
func TestE2E_FullEvictAndPromoteCycle(t *testing.T) {
	h := startE2EHarness(t)

	appID := "42000"
	gameDir := "DeepSpaceOdyssey"
	files := map[string]int{
		"game.exe":          512,
		"data/textures.pak": 1024,
		"data/world.dat":    2048,
	}

	createMockGame(t, h.ssdRoot, appID, "Deep Space Odyssey", gameDir, files)

	// Step 1: Verify game is recognized on SSD
	resp, body := h.get(t, "/games/"+appID, h.token)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200 from GET /games/%s, got %d: %s", appID, resp.StatusCode, string(body))
	}

	var gameInfo struct {
		AppID            int64  `json:"app_id"`
		Name             string `json:"name"`
		CurrentLibraryID string `json:"current_library_id"`
	}
	if err := json.Unmarshal(body, &gameInfo); err != nil {
		t.Fatalf("failed to decode game info: %v", err)
	}
	if gameInfo.CurrentLibraryID != "ssd" {
		t.Fatalf("expected game on library 'ssd', got '%s'", gameInfo.CurrentLibraryID)
	}

	// Step 2: Enqueue Evict (SSD -> HDD)
	evictReq := queue.CreateJobRequest{
		Type:            queue.TypeEvict,
		AppID:           appID,
		TargetLibraryID: "hdd",
	}
	resp, body = h.post(t, "/jobs", evictReq, h.token)
	if resp.StatusCode != http.StatusAccepted {
		t.Fatalf("expected 202 from POST /jobs (evict), got %d: %s", resp.StatusCode, string(body))
	}
	var evictJob queue.Job
	if err := json.Unmarshal(body, &evictJob); err != nil {
		t.Fatalf("failed to decode evict job: %v", err)
	}

	// Wait for Evict completion
	finishedEvict := h.waitForJob(t, evictJob.ID, 10*time.Second)
	if finishedEvict.Status != queue.StatusSucceeded {
		errMsg := "no error details"
		if finishedEvict.Error != nil {
			errMsg = *finishedEvict.Error
		}
		t.Fatalf("evict job failed with status %s: %s", finishedEvict.Status, errMsg)
	}

	// Verify Evict postconditions per docs/safety.md:
	// - SSD game files deleted
	// - SSD manifest moved
	// - HDD has all files and matching sizes
	// - HDD has manifest
	ssdGamePath := filepath.Join(h.ssdRoot, "steamapps", "common", gameDir)
	if st, err := os.Stat(ssdGamePath); !os.IsNotExist(err) && st != nil {
		t.Fatalf("SSD game directory should be deleted after evict, but stat returned: %v", err)
	}
	ssdManifest := filepath.Join(h.ssdRoot, "steamapps", fmt.Sprintf("appmanifest_%s.acf", appID))
	if _, err := os.Stat(ssdManifest); !os.IsNotExist(err) {
		t.Fatal("SSD manifest must not exist after evict")
	}

	hddGamePath := filepath.Join(h.hddRoot, "steamapps", "common", gameDir)
	for relPath, expectedSize := range files {
		fullPath := filepath.Join(hddGamePath, relPath)
		st, err := os.Stat(fullPath)
		if err != nil {
			t.Fatalf("expected file %s to exist on HDD: %v", relPath, err)
		}
		if st.Size() != int64(expectedSize) {
			t.Fatalf("file %s size mismatch on HDD: expected %d, got %d", relPath, expectedSize, st.Size())
		}
	}
	hddManifest := filepath.Join(h.hddRoot, "steamapps", fmt.Sprintf("appmanifest_%s.acf", appID))
	if _, err := os.Stat(hddManifest); err != nil {
		t.Fatalf("HDD manifest must exist after evict: %v", err)
	}

	// Verify API now reports game located in 'hdd'
	resp, body = h.get(t, "/games/"+appID, h.token)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("GET /games/%s after evict returned %d: %s", appID, resp.StatusCode, string(body))
	}
	_ = json.Unmarshal(body, &gameInfo)
	if gameInfo.CurrentLibraryID != "hdd" {
		t.Fatalf("expected game current_library_id to be 'hdd', got '%s'", gameInfo.CurrentLibraryID)
	}

	// Step 3: Enqueue Promote (HDD -> SSD)
	promoteReq := queue.CreateJobRequest{
		Type:            queue.TypePromote,
		AppID:           appID,
		TargetLibraryID: "ssd",
	}
	resp, body = h.post(t, "/jobs", promoteReq, h.token)
	if resp.StatusCode != http.StatusAccepted {
		t.Fatalf("expected 202 from POST /jobs (promote), got %d: %s", resp.StatusCode, string(body))
	}
	var promoteJob queue.Job
	if err := json.Unmarshal(body, &promoteJob); err != nil {
		t.Fatalf("failed to decode promote job: %v", err)
	}

	// Wait for Promote completion
	finishedPromote := h.waitForJob(t, promoteJob.ID, 10*time.Second)
	if finishedPromote.Status != queue.StatusSucceeded {
		errMsg := "no error details"
		if finishedPromote.Error != nil {
			errMsg = *finishedPromote.Error
		}
		t.Fatalf("promote job failed with status %s: %s", finishedPromote.Status, errMsg)
	}

	// Verify Promote postconditions per docs/safety.md:
	// - SSD copy restored with matching files and sizes
	// - SSD manifest restored
	// - HDD manifest removed (manifest in exactly one library at a time)
	// - HDD game files PRESERVED (master copy is never deleted!)
	for relPath, expectedSize := range files {
		fullPath := filepath.Join(ssdGamePath, relPath)
		st, err := os.Stat(fullPath)
		if err != nil {
			t.Fatalf("expected file %s to exist on SSD after promote: %v", relPath, err)
		}
		if st.Size() != int64(expectedSize) {
			t.Fatalf("file %s size mismatch on SSD: expected %d, got %d", relPath, expectedSize, st.Size())
		}
	}
	if _, err := os.Stat(ssdManifest); err != nil {
		t.Fatalf("SSD manifest must exist after promote: %v", err)
	}
	if _, err := os.Stat(hddManifest); !os.IsNotExist(err) {
		t.Fatal("HDD manifest must be gone after promote (only one manifest per game)")
	}

	// Critical Safety Rule check: HDD copy must remain completely intact as master backup
	for relPath, expectedSize := range files {
		fullPath := filepath.Join(hddGamePath, relPath)
		st, err := os.Stat(fullPath)
		if err != nil {
			t.Fatalf("HDD master copy file %s must still exist: %v", relPath, err)
		}
		if st.Size() != int64(expectedSize) {
			t.Fatalf("HDD master copy size altered: expected %d, got %d", expectedSize, st.Size())
		}
	}

	// Verify API reports game located back in 'ssd'
	resp, body = h.get(t, "/games/"+appID, h.token)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("GET /games/%s after promote returned %d: %s", appID, resp.StatusCode, string(body))
	}
	_ = json.Unmarshal(body, &gameInfo)
	if gameInfo.CurrentLibraryID != "ssd" {
		t.Fatalf("expected game current_library_id to be 'ssd', got '%s'", gameInfo.CurrentLibraryID)
	}
}

// TestE2E_SafetyGuards verifies API validation, authentication enforcement,
// raw path rejection, and graceful error handling on invalid requests.
func TestE2E_SafetyGuards(t *testing.T) {
	h := startE2EHarness(t)

	// Guard 1: Authentication failure
	resp, _ := h.get(t, "/games", "")
	if resp.StatusCode != http.StatusUnauthorized {
		t.Fatalf("expected 401 without auth, got %d", resp.StatusCode)
	}
	resp, _ = h.get(t, "/games", "wrong-token")
	if resp.StatusCode != http.StatusForbidden {
		t.Fatalf("expected 403 with bad auth, got %d", resp.StatusCode)
	}

	// Guard 2: Reject raw filesystem paths in TargetLibraryID
	badPathReq := map[string]string{
		"type":              "evict",
		"app_id":            "123",
		"target_library_id": "D:\\SteamLibrary\\steamapps",
	}
	resp, body := h.post(t, "/jobs", badPathReq, h.token)
	if resp.StatusCode != http.StatusBadRequest {
		t.Fatalf("expected 400 rejecting raw path, got %d: %s", resp.StatusCode, string(body))
	}

	// Guard 3: Reject path traversals in AppID
	traversalReq := map[string]string{
		"type":              "evict",
		"app_id":            "../../etc/passwd",
		"target_library_id": "hdd",
	}
	resp, body = h.post(t, "/jobs", traversalReq, h.token)
	if resp.StatusCode != http.StatusBadRequest {
		t.Fatalf("expected 400 rejecting path traversal app_id, got %d: %s", resp.StatusCode, string(body))
	}

	// Guard 4: Non-whitelisted target library ID
	nonWhitelistReq := queue.CreateJobRequest{
		Type:            queue.TypeEvict,
		AppID:           "123",
		TargetLibraryID: "external_drive_z",
	}
	resp, body = h.post(t, "/jobs", nonWhitelistReq, h.token)
	// Queue rejects unwhitelisted target library
	if resp.StatusCode != http.StatusBadRequest && resp.StatusCode != http.StatusAccepted {
		t.Fatalf("unexpected status %d for unwhitelisted library: %s", resp.StatusCode, string(body))
	}
	if resp.StatusCode == http.StatusAccepted {
		var job queue.Job
		_ = json.Unmarshal(body, &job)
		finished := h.waitForJob(t, job.ID, 5*time.Second)
		if finished.Status != queue.StatusFailed {
			t.Fatalf("expected job to fail due to unwhitelisted target library, got %s", finished.Status)
		}
	}

	// Guard 5: Non-existent app ID fails safely without corrupting any directory
	nonExistentReq := queue.CreateJobRequest{
		Type:            queue.TypeEvict,
		AppID:           "99999999",
		TargetLibraryID: "hdd",
	}
	resp, body = h.post(t, "/jobs", nonExistentReq, h.token)
	if resp.StatusCode != http.StatusAccepted {
		t.Fatalf("expected 202 queuing job for non-existent game, got %d: %s", resp.StatusCode, string(body))
	}
	var job queue.Job
	_ = json.Unmarshal(body, &job)
	finished := h.waitForJob(t, job.ID, 5*time.Second)
	if finished.Status != queue.StatusFailed {
		t.Fatalf("expected job to fail because manifest does not exist, got %s", finished.Status)
	}
}

// TestE2E_ConflictGuard verifies that concurrent jobs targeting the same
// App ID are rejected with HTTP 409 Conflict per docs/safety.md ("Queue: Never
// run two jobs on the same game at once").
func TestE2E_ConflictGuard(t *testing.T) {
	checkTransferTool(t)

	tmpDir := t.TempDir()
	port := freePort(t)
	token := "conflict-guard-token"
	dbPath := filepath.Join(tmpDir, "conflict-queue.db")

	blockCh := make(chan struct{})
	doneCh := make(chan struct{})

	var once sync.Once
	blockingExecutor := func(ctx context.Context, job queue.Job, step queue.StepFunc) error {
		return step(1, "blocking-step", func() error {
			once.Do(func() {
				close(doneCh) // Signal that first job has claimed running status
			})
			<-blockCh // Wait until unblocked (or return immediately if already closed)
			return nil
		})
	}

	cfg := &config.Config{
		BindAddr:    fmt.Sprintf("127.0.0.1:%d", port),
		BearerToken: token,
		DBPath:      dbPath,
		Headless:    true,
		Libraries: []steam.Library{
			{ID: "ssd", Name: "SSD Library", Path: filepath.Join(tmpDir, "ssd"), Type: steam.TypeSSDCache},
			{ID: "hdd", Name: "HDD Library", Path: filepath.Join(tmpDir, "hdd"), Type: steam.TypeHDDMaster},
		},
	}

	svc, err := NewWithExecutor(cfg, "v1.0.0-e2e", blockingExecutor)
	if err != nil {
		t.Fatalf("NewWithExecutor failed: %v", err)
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	if err := svc.Start(ctx); err != nil {
		t.Fatalf("Service start failed: %v", err)
	}
	defer func() {
		select {
		case <-blockCh:
		default:
			close(blockCh)
		}
		_ = svc.Stop()
	}()

	client := &http.Client{Timeout: 5 * time.Second}
	h := &e2eHarness{
		svc:        svc,
		port:       port,
		baseURL:    fmt.Sprintf("http://127.0.0.1:%d", port),
		token:      token,
		httpClient: client,
	}
	h.waitForReady(t)

	// 1. Enqueue first job for App ID 77777
	req := queue.CreateJobRequest{
		Type:            queue.TypeEvict,
		AppID:           "77777",
		TargetLibraryID: "hdd",
	}
	resp, body := h.post(t, "/jobs", req, token)
	if resp.StatusCode != http.StatusAccepted {
		t.Fatalf("expected 202 on initial job enqueue, got %d: %s", resp.StatusCode, string(body))
	}

	// Wait until worker picks up the job and reaches blocking step
	select {
	case <-doneCh:
	case <-time.After(5 * time.Second):
		t.Fatal("timed out waiting for worker to begin job")
	}

	// 2. Attempt to enqueue a second job for the SAME App ID 77777 while first is running
	resp2, body2 := h.post(t, "/jobs", req, token)
	if resp2.StatusCode != http.StatusConflict {
		t.Fatalf("expected 409 Conflict for concurrent same-game job, got %d: %s", resp2.StatusCode, string(body2))
	}

	// 3. Unblock the first job and let it finish
	close(blockCh)
	var firstJob queue.Job
	_ = json.Unmarshal(body, &firstJob)
	finished := h.waitForJob(t, firstJob.ID, 5*time.Second)
	if finished.Status != queue.StatusSucceeded {
		t.Fatalf("expected first job to succeed, got %s", finished.Status)
	}

	// 4. Now that the first job is done, enqueuing for App ID 77777 succeeds again
	resp3, body3 := h.post(t, "/jobs", req, token)
	if resp3.StatusCode != http.StatusAccepted {
		t.Fatalf("expected 202 after previous job completed, got %d: %s", resp3.StatusCode, string(body3))
	}
}

