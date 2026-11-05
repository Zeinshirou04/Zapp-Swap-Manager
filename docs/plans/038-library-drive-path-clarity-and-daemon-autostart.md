# Plan 038: Clarify Library Drive Path and Auto-Start Core Daemon

## Background & Issues Identified
1. **Confusing "Storage Library Location" terminology**:
   - In `AddGameModal.tsx`, the field label was "Storage Library Location *".
   - The dropdown only showed generic library names without the actual filesystem drive paths (`E:\Game`, `O:\Game`).
   - Users were confused about whether this represented a drive path or an internal identifier.
2. **Core Daemon Not Auto-Starting on Startup or Direct Local LAN Mode**:
   - `App.tsx` did not call `startCoreDaemon()` on initial launch or when clicking "Direct Local LAN Mode (Offline)".
   - If `zapp-core.exe` was killed or not yet running, clicking Direct Local LAN Mode silently failed without redirecting.
3. **Toast Notifications Not Visible on Login / Disconnected Screens**:
   - `<ToastContainer />` was rendered inside `dashboard-root`, which only mounted when `conn === 'authenticated'`.
   - Any connection or authentication errors could not be seen on the Login or Connect screens.

## Proposed Changes
1. **`desktop/src/components/AddGameModal.tsx`**:
   - Rename label from "Storage Library Location *" to "Drive / Library Path *".
   - Update dropdown options to display `{lib.name} — {lib.path} ({lib.type === 'ssd_cache' ? 'SSD Cache' : 'HDD Storage'})`.
   - Add a subtitle showing the selected base path: `Base Path: {selectedLib?.path}`.
   - Add a live preview under the Folder Path input showing the full target path: `Target Path: {selectedLib?.path}\{installDir}`.
2. **`desktop/src/components/GameDetailModal.tsx`**:
   - Display the filesystem path alongside the library name in the "Current Library" card: `{currentLib.name} ({currentLib.path})`.
3. **`desktop/src/App.tsx`**:
   - Import and call `startCoreDaemon()` on startup when connecting to loopback.
   - In `onDirectLocalMode`, invoke `startCoreDaemon()` and wait before calling `api.getHealth()`.
   - Move `<ToastContainer />` to the root render tree so notifications are visible on all screens.
4. **Verification**:
   - Run `just check` (Go tests, ESLint, TypeScript check, Vitest 49/49).
