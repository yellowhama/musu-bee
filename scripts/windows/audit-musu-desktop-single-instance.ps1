[CmdletBinding()]
param(
    [string]$AppUserModelId,
    [string]$PackageName = "Yellowhama.MUSU",
    [string]$ApplicationId = "MUSU",
    [int]$RepeatCount = 3,
    [int]$ActivationDelaySec = 4,
    [int]$MaxDesktopProcessCount = 1,
    [string]$OutputPath,
    [switch]$RequireInstalledPackage,
    [switch]$CleanupExtraDesktopShells,
    [switch]$FailOnProblem,
    [switch]$Json
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = (Resolve-Path (Join-Path $scriptDir "..\..")).Path
$version = (Get-Content -LiteralPath (Join-Path $repoRoot "VERSION") -Raw).Trim()
$gitCommit = (& git -C $repoRoot rev-parse HEAD 2>$null | Out-String).Trim()
$gitStatus = (& git -C $repoRoot status --short 2>$null | Out-String).Trim()

function Get-NullableProperty {
    param(
        [Parameter(Mandatory = $true)][object]$InputObject,
        [Parameter(Mandatory = $true)][string]$Name
    )

    if ($InputObject -and $InputObject.PSObject.Properties[$Name]) {
        return $InputObject.$Name
    }
    return $null
}

function Get-ProcessSnapshot {
    param([string]$Name = "musu-desktop")

    @(
        Get-Process -Name $Name -ErrorAction SilentlyContinue | ForEach-Object {
            $path = $null
            try {
                $path = $_.Path
            }
            catch {
                $path = $null
            }

            $startTime = $null
            try {
                $startTime = $_.StartTime.ToString("o")
            }
            catch {
                $startTime = $null
            }

            $cpuSeconds = $null
            try {
                if ($null -ne $_.CPU) {
                    $cpuSeconds = [double]$_.CPU
                }
            }
            catch {
                $cpuSeconds = $null
            }

            [pscustomobject]@{
                pid = [int]$_.Id
                name = [string]$_.ProcessName
                path = $path
                start_time = $startTime
                cpu_seconds = $cpuSeconds
                working_set_mb = [math]::Round(([double]$_.WorkingSet64 / 1MB), 2)
            }
        }
    )
}

function Add-Check {
    param(
        [System.Collections.Generic.List[object]]$List,
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][bool]$Passed,
        [Parameter(Mandatory = $true)][string]$PassMessage,
        [Parameter(Mandatory = $true)][string]$FailMessage
    )

    $status = "fail"
    $message = $FailMessage
    if ($Passed) {
        $status = "pass"
        $message = $PassMessage
    }

    $List.Add([pscustomobject]@{
        name = $Name
        status = $status
        message = $message
    }) | Out-Null
}

if ($RepeatCount -lt 1) {
    throw "RepeatCount must be at least 1."
}
if ($ActivationDelaySec -lt 0) {
    throw "ActivationDelaySec must be 0 or greater."
}
if ($MaxDesktopProcessCount -lt 0) {
    throw "MaxDesktopProcessCount must be 0 or greater."
}

$package = Get-AppxPackage -Name $PackageName -ErrorAction SilentlyContinue | Select-Object -First 1
$resolvedAppUserModelId = $AppUserModelId
if ([string]::IsNullOrWhiteSpace($resolvedAppUserModelId) -and $package) {
    $resolvedAppUserModelId = "{0}!{1}" -f $package.PackageFamilyName, $ApplicationId
}

$startApp = $null
if (-not [string]::IsNullOrWhiteSpace($resolvedAppUserModelId)) {
    try {
        $startApp = Get-StartApps | Where-Object { $_.AppID -eq $resolvedAppUserModelId } | Select-Object -First 1
    }
    catch {
        $startApp = $null
    }
}

$before = Get-ProcessSnapshot
$beforePids = @($before | ForEach-Object { [int]$_.pid })
$activations = New-Object System.Collections.Generic.List[object]

if (-not [string]::IsNullOrWhiteSpace($resolvedAppUserModelId)) {
    for ($i = 1; $i -le $RepeatCount; $i++) {
        $startedAt = (Get-Date).ToString("o")
        $errorMessage = $null
        try {
            Start-Process -FilePath "explorer.exe" -ArgumentList ("shell:AppsFolder\{0}" -f $resolvedAppUserModelId)
            Start-Sleep -Seconds $ActivationDelaySec
        }
        catch {
            $errorMessage = $_.Exception.Message
        }

        $snapshot = Get-ProcessSnapshot
        $activations.Add([pscustomobject]@{
            index = $i
            started_at = $startedAt
            app_user_model_id = $resolvedAppUserModelId
            error = $errorMessage
            desktop_process_count_after_activation = @($snapshot).Count
            desktop_pids_after_activation = @($snapshot | ForEach-Object { [int]$_.pid })
        }) | Out-Null
    }
}

$after = Get-ProcessSnapshot
$afterPids = @($after | ForEach-Object { [int]$_.pid })
$newPids = @($afterPids | Where-Object { $beforePids -notcontains $_ })
$beforeCount = [int]@($before).Count
$afterCount = [int]@($after).Count
$newDesktopShellCount = [int]@($newPids).Count

$cleanup = [pscustomobject]@{
    requested = [bool]$CleanupExtraDesktopShells
    stopped_pids = @()
    errors = @()
    final_desktop_shell_count = $afterCount
    final_desktop_pids = @($afterPids)
}

if ($CleanupExtraDesktopShells -and $afterCount -gt $MaxDesktopProcessCount) {
    $orderedAfter = @($after | Sort-Object start_time, pid)
    $preservePids = @($orderedAfter | Select-Object -First $MaxDesktopProcessCount | ForEach-Object { [int]$_.pid })
    $stopPids = @($orderedAfter | Where-Object { $preservePids -notcontains [int]$_.pid } | ForEach-Object { [int]$_.pid })
    $stopped = New-Object System.Collections.Generic.List[int]
    $cleanupErrors = New-Object System.Collections.Generic.List[string]

    foreach ($desktopPid in $stopPids) {
        try {
            Stop-Process -Id $desktopPid -Force -ErrorAction Stop
            [void]$stopped.Add($desktopPid)
        }
        catch {
            [void]$cleanupErrors.Add(("pid {0}: {1}" -f $desktopPid, $_.Exception.Message))
        }
    }

    Start-Sleep -Seconds 1
    $final = Get-ProcessSnapshot
    $cleanup = [pscustomobject]@{
        requested = [bool]$CleanupExtraDesktopShells
        stopped_pids = @($stopped)
        errors = @($cleanupErrors)
        final_desktop_shell_count = @($final).Count
        final_desktop_pids = @($final | ForEach-Object { [int]$_.pid })
    }
}

$activationAttemptCount = [int]$activations.Count
$activationFailures = @($activations | Where-Object { -not [string]::IsNullOrWhiteSpace([string]$_.error) })
$activationFailureCount = [int]@($activationFailures).Count
$checks = New-Object System.Collections.Generic.List[object]

Add-Check `
    -List $checks `
    -Name "package installed" `
    -Passed ((-not $RequireInstalledPackage) -or ($null -ne $package)) `
    -PassMessage "MSIX package lookup is present or not required" `
    -FailMessage "MSIX package '$PackageName' is not installed"

Add-Check `
    -List $checks `
    -Name "AppUserModelId resolved" `
    -Passed (-not [string]::IsNullOrWhiteSpace($resolvedAppUserModelId)) `
    -PassMessage "AppUserModelId is $resolvedAppUserModelId" `
    -FailMessage "AppUserModelId could not be resolved"

Add-Check `
    -List $checks `
    -Name "Start menu registration" `
    -Passed (($null -ne $startApp) -or (-not $RequireInstalledPackage)) `
    -PassMessage "Start menu registration was found or not required" `
    -FailMessage "Start menu registration for '$resolvedAppUserModelId' was not found"

Add-Check `
    -List $checks `
    -Name "repeat count" `
    -Passed ($RepeatCount -ge 2) `
    -PassMessage "repeat_count is $RepeatCount" `
    -FailMessage "repeat_count is $RepeatCount; expected at least 2"

Add-Check `
    -List $checks `
    -Name "activation attempts" `
    -Passed (($activationAttemptCount -eq $RepeatCount) -and ($activationFailureCount -eq 0)) `
    -PassMessage "all $RepeatCount desktop activations were attempted without process launch errors" `
    -FailMessage ("{0}/{1} activation attempts failed or were skipped" -f $activationFailureCount, $RepeatCount)

Add-Check `
    -List $checks `
    -Name "baseline desktop shell count" `
    -Passed ($beforeCount -le $MaxDesktopProcessCount) `
    -PassMessage ("baseline desktop shell count {0} <= {1}" -f $beforeCount, $MaxDesktopProcessCount) `
    -FailMessage ("baseline desktop shell count {0} exceeds {1}" -f $beforeCount, $MaxDesktopProcessCount)

Add-Check `
    -List $checks `
    -Name "desktop shell count after repeated activation" `
    -Passed ($afterCount -le $MaxDesktopProcessCount) `
    -PassMessage ("desktop shell count after repeated activation {0} <= {1}" -f $afterCount, $MaxDesktopProcessCount) `
    -FailMessage ("desktop shell count after repeated activation {0} exceeds {1}" -f $afterCount, $MaxDesktopProcessCount)

Add-Check `
    -List $checks `
    -Name "new desktop shell count" `
    -Passed ($newDesktopShellCount -le $MaxDesktopProcessCount) `
    -PassMessage ("new desktop shell count {0} <= {1}" -f $newDesktopShellCount, $MaxDesktopProcessCount) `
    -FailMessage ("new desktop shell count {0} exceeds {1}" -f $newDesktopShellCount, $MaxDesktopProcessCount)

if ($CleanupExtraDesktopShells) {
    Add-Check `
        -List $checks `
        -Name "cleanup completed" `
        -Passed ((@($cleanup.errors).Count -eq 0) -and ([int]$cleanup.final_desktop_shell_count -le $MaxDesktopProcessCount)) `
        -PassMessage "cleanup left the desktop shell count inside the configured budget" `
        -FailMessage ("cleanup errors or remaining desktop shell count outside budget: {0}" -f (@($cleanup.errors) -join "; "))
}

$failCount = @($checks | Where-Object { $_.status -eq "fail" }).Count
$startAppRecord = $null
if ($startApp) {
    $startAppRecord = [pscustomobject]@{
        name = [string]$startApp.Name
        app_id = [string]$startApp.AppID
    }
}
$packageFullName = $null
$packageFamilyName = $null
if ($package) {
    $packageFullName = [string]$package.PackageFullName
    $packageFamilyName = [string]$package.PackageFamilyName
}
$gitDirty = -not [string]::IsNullOrWhiteSpace($gitStatus)
$operatorMachine = $env:COMPUTERNAME
$beforeProcesses = @($before)
$afterProcesses = @($after)
$newDesktopPids = @($newPids)
$activationRecords = @($activations.ToArray())
$checkRecords = @($checks.ToArray())
$recordedAt = (Get-Date).ToString("o")
$ok = ($failCount -eq 0)

$result = [pscustomobject]@{
    schema = "musu.desktop_single_instance_audit.v1"
    recorded_at = $recordedAt
    version = $version
    repo_root = $repoRoot
    git_commit = $gitCommit
    git_dirty = $gitDirty
    operator_machine = $operatorMachine
    package_name = $PackageName
    package_full_name = $packageFullName
    package_family_name = $packageFamilyName
    application_id = $ApplicationId
    app_user_model_id = $resolvedAppUserModelId
    start_app = $startAppRecord
    repeat_count = $RepeatCount
    activation_delay_sec = $ActivationDelaySec
    max_desktop_process_count = $MaxDesktopProcessCount
    require_installed_package = [bool]$RequireInstalledPackage
    cleanup = $cleanup
    process_counts = [pscustomobject]@{
        before_desktop_shell = $beforeCount
        after_desktop_shell = $afterCount
        new_desktop_shell = $newDesktopShellCount
        activation_failure_count = $activationFailureCount
    }
    before_processes = $beforeProcesses
    after_processes = $afterProcesses
    new_desktop_pids = $newDesktopPids
    activations = $activationRecords
    checks = $checkRecords
    fail_count = $failCount
    ok = $ok
}

if ([string]::IsNullOrWhiteSpace($OutputPath)) {
    $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
    $machine = $env:COMPUTERNAME
    if ([string]::IsNullOrWhiteSpace($machine)) {
        $machine = "unknown"
    }
    $dir = Join-Path $repoRoot ".local-build\desktop-single-instance"
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
    $OutputPath = Join-Path $dir ("musu-desktop-single-instance-{0}-{1}.json" -f $stamp, $machine)
}
else {
    $parent = Split-Path -Parent $OutputPath
    if (-not [string]::IsNullOrWhiteSpace($parent)) {
        New-Item -ItemType Directory -Force -Path $parent | Out-Null
    }
}

$result | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $OutputPath -Encoding UTF8
$resultWithPath = $result | Select-Object *, @{ Name = "evidence_path"; Expression = { (Resolve-Path -LiteralPath $OutputPath).Path } }

if ($Json) {
    $resultWithPath | ConvertTo-Json -Depth 8
}
else {
    "MUSU desktop single-instance audit"
    "ok: $($result.ok)"
    "evidence_path: $((Resolve-Path -LiteralPath $OutputPath).Path)"
    "AppUserModelId: $resolvedAppUserModelId"
    "before_desktop_shell: $($result.process_counts.before_desktop_shell)"
    "after_desktop_shell: $($result.process_counts.after_desktop_shell)"
    "new_desktop_shell: $($result.process_counts.new_desktop_shell)"
    "fail_count: $($result.fail_count)"
    $checks | Format-Table name, status, message -Wrap
}

if ($FailOnProblem -and -not [bool]$result.ok) {
    exit 1
}
