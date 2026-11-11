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
  - Radii: `--radius` (`8px`) for buttons/inputs/pills; `--radius-card` (`12px`) for cards and modals.

---

## 2. Core UI Principles (Minimalism & Clarity)

1. **No Unnecessary Background Boxes ("Anti-Box Clutter")**:
   - Do NOT wrap secondary numbers, sizes, or inline status actions inside extra nested boxes, background fills, or borders on top of cards or popups.
   - *Approved pattern*: Display "Library Games Storage" size (`49.0 GB in 1 game`) directly on the card surface using typography hierarchy (`1.5rem` bold main figure + muted inline count), NOT inside a `var(--bg-main)` sub-box.
   - *Approved pattern*: In `ActiveTransferBanner`, render action labels (`Moving to Fast SSD`, `Evicting to HDD Master`, `Backing up to HDD Master`) as plain colored icon + text (`font-weight: 600`), without a boxed badge container or border.
2. **Zero Redundant Labels or Metadata**:
   - Omit text that merely restates what the visual layout or adjacent numbers already make clear.
   - Do NOT show raw internal library IDs (`ssd-0`, `hdd-0`) or verbose storage role descriptions (`Fast Cache Storage`) on top-level Overview cards.
   - Do NOT place redundant labels like `"Drive Used"` above capacity progress bars that already display percentage, `"Free: X GB"`, and `"Drive Capacity: Y GB"`.
   - On the **Dashboard Overview**, skip filler summary KPI boxes ("Total Games", "2 Drives") and lead immediately with **Drive Storage & Allocation**.
3. **Clear Click Affordance Without Heavy Buttons**:
   - Secondary navigation actions inside overview cards should NOT be boxed buttons when clean inline interaction fits better.
   - Make text actions unambiguously clickable using `var(--primary-text, var(--primary))`, `font-weight: 600`, clean hover state, and a trailing directional icon (`ArrowRight` from `lucide-react`, e.g. `Drive Details →`).
   - Rule of thumb: If an item uses directional arrow icons or explicit action verbs, it must be clickable; if it is plain informational metadata, omit the icon and styling.
4. **Consistent Formatting**:
   - Windows paths must start with uppercase drive letters (e.g., `D:\SteamLibrary`) via `normalizePath()`.
   - Library names must use clean friendly formatting (`Steam Library (C: Drive)`, `Games Library (D: Drive)`) via `formatLibraryName()`.
   - Sizes use 1-decimal GB / 2-decimal TB formatting via `formatBytes()`.

---

## 3. Information Architecture & Page Patterns

### A. Progressive Disclosure (Overview → Detail → Config)
Keep overview cards scannable while hosting technical details and management inside dedicated Detail pages:

- **Overview (`DashboardView`, `DrivesOverview`)**:
  - Card header: Subtle primary icon tile (`--primary-subtle`) + friendly drive name + `Drive Details →` trigger.
  - Primary stat: Library Games Storage (`X GB` in `N` games), unboxed.
  - Capacity bar: Right-aligned percentage (`60%`), full-width bar, footer row (`Free: X GB` left, `Drive Capacity: Y GB` right).
  - *Note*: Avoid duplicating a separate "Configured Storage Paths" section below drive cards; path inspection and editing belong inside each Drive Detail page.
- **Dedicated Detail Pages (`DriveDetailView`, `GameDetailView`)**:
  - Always include a clean borderless `← Back to ...` navigation link at the top left.
  - Here (and only here) show technical identifiers (`Library ID: ssd-0`, role label `Fast Cache Storage (SSD)` / `Master Storage (HDD)`), hardware vs. library breakdown, path configuration inputs (synchronized with Setup Wizard / core `registerLibraries`), and a searchable list of items on that drive/game.

### B. Transfer Queue & History (`QueueMonitor`)
- Separate active transfers (`running`, `queued`) from historical outcomes (`succeeded`, `failed`, `cancelled`).
- Provide segmented tabs: **All Transfers**, **Active Queue** (with active count pill), and **History**.
- Always sort History **newest-first** (`completed_at || created_at`). Never drop currently running transfers by slicing raw FIFO/oldest-first backend arrays.
- Detail each row clearly:
  - Active jobs: game title, clean colored action indicator (no heavy border), target library code, start timestamp, transferred vs. total bytes, progress bar, and Cancel action.
  - History rows: status icon (`CheckCircle2`, `AlertCircle`, `XCircle`), friendly action type, byte size, target library, uppercase status word (`SUCCEEDED` / `FAILED` / `CANCELLED`), completion timestamp, and a clean `--danger-subtle` diagnostic block if `job.error` is present.

### C. Iconography & Navigation
- Use custom SVG sprites in `ZappIcon.tsx` (`home`, `games`, `folder`, `queue`, `log`, `settings`, etc.) for Sidebar navigation and branding.
- Use `lucide-react` (`size={14}` to `size={20}`) for inline contextual UI controls, arrows, search inputs, and status indicators.

---

## 4. Mandatory Living-Skill Maintenance Protocol

Whenever you finish any UI change (`desktop/src/**`, `desktop/src/index.css`, or `mobile/.../ui/**`):

1. **Audit your changes** against Section 2 (Anti-Box Clutter, Zero Redundancy, Clear Click Affordance) and Section 1 (Tokens in Light & Dark mode).
2. **Verify visually & in tests**: Update component unit tests in `desktop/src/test/` and ensure `npm --prefix desktop test`, `npm --prefix desktop run lint`, and `just check` pass.
3. **Update this skill (`SKILL.md` / `references/`)** in the same task/PR if you:
   - Introduced or changed a reusable component or view pattern.
   - Adjusted color tokens, spacing, or typography.
   - Received user design feedback changing how elements are styled, grouped, hidden, or worded.
   - Add a brief line in the changelog below summarizing the UI rule evolution.

### Design Evolution Log
- **v0.3.2**: Adopted official Volt & Ink palette (`tokens.json`), light/dark/system themes, accessible `--primary-text` pairing, custom SVG `ZappIcon` suite, and unboxed game card cover alignment.
- **v0.3.3-beta.1**: Removed dashboard KPI clutter boxes, removed library ID / role subtitles from overview cards, stripped nested background boxes from Library Games Storage numbers and `ActiveTransferBanner` action labels, removed redundant `"Drive Used"` labels, added `Drive Details →` borderless clickable text triggers, introduced `DriveDetailView` (with hardware metrics, per-drive game inventory, and synchronized path configuration), removed bottom "Configured Storage Paths" panel, and revamped `QueueMonitor` with Active Queue + newest-first History tabs.
