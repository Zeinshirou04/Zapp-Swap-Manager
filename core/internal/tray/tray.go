package tray

import (
	"context"

	"github.com/Zeinshirou04/Zapp-Swap-Manager/core/internal/service"
)

// Actions callbacks for tray menu interaction.
type Actions struct {
	OnOpenDashboard func()
	OnExit          func()
}

// Runner abstracts platform-specific system tray display and event loops.
type Runner interface {
	Run(ctx context.Context, svc *service.Service) error
}
