[CmdletBinding()]
param(
    [string]$OutputPath,
    [switch]$Json,
    [switch]$FailOnProblem
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
. (Join-Path $scriptDir "msix-common.ps1")

function Write-Step([string]$Message) {
    if (-not $Json) {
        Write-Host "==> $Message"
    }
}

function New-Check {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [ValidateSet("pass", "fail")]
        [Parameter(Mandatory = $true)][string]$Status,
        [Parameter(Mandatory = $true)][string]$Message
    )

    [pscustomobject]@{
        name = $Name
        status = $Status
        message = $Message
    }
}

function Add-CheckFromCondition {
    param(
        [System.Collections.Generic.List[object]]$Checks,
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][bool]$Condition,
        [Parameter(Mandatory = $true)][string]$PassMessage,
        [Parameter(Mandatory = $true)][string]$FailMessage
    )

    $Checks.Add((New-Check -Name $Name -Status ($(if ($Condition) { "pass" } else { "fail" })) -Message ($(if ($Condition) { $PassMessage } else { $FailMessage })))) | Out-Null
}

function Split-PathList {
    param([AllowEmptyString()][string]$Value)

    if ([string]::IsNullOrWhiteSpace($Value)) {
        return @()
    }

    @($Value -split ";" | ForEach-Object {
        $entry = [Environment]::ExpandEnvironmentVariables(([string]$_).Trim())
        if (-not [string]::IsNullOrWhiteSpace($entry)) {
            $entry.TrimEnd("\")
        }
    } | Where-Object { -not [string]::IsNullOrWhiteSpace([string]$_) })
}

function Test-SamePath {
    param(
        [AllowEmptyString()][string]$Left,
        [AllowEmptyString()][string]$Right
    )

    if ([string]::IsNullOrWhiteSpace($Left) -or [string]::IsNullOrWhiteSpace($Right)) {
        return $false
    }

    $leftNormalized = ([System.IO.Path]::GetFullPath($Left)).TrimEnd("\")
    $rightNormalized = ([System.IO.Path]::GetFullPath($Right)).TrimEnd("\")
    return [string]::Equals($leftNormalized, $rightNormalized, [System.StringComparison]::OrdinalIgnoreCase)
}

function Get-MusuAliasSourcesFromPath {
    param(
        [Parameter(Mandatory = $true)][string[]]$PathEntries,
        [Parameter(Mandatory = $true)][string]$WindowsAppsAliasPath
    )

    $sources = New-Object System.Collections.Generic.List[string]
    $seen = New-Object 'System.Collections.Generic.HashSet[string]' ([System.StringComparer]::OrdinalIgnoreCase)
    foreach ($entry in @($PathEntries)) {
        if ([string]::IsNullOrWhiteSpace([string]$entry)) {
            continue
        }
        $candidate = Join-Path ([string]$entry) "musu.exe"
        if (-not (Test-Path -LiteralPath $candidate)) {
            continue
        }
        $full = [System.IO.Path]::GetFullPath($candidate)
        if ($seen.Add($full)) {
            $sources.Add($full) | Out-Null
        }
    }

    $firstAliasPath = if ($sources.Count -gt 0) { $sources[0] } else { $null }
    $alternateAliasSources = @($sources | Where-Object { -not (Test-SamePath -Left ([string]$_) -Right $WindowsAppsAliasPath) })
    $windowsAppsAliasDiscovered = @($sources | Where-Object { Test-SamePath -Left ([string]$_) -Right $WindowsAppsAliasPath }).Count -gt 0
    $shadowingSources = @()
    if (-not [string]::IsNullOrWhiteSpace([string]$firstAliasPath) -and -not (Test-SamePath -Left $firstAliasPath -Right $WindowsAppsAliasPath)) {
        $shadowingSources = @($firstAliasPath)
    }

    [pscustomobject]@{
        AliasSources = @($sources)
        FirstAliasPath = $firstAliasPath
        AlternateAliasSources = @($alternateAliasSources)
        AliasShadowing = @($shadowingSources)
        WindowsAppsAliasDiscovered = [bool]$windowsAppsAliasDiscovered
    }
}

Write-Step "Inspecting legacy direct-download Windows startup artifacts"

$conflicts = Get-MusuLegacyWindowsConflicts
$checks = New-Object System.Collections.Generic.List[object]

$startupHelperCount = @($conflicts.StartupHelpers).Count
$disabledHelperCount = @($conflicts.DisabledStartupHelpers).Count
$scheduledTaskCount = @($conflicts.ScheduledTasks).Count
$disabledTaskCount = @($conflicts.DisabledScheduledTasks).Count
$legacyBinCount = @($conflicts.LegacyBins).Count
$windowsAppsAliasPresent = if ($conflicts.PSObject.Properties["WindowsAppsAliasPresent"]) {
    [bool]$conflicts.WindowsAppsAliasPresent
}
else {
    -not [string]::IsNullOrWhiteSpace([string]$conflicts.WindowsAppsAlias) -and (Test-Path -LiteralPath $conflicts.WindowsAppsAlias)
}
$persistedPathEntries = @(
    Split-PathList ([Environment]::GetEnvironmentVariable("Path", "Machine"))
    Split-PathList ([Environment]::GetEnvironmentVariable("Path", "User"))
)
$persistedAliases = Get-MusuAliasSourcesFromPath -PathEntries $persistedPathEntries -WindowsAppsAliasPath ([string]$conflicts.WindowsAppsAlias)
$aliasShadowingCount = @($persistedAliases.AliasShadowing).Count
$alternateAliasCount = @($persistedAliases.AlternateAliasSources).Count
$currentProcessAliasShadowingCount = @($conflicts.AliasShadowing).Count
$currentProcessPathStale = ($aliasShadowingCount -eq 0 -and $currentProcessAliasShadowingCount -gt 0)
$windowsAppsAliasInvocation = if ($windowsAppsAliasPresent) {
    "& `"$($conflicts.WindowsAppsAlias)`""
}
else {
    $null
}
$aliasRemediation = if ($aliasShadowingCount -gt 0) {
    "Move '$env:LOCALAPPDATA\Microsoft\WindowsApps' before the shadowing PATH entry, or invoke the packaged app explicitly with $windowsAppsAliasInvocation. Do not delete developer binaries unless the operator intentionally retires that toolchain."
}
else {
    $null
}

Add-CheckFromCondition -Checks $checks -Name "scheduled task probe" -Condition (-not [bool]$conflicts.ScheduledTaskProbeTimedOut -and [string]::IsNullOrWhiteSpace([string]$conflicts.ScheduledTaskProbeError)) -PassMessage "scheduled tasks were enumerated" -FailMessage "scheduled task probe failed or timed out"
Add-CheckFromCondition -Checks $checks -Name "active startup helpers" -Condition ($startupHelperCount -eq 0) -PassMessage "no active legacy startup folder helpers" -FailMessage "$startupHelperCount active legacy startup folder helper(s) found"
Add-CheckFromCondition -Checks $checks -Name "active scheduled tasks" -Condition ($scheduledTaskCount -eq 0) -PassMessage "no active legacy scheduled tasks" -FailMessage "$scheduledTaskCount active legacy scheduled task(s) found"
Add-CheckFromCondition -Checks $checks -Name "legacy bin artifacts" -Condition ($legacyBinCount -eq 0) -PassMessage "no legacy ~/.musu/bin executables" -FailMessage "$legacyBinCount legacy ~/.musu/bin executable(s) found"
Add-CheckFromCondition -Checks $checks -Name "WindowsApps alias path" -Condition $windowsAppsAliasPresent -PassMessage "WindowsApps alias exists" -FailMessage "WindowsApps alias is missing"
Add-CheckFromCondition -Checks $checks -Name "persisted PATH alias shadowing" -Condition ($aliasShadowingCount -eq 0) -PassMessage "persisted User+Machine PATH does not shadow the WindowsApps alias" -FailMessage "$aliasShadowingCount persisted PATH entry/entries shadow the WindowsApps alias"

$failCount = @($checks | Where-Object { $_.status -eq "fail" }).Count
$result = [pscustomobject]@{
    schema = "musu.msix_legacy_conflicts.v1"
    ok = ($failCount -eq 0)
    generated_at = (Get-Date).ToString("o")
    operator_machine = $env:COMPUTERNAME
    operator_user = $env:USERNAME
    conflict_count = [int]$conflicts.ConflictCount
    startup_helper_count = $startupHelperCount
    disabled_startup_helper_count = $disabledHelperCount
    scheduled_task_count = $scheduledTaskCount
    disabled_scheduled_task_count = $disabledTaskCount
    scheduled_task_probe_timed_out = [bool]$conflicts.ScheduledTaskProbeTimedOut
    scheduled_task_probe_error = $conflicts.ScheduledTaskProbeError
    scheduled_task_probe_method = if ($conflicts.PSObject.Properties["ScheduledTaskProbeMethod"]) { $conflicts.ScheduledTaskProbeMethod } else { $null }
    legacy_bin_count = $legacyBinCount
    alias_shadowing_count = $aliasShadowingCount
    alternate_alias_count = $alternateAliasCount
    windowsapps_alias_path = $conflicts.WindowsAppsAlias
    windowsapps_alias_present = $windowsAppsAliasPresent
    windowsapps_alias_discovered = [bool]$persistedAliases.WindowsAppsAliasDiscovered
    windowsapps_alias_invocation = $windowsAppsAliasInvocation
    first_alias_path = $persistedAliases.FirstAliasPath
    alias_remediation = $aliasRemediation
    alias_sources = @($persistedAliases.AliasSources)
    alternate_alias_sources = @($persistedAliases.AlternateAliasSources)
    alias_shadowing = @($persistedAliases.AliasShadowing)
    alias_path_scope = "persisted_user_machine"
    current_process_alias_sources = @($conflicts.AliasSources)
    current_process_first_alias_path = if ($conflicts.PSObject.Properties["FirstAliasPath"]) { $conflicts.FirstAliasPath } else { $null }
    current_process_alternate_alias_sources = @($conflicts.AlternateAliasSources)
    current_process_alias_shadowing = @($conflicts.AliasShadowing)
    current_process_alias_shadowing_count = $currentProcessAliasShadowingCount
    current_process_path_stale = [bool]$currentProcessPathStale
    startup_helpers = @($conflicts.StartupHelpers | Select-Object Name, FullName)
    disabled_startup_helpers = @($conflicts.DisabledStartupHelpers | Select-Object Name, FullName)
    scheduled_tasks = @($conflicts.ScheduledTasks | Select-Object TaskName, TaskPath, State)
    disabled_scheduled_tasks = @($conflicts.DisabledScheduledTasks | Select-Object TaskName, TaskPath, State)
    legacy_bins = @($conflicts.LegacyBins)
    checks = $checks.ToArray()
    output_path = if ([string]::IsNullOrWhiteSpace($OutputPath)) { $null } else { [System.IO.Path]::GetFullPath($OutputPath) }
}

if (-not [string]::IsNullOrWhiteSpace($OutputPath)) {
    $outputParent = Split-Path -Parent $OutputPath
    if (-not [string]::IsNullOrWhiteSpace($outputParent)) {
        New-Item -ItemType Directory -Force -Path $outputParent | Out-Null
    }
    $result | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $OutputPath -Encoding UTF8
}

if ($Json) {
    $result | ConvertTo-Json -Depth 8
    if ($FailOnProblem -and -not [bool]$result.ok) {
        exit 1
    }
    return
}

[pscustomobject]@{
    Ok                         = $result.ok
    ConflictCount              = $conflicts.ConflictCount
    StartupHelperCount         = $startupHelperCount
    DisabledHelperCount        = $disabledHelperCount
    ScheduledTaskCount         = $scheduledTaskCount
    DisabledTaskCount          = $disabledTaskCount
    LegacyBinCount             = $legacyBinCount
    AliasShadowingCount        = $aliasShadowingCount
    CurrentProcessAliasShadowingCount = $currentProcessAliasShadowingCount
    CurrentProcessPathStale    = [bool]$currentProcessPathStale
    WindowsAppsAliasPath       = $conflicts.WindowsAppsAlias
    WindowsAppsAliasPresent    = $windowsAppsAliasPresent
    ScheduledTaskProbeTimedOut = [bool]$conflicts.ScheduledTaskProbeTimedOut
    ScheduledTaskProbeError    = $conflicts.ScheduledTaskProbeError
    ScheduledTaskProbeMethod   = if ($conflicts.PSObject.Properties["ScheduledTaskProbeMethod"]) { $conflicts.ScheduledTaskProbeMethod } else { $null }
} | Format-List

if (-not [string]::IsNullOrWhiteSpace([string]$windowsAppsAliasInvocation)) {
    Write-Host ""
    Write-Host "Packaged WindowsApps alias invocation:"
    Write-Host $windowsAppsAliasInvocation
}

if (@($conflicts.StartupHelpers).Count -gt 0) {
    Write-Host ""
    Write-Host "Startup folder helpers:"
    $conflicts.StartupHelpers | Select-Object Name, FullName | Format-Table -AutoSize
}

if (@($conflicts.ScheduledTasks).Count -gt 0) {
    Write-Host ""
    Write-Host "Scheduled tasks:"
    $conflicts.ScheduledTasks | Select-Object TaskName, TaskPath, State | Format-Table -AutoSize
}

if (@($conflicts.DisabledStartupHelpers).Count -gt 0) {
    Write-Host ""
    Write-Host "Disabled startup helpers:"
    $conflicts.DisabledStartupHelpers | Select-Object Name, FullName | Format-Table -AutoSize
}

if (@($conflicts.DisabledScheduledTasks).Count -gt 0) {
    Write-Host ""
    Write-Host "Disabled scheduled tasks:"
    $conflicts.DisabledScheduledTasks | Select-Object TaskName, TaskPath, State | Format-Table -AutoSize
}

if (@($conflicts.LegacyBins).Count -gt 0) {
    Write-Host ""
    Write-Host "Legacy ~/.musu/bin artifacts:"
    $conflicts.LegacyBins | ForEach-Object { Write-Host $_ }
}

if (@($persistedAliases.AliasShadowing).Count -gt 0) {
    Write-Host ""
    Write-Host "Persisted PATH entries shadowing the WindowsApps alias:"
    $persistedAliases.AliasShadowing | ForEach-Object { Write-Host $_ }
    if (-not [string]::IsNullOrWhiteSpace([string]$aliasRemediation)) {
        Write-Host ""
        Write-Host "Alias remediation:"
        Write-Host $aliasRemediation
    }
}

if (@($persistedAliases.AlternateAliasSources).Count -gt 0) {
    Write-Host ""
    Write-Host "Other musu.exe entries visible in persisted PATH:"
    $persistedAliases.AlternateAliasSources | ForEach-Object { Write-Host $_ }
}

if ($currentProcessPathStale) {
    Write-Host ""
    Write-Host "Current process PATH is stale and still resolves a shadowing musu.exe first:"
    $conflicts.AliasShadowing | ForEach-Object { Write-Host $_ }
    Write-Host "Start a fresh terminal or run release commands through the explicit WindowsApps alias."
}

if ($FailOnProblem -and -not [bool]$result.ok) {
    exit 1
}
