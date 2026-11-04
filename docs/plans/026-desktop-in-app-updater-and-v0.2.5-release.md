# Plan 026: Desktop In-App Updater & v0.2.5 Release Pipeline

## Goal
Enable seamless in-app auto-updating for the Zapp Swap Manager Desktop app and Core service via Tauri v2's cloud updater and GitHub Releases, bump project versions to `0.2.5`, and release `v0.2.5` so users can update the application directly from the in-app interface.

## Scope
Folders: `desktop`, `core`, `.github`, `docs`
Branch: `chore/desktop-updater-and-v0.2.5-release`

## Background & Problem
1. When non-Steam/custom game support was implemented (Plan 024, PR #33), the locally running binary was compiled, but GitHub Releases remained at `v0.2.4`.
2. The Desktop application's "Check for Updates" button was failing with 404 because previous releases did not produce `latest.json` or signature (`.sig`) files.
3. In Tauri v2, generating updater artifacts requires `"createUpdaterArtifacts": true` in `tauri.conf.json` under `bundle`, plus a valid minisign keypair with `TAURI_SIGNING_PRIVATE_KEY` configured in CI secrets.
4. The versions across `package.json`, `Cargo.toml`, `tauri.conf.json`, and `main.go` were still at `0.1.0`.

## Implementation Steps

1. **Configure Tauri Updater Artifacts & Keys**:
   - In `desktop/src-tauri/tauri.conf.json`:
     - Set `"version": "0.2.5"`.
     - Set `"createUpdaterArtifacts": true` under `"bundle"`.
     - Set `"pubkey"` under `"plugins"."updater"` to the active minisign public key corresponding to `TAURI_SIGNING_PRIVATE_KEY` stored in GitHub repository secrets.
   - In `desktop/package.json`:
     - Bump `"version": "0.2.5"`.
   - In `desktop/src-tauri/Cargo.toml`:
     - Bump `version = "0.2.5"`.
   - In `desktop/src/components/SettingsModal.tsx`:
     - Update version display string to `v0.2.5 • Cloud Auto-Updater`.

2. **Core Version Bump**:
   - In `core/cmd/zapp-core/main.go`:
     - Set `Version = "0.2.5"`.
   - In `core/cmd/zapp-core/winres.json`:
     - Update product and file versions to `0.2.5.0`.

3. **Enhance Release CI Workflow (`.github/workflows/release.yml`)**:
   - In `build-core`:
     - Pass `-ldflags="-s -w -X main.Version=${{ github.ref_name }}"` to embed release tag in core binary.
   - In `build-desktop`:
     - Promote all updater bundle artifacts (`*.zip`, `*.sig`, `latest.json`) from `src-tauri/target/release/bundle/updater/` into `dist-desktop/`.
     - In `upload-artifact`, include `dist-desktop/*.zip` to ensure updater payload archives are published to the GitHub Release.

4. **Local Binary Alignment**:
   - Build updated `zapp-core.exe` and `zapp-desktop.exe` locally and ensure installed directory `D:\Programs\Zapp Swap Manager` has the latest binaries ready for immediate use.

5. **Verification**:
   - Run `just check` to ensure all linters, Go tests, and React/Vitest tests pass cleanly.
   - Create Pull Request for review and merge into `main`.
   - Tag release `v0.2.5` to trigger the automated GitHub Actions release workflow.

## Acceptance Checks
- [ ] `desktop/src-tauri/tauri.conf.json` has `version: "0.2.5"`, `createUpdaterArtifacts: true`, and valid `pubkey`.
- [ ] `desktop/package.json` and `desktop/src-tauri/Cargo.toml` bumped to `0.2.5`.
- [ ] `core/cmd/zapp-core/main.go` has default `Version = "0.2.5"`.
- [ ] `.github/workflows/release.yml` collects updater zip and json files for publication.
- [ ] `just check` passes with 0 errors and all tests green.
- [ ] PR created and merged, then `v0.2.5` tag pushed.

## Safety
Touches move/delete/manifest code? No. Only version metadata, CI packaging, and updater configuration.
