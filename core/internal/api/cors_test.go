package api

import (
	"net/http"
	"strings"
	"testing"
)

func TestCORSPreflight(t *testing.T) {
	ts, _ := newTestAPI(t, nil)

	req, err := http.NewRequest(http.MethodOptions, ts.URL+"/health", nil)
	if err != nil {
		t.Fatal(err)
	}
	req.Header.Set("Origin", "https://tauri.localhost")
	req.Header.Set("Access-Control-Request-Method", "GET")
	req.Header.Set("Access-Control-Request-Headers", "authorization, content-type")
	req.Header.Set("Access-Control-Request-Private-Network", "true")

	res, err := ts.Client().Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()

	if res.StatusCode != http.StatusNoContent {
		t.Fatalf("expected status 204 No Content, got %d", res.StatusCode)
	}
	if got := res.Header.Get("Access-Control-Allow-Origin"); got != "https://tauri.localhost" {
		t.Fatalf("expected allow origin https://tauri.localhost, got %q", got)
	}
	if got := res.Header.Get("Access-Control-Allow-Private-Network"); got != "true" {
		t.Fatalf("expected allow private network true, got %q", got)
	}
	if got := res.Header.Get("Access-Control-Allow-Headers"); got != "authorization, content-type" {
		t.Fatalf("expected allow headers 'authorization, content-type', got %q", got)
	}
	if got := res.Header.Get("Access-Control-Allow-Credentials"); got != "true" {
		t.Fatalf("expected allow credentials true, got %q", got)
	}
	if methods := res.Header.Get("Access-Control-Allow-Methods"); !strings.Contains(methods, "GET") {
		t.Fatalf("expected methods to contain GET, got %q", methods)
	}
}

func TestCORSOnAuthenticatedRequest(t *testing.T) {
	ts, _ := newTestAPI(t, nil)

	req, err := http.NewRequest(http.MethodGet, ts.URL+"/health", nil)
	if err != nil {
		t.Fatal(err)
	}
	req.Header.Set("Origin", "https://tauri.localhost")
	req.Header.Set("Authorization", "Bearer "+testToken)

	res, err := ts.Client().Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()

	if res.StatusCode != http.StatusOK {
		t.Fatalf("expected status 200 OK, got %d", res.StatusCode)
	}
	if got := res.Header.Get("Access-Control-Allow-Origin"); got != "https://tauri.localhost" {
		t.Fatalf("expected allow origin https://tauri.localhost, got %q", got)
	}
}

func TestCORSOnUnauthenticatedRequest(t *testing.T) {
	ts, _ := newTestAPI(t, nil)

	req, err := http.NewRequest(http.MethodGet, ts.URL+"/games", nil)
	if err != nil {
		t.Fatal(err)
	}
	req.Header.Set("Origin", "https://tauri.localhost")
	// No auth header

	res, err := ts.Client().Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()

	if res.StatusCode != http.StatusUnauthorized {
		t.Fatalf("expected status 401 Unauthorized, got %d", res.StatusCode)
	}
	if got := res.Header.Get("Access-Control-Allow-Origin"); got != "https://tauri.localhost" {
		t.Fatalf("expected allow origin on 401 response, got %q", got)
	}
}

func TestCORSWildcardWhenNoOrigin(t *testing.T) {
	ts, _ := newTestAPI(t, nil)

	req, err := http.NewRequest(http.MethodGet, ts.URL+"/health", nil)
	if err != nil {
		t.Fatal(err)
	}
	req.Header.Set("Authorization", "Bearer "+testToken)

	res, err := ts.Client().Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()

	if res.StatusCode != http.StatusOK {
		t.Fatalf("expected status 200 OK, got %d", res.StatusCode)
	}
	if got := res.Header.Get("Access-Control-Allow-Origin"); got != "*" {
		t.Fatalf("expected allow origin *, got %q", got)
	}
}
