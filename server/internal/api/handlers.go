package api

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/Zeinshirou04/Zapp-Swap-Manager/server/internal/db"
	"github.com/Zeinshirou04/Zapp-Swap-Manager/server/internal/relay"
	"github.com/google/uuid"
	"github.com/gorilla/websocket"
)

type RegisterRequest struct {
	Email       string `json:"email"`
	Password    string `json:"password"`
	DisplayName string `json:"display_name"`
}

type LoginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

type AuthResponse struct {
	Token string   `json:"token"`
	User  *db.User `json:"user"`
}

type CreateDeviceRequest struct {
	Name string `json:"name"`
}

type CreateDeviceResponse struct {
	Device       *db.Device `json:"device"`
	DeviceSecret string     `json:"device_secret"`
}

type CommandRequest struct {
	Action  string          `json:"action"`
	Payload json.RawMessage `json:"payload,omitempty"`
}

func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{
		"status":  "ok",
		"service": "zapp-relay-server",
		"version": "0.3.1-beta.7",
	})
}

func (s *Server) handleRegister(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	var req RegisterRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	req.Email = strings.TrimSpace(strings.ToLower(req.Email))
	if req.Email == "" || !strings.Contains(req.Email, "@") {
		writeError(w, http.StatusBadRequest, "a valid email is required")
		return
	}
	if len(req.Password) < 6 {
		writeError(w, http.StatusBadRequest, "password must be at least 6 characters")
		return
	}
	if strings.TrimSpace(req.DisplayName) == "" {
		req.DisplayName = strings.Split(req.Email, "@")[0]
	}

	hash, err := s.auth.HashPassword(req.Password)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to hash password")
		return
	}

	user := db.User{
		ID:           uuid.New().String(),
		Email:        req.Email,
		PasswordHash: hash,
		DisplayName:  req.DisplayName,
	}

	if err := s.store.CreateUser(&user); err != nil {
		writeError(w, http.StatusConflict, "user with this email already exists")
		return
	}

	token, err := s.auth.GenerateToken(user.ID, user.Email, "user", 30*24*time.Hour)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to generate token")
		return
	}

	writeJSON(w, http.StatusCreated, AuthResponse{
		Token: token,
		User:  &user,
	})
}

func (s *Server) handleLogin(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	var req LoginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	req.Email = strings.TrimSpace(strings.ToLower(req.Email))
	user, err := s.store.GetUserByEmail(req.Email)
	if err != nil || !s.auth.CheckPassword(user.PasswordHash, req.Password) {
		writeError(w, http.StatusUnauthorized, "invalid email or password")
		return
	}

	token, err := s.auth.GenerateToken(user.ID, user.Email, "user", 30*24*time.Hour)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to generate token")
		return
	}

	writeJSON(w, http.StatusOK, AuthResponse{
		Token: token,
		User:  user,
	})
}

func (s *Server) handleMe(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	claims, err := s.authenticate(r)
	if err != nil {
		writeError(w, http.StatusUnauthorized, err.Error())
		return
	}

	user, err := s.store.GetUserByID(claims.UserID)
	if err != nil {
		writeError(w, http.StatusNotFound, "user not found")
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"user": user})
}

func (s *Server) handleDevices(w http.ResponseWriter, r *http.Request) {
	claims, err := s.authenticate(r)
	if err != nil {
		writeError(w, http.StatusUnauthorized, err.Error())
		return
	}

	switch r.Method {
	case http.MethodGet:
		devices, err := s.store.ListDevices(claims.UserID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to list devices")
			return
		}

		// Update online status in response according to active hub connections
		for i := range devices {
			if s.hub.IsDeviceOnline(devices[i].ID) {
				devices[i].Online = true
			}
		}

		writeJSON(w, http.StatusOK, map[string]any{"devices": devices})

	case http.MethodPost:
		var req CreateDeviceRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			req.Name = "Gaming PC"
		}
		if strings.TrimSpace(req.Name) == "" {
			req.Name = "Gaming PC"
		}

		deviceID := uuid.New().String()
		secret := generateSecret()
		device := db.Device{
			ID:           deviceID,
			UserID:       claims.UserID,
			Name:         req.Name,
			DeviceSecret: secret,
			Online:       false,
		}

		if err := s.store.RegisterDevice(&device); err != nil {
			writeError(w, http.StatusInternalServerError, "failed to register device")
			return
		}

		writeJSON(w, http.StatusCreated, CreateDeviceResponse{
			Device:       &device,
			DeviceSecret: secret,
		})

	default:
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
	}
}

func (s *Server) handleDeviceSubroutes(w http.ResponseWriter, r *http.Request) {
	claims, err := s.authenticate(r)
	if err != nil {
		writeError(w, http.StatusUnauthorized, err.Error())
		return
	}

	// Path is expected to be /api/devices/{id}/command
	subpath := strings.TrimPrefix(r.URL.Path, "/api/devices/")
	parts := strings.Split(subpath, "/")
	if len(parts) == 2 && parts[1] == "command" && r.Method == http.MethodPost {
		deviceID := parts[0]

		device, err := s.store.GetDevice(deviceID)
		if err != nil || device.UserID != claims.UserID {
			writeError(w, http.StatusNotFound, "device not found")
			return
		}

		var cmdReq CommandRequest
		if err := json.NewDecoder(r.Body).Decode(&cmdReq); err != nil {
			writeError(w, http.StatusBadRequest, "invalid command body")
			return
		}

		msg := relay.RelayMessage{
			Type:      "command",
			TargetID:  deviceID,
			SenderID:  claims.UserID,
			Action:    cmdReq.Action,
			Payload:   cmdReq.Payload,
			Timestamp: time.Now().Unix(),
		}

		if err := s.hub.SendToDevice(claims.UserID, deviceID, msg); err != nil {
			writeError(w, http.StatusConflict, "device is currently offline: "+err.Error())
			return
		}

		writeJSON(w, http.StatusOK, map[string]string{
			"status":    "dispatched",
			"device_id": deviceID,
			"action":    cmdReq.Action,
		})
		return
	}

	writeError(w, http.StatusNotFound, "endpoint not found")
}

func (s *Server) handleDeviceWS(w http.ResponseWriter, r *http.Request) {
	deviceID := r.URL.Query().Get("device_id")
	secret := r.URL.Query().Get("secret")

	if deviceID == "" || secret == "" {
		writeError(w, http.StatusBadRequest, "missing device_id or secret query param")
		return
	}

	device, err := s.store.GetDevice(deviceID)
	if err != nil || device.DeviceSecret != secret {
		writeError(w, http.StatusUnauthorized, "invalid device credentials")
		return
	}

	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		slog.Error("device ws upgrade failed", "err", err)
		return
	}

	devConn := s.hub.RegisterDevice(device.ID, device.UserID, conn)
	_ = s.store.UpdateDeviceStatus(device.ID, true, r.RemoteAddr)

	// Write pump
	go func() {
		defer conn.Close()
		for msg := range devConn.Send {
			_ = conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if err := conn.WriteMessage(websocket.TextMessage, msg); err != nil {
				return
			}
		}
	}()

	// Read pump
	conn.SetReadLimit(10 * 1024 * 1024)
	for {
		_, message, err := conn.ReadMessage()
		if err != nil {
			break
		}
		var msg relay.RelayMessage
		if err := json.Unmarshal(message, &msg); err == nil {
			msg.SenderID = device.ID
			s.hub.BroadcastToUser(device.UserID, msg)
		}
	}

	s.hub.UnregisterDevice(device.ID)
	_ = s.store.UpdateDeviceStatus(device.ID, false, r.RemoteAddr)
}

func (s *Server) handleClientWS(w http.ResponseWriter, r *http.Request) {
	claims, err := s.authenticate(r)
	if err != nil {
		writeError(w, http.StatusUnauthorized, err.Error())
		return
	}

	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		slog.Error("client ws upgrade failed", "err", err)
		return
	}

	clientID := uuid.New().String()
	clientConn := s.hub.RegisterClient(clientID, claims.UserID, conn)

	// Write pump
	go func() {
		defer conn.Close()
		for msg := range clientConn.Send {
			_ = conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if err := conn.WriteMessage(websocket.TextMessage, msg); err != nil {
				return
			}
		}
	}()

	// Read pump
	conn.SetReadLimit(1024 * 1024)
	for {
		_, message, err := conn.ReadMessage()
		if err != nil {
			break
		}
		var msg relay.RelayMessage
		if err := json.Unmarshal(message, &msg); err == nil {
			if msg.TargetID != "" {
				_ = s.hub.SendToDevice(claims.UserID, msg.TargetID, msg)
			}
		}
	}

	s.hub.UnregisterClient(clientID, claims.UserID)
}
