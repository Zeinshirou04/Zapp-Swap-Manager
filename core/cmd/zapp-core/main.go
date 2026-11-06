package main

import (
	"context"
	"flag"
	"fmt"
	"log/slog"
	"os"
	"os/signal"
	"syscall"

	"github.com/Zeinshirou04/Zapp-Swap-Manager/core/internal/config"
	"github.com/Zeinshirou04/Zapp-Swap-Manager/core/internal/logger"
	"github.com/Zeinshirou04/Zapp-Swap-Manager/core/internal/service"
	"github.com/Zeinshirou04/Zapp-Swap-Manager/core/internal/tray"
)

var (
	// Version is populated at build time via -ldflags="-X main.Version=...".
	Version = "0.3.1-beta.4"
)

func main() {
	configPath := flag.String("config", "", "Path to JSON configuration file")
	portFlag := flag.Int("port", 0, "Override port to bind (loopback 127.0.0.1)")
	headlessFlag := flag.Bool("headless", false, "Run in headless mode without system tray icon")
	versionFlag := flag.Bool("version", false, "Print core version and exit")
	flag.Parse()

	if *versionFlag {
		fmt.Printf("Zapp Swap Manager Core version %s\n", Version)
		os.Exit(0)
	}

	cleanupLogger, err := logger.Setup("")
	if err != nil {
		slog.Warn("failed to initialize persistent file logger, using stdout default", "err", err)
	} else {
		defer cleanupLogger()
	}

	slog.Info("initializing Zapp Swap Manager core", "version", Version, "log_file", logger.LogFilePath())

	cfg, err := config.Load(*configPath)
	if err != nil {
		slog.Error("failed to load configuration", "err", err)
		os.Exit(1)
	}

	if *portFlag > 0 {
		cfg.BindAddr = fmt.Sprintf("127.0.0.1:%d", *portFlag)
		if err := cfg.Validate(); err != nil {
			slog.Error("invalid bind address from -port flag", "err", err)
			os.Exit(1)
		}
	}
	if *headlessFlag {
		cfg.Headless = true
	}

	svc, err := service.New(cfg, Version)
	if err != nil {
		slog.Error("failed to create core service", "err", err)
		os.Exit(1)
	}

	ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer cancel()

	runner := tray.NewRunner(tray.Actions{
		OnExit: func() {
			slog.Info("exit requested from tray icon")
			cancel()
		},
	})

	if err := runner.Run(ctx, svc); err != nil {
		slog.Error("service execution failed", "err", err)
		os.Exit(1)
	}

	slog.Info("Zapp Swap Manager shutdown completed cleanly")
}
