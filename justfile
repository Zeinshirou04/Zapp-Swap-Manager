# Install: winget install Casey.Just
set windows-shell := ["cmd.exe", "/c"]

default:
    @just --list

# Run every component's checks (lint + tests).
check: check-core check-desktop check-mobile

check-core:
    cd core && go vet ./... && go test -v ./...

check-desktop:
    @echo "desktop not set up yet. Replace with: cd desktop && npm run lint && npm test"

check-mobile:
    @echo "mobile not set up yet. Replace with: cd mobile && gradlew ktlintCheck testDebugUnitTest"
