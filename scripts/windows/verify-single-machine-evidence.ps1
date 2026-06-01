[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$EvidencePath,
    [string]$ExpectedVersion,
    [string]$ExpectedGitCommit,
    [switch]$AllowDocumentationOnlyGitDelta,
    [int]$MaxAgeDays = 30,
    [switch]$Json
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = (Resolve-Path (Join-Path $scriptDir "..\..")).Path

if ([string]::IsNullOrWhiteSpace($ExpectedVersion)) {
    $ExpectedVersion = (Get-Content -LiteralPath (Join-Path $repoRoot "VERSION") -Raw).Trim()
}
if ([string]::IsNullOrWhiteSpace($ExpectedGitCommit)) {
    $ExpectedGitCommit = (& git -C $repoRoot rev-parse HEAD 2>$null | Out-String).Trim()
}

$checks = New-Object System.Collections.Generic.List[object]

function Add-Check {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [ValidateSet("pass", "fail")]
        [Parameter(Mandatory = $true)][string]$Status,
        [Parameter(Mandatory = $true)][string]$Message
    )

    $checks.Add([pscustomobject]@{
        name = $Name
        status = $Status
        message = $Message
    }) | Out-Null
}

function Add-CheckFromCondition {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][bool]$Condition,
        [Parameter(Mandatory = $true)][string]$PassMessage,
        [Parameter(Mandatory = $true)][string]$FailMessage
    )

    if ($Condition) {
        Add-Check -Name $Name -Status "pass" -Message $PassMessage
    }
    else {
        Add-Check -Name $Name -Status "fail" -Message $FailMessage
    }
}

function Get-StringProperty {
    param(
        [Parameter(Mandatory = $true)]$Object,
        [Parameter(Mandatory = $true)][string]$Name
    )

    $property = $Object.PSObject.Properties[$Name]
    if (-not $property -or $null -eq $property.Value) {
        return ""
    }
    return [string]$property.Value
}

function Get-BoolProperty {
    param(
        [Parameter(Mandatory = $true)]$Object,
        [Parameter(Mandatory = $true)][string]$Name
    )

    $property = $Object.PSObject.Properties[$Name]
    if (-not $property -or $null -eq $property.Value) {
        return $false
    }
    return [bool]$property.Value
}

function Try-ParseDateTimeOffset {
    param([string]$Text)

    if ([string]::IsNullOrWhiteSpace($Text)) {
        return $null
    }
    try {
        return [datetimeoffset]::Parse($Text)
    }
    catch {
        return $null
    }
}

function Test-ReleaseEvidenceFreshnessAllowedPath {
    param([Parameter(Mandatory = $true)][string]$Path)

    $normalizedPath = $Path.Replace("\", "/")
    if ($normalizedPath -like "docs/*") {
        return $true
    }

    $statusOnlyScripts = @(
        ".github/workflows/deploy-musu-bee.yml",
        "scripts/windows/audit-desktop-release-readiness.ps1",
        "scripts/windows/import-second-pc-return.ps1",
        "scripts/windows/prepare-final-operator-gate-packet.ps1",
        "scripts/windows/prepare-multidevice-test-kit.ps1",
        "scripts/windows/prepare-operator-action-pack.ps1",
        "scripts/windows/run-second-pc-release-check.ps1",
        "scripts/windows/verify-final-operator-gate-packet.ps1",
        "scripts/windows/verify-operator-action-pack.ps1",
        "scripts/windows/verify-runtime-cpu-scenario-matrix.ps1",
        "scripts/windows/verify-single-machine-evidence.ps1",
        "scripts/windows/write-release-go-no-go.ps1",
        "scripts/windows/show-musu-process-attribution.ps1",
        "scripts/windows/show-musu-pro-p2p-env-status.ps1"
    )
    return ($statusOnlyScripts -contains $normalizedPath)
}

function Test-DocumentationOrStatusOnlyGitDelta {
    param(
        [Parameter(Mandatory = $true)][string]$FromCommit,
        [Parameter(Mandatory = $true)][string]$ToCommit
    )

    if ($FromCommit -notmatch "^[0-9a-f]{40}$" -or $ToCommit -notmatch "^[0-9a-f]{40}$") {
        return $false
    }

    $changedPathsText = (& git -C $repoRoot diff --name-only $FromCommit $ToCommit 2>$null | Out-String).Trim()
    if ($LASTEXITCODE -ne 0) {
        return $false
    }
    if ([string]::IsNullOrWhiteSpace($changedPathsText)) {
        return $true
    }

    $changedPaths = @($changedPathsText -split "`r?`n" | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
    $runtimeAffectingPaths = @($changedPaths | Where-Object { -not (Test-ReleaseEvidenceFreshnessAllowedPath -Path ([string]$_)) })
    return ($runtimeAffectingPaths.Count -eq 0)
}

if (-not (Test-Path -LiteralPath $EvidencePath)) {
    throw "Single-machine evidence file not found: $EvidencePath"
}

$evidence = Get-Content -LiteralPath $EvidencePath -Raw | ConvertFrom-Json

$schema = Get-StringProperty -Object $evidence -Name "schema"
$version = Get-StringProperty -Object $evidence -Name "version"
$gitCommit = Get-StringProperty -Object $evidence -Name "git_commit"
$startedAtText = Get-StringProperty -Object $evidence -Name "started_at"
$completedAtText = Get-StringProperty -Object $evidence -Name "completed_at"
$dashboardBaseUrl = Get-StringProperty -Object $evidence -Name "dashboard_base_url"
$bridgeUrl = Get-StringProperty -Object $evidence -Name "bridge_url"
$doctorOverall = Get-StringProperty -Object $evidence -Name "doctor_overall"
$dashboardDoctorOverall = Get-StringProperty -Object $evidence -Name "dashboard_doctor_overall"
$dashboardTaskId = Get-StringProperty -Object $evidence -Name "dashboard_task_id"
$dashboardTaskStatus = Get-StringProperty -Object $evidence -Name "dashboard_task_status"
$expectedDashboardOutput = Get-StringProperty -Object $evidence -Name "expected_dashboard_output"
$dashboardOutput = Get-StringProperty -Object $evidence -Name "dashboard_output"
$sseContentType = Get-StringProperty -Object $evidence -Name "sse_content_type"
$expectedCliOutput = Get-StringProperty -Object $evidence -Name "expected_cli_output"
$cliRouteOutput = Get-StringProperty -Object $evidence -Name "cli_route_output"
$evidenceOk = Get-BoolProperty -Object $evidence -Name "ok"
$cliRouteChecked = Get-BoolProperty -Object $evidence -Name "cli_route_checked"
$startedAt = Try-ParseDateTimeOffset -Text $startedAtText
$completedAt = Try-ParseDateTimeOffset -Text $completedAtText
$now = [datetimeoffset]::Now
$futureTolerance = [timespan]::FromMinutes(5)

$deviceNodeCount = 0
$deviceNodeProperty = $evidence.PSObject.Properties["device_node_count"]
if ($deviceNodeProperty -and $null -ne $deviceNodeProperty.Value) {
    $deviceNodeCount = [int]$deviceNodeProperty.Value
}

$sseStatusCode = 0
$sseStatusProperty = $evidence.PSObject.Properties["sse_status_code"]
if ($sseStatusProperty -and $null -ne $sseStatusProperty.Value) {
    $sseStatusCode = [int]$sseStatusProperty.Value
}

Add-CheckFromCondition "schema" ($schema -eq "musu.single_machine_smoke_evidence.v1") "schema is valid" "schema is not musu.single_machine_smoke_evidence.v1"
Add-CheckFromCondition "evidence ok" $evidenceOk "evidence reports ok=true" "evidence does not report ok=true"
Add-CheckFromCondition "version" (-not [string]::IsNullOrWhiteSpace($version)) "version is present" "version is missing"
Add-CheckFromCondition "expected version" ($version -eq $ExpectedVersion) "version matches $ExpectedVersion" "version is '$version', expected '$ExpectedVersion'"
Add-CheckFromCondition "git commit" ($gitCommit -match "^[0-9a-f]{40}$") "git commit is present" "git commit is missing or invalid"
$gitCommitMatchesExpected = ($gitCommit -eq $ExpectedGitCommit)
$documentationOrStatusOnlyGitDelta = $false
if (-not $gitCommitMatchesExpected -and $AllowDocumentationOnlyGitDelta) {
    $documentationOrStatusOnlyGitDelta = Test-DocumentationOrStatusOnlyGitDelta -FromCommit $gitCommit -ToCommit $ExpectedGitCommit
}
Add-CheckFromCondition `
    "expected git commit" `
    ($gitCommitMatchesExpected -or $documentationOrStatusOnlyGitDelta) `
    "git commit matches current HEAD $ExpectedGitCommit or differs only by documentation/evidence/status/tooling-only commits" `
    "git commit is '$gitCommit', expected current HEAD '$ExpectedGitCommit' with no runtime-affecting changes after the evidence commit"
Add-CheckFromCondition "started timestamp" ($null -ne $startedAt) "started_at parses" "started_at is missing or invalid"
Add-CheckFromCondition "completed timestamp" ($null -ne $completedAt) "completed_at parses" "completed_at is missing or invalid"
if ($startedAt -and $completedAt) {
    Add-CheckFromCondition "time order" ($completedAt -ge $startedAt) "completed_at is at or after started_at" "completed_at is before started_at"
    $age = [datetimeoffset]::Now - $completedAt
    Add-CheckFromCondition "evidence age" ($age.TotalDays -le $MaxAgeDays -and $age.TotalSeconds -ge -300) "completed_at is within $MaxAgeDays days" "completed_at is outside the allowed evidence window"
}
foreach ($timestamp in @(
    [pscustomobject]@{ name = "started_at"; value = $startedAt },
    [pscustomobject]@{ name = "completed_at"; value = $completedAt }
)) {
    if ($timestamp.value) {
        Add-CheckFromCondition "$($timestamp.name) not future" ($timestamp.value -le ($now + $futureTolerance)) "$($timestamp.name) is not in the future" "$($timestamp.name) is more than 5 minutes in the future"
    }
}
Add-CheckFromCondition "dashboard base url" (-not [string]::IsNullOrWhiteSpace($dashboardBaseUrl)) "dashboard_base_url is present" "dashboard_base_url is missing"
Add-CheckFromCondition "bridge url" ($bridgeUrl -match "^http://127\.0\.0\.1:\d+") "bridge_url is localhost" "bridge_url is missing or not localhost"
Add-CheckFromCondition "doctor overall" ($doctorOverall -ne "fail" -and -not [string]::IsNullOrWhiteSpace($doctorOverall)) "doctor overall is not fail" "doctor overall is fail or missing"
Add-CheckFromCondition "dashboard doctor overall" ($dashboardDoctorOverall -ne "fail" -and -not [string]::IsNullOrWhiteSpace($dashboardDoctorOverall)) "dashboard doctor overall is not fail" "dashboard doctor overall is fail or missing"
Add-CheckFromCondition "device nodes" ($deviceNodeCount -ge 1) "device-status returned at least one node" "device-status returned no nodes"
Add-CheckFromCondition "dashboard task id" (-not [string]::IsNullOrWhiteSpace($dashboardTaskId)) "dashboard task id is present" "dashboard task id is missing"
Add-CheckFromCondition "dashboard task status" ($dashboardTaskStatus -eq "done") "dashboard task status is done" "dashboard task status is not done"
Add-CheckFromCondition "dashboard output" (-not [string]::IsNullOrWhiteSpace($expectedDashboardOutput) -and $dashboardOutput.Contains($expectedDashboardOutput)) "dashboard output contains expected text" "dashboard output does not contain expected text"
Add-CheckFromCondition "SSE status" ($sseStatusCode -eq 200) "SSE endpoint returned 200" "SSE endpoint did not return 200"
Add-CheckFromCondition "SSE content-type" ($sseContentType.Contains("text/event-stream")) "SSE endpoint returned text/event-stream" "SSE endpoint did not return text/event-stream"
if ($cliRouteChecked) {
    Add-CheckFromCondition "CLI output" (-not [string]::IsNullOrWhiteSpace($expectedCliOutput) -and $cliRouteOutput.Contains($expectedCliOutput)) "CLI route output contains expected text" "CLI route output does not contain expected text"
}

$failCount = @($checks | Where-Object { $_.status -eq "fail" }).Count
$result = [pscustomobject]@{
    ok = ($failCount -eq 0)
    evidence_path = (Resolve-Path -LiteralPath $EvidencePath).Path
    fail_count = $failCount
    version = $version
    git_commit = $gitCommit
    dashboard_task_id = $dashboardTaskId
    bridge_url = $bridgeUrl
    cli_route_checked = $cliRouteChecked
    checks = $checks.ToArray()
}

if ($Json) {
    $result | ConvertTo-Json -Depth 6
}
else {
    "MUSU single-machine evidence verification"
    "ok: $($result.ok)"
    "evidence_path: $($result.evidence_path)"
    "dashboard_task_id: $($result.dashboard_task_id)"
    "bridge_url: $($result.bridge_url)"
    "cli_route_checked: $($result.cli_route_checked)"
    ""
    $checks | Format-Table name, status, message -Wrap
}

if (-not $result.ok) {
    exit 1
}
