package relay

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/url"
	"strings"
	"time"

	"github.com/Zeinshirou04/Zapp-Swap-Manager/core/internal/config"
	"github.com/Zeinshirou04/Zapp-Swap-Manager/core/internal/queue"
	"github.com/gorilla/websocket"
)

type RelayMessage struct {
	Type      string          `json:"type"`                // "command", "progress", "status", "error"
	TargetID  string          `json:"target_id,omitempty"` // Target device or client ID
	SenderID  string          `json:"sender_id,omitempty"`
	Action    string          `json:"action,omitempty"` // "promote", "evict", "backup", "cancel"
	Payload   json.RawMessage `json:"payload,omitempty"`
	Timestamp int64           `json:"timestamp"`
}

type CommandPayload struct {
	AppID           string `json:"app_id"`
	TargetLibraryID string `json:"target_library_id"`
	JobID           string `json:"job_id"`
}

type Client struct {
	prefFn     func() config.Preferences
	enqueueFn  func(req queue.CreateJobRequest) (queue.Job, error)
	cancelFn   func(jobID string) error
	listJobsFn func() ([]queue.Job, error)
}

func NewClient(
	prefFn func() config.Preferences,
	enqueueFn func(req queue.CreateJobRequest) (queue.Job, error),
	cancelFn func(jobID string) error,
	listJobsFn func() ([]queue.Job, error),
) *Client {
	return &Client{
		prefFn:     prefFn,
		enqueueFn:  enqueueFn,
		cancelFn:   cancelFn,
		listJobsFn: listJobsFn,
	}
}

func (c *Client) Run(ctx context.Context) {
	for {
		select {
		case <-ctx.Done():
			return
		default:
		}

		prefs := c.prefFn()
		if !prefs.RelayEnabled || prefs.RelayServerURL == "" || prefs.RelayDeviceID == "" || prefs.RelayDeviceSecret == "" {
			// Relay not enabled or configured; wait before checking again
			select {
			case <-ctx.Done():
				return
			case <-time.After(3 * time.Second):
				continue
			}
		}

		serverURL := strings.TrimRight(strings.TrimSpace(prefs.RelayServerURL), "/")
		if strings.HasPrefix(serverURL, "http://") {
			serverURL = "ws://" + strings.TrimPrefix(serverURL, "http://")
		} else if strings.HasPrefix(serverURL, "https://") {
			serverURL = "wss://" + strings.TrimPrefix(serverURL, "https://")
		} else if !strings.HasPrefix(serverURL, "ws://") && !strings.HasPrefix(serverURL, "wss://") {
			serverURL = "wss://" + serverURL
		}

		wsURL := fmt.Sprintf("%s/ws/device?device_id=%s&secret=%s",
			serverURL,
			url.QueryEscape(prefs.RelayDeviceID),
			url.QueryEscape(prefs.RelayDeviceSecret),
		)

		slog.Info("connecting to homeserver relay", "url", serverURL, "device_id", prefs.RelayDeviceID)
		conn, _, err := websocket.DefaultDialer.DialContext(ctx, wsURL, nil)
		if err != nil {
			slog.Warn("relay connection failed, will retry", "err", err)
			select {
			case <-ctx.Done():
				return
			case <-time.After(5 * time.Second):
				continue
			}
		}

		slog.Info("connected to homeserver relay successfully", "device_id", prefs.RelayDeviceID)
		c.handleConnection(ctx, conn, prefs.RelayDeviceID)

		// Wait before attempting reconnection to prevent tight reconnect loops
		select {
		case <-ctx.Done():
			return
		case <-time.After(2 * time.Second):
		}
	}
}

func (c *Client) handleConnection(ctx context.Context, conn *websocket.Conn, deviceID string) {
	defer conn.Close()

	done := make(chan struct{})
	defer close(done)

	// Background ticker to broadcast running job progress to homeserver
	go func() {
		ticker := time.NewTicker(2 * time.Second)
		defer ticker.Stop()

		for {
			select {
			case <-ctx.Done():
				return
			case <-done:
				return
			case <-ticker.C:
				if c.listJobsFn == nil {
					continue
				}
				jobs, err := c.listJobsFn()
				if err != nil {
					continue
				}

				for _, j := range jobs {
					if j.Status == queue.StatusRunning {
						payloadBytes, _ := json.Marshal(j)
						msg := RelayMessage{
							Type:      "progress",
							SenderID:  deviceID,
							Action:    string(j.Type),
							Payload:   payloadBytes,
							Timestamp: time.Now().Unix(),
						}
						msgBytes, _ := json.Marshal(msg)
						_ = conn.SetWriteDeadline(time.Now().Add(5 * time.Second))
						_ = conn.WriteMessage(websocket.TextMessage, msgBytes)
					}
				}
			}
		}
	}()

	for {
		select {
		case <-ctx.Done():
			return
		default:
		}

		_, message, err := conn.ReadMessage()
		if err != nil {
			slog.Warn("relay connection read error", "err", err)
			return
		}

		var msg RelayMessage
		if err := json.Unmarshal(message, &msg); err != nil {
			slog.Warn("malformed relay message", "err", err)
			continue
		}

		if msg.Type == "command" {
			c.handleCommand(conn, msg)
		}
	}
}

func (c *Client) handleCommand(conn *websocket.Conn, msg RelayMessage) {
	var payload CommandPayload
	if len(msg.Payload) > 0 {
		_ = json.Unmarshal(msg.Payload, &payload)
	}

	slog.Info("relay received command", "action", msg.Action, "app_id", payload.AppID)

	var err error
	switch msg.Action {
	case "promote", "evict", "backup":
		if c.enqueueFn != nil {
			_, err = c.enqueueFn(queue.CreateJobRequest{
				Type:            msg.Action,
				AppID:           payload.AppID,
				TargetLibraryID: payload.TargetLibraryID,
			})
		}
	case "cancel":
		if c.cancelFn != nil && payload.JobID != "" {
			err = c.cancelFn(payload.JobID)
		}
	default:
		err = fmt.Errorf("unknown action: %s", msg.Action)
	}

	statusType := "status"
	statusAction := "success"
	var errText string
	if err != nil {
		statusType = "error"
		statusAction = "failed"
		errText = err.Error()
	}

	respPayload, _ := json.Marshal(map[string]any{
		"action": msg.Action,
		"app_id": payload.AppID,
		"job_id": payload.JobID,
		"error":  errText,
	})

	respMsg := RelayMessage{
		Type:      statusType,
		Action:    statusAction,
		Payload:   respPayload,
		Timestamp: time.Now().Unix(),
	}

	respBytes, _ := json.Marshal(respMsg)
	_ = conn.SetWriteDeadline(time.Now().Add(5 * time.Second))
	_ = conn.WriteMessage(websocket.TextMessage, respBytes)
}
