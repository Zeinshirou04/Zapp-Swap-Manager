# Plan 028: Frameless Custom Titlebar (Remove Native OS Titlebar)

## Context
In Plan 027, we introduced a modern dashboard layout and a browser-style custom title bar (`desktop/src/components/Titlebar.tsx`). However, because `decorations: false` was not yet set in `tauri.conf.json`, Windows continued to render the native Windows OS title bar above our custom bar. This resulted in a stacked, default-looking window frame rather than the sleek, frameless appearance of modern desktop apps like VSCode, Discord, and Antigravity IDE.

## Goal
Remove the native operating system window title bar (`decorations: false`) and elevate `Titlebar.tsx` to be the primary frameless window header, complete with native-like window controls (Minimize, Maximize/Restore, Close) and drag region support.

## Changes
1. **`desktop/src-tauri/tauri.conf.json`**:
   - Set `"decorations": false` in `app.windows[0]`.
2. **`desktop/src-tauri/capabilities/default.json`**:
   - Ensure window management permissions are enabled:
     - `core:window:allow-close`
     - `core:window:allow-minimize`
     - `core:window:allow-toggle-maximize`
     - `core:window:allow-start-dragging`
     - `core:window:allow-is-maximized`
3. **`desktop/src/components/Titlebar.tsx`**:
   - Integrate Tauri window controls (`getCurrentWindow` from `@tauri-apps/api/window`):
     - Minimize button: triggers `appWindow.minimize()`
     - Maximize / Restore button: triggers `appWindow.toggleMaximize()` and tracks maximized state
     - Close button: triggers `appWindow.close()`
   - Style controls to match Discord / VSCode / modern Windows 11 styling:
     - 44px wide buttons flush with the right edge.
     - Close button with classic `#e81123` hover red.
     - Ensure drag handles and non-drag regions are properly separated.
4. **`desktop/src/test/Titlebar.test.tsx`**:
   - Add unit tests verifying Minimize, Maximize, and Close buttons are present, accessible, and invoke the expected handlers.

## Verification
- Run `npm test` and `just check`.
- Verify TypeScript types, Rust compilation, and ESLint pass without errors.
