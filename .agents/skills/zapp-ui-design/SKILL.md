---
name: zapp-ui-design
description: >-
  Zapp Swap Manager's living UI/UX design system, layout principles, and Volt & Ink token standards.
  Use whenever creating, revising, or reviewing UI components, pages, styles, or themes in desktop/ or mobile/.
  MANDATORY: Update this skill after every UI change so future design work retains and evolves all design decisions.
---

# Zapp Swap Manager — UI/UX Design Guidelines

This is a **living design skill**. Because the product UI evolves continuously through real user feedback, every UI update in `desktop/` or `mobile/` must follow these guidelines **and** update this skill when new conventions, patterns, or preferences are established.

## 1. Visual Language & Color System ("Volt & Ink")

All surfaces, text, borders, and accents must derive from semantic CSS variables (in `desktop/src/index.css`, matching `docs/assets/Zapp-Brand-Tokens/tokens.json`).
See [tokens-and-classes.md](./references/tokens-and-classes.md) for exact hex values across Light and Dark modes.

- **Never hardcode hex colors** for backgrounds, borders, or copy in components. Always use tokens like `var(--bg-main)`, `var(--bg-card)`, `var(--text-main)`, `var(--text-muted)`, `var(--border-color)`.
- **Respect Light, Dark, and System Auto** (`prefers-color-scheme`): ensure high contrast on every interactive label and metric in both `[data-theme="light"]` and `[data-theme="dark"]`.
- **Accessible Accent Pairing**:
  - Use `var(--primary-text)` (`#6246EA` in Light, `#9F9EFE` in Dark) for colored links, text triggers, and purple inline copy so text stays legible against `#1C1B20`/`#27262B` dark surfaces.
  - Reserve `var(--primary)` (`#6246EA`) for solid fills (`.btn-primary`, progress bars) paired with `var(--on-primary)` (`#FFFFFF`).
- **Geometry & Typography**:
  - Font: `'Inter'` for UI copy; `ui-monospace` inside `<code>` or filesystem path inputs.
  - Radii: `--radius` (`8px`) for buttons/inputs/pills; `--radius-card` (`12px`) for elevated cards and modals.

---

## 2. Core UI Principles (Minimalism, Restraint & Clarity)

1. **Do Not Overuse Card Backgrounds ("Not Every Card Needs a Background")**:
   - **Never wrap every section or detail block in `.card` background boxes.** Over-boxing flattens visual hierarchy and creates boxy clutter.
   - Reserve `--bg-card` surfaces purposefully for **interactive item grids** (Drive Overview cards, Game cards, Path Configuration interactive forms, floating banners/popups).
   - **Read-only detail sections & Settings groups should stay backgroundless (flat on `--bg-main`)**:
     - Game Details sub-sections (**Current Storage Path**, **Game & Backup Status**, **Activity & Runtime**, **Media & Captures**): transparent surface, clean section heading + icon, subtle hairline borders (`1px solid var(--border-color)`) if needed—no `.card` fill.
     - Drive Details stats (**Hardware Capacity**, **Library Games Allocation**): sit directly on `--bg-main` canvas, while interactive **Storage Path Configuration** and **Game item cards** keep `--bg-card` surfaces.
     - **Settings & Preferences**: All sub-settings groups (**Preferences**, **Appearance**, **Robocopy Config**, **Core Service & Security**, **App Updates**) render flat without `.card` background boxes, separated by spacing and crisp `border-bottom` dividers.
   - Inside cards and popups, do NOT wrap secondary numbers, sizes, or inline status actions inside nested boxes (`var(--bg-main)` containers or bordered badges). Display figures and colored icon + text directly on the surface.
2. **Zero Redundant Labels or Metadata**:
   - Omit text that merely restates what the visual layout or adjacent numbers already make clear.
   - Do NOT show raw internal library IDs (`ssd-0`, `hdd-0`) or verbose storage role descriptions (`Fast Cache Storage`) on top-level Overview cards.
   - Do NOT place redundant labels like `"Drive Used"` above capacity progress bars that already display percentage, `"Free: X GB"`, and `"Drive Capacity: Y GB"`.
   - On the **Dashboard Overview**, skip filler summary KPI boxes ("Total Games", "2 Drives") and lead immediately with **Drive Storage & Allocation**.
   - Avoid repeating the parent context in action triggers (e.g., use **`Details →`** instead of `"Drive Details →"`).
3. **Clear Click Affordance Without Heavy Buttons**:
   - Navigation triggers inside overview or detail cards should NOT be boxed buttons when clean inline interaction fits better.
   - Make text actions unambiguously clickable using `var(--primary-text, var(--primary))`, `font-weight: 600`, hover state, and a trailing directional icon (`ArrowRight` from `lucide-react`, e.g. `Details →`).
   - Rule of thumb: If an item uses directional arrow icons or explicit action verbs, it must be clickable; if it is plain informational metadata, omit the icon and styling.
4. **Consistent Formatting & Temporal Precision**:
   - Windows paths must start with uppercase drive letters (e.g., `D:\SteamLibrary`) via `normalizePath()`.
   - Library names use friendly naming (`Steam Library (C: Drive)`, `Games Library (D: Drive)`) via `formatLibraryName()`.
   - Sizes use 1-decimal GB / 2-decimal TB formatting via `formatBytes()`.
   - **Relative vs Exact Time**: Hero/overview headers show friendly relative time (`Today`, `Yesterday`, `3 days ago` via `formatLastPlayed()`), whereas **Activity & Runtime** detail blocks show the **exact localized date & time** (`formatExactTimestamp()`).

---

## 3. Information Architecture & Page Patterns

### A. Notion-Style Hero Banners & Portrait Grid Covers
- **Game Artwork Standards**:
  - Game cards (`GameCard` in **Games Library** and **Drive Details**) and the `GameDetailView` foreground cover use **portrait Grid** artwork (`2:3` aspect ratio via Steam CDN `library_600x900_2x.jpg` / `library_600x900.jpg`, with `header.jpg` fallback and `cover_url` override).
  - Hero banners are managed **separately** via `banner_url` (wide landscape artwork). Resolution falls back cleanly in order: custom `banner_url` -> Steam `library_hero.jpg` -> portrait Grid cover (`cover_url`).
  - Use the dedicated **Edit Artwork** trigger in `GameDetailView` (`ArtworkEditorModal`) to configure Grid Cover (`2:3`) and Hero Banner separately via remote HTTP(S) URL, multipart local file upload (`POST /games/{app_id}/artwork`), or **Reset / Use Default** — never accept raw local filesystem path strings over API JSON.
- **`GameDetailView` Layout**:
  - **Notion-Style Hero Banner**: Full-width banner image across the top with an acrylic glass layer (`backdrop-filter: blur(28px)` + translucent dark/light surface gradient) fading cleanly into the page background. Layered over the hero canvas sit the foreground **2:3 Grid cover**, Title (`<h1>`), App ID, Size, relative **Last Played** (`Today`), and swap action buttons (`Backup to HDD`, `Evict to HDD`, `Promote to SSD`).
  - **Clean Title Area**: Do NOT place status badges (`Fast SSD Cache`, `Steam Game`, `Backup Verified`, `Native HDD`) above or beside the hero title. Consolidate all status badges inside the **Game & Backup Status** detail section below.
  - **Detail Grid**: Render **Current Storage Path**, **Game & Backup Status**, **Activity & Runtime** (with exact date/time), and **Media & Captures** (`GameCapturesSection`) flat on `--bg-main` (no section wrapper card box).
  - **Media & Captures (`GameCapturesSection` & `CaptureViewerModal`)**: Auto-detect ShareX screenshots and NVIDIA ShadowPlay videos/screenshots in a flat responsive `16:9` thumbnail gallery (`All` / `Images` / `Videos` segmented filter, source badge pill, and one-click **Copy** image button writing RGBA bitmap to Windows clipboard via `@tauri-apps/plugin-clipboard-manager`). Clicking any item opens `CaptureViewerModal` (`role="dialog"`, `.card` surface over darkened backdrop) with full-size image Lightbox or HTML5 `<video controls>` byte-range player, `Matched via` attribution (`ShadowPlay Game Folder`, `ShareX History Tags`, `Filename Match`, `Custom Alias`), keyboard `ArrowLeft`/`ArrowRight`/`Escape` navigation, and inline **Match Aliases** management.

### B. Drives & Per-Drive Games (`DrivesOverview`, `DriveDetailView`)
- **Overview Cards**: Keep `--bg-card` surface, icon tile, friendly name, **`Details →`** text link, unboxed Library Games Storage figure, percentage bar without `"Drive Used"` text, and `Free` / `Drive Capacity` footer.
- **`DriveDetailView`**:
  - Clean borderless `← Back to Drives` trigger, drive title + technical Library ID & role subtitle (`Fast Cache Storage (SSD)` / `Master Storage (HDD)`).
  - **Hardware Capacity** & **Library Games Allocation**: Render flat without card background boxes.
  - **Storage Path Configuration**: Render inside a `.card` surface to distinguish the interactive settings panel.
  - **Games Stored on this Drive**: Render cards using the **Games Library `GameCard` visual layout** (`2:3` portrait Grid artwork + card surface background), replacing swap action buttons with a clean **`Details →`** text link matching `DrivesOverview`.

### C. Transfer Queue & History (`QueueMonitor`)
- Separate active transfers (`running`, `queued`) from historical outcomes (`succeeded`, `failed`, `cancelled`).
- Provide segmented tabs: **All Transfers**, **Active Queue** (with active count pill), and **History**.
- Always sort History **newest-first** (`completed_at || created_at`). Never slice away running jobs.

### D. Settings & Preferences (`SettingsView`)
- Organize into clean, **flat (no card background boxes)** sub-settings sections separated by spacing and subtle hairline dividers (`border-bottom: 1px solid var(--border-color)`):
  1. **Preferences**: Steam transfer lifecycle automation & Windows startup behavior.
  2. **Appearance**: Light / Dark / System theme switcher.
  3. **Robocopy Transfer Engine**: Multi-threading (`/MT:1..128`), retries (`/R`), wait delay (`/W`), and unbuffered I/O (`/J`) synced with core Preferences.
  4. **Media & Captures**: Auto-detected ShareX & NVIDIA ShadowPlay source toggles, detected paths readout, and extra whitelisted custom capture folders.
  5. **Core Service & Security**: Daemon URL, bearer token, test & restart actions.
  6. **App Updates**: Installed version and update check action.

### E. Iconography & Navigation
- Use custom SVG sprites in `ZappIcon.tsx` (`home`, `games`, `folder`, `queue`, `log`, `settings`, etc.) for Sidebar navigation and branding.
- Use `lucide-react` (`size={14}` to `size={20}`) for inline contextual controls, arrows (`ArrowRight`), search inputs, and status indicators.

---

## 4. Mandatory Living-Skill Maintenance Protocol

Whenever you finish any UI change (`desktop/src/**`, `desktop/src/index.css`, or `mobile/.../ui/**`):

1. **Audit your changes** against Section 2 (Anti-Background Clutter, Zero Redundancy, Clear Click Affordance) and Section 1 (Tokens in Light & Dark mode).
2. **Verify visually & in tests**: Update component unit tests in `desktop/src/test/` and ensure `npm --prefix desktop test`, `npm --prefix desktop run lint`, and `just check` pass.
3. **Update this skill (`SKILL.md` / `references/`)** in the same task/PR if you:
   - Introduced or changed a reusable component or view pattern.
   - Adjusted color tokens, spacing, or typography.
   - Received user design feedback changing how elements are styled, grouped, hidden, or worded.
   - Add a brief line in the changelog below summarizing the UI rule evolution.

### Design Evolution Log
- **v0.3.2**: Adopted official Volt & Ink palette (`tokens.json`), light/dark/system themes, accessible `--primary-text` pairing, custom SVG `ZappIcon` suite, and unboxed game card cover alignment.
- **v0.3.3-beta.1**: Removed dashboard KPI clutter boxes, removed library ID / role subtitles from overview cards, stripped nested background boxes from Library Games Storage numbers and `ActiveTransferBanner` action labels, removed redundant `"Drive Used"` labels, added directional link triggers, introduced `DriveDetailView`, and revamped `QueueMonitor` with Active Queue + newest-first History tabs.
- **v0.3.3-beta.2**: Codified "Not Every Card Needs a Background" across detail sections and flat Settings groups; upgraded `GameDetailView` to a Notion-style acrylic Hero banner + `2:3` portrait Grid artwork with exact timestamp in Activity & Runtime and consolidated status pills inside Game & Backup Status; shortened `"Drive Details →"` to `"Details →"`; styled `DriveDetailView` game cards after `GameCard` (`2:3` portrait grids with `Details →`); added `Robocopy Transfer Engine` sub-section in flat `SettingsView`.
- **v0.3.3-beta.3 (Plan 055)**: Added `95–99%` phase labels (`Finishing file copy...`, `Verifying file integrity...`, `Finalizing manifest & cleanup...`) and failed stop percentages in `QueueMonitor`; locked `GameDetailView` Settings save with an inline warning when a transfer job is queued or running; added startup elevation/UIPI warning toast in `App.tsx` backed by `win_frame.rs` genuine Win32 border frame subclassing.
- **v0.3.3-beta.4 (Plan 056)**: Separated Grid Cover (`cover_url`) and Hero Banner (`banner_url`) with default Hero -> Steam `library_hero` -> Grid cover fallback; added `ArtworkEditorModal` (**Edit Artwork** button in Hero top bar) supporting separate URL inputs, local PNG/JPEG/WebP/GIF uploads via `POST /games/{app_id}/artwork`, and reset controls across both Steam and Custom games.
- **v0.3.3-beta.5 (Plan 057)**: Added live Media & Captures (`GameCapturesSection`) in `GameDetailView` with `All`/`Images`/`Videos` filtering, ShareX & NVIDIA ShadowPlay source badges, one-click Windows clipboard image copy (`Copy`), `CaptureViewerModal` image Lightbox & `<video controls>` player, inline **Match Aliases** editor, and a **Media & Captures** sub-section in `SettingsView`.
