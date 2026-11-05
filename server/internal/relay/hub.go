package relay

import (
	"encoding/json"
	"errors"
	"log/slog"
	"sync"
	"time"

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

type DeviceConnection struct {
	DeviceID string
	UserID   string
	Conn     *websocket.Conn
	Send     chan []byte
	hub      *Hub
}

type ClientConnection struct {
	ClientID string
	UserID   string
	Conn     *websocket.Conn
	Send     chan []byte
	hub      *Hub
}

type Hub struct {
	mu           sync.RWMutex
	devices      map[string]*DeviceConnection            // deviceID -> conn
	clients      map[string]map[string]*ClientConnection // userID -> map[clientID]conn
	onDeviceDrop func(deviceID string)
}

func NewHub(onDeviceDrop func(deviceID string)) *Hub {
	return &Hub{
		devices:      make(map[string]*DeviceConnection),
		clients:      make(map[string]map[string]*ClientConnection),
		onDeviceDrop: onDeviceDrop,
	}
}

func (h *Hub) RegisterDevice(deviceID, userID string, conn *websocket.Conn) *DeviceConnection {
	h.mu.Lock()
	defer h.mu.Unlock()

	// If device already registered, close old connection
	if old, exists := h.devices[deviceID]; exists {
		close(old.Send)
		old.Conn.Close()
	}

	d := &DeviceConnection{
		DeviceID: deviceID,
		UserID:   userID,
		Conn:     conn,
		Send:     make(chan []byte, 64),
		hub:      h,
	}
	h.devices[deviceID] = d
	slog.Info("device connected to relay", "device_id", deviceID, "user_id", userID)

	// Notify clients belonging to this user that device is online
	go h.BroadcastToUser(userID, RelayMessage{
		Type:      "device_status",
		SenderID:  deviceID,
		Action:    "online",
		Timestamp: time.Now().Unix(),
	})

	return d
}

func (h *Hub) UnregisterDevice(deviceID string) {
	h.mu.Lock()
	d, exists := h.devices[deviceID]
	if exists {
		delete(h.devices, deviceID)
		close(d.Send)
	}
	h.mu.Unlock()

	if exists {
		slog.Info("device disconnected from relay", "device_id", deviceID)
		if h.onDeviceDrop != nil {
			h.onDeviceDrop(deviceID)
		}
		h.BroadcastToUser(d.UserID, RelayMessage{
			Type:      "device_status",
			SenderID:  deviceID,
			Action:    "offline",
			Timestamp: time.Now().Unix(),
		})
	}
}

func (h *Hub) RegisterClient(clientID, userID string, conn *websocket.Conn) *ClientConnection {
	h.mu.Lock()
	defer h.mu.Unlock()

	if _, exists := h.clients[userID]; !exists {
		h.clients[userID] = make(map[string]*ClientConnection)
	}

	c := &ClientConnection{
		ClientID: clientID,
		UserID:   userID,
		Conn:     conn,
		Send:     make(chan []byte, 64),
		hub:      h,
	}
	h.clients[userID][clientID] = c
	slog.Info("client connected to relay", "client_id", clientID, "user_id", userID)
	return c
}

func (h *Hub) UnregisterClient(clientID, userID string) {
	h.mu.Lock()
	defer h.mu.Unlock()

	if userClients, exists := h.clients[userID]; exists {
		if c, ok := userClients[clientID]; ok {
			delete(userClients, clientID)
			close(c.Send)
		}
		if len(userClients) == 0 {
			delete(h.clients, userID)
		}
	}
	slog.Info("client disconnected from relay", "client_id", clientID)
}

func (h *Hub) SendToDevice(userID, deviceID string, msg RelayMessage) error {
	h.mu.RLock()
	d, exists := h.devices[deviceID]
	h.mu.RUnlock()

	if !exists || d.UserID != userID {
		return errors.New("device offline or not owned by user")
	}

	data, err := json.Marshal(msg)
	if err != nil {
		return err
	}

	select {
	case d.Send <- data:
		return nil
	default:
		return errors.New("device send buffer full")
	}
}

func (h *Hub) BroadcastToUser(userID string, msg RelayMessage) {
	data, err := json.Marshal(msg)
	if err != nil {
		return
	}

	h.mu.RLock()
	defer h.mu.RUnlock()

	if userClients, exists := h.clients[userID]; exists {
		for _, client := range userClients {
			select {
			case client.Send <- data:
			default:
				slog.Warn("client send buffer full, dropping message", "client_id", client.ClientID)
			}
		}
	}
}

func (h *Hub) IsDeviceOnline(deviceID string) bool {
	h.mu.RLock()
	defer h.mu.RUnlock()
	_, exists := h.devices[deviceID]
	return exists
}
