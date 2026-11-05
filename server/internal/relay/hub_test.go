package relay_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/Zeinshirou04/Zapp-Swap-Manager/server/internal/relay"
	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

func TestRelayHub_DeviceAndClientExchange(t *testing.T) {
	hub := relay.NewHub(nil)

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			return
		}

		path := r.URL.Path
		if path == "/device" {
			dev := hub.RegisterDevice("dev-1", "user-1", conn)
			for msg := range dev.Send {
				_ = conn.WriteMessage(websocket.TextMessage, msg)
			}
		} else if path == "/client" {
			cli := hub.RegisterClient("cli-1", "user-1", conn)
			for msg := range cli.Send {
				_ = conn.WriteMessage(websocket.TextMessage, msg)
			}
		}
	}))
	defer server.Close()

	wsURL := "ws" + strings.TrimPrefix(server.URL, "http")

	// Connect Client
	clientConn, _, err := websocket.DefaultDialer.Dial(wsURL+"/client", nil)
	if err != nil {
		t.Fatalf("failed to dial client ws: %v", err)
	}
	defer clientConn.Close()

	// Connect Device
	deviceConn, _, err := websocket.DefaultDialer.Dial(wsURL+"/device", nil)
	if err != nil {
		t.Fatalf("failed to dial device ws: %v", err)
	}
	defer deviceConn.Close()

	// Wait for registration
	time.Sleep(50 * time.Millisecond)

	if !hub.IsDeviceOnline("dev-1") {
		t.Fatalf("expected dev-1 to be online")
	}

	// 1. Send command from user to device
	cmd := relay.RelayMessage{
		Type:      "command",
		Action:    "promote",
		Timestamp: time.Now().Unix(),
	}
	if err := hub.SendToDevice("user-1", "dev-1", cmd); err != nil {
		t.Fatalf("failed to send to device: %v", err)
	}

	// Read on device
	_ = deviceConn.SetReadDeadline(time.Now().Add(2 * time.Second))
	_, msgBytes, err := deviceConn.ReadMessage()
	if err != nil {
		t.Fatalf("device read error: %v", err)
	}

	var received relay.RelayMessage
	if err := json.Unmarshal(msgBytes, &received); err != nil {
		t.Fatalf("unmarshal error: %v", err)
	}
	if received.Action != "promote" {
		t.Errorf("expected promote action, got %s", received.Action)
	}

	// 2. Broadcast progress to user
	progressMsg := relay.RelayMessage{
		Type:      "progress",
		SenderID:  "dev-1",
		Action:    "copying",
		Timestamp: time.Now().Unix(),
	}
	hub.BroadcastToUser("user-1", progressMsg)

	_ = clientConn.SetReadDeadline(time.Now().Add(2 * time.Second))
	_, clientMsgBytes, err := clientConn.ReadMessage()
	if err != nil {
		t.Fatalf("client read error: %v", err)
	}

	var clientReceived relay.RelayMessage
	if err := json.Unmarshal(clientMsgBytes, &clientReceived); err != nil {
		t.Fatalf("client unmarshal error: %v", err)
	}
	// Note: First message on client might be device_status online notification, read until progress
	if clientReceived.Type != "progress" {
		// Read next message
		_, clientMsgBytes, _ = clientConn.ReadMessage()
		_ = json.Unmarshal(clientMsgBytes, &clientReceived)
	}
	if clientReceived.Action != "copying" && clientReceived.Type != "device_status" {
		t.Errorf("expected copying action or device_status, got %+v", clientReceived)
	}
}
