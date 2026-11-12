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
	"mime/multipart"
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
		Version:    "test",
		ArtworkDir: t.TempDir(),
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

func TestLogsEndpoint(t *testing.T) {
	ts, _ := newTestAPI(t, func(cfg *Config) {
		cfg.LogsFn = func(limit int) []string {
			return []string{"log line 1", "log line 2"}
		}
	})

	code, body := doJSON(t, ts, "GET", "/logs?limit=50", nil, true)
	if code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %v", code, body)
	}
	lines, ok := body["lines"].([]any)
	if !ok || len(lines) != 2 {
		t.Fatalf("expected 2 lines, got %v", body["lines"])
	}
	if lines[0] != "log line 1" || lines[1] != "log line 2" {
		t.Errorf("unexpected lines: %v", lines)
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

func TestCustomGamesEndpoint(t *testing.T) {
	ts, cfg := newTestAPI(t, nil)
	// Add an unmanifested custom game to ssd0
	customDir := filepath.Join(cfg.Libraries[0].Path, "steamapps", "common", "UnmanifestedRPG")
	if err := os.MkdirAll(customDir, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(customDir, "game.bin"), make([]byte, 512), 0o644); err != nil {
		t.Fatal(err)
	}

	code, games := doJSONArray(t, ts, "GET", "/games", true)
	if code != http.StatusOK || len(games) != 2 {
		t.Fatalf("games = %d %v", code, games)
	}

	var custom map[string]any
	for _, raw := range games {
		g := raw.(map[string]any)
		if g["name"] == "UnmanifestedRPG" {
			custom = g
			break
		}
	}
	if custom == nil {
		t.Fatalf("UnmanifestedRPG not found in games: %v", games)
	}
	if custom["is_custom"] != true {
		t.Errorf("expected is_custom == true, got %v", custom["is_custom"])
	}
	if custom["state"] != "active_ssd" {
		t.Errorf("expected state == active_ssd, got %v", custom["state"])
	}

	appIDStr := steam.CustomAppID("UnmanifestedRPG")
	code, single := doJSON(t, ts, "GET", "/games/"+appIDStr, nil, true)
	if code != http.StatusOK || single["name"] != "UnmanifestedRPG" || single["is_custom"] != true {
		t.Errorf("get single custom game = %d %v", code, single)
	}

	// Enqueue an evict job for the custom game
	code, job := doJSON(t, ts, "POST", "/jobs", map[string]any{
		"type":              "evict",
		"app_id":            appIDStr,
		"target_library_id": "hdd0",
	}, true)
	if code != http.StatusAccepted || job["app_id"] != appIDStr {
		t.Errorf("enqueue custom job = %d %v", code, job)
	}
}

func TestCustomGamesNestedAndCoverEndpoint(t *testing.T) {
	ts, cfg := newTestAPI(t, nil)

	// Register nested non-Steam game
	code, created := doJSON(t, ts, "POST", "/custom-games", map[string]any{
		"library_id":   "ssd0",
		"install_dir":  "GRYPHLINK/games/EndField Game",
		"name":         "Arknights: Endfield",
		"cover_url":    "cover.png",
		"swap_enabled": true,
	}, true)
	if code != http.StatusCreated {
		t.Fatalf("createCustomGame failed: %d %v", code, created)
	}
	if created["install_dir"] != "GRYPHLINK/games/EndField Game" {
		t.Errorf("install_dir = %v, want GRYPHLINK/games/EndField Game", created["install_dir"])
	}

	appID := fmt.Sprintf("%.0f", created["app_id"])

	// Write dummy cover.png in the game folder
	gameDir := filepath.Join(cfg.Libraries[0].Path, "steamapps", "common", "GRYPHLINK", "games", "EndField Game")
	if err := os.WriteFile(filepath.Join(gameDir, "cover.png"), []byte("FAKE_PNG_DATA"), 0o644); err != nil {
		t.Fatal(err)
	}

	// Test GET /games/{app_id}/cover for local image
	client := ts.Client()
	req, _ := http.NewRequest("GET", ts.URL+"/games/"+appID+"/cover", nil)
	authed(req)
	resp, err := client.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Errorf("get local cover = %d, want 200", resp.StatusCode)
	}
	if cType := resp.Header.Get("Content-Type"); cType != "image/png" {
		t.Errorf("Content-Type = %q, want image/png", cType)
	}

	// Update to remote URL
	code, updated := doJSON(t, ts, "PUT", "/custom-games/"+appID, map[string]any{
		"cover_url": "https://example.com/banner.jpg",
	}, true)
	if code != http.StatusOK || updated["cover_url"] != "https://example.com/banner.jpg" {
		t.Fatalf("updateCustomGame failed: %d %v", code, updated)
	}

	// Test GET /games/{app_id}/cover redirects for remote URL
	noRedirectClient := &http.Client{
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			return http.ErrUseLastResponse
		},
	}
	req2, _ := http.NewRequest("GET", ts.URL+"/games/"+appID+"/cover", nil)
	authed(req2)
	resp2, err := noRedirectClient.Do(req2)
	if err != nil {
		t.Fatal(err)
	}
	defer resp2.Body.Close()
	if resp2.StatusCode != http.StatusFound {
		t.Errorf("get remote cover status = %d, want 302", resp2.StatusCode)
	}
	if loc := resp2.Header.Get("Location"); loc != "https://example.com/banner.jpg" {
		t.Errorf("redirect location = %q, want https://example.com/banner.jpg", loc)
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

	// Test query parameter token auth
	reqQueryGood, _ := http.NewRequest("GET", ts.URL+"/health?token="+testToken, nil)
	if res, err := ts.Client().Do(reqQueryGood); err != nil || res.StatusCode != http.StatusOK {
		t.Errorf("good query token = %v/%d, want 200", err, res.StatusCode)
	} else {
		res.Body.Close()
	}

	reqQueryBad, _ := http.NewRequest("GET", ts.URL+"/health?token=wrong", nil)
	if res, err := ts.Client().Do(reqQueryBad); err != nil || res.StatusCode != http.StatusForbidden {
		t.Errorf("bad query token = %v/%d, want 403", err, res.StatusCode)
	} else {
		res.Body.Close()
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

func TestPreferencesEndpoints(t *testing.T) {
	ts, _ := newTestAPI(t, nil)
	defer ts.Close()

	// 1. GET /preferences returns default
	status, _ := doJSON(t, ts, "GET", "/preferences", nil, true)
	if status != http.StatusOK {
		t.Fatalf("GET /preferences status = %d, want 200", status)
	}

	// 2. PUT /preferences updates settings including Robocopy configuration
	newPrefs := map[string]any{
		"close_steam_on_transfer":       true,
		"relaunch_steam_after_transfer": true,
		"run_on_startup":                true,
		"theme":                         "light",
		"robocopy_threads":              16,
		"robocopy_retries":              0,
		"robocopy_wait_seconds":         5,
		"robocopy_unbuffered":           true,
	}
	status, updated := doJSON(t, ts, "PUT", "/preferences", newPrefs, true)
	if status != http.StatusOK {
		t.Fatalf("PUT /preferences status = %d, want 200", status)
	}
	if updated["close_steam_on_transfer"] != true || updated["theme"] != "light" {
		t.Fatalf("unexpected updated prefs: %v", updated)
	}
	if updated["robocopy_threads"] != float64(16) || updated["robocopy_retries"] != float64(0) || updated["robocopy_wait_seconds"] != float64(5) || updated["robocopy_unbuffered"] != true {
		t.Fatalf("unexpected robocopy prefs: %v", updated)
	}
}

func TestCustomGameManifestEndpoints(t *testing.T) {
	ts, _ := newTestAPI(t, nil)
	defer ts.Close()

	// 1. POST /custom-games
	swapEnabled := true
	createReq := map[string]any{
		"name":         "Wuthering Waves",
		"library_id":   "ssd0",
		"install_dir":  "WutheringWaves",
		"cover_url":    "https://example.com/wuwa.jpg",
		"swap_enabled": swapEnabled,
		"tags":         []string{"rpg", "open-world"},
	}
	status, created := doJSON(t, ts, "POST", "/custom-games", createReq, true)
	if status != http.StatusCreated {
		t.Fatalf("POST /custom-games status = %d, want 201; body: %v", status, created)
	}
	if created["name"] != "Wuthering Waves" || created["cover_url"] != "https://example.com/wuwa.jpg" {
		t.Fatalf("unexpected created custom game: %v", created)
	}

	appID := fmt.Sprintf("%.0f", created["app_id"].(float64))

	// 2. PUT /custom-games/{app_id}
	updateReq := map[string]any{
		"name":      "Wuthering Waves (Updated)",
		"cover_url": "https://example.com/wuwa-v2.jpg",
		"tags":      []string{"rpg", "updated"},
	}
	status, updated := doJSON(t, ts, "PUT", "/custom-games/"+appID, updateReq, true)
	if status != http.StatusOK {
		t.Fatalf("PUT /custom-games/%s status = %d, want 200; body: %v", appID, status, updated)
	}
	if updated["name"] != "Wuthering Waves (Updated)" {
		t.Fatalf("expected updated name, got %v", updated["name"])
	}
}

func TestUpdateCustomGameBlockedWhileJobActive(t *testing.T) {
	release := make(chan struct{})
	defer close(release)

	ts, _ := newTestAPI(t, func(cfg *Config) {
		cfg.Queue = mustQueueBlocked(t, release)
	})

	createReq := map[string]any{
		"name":        "Wuthering Waves",
		"library_id":  "ssd0",
		"install_dir": "WutheringWaves",
	}
	status, created := doJSON(t, ts, "POST", "/custom-games", createReq, true)
	if status != http.StatusCreated {
		t.Fatalf("POST /custom-games status = %d, want 201; body: %v", status, created)
	}
	appID := fmt.Sprintf("%.0f", created["app_id"].(float64))

	// Enqueue a job for this custom game; the worker blocks on `release`.
	status, job := doJSON(t, ts, "POST", "/jobs", map[string]any{
		"type":              "evict",
		"app_id":            appID,
		"target_library_id": "hdd0",
	}, true)
	if status != http.StatusAccepted {
		t.Fatalf("POST /jobs status = %d, want 202; body: %v", status, job)
	}

	// Editing metadata while active must return 409 Conflict (job_active) so
	// zappmanifest.json is never mutated mid-transfer.
	status, conflict := doJSON(t, ts, "PUT", "/custom-games/"+appID, map[string]any{
		"tags": []string{"action"},
	}, true)
	if status != http.StatusConflict {
		t.Fatalf("PUT /custom-games/%s during active job status = %d, want 409; body: %v", appID, status, conflict)
	}
	if conflict["code"] != "job_active" {
		t.Errorf("conflict code = %v, want job_active", conflict["code"])
	}
}

func TestSeparateGridAndBannerArtworkEndpoints(t *testing.T) {
	ts, _ := newTestAPI(t, nil)

	// 1. Custom game created without banner has separate cover only.
	status, created := doJSON(t, ts, "POST", "/custom-games", map[string]any{
		"name":        "Endfield",
		"library_id":  "ssd0",
		"install_dir": "Endfield",
		"cover_url":   "https://example.com/grid.jpg",
	}, true)
	if status != http.StatusCreated {
		t.Fatalf("POST /custom-games status = %d: %v", status, created)
	}
	customID := fmt.Sprintf("%.0f", created["app_id"].(float64))
	if created["cover_url"] != "https://example.com/grid.jpg" || created["banner_url"] != nil {
		t.Fatalf("unexpected initial artwork fields: %+v", created)
	}

	// GET /games/{id}/banner should 404 when no banner configured on custom game.
	noRedirectClient := &http.Client{
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			return http.ErrUseLastResponse
		},
	}
	reqBannerMissing, _ := http.NewRequest("GET", ts.URL+"/games/"+customID+"/banner", nil)
	authed(reqBannerMissing)
	resMissing, err := noRedirectClient.Do(reqBannerMissing)
	if err != nil {
		t.Fatal(err)
	}
	resMissing.Body.Close()
	if resMissing.StatusCode != http.StatusNotFound {
		t.Fatalf("GET /games/%s/banner without banner = %d, want 404", customID, resMissing.StatusCode)
	}

	// 2. Reject raw local filesystem paths in PUT /games/{app_id}/artwork.
	status, rawErr := doJSON(t, ts, "PUT", "/games/105600/artwork", map[string]any{
		"banner_url": `C:\Users\alice\banner.png`,
	}, true)
	if status != http.StatusBadRequest || rawErr["code"] != "raw_path_rejected" {
		t.Fatalf("expected 400 raw_path_rejected, got %d %v", status, rawErr)
	}

	// 3. Set Steam game's banner URL independently without altering grid cover.
	status, updatedSteam := doJSON(t, ts, "PUT", "/games/105600/artwork", map[string]any{
		"banner_url": "https://example.com/terraria-hero.jpg",
	}, true)
	if status != http.StatusOK {
		t.Fatalf("PUT /games/105600/artwork status = %d: %v", status, updatedSteam)
	}
	if updatedSteam["banner_url"] != "https://example.com/terraria-hero.jpg" {
		t.Errorf("banner_url = %v, want terraria-hero.jpg", updatedSteam["banner_url"])
	}
	if updatedSteam["cover_url"] != nil {
		t.Errorf("cover_url should remain untouched (nil), got %v", updatedSteam["cover_url"])
	}

	// Verify /banner redirects to the custom banner URL while /cover falls back to Steam header.
	reqB, _ := http.NewRequest("GET", ts.URL+"/games/105600/banner", nil)
	authed(reqB)
	resB, err := noRedirectClient.Do(reqB)
	if err != nil {
		t.Fatal(err)
	}
	resB.Body.Close()
	if resB.StatusCode != http.StatusFound || resB.Header.Get("Location") != "https://example.com/terraria-hero.jpg" {
		t.Fatalf("GET /games/105600/banner = %d Location=%q", resB.StatusCode, resB.Header.Get("Location"))
	}

	// 4. Upload binary PNG to banner slot via POST /games/{app_id}/artwork.
	// Minimal valid 1x1 transparent PNG bytes.
	tinyPNG := []byte{
		0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,
		0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,
		0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
		0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0x15, 0xC4, 0x89,
		0x00, 0x00, 0x00, 0x0A, 0x49, 0x44, 0x41, 0x54,
		0x78, 0x9C, 0x63, 0x00, 0x01, 0x00, 0x00, 0x05, 0x00, 0x01,
		0x0D, 0x0A, 0x2D, 0xB4, 0x00, 0x00, 0x00, 0x00,
		0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82,
	}

	var mpBody bytes.Buffer
	mw := multipart.NewWriter(&mpBody)
	_ = mw.WriteField("kind", "banner")
	fw, _ := mw.CreateFormFile("file", "banner.png")
	_, _ = fw.Write(tinyPNG)
	mw.Close()

	upReq, _ := http.NewRequest("POST", ts.URL+"/games/"+customID+"/artwork", &mpBody)
	upReq.Header.Set("Content-Type", mw.FormDataContentType())
	authed(upReq)
	upRes, err := ts.Client().Do(upReq)
	if err != nil {
		t.Fatal(err)
	}
	var upGame map[string]any
	_ = json.NewDecoder(upRes.Body).Decode(&upGame)
	upRes.Body.Close()
	if upRes.StatusCode != http.StatusOK {
		t.Fatalf("POST /games/%s/artwork = %d: %v", customID, upRes.StatusCode, upGame)
	}
	if upGame["cover_url"] != "https://example.com/grid.jpg" {
		t.Errorf("uploading banner overwrote cover_url: %v", upGame["cover_url"])
	}
	if bannerRef, _ := upGame["banner_url"].(string); bannerRef == "" {
		t.Fatalf("expected cached banner_url reference, got %v", upGame["banner_url"])
	}

	// Fetch served banner bytes and verify PNG MIME + bytes.
	getBanner, _ := http.NewRequest("GET", ts.URL+"/games/"+customID+"/banner", nil)
	authed(getBanner)
	gotBannerRes, err := ts.Client().Do(getBanner)
	if err != nil {
		t.Fatal(err)
	}
	gotBannerRes.Body.Close()
	if gotBannerRes.StatusCode != http.StatusOK || gotBannerRes.Header.Get("Content-Type") != "image/png" {
		t.Fatalf("GET uploaded banner = %d Content-Type=%q", gotBannerRes.StatusCode, gotBannerRes.Header.Get("Content-Type"))
	}

	// 5. Clear custom banner back to empty/default via PUT /games/{app_id}/artwork.
	status, cleared := doJSON(t, ts, "PUT", "/games/"+customID+"/artwork", map[string]any{
		"banner_url": "",
	}, true)
	if status != http.StatusOK {
		t.Fatalf("clear banner status = %d: %v", status, cleared)
	}
	if cleared["banner_url"] != nil && cleared["banner_url"] != "" {
		t.Errorf("expected cleared banner_url, got %v", cleared["banner_url"])
	}
}

