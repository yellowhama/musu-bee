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

    # Decide HOW to re-launch elevated. Two cases:
    #   (a) We were started from a real file on disk ($PSCommandPath is set) — e.g.
    #       a local dev/test run or a saved copy. Re-launch THAT SAME file with -File.
    #       This avoids the elevated child silently re-downloading musu.pro's published
    #       script, which would run code different from the local file under test.
    #   (b) We were piped via `irm ... | iex` (no $PSCommandPath). There is no file to
    #       re-launch, so we re-download from the canonical SelfUrl and pipe to iex
    #       inside the elevated shell.
    # Either way, the elevated child re-enters this script and Test-IsAdmin is true for
    # it (it runs with the Administrator token), so it falls through past this block —
    # there is no self-elevation infinite loop.
    #
    # Either way, the re-entered elevated child reaches the script-scope `trap` below,
    # which keeps a terminating error visible: an elevated child runs in a NEW window
    # that otherwise closes the instant the script returns, hiding the failure from the
    # user. The trap pauses (Read-Host) on error so the user can read it — but only in
    # interactive, attended runs. In -NoLaunch / non-interactive (CI) runs it must NOT
    # pause, or the install would hang forever waiting on input no one will give.
    if ($PSCommandPath) {
        # Case (a): re-run the local file as-is, preserving -NoLaunch when set.
        $childArgs = @(
            "-ExecutionPolicy", "Bypass", "-NoProfile",
            "-File", $PSCommandPath
        )
        if ($NoLaunch) { $childArgs += "-NoLaunch" }
        Start-Process powershell -Verb RunAs -ArgumentList $childArgs
    } else {
        # Case (b): irm|iex — re-fetch from canonical SelfUrl and run in the elevated
        # shell. We deliberately do NOT add a try/catch + pause around the run here:
        # the script we download IS this same script, which already installs a
        # script-scope `trap` (see below) that keeps the failure on screen with a
        # single conditional pause. Wrapping it again would pause twice.
        #
        # We re-run the downloaded text as a script block invoked with `&` (NOT plain
        # `iex`), because the downloaded script begins with a param() block: a plain
        # `iex` re-declares $NoLaunch from that param() and resets it to its default,
        # silently dropping a -NoLaunch the user asked for. Invoking it as a script
        # block lets us BIND -NoLaunch through the param() block so the inner trap honors
        # the non-interactive / unattended contract.
        $noLaunchArg = if ($NoLaunch) { " -NoLaunch" } else { "" }
        $inner = "`$ErrorActionPreference='Stop'; & ([scriptblock]::Create((New-Object Net.WebClient).DownloadString('$SelfUrl')))$noLaunchArg"
        $b64 = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($inner))
        Start-Process powershell -Verb RunAs -ArgumentList @(
            "-ExecutionPolicy", "Bypass", "-NoProfile", "-EncodedCommand", $b64
        )
    }
    return
}

# From here on we run with the Administrator token (either we were already admin, or
# the elevated child re-entered this script). When the elevated child was launched via
# `-File` (local-file case in the self-elevation block above), it runs in a NEW window
# that closes the moment the script ends — so any terminating error below would vanish
# before the user could read it. This script-scope trap keeps the failure on screen by
# pausing, but ONLY in attended runs: in -NoLaunch / non-interactive (CI) shells it
# must not block on input. After (optionally) pausing it `break`s, which terminates the
# script and propagates the original terminating error so the non-zero exit semantics are
# preserved. This single trap also serves the irm|iex path, since that path re-runs THIS
# same script (as a script block), so the trap is present there too — exactly one pause.
trap {
    Write-Host ""
    Write-Host "MUSU install failed: $($_.Exception.Message)" -ForegroundColor Red
    if (-not $NoLaunch -and [Environment]::UserInteractive) {
        Read-Host 'Press Enter to close'
    }
    break
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
# Trust the cert in BOTH stores, but only AFTER the pinned-thumbprint check above —
# the same verified cert object/file is used for both imports, so the pin still gates
# everything that gets trusted.
#   - TrustedPeople: required for Add-AppxPackage to accept a self-signed MSIX.
#   - Root: on some machines TrustedPeople alone is not enough and Add-AppxPackage
#     still fails with 0x800B0109 (A certificate chain could not be built to a
#     trusted root authority). Adding the cert as a trusted root closes that gap.
#     install-msix.ps1 (the dev-side installer) adds Root for the same reason.
Import-Certificate -FilePath $certPath -CertStoreLocation Cert:\LocalMachine\TrustedPeople | Out-Null
Import-Certificate -FilePath $certPath -CertStoreLocation Cert:\LocalMachine\Root | Out-Null

Write-Host "[3/4] Installing MUSU (with auto-update)..." -ForegroundColor Cyan
# Add-AppxPackage can still fail with 0x800B0109 (untrusted cert chain) even after the
# cert is trusted — e.g. store propagation timing, or a deeper machine trust-policy
# issue. Catch it explicitly to give the user an actionable message instead of a raw
# HRESULT. Mirrors install-msix.ps1's 0x800B0109 handling. Because we already trusted
# the cert in BOTH Root and TrustedPeople above, a 0x800B0109 here means "trusted in
# both stores and STILL rejected" — a deeper problem, reflected in the message.
try {
    Add-AppxPackage -AppInstallerFile "$ReleaseBase/$AppInstallerFileName"
} catch {
    $msg = $_.Exception.Message
    if ($msg -match "0x800B0109") {
        Write-Host ""
        Write-Host "Certificate trust error (0x800B0109) while installing the package." -ForegroundColor Red
        Write-Host "This script already trusted the signing certificate in BOTH the Root and" -ForegroundColor Yellow
        Write-Host "TrustedPeople LocalMachine stores, so a failure here points to a deeper" -ForegroundColor Yellow
        Write-Host "machine trust-policy issue. Try: reboot and re-run this installer; if it" -ForegroundColor Yellow
        Write-Host "still fails, install the certificate manually (double-click" -ForegroundColor Yellow
        Write-Host "$certPath, 'Install Certificate' -> Local Machine -> Trusted Root) and retry." -ForegroundColor Yellow
        Write-Host ""
    }
    throw
}

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
