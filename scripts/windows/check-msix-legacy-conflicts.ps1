[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
. (Join-Path $scriptDir "msix-common.ps1")

function Write-Step([string]$Message) {
    Write-Host "==> $Message"
}

Write-Step "Inspecting legacy direct-download Windows startup artifacts"

$conflicts = Get-MusuLegacyWindowsConflicts

[pscustomobject]@{
    ConflictCount        = $conflicts.ConflictCount
    StartupHelperCount   = @($conflicts.StartupHelpers).Count
    DisabledHelperCount  = @($conflicts.DisabledStartupHelpers).Count
    ScheduledTaskCount   = @($conflicts.ScheduledTasks).Count
    DisabledTaskCount    = @($conflicts.DisabledScheduledTasks).Count
    LegacyBinCount       = @($conflicts.LegacyBins).Count
    AliasShadowingCount  = @($conflicts.AliasShadowing).Count
    WindowsAppsAliasPath = $conflicts.WindowsAppsAlias
} | Format-List

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
}
