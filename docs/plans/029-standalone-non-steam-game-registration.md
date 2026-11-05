# Plan 029: Standalone Non-Steam Game Folder Registration & Swapping

## Motivation
Currently, Zapp Swap Manager discovers non-Steam games by scanning `<library>/steamapps/common/`. However, users frequently keep standalone games, launcher directories (Epic Games, Riot Games, Battle.net, GOG, HoYoverse), or custom directories outside Steam (e.g. `D:\Games\Genshin Impact`, `C:\Riot Games\VALORANT`, `D:\Epic Games\Cyberpunk 2077`).

To support separate directories safely while adhering to the core security model (`docs/safety.md`), we need:
1. **Generic Non-Steam Library Scanning**: Support whitelisted library folders that do not follow the Steam directory structure (scanning `<library>/<game>` directly when `steamapps/common` is not present).
2. **Individual Custom Game Registration (`POST /custom-games`)**: Allow users to register any standalone game folder on their SSD and pair it with a whitelisted HDD library for backups and directory junction swaps.
3. **Desktop UI Integration**: An "Add Game Folder" dialog in the desktop dashboard allowing users to register and manage standalone games easily.

---

## Architecture & Safety Specification

### 1. Core Changes (`core/`)
- **Library Resolution Seam**:
  In `core/internal/transfer/guards.go`, update `gameFolder(libRoot, installDir)`:
  - If `<libRoot>/steamapps/common` exists: return `filepath.Join(libRoot, "steamapps", "common", installDir)`.
  - Else: return `filepath.Join(libRoot, installDir)`.
- **Scanner Update**:
  In `core/internal/steam/scanner.go`:
  - When scanning each whitelisted library, if `<libRoot>/steamapps/common` does not exist, scan child subdirectories of `libRoot` directly as custom game candidates.
- **Config & API Contract**:
  - Extend `core/internal/config/config.go` with `CustomGames []CustomGameEntry` persisted in `config.json`.
  - Add API endpoints:
    - `POST /custom-games`: Body `{ name, path, target_library_id }`. Validates directory exists, is absolute, is not a root filesystem or system directory.
    - `DELETE /custom-games/{id}`: Unregisters a custom game (does not delete data on disk).
    - `GET /custom-games`: Returns all registered standalone games.
- **Job Execution**:
  - `EvictCustom` mirrors the game directory to `<hddLibrary>/steamapps/common/<installDir>` (or `<hddLibrary>/<installDir>`), verifies the match, deletes the SSD folder, and replaces it with an NTFS Directory Junction (`mklink /J`) pointing to the HDD copy.
  - `PromoteCustom` removes the junction on SSD, copies from HDD to SSD, and verifies the match.

### 2. Desktop Dashboard (`desktop/`)
- In `desktop/src/components/GameList.tsx`:
  - Add an **"Add Game Folder"** button when on the "Non-Steam" tab or header.
  - Add `AddCustomGameModal.tsx` allowing the user to:
    - Enter a Game Display Name.
    - Enter / browse a standalone game folder path.
    - Select target HDD master library.
    - Submit to `POST /custom-games`.
- Update API client in `desktop/src/api/client.ts` with `addCustomGame`, `removeCustomGame`, and `listCustomGames`.

### 3. Silent Process Execution (`CREATE_NO_WINDOW`)
- Prevent console window popups / cmd flashes during Robocopy transfers, junction creation, and daemon commands on Windows.
- Add `hideConsole(cmd *exec.Cmd)` with `syscall.SysProcAttr{HideWindow: true, CreationFlags: 0x08000000}` in `transfer/proc_windows.go` (and no-op stub for Unix).
- Apply `hideConsole` to `runRobocopyReal`, `defaultCreateJunction`, and `tray_windows.go`.

---

## Verification Plan
1. Unit tests for `gameFolder` and scanner with non-`steamapps` directories.
2. Unit and API integration tests for `POST /custom-games`, `DELETE /custom-games/{id}`, and job execution.
3. Desktop unit tests for `AddCustomGameModal.tsx` and `GameList.tsx`.
4. Run `just check`.
