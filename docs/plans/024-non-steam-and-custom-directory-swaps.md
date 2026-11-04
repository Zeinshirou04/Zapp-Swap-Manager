# Plan 024: Non-Steam and Custom Game Swapping

## Motivation
Users often have games and large folders that are not registered on Steam via standard `appmanifest_<appid>.acf` files, such as:
1. Standalone / custom games stored in Steam directories (e.g. `BlueArchive`, `Excalibur`, `The Forest`, `FPSAimTrainer`).
2. Games from external launchers (Epic Games Store, Battle.net, HoYoverse, GOG, Game Pass, emulators).
3. Games with missing manifests.

Currently, Zapp Swap Manager's safety model and API strictly require Steam App IDs and manifest swapping. This plan specifies an architectural extension to support custom/non-Steam folders safely.

---

## Safety Model for Non-Steam Swaps

### 1. Registration & Identification
- Rather than an App ID, custom folders use a unique identifier (e.g. `custom-<hash>`) and a user-assigned display name.
- Custom game sources and targets must reside within declared, whitelisted library folders or explicit custom paired directories (never arbitrary filesystem roots like `C:\` or `C:\Windows`).

### 2. Move Sequence
Unlike Steam games which swap `.acf` files to re-point the Steam client:
- **Evict (SSD -> HDD)**:
  1. Robocopy mirror from SSD source to HDD destination.
  2. Verification: Compare file count and total byte size.
  3. Seamless Linking: Replace SSD directory with an NTFS Directory Junction (`mklink /J`) pointing to the HDD target, or remove the SSD folder. (Junction allows launchers and desktop shortcuts to continue working without reconfiguration).
- **Promote (HDD -> SSD)**:
  1. Remove junction on SSD if present.
  2. Robocopy copy from HDD backup to SSD.
  3. Verify file count and size match.
  4. Keep HDD copy as master archive.

### 3. Guard Rails
- Refuse if source is missing or empty.
- Refuse if target disk has insufficient free space.
- Reject system directories, program files root, or parent library roots.

---

## Proposed API Contract Extensions (`api/openapi.yaml`)
1. **`GET /custom-games`**:
   - Scans detected unmanifested directories inside known libraries, or lists manually tracked custom folders.
2. **`POST /custom-games`**:
   - Registers a custom game folder by name and path.
3. **`POST /jobs`**:
   - Extends `CreateJobRequest` to accept `custom_game_id` alongside `app_id`.

---

## Phases
1. **Phase 1: Core Detection of Unmanifested Common Folders**:
   - Detect folders inside `<library>/steamapps/common/` that lack a corresponding `appmanifest_*.acf`.
2. **Phase 2: Custom Directory Job Executor in Core**:
   - Implement Robocopy transfer + junction linking for non-Steam folders.
3. **Phase 3: Desktop UI & Mobile Support**:
   - Surface non-Steam games under a "Custom / Non-Steam" filter tab in the dashboard.
