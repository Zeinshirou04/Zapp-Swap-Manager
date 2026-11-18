# Plan 061: Media Preview Polish, Dashboard Hierarchy, and App Updater Fixes

## Overview
This plan implements UI refinements across the media preview modal, fixes updater reliability and status reporting, and reorganizes the dashboard view so games are front and center.

## Key Changes
1. **Media Captures & Preview Refinement**:
   - Replaced bullet `•` styles on capture source badges with crisp SVG icons (`ZappIcon` `sharex`, `shadowplay`, and `custom-folder`).
   - Removed hardcoded black backgrounds from the lightbox/modal viewport, allowing the dialog card width to fit image/video content cleanly (`width: fit-content`, `maxWidth: min(94vw, 1100px)`).
   - Moved Previous (`<`) and Next (`>`) navigation buttons directly into `CustomImageViewer`'s floating control pill beside the zoom toolbar, eliminating redundant bottom modal footers.
   - Restructured modal header to cleanly display strictly: Title, Date, Size, Image counter (`X / Y`), Details toggle button, Copy Image, and Close.
   - Isolated window title, process name, and matching rule metadata into a collapsible secondary Details section.
   - Standardized video player to `16:9` widescreen aspect ratio (`maxWidth: min(90vw, 1080px)`) with transparent background.

2. **Dashboard Layout & Drive Simplification**:
   - Reordered `DashboardView`: **Active Games on SSD** sits at the very top as the primary hero section, with pinned games prioritized first.
   - Streamlined `DrivesOverview` cards: reduced card height to ~110px with a single combined metrics row (`Library Games Storage • X GB (N games)` alongside percentage), compact 6px progress bar, and drive capacity footer, preserving vertical space on the dashboard.

3. **App Update Feature Fixes**:
   - In `desktop/src/api/updater.ts`: Prevented error swallowing so network/check errors propagate correctly instead of reporting false positive "latest version".
   - In `desktop/src/components/SettingsView.tsx`: Added inline status indicator (`updateStatus`) with semantic icons (`CheckCircle2`, `AlertCircle`) directly adjacent to the "Check for Updates" button.
   - In `desktop/src-tauri/src/lib.rs`: Prevented prematurely killing `zapp-core.exe` at update download start; defer core termination to the non-blocking `on_before_exit` hook right when NSIS executes. Cleanly terminated core in `relaunch_app`.
