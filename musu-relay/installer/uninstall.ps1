# uninstall.ps1 — V23.2 Workstream B4b (wiki/372 §9)
#
# Idempotent uninstall: tears down the musu WSL distro + state directories
# + Scheduled Task. Safe to re-run; exit 0 on no-op.
#
# Critic Findings honored (wiki/372 §14):
#   C4 MEDIUM — `-Reset` flag clears %LOCALAPPDATA%\musu\install_id too.
#               Without `-Reset`, install_id persists so re-installs coalesce
#               telemetry under one identity.
#   C12 LOW   — Symmetric removal of Defender exclusion added by install
#               step 5.5.
#
# Explicit non-actions (per §9):
#   - Does NOT `Disable-WindowsOptionalFeature` (operator may have other
#     WSL2 distros).
#   - Does NOT modify firewall rules (none were added by install).
#   - Does NOT remove the v21 `scripts/install.ps1` musu-bridge Scheduled
#     Task (different product, different path).

#Requires -Version 5.1

[CmdletBinding()]
param(
    [switch]$Reset,
    [switch]$Quiet
)

Set-StrictMode -Version 2.0
$ErrorActionPreference = "Continue"   # idempotent → don't bail on first error

# ── Import shared helpers ──────────────────────────────────────────────────

$ModulePath = Join-Path $PSScriptRoot "Musu-Common.psm1"
if (-not (Test-Path $ModulePath)) {
    throw "Missing Musu-Common.psm1 in $PSScriptRoot"
}
Import-Module $ModulePath -Force -DisableNameChecking

# ── Step 1 — Elevation required ────────────────────────────────────────────

if (-not (Test-MusuElevation)) {
    Write-MusuErr "uninstall.ps1 must be run from an elevated PowerShell prompt."
    exit 1
}

if (-not $Quiet) {
    Write-MusuInfo "musu uninstall starting"
    if ($Reset) {
        Write-MusuInfo "-Reset flag: will also clear %LOCALAPPDATA%\musu\install_id"
    }
}

# ── Step 2 — Terminate + unregister musu WSL distro ────────────────────────

Write-MusuInfo "Step 1/6: wsl --terminate musu (graceful)"
& wsl.exe --terminate musu 2>$null | Out-Null
Start-Sleep -Seconds 5

Write-MusuInfo "Step 2/6: wsl --unregister musu (idempotent)"
& wsl.exe --unregister musu 2>$null | Out-Null
Write-MusuOk "WSL distro removed (if present)"

# ── Step 3 — Remove %LOCALAPPDATA%\musu (preserving install_id unless -Reset) ──

$localData = Join-Path $env:LOCALAPPDATA "musu"
$installIdFile = Join-Path $localData "install_id"
$installIdContent = $null
if (-not $Reset -and (Test-Path $installIdFile)) {
    try {
        $installIdContent = (Get-Content $installIdFile -Raw -ErrorAction Stop).Trim()
    } catch {
        $installIdContent = $null
    }
}

Write-MusuInfo "Step 3/6: removing $localData\wsl"
$wslDir = Join-Path $localData "wsl"
if (Test-Path $wslDir) {
    Remove-Item -Recurse -Force $wslDir -ErrorAction SilentlyContinue
}

# Remove install-failure.json (it's a transient diagnostics artifact)
$failureDump = Join-Path $localData "install-failure.json"
if (Test-Path $failureDump) {
    Remove-Item -Force $failureDump -ErrorAction SilentlyContinue
}

# ── Step 3.5 — Reset install_id if requested ──────────────────────────────

if ($Reset) {
    if (Test-Path $installIdFile) {
        Remove-Item -Force $installIdFile -ErrorAction SilentlyContinue
        Write-MusuOk "Cleared install_id (per -Reset)"
    }
    # If localData has only install_id left after removing wsl/, kill the dir.
    if (Test-Path $localData) {
        $remaining = @(Get-ChildItem $localData -Force -ErrorAction SilentlyContinue)
        if ($remaining.Count -eq 0) {
            Remove-Item -Recurse -Force $localData -ErrorAction SilentlyContinue
        }
    }
} else {
    # Restore install_id file if we accidentally lost it (we didn't — we
    # only removed wsl/ and install-failure.json — but defensive in case
    # a future commit widens the cleanup).
    if ($installIdContent -and -not (Test-Path $installIdFile)) {
        if (-not (Test-Path $localData)) {
            New-Item -ItemType Directory -Force -Path $localData | Out-Null
        }
        Set-Content -Path $installIdFile -Value $installIdContent -Encoding UTF8 -NoNewline
    }
}

# ── Step 4 — Remove %ProgramData%\musu ─────────────────────────────────────

$progData = Join-Path $env:ProgramData "musu"
Write-MusuInfo "Step 4/6: removing $progData"
if (Test-Path $progData) {
    Remove-Item -Recurse -Force $progData -ErrorAction SilentlyContinue
    Write-MusuOk "$progData removed"
}

# ── Step 5 — Unregister Scheduled Task ─────────────────────────────────────

Write-MusuInfo "Step 5/6: Unregister Scheduled Task musu-install-resume"
Unregister-MusuResumeTask
Write-MusuOk "Scheduled Task removed (if present)"

# ── Step 6 — Remove Defender exclusion (C12 symmetric to install step 5.5) ──

Write-MusuInfo "Step 6/6: removing Defender exclusion (if present)"
$wslExcl = Join-Path $env:LOCALAPPDATA "musu\wsl"
try {
    Remove-MpPreference -ExclusionPath $wslExcl -ErrorAction Stop
    Write-MusuOk "Defender exclusion removed"
} catch {
    # Best-effort: Defender may not be present, or exclusion may not exist.
    # Silent on non-Defender hosts.
}

Write-MusuOk "musu uninstall complete"
exit 0
