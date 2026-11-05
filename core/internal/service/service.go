package service

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"sync"
	"time"

	"github.com/Zeinshirou04/Zapp-Swap-Manager/core/internal/api"
	"github.com/Zeinshirou04/Zapp-Swap-Manager/core/internal/config"
	"github.com/Zeinshirou04/Zapp-Swap-Manager/core/internal/logger"
	"github.com/Zeinshirou04/Zapp-Swap-Manager/core/internal/queue"
	"github.com/Zeinshirou04/Zapp-Swap-Manager/core/internal/relay"
	"github.com/Zeinshirou04/Zapp-Swap-Manager/core/internal/steam"
	"github.com/Zeinshirou04/Zapp-Swap-Manager/core/internal/transfer"
)

// Service coordinates all core background components: SQLite queue worker,
// HTTP API server, Steam library scans, and safe lifecycle management.
type Service struct {
	cfg         *config.Config
	version     string
	queue       *queue.Queue
	server      *api.Server
	relayClient *relay.Client

	mu      sync.Mutex
	libs    *libRegistry
	cancel  context.CancelFunc
	wg      sync.WaitGroup
	running bool
}

// libRegistry owns the runtime whitelist under a lock: the transfer executor
// and HTTP handlers read through it, POST /libraries replaces it.
type libRegistry struct {
	mu   sync.RWMutex
	list []steam.Library
}

func (r *libRegistry) Get() []steam.Library {
	r.mu.RLock()
	defer r.mu.RUnlock()
	out := make([]steam.Library, len(r.list))
	copy(out, r.list)
	return out
}

// New creates and initializes a Service with default transfer executor.
func New(cfg *config.Config, version string) (*Service, error) {
	return NewWithExecutor(cfg, version, nil)
}

// NewWithExecutor allows injecting a custom queue.Executor (useful for testing);
// nil selects the default executor.
func NewWithExecutor(cfg *config.Config, version string, executor queue.Executor) (*Service, error) {
	if cfg == nil {
		return nil, errors.New("service: nil config provided")
	}

	if dir := filepath.Dir(cfg.DBPath); dir != "" && dir != "." {
		if err := os.MkdirAll(dir, 0755); err != nil {
			return nil, fmt.Errorf("creating db directory: %w", err)
		}
	}

	prefLock := sync.RWMutex{}
	getPrefs := func() config.Preferences {
		prefLock.RLock()
		defer prefLock.RUnlock()
		return cfg.Preferences
	}
	setPrefs := func(p config.Preferences) error {
		prefLock.Lock()
		cfg.Preferences = p
		prefLock.Unlock()
		return cfg.Save()
	}

	libs := &libRegistry{list: cfg.Libraries}
	if executor == nil {
		executor = defaultExecutor(libs.Get, getPrefs)
	}

	q, err := queue.New(cfg.DBPath, executor)
	if err != nil {
		return nil, fmt.Errorf("initializing queue at %q: %w", cfg.DBPath, err)
	}

	auth := api.Auth{
		BearerToken: cfg.BearerToken,
	}
	if cfg.CFTeamDomain != "" {
		auth.JWT = api.JWTConfig{
			TeamDomain: cfg.CFTeamDomain,
			Audience:   cfg.CFTagAudience,
		}
	}

	apiServer, err := api.New(api.Config{
		Port:           cfg.Port(),
		Version:        version,
		Libraries:      cfg.Libraries,
		LibrariesFn:    libs.Get,
		SetLibraries: func(list []steam.Library) error {
			libs.mu.Lock()
			libs.list = list
			libs.mu.Unlock()
			cfg.Libraries = list
			// Persist so the whitelist survives daemon restarts (Plan 017).
			if err := cfg.Save(); err != nil {
				return fmt.Errorf("persisting config: %w", err)
			}
			return nil
		},
		Preferences:    cfg.Preferences,
		PreferencesFn:  getPrefs,
		SetPreferences: setPrefs,
		Queue:          q,
		Auth:           auth,
		LogsFn:         logger.GetRecentLogs,
	})
	if err != nil {
		_ = q.Close()
		return nil, fmt.Errorf("initializing api server: %w", err)
	}

	relayClient := relay.NewClient(
		getPrefs,
		func(req queue.CreateJobRequest) (queue.Job, error) {
			return q.Enqueue(req)
		},
		func(jobID string) error {
			return q.CancelJob(jobID)
		},
		func() ([]queue.Job, error) {
			return q.ListJobs("")
		},
	)

	return &Service{
		cfg:         cfg,
		version:     version,
		queue:       q,
		server:      apiServer,
		relayClient: relayClient,
		libs:        libs,
	}, nil
}

func defaultExecutor(whitelist func() []steam.Library, prefFn func() config.Preferences) queue.Executor {
	return func(ctx context.Context, job queue.Job, step queue.StepFunc) error {
		prefs := config.Preferences{}
		if prefFn != nil {
			prefs = prefFn()
		}

		wasSteamRunning := false
		if prefs.CloseSteamOnTransfer && (job.Type == queue.TypePromote || job.Type == queue.TypeEvict) {
			wasSteamRunning = steam.CloseSteamGracefully(5 * time.Second)
		}
		defer func() {
			if wasSteamRunning && prefs.RelaunchSteamAfterTransfer {
				steam.RelaunchSteam()
			}
		}()

		libs := whitelist()
		var targetLib *steam.Library
		for i := range libs {
			if libs[i].ID == job.TargetLibraryID {
				targetLib = &libs[i]
				break
			}
		}
		if targetLib == nil {
			return fmt.Errorf("target library %q not found in config whitelist", job.TargetLibraryID)
		}

		games, err := steam.ScanLibraries(libs)
		if err != nil && len(games) == 0 {
			return fmt.Errorf("scanning libraries: %w", err)
		}
		var foundGame *steam.Game
		for i := range games {
			if games[i].Manifest.AppID == job.AppID {
				foundGame = &games[i]
				break
			}
		}
		if foundGame == nil {
			return fmt.Errorf("game %s: not found in any whitelisted library", job.AppID)
		}

		var srcLib *steam.Library
		for i := range libs {
			if libs[i].ID == foundGame.LibraryID {
				srcLib = &libs[i]
				break
			}
		}
		if srcLib == nil {
			return fmt.Errorf("source library %q not found", foundGame.LibraryID)
		}

		manifestName := fmt.Sprintf("appmanifest_%s.acf", job.AppID)
		opts := transfer.Options{}

		switch job.Type {
		case queue.TypePromote:
			return step(1, "promote", func() error {
				if foundGame.IsCustom {
					return transfer.PromoteCustom(ctx, opts, srcLib.Path, targetLib.Path, foundGame.Manifest.InstallDir)
				}
				return transfer.Promote(ctx, opts, srcLib.Path, targetLib.Path, manifestName, foundGame.Manifest.InstallDir)
			})
		case queue.TypeEvict:
			return step(1, "evict", func() error {
				if foundGame.IsCustom {
					return transfer.EvictCustom(ctx, opts, srcLib.Path, targetLib.Path, foundGame.Manifest.InstallDir)
				}
				return transfer.Evict(ctx, opts, srcLib.Path, targetLib.Path, manifestName, foundGame.Manifest.InstallDir)
			})
		case queue.TypeBackup:
			return step(1, "backup", func() error {
				return transfer.Backup(ctx, opts, srcLib.Path, targetLib.Path, foundGame.Manifest.InstallDir)
			})
		default:
			return fmt.Errorf("unsupported job type %q", job.Type)
		}
	}
}

// Start begins the HTTP API server in background.
func (s *Service) Start(parentCtx context.Context) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.running {
		return errors.New("service is already running")
	}

	ctx, cancel := context.WithCancel(parentCtx)
	s.cancel = cancel
	s.running = true

	s.wg.Add(1)
	go func() {
		defer s.wg.Done()
		slog.Info("http api server starting", "addr", s.server.Addr())
		if err := s.server.Run(ctx); err != nil && !errors.Is(err, context.Canceled) {
			slog.Error("http api server stopped with error", "err", err)
		}
		slog.Info("http api server exited")
	}()

	s.wg.Add(1)
	go func() {
		defer s.wg.Done()
		s.relayClient.Run(ctx)
	}()

	return nil
}

// Stop gracefully shuts down the HTTP server and queue worker.
func (s *Service) Stop() error {
	s.mu.Lock()
	if !s.running {
		s.mu.Unlock()
		return nil
	}
	s.cancel()
	s.running = false
	s.mu.Unlock()

	s.wg.Wait()

	if s.queue != nil {
		return s.queue.Close()
	}
	return nil
}

// Run starts the service and blocks until ctx is done, then stops cleanly.
func (s *Service) Run(ctx context.Context) error {
	if err := s.Start(ctx); err != nil {
		return err
	}
	<-ctx.Done()
	return s.Stop()
}

// Queue returns the initialized job queue.
func (s *Service) Queue() *queue.Queue {
	return s.queue
}

// Server returns the HTTP API server.
func (s *Service) Server() *api.Server {
	return s.server
}

// Config returns the active configuration.
func (s *Service) Config() *config.Config {
	return s.cfg
}
