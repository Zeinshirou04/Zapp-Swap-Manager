# Creates a self-signed code-signing certificate with official publisher credentials,
# trusts it in the CurrentUser Root store, and signs Windows executables/installers
# (zapp-core.exe, zapp-desktop.exe, setup.exe) so Windows Defender SmartScreen
# and Windows UAC do not flag them as "Unknown Publisher" / suspicious binaries.
#
# Run once or pass a specific target file:
#   .\scripts\install-dev-cert.ps1
#   .\scripts\install-dev-cert.ps1 -TargetFile "bin\zapp-core.exe"

param (
    [string]$TargetFile
)

$ErrorActionPreference = 'Stop'

$certName = 'Zapp Swap Manager'
$certPath = 'Cert:\CurrentUser\My'

$existing = Get-ChildItem $certPath |
    Where-Object { $_.Subject -eq "CN=$certName" -and $_.HasPrivateKey }
if ($existing) {
    $cert = $existing | Sort-Object NotAfter -Descending | Select-Object -First 1
} else {
    Write-Host "Creating code-signing certificate for '$certName'..." -ForegroundColor Cyan
    $cert = New-SelfSignedCertificate -Subject "CN=$certName" `
        -Type CodeSigningCert -KeyUsage DigitalSignature `
        -KeyExportPolicy Exportable -NotAfter (Get-Date).AddYears(5)
}

# Trust the cert in CurrentUser Root so Windows Authenticode recognizes the publisher.
$rootStore = Get-ChildItem Cert:\CurrentUser\Root
if (-not ($rootStore | Where-Object { $_.Thumbprint -eq $cert.Thumbprint })) {
    $store = New-Object System.Security.Cryptography.X509Certificates.X509Store(
        'Root', 'CurrentUser')
    $store.Open('ReadWrite')
    $wasInProgress = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    $store.Add($cert)
    $ErrorActionPreference = $wasInProgress
    $store.Close()
    Write-Host "Trusted certificate '$certName' in CurrentUser\Root." -ForegroundColor Green
}

# Sign candidates
$candidates = @(
    (Join-Path $PSScriptRoot '..\bin\zapp-core.exe'),
    (Join-Path $PSScriptRoot '..\core\zapp-core.exe'),
    (Join-Path $PSScriptRoot '..\desktop\src-tauri\resources\zapp-core.exe'),
    (Join-Path $PSScriptRoot '..\desktop\src-tauri\target\release\zapp-desktop.exe')
)

if ($TargetFile) {
    $candidates = @($TargetFile) + $candidates
}

# Also find any built NSIS setup installers
$nsisDir = Join-Path $PSScriptRoot '..\desktop\src-tauri\target\release\bundle\nsis'
if (Test-Path $nsisDir) {
    $candidates += (Get-ChildItem $nsisDir -Filter "*-setup.exe" | ForEach-Object { $_.FullName })
}

$signedCount = 0
foreach ($path in $candidates) {
    if (Test-Path $path) {
        Write-Host "Signing $path..." -ForegroundColor Cyan
        Set-AuthenticodeSignature -FilePath $path -Certificate $cert |
            Select-Object Status, StatusMessage, Path | Format-Table -AutoSize
        $signedCount++
    }
}

if ($signedCount -eq 0) {
    Write-Warning "No built executables found yet to sign. Build them first with 'just build'."
}

Write-Host "Done. Certificate '$certName' ($($cert.Thumbprint)) is installed, trusted, and ready for Authenticode signing." -ForegroundColor Green
