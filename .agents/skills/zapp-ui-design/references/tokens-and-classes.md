# Zapp Brand Color Tokens & CSS Reference

Authoritative token mapping between `docs/assets/Zapp-Brand-Tokens/tokens.json` and `desktop/src/index.css`.

## Brand Primitives
- **Zapp Ink**: `#1C1B20` (`--brand-ink`)
- **Volt**: `#6246EA` (`--brand-volt`)
- **Volt Light**: `#9F9EFE` (`--brand-volt-light`)

## Semantic Tokens Matrix

| Token Role | CSS Variable | Light Mode (`[data-theme="light"]`) | Dark Mode (`[data-theme="dark"]`) | Usage Notes |
| :--- | :--- | :--- | :--- | :--- |
| App Background | `--bg-main` | `#FAFAFC` | `#1C1B20` | Page canvas behind cards |
| Sunken Surface | `--bg-sunken` | `#F3F3F6` | `#0C0B10` | Recessed containers / log consoles |
| Card Surface | `--bg-card` | `#FFFFFF` | `#27262B` | Primary cards, sidebar, titlebar, dialogs |
| Raised Surface | `--bg-card-raised` | `#FFFFFF` | `#3D3C42` | Elevated overlays/popovers |
| Hover Surface | `--bg-card-hover` | `#F3F3F6` | `rgba(255, 255, 255, 0.05)` | Row/card hover fill |
| Text Primary | `--text-main` | `#1C1B20` | `#FFFFFF` | Headings, game titles, primary values |
| Text Muted | `--text-muted` | `#5B5A60` | `rgba(255, 255, 255, 0.6)` | Secondary captions, byte totals |
| Text Subtle | `--text-subtle` | `#7A797F` | `rgba(255, 255, 255, 0.4)` | Timestamps, placeholders |
| Border Subtle | `--border-color` | `#E8E7EB` | `rgba(255, 255, 255, 0.1)` | Card outlines, section dividers |
| Border Strong | `--border-strong` | `#D4D3D8` | `rgba(255, 255, 255, 0.2)` | Focused inputs, prominent controls |
| Accent Solid | `--primary` | `#6246EA` | `#6246EA` | Solid primary CTA fills, progress bars |
| Accent Hover | `--primary-hover` | `#4C29C5` | `#4C29C5` | Primary CTA hover |
| Accent Text | `--primary-text` | `#6246EA` | `#9F9EFE` | Inline links, text buttons (`Drive Details →`) |
| Accent Subtle | `--primary-subtle` | `rgba(98, 70, 234, 0.1)` | `rgba(98, 70, 234, 0.2)` | Active nav pill, icon tile backing |
| Accent Border | `--primary-border` | `rgba(98, 70, 234, 0.25)` | `rgba(98, 70, 234, 0.4)` | Active item borders |
| Text On Primary | `--on-primary` | `#FFFFFF` | `#FFFFFF` | Text inside `.btn-primary` |
| Focus Ring | `--ring` | `#7C70FE` | `#9F9EFE` | Keyboard `:focus-visible` outline |
| Modal Overlay | `--overlay` | `rgba(28, 27, 32, 0.5)` | `rgba(0, 0, 0, 0.6)` | `<dialog>::backdrop` scrim |

## Drive & Semantic Alert Tokens

| Category | CSS Variable | Light | Dark |
| :--- | :--- | :--- | :--- |
| SSD Accent | `--ssd-color` | `#6246EA` | `#9F9EFE` |
| HDD Accent | `--hdd-color` | `#5B5A60` | `rgba(255, 255, 255, 0.6)` |
| Success | `--success` / `--success-subtle` | `#166534` / `rgba(22, 163, 74, 0.1)` | `#4ADE80` / `rgba(74, 222, 128, 0.12)` |
| Warning | `--warning` / `--warning-subtle` | `#92400E` / `rgba(217, 119, 6, 0.12)` | `#FBBF24` / `rgba(251, 191, 36, 0.12)` |
| Danger | `--danger` / `--danger-subtle` | `#B91C1C` / `rgba(220, 38, 38, 0.1)` | `#F87171` / `rgba(248, 113, 113, 0.12)` |
| Info | `--info` / `--info-subtle` | `#0369A1` / `rgba(2, 132, 199, 0.1)` | `#38BDF8` / `rgba(56, 189, 248, 0.12)` |

## Core Utility Classes (`desktop/src/index.css`)
- `.card`: Surface panel with `var(--bg-card)`, `1px solid var(--border-color)`, `var(--radius-card)` (`12px`), `20px` padding.
- `.btn-primary`, `.btn-secondary`, `.btn-danger`, `.btn-success`: Standard action buttons (`var(--radius)` = `8px`).
- `.progress-bar-bg` & `.progress-bar-fill`: Standard capacity and transfer progress bar (`8px` height, `4px` radius).
- `.danger-banner`: Warning/unsaved guard alert box with `4px` left danger stripe.
- `.dashboard-root` / `.dashboard-body` / `.content-pane`: App shell layout (`38px` custom `.titlebar` + `220px` sidebar + scrollable `.content-pane` with `24px` padding and gap).
