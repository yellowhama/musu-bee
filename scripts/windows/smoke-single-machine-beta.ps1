[CmdletBinding()]
param(
    [string]$MusuExe,
    [string]$DashboardBaseUrl = "http://127.0.0.1:3000",
    [string]$WorkspaceUri = "file:///F:/workspace/musu-bee",
    [string]$ExpectedDashboardOutput = "MUSU_RELEASE_SMOKE_OK",
    [string]$ExpectedCliOutput = "MUSU_CLI_ROUTE_OK",
    [int]$TaskTimeoutSec = 180,
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

function Write-Step([string]$Message) {
    Write-Host ""
    Write-Host "==> $Message"
}

function Assert-True([bool]$Condition, [string]$Message) {
    if (-not $Condition) {
        throw $Message
    }
}

function Invoke-JsonCommand {
    param(
        [Parameter(Mandatory = $true)][string]$FilePath,
        [Parameter(Mandatory = $true)][string[]]$Arguments
    )

    $output = & $FilePath @Arguments 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "command failed: $FilePath $($Arguments -join ' ')`n$output"
    }

    $text = ($output | Out-String).Trim()
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
$doctor = Invoke-JsonCommand -FilePath $MusuExe -Arguments @("doctor", "--json")
Assert-True ($doctor.overall -ne "fail") "doctor overall failed"
Assert-True ($doctor.bridge.status -eq "ok") "doctor bridge check failed"
Assert-True ($doctor.dashboard.status -eq "ok") "doctor dashboard check failed"

Write-Step "Check dashboard APIs"
$dashboardDoctor = Invoke-RestMethod -Uri "$DashboardBaseUrl/api/doctor" -Method Get -TimeoutSec 15
Assert-True ($dashboardDoctor.overall -ne "fail") "dashboard doctor failed"

$deviceStatus = Invoke-RestMethod -Uri "$DashboardBaseUrl/api/device-status" -Method Get -TimeoutSec 15
[object[]]$deviceNodes = if ($deviceStatus.PSObject.Properties.Name -contains "nodes") { @($deviceStatus.nodes) } else { @($deviceStatus) }
Assert-True ($deviceNodes.Count -ge 1) "dashboard device-status returned no nodes"

$tasks = Invoke-RestMethod -Uri "$DashboardBaseUrl/api/bridge-tasks?limit=3" -Method Get -TimeoutSec 15
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
while ((Get-Date) -lt $deadline) {
    $taskResult = Invoke-RestMethod -Uri "$DashboardBaseUrl/api/bridge/tasks/$($task.task_id)" -Method Get -TimeoutSec 15
    if ($taskResult.status -in @("done", "failed", "cancelled", "timeout")) {
        break
    }
    Start-Sleep -Seconds 2
}

Assert-True ($null -ne $taskResult) "task result was never fetched"
Assert-True ($taskResult.status -eq "done") "dashboard task did not complete: $($taskResult.status)"
Assert-True (($taskResult.output -as [string]).Contains($ExpectedDashboardOutput)) "dashboard task output did not contain expected text"

Write-Step "Check task SSE endpoint"
$sse = Invoke-WebRequest -Uri "$DashboardBaseUrl/api/bridge-tasks/events" -Method Head -TimeoutSec 5 -UseBasicParsing
Assert-True ($sse.StatusCode -eq 200) "SSE endpoint did not return 200 OK"
$sseContentType = [string]$sse.Headers["Content-Type"]
Assert-True ($sseContentType.Contains("text/event-stream")) "SSE endpoint did not return text/event-stream"

$cliRouteOutput = $null
if (-not $SkipCliRoute) {
    Write-Step "Run CLI route smoke"
    $cliRouteOutput = & $MusuExe route --wait "Reply exactly: $ExpectedCliOutput" 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "musu route failed: $cliRouteOutput"
    }
    Assert-True ((($cliRouteOutput | Out-String) -as [string]).Contains($ExpectedCliOutput)) "CLI route output did not contain expected text"
}

New-Item -ItemType Directory -Force -Path (Split-Path -Parent $EvidencePath) | Out-Null
$gitCommit = (& git -C $repoRoot rev-parse HEAD 2>$null | Out-String).Trim()
$evidence = [pscustomobject]@{
    schema = "musu.single_machine_smoke_evidence.v1"
    ok = $true
    version = $Version
    git_commit = $gitCommit
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
    expected_dashboard_output = $ExpectedDashboardOutput
    dashboard_output = $taskResult.output
    sse_status_code = $sse.StatusCode
    sse_content_type = $sseContentType
    cli_route_checked = -not $SkipCliRoute
    expected_cli_output = if ($SkipCliRoute) { $null } else { $ExpectedCliOutput }
    cli_route_output = if ($SkipCliRoute) { $null } else { ($cliRouteOutput | Out-String).Trim() }
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
