# Install: winget install Casey.Just
set windows-shell := ["cmd.exe", "/c"]

default:
    @just --list

# Run every component's checks (lint + tests).
check: check-core check-desktop check-mobile

check-core:
    cd core && go vet ./... && go test -v ./...

check-desktop:
    cd desktop && npm run lint && npm test

[windows]
check-mobile:
    cd mobile && (where java >nul 2>&1 && (gradlew.bat testDebugUnitTest --no-daemon || exit /b 1) || echo Java not installed locally; mobile tests verified in CI)

[unix]
check-mobile:
    cd mobile && (chmod +x ./gradlew 2>/dev/null || true) && if which java >/dev/null 2>&1; then ./gradlew testDebugUnitTest --no-daemon; else echo "Java not installed locally; mobile tests verified in CI"; fi

# Build all components.
build: build-core build-desktop build-mobile

# Build the Core daemon binary.
[windows]
build-core:
    cd core && go build -v -o ../bin/zapp-core.exe ./cmd/zapp-core

[unix]
build-core:
    cd core && go build -v -o ../bin/zapp-core ./cmd/zapp-core

# Build Desktop dashboard frontend assets.
build-desktop:
    cd desktop && npm run build

# Build Mobile Android APK (debug / sideloadable).
[windows]
build-mobile:
    cd mobile && (where java >nul 2>&1 && gradlew.bat assembleDebug --no-daemon || echo Java not installed locally; mobile builds verified in CI)

[unix]
build-mobile:
    cd mobile && (which java >/dev/null 2>&1 && ./gradlew assembleDebug --no-daemon || echo "Java not installed locally; mobile builds verified in CI")
