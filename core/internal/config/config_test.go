package config

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/Zeinshirou04/Zapp-Swap-Manager/core/internal/steam"
)

func TestDefaultConfig(t *testing.T) {
	cfg := Default()
	if cfg.BindAddr != "127.0.0.1:8765" {
		t.Fatalf("expected 127.0.0.1:8765, got %s", cfg.BindAddr)
	}
	if err := cfg.Validate(); err != nil {
		t.Fatalf("default config failed validation: %v", err)
	}
}

func TestValidateLoopback(t *testing.T) {
	tests := []struct {
		addr    string
		wantErr bool
	}{
		{"127.0.0.1:8765", false},
		{"127.0.0.1", false},
		{"localhost:8765", false},
		{"localhost", false},
		{"0.0.0.0:8765", true},
		{"192.168.1.100:8765", true},
		{"10.0.0.1:8765", true},
		{"", true},
		{"not-an-ip:8765", true},
	}

	for _, tc := range tests {
		cfg := &Config{BindAddr: tc.addr}
		err := cfg.Validate()
		if tc.wantErr && err == nil {
			t.Errorf("addr %q expected error, got nil", tc.addr)
		} else if !tc.wantErr && err != nil {
			t.Errorf("addr %q expected no error, got %v", tc.addr, err)
		}
	}
}

func TestLoadWithEnvOverrides(t *testing.T) {
	t.Setenv("ZAPP_BIND_ADDR", "127.0.0.1:9999")
	t.Setenv("ZAPP_BEARER_TOKEN", "custom-token-xyz")
	t.Setenv("ZAPP_HEADLESS", "true")

	cfg, err := Load("")
	if err != nil {
		t.Fatalf("Load failed: %v", err)
	}

	if cfg.BindAddr != "127.0.0.1:9999" {
		t.Errorf("expected bind addr 127.0.0.1:9999, got %s", cfg.BindAddr)
	}
	if cfg.BearerToken != "custom-token-xyz" {
		t.Errorf("expected custom-token-xyz, got %s", cfg.BearerToken)
	}
	if !cfg.Headless {
		t.Errorf("expected Headless to be true")
	}
}

func TestLoadWithFile(t *testing.T) {
	tmpDir := t.TempDir()
	configFile := filepath.Join(tmpDir, "config.json")
	content := []byte(`{
		"bind_addr": "127.0.0.1:5432",
		"bearer_token": "token-from-file",
		"db_path": "custom-queue.db"
	}`)
	if err := os.WriteFile(configFile, content, 0600); err != nil {
		t.Fatal(err)
	}

	cfg, err := Load(configFile)
	if err != nil {
		t.Fatalf("Load failed: %v", err)
	}

	if cfg.BindAddr != "127.0.0.1:5432" {
		t.Errorf("expected 127.0.0.1:5432, got %s", cfg.BindAddr)
	}
	if cfg.BearerToken != "token-from-file" {
		t.Errorf("expected token-from-file, got %s", cfg.BearerToken)
	}
	if cfg.DBPath != "custom-queue.db" {
		t.Errorf("expected custom-queue.db, got %s", cfg.DBPath)
	}
}

func TestAutoGenerateBearerToken(t *testing.T) {
	cfg, err := Load("")
	if err != nil {
		t.Fatalf("Load failed: %v", err)
	}
	if cfg.BearerToken == "" {
		t.Errorf("expected auto-generated bearer token, got empty")
	}
	if len(cfg.BearerToken) != 64 { // 32 hex bytes = 64 characters
		t.Errorf("expected 64 char hex token, got %d chars", len(cfg.BearerToken))
	}
}

func TestLibraryPathPersistence(t *testing.T) {
	tmpDir := t.TempDir()
	configFile := filepath.Join(tmpDir, "config.json")

	cfg := Default()
	cfg.ConfigPath = configFile
	cfg.Libraries = []steam.Library{
		{
			ID:   "lib-test-1",
			Name: "Test Library",
			Path: filepath.Join(tmpDir, "steamapps"),
			Type: steam.TypeSSDCache,
		},
	}

	if err := cfg.Save(); err != nil {
		t.Fatalf("Save failed: %v", err)
	}

	loaded, err := Load(configFile)
	if err != nil {
		t.Fatalf("Load failed: %v", err)
	}

	if len(loaded.Libraries) != 1 {
		t.Fatalf("expected 1 library, got %d", len(loaded.Libraries))
	}
	if loaded.Libraries[0].Path != filepath.Join(tmpDir, "steamapps") {
		t.Fatalf("expected path %q, got %q", filepath.Join(tmpDir, "steamapps"), loaded.Libraries[0].Path)
	}
}

