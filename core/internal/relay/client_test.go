package relay_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"

	"github.com/Zeinshirou04/Zapp-Swap-Manager/core/internal/config"
	"github.com/Zeinshirou04/Zapp-Swap-Manager/core/internal/queue"
	"github.com/Zeinshirou04/Zapp-Swap-Manager/core/internal/relay"
	"github.com/gorilla/websocket"
)

var testUpgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

func TestRelayClient_ConnectAndReceiveCommand(t *testing.T) {
	var promoteCalled int32
	var lastAppID atomic.Value

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/ws/device" {
			http.NotFound(w, r)
			return
		}

		conn, err := testUpgrader.Upgrade(w, r, nil)
		if err != nil {
			return
		}
		defer conn.Close()

		// Send promote command to device
		cmdPayload, _ := json.Marshal(relay.CommandPayload{
			AppID:           "730",
			TargetLibraryID: "lib-ssd",
		})
		msg := relay.RelayMessage{
			Type:      "command",
			Action:    "promote",
			Payload:   cmdPayload,
			Timestamp: time.Now().Unix(),
		}
		msgBytes, _ := json.Marshal(msg)
		_ = conn.WriteMessage(websocket.TextMessage, msgBytes)

		// Wait for status reply
		_, respBytes, err := conn.ReadMessage()
		if err != nil {
			return
		}

		var resp relay.RelayMessage
		_ = json.Unmarshal(respBytes, &resp)
		if resp.Type != "status" || resp.Action != "success" {
			t.Errorf("expected success status from device, got %+v", resp)
		}

		// Keep connection open until test finishes
		<-r.Context().Done()
	}))
	defer server.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	client := relay.NewClient(
		func() config.Preferences {
			return config.Preferences{
				RelayEnabled:      true,
				RelayServerURL:    server.URL,
				RelayDeviceID:     "dev-123",
				RelayDeviceSecret: "secret-456",
			}
		},
		func(req queue.CreateJobRequest) (queue.Job, error) {
			if req.Type == queue.TypePromote {
				atomic.AddInt32(&promoteCalled, 1)
				lastAppID.Store(req.AppID)
			}
			return queue.Job{ID: "job-1", AppID: req.AppID, Status: queue.StatusQueued}, nil
		},
		func(jobID string) error {
			return nil
		},
		func() ([]queue.Job, error) {
			return nil, nil
		},
	)

	go client.Run(ctx)

	// Wait for promote to be processed
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		if atomic.LoadInt32(&promoteCalled) > 0 {
			break
		}
		time.Sleep(50 * time.Millisecond)
	}

	if atomic.LoadInt32(&promoteCalled) != 1 {
		t.Fatalf("expected promote command to be processed once, got %d", atomic.LoadInt32(&promoteCalled))
	}

	val := lastAppID.Load()
	if val == nil || val.(string) != "730" {
		t.Errorf("expected appID 730, got %v", val)
	}
}

func TestRelayClient_Disabled(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 200*time.Millisecond)
	defer cancel()

	client := relay.NewClient(
		func() config.Preferences {
			return config.Preferences{
				RelayEnabled: false,
			}
		},
		nil,
		nil,
		nil,
	)

	// Should not block or panic when disabled
	client.Run(ctx)
}
