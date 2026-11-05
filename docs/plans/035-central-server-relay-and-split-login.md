# Plan 035: Central Homeserver Relay, Account Authentication, and Laravel-Style Split Login

## Context & Objectives
1. **Homeserver WebSocket Relay**:
   - Replace complex Cloudflare Tunnel token sharing and firewall port-forwarding with a central relay architecture.
   - Deployed on user's homeserver (or VPS/cloud) under a public tunnel hostname (e.g. `https://zapp.example.com`).
   - Windows Gaming PC (`zapp-core`) establishes a single outbound WebSocket connection (`wss://zapp.example.com/ws/device`), effortlessly traversing NAT and CGNAT.
   - Mobile and Desktop apps connect to the central server via REST and WebSocket.
2. **Account Authentication**:
   - Simple email & password login with JWT bearer authentication.
   - Users register once; all gaming PCs and mobile phones authenticate under the user's account.
   - Eliminates manual secret tokens and Cloudflare Access service tokens.
3. **Desktop UI: Laravel-Style Split Login View**:
   - Centered horizontal split card (`--radius`, modern drop shadow):
     - **Left Brand Panel**: Deep Royal Blue accent gradient, Zapp logo, tagline, server status badge, and aesthetic gaming artwork.
     - **Right Form Panel**: Clean light-mode-first form with Server URL, Email, Password, "Remember Me", "Sign In" button, and "Direct Local LAN Mode" toggle for offline or intranet usage.
4. **Relay Protocol**:
   - Server routes commands (`promote`, `evict`, `backup`, `cancel`) from authenticated clients down to the registered device.
   - Device streams real-time status and progress back up to the server, which broadcasts to connected clients.

## Architecture & Components

```
server/
├── cmd/
│   └── zapp-server/main.go         # Entry point: HTTP REST + WebSocket server
├── internal/
│   ├── auth/                       # Bcrypt password hashing & JWT signing/verification
│   ├── db/                         # SQLite database (Users, Devices, RefreshTokens)
│   ├── relay/                      # Thread-safe WebSocket Hub (Device & Client registries)
│   └── api/                        # Handlers (/auth/register, /auth/login, /devices, /ws)
├── Dockerfile                      # Production container for homeserver
└── docker-compose.yml              # Easy one-click deployment with persistent volume

core/
└── internal/
    └── relay/
        └── client.go               # Outbound WebSocket client connecting to homeserver

desktop/
└── src/
    ├── components/
    │   └── LoginView.tsx           # Laravel-style split card login interface
    └── api/
        └── server.ts               # Client for homeserver auth and device pairing
```

## Phased Implementation
- **Phase 1: `server/` Central Service**
  - Initialize `server/go.mod` (Go 1.22+).
  - Implement SQLite store (`server/internal/db/`) for users, devices, and tokens.
  - Implement Auth package (`server/internal/auth/`) with bcrypt and JWT.
  - Implement WebSocket Hub (`server/internal/relay/`) routing device-to-client and client-to-device messages.
  - Implement REST routes & WebSocket upgrader (`server/internal/api/`).
  - Add comprehensive unit tests and Dockerfile.
- **Phase 2: Desktop Laravel-Style Split Login View**
  - Implement `desktop/src/components/LoginView.tsx` with split brand card layout.
  - Connect login to server API, store JWT session in secure localStorage.
  - Provide seamless toggle between "Cloud / Homeserver Mode" and "Direct Local Mode".
- **Phase 3: Core Daemon Relay Client**
  - Implement `core/internal/relay/client.go` to connect outbound WebSocket when homeserver is configured in preferences.
  - Route incoming remote jobs to existing queue executor and stream progress back.
- **Phase 4: Mobile Integration & Verification**
  - Update OpenAPI specification and verify `just check`.

## Verification
- Unit & integration tests for `server/` (`cd server && go test -v ./...`).
- Desktop build & lint (`cd desktop && npm run lint && npm run build && npm test`).
- Full repository check with `just check`.
