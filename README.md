# Game Swap Manager (`Zapp-Swap-Manager`)

[![CI](https://github.com/Zeinshirou04/Zapp-Swap-Manager/actions/workflows/ci.yml/badge.svg)](https://github.com/Zeinshirou04/Zapp-Swap-Manager/actions/workflows/ci.yml)
[![Release](https://github.com/Zeinshirou04/Zapp-Swap-Manager/actions/workflows/release.yml/badge.svg)](https://github.com/Zeinshirou04/Zapp-Swap-Manager/actions/workflows/release.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

A Windows tool that moves and backs up Steam games between a fast, capacity-limited **SSD** (acting as a hot cache for active games) and a massive **HDD** (acting as the cold master storage library), controlled seamlessly from your desktop or remotely from your mobile phone.

---

## Architecture Overview

```
                      +---------------------------------------+
                      |             Mobile Client             |
                      |       (Kotlin + Jetpack Compose)      |
                      |   Offline Room DB + WorkManager sync  |
                      +-------------------+-------------------+
                                          | (Cloudflare Tunnel + JWT)
+-----------------------------+           |
|        Desktop Client       |           |
|       (Tauri + React)       |           |
|   Dashboard & Job Monitor   |           |
+--------------+--------------+           |
               | (Local HTTP API)         |
               +--------------+-----------+
                              |
                              v
              +-------------------------------+
              |        api/openapi.yaml       |  <-- Single Source of Truth
              +---------------+---------------+
                              |
                              v
              +-------------------------------+
              |           core/ (Go)          |
              | * Background tray service     |
              | * ONLY component touching disk|
              | * Robocopy engine & Steam ACF |
              | * Transactional SQLite queue  |
              +-------------------------------+
```

### Component Breakdown

| Directory | Component | Stack | Description |
|---|---|---|---|
| [`core/`](file:///D:/Projects/zapp-swap-manager/core) | **Core Service** | Go | Background service with tray icon. The **only** part that touches the filesystem, manages Steam `.acf` manifests, executes Robocopy transfers, and maintains a journaled SQLite FIFO job queue. |
| [`desktop/`](file:///D:/Projects/zapp-swap-manager/desktop) | **Desktop Dashboard** | Tauri + React | Windows client for browsing games, monitoring drive space, configuring directories, and inspecting swap queue history. |
| [`mobile/`](file:///D:/Projects/zapp-swap-manager/mobile) | **Mobile Remote** | Kotlin + Jetpack Compose | Android app to trigger game swaps on the go. Communicates via Cloudflare Tunnel, caches snapshots in Room DB, and syncs hourly. |
| [`api/`](file:///D:/Projects/zapp-swap-manager/api) | **API Contract** | OpenAPI 3.0 | Strict contract specifying all endpoints, request payloads, and status codes. |
| [`docs/`](file:///D:/Projects/zapp-swap-manager/docs) | **Documentation** | Markdown | Safety rules ([`docs/safety.md`](file:///D:/Projects/zapp-swap-manager/docs/safety.md)), development workflow ([`docs/workflow.md`](file:///D:/Projects/zapp-swap-manager/docs/workflow.md)), and implementation plans. |

---

## Storage & Safety Model

Game Swap Manager enforces strict storage safety rules (detailed in [`docs/safety.md`](file:///D:/Projects/zapp-swap-manager/docs/safety.md)):

* **HDD is the Master Library**: The SSD is treated as an ephemeral cache. Backups keep the HDD copy in sync so evicting from the SSD is fast.
* **Manifest Swapping**: On the HDD, games live in `<HDD library>\steamapps\common\<installdir>` without a manifest. Only one library holds `appmanifest_<appid>.acf` at a time—the library where Steam considers the game installed.
* **Never Prematurely Delete**: Data on the SSD is never deleted until the destination HDD copy has completed verification (matching size and file count).
* **Guarded Robocopy**:
  - **Evict (SSD $\to$ HDD)**: Robocopy Mirror (`/MIR`) with dry run (`/L`) inspection. Refuses operation if file count/size drops >30%.
  - **Promote (HDD $\to$ SSD)**: Robocopy Copy (`/E`). The HDD copy is preserved as a permanent backup.
* **Transactional Queue**: Serial, FIFO job execution journaled in SQLite. Resilient across process restarts.

---

## Getting Started & User Guide

### 1. Steam Library Setup
Game Swap Manager expects two Steam library roles:
1. **SSD Cache Library** (e.g. `C:\Program Files (x86)\Steam` or `D:\SteamLibrary`):
   - Fast NVMe or SSD storage where games you are actively playing reside.
   - Games installed here have active `appmanifest_<appid>.acf` manifests and are directly playable via Steam.
2. **HDD Master Library** (e.g. `E:\SteamLibrary` or `F:\SteamMaster`):
   - High-capacity mechanical drive holding your full game collection and backups.
   - Games stored here live in `steamapps/common/<installdir>` without a manifest until promoted.

> [!TIP]
> Both library folders can be registered inside Steam (**Steam** $\to$ **Settings** $\to$ **Storage**). Game Swap Manager will automatically discover libraries from Steam's `libraryfolders.vdf`.

---

### 2. Core Background Service

The Core Service (`core/`) is the heart of Game Swap Manager. It is the **only** component with filesystem privileges: running verified Robocopy transfers, updating Steam manifests, and managing the SQLite FIFO job queue.

#### Starting the Core Daemon
- **Release Executable**: Double-click `zapp-core.exe` or run from PowerShell:
  ```powershell
  .\zapp-core.exe
  ```
- **From Source**:
  ```powershell
  just run-core
  ```

#### CLI Options
```
-config <path>    Path to custom JSON configuration file
-port <port>      Override API port (loopback only, default: 8765)
-headless         Run as a background daemon without the Windows tray icon
-version          Print service version and exit
```

#### Configuration (`config.json` & Environment Variables)
The Core Service reads `%APPDATA%\Zapp-Swap-Manager\config.json` (or can be configured via environment variables):

```json
{
  "bind_addr": "127.0.0.1:8765",
  "bearer_token": "your-secure-local-token",
  "cf_team_domain": "https://yourteam.cloudflareaccess.com",
  "cf_tag_audience": "your-cloudflare-access-audience-tag",
  "db_path": "%APPDATA%/Zapp-Swap-Manager/queue.db",
  "headless": false
}
```

| Setting | Environment Variable | Default | Purpose |
|---|---|---|---|
| `bind_addr` | `ZAPP_BIND_ADDR` | `127.0.0.1:8765` | Loopback address for the HTTP API (must be loopback). |
| `bearer_token` | `ZAPP_BEARER_TOKEN` | *Auto-generated* | Secret token for Desktop UI authentication. |
| `cf_team_domain` | `ZAPP_CF_DOMAIN` | `""` | Cloudflare Access team domain for JWT verification. |
| `cf_tag_audience` | `ZAPP_CF_AUDIENCE` | `""` | Cloudflare Access application AUD tag. |
| `db_path` | `ZAPP_DB_PATH` | `%APPDATA%/.../queue.db` | Path to persistent SQLite FIFO queue database. |
| `headless` | `ZAPP_HEADLESS` | `false` | Run without system tray icon. |

#### Windows System Tray
When running on Windows without `-headless`, `zapp-core.exe` sits in your system tray:
- **Tray Icon Tooltip**: Displays current status (*Idle*, *Swapping*, or active job details).
- **Right-Click Menu**: Quick access to open the Desktop Dashboard, inspect running tasks, or gracefully terminate the service.

---

### 3. Desktop Dashboard

The Desktop Dashboard (`desktop/`) is a fast Windows application (built with Tauri + React) to manage your game library with a click.

#### Running the Dashboard
- **Release Executable**: Launch `Zapp Swap Manager.exe` from the installed release package.
- **Development Mode**:
  ```powershell
  cd desktop
  npm run tauri dev
  ```

#### Dashboard Features & Operations
1. **Drive Storage Meters**: Visual progress bars showing available capacity on both your SSD Cache and HDD Master drives.
2. **Game Browser**:
   - Filter games by state: **Active on SSD**, **Storage on HDD**, or **All**.
   - Search by game title or Steam App ID.
3. **One-Click Swap Actions**:
   - **Promote to SSD**: Copies game data from HDD to SSD (`Robocopy /E`), verifies file integrity, and moves `appmanifest_<appid>.acf` so Steam recognizes the game as ready to play. The HDD copy is preserved as a permanent backup!
   - **Evict to HDD**: Runs an incremental dry-run check, mirrors changes to HDD (`Robocopy /MIR`), verifies file size and counts match, swaps the manifest, and frees the SSD cache.
   - **Backup Now**: Takes an instant incremental mirror from SSD to HDD without moving the manifest or deleting the SSD copy.
4. **Live Job Monitor**: View real-time transfer progress, speed, transferred bytes, and cancel queued or in-flight jobs.

---

### 4. Mobile Remote App (Android)

Manage your library remotely from your phone on the couch or on the go!

#### Installation
Download `zapp-mobile-android.apk` from the [Releases](https://github.com/Zeinshirou04/Zapp-Swap-Manager/releases) page and sideload it onto your Android device.

#### Cloudflare Tunnel Setup (Remote Access)
Because the Core Service strictly binds to `127.0.0.1` for security, remote connections route through a free **Cloudflare Tunnel** protected by **Cloudflare Access**:
1. Install and authenticate `cloudflared` on your PC:
   ```powershell
   cloudflared tunnel login
   cloudflared tunnel create zapp-tunnel
   ```
2. Configure tunnel ingress in `config.yml`:
   ```yaml
   tunnel: <your-tunnel-id>
   credentials-file: <path-to-credentials.json>
   ingress:
     - hostname: zapp.yourdomain.com
       service: http://127.0.0.1:8765
     - service: http_status:404
   ```
3. Start the tunnel:
   ```powershell
   cloudflared tunnel run zapp-tunnel
   ```
4. Create an Access Application in your Cloudflare Zero Trust dashboard with a Service Token or policy for your device.

#### Mobile App Configuration
1. Open the mobile app and navigate to **Settings**.
2. Enter your Cloudflare Tunnel hostname (`https://zapp.yourdomain.com`).
3. Enter your Cloudflare Access Service Token or Bearer token credentials.
4. **Offline Caching & Sync**: The app uses Room DB to store offline library snapshots. Even without an active connection, you can browse your game collection. An automated background worker (powered by Android WorkManager) refreshes library states hourly.

---

### 5. Storage Safety & Best Practices

To ensure 100% data integrity when swapping games, follow these operational best practices (detailed in [`docs/safety.md`](file:///d:/Projects/zapp-swap-manager/docs/safety.md)):

> [!IMPORTANT]
> **Steam State Recommendation**:
> - It is recommended to **exit Steam or pause game downloads/updates** before initiating a swap.
> - While Steam can remain open, Steam holds locks on active manifests and will not automatically detect newly placed manifests until restarted.
> - Never initiate a swap while a game is actively running.

- **Master Copy Preservation**: When promoting a game from HDD to SSD, the HDD files are **never deleted**. The HDD serves as your master backup.
- **Verified Eviction**: The SSD copy is deleted **only** after the destination copy is verified to match file count and size exactly, and the manifest has been relocated.
- **Crash & Power Loss Resilience**: Every transfer step is recorded in SQLite before and after execution. If power fails or the service restarts mid-transfer, the engine will safely resume or roll back from the journal without corrupting your game files.

---

## Releases & Packaging

Every release tag (`v*`) triggers automated GitHub Actions builds that publish complete standalone packages:

| Distribution Artifact | Format | Description |
|---|---|---|
| **Core Service** | `zapp-core-windows-x64.zip` | Standalone Go Windows service binary + tray executable. |
| **Desktop Dashboard** | `zapp-desktop-windows-x64.zip` | Tauri installer (`.msi` / `.exe`) for Windows. |
| **Mobile Application** | `zapp-mobile-android.apk` | Signed Android APK for sideloading on phones/tablets. |

To download the latest build, visit the [Releases](https://github.com/Zeinshirou04/Zapp-Swap-Manager/releases) page.

---

## Development Setup

### Prerequisites
- [Just](https://github.com/casey/just) command runner:
  ```powershell
  winget install Casey.Just
  ```
- **Go 1.22+** (for `core/`)
- **Node.js 20+** & **Rust** (for `desktop/` Tauri)
- **Android SDK & JDK 17** (for `mobile/`)

### Common Tasks
List all project recipes:
```powershell
just --list
```

Run test suites and linting across all modules:
```powershell
just check
```

---

## Contributing & Agent Workflow
This repository follows an **agent-assisted, plan-first workflow**:
1. All changes start with an approved plan in [`docs/plans/`](file:///D:/Projects/zapp-swap-manager/docs/plans).
2. Development is conducted on short-lived branches (`<type>/<scope>-<desc>`).
3. Commits follow the Conventional Commits specification.
4. Pull requests require all checks to pass (`ci-ok`) before squash-merging into `main`.
