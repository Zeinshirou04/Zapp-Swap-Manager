# Plan 014: Fix Release Build Targets for Desktop & Mobile

## Goal
Fix Tauri Cargo manifest configuration in `desktop/` and Gradle wrapper launcher in `mobile/` so that automated release builds produce valid Desktop installer/binary and Mobile APK release packages in GitHub Actions.

## Scope
Folder: `desktop/src-tauri`, `mobile`, root (`justfile`)
Branch: `fix/ci-release-build-targets`

## Steps
0. **Branch Setup**:
   Ensure local `main` is up to date, then check out the task branch:
   ```bash
   git checkout main
   git pull
   git checkout -b fix/ci-release-build-targets
   ```

1. **Fix Desktop Tauri Cargo Configuration**:
   - In `desktop/src-tauri/Cargo.toml`:
     - Either provide `src/lib.rs` for `[lib]` (declaring `zapp_desktop_lib::run()` per Tauri v2 conventions) and call it from `src/main.rs`, or configure `path` appropriately.
     - Verify `cargo metadata --no-deps` in `desktop/src-tauri` succeeds without errors.

2. **Fix Mobile Gradle Wrapper Script**:
   - In `mobile/gradlew`:
     - Add `APP_HOME` directory resolution so `CLASSPATH=$APP_HOME/gradle/wrapper/gradle-wrapper.jar` resolves to the project's wrapper jar instead of `/gradle/wrapper/...`.
     - Ensure POSIX shell compatibility for Linux / CI runners.

3. **Tighten Justfile Mobile Check**:
   - In `justfile`:
     - Ensure `check-mobile` does not mask failures if Java is present and tests fail.

4. **Verification**:
   - Verify `cargo metadata --no-deps` passes in `desktop/src-tauri`.
   - Run `just check`.
   - Push branch and open pull request with passing `ci-ok`.

## Files to touch
- `desktop/src-tauri/src/lib.rs`
- `desktop/src-tauri/src/main.rs`
- `desktop/src-tauri/Cargo.toml`
- `mobile/gradlew`
- `justfile`
- `docs/plans/014-fix-release-build-targets.md`

## Out of scope
- Core logic or safety invariant changes.
- API contract changes (`api/openapi.yaml`).

## Acceptance checks
- [x] `cargo metadata --no-deps` succeeds in `desktop/src-tauri`
- [x] `just check` passes
- [ ] PR created into `main` with passing `ci-ok`

## Safety
Touches move/delete/manifest code? no.
