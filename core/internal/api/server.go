// Package api serves the HTTP contract from api/openapi.yaml: the JSON API
// between the core service, the desktop UI, and the mobile app behind a
// Cloudflare Tunnel. docs/safety.md "API input" is enforced here: strict
// 127.0.0.1 binding, auth on every request, and POST /jobs accepts only job
// type + app ID + whitelisted library ID — never filesystem paths.
package api

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"time"

	"github.com/Zeinshirou04/Zapp-Swap-Manager/core/internal/queue"
	"github.com/Zeinshirou04/Zapp-Swap-Manager/core/internal/steam"
	"github.com/Zeinshirou04/Zapp-Swap-Manager/core/internal/transfer"
)

// Config wires the server to its collaborators. Libraries is the initial
// whitelist: config-owned, server-side only — clients never send paths in
// jobs. POST /libraries (Plan 017) may replace the whitelist through
// SetLibraries; LibrariesFn reports the live list. Paths entering the
// whitelist are validated server-side (existing absolute directories).
type Config struct {
	Port         int
	Version      string
	Libraries    []steam.Library
	LibrariesFn  func() []steam.Library
	SetLibraries func([]steam.Library) error
	Queue        *queue.Queue
	Auth         Auth
}

// Server owns the bound http.Server.
type Server struct {
	cfg   Config
	srv   *http.Server
	start time.Time
}

// New builds the server (not yet started). It validates the config: a queue
// and at least one auth scheme must be configured.
func New(cfg Config) (*Server, error) {
	if cfg.Queue == nil {
		return nil, errors.New("api: queue is required")
	}
	if cfg.Auth.BearerToken == "" && cfg.Auth.JWT.TeamDomain == "" {
		return nil, errors.New("api: no auth scheme configured (bearer token or cloudflare team domain)")
	}
	if cfg.Libraries == nil {
		cfg.Libraries = []steam.Library{}
	}
	if cfg.Auth.JWT.fetchKeys == nil {
		cfg.Auth.JWT.fetchKeys = fetchCloudflareKeys
	}
	if cfg.Port == 0 {
		cfg.Port = 8765
	}
	mux := newRouter(cfg)
	handler := corsMiddleware(cfg.Auth.RequireAuth(reqLog(mux)))
	s := &Server{cfg: cfg, start: time.Now()}
	s.srv = &http.Server{
		// safety: core binds to loopback only, never 0.0.0.0.
		Addr:              net.JoinHostPort("127.0.0.1", fmt.Sprint(cfg.Port)),
		Handler:           handler,
		ReadHeaderTimeout: 10 * time.Second,
	}
	return s, nil
}

// Addr reports the bound address (test convenience).
func (s *Server) Addr() string { return s.srv.Addr }

// Run serves until ctx is cancelled, then shuts down gracefully.
func (s *Server) Run(ctx context.Context) error {
	errCh := make(chan error, 1)
	go func() { errCh <- s.srv.ListenAndServe() }()
	select {
	case err := <-errCh:
		if errors.Is(err, http.ErrServerClosed) {
			return nil
		}
		return err
	case <-ctx.Done():
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		return s.srv.Shutdown(shutdownCtx)
	}
}

func newRouter(cfg Config) *http.ServeMux {
	h := handlers{cfg: cfg, start: time.Now()}
	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", h.health)
	mux.HandleFunc("GET /libraries", h.libraries)
	mux.HandleFunc("GET /libraries/detected", h.detectedLibraries)
	mux.HandleFunc("POST /libraries", h.registerLibraries)
	mux.HandleFunc("GET /games", h.listGames)
	mux.HandleFunc("GET /games/{app_id}", h.getGame)
	mux.HandleFunc("GET /jobs", h.listJobs)
	mux.HandleFunc("POST /jobs", h.createJob)
	mux.HandleFunc("GET /jobs/{job_id}", h.getJob)
	mux.HandleFunc("POST /jobs/{job_id}/cancel", h.cancelJob)
	return mux
}

// reqLog emits one structured line per request.
func reqLog(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		next.ServeHTTP(w, r)
		slog.Info("http", "method", r.Method, "path", r.URL.Path, "remote", r.RemoteAddr, "elapsed_ms", time.Since(start).Milliseconds())
	})
}

// writeJSON writes a JSON response, or a plain ErrorResponse on failure.
func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(v); err != nil {
		slog.Error("encode response", "err", err)
	}
}

// errorBody matches the ErrorResponse schema in api/openapi.yaml.
type errorBody struct {
	Code    string   `json:"code"`
	Message string   `json:"message"`
	Details []string `json:"details,omitempty"`
}

func writeError(w http.ResponseWriter, status int, code, msg string) {
	writeJSON(w, status, errorBody{Code: code, Message: msg})
}

// TransferExecutor maps jobs onto the transfer sequences (docs/safety.md
// Directions). The queue journals each transfer call as one step; finer
// intra-sequence steps arrive when transfer.* grow step callbacks.
//
// Direction rules derived from the whitelist, per docs/safety.md:
//   - backup/evict: game currently in an ssd_cache library, target is the
//     hdd_master library.
//   - promote: game currently in the hdd_master library, target is an
//     ssd_cache library.
func TransferExecutor(libs []steam.Library) queue.Executor {
	index := map[string]steam.Library{}
	for _, l := range libs {
		index[l.ID] = l
	}
	return func(ctx context.Context, job queue.Job, step queue.StepFunc) error {
		manifestName := "appmanifest_" + job.AppID + ".acf"

		game, err := findGame(libs, job.AppID)
		if err != nil {
			return err
		}
		cur := index[game.LibraryID]
		target, ok := index[job.TargetLibraryID]
		if !ok {
			return fmt.Errorf("target library %q is not whitelisted", job.TargetLibraryID)
		}
		if cur.Path == target.Path {
			return fmt.Errorf("game %s is already in library %q", job.AppID, job.TargetLibraryID)
		}
		opts := transfer.Options{} // LastBackup metrics wired from the journal later
		dir := game.Manifest.InstallDir

		switch {
		case job.Type == queue.TypeBackup:
			if cur.Type != steam.TypeSSDCache || target.Type != steam.TypeHDDMaster {
				return fmt.Errorf("backup requires the game in an ssd library and an hdd target")
			}
			return step(1, "backup mirror", func() error {
				return transfer.Backup(ctx, opts, cur.Path, target.Path, dir)
			})
		case job.Type == queue.TypeEvict:
			if cur.Type != steam.TypeSSDCache || target.Type != steam.TypeHDDMaster {
				return fmt.Errorf("evict requires the game in an ssd library and an hdd target")
			}
			return step(1, "evict to hdd", func() error {
				if game.IsCustom {
					return transfer.EvictCustom(ctx, opts, cur.Path, target.Path, dir)
				}
				return transfer.Evict(ctx, opts, cur.Path, target.Path, manifestName, dir)
			})
		case job.Type == queue.TypePromote:
			if cur.Type != steam.TypeHDDMaster || target.Type != steam.TypeSSDCache {
				return fmt.Errorf("promote requires the game in the hdd library and an ssd target")
			}
			return step(1, "promote to ssd", func() error {
				if game.IsCustom {
					return transfer.PromoteCustom(ctx, opts, cur.Path, target.Path, dir)
				}
				return transfer.Promote(ctx, opts, cur.Path, target.Path, manifestName, dir)
			})
		default:
			return fmt.Errorf("unknown job type %q", job.Type)
		}
	}
}

// corsMiddleware attaches CORS and Private Network Access (PNA) headers to all
// responses, and short-circuits HTTP OPTIONS preflight requests without requiring auth.
func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if origin != "" {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Access-Control-Allow-Credentials", "true")
			w.Header().Add("Vary", "Origin")
		} else {
			w.Header().Set("Access-Control-Allow-Origin", "*")
		}
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD")

		reqHeaders := r.Header.Get("Access-Control-Request-Headers")
		if reqHeaders != "" {
			w.Header().Set("Access-Control-Allow-Headers", reqHeaders)
		} else {
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, Cf-Access-Jwt-Assertion, Accept")
		}
		w.Header().Set("Access-Control-Max-Age", "86400")

		// Support Private Network Access (PNA) for Chromium webviews
		if r.Header.Get("Access-Control-Request-Private-Network") == "true" {
			w.Header().Set("Access-Control-Allow-Private-Network", "true")
		}

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}

		next.ServeHTTP(w, r)
	})
}
