[CmdletBinding()]
param(
    [int]$TimeoutSec = 5,
    [int]$CommandTimeoutSec = 45,
    [switch]$StopRepoOrphanHelpers,
    [switch]$SkipPackagedStart,
    [string]$OutputPath,
    [switch]$FailOnProblem,
    [switch]$Json
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = (Resolve-Path (Join-Path $scriptDir "..\..")).Path
$version = (Get-Content -LiteralPath (Join-Path $repoRoot "VERSION") -Raw).Trim()
$gitCommit = (& git -C $repoRoot rev-parse HEAD 2>$null | Out-String).Trim()

if ([string]::IsNullOrWhiteSpace($OutputPath)) {
    $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
    $machine = if ($env:COMPUTERNAME) { $env:COMPUTERNAME } else { "unknown-machine" }
    $OutputPath = Join-Path $repoRoot ".local-build\packaged-runtime-repair\musu-packaged-runtime-repair-$stamp-$machine.json"
}

function Add-Check {
    param(
        [System.Collections.Generic.List[object]]$Checks,
        [Parameter(Mandatory = $true)][string]$Name,
        [ValidateSet("pass", "fail")]
        [Parameter(Mandatory = $true)][string]$Status,
        [Parameter(Mandatory = $true)][string]$Message
    )

    $Checks.Add([pscustomobject]@{
        name = $Name
        status = $Status
        message = $Message
    }) | Out-Null
}

function Add-CheckFromCondition {
    param(
        [System.Collections.Generic.List[object]]$Checks,
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][bool]$Condition,
        [Parameter(Mandatory = $true)][string]$PassMessage,
        [Parameter(Mandatory = $true)][string]$FailMessage
    )

    if ($Condition) {
        Add-Check -Checks $Checks -Name $Name -Status "pass" -Message $PassMessage
    }
    else {
        Add-Check -Checks $Checks -Name $Name -Status "fail" -Message $FailMessage
    }
}

function ConvertTo-ProcessArgumentString {
    param([string[]]$Items)

    (@($Items) | ForEach-Object {
        $item = [string]$_
        $escaped = $item -replace '"', '\"'
        if ($escaped -match "\s") {
            "`"$escaped`""
        }
        else {
            $escaped
        }
    }) -join " "
}

function Invoke-TextCommand {
    param(
        [Parameter(Mandatory = $true)][string]$FilePath,
        [Parameter(Mandatory = $true)][string[]]$Arguments,
        [Parameter(Mandatory = $true)][int]$TimeoutSec
    )

    $tempRoot = [System.IO.Path]::GetTempPath()
    $commandId = [guid]::NewGuid().ToString("N")
    $stdoutPath = Join-Path $tempRoot "musu-packaged-runtime-repair-$commandId.stdout.log"
    $stderrPath = Join-Path $tempRoot "musu-packaged-runtime-repair-$commandId.stderr.log"
    $process = $null

    try {
        $process = Start-Process `
            -FilePath $FilePath `
            -ArgumentList (ConvertTo-ProcessArgumentString -Items $Arguments) `
            -RedirectStandardOutput $stdoutPath `
            -RedirectStandardError $stderrPath `
            -WindowStyle Hidden `
            -PassThru

        $timedOut = $false
        if (-not $process.WaitForExit($TimeoutSec * 1000)) {
            $timedOut = $true
            try {
                $process.Kill()
            }
            catch {
            }
        }

        $stdoutRaw = if (Test-Path -LiteralPath $stdoutPath) { Get-Content -LiteralPath $stdoutPath -Raw } else { "" }
        $stderrRaw = if (Test-Path -LiteralPath $stderrPath) { Get-Content -LiteralPath $stderrPath -Raw } else { "" }
        $stdoutText = if ($null -eq $stdoutRaw) { "" } else { ([string]$stdoutRaw).Trim() }
        $stderrText = if ($null -eq $stderrRaw) { "" } else { ([string]$stderrRaw).Trim() }
        $process.Refresh()
        $exitCode = if ($timedOut) { 124 } elseif ($null -ne $process.ExitCode) { [int]$process.ExitCode } else { 0 }
        $combined = if ([string]::IsNullOrWhiteSpace($stdoutText)) {
            $stderrText
        }
        elseif (-not [string]::IsNullOrWhiteSpace($stderrText)) {
            "$stdoutText`n$stderrText"
        }
        else {
            $stdoutText
        }

        return [pscustomobject]@{
            exit_code = $exitCode
            timed_out = $timedOut
            stdout = $stdoutText
            stderr = $stderrText
            raw = $combined
        }
    }
    finally {
        if ($null -ne $process) {
            $process.Dispose()
        }
        Remove-Item -LiteralPath $stdoutPath, $stderrPath -Force -ErrorAction SilentlyContinue
    }
}

function Invoke-JsonCommand {
    param(
        [Parameter(Mandatory = $true)][string]$FilePath,
        [Parameter(Mandatory = $true)][string[]]$Arguments,
        [Parameter(Mandatory = $true)][int]$TimeoutSec
    )

    $textResult = Invoke-TextCommand -FilePath $FilePath -Arguments $Arguments -TimeoutSec $TimeoutSec
    $parsed = $null
    $parseError = $null
    if (-not [string]::IsNullOrWhiteSpace([string]$textResult.raw)) {
        try {
            $parsed = ([string]$textResult.raw) | ConvertFrom-Json
        }
        catch {
            $parseError = $_.Exception.Message
        }
    }

    [pscustomobject]@{
        exit_code = [int]$textResult.exit_code
        timed_out = [bool]$textResult.timed_out
        parse_error = $parseError
        parsed = $parsed
        raw = [string]$textResult.raw
    }
}

function Invoke-ProcessOwnershipAudit {
    param([Parameter(Mandatory = $true)][string]$EvidencePath)

    $auditScript = Join-Path $scriptDir "audit-musu-process-ownership.ps1"
    $auditText = (& powershell -NoProfile -ExecutionPolicy Bypass -File $auditScript -OutputPath $EvidencePath -Json 2>&1 | Out-String).Trim()
    $parsed = $null
    $parseError = $null
    try {
        $parsed = $auditText | ConvertFrom-Json
    }
    catch {
        $parseError = $_.Exception.Message
    }

    [pscustomobject]@{
        parsed = $parsed
        parse_error = $parseError
        raw = $auditText
    }
}

function Resolve-WindowsAppsMusuAlias {
    if (-not $env:LOCALAPPDATA) {
        return $null
    }
    $alias = Join-Path $env:LOCALAPPDATA "Microsoft\WindowsApps\musu.exe"
    if (Test-Path -LiteralPath $alias) {
        return $alias
    }
    return $null
}

function Wait-ForPidExit {
    param(
        [Parameter(Mandatory = $true)][int]$ProcessId,
        [Parameter(Mandatory = $true)][int]$TimeoutSec
    )

    $deadline = (Get-Date).AddSeconds($TimeoutSec)
    while ((Get-Date) -lt $deadline) {
        $process = Get-Process -Id $ProcessId -ErrorAction SilentlyContinue
        if ($null -eq $process) {
            return $true
        }
        Start-Sleep -Milliseconds 200
    }
    return ($null -eq (Get-Process -Id $ProcessId -ErrorAction SilentlyContinue))
}

function Stop-RepoOrphanHelpers {
    param([object[]]$Helpers)

    $stopped = New-Object System.Collections.Generic.List[int]
    $skipped = New-Object System.Collections.Generic.List[object]
    $errors = New-Object System.Collections.Generic.List[object]

    foreach ($helper in @($Helpers)) {
        $processId = [int]$helper.pid
        $expectedCommandLine = if ($helper.PSObject.Properties["command_line"]) { [string]$helper.command_line } else { "" }
        $live = Get-CimInstance Win32_Process -Filter "ProcessId=$processId" -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($null -eq $live) {
            $skipped.Add([pscustomobject]@{ pid = $processId; reason = "process already exited" }) | Out-Null
            continue
        }

        $name = [string]$live.Name
        if ($name -notin @("node.exe", "msedgewebview2.exe")) {
            $skipped.Add([pscustomobject]@{ pid = $processId; reason = "process name changed to $name" }) | Out-Null
            continue
        }
        if (-not [string]::IsNullOrWhiteSpace($expectedCommandLine) -and ([string]$live.CommandLine) -ne $expectedCommandLine) {
            $skipped.Add([pscustomobject]@{ pid = $processId; reason = "command line changed" }) | Out-Null
            continue
        }

        try {
            Stop-Process -Id $processId -Force -ErrorAction Stop
            if (Wait-ForPidExit -ProcessId $processId -TimeoutSec $TimeoutSec) {
                $stopped.Add($processId) | Out-Null
            }
            else {
                $errors.Add([pscustomobject]@{ pid = $processId; error = "process did not exit within ${TimeoutSec}s" }) | Out-Null
            }
        }
        catch {
            $errors.Add([pscustomobject]@{ pid = $processId; error = $_.Exception.Message }) | Out-Null
        }
    }

    [pscustomobject]@{
        attempted = [bool]$StopRepoOrphanHelpers
        stopped_pids = $stopped.ToArray()
        skipped = $skipped.ToArray()
        errors = $errors.ToArray()
    }
}

$outputDir = Split-Path -Parent $OutputPath
if (-not [string]::IsNullOrWhiteSpace($outputDir)) {
    New-Item -ItemType Directory -Force -Path $outputDir | Out-Null
}
$baseName = [System.IO.Path]::GetFileNameWithoutExtension($OutputPath)
$beforeAuditPath = Join-Path $outputDir "$baseName.before.process-ownership.json"
$afterAuditPath = Join-Path $outputDir "$baseName.after.process-ownership.json"

$startedAt = Get-Date
$musuExe = Resolve-WindowsAppsMusuAlias
$beforeAudit = Invoke-ProcessOwnershipAudit -EvidencePath $beforeAuditPath
$before = $beforeAudit.parsed
$beforeRepoOrphans = if ($before) {
    @($before.processes | Where-Object {
            -not [bool]$_.owned_by_musu -and
            [bool]$_.repo_related -and
            ($_.role -eq "node_helper" -or $_.role -eq "webview2_helper")
        })
}
else {
    @()
}

$downResult = $null
if (-not [string]::IsNullOrWhiteSpace($musuExe)) {
    $downResult = Invoke-JsonCommand -FilePath $musuExe -Arguments @("down", "--json", "--timeout-sec", ([string]$TimeoutSec), "--include-desktop") -TimeoutSec $CommandTimeoutSec
}

$repoHelperCleanup = if ($StopRepoOrphanHelpers) {
    Stop-RepoOrphanHelpers -Helpers $beforeRepoOrphans
}
else {
    [pscustomobject]@{
        attempted = $false
        stopped_pids = @()
        skipped = @($beforeRepoOrphans | ForEach-Object { [pscustomobject]@{ pid = [int]$_.pid; reason = "StopRepoOrphanHelpers not supplied" } })
        errors = @()
    }
}

$upResult = $null
if (-not $SkipPackagedStart -and -not [string]::IsNullOrWhiteSpace($musuExe)) {
    $upResult = Invoke-JsonCommand -FilePath $musuExe -Arguments @("up", "--json") -TimeoutSec $CommandTimeoutSec
}

Start-Sleep -Milliseconds 500
$afterAudit = Invoke-ProcessOwnershipAudit -EvidencePath $afterAuditPath
$after = $afterAudit.parsed
$afterRepoOrphans = if ($after) {
    @($after.processes | Where-Object {
            -not [bool]$_.owned_by_musu -and
            [bool]$_.repo_related -and
            ($_.role -eq "node_helper" -or $_.role -eq "webview2_helper")
        })
}
else {
    @()
}

$checks = New-Object System.Collections.Generic.List[object]
Add-CheckFromCondition -Checks $checks -Name "WindowsApps alias" -Condition (-not [string]::IsNullOrWhiteSpace($musuExe)) -PassMessage "WindowsApps MUSU alias exists at $musuExe" -FailMessage "WindowsApps MUSU alias is missing; install the MSIX package first"
Add-CheckFromCondition -Checks $checks -Name "before audit parse" -Condition ($null -ne $before -and [string]::IsNullOrWhiteSpace([string]$beforeAudit.parse_error)) -PassMessage "before process ownership audit parsed" -FailMessage "before process ownership audit did not parse: $($beforeAudit.parse_error)"
$downOk = ($downResult -and [int]$downResult.exit_code -eq 0 -and [string]::IsNullOrWhiteSpace([string]$downResult.parse_error) -and $downResult.parsed -and [bool]$downResult.parsed.ok)
Add-CheckFromCondition -Checks $checks -Name "packaged runtime down" -Condition ([bool]$downOk) -PassMessage "packaged WindowsApps `musu down --include-desktop` completed" -FailMessage "packaged runtime down failed or did not return ok=true"
$repoHelperCleanupOk = (@($beforeRepoOrphans).Count -eq 0 -or ($StopRepoOrphanHelpers -and @($repoHelperCleanup.errors).Count -eq 0 -and @($afterRepoOrphans).Count -eq 0))
Add-CheckFromCondition -Checks $checks -Name "repo orphan helper cleanup" -Condition ([bool]$repoHelperCleanupOk) -PassMessage "repo/workspace orphan helpers are absent after cleanup" -FailMessage "$(@($afterRepoOrphans).Count) repo/workspace orphan helper(s) remain; rerun with -StopRepoOrphanHelpers only when it is safe to terminate workspace helper processes"
$upOk = if ($SkipPackagedStart) { $true } else { ($upResult -and [int]$upResult.exit_code -eq 0 -and [string]::IsNullOrWhiteSpace([string]$upResult.parse_error) -and $upResult.parsed -and [bool]$upResult.parsed.ok) }
Add-CheckFromCondition -Checks $checks -Name "packaged runtime up" -Condition ([bool]$upOk) -PassMessage "packaged WindowsApps `musu up --json` completed or was intentionally skipped" -FailMessage "packaged runtime up failed or did not return ok=true"
Add-CheckFromCondition -Checks $checks -Name "after audit parse" -Condition ($null -ne $after -and [string]::IsNullOrWhiteSpace([string]$afterAudit.parse_error)) -PassMessage "after process ownership audit parsed" -FailMessage "after process ownership audit did not parse: $($afterAudit.parse_error)"
Add-CheckFromCondition -Checks $checks -Name "after process ownership" -Condition ($after -and [bool]$after.ok) -PassMessage "after process ownership audit passed" -FailMessage "after process ownership audit still fails"

$failedChecks = @($checks | Where-Object { $_.status -eq "fail" })
$nextSteps = New-Object System.Collections.Generic.List[string]
if ([string]::IsNullOrWhiteSpace($musuExe)) {
    $nextSteps.Add("Install the MSIX package so the WindowsApps MUSU execution alias exists.") | Out-Null
}
if (@($afterRepoOrphans).Count -gt 0 -and -not $StopRepoOrphanHelpers) {
    $nextSteps.Add("Close the workspace dashboard/dev server manually, or rerun with -StopRepoOrphanHelpers during a release evidence run.") | Out-Null
}
if ($after -and -not [bool]$after.ok) {
    $failedNames = @($after.checks | Where-Object { $_.status -eq "fail" } | ForEach-Object { [string]$_.name })
    $nextSteps.Add("Inspect remaining process ownership failures: $($failedNames -join ', ').") | Out-Null
}
if (@($failedChecks).Count -eq 0) {
    $nextSteps.Add("Run audit-musu-process-ownership.ps1 and audit-musu-startup-single-instance.ps1 to record release evidence.") | Out-Null
}

$result = [pscustomobject]@{
    schema = "musu.packaged_local_runtime_repair.v1"
    ok = (@($failedChecks).Count -eq 0)
    version = $version
    git_commit = $gitCommit
    recorded_at = (Get-Date).ToString("o")
    started_at = $startedAt.ToString("o")
    operator_machine = $env:COMPUTERNAME
    operator_user = $env:USERNAME
    repo_root = $repoRoot
    musu_exe = $musuExe
    stop_repo_orphan_helpers = [bool]$StopRepoOrphanHelpers
    skip_packaged_start = [bool]$SkipPackagedStart
    timeout_sec = $TimeoutSec
    command_timeout_sec = $CommandTimeoutSec
    before_process_ownership_path = $beforeAuditPath
    after_process_ownership_path = $afterAuditPath
    before_ok = if ($before) { [bool]$before.ok } else { $false }
    after_ok = if ($after) { [bool]$after.ok } else { $false }
    before_repo_orphan_helper_count = @($beforeRepoOrphans).Count
    after_repo_orphan_helper_count = @($afterRepoOrphans).Count
    down = $downResult
    repo_helper_cleanup = $repoHelperCleanup
    up = $upResult
    checks = $checks.ToArray()
    fail_count = @($failedChecks).Count
    next_steps = $nextSteps.ToArray()
    evidence_path = $OutputPath
}

$result | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $OutputPath -Encoding UTF8

if ($Json) {
    $result | ConvertTo-Json -Depth 10
}
else {
    "MUSU packaged local runtime repair"
    "ok: $($result.ok)"
    "musu_exe: $($result.musu_exe)"
    "before_ok: $($result.before_ok)"
    "after_ok: $($result.after_ok)"
    "before_repo_orphan_helpers: $($result.before_repo_orphan_helper_count)"
    "after_repo_orphan_helpers: $($result.after_repo_orphan_helper_count)"
    "evidence_path: $($result.evidence_path)"
    if (@($result.next_steps).Count -gt 0) {
        "next steps:"
        foreach ($step in @($result.next_steps)) {
            "- $step"
        }
    }
}

if ($FailOnProblem -and -not [bool]$result.ok) {
    exit 1
}
