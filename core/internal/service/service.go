package service

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"sync"

	"github.com/Zeinshirou04/Zapp-Swap-Manager/core/internal/api"
	"github.com/Zeinshirou04/Zapp-Swap-Manager/core/internal/config"
	"github.com/Zeinshirou04/Zapp-Swap-Manager/core/internal/queue"
	"github.com/Zeinshirou04/Zapp-Swap-Manager/core/internal/steam"
	"github.com/Zeinshirou04/Zapp-Swap-Manager/core/internal/transfer"
)

// Service coordinates all core background components: SQLite queue worker,
// HTTP API server, Steam library scans, and safe lifecycle management.
type Service struct {
	cfg     *config.Config
	version string
	queue   *queue.Queue
	server  *api.Server

	mu      sync.Mutex
	cancel  context.CancelFunc
	wg      sync.WaitGroup
	running bool
}

// New creates and initializes a Service with default transfer executor.
func New(cfg *config.Config, version string) (*Service, error) {
	return NewWithExecutor(cfg, version, defaultExecutor(cfg))
}

// NewWithExecutor allows injecting a custom queue.Executor (useful for testing).
func NewWithExecutor(cfg *config.Config, version string, executor queue.Executor) (*Service, error) {
	if cfg == nil {
		return nil, errors.New("service: nil config provided")
	}

	if dir := filepath.Dir(cfg.DBPath); dir != "" && dir != "." {
		if err := os.MkdirAll(dir, 0755); err != nil {
			return nil, fmt.Errorf("creating db directory: %w", err)
		}
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
		Port:      cfg.Port(),
		Version:   version,
		Libraries: cfg.Libraries,
		Queue:     q,
		Auth:      auth,
	})
	if err != nil {
		_ = q.Close()
		return nil, fmt.Errorf("initializing api server: %w", err)
	}

	return &Service{
		cfg:     cfg,
		version: version,
		queue:   q,
		server:  apiServer,
	}, nil
}

func defaultExecutor(cfg *config.Config) queue.Executor {
	return func(ctx context.Context, job queue.Job, step queue.StepFunc) error {
		var targetLib *steam.Library
		for i := range cfg.Libraries {
			if cfg.Libraries[i].ID == job.TargetLibraryID {
				targetLib = &cfg.Libraries[i]
				break
			}
		}
		if targetLib == nil {
			return fmt.Errorf("target library %q not found in config whitelist", job.TargetLibraryID)
		}

		manifestName := fmt.Sprintf("appmanifest_%s.acf", job.AppID)
		var srcLib *steam.Library
		for i := range cfg.Libraries {
			manifestPath := filepath.Join(cfg.Libraries[i].Path, "steamapps", manifestName)
			if _, err := os.Stat(manifestPath); err == nil {
				srcLib = &cfg.Libraries[i]
				break
			}
		}
		if srcLib == nil {
			return fmt.Errorf("game %s: appmanifest not found in any whitelisted library", job.AppID)
		}

		manifestPath := filepath.Join(srcLib.Path, "steamapps", manifestName)
		data, err := os.ReadFile(manifestPath)
		if err != nil {
			return fmt.Errorf("reading manifest %q: %w", manifestPath, err)
		}
		m, err := steam.ParseManifest(data)
		if err != nil {
			return fmt.Errorf("parsing manifest: %w", err)
		}

		opts := transfer.Options{}

		switch job.Type {
		case queue.TypePromote:
			return step(1, "promote", func() error {
				return transfer.Promote(ctx, opts, srcLib.Path, targetLib.Path, manifestName, m.InstallDir)
			})
		case queue.TypeEvict:
			return step(1, "evict", func() error {
				return transfer.Evict(ctx, opts, srcLib.Path, targetLib.Path, manifestName, m.InstallDir)
			})
		case queue.TypeBackup:
			return step(1, "backup", func() error {
				return transfer.Backup(ctx, opts, srcLib.Path, targetLib.Path, m.InstallDir)
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
