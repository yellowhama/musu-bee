# Install-MUSU.ps1 — one-click MUSU installer for the self-signed beta.
#
# What it does, so the user never types a certificate command by hand:
#   1. downloads the public self-signed certificate,
#   2. trusts it in LocalMachine\TrustedPeople (so Windows will install the app),
#   3. installs MUSU via the .appinstaller (which also wires 24h auto-update).
#
# Usage: right-click this file -> "Run with PowerShell" as Administrator, OR from
# an elevated prompt:  powershell -ExecutionPolicy Bypass -File .\Install-MUSU.ps1
#
# This is the beta bridge until the Microsoft Store release lands, after which no
# certificate step is needed at all (Store re-signs the package).

[CmdletBinding()]
param(
    [string]$ReleaseBase = "https://github.com/yellowhama/musu-bee/releases/download/desktop-latest",
    [string]$CertFileName = "blossompark.musu.cer",
    [string]$AppInstallerFileName = "musu.appinstaller"
)

$ErrorActionPreference = "Stop"

# Pinned signing-certificate thumbprint (canonical key blossompark.musu). The
# cert and the MSIX it signs are fetched over the SAME channel, so MSIX code
# signing alone proves nothing here — we must verify the downloaded cert matches
# this out-of-band pin before trusting it. If you rotate the signing key, update
# this constant in the same commit that publishes the new cert.
$ExpectedCertThumbprint = "65F5926444D563966C75F000C384C8530B1D8DD8"

function Test-IsAdmin {
    $id = [System.Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object System.Security.Principal.WindowsPrincipal($id)
    return $principal.IsInRole([System.Security.Principal.WindowsBuiltInRole]::Administrator)
}

if (-not (Test-IsAdmin)) {
    Write-Host "MUSU install needs administrator rights to trust the beta certificate." -ForegroundColor Yellow
    Write-Host "Re-launching elevated..." -ForegroundColor Yellow
    $psi = "-ExecutionPolicy Bypass -File `"$PSCommandPath`" -ReleaseBase `"$ReleaseBase`""
    Start-Process powershell -Verb RunAs -ArgumentList $psi
    return
}

$work = Join-Path $env:TEMP "musu-install"
New-Item -ItemType Directory -Force $work | Out-Null

Write-Host "[1/3] Downloading certificate..." -ForegroundColor Cyan
$certPath = Join-Path $work $CertFileName
Invoke-WebRequest "$ReleaseBase/$CertFileName" -OutFile $certPath -UseBasicParsing

Write-Host "[2/3] Verifying + trusting certificate..." -ForegroundColor Cyan
# Verify the downloaded cert matches the pinned thumbprint BEFORE trusting it.
# Without this, an attacker who can serve a substitute cert+MSIX over the same
# origin would have their package trusted.
$cert = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2 $certPath
$actualThumb = $cert.Thumbprint.ToUpperInvariant()
$expectedThumb = $ExpectedCertThumbprint.ToUpperInvariant()
if ($actualThumb -ne $expectedThumb) {
    throw "Certificate thumbprint mismatch. Expected $expectedThumb but got $actualThumb. Aborting install — do NOT trust this certificate."
}
Write-Host "    thumbprint OK ($actualThumb)" -ForegroundColor DarkGray
Import-Certificate -FilePath $certPath -CertStoreLocation Cert:\LocalMachine\TrustedPeople | Out-Null

Write-Host "[3/3] Installing MUSU (with auto-update)..." -ForegroundColor Cyan
Add-AppxPackage -AppInstallerFile "$ReleaseBase/$AppInstallerFileName"

Write-Host ""
Write-Host "MUSU installed. Launch it from the Start menu." -ForegroundColor Green
Write-Host "It will keep itself updated automatically." -ForegroundColor Green
