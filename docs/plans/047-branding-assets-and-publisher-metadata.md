# Plan 047: Apply Brand Assets, Custom SVGs, and Publisher Metadata across Windows, Linux, and Android

## Goal
Integrate the newly provided brand assets (`Zapp-Brand-Assets`) and custom icon set (`Zapp-Swap-Icons`) into the application (Desktop frontend, Core service, and Mobile app), and configure complete publisher and application identity metadata across Windows, Linux, and Android installer/package configs to ensure the software installs reliably without triggering "suspicious / unknown publisher" warnings.

## Scope
Folders: `desktop`, `core`, `mobile`, `scripts`, `docs`
Branch: `feat/branding-assets-and-publisher-metadata`

## Steps
0. **Branch Setup**:
   - Check out `feat/branding-assets-and-publisher-metadata` from `main`.

1. **Brand Asset Integration**:
   - Update `desktop/app-icon.svg` with the official Zapp brand SVG.
   - Run `npx tauri icon` with the official 512x512 brand asset to regenerate multi-resolution icons:
     - `desktop/src-tauri/icons/` (Windows `.ico`, Mac `.icns`, Linux PNGs, store logos, Android mipmap sets).
   - Populate `desktop/public/` with `favicon.ico`, `favicon-16.png`, `favicon-32.png`, `apple-touch-icon.png`, `zapp-icon-192.png`, `zapp-icon-512.png`, and `zapp-icon.svg`.
   - Update `desktop/index.html` with proper favicon links, author metadata, and OpenGraph/meta description.
   - Sync regenerated Android launcher icons (`desktop/src-tauri/icons/android/mipmap-*`) to `mobile/app/src/main/res/`.
   - Update `core/internal/tray/icon.ico` with the official Zapp `.ico`.

2. **Custom Icon Integration (`Zapp-Swap-Icons`)**:
   - Copy `docs/assets/Zapp-Swap-Icons/` to `desktop/src/assets/icons/` and `desktop/public/icons/`.
   - Create a reusable `ZappIcon` React component in `desktop/src/components/ZappIcon.tsx` that renders the custom SVG icons (home, games, folder, queue, log, settings, preferences, appearance, core-service, app-updates, menu).
   - In `desktop/src/components/Titlebar.tsx`:
     - Replace the generic Gamepad2 icon with the official Zapp brand icon.
   - In `desktop/src/components/Sidebar.tsx`:
     - Replace generic navigation icons with the custom `ZappIcon` components (`home`, `games`, `folder`, `queue`, `log`, `settings`).
   - In `desktop/src/components/SettingsView.tsx`:
     - Use `ZappIcon` for Appearance (`appearance`), Core Service (`core-service`), System Preferences (`preferences`), and App Updates (`app-updates`).

3. **Publisher Details & Anti-Suspicion Metadata**:
   - **Windows & Linux (Tauri Configuration - `desktop/src-tauri/tauri.conf.json`)**:
     - Set bundle metadata:
       - `publisher`: "Zapp Swap Manager"
       - `copyright`: "Copyright © 2026 Zapp Swap Manager Contributors"
       - `category`: "Game"
       - `shortDescription`: "Fast game swapping and backup manager between SSD and HDD"
       - `longDescription`: "Zapp Swap Manager safely moves, organizes, and verifies Steam and PC game libraries between fast NVMe/SSD gaming drives and spacious storage drives, with local dashboard and Android remote control."
     - Windows NSIS bundle details:
       - `installerIcon`: "icons/icon.ico"
       - `headerImage`: "icons/Square150x150Logo.png"
       - `sidebarImage`: "icons/Square310x310Logo.png"
       - `installMode`: "currentUser"
       - `displayLanguageSelector`: false
       - `languages`: ["en-US"]
     - Linux bundle details:
       - `deb.maintainer`: "Zapp Swap Manager Contributors <contact@zapp-swap-manager.local>"
       - `deb.section`: "games"
       - `deb.synopsis`: "Fast game swapping and backup manager between SSD and HDD"
       - `deb.description`: "..."
       - `rpm.summary`, `rpm.description`, `rpm.license`: "MIT"
   - **Windows Core Service (`core/cmd/zapp-core/winres.json`)**:
     - Ensure `CompanyName`: "Zapp Swap Manager", `LegalCopyright`, `ProductName`, `FileDescription`, and updated icons.
     - Regenerate `rsrc_windows_amd64.syso`.
   - **Android App (`mobile/app/build.gradle.kts` & `AndroidManifest.xml`)**:
     - Add publisher identity, application description, and metadata in `mobile/app/src/main/res/values/strings.xml` and `AndroidManifest.xml`.
     - Configure release signing block in `mobile/app/build.gradle.kts` to support custom keystore signing with publisher credentials (`CN=Zapp Swap Manager, O=Zapp Swap Manager, OU=Zapp, C=US`) rather than the default "Android Debug" keystore which triggers Play Protect warnings.
     - Add `scripts/generate-android-keystore.ps1` to easily create a valid release keystore.
   - **Code Signing Script (`scripts/install-dev-cert.ps1`)**:
     - Update script to sign both `zapp-core.exe` and `zapp-desktop.exe` / installer to prevent Windows SmartScreen popups on developer and test systems.

4. **Verification**:
   - Run `just check` (`check-core`, `check-server`, `check-desktop`, `check-mobile`).
   - Verify all tests, linters, and typechecks pass.

## Files to touch
- `docs/plans/047-branding-assets-and-publisher-metadata.md`
- `desktop/app-icon.svg`
- `desktop/index.html`
- `desktop/public/*`
- `desktop/src-tauri/tauri.conf.json`
- `desktop/src-tauri/icons/*`
- `desktop/src/assets/icons/*`
- `desktop/src/components/ZappIcon.tsx`
- `desktop/src/components/Titlebar.tsx`
- `desktop/src/components/Sidebar.tsx`
- `desktop/src/components/SettingsView.tsx`
- `core/internal/tray/icon.ico`
- `core/cmd/zapp-core/winres.json`
- `core/cmd/zapp-core/rsrc_windows_amd64.syso`
- `mobile/app/build.gradle.kts`
- `mobile/app/src/main/AndroidManifest.xml`
- `mobile/app/src/main/res/values/strings.xml`
- `mobile/app/src/main/res/values/ic_launcher_background.xml`
- `mobile/app/src/main/res/mipmap-*/*`
- `scripts/install-dev-cert.ps1`
- `scripts/generate-android-keystore.ps1`

## Out of scope
- Game transfer algorithm changes.
- Steam VDF parsing changes.

## Acceptance checks
- [ ] `just check` passes cleanly (core, server, desktop, mobile).
- [ ] Brand assets and icons are correctly positioned across desktop, core, and mobile.
- [ ] Tauri, Windows PE, Linux package, and Android APK metadata contain publisher details.
