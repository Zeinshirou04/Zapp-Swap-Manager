package api

import (
	"bytes"
	"context"
	"crypto"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/Zeinshirou04/Zapp-Swap-Manager/core/internal/queue"
	"github.com/Zeinshirou04/Zapp-Swap-Manager/core/internal/steam"
)

const testToken = "test-token"

// prepGameLibrary writes a manifest + game folder into a library root.
func prepGameLibrary(root string, withGame bool) error {
	if err := os.MkdirAll(filepath.Join(root, "steamapps", "common"), 0o755); err != nil {
		return err
	}
	if !withGame {
		return nil
	}
	manifest := `"AppState"
{
	"appid"		"105600"
	"name"		"Terraria"
	"StateFlags"		"4"
	"installdir"		"Terraria"
	"SizeOnDisk"		"256"
	"buildid"		"42"
}
`
	if err := os.WriteFile(filepath.Join(root, "steamapps", "appmanifest_105600.acf"), []byte(manifest), 0o644); err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Join(root, "steamapps", "common", "Terraria"), 0o755); err != nil {
		return err
	}
	return os.WriteFile(filepath.Join(root, "steamapps", "common", "Terraria", "a.bin"), make([]byte, 256), 0o644)
}

func prepLibrary(t *testing.T, withGame bool) string {
	t.Helper()
	root := t.TempDir()
	if err := prepGameLibrary(root, withGame); err != nil {
		t.Fatal(err)
	}
	return root
}

// waitFor polls a condition up to 5s (async queue/API paths).
func waitFor(t *testing.T, what string, cond func() bool) {
	t.Helper()
	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		if cond() {
			return
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatalf("%s: condition not met in time", what)
}

// newTestAPI builds a Server plus its running queue and returns a fake-driver
// httptest server bound to the authenticated handler.
func newTestAPI(t *testing.T, mutate func(cfg *Config)) (*httptest.Server, *Config) {
	t.Helper()
	cfg := Config{
		Version: "test",
		Libraries: []steam.Library{
			{ID: "ssd0", Name: "SSD Cache", Path: prepLibrary(t, true), Type: steam.TypeSSDCache},
			{ID: "hdd0", Name: "HDD Master", Path: prepLibrary(t, false), Type: steam.TypeHDDMaster},
		},
		Auth: Auth{BearerToken: testToken},
	}
	q, err := queue.New(filepath.Join(t.TempDir(), "queue.db"), func(ctx context.Context, job queue.Job, step queue.StepFunc) error {
		// Fake executor: records two journaled steps then succeeds.
		return step(1, "noop", func() error { return nil })
	})
	if err != nil {
		t.Fatal(err)
	}
	cfg.Queue = q
	if mutate != nil {
		mutate(&cfg)
	}
	srv, err := New(cfg)
	if err != nil {
		t.Fatal(err)
	}
	ts := httptest.NewServer(srv.srv.Handler)
	t.Cleanup(ts.Close)
	t.Cleanup(func() { q.Close() })
	return ts, &cfg
}

func mustQueue(t *testing.T, _ []steam.Library) *queue.Queue {
	t.Helper()
	q, err := queue.New(filepath.Join(t.TempDir(), "queue.db"), func(ctx context.Context, job queue.Job, step queue.StepFunc) error {
		// Fake executor: records two journaled steps then succeeds.
		return step(1, "noop", func() error { return nil })
	})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { q.Close() })
	return q
}

func authed(req *http.Request) { req.Header.Set("Authorization", "Bearer "+testToken) }

func doJSON(t *testing.T, ts *httptest.Server, method, path string, body any, authenticate bool) (int, map[string]any) {
	t.Helper()
	var reader *bytes.Reader
	if body != nil {
		raw, _ := json.Marshal(body)
		reader = bytes.NewReader(raw)
	} else {
		reader = bytes.NewReader(nil)
	}
	req, err := http.NewRequest(method, ts.URL+path, reader)
	if err != nil {
		t.Fatal(err)
	}
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	if authenticate {
		authed(req)
	}
	res, err := ts.Client().Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	var out map[string]any
	_ = json.NewDecoder(res.Body).Decode(&out)
	return res.StatusCode, out
}

// doJSONArray is doJSON for JSON-array endpoints (GET /games, /libraries...).
func doJSONArray(t *testing.T, ts *httptest.Server, method, path string, authenticate bool) (int, []any) {
	t.Helper()
	req, err := http.NewRequest(method, ts.URL+path, nil)
	if err != nil {
		t.Fatal(err)
	}
	if authenticate {
		authed(req)
	}
	res, err := ts.Client().Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	var out []any
	_ = json.NewDecoder(res.Body).Decode(&out)
	return res.StatusCode, out
}

func TestHealth(t *testing.T) {
	ts, _ := newTestAPI(t, nil)
	code, body := doJSON(t, ts, "GET", "/health", nil, true)
	if code != http.StatusOK || body["version"] != "test" {
		t.Fatalf("health = %d %v", code, body)
	}
	// steam_running depends on this machine's Steam process; assert shape only.
	if _, ok := body["steam_running"].(bool); !ok {
		t.Errorf("steam_running not a bool: %v", body["steam_running"])
	}
	if _, ok := body["uptime_seconds"]; !ok {
		t.Error("uptime_seconds missing")
	}
}

func TestLibrariesExposeDiskMetrics(t *testing.T) {
	ts, _ := newTestAPI(t, nil)
	code, libs := doJSONArray(t, ts, "GET", "/libraries", true)
	if code != http.StatusOK || len(libs) != 2 {
		t.Fatalf("libraries = %d %v", code, libs)
	}
	first := libs[0].(map[string]any)
	for _, field := range []string{"id", "name", "type", "total_bytes", "free_bytes"} {
		if _, ok := first[field]; !ok {
			t.Errorf("library missing %q", field)
		}
	}
}

func TestGamesEndpoints(t *testing.T) {
	ts, _ := newTestAPI(t, nil)
	code, games := doJSONArray(t, ts, "GET", "/games", true)
	if code != http.StatusOK || len(games) != 1 {
		t.Fatalf("games = %d %v", code, games)
	}
	g := games[0].(map[string]any)
	if g["app_id"].(float64) != 105600 || g["name"] != "Terraria" || g["state"] != "active_ssd" || g["current_library_id"] != "ssd0" {
		t.Errorf("game = %v", g)
	}
	code, one := doJSON(t, ts, "GET", "/games/105600", nil, true)
	if code != http.StatusOK || one["install_dir"] != "Terraria" {
		t.Errorf("game detail = %d %v", code, one)
	}
	code, _ = doJSON(t, ts, "GET", "/games/9999", nil, true)
	if code != http.StatusNotFound {
		t.Errorf("missing game = %d", code)
	}
	code, filtered := doJSONArray(t, ts, "GET", "/games?state=storage_hdd", true)
	if code != http.StatusOK || len(filtered) != 0 {
		t.Errorf("state filter = %d %v", code, filtered)
	}
}

func TestBearerAuth(t *testing.T) {
	ts, _ := newTestAPI(t, nil)
	if code, _ := doJSON(t, ts, "GET", "/health", nil, false); code != http.StatusUnauthorized {
		t.Errorf("missing creds = %d, want 401", code)
	}
	req, _ := http.NewRequest("GET", ts.URL+"/health", nil)
	req.Header.Set("Authorization", "Bearer wrong")
	if res, err := ts.Client().Do(req); err != nil || res.StatusCode != http.StatusForbidden {
		t.Errorf("bad token = %v/%d, want 403", err, res.StatusCode)
	} else {
		res.Body.Close()
	}
	if code, _ := doJSON(t, ts, "GET", "/health", nil, true); code != http.StatusOK {
		t.Errorf("good token = %d", code)
	}
}

func TestNewRejectsUnconfiguredAuth(t *testing.T) {
	cfg := Config{Queue: mustQueue(t, nil), Auth: Auth{}}
	if _, err := New(cfg); err == nil {
		t.Error("expected error when no auth scheme configured")
	}
}

func mustQueueBlocked(t *testing.T, release chan struct{}) *queue.Queue {
	t.Helper()
	q, err := queue.New(filepath.Join(t.TempDir(), "queue.db"), func(ctx context.Context, job queue.Job, step queue.StepFunc) error {
		return step(1, "blocked", func() error {
			<-release
			return nil
		})
	})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { q.Close() })
	return q
}

func TestCloudflareJWT(t *testing.T) {
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatal(err)
	}
	cfgJWT := JWTConfig{TeamDomain: "team.cloudflareaccess.com", Audience: "aud1"}
	signer := func(claims map[string]any) string {
		return signRS256(t, key, "test-kid", claims)
	}
	wrongKey, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatal(err)
	}

	ts, cfg := newTestAPI(t, func(c *Config) {
		c.Auth = Auth{JWT: cfgJWT}
		c.Auth.JWT.fetchKeys = func(domain string) (map[string]*rsa.PublicKey, error) {
			if domain != cfgJWT.TeamDomain {
				t.Errorf("fetchKeys domain = %q", domain)
			}
			return map[string]*rsa.PublicKey{"test-kid": &key.PublicKey}, nil
		}
	})

	ask := func(tok string) int {
		req, _ := http.NewRequest("GET", ts.URL+"/health", nil)
		req.Header.Set("Cf-Access-Jwt-Assertion", tok)
		res, err := ts.Client().Do(req)
		if err != nil {
			t.Fatal(err)
		}
		res.Body.Close()
		return res.StatusCode
	}

	good := signer(map[string]any{"iss": "https://team.cloudflareaccess.com", "aud": []string{"aud1"}, "exp": float64(time.Now().Add(time.Hour).Unix())})
	if code := ask(good); code != http.StatusOK {
		t.Errorf("valid JWT = %d", code)
	}
	// Forged signature (unknown kid / wrong key) -> 403.
	if code := ask(signRS256(t, wrongKey, "test-kid", map[string]any{"iss": "https://team.cloudflareaccess.com", "aud": []string{"aud1"}, "exp": float64(time.Now().Add(time.Hour).Unix())})); code != http.StatusForbidden {
		t.Errorf("forged signature = %d", code)
	}
	// Wrong audience -> 403.
	badAud := signer(map[string]any{"iss": "https://team.cloudflareaccess.com", "aud": []string{"other"}, "exp": float64(time.Now().Add(time.Hour).Unix())})
	if code := ask(badAud); code != http.StatusForbidden {
		t.Errorf("wrong aud = %d", code)
	}
	// Expired -> 403.
	expired := signer(map[string]any{"iss": "https://team.cloudflareaccess.com", "aud": []string{"aud1"}, "exp": float64(time.Now().Add(-time.Hour).Unix())})
	if code := ask(expired); code != http.StatusForbidden {
		t.Errorf("expired = %d", code)
	}
	// Wrong issuer -> 403.
	badIss := signer(map[string]any{"iss": "https://evil.example.com", "aud": []string{"aud1"}, "exp": float64(time.Now().Add(time.Hour).Unix())})
	if code := ask(badIss); code != http.StatusForbidden {
		t.Errorf("wrong iss = %d", code)
	}
	_ = cfg
}

func signRS256(t *testing.T, key *rsa.PrivateKey, kid string, claims map[string]any) string {
	t.Helper()
	header := map[string]any{"alg": "RS256", "kid": kid, "typ": "JWT"}
	enc := func(v any) string {
		b, _ := json.Marshal(v)
		return base64.RawURLEncoding.EncodeToString(b)
	}
	signing := enc(header) + "." + enc(claims)
	digest := sha256.Sum256([]byte(signing))
	sig, err := rsa.SignPKCS1v15(rand.Reader, key, crypto.SHA256, digest[:])
	if err != nil {
		t.Fatal(err)
	}
	return signing + "." + base64.RawURLEncoding.EncodeToString(sig)
}

// TestBindsLoopbackOnly proves the strict binding (safety.md "API input").
func TestBindsLoopbackOnly(t *testing.T) {
	free := freePort(t)
	srv, err := New(Config{Port: free, Version: "t", Auth: Auth{BearerToken: "x"}, Queue: mustQueue(t, nil)})
	if err != nil {
		t.Fatal(err)
	}
	addr := srv.Addr()
	host, port, err := net.SplitHostPort(addr)
	if err != nil || host != "127.0.0.1" || port != fmt.Sprint(free) {
		t.Fatalf("addr = %q", addr)
	}
	ctx, cancel := context.WithCancel(context.Background())
	errCh := make(chan error, 1)
	go func() { errCh <- srv.Run(ctx) }()
	time.Sleep(100 * time.Millisecond) // listener up
	req, _ := http.NewRequest("GET", fmt.Sprintf("http://%s/health", addr), nil)
	req.Header.Set("Authorization", "Bearer x")
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("loopback request: %v", err)
	}
	res.Body.Close()
	cancel()
	select {
	case runErr := <-errCh:
		if runErr != nil {
			t.Fatalf("Run: %v", runErr)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("Run did not return after context cancel")
	}
}

func freePort(t *testing.T) int {
	t.Helper()
	l, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer l.Close()
	return l.Addr().(*net.TCPAddr).Port
}

// TestRawPathRejected is the safety invariant: no filesystem paths in job
// requests, and no unknown fields sneak past strict decoding.
func TestRawPathRejected(t *testing.T) {
	ts, _ := newTestAPI(t, nil)
	cases := []map[string]any{
		{"type": "backup", "app_id": "105600", "target_library_id": `C:\SteamLib`},
		{"type": "backup", "app_id": "105600", "target_library_id": "hdd0", "install_path": "D:/evil"},
		{"type": "backup", "app_id": "../etc", "target_library_id": "hdd0"},
		{"type": "backup", "app_id": "105600", "target_library_id": "ssh://host/lib"},
	}
	for i, body := range cases {
		code, resp := doJSON(t, ts, "POST", "/jobs", body, true)
		if code != http.StatusBadRequest {
			t.Errorf("case %d: %v -> %d %v, want 400", i, body, code, resp)
			continue
		}
		if resp["code"] != "raw_path_rejected" {
			t.Errorf("case %d: code = %v", i, resp["code"])
		}
	}
	// Valid request passes.
	code, job := doJSON(t, ts, "POST", "/jobs", map[string]any{"type": "backup", "app_id": "105600", "target_library_id": "hdd0"}, true)
	if code != http.StatusAccepted {
		t.Errorf("valid POST /jobs = %d %v", code, job)
	}
}

// TestJobLifecycle round-trips enqueue -> list -> detail -> cancel statuses
// through the API per openapi.yaml.
func TestJobLifecycle(t *testing.T) {
	ts, _ := newTestAPI(t, nil)

	code, job := doJSON(t, ts, "POST", "/jobs", map[string]any{"type": "backup", "app_id": "105600", "target_library_id": "hdd0"}, true)
	if code != http.StatusAccepted {
		t.Fatalf("POST /jobs = %d %v", code, job)
	}
	id := job["id"].(string)

	// Wait to terminal through the API, then check detail.
	waitFor(t, "job terminal", func() bool {
		_, j := doJSON(t, ts, "GET", "/jobs/"+id, nil, true)
		return j["status"] == "succeeded"
	})
	code, detail := doJSON(t, ts, "GET", "/jobs/"+id, nil, true)
	if code != http.StatusOK || detail["status"] != "succeeded" {
		t.Fatalf("GET /jobs/%s = %d %v", id, code, detail)
	}
	steps, ok := detail["steps"].([]any)
	if !ok || len(steps) == 0 {
		t.Errorf("step logs missing: %v", detail)
	}
	code, listed := doJSONArray(t, ts, "GET", "/jobs?status=succeeded", true)
	if code != http.StatusOK || len(listed) != 1 {
		t.Errorf("GET /jobs?status=succeeded = %d %v", code, listed)
	}
	// Cancelling a terminal job is a 409 conflict.
	req, _ := http.NewRequest("POST", ts.URL+"/jobs/"+id+"/cancel", nil)
	authed(req)
	if res, err := ts.Client().Do(req); err != nil || res.StatusCode != http.StatusConflict {
		t.Errorf("cancel terminal job = %v/%d, want 409", err, res.StatusCode)
	} else {
		res.Body.Close()
	}
	// Unknown job id -> 404.
	req, _ = http.NewRequest("GET", ts.URL+"/jobs/nope", nil)
	authed(req)
	if res, err := ts.Client().Do(req); err != nil || res.StatusCode != http.StatusNotFound {
		t.Errorf("unknown job = %v/%d", err, res.StatusCode)
	} else {
		res.Body.Close()
	}
}

// TestQueuedCancelThroughAPI cancels a queued job via the API.
func TestQueuedCancelThroughAPI(t *testing.T) {
	// Queue with a blocked executor so the first job stays claimed/running and
	// the cancel target stays queued.
	release := make(chan struct{})
	ts, _ := newTestAPI(t, func(c *Config) {
		c.Queue = mustQueueBlocked(t, release)
	})
	code, job := doJSON(t, ts, "POST", "/jobs", map[string]any{"type": "backup", "app_id": "105600", "target_library_id": "hdd0"}, true)
	if code != http.StatusAccepted {
		t.Fatalf("POST = %d %v", code, job)
	}
	first := job["id"].(string)
	code, second := doJSON(t, ts, "POST", "/jobs", map[string]any{"type": "evict", "app_id": "99123", "target_library_id": "hdd0"}, true)
	if code != http.StatusAccepted {
		t.Fatalf("POST second = %d %v", code, second)
	}
	secondID := second["id"].(string)
	code, resp := doJSON(t, ts, "POST", "/jobs/"+secondID+"/cancel", nil, true)
	if code != http.StatusAccepted {
		t.Fatalf("cancel queued = %d %v", code, resp)
	}
	waitFor(t, "second", func() bool {
		_, j := doJSON(t, ts, "GET", "/jobs/"+secondID, nil, true)
		return j["status"] == "cancelled"
	})
	close(release)
	waitFor(t, "first", func() bool {
		_, j := doJSON(t, ts, "GET", "/jobs/"+first, nil, true)
		return j["status"] == "succeeded"
	})
}

// --- Plan 017: GET /libraries/detected and POST /libraries ---

func TestDetectedLibrariesEndpoint(t *testing.T) {
	ts, _ := newTestAPI(t, nil)
	status, list := doJSONArray(t, ts, "GET", "/libraries/detected", true)
	if status != http.StatusOK {
		t.Fatalf("expected 200, got %d (items %d)", status, len(list))
	}
	// Detection depends on the host; only assert the item shape of what came back.
	for _, item := range list {
		d := item.(map[string]any)
		for _, field := range []string{"id", "path", "drive_type", "free_bytes", "total_bytes"} {
			if _, ok := d[field]; !ok {
				t.Fatalf("detected library missing field %q: %v", field, d)
			}
		}
	}
}

func TestRegisterLibraries(t *testing.T) {
	var captured []steam.Library
	ts, _ := newTestAPI(t, func(cfg *Config) {
		cfg.SetLibraries = func(list []steam.Library) error {
			captured = list
			return nil
		}
	})
	ssd := t.TempDir()
	hdd := t.TempDir()

	status, body := doJSON(t, ts, "POST", "/libraries", []map[string]string{
		{"type": "ssd_cache", "path": ssd},
		{"id": "hdd0", "type": "hdd_master", "path": hdd},
	}, true)
	if status != http.StatusOK {
		t.Fatalf("expected 200, got %d: %v", status, body)
	}
	if len(captured) != 2 {
		t.Fatalf("expected 2 libraries registered, got %d", len(captured))
	}
	if captured[0].ID == "" {
		t.Fatalf("expected generated id, got empty")
	}
	if captured[1].ID != "hdd0" {
		t.Fatalf("expected given id hdd0, got %q", captured[1].ID)
	}
	// Whitelist echoes hide raw paths, like GET /libraries (docs/safety.md).
	if _, hasPath := body["path"]; hasPath {
		t.Fatalf("response must not include raw paths: %v", body)
	}

	for _, tc := range []struct {
		name string
		in   any
	}{
		{"relative path", []map[string]string{{"type": "ssd_cache", "path": "relative"}}},
		{"bad type", []map[string]string{{"type": "usb_stick", "path": t.TempDir()}}},
		{"path-like id", []map[string]string{{"id": `C:\evil`, "type": "ssd_cache", "path": t.TempDir()}}},
		{"missing dir", []map[string]string{{"type": "ssd_cache", "path": filepath.Join(t.TempDir(), "nope")}}},
	} {
		status, body := doJSON(t, ts, "POST", "/libraries", tc.in, true)
		if status != http.StatusBadRequest {
			t.Fatalf("%s: expected 400, got %d: %v", tc.name, status, body)
		}
	}
	if len(captured) != 2 {
		t.Fatalf("failed candidates must not reach the whitelist, got %d", len(captured))
	}
}

func TestRegisterLibrariesNotConfigured(t *testing.T) {
	ts, _ := newTestAPI(t, nil)
	status, body := doJSON(t, ts, "POST", "/libraries", []map[string]string{{"type": "ssd_cache", "path": t.TempDir()}}, true)
	if status != http.StatusNotImplemented {
		t.Fatalf("expected 501, got %d: %v", status, body)
	}
}

func TestGamesReflectDynamicLibraries(t *testing.T) {
	var liveLibs []steam.Library
	gameLibPath := prepLibrary(t, true)

	ts, _ := newTestAPI(t, func(cfg *Config) {
		cfg.Libraries = []steam.Library{}
		cfg.LibrariesFn = func() []steam.Library { return liveLibs }
		cfg.SetLibraries = func(list []steam.Library) error {
			liveLibs = list
			return nil
		}
	})

	// Before registration: 0 games
	status, games := doJSONArray(t, ts, "GET", "/games", true)
	if status != http.StatusOK || len(games) != 0 {
		t.Fatalf("expected 0 games before registration, got %d (status %d)", len(games), status)
	}

	// Register the library with the game
	status, _ = doJSON(t, ts, "POST", "/libraries", []map[string]string{
		{"type": "ssd_cache", "path": gameLibPath},
	}, true)
	if status != http.StatusOK {
		t.Fatalf("expected 200 on library registration, got %d", status)
	}

	// After registration: 1 game detected dynamically!
	status, games = doJSONArray(t, ts, "GET", "/games", true)
	if status != http.StatusOK || len(games) != 1 {
		t.Fatalf("expected 1 game after registration, got %d (status %d)", len(games), status)
	}
	g := games[0].(map[string]any)
	if g["app_id"].(float64) != 105600 {
		t.Fatalf("expected app_id 105600, got %v", g["app_id"])
	}
}

