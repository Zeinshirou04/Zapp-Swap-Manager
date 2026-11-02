# Plan 012: Release Packaging Pipeline & Workspace Build Recipes

## Goal
Update and fix the automated release workflow (`.github/workflows/release.yml`) and workspace build recipes in `justfile` so that production deployment artifacts (Windows Core service `zapp-core.exe`, Desktop Tauri application installer, and Mobile Android APK) can be built locally via `just build` and published automatically on Git tags via GitHub Actions.

## Scope
Folder: `.github/workflows`, root (`justfile`), `mobile/app`
Branch: `chore/release-packaging-pipeline`

## Steps
0. **Branch Setup**:
   Ensure local `main` is up to date, then check out the task branch:
   ```bash
   git checkout main
   git pull
   git checkout -b chore/release-packaging-pipeline
   ```

1. **Fix Core Binary Build in Release Workflow**:
   - In `.github/workflows/release.yml`:
     - Update `build-core` step: target `./cmd/zapp-core` instead of `./...` (which fails with `-o` on multi-package modules).
     - Remove conflicting `setup-go` action pinned to `1.22` (incompatible with `core/go.mod` declaration).

2. **Fix Mobile APK Build in Release Workflow & Gradle**:
   - In `mobile/app/build.gradle.kts`:
     - Configure `signingConfig = signingConfigs.getByName("debug")` for release builds in absence of a production keystore so APK packaging succeeds without keystore secrets.
   - In `.github/workflows/release.yml`:
     - Build APK with `./gradlew assembleRelease --no-daemon` and archive the generated APK cleanly to `dist-mobile/zapp-mobile.apk`.

3. **Verify Desktop Tauri Build Pipeline**:
   - In `.github/workflows/release.yml`:
     - Ensure `build-desktop` installs desktop dependencies, runs `npm run build`, and copies Tauri release bundles.

4. **Add Workspace Build Recipes (`justfile`)**:
   - Add `build-core` recipe: `cd core && go build -v -ldflags="-s -w" -o ../bin/zapp-core.exe ./cmd/zapp-core`
   - Add `build-desktop` recipe: `cd desktop && npm run build`
   - Add `build-mobile` recipe: `cd mobile && gradlew.bat assembleDebug` (Windows) / `./gradlew assembleDebug` (Unix)
   - Add `build` meta-recipe running all component builds.

5. **Verification**:
   - Verify `just check` passes.
   - Verify `just build-core` builds binary successfully.
   - Push branch and open pull request with passing `ci-ok`.

## Files to touch
- `.github/workflows/release.yml`
- `mobile/app/build.gradle.kts`
- `justfile`
- `docs/plans/012-release-packaging-and-build-pipeline.md`

## Out of scope
- Core logic or safety invariant changes.
- API contract changes (`api/openapi.yaml`).

## Acceptance checks
- [ ] `just check` passes on all runners
- [ ] `just build-core` produces `bin/zapp-core.exe`
- [ ] `.github/workflows/release.yml` compiles without syntax or Go/Gradle build errors
- [ ] Pull request created and passing `ci-ok`

## Safety
Touches move/delete/manifest code? no.
