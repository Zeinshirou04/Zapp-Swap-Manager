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
