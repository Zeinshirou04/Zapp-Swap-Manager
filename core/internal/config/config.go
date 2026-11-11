package config

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"os"
	"path/filepath"
	"runtime"
	"strings"

	"github.com/Zeinshirou04/Zapp-Swap-Manager/core/internal/steam"
)

const (
	DefaultPort = 8765
	DefaultHost = "127.0.0.1"
)

// Preferences represents user-configurable core and transfer preferences.
type Preferences struct {
	CloseSteamOnTransfer       bool   `json:"close_steam_on_transfer"`
	RelaunchSteamAfterTransfer bool   `json:"relaunch_steam_after_transfer"`
	RunOnStartup               bool   `json:"run_on_startup"`
	Theme                      string `json:"theme"`
	RelayEnabled               bool   `json:"relay_enabled"`
	RelayServerURL             string `json:"relay_server_url"`
	RelayDeviceID              string `json:"relay_device_id"`
	RelayDeviceSecret          string `json:"relay_device_secret"`
	RobocopyThreads            int    `json:"robocopy_threads"`
	RobocopyRetries            *int   `json:"robocopy_retries,omitempty"`
	RobocopyWaitSeconds        *int   `json:"robocopy_wait_seconds,omitempty"`
	RobocopyUnbuffered         bool   `json:"robocopy_unbuffered"`
}

func intPtr(v int) *int { return &v }

// Normalized returns a copy of Preferences with Robocopy defaults and safe bounds applied.
func (p Preferences) Normalized() Preferences {
	if p.RobocopyThreads <= 0 {
		p.RobocopyThreads = 8
	} else if p.RobocopyThreads > 128 {
		p.RobocopyThreads = 128
	}

	if p.RobocopyRetries == nil {
		p.RobocopyRetries = intPtr(2)
	} else {
		r := *p.RobocopyRetries
		if r < 0 {
			r = 0
		} else if r > 20 {
			r = 20
		}
		p.RobocopyRetries = intPtr(r)
	}

	if p.RobocopyWaitSeconds == nil {
		p.RobocopyWaitSeconds = intPtr(2)
	} else {
		w := *p.RobocopyWaitSeconds
		if w < 0 {
			w = 0
		} else if w > 60 {
			w = 60
		}
		p.RobocopyWaitSeconds = intPtr(w)
	}
	return p
}

// Config represents runtime settings for the Zapp Swap Manager core daemon.
type Config struct {
	BindAddr      string          `json:"bind_addr"`
	BearerToken   string          `json:"bearer_token"`
	CFTagAudience string          `json:"cf_tag_audience"`
	CFTeamDomain  string          `json:"cf_team_domain"`
	DBPath        string          `json:"db_path"`
	Headless      bool            `json:"headless"`
	Libraries     []steam.Library `json:"libraries"`
	Preferences   Preferences     `json:"preferences"`

	// ConfigPath records where this config is persisted (Plan 017: POST
	// /libraries writes the whitelist back). Empty loads use DefaultConfigPath.
	ConfigPath string `json:"-"`
}

// Default returns a Config initialized with sensible and safe defaults.
func Default() *Config {
	return &Config{
		BindAddr:    fmt.Sprintf("%s:%d", DefaultHost, DefaultPort),
		DBPath:      DefaultDBPath(),
		Headless:    false,
		Preferences: (Preferences{}).Normalized(),
	}
}

// AppDir is the per-user data directory holding the queue DB, the generated
// auth token, and the persisted config.
func AppDir() string {
	if runtime.GOOS == "windows" {
		if appData := os.Getenv("APPDATA"); appData != "" {
			return filepath.Join(appData, "Zapp-Swap-Manager")
		}
		return "config"
	}
	if dataHome := os.Getenv("XDG_DATA_HOME"); dataHome != "" {
		return filepath.Join(dataHome, "Zapp-Swap-Manager")
	}
	if home, err := os.UserHomeDir(); err == nil && home != "" {
		return filepath.Join(home, ".local", "share", "Zapp-Swap-Manager")
	}
	return "config"
}

// DefaultDBPath determines the platform-specific default path for queue.db.
func DefaultDBPath() string { return filepath.Join(AppDir(), "queue.db") }

// DefaultConfigPath is where POST /libraries persists the whitelist.
func DefaultConfigPath() string { return filepath.Join(AppDir(), "config.json") }

// AuthTokenPath is the zero-config pairing token file the local desktop app
// reads back (Plan 017/018).
func AuthTokenPath() string { return filepath.Join(AppDir(), "auth.token") }

// GenerateRandomToken generates a cryptographically secure 32-byte hex token.
func GenerateRandomToken() (string, error) {
	bytes := make([]byte, 32)
	if _, err := rand.Read(bytes); err != nil {
		return "", fmt.Errorf("crypto/rand read: %w", err)
	}
	return hex.EncodeToString(bytes), nil
}

// Load loads configuration from an optional file and overrides with environment variables.
func Load(configPath string) (*Config, error) {
	cfg := Default()

	if configPath == "" {
		configPath = DefaultConfigPath()
	}
	cfg.ConfigPath = configPath

	if data, err := os.ReadFile(configPath); os.IsNotExist(err) {
		// No file yet: defaults below. POST /libraries will write the first one.
	} else if err != nil {
		return nil, fmt.Errorf("reading config file: %w", err)
	} else if err := json.Unmarshal(data, cfg); err != nil {
		return nil, fmt.Errorf("unmarshaling config json: %w", err)
	} else {
		cfg.Preferences = cfg.Preferences.Normalized()
		if healMissingLibraryPaths(cfg.Libraries) {
			_ = cfg.Save()
		}
	}

	// Environment variable overrides
	if env := os.Getenv("ZAPP_BIND_ADDR"); env != "" {
		cfg.BindAddr = env
	}
	if env := os.Getenv("ZAPP_BEARER_TOKEN"); env != "" {
		cfg.BearerToken = env
	}
	if env := os.Getenv("ZAPP_CF_AUDIENCE"); env != "" {
		cfg.CFTagAudience = env
	}
	if env := os.Getenv("ZAPP_CF_DOMAIN"); env != "" {
		cfg.CFTeamDomain = env
	}
	if env := os.Getenv("ZAPP_DB_PATH"); env != "" {
		cfg.DBPath = env
	}
	if env := os.Getenv("ZAPP_HEADLESS"); env != "" {
		cfg.Headless = strings.ToLower(env) == "true" || env == "1"
	}

	if err := cfg.Validate(); err != nil {
		return nil, fmt.Errorf("config validation: %w", err)
	}

	// Auto-generate BearerToken if empty and neither CF nor Bearer is specified
	if cfg.BearerToken == "" && cfg.CFTagAudience == "" {
		if data, err := os.ReadFile(AuthTokenPath()); err == nil {
			if token := strings.TrimSpace(string(data)); len(token) == 64 {
				cfg.BearerToken = token
			}
		}
		if cfg.BearerToken == "" {
			token, err := GenerateRandomToken()
			if err != nil {
				return nil, fmt.Errorf("generating fallback bearer token: %w", err)
			}
			cfg.BearerToken = token
		}
		// Persist the effective local token so the desktop app can pair
		// without being told it (Plan 017).
		if err := persistAuthToken(cfg.BearerToken); err != nil {
			return nil, fmt.Errorf("persisting auth token: %w", err)
		}
	}

	return cfg, nil
}

func persistAuthToken(token string) error {
	dir := AppDir()
	if err := os.MkdirAll(dir, 0700); err != nil {
		return err
	}
	// 0600 keeps the token readable by the current user only; the declared
	// Windows ACLs follow from the user profile directory.
	return os.WriteFile(AuthTokenPath(), []byte(token+"\n"), 0600)
}

// healMissingLibraryPaths matches libraries that have empty Path against
// auto-discovered Steam libraries by stable ID. Returns true if any path was restored.
func healMissingLibraryPaths(libs []steam.Library) bool {
	needsHeal := false
	for _, l := range libs {
		if strings.TrimSpace(l.Path) == "" && l.ID != "" {
			needsHeal = true
			break
		}
	}
	if !needsHeal {
		return false
	}
	detected := steam.DetectLibraries()
	detectedByID := make(map[string]string, len(detected))
	for _, d := range detected {
		detectedByID[d.ID] = d.Path
	}
	healed := false
	for i := range libs {
		if strings.TrimSpace(libs[i].Path) == "" && libs[i].ID != "" {
			if path, ok := detectedByID[libs[i].ID]; ok && path != "" {
				libs[i].Path = path
				healed = true
			}
		}
	}
	return healed
}

// Save persists the config (including any library whitelist changes) to
// ConfigPath, defaulting to the AppDir config.json. The bearer token is
// scrubbed from the file: it lives only in auth.token / memory.
func (c *Config) Save() error {
	path := c.ConfigPath
	if path == "" {
		path = DefaultConfigPath()
	}
	if err := os.MkdirAll(filepath.Dir(path), 0700); err != nil {
		return fmt.Errorf("creating config directory: %w", err)
	}
	out := *c
	out.BearerToken = ""
	data, err := json.MarshalIndent(out, "", "  ")
	if err != nil {
		return fmt.Errorf("marshaling config json: %w", err)
	}
	if err := os.WriteFile(path, data, 0600); err != nil {
		return fmt.Errorf("writing config file: %w", err)
	}
	return nil
}

// Validate ensures safety invariants, particularly loopback-only binding.
func (c *Config) Validate() error {
	if c.BindAddr == "" {
		return errors.New("bind_addr cannot be empty")
	}

	host, _, err := net.SplitHostPort(c.BindAddr)
	if err != nil {
		// If no port specified, test as host
		host = c.BindAddr
	}

	// Check loopback invariant per docs/safety.md
	if host == "" {
		return errors.New("bind_addr must specify a host (e.g. 127.0.0.1:8765)")
	}

	if host == "localhost" {
		return nil
	}

	ip := net.ParseIP(host)
	if ip == nil {
		return fmt.Errorf("invalid host in bind_addr: %q", host)
	}

	if !ip.IsLoopback() {
		return fmt.Errorf("bind_addr must be a loopback address per safety policy, got %q", host)
	}

	return nil
}

// Port extracts the integer TCP port from BindAddr, defaulting to DefaultPort.
func (c *Config) Port() int {
	_, portStr, err := net.SplitHostPort(c.BindAddr)
	if err != nil {
		return DefaultPort
	}
	var port int
	if _, err := fmt.Sscanf(portStr, "%d", &port); err != nil || port <= 0 {
		return DefaultPort
	}
	return port
}
