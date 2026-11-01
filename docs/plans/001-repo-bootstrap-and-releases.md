# Plan 001: Repository Bootstrap, Release Workflows & Documentation

## Goal
Initialize Git and GitHub repository infrastructure, set up continuous integration (`ci-ok`) and release workflows for all components, and establish a comprehensive README.

## Scope
Folder: `.github`, `docs`, root
Branch: `chore/ci-repo-bootstrap`

## Steps
1. Expand `README.md` with complete system architecture, storage tiering model, safety guarantees, release artifact distribution, and quick start guide.
2. Create `.github/workflows/ci.yml` defining the CI pipeline with the mandatory `ci-ok` gate required by `docs/workflow.md`.
3. Create `.github/workflows/release.yml` configuring automated GitHub Releases on `v*` tags for all 3 targets:
   - Core Windows service binary (`.zip`)
   - Desktop Tauri application (`.msi` / `.exe`)
   - Mobile Android application (`.apk`)
4. Initialize local Git repository (`git init -b main`) and connect to private GitHub repository `Zeinshirou04/zapp-swap-manager`.

## Files to touch
- `README.md`
- `.github/workflows/ci.yml`
- `.github/workflows/release.yml`
- `docs/plans/001-repo-bootstrap-and-releases.md`

## Out of scope
- Implementation of Go Core daemon (`core/`), Tauri UI (`desktop/`), and Kotlin Compose app (`mobile/`).
- OpenAPI schema definition (`api/openapi.yaml`), which will be defined in Plan 002.

## Acceptance checks
- [ ] `just check` passes
- [ ] Git repository initialized on `main` branch
- [ ] Private GitHub repository `Zeinshirou04/zapp-swap-manager` created
- [ ] `.github/workflows/ci.yml` contains passing `ci-ok` status check
- [ ] `.github/workflows/release.yml` configured for multi-artifact packaging on release tags

## Safety
Touches move/delete/manifest code? no.
