[CmdletBinding()]
param(
    [string]$MusuExe,
    [string]$DashboardBaseUrl = "http://127.0.0.1:3000",
    [string]$WorkspaceUri = "file:///F:/workspace/musu-bee",
    [string]$ExpectedDashboardOutput = "MUSU_RELEASE_SMOKE_OK",
    [string]$ExpectedCliOutput = "MUSU_CLI_ROUTE_OK",
    [int]$TaskTimeoutSec = 180,
    [int]$CommandTimeoutSec = 90,
    [int]$ReadinessRetryCount = 5,
    [int]$ReadinessRetryDelaySec = 2,
    [switch]$SkipCliRoute,
    [string]$EvidencePath,
    [string]$EvidenceRoot,
    [string]$Version
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = (Resolve-Path (Join-Path $scriptDir "..\..")).Path

if (-not $MusuExe) {
    $MusuExe = Join-Path $repoRoot "musu-rs\target\debug\musu.exe"
}
if ([string]::IsNullOrWhiteSpace($Version)) {
    $Version = (Get-Content -LiteralPath (Join-Path $repoRoot "VERSION") -Raw).Trim()
}
if ([string]::IsNullOrWhiteSpace($EvidenceRoot)) {
    $EvidenceRoot = Join-Path $repoRoot ".local-build\single-machine"
}
if ([string]::IsNullOrWhiteSpace($EvidencePath)) {
    $stamp = (Get-Date).ToString("yyyyMMdd-HHmmss")
    $machine = if ([string]::IsNullOrWhiteSpace($env:COMPUTERNAME)) { "machine" } else { $env:COMPUTERNAME }
    $safeMachine = $machine -replace "[^A-Za-z0-9._-]", "_"
    $EvidencePath = Join-Path $EvidenceRoot "$stamp-$safeMachine.evidence.json"
}

$startedAt = Get-Date
$smokeRunId = $startedAt.ToString("yyyyMMdd_HHmmss")
if ($ExpectedDashboardOutput -eq "MUSU_RELEASE_SMOKE_OK") {
    $ExpectedDashboardOutput = "MUSU_RELEASE_SMOKE_OK_$smokeRunId"
}
if ($ExpectedCliOutput -eq "MUSU_CLI_ROUTE_OK") {
    $ExpectedCliOutput = "MUSU_CLI_ROUTE_OK_$smokeRunId"
}

function Write-Step([string]$Message) {
    Write-Host ""
    Write-Host "==> $Message"
}

function Assert-True([bool]$Condition, [string]$Message) {
    if (-not $Condition) {
        throw $Message
    }
}

function Invoke-TextCommand {
    param(
        [Parameter(Mandatory = $true)][string]$FilePath,
        [Parameter(Mandatory = $true)][string[]]$Arguments,
        [int]$TimeoutSec = $CommandTimeoutSec
    )

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

    $tempRoot = [System.IO.Path]::GetTempPath()
    $commandId = [guid]::NewGuid().ToString("N")
    $stdoutPath = Join-Path $tempRoot "musu-smoke-$commandId.stdout.log"
    $stderrPath = Join-Path $tempRoot "musu-smoke-$commandId.stderr.log"
    $process = $null

    try {
        $process = Start-Process `
            -FilePath $FilePath `
            -ArgumentList (ConvertTo-ProcessArgumentString -Items $Arguments) `
            -RedirectStandardOutput $stdoutPath `
            -RedirectStandardError $stderrPath `
            -WindowStyle Hidden `
            -PassThru

        if (-not $process.WaitForExit($TimeoutSec * 1000)) {
            try {
                $process.Kill()
            }
            catch {
                # Best effort; the timeout error below is the useful failure.
            }
            throw "command timed out after ${TimeoutSec}s: $FilePath $($Arguments -join ' ')"
        }

        $stdoutRaw = if (Test-Path -LiteralPath $stdoutPath) { Get-Content -LiteralPath $stdoutPath -Raw } else { "" }
        $stderrRaw = if (Test-Path -LiteralPath $stderrPath) { Get-Content -LiteralPath $stderrPath -Raw } else { "" }
        $stdoutText = if ($null -eq $stdoutRaw) { "" } else { ([string]$stdoutRaw).Trim() }
        $stderrText = if ($null -eq $stderrRaw) { "" } else { ([string]$stderrRaw).Trim() }
        $process.Refresh()
        $exitCode = $process.ExitCode
        if ($null -eq $exitCode -or [string]::IsNullOrWhiteSpace([string]$exitCode)) {
            $exitCode = 0
        }
        if ($exitCode -ne 0) {
            throw "command failed with exit code ${exitCode}: $FilePath $($Arguments -join ' ')`n$stdoutText`n$stderrText"
        }

        if ([string]::IsNullOrWhiteSpace($stdoutText)) {
            return $stderrText
        }
        if (-not [string]::IsNullOrWhiteSpace($stderrText)) {
            return "$stdoutText`n$stderrText"
        }
        return $stdoutText
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
        [Parameter(Mandatory = $true)][string[]]$Arguments
    )

    $text = Invoke-TextCommand -FilePath $FilePath -Arguments $Arguments
    try {
        return $text | ConvertFrom-Json
    }
    catch {
        throw "command did not return parseable JSON: $FilePath $($Arguments -join ' ')`n$text"
    }
}

Assert-True (Test-Path -LiteralPath $MusuExe) "musu.exe not found at $MusuExe"

Write-Step "Run first-start helper"
$up = Invoke-JsonCommand -FilePath $MusuExe -Arguments @("up", "--json")
Assert-True ([bool]$up.ok) "musu up did not report ok"
Assert-True ($up.bridge.status -eq "ok") "bridge status was not ok"
Assert-True ($up.dashboard.status -eq "ok") "dashboard status was not ok"

Write-Step "Run local doctor"
$doctor = $null
$doctorError = $null
for ($attempt = 1; $attempt -le $ReadinessRetryCount; $attempt++) {
    try {
        $candidate = Invoke-JsonCommand -FilePath $MusuExe -Arguments @("doctor", "--json")
        if ($candidate.overall -ne "fail" -and $candidate.bridge.status -eq "ok" -and $candidate.dashboard.status -eq "ok") {
            $doctor = $candidate
            break
        }
        $doctorError = "overall=$($candidate.overall), bridge=$($candidate.bridge.status), dashboard=$($candidate.dashboard.status)"
    }
    catch {
        $doctorError = $_.Exception.Message
    }

    if ($attempt -lt $ReadinessRetryCount) {
        Start-Sleep -Seconds $ReadinessRetryDelaySec
    }
}
Assert-True ($null -ne $doctor) "doctor did not become ready after $ReadinessRetryCount attempt(s): $doctorError"

Write-Step "Check dashboard APIs"
$dashboardDoctor = $null
$dashboardDoctorError = $null
for ($attempt = 1; $attempt -le $ReadinessRetryCount; $attempt++) {
    try {
        $candidate = Invoke-RestMethod -Uri "$DashboardBaseUrl/api/doctor" -Method Get -TimeoutSec 30
        if ($candidate.overall -ne "fail") {
            $dashboardDoctor = $candidate
            break
        }
        $dashboardDoctorError = "overall=$($candidate.overall)"
    }
    catch {
        $dashboardDoctorError = $_.Exception.Message
    }

    if ($attempt -lt $ReadinessRetryCount) {
        Start-Sleep -Seconds $ReadinessRetryDelaySec
    }
}
Assert-True ($null -ne $dashboardDoctor) "dashboard doctor did not become ready after $ReadinessRetryCount attempt(s): $dashboardDoctorError"

$deviceStatus = Invoke-RestMethod -Uri "$DashboardBaseUrl/api/device-status" -Method Get -TimeoutSec 30
[object[]]$deviceNodes = if ($deviceStatus.PSObject.Properties.Name -contains "nodes") { @($deviceStatus.nodes) } else { @($deviceStatus) }
Assert-True ($deviceNodes.Count -ge 1) "dashboard device-status returned no nodes"

$tasks = Invoke-RestMethod -Uri "$DashboardBaseUrl/api/bridge-tasks?limit=3" -Method Get -TimeoutSec 30
Assert-True ($null -ne $tasks) "dashboard bridge-tasks returned null"

Write-Step "Submit dashboard task and wait for completion"
$body = @{
    instruction = "Reply exactly: $ExpectedDashboardOutput"
    channel = "dashboard-smoke"
    sender_id = "single-machine-smoke"
    adapter_type = "claude"
    workspace_uri = $WorkspaceUri
} | ConvertTo-Json -Compress

$task = Invoke-RestMethod `
    -Uri "$DashboardBaseUrl/api/tasks/forward" `
    -Method Post `
    -ContentType "application/json" `
    -Body $body `
    -TimeoutSec 30

Assert-True (-not [string]::IsNullOrWhiteSpace($task.task_id)) "dashboard task response did not include task_id"

$deadline = (Get-Date).AddSeconds($TaskTimeoutSec)
$taskResult = $null
$taskPollErrorCount = 0
$taskPollLastError = $null
while ((Get-Date) -lt $deadline) {
    try {
        $taskResult = Invoke-RestMethod -Uri "$DashboardBaseUrl/api/bridge/tasks/$($task.task_id)" -Method Get -TimeoutSec 30
        if ($taskResult.status -in @("done", "failed", "cancelled", "timeout")) {
            break
        }
    }
    catch {
        $taskPollErrorCount += 1
        $taskPollLastError = $_.Exception.Message
    }
    Start-Sleep -Seconds 2
}

Assert-True ($null -ne $taskResult) "task result was never fetched; last poll error: $taskPollLastError"
Assert-True ($taskResult.status -eq "done") "dashboard task did not complete: $($taskResult.status); poll_errors=$taskPollErrorCount; last_poll_error=$taskPollLastError"
Assert-True (($taskResult.output -as [string]).Contains($ExpectedDashboardOutput)) "dashboard task output did not contain expected text"

Write-Step "Check task SSE endpoint"
$sse = Invoke-WebRequest -Uri "$DashboardBaseUrl/api/bridge-tasks/events" -Method Head -TimeoutSec 5 -UseBasicParsing
Assert-True ($sse.StatusCode -eq 200) "SSE endpoint did not return 200 OK"
$sseContentType = [string]$sse.Headers["Content-Type"]
Assert-True ($sseContentType.Contains("text/event-stream")) "SSE endpoint did not return text/event-stream"

$cliRouteOutput = $null
if (-not $SkipCliRoute) {
    Write-Step "Run CLI route smoke"
    $cliRouteOutput = Invoke-TextCommand `
        -FilePath $MusuExe `
        -Arguments @("route", "--wait", "Reply exactly: $ExpectedCliOutput") `
        -TimeoutSec $TaskTimeoutSec
    Assert-True ($cliRouteOutput.Contains($ExpectedCliOutput)) "CLI route output did not contain expected text '$ExpectedCliOutput'. Output: $cliRouteOutput"
}

New-Item -ItemType Directory -Force -Path (Split-Path -Parent $EvidencePath) | Out-Null
$gitCommit = (& git -C $repoRoot rev-parse HEAD 2>$null | Out-String).Trim()
$evidence = [pscustomobject]@{
    schema = "musu.single_machine_smoke_evidence.v1"
    ok = $true
    version = $Version
    git_commit = $gitCommit
    smoke_run_id = $smokeRunId
    started_at = $startedAt.ToString("o")
    completed_at = (Get-Date).ToString("o")
    machine = $env:COMPUTERNAME
    dashboard_base_url = $DashboardBaseUrl
    bridge_url = $up.bridge.local_url
    workspace_uri = $WorkspaceUri
    doctor_overall = $doctor.overall
    dashboard_doctor_overall = $dashboardDoctor.overall
    device_node_count = $deviceNodes.Count
    dashboard_task_id = $task.task_id
    dashboard_task_status = $taskResult.status
    dashboard_task_poll_error_count = $taskPollErrorCount
    dashboard_task_poll_last_error = $taskPollLastError
    expected_dashboard_output = $ExpectedDashboardOutput
    dashboard_output = $taskResult.output
    sse_status_code = $sse.StatusCode
    sse_content_type = $sseContentType
    cli_route_checked = -not $SkipCliRoute
    expected_cli_output = if ($SkipCliRoute) { $null } else { $ExpectedCliOutput }
    cli_route_output = if ($SkipCliRoute) { $null } else { $cliRouteOutput.Trim() }
}
$evidence | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $EvidencePath -Encoding UTF8

Write-Step "Single-machine beta smoke passed"
[pscustomobject]@{
    ok = $true
    dashboard_base_url = $DashboardBaseUrl
    bridge_url = $up.bridge.local_url
    dashboard_task_id = $task.task_id
    dashboard_output = $taskResult.output
    cli_route_checked = -not $SkipCliRoute
    evidence_path = (Resolve-Path -LiteralPath $EvidencePath).Path
}
