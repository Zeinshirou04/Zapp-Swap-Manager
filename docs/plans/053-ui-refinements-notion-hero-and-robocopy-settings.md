# Plan 053: UI Refinements, Notion Hero Banner, Portrait Grids, and Robocopy Configuration

## Objectives
1. **Update UI Design Skill (`zapp-ui-design`) First**: Establish and document the anti-background rule ("not every card/section needs a background box"), Notion-style hero banners with portrait grids, concise button copy (`Details →`), and flat Settings sub-sections before implementing UI changes.
2. **Game Details View (`desktop/src/components/GameDetailView.tsx`)**:
   - **Notion-Style Hero & Blurred Acrylic Banner**: Full-width top hero banner using Steam `library_hero.jpg` (or fallback artwork) behind an acrylic layer (`backdrop-filter: blur(...)`), with portrait **Grid** cover art (`2:3`), title (`<h1>`), App ID, size, relative last played (`Today` / `formatLastPlayed`), and primary action buttons in the foreground.
   - **Consolidate Status Flags**: Remove status pills (`Fast SSD Cache`, `Steam Game`, `Backup Verified`, `Native HDD`) from above the title and move them into the **Game & Backup Status** detail section.
   - **Exact Timestamp in Activity & Runtime**: Keep relative `Last Played` (`Today`) under the title while displaying the exact localized date & time inside **Activity & Runtime**.
   - **Remove Card Backgrounds**: Remove `.card` surface boxes from **Current Storage Path**, **Game & Backup Status**, **Activity & Runtime**, and **Media & Captures** so sections sit cleanly on the page canvas with crisp typography and subtle dividers.
3. **Drives Overview & Drive Details (`DrivesOverview.tsx`, `DriveDetailView.tsx`)**:
   - Rename `Drive Details` trigger in `DrivesOverview` to concise **`Details →`**.
   - Remove `.card` backgrounds from **Hardware Capacity** and **Library Games Allocation** on `DriveDetailView` while retaining `.card` background on **Storage Path Configuration** and on **Game item cards**.
   - Redesign game item cards inside `DriveDetailView` to use the `GameCard` visual layout with portrait **Grid** cover (`2:3`) and a **`Details →`** text trigger instead of direct action buttons.
4. **Games Library Cards (`GameCard.tsx`, `GameList.tsx`, `utils/format.ts`)**:
   - Switch `GameCard` cover art in Games Library to portrait **Grid** (`2:3` aspect ratio via Steam `library_600x900_2x.jpg` / `library_600x900.jpg` with `header.jpg` fallback and `cover_url` support) while keeping quick swap action buttons.
5. **Robocopy Configuration & Flat Settings Layout (`api/`, `core/`, `SettingsView.tsx`)**:
   - Extend `Preferences` in `api/openapi.yaml` and `core/internal/config` with `robocopy_threads` (`/MT:1..128`), `robocopy_retries` (`/R:0..20`), `robocopy_wait_seconds` (`/W:0..60`), and `robocopy_unbuffered` (`/J`).
   - Pass configured Robocopy options through `transfer.Options` -> `RobocopyDriver` without altering safety guards.
   - Preserve omitted `Preferences` fields on `PUT /preferences` updates so partial clients do not clobber unrelated preferences.
   - Redesign `SettingsView.tsx` into clean, unboxed flat sections (**Preferences**, **Appearance**, **Robocopy Config**, **Core Service & Security**, **App Updates**) separated by subtle dividers instead of boxed cards.

## Safety
- Mirror and copy guard chains (`/L` dry-run before `/MIR`, verify match before manifest relocation & SSD deletion) remain completely untouched in `core/internal/transfer/sequences.go`.
- Only valid clamped Robocopy performance flags (`/MT:n`, `/R:n`, `/W:n`, `/J`) are constructed dynamically.
