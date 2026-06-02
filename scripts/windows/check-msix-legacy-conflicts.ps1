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

Write-Step "Inspecting legacy direct-download Windows startup artifacts"

$conflicts = Get-MusuLegacyWindowsConflicts
$checks = New-Object System.Collections.Generic.List[object]

$startupHelperCount = @($conflicts.StartupHelpers).Count
$disabledHelperCount = @($conflicts.DisabledStartupHelpers).Count
$scheduledTaskCount = @($conflicts.ScheduledTasks).Count
$disabledTaskCount = @($conflicts.DisabledScheduledTasks).Count
$legacyBinCount = @($conflicts.LegacyBins).Count
$aliasShadowingCount = @($conflicts.AliasShadowing).Count
$alternateAliasCount = @($conflicts.AlternateAliasSources).Count
$windowsAppsAliasPresent = if ($conflicts.PSObject.Properties["WindowsAppsAliasPresent"]) {
    [bool]$conflicts.WindowsAppsAliasPresent
}
else {
    -not [string]::IsNullOrWhiteSpace([string]$conflicts.WindowsAppsAlias) -and (Test-Path -LiteralPath $conflicts.WindowsAppsAlias)
}
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
Add-CheckFromCondition -Checks $checks -Name "PATH alias shadowing" -Condition ($aliasShadowingCount -eq 0) -PassMessage "PATH does not shadow the WindowsApps alias" -FailMessage "$aliasShadowingCount PATH entry/entries shadow the WindowsApps alias"

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
    legacy_bin_count = $legacyBinCount
    alias_shadowing_count = $aliasShadowingCount
    alternate_alias_count = $alternateAliasCount
    windowsapps_alias_path = $conflicts.WindowsAppsAlias
    windowsapps_alias_present = $windowsAppsAliasPresent
    windowsapps_alias_discovered = if ($conflicts.PSObject.Properties["WindowsAppsAliasDiscovered"]) { [bool]$conflicts.WindowsAppsAliasDiscovered } else { $null }
    windowsapps_alias_invocation = $windowsAppsAliasInvocation
    first_alias_path = if ($conflicts.PSObject.Properties["FirstAliasPath"]) { $conflicts.FirstAliasPath } else { $null }
    alias_remediation = $aliasRemediation
    alias_sources = @($conflicts.AliasSources)
    alternate_alias_sources = @($conflicts.AlternateAliasSources)
    alias_shadowing = @($conflicts.AliasShadowing)
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
    WindowsAppsAliasPath       = $conflicts.WindowsAppsAlias
    WindowsAppsAliasPresent    = $windowsAppsAliasPresent
    ScheduledTaskProbeTimedOut = [bool]$conflicts.ScheduledTaskProbeTimedOut
    ScheduledTaskProbeError    = $conflicts.ScheduledTaskProbeError
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

if (@($conflicts.AliasShadowing).Count -gt 0) {
    Write-Host ""
    Write-Host "PATH entries shadowing the WindowsApps alias:"
    $conflicts.AliasShadowing | ForEach-Object { Write-Host $_ }
    if (-not [string]::IsNullOrWhiteSpace([string]$aliasRemediation)) {
        Write-Host ""
        Write-Host "Alias remediation:"
        Write-Host $aliasRemediation
    }
}

if (@($conflicts.AlternateAliasSources).Count -gt 0) {
    Write-Host ""
    Write-Host "Other musu.exe entries visible in PATH:"
    $conflicts.AlternateAliasSources | ForEach-Object { Write-Host $_ }
}

if ($FailOnProblem -and -not [bool]$result.ok) {
    exit 1
}
