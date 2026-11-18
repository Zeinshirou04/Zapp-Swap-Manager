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
  - **Notion-Style Hero Banner**: Full-width banner image across the top with an acrylic glass layer (`backdrop-filter: blur(28px)` + translucent dark/light surface gradient) fading cleanly into the page background. Hardware acceleration containment (`contain: paint; transform: translateZ(0)`) is applied to an isolated background wrapper with a solid underlay fade to eliminate subpixel clipping seams or sliver drag artifacts when scrolling down the page. Layered over the hero canvas sit the foreground **2:3 Grid cover**, Title (`<h1>`), App ID, Size, relative **Last Played** (`Today`), and primary action buttons (**Play Game** for installed SSD games, **Move to SSD** for HDD games, **Backup to HDD**, **Evict to HDD**).
  - **Clean Title Area & Action Hierarchy**: Do NOT place status badges (`Fast SSD Cache`, `Steam Game`, `Backup Verified`, `Native HDD`) above or beside the hero title. Consolidate all status badges inside the **Game & Backup Status** detail section below. The top action bar provides **Pin / Pinned** status toggle, **Play Game** primary trigger, **Edit Artwork**, and **Game Settings**.
  - **Detail Grid**: Render **Current Storage Path**, **Game & Backup Status**, **Activity & Runtime** (with exact date/time), and **Media & Captures** (`GameCapturesSection`) flat on `--bg-main` (no section wrapper card box).
  - **Custom Media Player Suite (`CaptureViewerModal`, `CustomImageViewer`, `CustomVideoPlayer`)**:
    - Auto-detect ShareX screenshots and NVIDIA ShadowPlay videos/screenshots in a flat responsive `16:9` thumbnail gallery (`All` / `Images` / `Videos` segmented filter, source badge pill with crisp SVG icon, and one-click **Copy** image button writing RGBA bitmap to Windows clipboard via `@tauri-apps/plugin-clipboard-manager`).
    - Source badges in both thumbnail grid and viewer modal use **crisp SVG icons** (`ZappIcon` `sharex`, `shadowplay`, `custom-folder`) — never bullet `•` prefixes.
    - Clicking any item opens `CaptureViewerModal` (`role="dialog"`, `.card` surface over darkened backdrop) with custom Volt & Ink viewers (no browser default media controls):
      - **Content-Fitted Dialog Dimensions**: Uses `width: 'fit-content'`, `maxWidth: 'min(94vw, 1100px)'`, and `backgroundColor: 'transparent'` for the media viewport, eliminating all hardcoded black letterbox frames and excess empty margins.
      - **Minimalist Header & Collapsible Details**: The top header strictly displays Title, Date, Size, counter (`1 / 5`), an **Info / Details** toggle button, Copy Image, and Close. Window title, process name, and match attribution are isolated in a separate collapsible details section, keeping the viewport clean.
      - **Image Viewer (`CustomImageViewer`)**: Interactive zoom (0.5x to 4x) via mouse wheel or floating controls, drag-to-pan when zoomed in, double-click reset/zoom, and one-click RGBA clipboard copy. **Previous (`<`) and Next (`>`) buttons are embedded directly into the floating overlay pill** beside the zoom controls, completely eliminating bottom modal footer clutter.
      - **Standardized Video Player (`CustomVideoPlayer`)**: Locked to a standard **`16:9` aspect ratio** container (`maxWidth: 'min(90vw, 1080px)'`) with transparent background, custom overlay controls with Play/Pause, **Jump -5s** and **Jump +5s** (`RotateCcw` / `RotateCw` with `5` badge) seek buttons, custom scrubber bar with elapsed/total duration, volume slider with mute toggle, fullscreen toggle, keyboard shortcuts (`Space`, `ArrowLeft`/`ArrowRight`, `m`, `f`), and expandable video trimming toolbar with Start/End markers.

### B. Drives & Per-Drive Games (`DrivesOverview`, `DriveDetailView`)
- **Overview Cards (`DrivesOverview`)**: Streamlined, compact design (~110px height, `padding: 12px 16px`). Compact drive icon (`FolderKanban`), friendly name, role badge, **`Details →`** text link, single combined metrics line (`Library Games Storage • X GB (N games)` alongside `Y%` usage), compact 6px progress bar, and `Free` / `Drive Capacity` footer. Eliminates oversized stacked boxes and large font headers to preserve vertical space on the Dashboard.
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

### F. Game Launch Priority & Pinning Hierarchy
- **Primary Action Priority**:
  - For games installed on the fast SSD (`active_ssd`), prioritize the **Play** button (`<Play size={14} fill="currentColor" /> Play`, `.btn-primary`) on `GameCard`s — keep storage actions (`Backup to HDD`, `Evict to HDD`, `Remove from SSD`) completely off grid cards.
  - For games in master HDD storage (`storage_hdd`), retain the **Move to SSD** primary action (`<Zap size={14} /> Move to SSD`, `.btn-primary`).
  - Inside `GameDetailView`, the Hero action row pairs **Play Game** (`.btn-primary`, `flex: 1`) with an adjacent **Storage Actions dropdown trigger** (`<ChevronDown />`, `.btn-secondary`, `data-testid="storage-actions-btn"`). Clicking the trigger opens a Volt & Ink menu (`role="menu"`) containing **Backup to HDD**, **Evict to HDD**, a divider, and **Remove from SSD** (disabled with explanation if `has_hdd_backup` is false). `SwapConfirmModal` presents tailored non-destructive HDD warnings and blocks removal when no verified HDD copy exists.
- **Pinning Hierarchy (`is_pinned`)**:
  - Each `GameCard` displays a subtle pin toggle button (`<Pin size={13} />`) in the top-right corner over the cover. When pinned, the button displays solid primary fill (`var(--primary)`).
  - Inside `GameList`, `DashboardView`, and `DriveDetailView`, pinned games **always sort first** ahead of unpinned games. Secondary sorting within pinned and unpinned groups remains alphabetical.
  - Table view in `GameList` includes a dedicated pin toggle column and a compact `Play` or `Move to SSD` button.
  - In `GameDetailView`, the top bar includes a **Pin Game** / **Pinned** toggle button with tooltip feedback.

### G. Dashboard Hierarchy (Games Top, Drive Storage Below)
- **Active Games First**:
  - The top hero section on `DashboardView` is **Active Games on SSD** (`<h1>Active Games on SSD</h1>`), showcasing the user's ready-to-play fast cache library and pinned games immediately without requiring scrolling.
  - Includes quick navigation trigger `View All Games (N) →` to jump straight to the library.
- **Compact Drive Storage & Allocation**:
  - Positioned below the games section with simplified, space-efficient drive cards (`DrivesOverview`).
  - Lowers card height to ~110px, consolidates library allocation and utilization into a single metric line, and keeps the full dashboard view readable above the fold.

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
- **v0.3.3-beta.6 (Plan 059)**: Prioritized direct `Play` action for SSD games and `Move to SSD` for HDD games; introduced game pinning with top-of-list ordering in grid and table views; fixed `GameDetailView` hero acrylic blur drag seam during scrolling via hardware-accelerated containment (`contain: paint; transform: translateZ(0)`); built custom Volt & Ink media player suite in `CaptureViewerModal` featuring interactive image zoom/pan/copy (`CustomImageViewer`) and custom video player (`CustomVideoPlayer`) with ±5s jump buttons, timeline scrubber, and expandable video trimming hooks.
- **v0.3.3-beta.4 (Plan 060)**: Moved `Backup to HDD`, `Evict to HDD`, and the new `Remove from SSD` action into a Volt & Ink dropdown menu beside `Play Game` in `GameDetailView` (with outer hero container keeping `zIndex: 10` while acrylic blur stays strictly contained on the `inset: 0` background wrapper so dropdown menus never clip); added dedicated non-overwriting HDD safety checklist & missing-backup guard in `SwapConfirmModal` for `remove` jobs.
