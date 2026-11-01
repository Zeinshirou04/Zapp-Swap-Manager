# Plan 010: Mobile Remote App (Kotlin + Jetpack Compose)

## Goal
Scaffold and implement the mobile remote client in `mobile/` using Kotlin and Jetpack Compose. The mobile app connects to the core service remotely through a Cloudflare Tunnel behind Cloudflare Access JWT authentication, maintains an offline snapshot cache in a local Room database, performs hourly background sync with WorkManager, and enables game swap management from anywhere.

## Scope
Folder: `mobile`
Branch: `feat/mobile-remote-app`

## Steps
0. **Branch Setup**:
   Ensure local `main` is up to date, then check out the task branch:
   ```bash
   git checkout main
   git pull
   git checkout -b feat/mobile-remote-app
   ```
1. **Android Project Scaffold (`mobile/`)**:
   - Set up Gradle build configuration (`build.gradle.kts`, `settings.gradle.kts`, `gradle/wrapper/`).
   - Configure dependencies: Jetpack Compose (BOM), Material 3, Room, WorkManager, Retrofit / OkHttp, Coroutines, Serialization.
   - Configure Ktlint for linting.
2. **Data & Storage Layer (`mobile/app/src/main/java/.../data/`)**:
   - Room Database: Entities for `GameEntity`, `LibraryEntity`, and `JobEntity` matching `api/openapi.yaml`.
   - DAOs for offline querying, updating, and cache invalidation.
   - Repository pattern coordinating network fetch and Room persistence.
3. **Network Layer (`mobile/app/src/main/java/.../network/`)**:
   - Retrofit API interface declaring OpenAPI endpoints:
     - `GET /health`
     - `GET /libraries`
     - `GET /games`
     - `GET /jobs`
     - `POST /jobs`
     - `POST /jobs/{id}/cancel`
   - OkHttp interceptor injecting `Cf-Access-Jwt-Assertion` and Bearer token headers.
4. **Background Synchronization (`mobile/app/src/main/java/.../worker/`)**:
   - `SyncWorker` extending `CoroutineWorker` to fetch `/libraries` and `/games` and update Room DB.
   - Schedule periodic hourly sync using `WorkManager` with network constraints.
5. **UI Layer with Jetpack Compose (`mobile/app/src/main/java/.../ui/`)**:
   - **Connection Settings Screen**: Configure Cloudflare Tunnel hostname (`https://{tunnel-host}`) and Access Service Token / JWT.
   - **Dashboard Screen**: Health badge, SSD Cache & HDD Master drive space meters.
   - **Games Screen**: Searchable game list with filter chips (All, SSD Cache, HDD Master), details bottom sheet, and Promote / Evict / Backup action buttons.
   - **Queue Monitor Screen**: Real-time job status and progress tracking with cancel capability.
6. **Unit Tests & Linting**:
   - Unit tests for Room DAOs, Repository, and SyncWorker with mock HTTP server / fake client.
   - Update `Justfile` recipe `check-mobile` to run `cd mobile && gradlew ktlintCheck testDebugUnitTest`.
   - Update `.github/workflows/ci.yml` Android build / check workflow.
   - Run `just check`.

## Files to touch
- `mobile/build.gradle.kts`
- `mobile/settings.gradle.kts`
- `mobile/app/build.gradle.kts`
- `mobile/app/src/`
- `Justfile`
- `.github/workflows/ci.yml`
- `docs/plans/010-mobile-remote-app.md`

## Out of scope
- Desktop Tauri dashboard (Plan 009).
- Modifying core filesystem or API contract.

## Acceptance checks
- [ ] `mobile/` compiles cleanly with Gradle and Kotlin.
- [ ] Room database accurately stores offline snapshots of games and libraries.
- [ ] Retrofit client correctly transmits `Cf-Access-Jwt-Assertion` header.
- [ ] WorkManager executes periodic background sync when connected.
- [ ] Jetpack Compose UI provides intuitive game browsing, swapping, and queue monitoring.
- [ ] `gradlew ktlintCheck testDebugUnitTest` passes.
- [ ] `just check` passes.

## Safety
Touches move/delete/manifest code? No (Mobile client communicates exclusively via remote HTTP API).
