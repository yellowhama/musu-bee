# musu-backend.tar build wrapper — V23.2 Workstream B4a (wiki/370)
#
# Thin PowerShell wrapper that shells into an Alpine WSL2 build distro and
# invokes build-musu-backend.sh. The truth lives in the .sh; this exists so
# a Windows-only operator can run the build without leaving PowerShell.
#
# Critic C5 (MEDIUM) RESOLUTION: build distro MUST be Alpine. apk is the
# bootstrap tool used by build-musu-backend.sh step 1; Ubuntu/Debian distros
# require multi-step apk-tools-static extraction that this wrapper refuses
# to script. If `-BuildDistro` is omitted, we default to "Alpine".
#
# Usage:
#   .\build-musu-backend.ps1 -Arch amd64 -K3sVersion v1.30.4 -Output .\musu-backend.tar
#   .\build-musu-backend.ps1 -Arch amd64 -K3sVersion v1.30.4 -Output .\musu-backend.tar -AllowOversize
#   .\build-musu-backend.ps1 -Arch amd64 -K3sVersion v1.30.4 -Output .\musu-backend.tar -BuildDistro Alpine

[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)][ValidateSet("amd64","arm64")][string]$Arch,
    [Parameter(Mandatory=$true)][string]$K3sVersion,
    [Parameter(Mandatory=$true)][string]$Output,
    [switch]$AllowOversize,
    [string]$BuildDistro = "Alpine"
)

$ErrorActionPreference = "Stop"

# ── Locate the .sh next to this .ps1 ───────────────────────────────────────
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$shPath    = Join-Path $scriptDir "build-musu-backend.sh"
if (-not (Test-Path $shPath)) {
    Write-Error "build-musu-backend.sh not found at $shPath"
    exit 1
}

# ── Verify WSL is present ──────────────────────────────────────────────────
try {
    $null = & wsl.exe --status 2>&1
} catch {
    Write-Error "wsl.exe not available. Enable WSL2 (Windows 10 2004+ or Windows 11) before building."
    exit 1
}

# ── Verify the build distro is registered AND is Alpine ────────────────────
# `wsl --list --quiet` writes UTF-16 LE with NULs interleaved; normalize.
$distros = (& wsl.exe --list --quiet 2>$null) -join "`n"
$distros = $distros -replace "`0",""
$distroList = $distros -split "`r?`n" | ForEach-Object { $_.Trim() } | Where-Object { $_ -ne "" }

if ($distroList -notcontains $BuildDistro) {
    Write-Error @"
Build distro '$BuildDistro' not registered.

Critic C5 (HIGH/MEDIUM) requires the build host to be Alpine WSL2:
  1. Install the 'Alpine WSL' distro from the Microsoft Store
     (maintained by the Alpine Linux project), OR
  2. wsl --install -d Alpine

Then re-run this script. Currently-registered distros:
$($distroList -join ', ')
"@
    exit 1
}

# Soft check: warn if BuildDistro name doesn't smell like Alpine.
if ($BuildDistro -notmatch '^(?i)alpine') {
    Write-Warning "BuildDistro '$BuildDistro' does not match /^alpine/i. build-musu-backend.sh requires apk; if this distro lacks apk the build will fail at step 1."
}

# ── Translate Windows paths to WSL paths for the .sh invocation ───────────
function ConvertTo-WslPath {
    param([string]$WinPath)
    # wsl.exe ships wslpath inside every distro; use it via the build distro.
    $resolved = (Resolve-Path -LiteralPath $WinPath -ErrorAction SilentlyContinue)
    if ($resolved) { $WinPath = $resolved.Path }
    $wp = (& wsl.exe -d $BuildDistro -- wslpath -a "$WinPath") 2>$null
    if (-not $wp) { Write-Error "wslpath failed for $WinPath" ; exit 1 }
    return ($wp.Trim())
}

# Output path: ensure parent dir exists on Windows side first.
$outputParent = Split-Path -Parent $Output
if (-not [string]::IsNullOrEmpty($outputParent) -and -not (Test-Path $outputParent)) {
    New-Item -ItemType Directory -Force -Path $outputParent | Out-Null
}
# Create empty file so Resolve-Path can canonicalize it, then delete (the .sh
# will recreate it). This lets us produce an absolute WSL path.
if (-not (Test-Path $Output)) { New-Item -ItemType File -Path $Output | Out-Null }
$wslOutput = ConvertTo-WslPath $Output
Remove-Item -Force $Output -ErrorAction SilentlyContinue

$wslShPath = ConvertTo-WslPath $shPath

# ── Build the .sh invocation ───────────────────────────────────────────────
$shArgs = @(
    "--arch", $Arch,
    "--k3s-version", $K3sVersion,
    "--output", $wslOutput
)
if ($AllowOversize) { $shArgs += "--allow-oversize" }

Write-Host "Invoking build inside WSL distro '$BuildDistro':"
Write-Host "  bash $wslShPath $($shArgs -join ' ')"
Write-Host ""

& wsl.exe -d $BuildDistro -- bash $wslShPath @shArgs
$exit = $LASTEXITCODE

if ($exit -ne 0) {
    Write-Error "build-musu-backend.sh exited with code $exit"
    exit $exit
}

Write-Host ""
Write-Host "Build successful. Output: $Output"
if (Test-Path "$Output.sha256") {
    $hash = (Get-Content "$Output.sha256" -Raw).Trim()
    Write-Host "SHA-256: $hash"
}
