# Plan 016: Core Windows Metadata, Icon, and PE Resources

## Goal
Embed official Windows PE application icon (`app-icon.ico`), application manifest (`asInvoker`), and complete version metadata (ProductName, CompanyName, FileDescription, Version, Copyright) into `zapp-core.exe` so it appears as a trusted, official Windows software component in Windows Explorer and Task Manager rather than a generic or suspicious console application.

## Scope
Folder: `core`
Branch: `feat/core-metadata-icon-and-packaging`

## Steps
0. **Branch Setup**:
   Ensure local `main` is up to date, then check out the task branch:
   ```bash
   git checkout main
   git pull
   git checkout -b feat/core-metadata-icon-and-packaging
   ```
1. **Windows Resource Configuration (`winres.json`)**:
   - Create Windows resource specification for `core/cmd/zapp-core`:
     - File description: "Zapp Swap Manager Core Service"
     - Product name: "Zapp Swap Manager"
     - Company name: "Zapp"
     - Legal copyright: "Copyright © 2026 Zapp Swap Manager Contributors"
     - File version & Product version: "0.1.0.0"
     - Application icon: Embed `desktop/src-tauri/icons/icon.ico` (multi-resolution 16x16, 32x32, 48x48, 256x256).
     - Execution level manifest: `asInvoker` with UTF-8 and Common Controls v6 declarations.
2. **Generate PE Object (`rsrc_windows_amd64.syso`)**:
   - Use standard Go resource generator (`go-winres` / `rsrc`) to compile the `.syso` Windows resource object into `core/cmd/zapp-core/`.
   - Ensure `go build` automatically links the `.syso` resource into `zapp-core.exe` without external CGo dependencies.
3. **Local Developer Code Signing Script**:
   - Provide `scripts/install-dev-cert.ps1` to create and trust a local development certificate in `Cert:\CurrentUser\Root` and sign the binaries locally using `Set-AuthenticodeSignature`, preventing Windows Defender SmartScreen popups on developer and test machines.
4. **Verification**:
   - Run `go build -o zapp-core.exe ./cmd/zapp-core` on Windows.
   - Verify that `zapp-core.exe` displays the official icon in Windows Explorer.
   - Inspect executable Properties -> Details to confirm all metadata fields are populated.
   - Run `just check` to ensure all linters, formatting, and tests pass.

## Files to touch
- `core/cmd/zapp-core/winres.json` (or `rsrc.xml`)
- `core/cmd/zapp-core/rsrc_windows_amd64.syso`
- `scripts/install-dev-cert.ps1`
- `docs/plans/016-core-metadata-icon-and-packaging.md`

## Out of scope
- HTTP API endpoints or transfer logic.
- Desktop UI changes.

## Acceptance checks
- [ ] `just check` passes cleanly
- [ ] `zapp-core.exe` displays official icon in Windows Explorer
- [ ] Executable properties contain complete ProductName, CompanyName, and FileDescription
- [ ] PR created and merged to `main`

## Safety
Touches move/delete/manifest code? no.
