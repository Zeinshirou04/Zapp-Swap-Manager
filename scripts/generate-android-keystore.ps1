# Generates an official self-signed Android release keystore with full publisher
# details (CN, OU, O, C) so Android package installer and Play Protect do not flag
# the release APK as an untrusted or suspicious "built with debug certificate" binary.
#
# Usage:
#   .\scripts\generate-android-keystore.ps1

$ErrorActionPreference = 'Stop'

$targetKeystore = Join-Path $PSScriptRoot '..\mobile\zapp-release.keystore'
$alias = 'zapp'
$storePass = 'zappswapmanager'
$dname = 'CN=Zapp Swap Manager, OU=Zapp, O=Zapp Swap Manager Contributors, L=Global, ST=OpenSource, C=US'
$validityDays = 10000

if (Test-Path $targetKeystore) {
    Write-Host "Keystore already exists at $targetKeystore. Skipping generation." -ForegroundColor Yellow
    exit 0
}

# Locate keytool from Java JDK
$keytool = Get-Command 'keytool' -ErrorAction SilentlyContinue
if (-not $keytool -and $env:JAVA_HOME) {
    $candidate = Join-Path $env:JAVA_HOME 'bin\keytool.exe'
    if (Test-Path $candidate) {
        $keytool = $candidate
    }
}

if (-not $keytool) {
    Write-Warning "keytool not found in PATH or JAVA_HOME. Please ensure JDK 17+ is installed."
    exit 1
}

Write-Host "Generating release keystore at $targetKeystore..." -ForegroundColor Cyan
& $keytool -genkeypair `
    -alias $alias `
    -keyalg RSA `
    -keysize 2048 `
    -validity $validityDays `
    -keystore $targetKeystore `
    -storepass $storePass `
    -keypass $storePass `
    -dname $dname

if (Test-Path $targetKeystore) {
    Write-Host "Android release keystore successfully created with publisher credentials." -ForegroundColor Green
    Write-Host "Keystore: $targetKeystore"
    Write-Host "Alias: $alias"
} else {
    Write-Error "Failed to generate keystore."
}
