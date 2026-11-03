# Creates a self-signed code-signing certificate, trusts it in the current
# user's Root store, and signs zapp-core.exe so Windows Defender SmartScreen
# stays quiet on developer/test machines. Run once per machine:
#  irm scripts/install-dev-cert.ps1 | iex   or   .\scripts\install-dev-cert.ps1
#
# Requires PowerShell run as administrator (needed to trust the Root store).

$ErrorActionPreference = 'Stop'

$certName = 'Zapp Swap Manager Dev'
$certPath = 'Cert:\CurrentUser\My'

$existing = Get-ChildItem $certPath |
    Where-Object { $_.Subject -eq "CN=$certName" -and $_.HasPrivateKey }
if ($existing) {
    $cert = $existing | Sort-Object NotAfter -Descending | Select-Object -First 1
} else {
    $cert = New-SelfSignedCertificate -Subject "CN=$certName" `
        -Type CodeSigningCert -KeyUsage DigitalSignature `
        -KeyExportPolicy Exportable -NotAfter (Get-Date).AddYears(5)
}

# Trust the cert so Windows stops flagging its signatures.
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
}

$dist = Join-Path $PSScriptRoot '..\bin\zapp-core.exe'
if (Test-Path $dist) {
    Set-AuthenticodeSignature -FilePath $dist -Certificate $cert |
        Select-Object Status, StatusMessage, SignerCertificate
} else {
    Write-Warning "zapp-core.exe not found at $dist - build it first (just build or go build ./cmd/zapp-core)."
}

Write-Host "Done. Certificate '$certName' $($cert.Thumbprint) is trusted and used for local signing." -ForegroundColor Green
