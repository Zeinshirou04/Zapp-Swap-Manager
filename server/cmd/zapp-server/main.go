package main

import (
	"context"
	"flag"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/Zeinshirou04/Zapp-Swap-Manager/server/internal/api"
	"github.com/Zeinshirou04/Zapp-Swap-Manager/server/internal/auth"
	"github.com/Zeinshirou04/Zapp-Swap-Manager/server/internal/db"
	"github.com/Zeinshirou04/Zapp-Swap-Manager/server/internal/relay"
)

func main() {
	bindAddr := flag.String("bind", getEnv("ZAPP_SERVER_BIND", "0.0.0.0:8080"), "Address and port to bind")
	dbPath := flag.String("db", getEnv("ZAPP_SERVER_DB", "data/relay.db"), "Path to SQLite database")
	secret := flag.String("secret", getEnv("ZAPP_SERVER_SECRET", "zapp-swap-manager-default-relay-secret-change-me"), "Secret key for signing JWT tokens")
	flag.Parse()

	logger := slog.New(slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{
		Level: slog.LevelInfo,
	}))
	slog.SetDefault(logger)

	slog.Info("starting zapp relay server", "bind", *bindAddr, "db", *dbPath)

	store, err := db.Open(*dbPath)
	if err != nil {
		slog.Error("failed to open database", "err", err)
		os.Exit(1)
	}
	defer store.Close()

	authService := auth.NewService(*secret)

	hub := relay.NewHub(func(deviceID string) {
		slog.Info("hub reported device dropped", "device_id", deviceID)
		_ = store.UpdateDeviceStatus(deviceID, false, "")
	})

	server := api.NewServer(store, authService, hub)

	httpServer := &http.Server{
		Addr:         *bindAddr,
		Handler:      server.Handler(),
		ReadTimeout:  30 * time.Second,
		WriteTimeout: 30 * time.Second,
	}

	shutdown := make(chan os.Signal, 1)
	signal.Notify(shutdown, os.Interrupt, syscall.SIGTERM)

	go func() {
		slog.Info("relay server listening", "address", *bindAddr)
		if err := httpServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			slog.Error("http server failed", "err", err)
			os.Exit(1)
		}
	}()

	<-shutdown
	slog.Info("shutting down relay server gracefully...")

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := httpServer.Shutdown(ctx); err != nil {
		slog.Error("server shutdown error", "err", err)
	}

	fmt.Println("zapp relay server stopped cleanly")
}

func getEnv(key, fallback string) string {
	if val := os.Getenv(key); val != "" {
		return val
	}
	return fallback
}
