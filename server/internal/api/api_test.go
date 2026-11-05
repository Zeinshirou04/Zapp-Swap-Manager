package api_test

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"

	"github.com/Zeinshirou04/Zapp-Swap-Manager/server/internal/api"
	"github.com/Zeinshirou04/Zapp-Swap-Manager/server/internal/auth"
	"github.com/Zeinshirou04/Zapp-Swap-Manager/server/internal/db"
	"github.com/Zeinshirou04/Zapp-Swap-Manager/server/internal/relay"
)

func setupTestServer(t *testing.T) (*httptest.Server, *db.Store) {
	tempDir := t.TempDir()
	dbPath := filepath.Join(tempDir, "api_test.db")

	store, err := db.Open(dbPath)
	if err != nil {
		t.Fatalf("failed to open test db: %v", err)
	}

	authService := auth.NewService("test-secret-key-123")
	hub := relay.NewHub(nil)
	server := api.NewServer(store, authService, hub)

	ts := httptest.NewServer(server.Handler())
	return ts, store
}

func TestAPI_Health(t *testing.T) {
	ts, store := setupTestServer(t)
	defer ts.Close()
	defer store.Close()

	resp, err := http.Get(ts.URL + "/health")
	if err != nil {
		t.Fatalf("health get failed: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Errorf("expected 200, got %d", resp.StatusCode)
	}
}

func TestAPI_AuthAndDevices(t *testing.T) {
	ts, store := setupTestServer(t)
	defer ts.Close()
	defer store.Close()

	// 1. Register
	regPayload := map[string]string{
		"email":        "test@gamer.com",
		"password":     "securepass123",
		"display_name": "ProGamer",
	}
	data, _ := json.Marshal(regPayload)

	resp, err := http.Post(ts.URL+"/api/auth/register", "application/json", bytes.NewReader(data))
	if err != nil {
		t.Fatalf("register request failed: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusCreated {
		t.Fatalf("expected 201 Created, got %d", resp.StatusCode)
	}

	var authResp api.AuthResponse
	if err := json.NewDecoder(resp.Body).Decode(&authResp); err != nil {
		t.Fatalf("decode auth response error: %v", err)
	}
	if authResp.Token == "" {
		t.Fatalf("expected non-empty auth token")
	}

	// 2. Login
	loginPayload := map[string]string{
		"email":    "test@gamer.com",
		"password": "securepass123",
	}
	loginData, _ := json.Marshal(loginPayload)

	lResp, err := http.Post(ts.URL+"/api/auth/login", "application/json", bytes.NewReader(loginData))
	if err != nil {
		t.Fatalf("login request failed: %v", err)
	}
	defer lResp.Body.Close()

	if lResp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200 OK on login, got %d", lResp.StatusCode)
	}

	// 3. Register Device
	devPayload := map[string]string{
		"name": "Desktop Beast",
	}
	devData, _ := json.Marshal(devPayload)

	req, _ := http.NewRequest(http.MethodPost, ts.URL+"/api/devices", bytes.NewReader(devData))
	req.Header.Set("Authorization", "Bearer "+authResp.Token)
	req.Header.Set("Content-Type", "application/json")

	devResp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("create device request error: %v", err)
	}
	defer devResp.Body.Close()

	if devResp.StatusCode != http.StatusCreated {
		t.Fatalf("expected 201 Created on device registration, got %d", devResp.StatusCode)
	}

	var createDevResp api.CreateDeviceResponse
	if err := json.NewDecoder(devResp.Body).Decode(&createDevResp); err != nil {
		t.Fatalf("failed to decode device response: %v", err)
	}
	if createDevResp.DeviceSecret == "" {
		t.Fatalf("expected non-empty device secret")
	}

	// 4. List Devices
	listReq, _ := http.NewRequest(http.MethodGet, ts.URL+"/api/devices", nil)
	listReq.Header.Set("Authorization", "Bearer "+authResp.Token)

	listResp, err := http.DefaultClient.Do(listReq)
	if err != nil {
		t.Fatalf("list devices error: %v", err)
	}
	defer listResp.Body.Close()

	if listResp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200 OK on list devices, got %d", listResp.StatusCode)
	}

	var devList struct {
		Devices []db.Device `json:"devices"`
	}
	if err := json.NewDecoder(listResp.Body).Decode(&devList); err != nil {
		t.Fatalf("failed to decode device list: %v", err)
	}
	if len(devList.Devices) != 1 {
		t.Fatalf("expected 1 device in list, got %d", len(devList.Devices))
	}
	if devList.Devices[0].Name != "Desktop Beast" {
		t.Errorf("expected device name 'Desktop Beast', got %s", devList.Devices[0].Name)
	}
}
