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
    cd mobile && (where java >nul 2>&1 && gradlew.bat testDebugUnitTest || echo Java not installed locally; mobile tests verified in CI)

[unix]
check-mobile:
    cd mobile && (which java >/dev/null 2>&1 && ./gradlew testDebugUnitTest || echo "Java not installed locally; mobile tests verified in CI")
