[CmdletBinding()]
param(
    [switch]$AssertReady
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Write-Step([string]$Message) {
    Write-Host "==> $Message"
}

function Invoke-PackagedAppActivation([string]$PackageFamilyName, [string]$ApplicationId) {
    if ([string]::IsNullOrWhiteSpace($PackageFamilyName) -or [string]::IsNullOrWhiteSpace($ApplicationId)) {
        throw "PackageFamilyName and ApplicationId are required for AppsFolder activation."
    }

    $appUserModelId = "{0}!{1}" -f $PackageFamilyName, $ApplicationId
    Start-Process "shell:AppsFolder\$appUserModelId"
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
        Path                   = $keyPath
        State                  = $props.State
        UserEnabledStartupOnce = $props.UserEnabledStartupOnce
    }
}

function Get-PackageStatus([string]$AliasPath) {
    $raw = & $AliasPath package-status
    if ($LASTEXITCODE -ne 0) {
        throw "musu package-status failed via $AliasPath"
    }
    return ($raw | ConvertFrom-Json)
}

$aliasPath = Join-Path $env:LOCALAPPDATA "Microsoft\WindowsApps\musu.exe"
if (-not (Test-Path -LiteralPath $aliasPath)) {
    throw "WindowsApps alias not found at $aliasPath. Install the MSIX package first."
}

Write-Step "Querying packaged musu runtime state through the WindowsApps alias"
$status = Get-PackageStatus -AliasPath $aliasPath
$pkg = Get-AppxPackage -Name blossompark.musu -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $pkg) {
    $pkg = Get-AppxPackage -Name Yellowhama.MUSU -ErrorAction SilentlyContinue | Select-Object -First 1
}
$packageFamilyName = if ($pkg) { $pkg.PackageFamilyName } else { $null }
$applicationId = "MUSU"
$persisted = Get-PersistedStartupRegistration -PackageFamilyName $packageFamilyName -TaskId ([string]$status.startup_task_id)
$status | Format-List
if ($persisted) {
    $persisted | Format-List
}

if ($AssertReady) {
    if (-not $status.has_package_identity) {
        throw "Packaged runtime did not report package identity."
    }

    $readyStates = @("enabled", "enabled-by-policy")
    $startupPrimed = ($persisted -and $persisted.UserEnabledStartupOnce -gt 0)
    if (($status.startup_task_state -notin $readyStates) -or (-not $startupPrimed)) {
        Write-Step "Startup task is not ready yet; warming the packaged app through AppsFolder activation"
        Invoke-PackagedAppActivation -PackageFamilyName $packageFamilyName -ApplicationId $applicationId
        Start-Sleep -Seconds 3
        $status = Get-PackageStatus -AliasPath $aliasPath
        $pkg = Get-AppxPackage -Name blossompark.musu -ErrorAction SilentlyContinue | Select-Object -First 1
        if (-not $pkg) {
            $pkg = Get-AppxPackage -Name Yellowhama.MUSU -ErrorAction SilentlyContinue | Select-Object -First 1
        }
        $packageFamilyName = if ($pkg) { $pkg.PackageFamilyName } else { $null }
        $persisted = Get-PersistedStartupRegistration -PackageFamilyName $packageFamilyName -TaskId ([string]$status.startup_task_id)
        $status | Format-List
        if ($persisted) {
            $persisted | Format-List
        }
    }

    if ($status.startup_task_state -notin $readyStates) {
        throw @"
Packaged startup task is not in a ready state after warmup.

startup_task_state = '$($status.startup_task_state)'
startup_task_state_value = '$($status.startup_task_state_value)'
startup_task_error = '$($status.startup_task_error)'

Expected one of: $($readyStates -join ", ")
"@
    }
    if (-not $persisted) {
        throw "Persisted startup registration was not found after warmup."
    }
    if ($persisted.UserEnabledStartupOnce -le 0) {
        $platformHint = $null
        if ($status.startup_task_prime_attempted -and $status.startup_task_prime_result -eq "enabled -> enabled") {
            $platformHint = "The packaged app stayed 'enabled' but never became primed after both RequestEnableAsync and AppsFolder activation. On this machine, local sideload is not arming startup; the remaining Windows path is ImmediateRegistration with the restricted startup capability."
        }
        throw @"
Packaged startup task is still not primed after warmup.

startup_task_state = '$($status.startup_task_state)'
startup_task_state_value = '$($status.startup_task_state_value)'
UserEnabledStartupOnce = '$($persisted.UserEnabledStartupOnce)'
PersistedStartupPath = '$($persisted.Path)'
platform_hint = '$platformHint'
"@
    }
}
