# Install-MUSU.ps1 — one-line MUSU installer for the self-signed beta.
#
# Primary usage (one line, like Bun/Deno/Scoop):
#     irm https://musu.pro/install.ps1 | iex
#
# What it does, so the user never types a certificate command by hand:
#   1. downloads the public self-signed certificate,
#   2. trusts it in LocalMachine\TrustedPeople (so Windows will install the app),
#   3. installs MUSU via the .appinstaller (which also wires 24h auto-update).
#
# Self-elevates: if not admin, it re-fetches itself from the canonical URL inside
# an elevated PowerShell (so it works whether run from a file OR piped via iex,
# where there is no file path to re-launch).
#
# This is the beta bridge until the Microsoft Store release lands, after which no
# certificate step is needed at all (Store re-signs the package).

[CmdletBinding()]
param(
    [string]$ReleaseBase = "https://github.com/yellowhama/musu-bee/releases/download/desktop-latest",
    [string]$CertFileName = "blossompark.musu.cer",
    [string]$AppInstallerFileName = "musu.appinstaller",
    # Canonical self-URL used to re-fetch the script when self-elevating under
    # `irm | iex` (no $PSCommandPath in that mode).
    [string]$SelfUrl = "https://musu.pro/install.ps1",
    # Unattended/CI installs: trust + install but do NOT auto-launch the app.
    [switch]$NoLaunch
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
    # Re-fetch + run the script in an elevated PowerShell. This works whether we
    # were started from a file OR piped via `irm ... | iex` (in which case there
    # is no $PSCommandPath to re-launch). We re-download from the canonical SelfUrl
    # and pipe to iex inside the elevated shell.
    $inner = "`$ErrorActionPreference='Stop'; iex ((New-Object Net.WebClient).DownloadString('$SelfUrl'))"
    $b64 = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($inner))
    Start-Process powershell -Verb RunAs -ArgumentList @(
        "-ExecutionPolicy", "Bypass", "-NoProfile", "-EncodedCommand", $b64
    )
    return
}

$work = Join-Path $env:TEMP "musu-install"
New-Item -ItemType Directory -Force $work | Out-Null

Write-Host "[1/4] Downloading certificate..." -ForegroundColor Cyan
$certPath = Join-Path $work $CertFileName
Invoke-WebRequest "$ReleaseBase/$CertFileName" -OutFile $certPath -UseBasicParsing

Write-Host "[2/4] Verifying + trusting certificate..." -ForegroundColor Cyan
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

Write-Host "[3/4] Installing MUSU (with auto-update)..." -ForegroundColor Cyan
Add-AppxPackage -AppInstallerFile "$ReleaseBase/$AppInstallerFileName"

if ($NoLaunch) {
    Write-Host "[4/4] Skipping auto-start (-NoLaunch)." -ForegroundColor DarkGray
    Write-Host ""
    Write-Host "MUSU installed. Open it from the Start menu when ready." -ForegroundColor Green
    Write-Host "It will keep itself updated automatically." -ForegroundColor Green
    return
}

Write-Host "[4/4] Starting MUSU..." -ForegroundColor Cyan
# Launch the app once right after install so the bridge comes up immediately —
# otherwise nothing starts the bridge until the next OS logon (windows.startupTask
# fires on logon, not on install) OR the user opens the app by hand. Without this,
# a freshly installed machine shows "bridge down" and never appears online to its
# fleet until the user manually runs it. Opening the desktop window triggers the
# cockpit's runtime autostart (spawn_runtime_autostart -> musu-startup open), which
# ensures the bridge token and brings the bridge up.
#
# CRITICAL: this script self-elevated to admin to trust the cert, so we are in an
# ADMIN token here. Activating a packaged (MSIX) app directly from an elevated
# context is refused by Windows or runs it in the admin session where the logged-in
# user can't see it. We therefore hand activation to Explorer (`explorer.exe
# shell:AppsFolder\<AUMID>`), which runs as the interactive user and brokers the
# activation into the USER session — the window appears for the real user. AUMID is
# resolved dynamically so the publisher hash is never hardcoded.
try {
    $pkg = Get-AppxPackage -Name "blossompark.musu" | Select-Object -First 1
    if ($pkg) {
        $app = (Get-AppxPackageManifest $pkg).Package.Applications.Application | Select-Object -First 1
        $aumid = "$($pkg.PackageFamilyName)!$($app.Id)"
        # explorer.exe brokers the launch into the interactive user session even
        # though this shell is elevated (direct shell:AppsFolder activation would
        # fail or land in the admin session).
        Start-Process "explorer.exe" -ArgumentList "shell:AppsFolder\$aumid"
        Write-Host "    MUSU is starting." -ForegroundColor DarkGray
    } else {
        Write-Host "    Could not locate the installed package to auto-start; open MUSU from the Start menu." -ForegroundColor Yellow
    }
} catch {
    # Non-fatal: install succeeded; only the convenience auto-start failed.
    Write-Host "    Auto-start skipped ($($_.Exception.Message)); open MUSU from the Start menu." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "MUSU installed and starting. It will keep itself updated automatically." -ForegroundColor Green
