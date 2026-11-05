package api

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"net/http"
	"strings"

	"github.com/Zeinshirou04/Zapp-Swap-Manager/server/internal/auth"
	"github.com/Zeinshirou04/Zapp-Swap-Manager/server/internal/db"
	"github.com/Zeinshirou04/Zapp-Swap-Manager/server/internal/relay"
	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		return true // Allow cross-origin requests from desktop, mobile, and dev clients
	},
	ReadBufferSize:  4096,
	WriteBufferSize: 4096,
}

type Server struct {
	store *db.Store
	auth  *auth.Service
	hub   *relay.Hub
	mux   *http.ServeMux
}

func NewServer(store *db.Store, authService *auth.Service, hub *relay.Hub) *Server {
	s := &Server{
		store: store,
		auth:  authService,
		hub:   hub,
		mux:   http.NewServeMux(),
	}
	s.routes()
	return s
}

func (s *Server) Handler() http.Handler {
	return s.corsMiddleware(s.mux)
}

func (s *Server) corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With")

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}

		next.ServeHTTP(w, r)
	})
}

func (s *Server) routes() {
	s.mux.HandleFunc("/health", s.handleHealth)
	s.mux.HandleFunc("/api/health", s.handleHealth)

	s.mux.HandleFunc("/api/auth/register", s.handleRegister)
	s.mux.HandleFunc("/api/auth/login", s.handleLogin)
	s.mux.HandleFunc("/api/auth/me", s.handleMe)

	s.mux.HandleFunc("/api/devices", s.handleDevices)
	s.mux.HandleFunc("/api/devices/", s.handleDeviceSubroutes)

	s.mux.HandleFunc("/ws/device", s.handleDeviceWS)
	s.mux.HandleFunc("/ws/client", s.handleClientWS)
}

// Helper to write JSON responses
func writeJSON(w http.ResponseWriter, status int, data any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(data)
}

// Helper to write JSON errors
func writeError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, map[string]string{"error": message})
}

// Helper to extract JWT token from request header or query param
func (s *Server) extractToken(r *http.Request) string {
	authHeader := r.Header.Get("Authorization")
	if strings.HasPrefix(authHeader, "Bearer ") {
		return strings.TrimPrefix(authHeader, "Bearer ")
	}
	return r.URL.Query().Get("token")
}

// Helper to authenticate request
func (s *Server) authenticate(r *http.Request) (*auth.Claims, error) {
	tokenStr := s.extractToken(r)
	if tokenStr == "" {
		return nil, errors.New("missing authorization token")
	}
	return s.auth.ValidateToken(tokenStr)
}

func generateSecret() string {
	b := make([]byte, 24)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}
