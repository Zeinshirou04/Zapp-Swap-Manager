//go:build !windows

package tray

import (
	"context"
	"log/slog"

	"github.com/Zeinshirou04/Zapp-Swap-Manager/core/internal/service"
)

// OtherRunner provides a daemon runner on platforms without Win32 tray support.
type OtherRunner struct {
	actions Actions
}

// NewRunner creates a platform-appropriate Runner.
func NewRunner(actions Actions) Runner {
	return &OtherRunner{actions: actions}
}

// Run executes the service in background until ctx is cancelled.
func (r *OtherRunner) Run(ctx context.Context, svc *service.Service) error {
	slog.Info("running in daemon mode (non-windows platform)")
	return svc.Run(ctx)
}
