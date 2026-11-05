# Plan 030: Core Logging, Global Progress Tracking, and Status Notifications

## Motivation
1. **Background Observability**: `zapp-core` previously wrote logs only to `os.Stdout`, which is detached/discarded when running in headless tray mode or spawned by desktop. A persistent log file and API log endpoint are required to diagnose issues.
2. **Transfer Progress Visibility**: When a game swap, backup, or evict is queued, progress was only visible inside the "Transfer Queue" tab. Users on the Dashboard or Games Library had no visible feedback that a transfer was in progress.
3. **Failure & Status Notifications**: When a transfer finishes or fails (e.g. disk full, exit code 8, path guard failure), no notification was presented. Users need immediate notifications with actionable failure reasons.

## Scope

### 1. API Contract Update (`api/openapi.yaml`)
- Add `GET /logs`:
  - Query parameter: `limit` (int, default 200, max 1000).
  - Returns `{ lines: string[] }`.

### 2. Core Service Logging (`core/`)
- Persistent log file in `%APPDATA%\Zapp-Swap-Manager\logs\zapp-core.log` (rotated to `.1` at 5MB).
- `MultiWriter` writes to both `os.Stdout` (for terminal dev) and file.
- Thread-safe ring buffer (latest 1,000 log lines) in memory to serve `GET /logs` swiftly.
- Windows tray icon adds **"Open Logs Folder"** (`%APPDATA%\Zapp-Swap-Manager\logs`).

### 3. Global Transfer Progress Bar (`desktop/`)
- **Global Active Task Banner**: When any transfer job is active, render a sleek sticky progress banner at the top of the content area across all routes (Dashboard, Games Library, Drives, Queue, Settings, Logs).
- Displays: Game name, action type (Promoting to SSD, Backing up to HDD, Evicting to HDD), progress bar, percentage, transferred/total bytes, and a cancel button.
- **Card-level Indicator**: On `GameCard.tsx`, display an active progress bar and spinning indicator on cards with an active job.

### 4. Status Notification Toasts (`desktop/`)
- Toast notification system (`ToastContainer.tsx`):
  - **Success Toast**: Triggered when a job transitions to `succeeded` (`"Backed up [Game] to HDD master"`).
  - **Error Toast**: Triggered when a job transitions to `failed` (`"Transfer failed for [Game]: [job.error]"` with link to "View Logs").
  - **Cancellation Toast**: Triggered when a job is cancelled.
- Web Notification API integration: Dispatches native OS notifications when the window is in the background or minimized.

### 5. In-App Desktop Log Viewer (`desktop/`)
- Add **Logs** route to the sidebar navigation.
- Terminal-style log viewer with auto-scroll, search filter, level filter (Info, Warn, Error), Copy to Clipboard, and "Open Logs Folder" button.

## Verification
- Unit tests for Core logger and `GET /logs` handler.
- Unit tests for Desktop Toast and Progress Banner components.
- Run `just check` across all modules.
