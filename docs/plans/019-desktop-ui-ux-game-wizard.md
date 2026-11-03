# Plan 019: Desktop UI/UX Overhaul & Step-by-Step Game Management Wizard

## Goal
Transform the desktop application into a rich, intuitive gaming dashboard with a guided step-by-step Steam library setup wizard, prominent action buttons ("Add / Configure Libraries", "Scan Steam Games"), Steam cover art cards (`https://cdn.akamai.steamstatic.com/steam/apps/<appid>/header.jpg`), and an informative Swap / Evict step-by-step confirmation modal with drive space visualization.

## Scope
Folder: `desktop`
Branch: `feat/desktop-ui-ux-game-wizard`

## Steps
0. **Branch Setup**:
   Ensure local `main` is up to date, then check out the task branch:
   ```bash
   git checkout main
   git pull
   git checkout -b feat/desktop-ui-ux-game-wizard
   ```
1. **Guided Steam Library Setup Wizard (`desktop/src/components/LibraryWizardModal.tsx`)**:
   - Triggered automatically on first run when 0 libraries are configured, or accessible via `[Configure Libraries]` button in the header.
   - **Step 1: Auto-Detect**: Calls `GET /libraries/detected` to automatically find Steam library folders across all drives with a single click. Allows manually adding any custom Steam library path.
   - **Step 2: Assign Drive Roles**: Clear, guided UI to designate:
     - **SSD Cache** (Fast play drive: NVMe / SSD).
     - **HDD Master** (Mass storage & backup: high-capacity HDD).
   - **Step 3: Save & Scan**: Calls `POST /libraries` to register whitelist and immediately triggers a game scan.
2. **Prominent Quick Action Bar**:
   - Header / Dashboard action bar with primary action buttons:
     - `[+ Configure Libraries]`: Opens the library setup wizard.
     - `[🔄 Scan Steam Games]`: Refreshes libraries and detected games with spin animation.
     - Drive status breakdown showing total/free space on both SSD and HDD with color-coded health meters.
3. **Rich Steam Game Cards & Table (`desktop/src/components/GameList.tsx`)**:
   - Add toggle between Grid (Cards with Steam capsule artwork) and Detailed Table view.
   - Embed official Steam artwork via `https://cdn.akamai.steamstatic.com/steam/apps/<appid>/header.jpg` with sleek fallback gradient.
   - Prominent status pills: `⚡ Ready on Fast SSD`, `💾 Stored on HDD Master`.
   - Distinct, descriptive action buttons:
     - `[🚀 Move to SSD]` (Promote)
     - `[💾 Evict to HDD]` (Safely mirror to HDD and free SSD space)
     - `[🔄 Backup to HDD]` (Sync SSD changes to HDD master)
4. **Step-by-Step Swap / Evict Confirmation Modal (`desktop/src/components/SwapConfirmModal.tsx`)**:
   - Replaces native browser `window.confirm()` with a modern, high-trust dialog:
     - Displays Game Title, App ID, and exact disk size.
     - Visual drive capacity meter: shows SSD and HDD free space before and after the proposed swap.
     - Safety guarantee checklist: highlights Robocopy verification step before SSD files are deleted.
     - "Confirm Transfer" button with loading spinner.
5. **Verification**:
   - Test wizard flow from 0 libraries to fully populated games list.
   - Test grid view and card artwork rendering.
   - Test confirmation modal for promote, evict, and backup actions.
   - Run `just check` to ensure all linters, formatting, and tests pass.

## Files to touch
- `desktop/src/components/LibraryWizardModal.tsx`
- `desktop/src/components/SwapConfirmModal.tsx`
- `desktop/src/components/GameCard.tsx`
- `desktop/src/components/GameList.tsx`
- `desktop/src/components/Header.tsx`
- `desktop/src/components/DrivesOverview.tsx`
- `desktop/src/App.tsx`
- `desktop/src/index.css`
- `docs/plans/019-desktop-ui-ux-game-wizard.md`

## Out of scope
- Core Robocopy transfer engine or manifest movements.
- Mobile client changes.

## Acceptance checks
- [x] `just check` passes cleanly
- [x] First run with no libraries presents the guided setup wizard
- [x] Auto-detect finds Steam libraries and allows assigning SSD/HDD roles
- [x] Game cards render Steam header artwork and clear action buttons
- [x] Swap confirmation modal presents drive space impact and safety guarantees
- [ ] PR created and merged to `main`

## Safety
Touches move/delete/manifest code? no. (UI only; invokes existing safe Core API endpoints).
