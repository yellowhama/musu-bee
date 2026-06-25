[CmdletBinding()]
param(
    [switch]$AssertHealthyStartup
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Write-Step([string]$Message) {
    Write-Host "==> $Message"
}

function Normalize-LoopbackAddr([string]$Addr) {
    if ([string]::IsNullOrWhiteSpace($Addr)) {
        return $null
    }
    return ($Addr `
        -replace '^0\.0\.0\.0:', '127.0.0.1:' `
        -replace '^\[::\]:', '127.0.0.1:' `
        -replace '^:::', '127.0.0.1:')
}

function Get-PersistedStartupRegistration([string]$PackageFamilyName, [string]$TaskId) {
    if ([string]::IsNullOrWhiteSpace($PackageFamilyName) -or [string]::IsNullOrWhiteSpace($TaskId)) {
        return $null
    }

    $keyPath = "HKCU:\Software\Classes\Local Settings\Software\Microsoft\Windows\CurrentVersion\AppModel\SystemAppData\{0}\{1}" -f $PackageFamilyName, $TaskId
    if (-not (Test-Path -LiteralPath $keyPath)) {
        return $null
    }

    $props = Get-ItemProperty -LiteralPath $keyPath
    return [pscustomobject]@{
        Path                  = $keyPath
        State                 = $props.State
        UserEnabledStartupOnce = $props.UserEnabledStartupOnce
    }
}

$aliasPath = Join-Path $env:LOCALAPPDATA "Microsoft\WindowsApps\musu.exe"
if (-not (Test-Path -LiteralPath $aliasPath)) {
    throw "WindowsApps alias not found at $aliasPath. Install the MSIX package first."
}

Write-Step "Querying packaged startup state"
$packageRaw = & $aliasPath package-status
if ($LASTEXITCODE -ne 0) {
    throw "musu package-status failed via $aliasPath"
}
$packageStatus = $packageRaw | ConvertFrom-Json
$pkg = Get-AppxPackage -Name blossompark.musu -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $pkg) {
    $pkg = Get-AppxPackage -Name Yellowhama.MUSU -ErrorAction SilentlyContinue | Select-Object -First 1
}
$packageFamilyName = if ($pkg) { $pkg.PackageFamilyName } else { $null }
$persistedStartup = Get-PersistedStartupRegistration -PackageFamilyName $packageFamilyName -TaskId ([string]$packageStatus.startup_task_id)

$musuHome = Join-Path $HOME ".musu"
$servicesDir = Join-Path $musuHome "services"
$startupMarkerPath = Join-Path $servicesDir "startup-marker.json"
$bridgeRegistryPath = Join-Path $servicesDir "bridge.json"

$startupMarker = $null
if (Test-Path -LiteralPath $startupMarkerPath) {
    $startupMarker = Get-Content -LiteralPath $startupMarkerPath | ConvertFrom-Json
}

$bridgeRegistry = $null
$bridgeAddr = $null
if (Test-Path -LiteralPath $bridgeRegistryPath) {
    $bridgeRegistry = Get-Content -LiteralPath $bridgeRegistryPath | ConvertFrom-Json
    $bridgeAddr = Normalize-LoopbackAddr ([string]$bridgeRegistry.addr)
}
if (-not $bridgeAddr) {
    $bridgeAddr = "127.0.0.1:8070"
}

$healthCode = $null
$healthOk = $false
$healthError = $null
try {
    $health = Invoke-WebRequest -Uri ("http://{0}/health" -f $bridgeAddr) -UseBasicParsing -TimeoutSec 3
    $healthCode = $health.StatusCode
    $healthOk = ($health.StatusCode -eq 200)
}
catch {
    $healthError = $_.Exception.Message
}

$verdict = if (-not $packageStatus.has_package_identity) {
    "package-identity-missing"
}
elseif ($packageStatus.startup_task_state -notin @("enabled", "enabled-by-policy")) {
    "startup-task-not-enabled"
}
elseif ($persistedStartup -and -not $startupMarker) {
    "startup-registered-awaiting-logon"
}
elseif (-not $startupMarker) {
    "startup-not-yet-observed"
}
elseif (-not $healthOk) {
    "startup-launched-bridge-unhealthy"
}
else {
    "startup-healthy"
}

$result = [pscustomobject]@{
    Verdict                  = $verdict
    PackageIdentity          = $packageStatus.package_full_name
    PackageFamilyName        = $packageFamilyName
    StartupTaskState         = $packageStatus.startup_task_state
    StartupTaskStateValue    = $packageStatus.startup_task_state_value
    StartupTaskError         = $packageStatus.startup_task_error
    PersistedStartupPresent  = [bool]$persistedStartup
    PersistedStartupState    = if ($persistedStartup) { $persistedStartup.State } else { $null }
    PersistedStartupUserEnabledStartupOnce = if ($persistedStartup) { $persistedStartup.UserEnabledStartupOnce } else { $null }
    PersistedStartupPath     = if ($persistedStartup) { $persistedStartup.Path } else { $null }
    StartupMarkerPresent     = [bool]$startupMarker
    StartupMarkerStage       = if ($startupMarker) { [string]$startupMarker.stage } else { $null }
    StartupMarkerTimestamp   = if ($startupMarker) { [string]$startupMarker.timestamp_utc } else { $null }
    StartupMarkerDetail      = if ($startupMarker) { [string]$startupMarker.detail } else { $null }
    BridgeRegistryPresent    = [bool]$bridgeRegistry
    BridgeAddr               = $bridgeAddr
    BridgePid                = if ($bridgeRegistry) { $bridgeRegistry.pid } else { $null }
    HealthCode               = $healthCode
    Healthy                  = $healthOk
    HealthError              = $healthError
}

$result | Format-List

if ($AssertHealthyStartup) {
    $readyStates = @("enabled", "enabled-by-policy")
    if (-not $packageStatus.has_package_identity) {
        throw "Packaged runtime did not report package identity."
    }
    if ($packageStatus.startup_task_state -notin $readyStates) {
        throw "Startup task is not enabled. State: $($packageStatus.startup_task_state)"
    }
    if (-not $startupMarker) {
        throw "Startup marker not found at $startupMarkerPath. The startup task likely did not launch."
    }
    if (-not $healthOk) {
        throw "Startup launched but the bridge is not healthy at http://$bridgeAddr/health. $healthError"
    }
}
