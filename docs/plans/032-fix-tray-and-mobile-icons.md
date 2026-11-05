# Plan 032: Fix System Tray Icon and Mobile App Icon

## Context & Objectives
1. **Core Tray Icon**: When `zapp-core.exe` runs in the Windows system tray, it currently displays a generic blank window placeholder icon because `core/internal/tray/tray_windows.go` called `procLoadIconW.Call(0, uintptr(idiApplication))`.
   - Goal: Load Zapp's real icon from the embedded PE resource (`hInst, 1`), and provide an embedded icon fallback (`//go:embed`) using `CreateIconFromResourceEx` so the branded Zapp icon displays regardless of build mechanism.
2. **Mobile App Launcher Icon**: `mobile/app/src/main/AndroidManifest.xml` currently uses `@android:drawable/sym_def_app_icon` (the generic green Android robot).
   - Goal: Copy the generated Android launcher icon sets from `desktop/src-tauri/icons/android/` into `mobile/app/src/main/res/` and update `AndroidManifest.xml` to reference `@mipmap/ic_launcher` and `@mipmap/ic_launcher_round`.
3. **Verification**: Run `just check` (core vet/tests, desktop lint/build/tests, mobile).

## Steps
1. Create `docs/plans/032-fix-tray-and-mobile-icons.md` and switch to branch `fix/core-and-mobile-icons`.
2. Enhance `core/internal/tray/tray_windows.go`:
   - Add embedded icon fallback (`icon.ico` or icon data) via `//go:embed`.
   - Update tray icon loading to try PE icon resource 1 first, then embedded icon bytes via `CreateIconFromResourceEx`, falling back to `idiApplication` only if both fail.
3. Update `mobile/`:
   - Copy mipmap folders and `values/ic_launcher_background.xml` into `mobile/app/src/main/res/`.
   - Update `mobile/app/src/main/AndroidManifest.xml` to use `@mipmap/ic_launcher` and `@mipmap/ic_launcher_round`.
4. Verify with `just check`.
5. Commit, push, and open PR.
