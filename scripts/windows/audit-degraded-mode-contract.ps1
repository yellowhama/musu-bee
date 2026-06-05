[CmdletBinding()]
param(
    [switch]$Json,
    [switch]$FailOnProblem
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = (Resolve-Path (Join-Path $scriptDir "..\..")).Path

$checks = New-Object System.Collections.Generic.List[object]

function Add-Check {
    param(
        [Parameter(Mandatory = $true)][string]$Scope,
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][bool]$Passed,
        [Parameter(Mandatory = $true)][string]$Message,
        [string]$Path = ""
    )

    $checks.Add([pscustomobject]@{
        scope = $Scope
        name = $Name
        status = if ($Passed) { "pass" } else { "fail" }
        path = $Path
        message = $Message
    }) | Out-Null
}

function Get-RepoText {
    param([Parameter(Mandatory = $true)][string]$RelativePath)

    $path = Join-Path $repoRoot $RelativePath
    if (-not (Test-Path -LiteralPath $path)) {
        Add-Check -Scope "file" -Name "exists: $RelativePath" -Passed $false -Path $RelativePath -Message "$RelativePath is missing."
        return ""
    }

    Add-Check -Scope "file" -Name "exists: $RelativePath" -Passed $true -Path $RelativePath -Message "$RelativePath exists."
    return Get-Content -LiteralPath $path -Raw
}

function Add-ContainsAllCheck {
    param(
        [Parameter(Mandatory = $true)][string]$Scope,
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][string]$Text,
        [Parameter(Mandatory = $true)][string[]]$Needles,
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][string]$Message
    )

    $missing = @()
    foreach ($needle in $Needles) {
        if (-not $Text.Contains($needle)) {
            $missing += $needle
        }
    }

    Add-Check `
        -Scope $Scope `
        -Name $Name `
        -Passed ($missing.Count -eq 0) `
        -Path $Path `
        -Message ($(if ($missing.Count -eq 0) { $Message } else { "$Message Missing: $($missing -join ', ')" }))
}

function Add-RegexCheck {
    param(
        [Parameter(Mandatory = $true)][string]$Scope,
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][string]$Text,
        [Parameter(Mandatory = $true)][string]$Pattern,
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][string]$Message
    )

    Add-Check `
        -Scope $Scope `
        -Name $Name `
        -Passed (-not [string]::IsNullOrWhiteSpace($Text) -and [regex]::IsMatch($Text, $Pattern)) `
        -Path $Path `
        -Message $Message
}

$agentsRoutePath = "musu-bee\src\app\api\agents\route.ts"
$agentsRouteText = Get-RepoText $agentsRoutePath
Add-ContainsAllCheck `
    -Scope "agents-api" `
    -Name "agents route exposes degraded envelope" `
    -Text $agentsRouteText `
    -Path $agentsRoutePath `
    -Needles @(
        "let degraded = false",
        "let degradedReason: string | null = null",
        "agents_unavailable:",
        "agents_stale",
        "degraded,",
        "degradedReason,",
        "stale,"
    ) `
    -Message "Agents API marks unavailable/stale upstream state as degraded and returns explicit stale/degraded fields."

$agentsRouteTestPath = "musu-bee\src\app\api\agents\route.test.ts"
$agentsRouteTestText = Get-RepoText $agentsRouteTestPath
Add-ContainsAllCheck `
    -Scope "agents-tests" `
    -Name "agents degraded regression tests" `
    -Text $agentsRouteTestText `
    -Path $agentsRouteTestPath `
    -Needles @(
        "reports degraded without fabricating department state when /agents fails",
        "assert.equal(body.degraded, true)",
        "assert.match(String(body.degradedReason), /^agents_unavailable:/)",
        "assert.equal(body.summary.departments.length, 0)",
        "assert.deepEqual(body.summary.statusCounts, {})",
        "marks stale snapshots as degraded",
        'assert.equal(body.degradedReason, "agents_stale")'
    ) `
    -Message "Agents route tests lock the no-fabricated-departments and stale-snapshot degraded contracts."

$deviceStatusRoutePath = "musu-bee\src\app\api\device-status\route.ts"
$deviceStatusRouteText = Get-RepoText $deviceStatusRoutePath
Add-ContainsAllCheck `
    -Scope "device-status-api" `
    -Name "device status fallback envelope" `
    -Text $deviceStatusRouteText `
    -Path $deviceStatusRoutePath `
    -Needles @(
        'source: "status" | "health-fallback" | "offline-fallback"',
        'reason?: "status_http_error" | "health_http_error" | "fetch_error" | "invalid_payload"',
        "recommended_for: string[]",
        "devices: DeviceStatusItem[]",
        '`${bridgeUrl}/status`',
        '`${bridgeUrl}/health`',
        '"health-fallback"',
        '"offline-fallback"',
        '"fetch_error"',
        "buildOfflineResponse"
    ) `
    -Message "Device status API keeps local metrics, fallback source, offline reason, and device-list envelope visible."

$deviceStatusTestPath = "musu-bee\src\app\api\device-status\route.test.ts"
$deviceStatusTestText = Get-RepoText $deviceStatusTestPath
Add-ContainsAllCheck `
    -Scope "device-status-tests" `
    -Name "device status fallback regression tests" `
    -Text $deviceStatusTestText `
    -Path $deviceStatusTestPath `
    -Needles @(
        "health-fallback",
        "offline-fallback",
        "fetch_error",
        "recommended_for",
        "gpu field"
    ) `
    -Message "Device status tests cover health fallback, offline fallback, fetch-error reason, and recommendation suppression."

$deviceDiscoveryPath = "musu-bee\src\lib\useDeviceDiscovery.ts"
$deviceDiscoveryText = Get-RepoText $deviceDiscoveryPath
Add-ContainsAllCheck `
    -Scope "device-status-ui" `
    -Name "device discovery reads degraded envelope devices" `
    -Text $deviceDiscoveryText `
    -Path $deviceDiscoveryPath `
    -Needles @(
        "DeviceStatusResponse",
        "normalizeDeviceStatusResponse",
        "payload.devices"
    ) `
    -Message "Device discovery accepts the device-status envelope instead of assuming a bare array."

$nodesMeshPath = "musu-bee\src\app\api\nodes\mesh\route.ts"
$nodesMeshText = Get-RepoText $nodesMeshPath
Add-RegexCheck `
    -Scope "nodes-api" `
    -Name "nodes mesh has degraded status" `
    -Text $nodesMeshText `
    -Path $nodesMeshPath `
    -Pattern 'status:\s*"online"\s*\|\s*"offline"\s*\|\s*"degraded"' `
    -Message "Nodes mesh API type allows degraded status."
Add-RegexCheck `
    -Scope "nodes-api" `
    -Name "nodes mesh marks health fallback as degraded" `
    -Text $nodesMeshText `
    -Path $nodesMeshPath `
    -Pattern 'status:\s*healthRes\?\.ok\s*\?\s*"online"\s*:\s*"degraded"' `
    -Message "Nodes mesh API marks unreachable worker/bridge health as degraded before full offline failure."

$sidebarPath = "musu-bee\src\components\Sidebar.tsx"
$sidebarText = Get-RepoText $sidebarPath
Add-ContainsAllCheck `
    -Scope "ui" `
    -Name "sidebar degraded badge" `
    -Text $sidebarText `
    -Path $sidebarPath `
    -Needles @(
        "agentsSurface?.degraded",
        '"DEGRADED"',
        '"SYNC"'
    ) `
    -Message "Sidebar exposes degraded agents state instead of showing a normal sync badge."

$nodesPanelPath = "musu-bee\src\components\NodesPanel.tsx"
$nodesPanelText = Get-RepoText $nodesPanelPath
Add-ContainsAllCheck `
    -Scope "ui" `
    -Name "nodes panel degraded visual" `
    -Text $nodesPanelText `
    -Path $nodesPanelPath `
    -Needles @(
        'status: "online" | "offline" | "degraded" | "error"',
        'degraded: "var(--status-warn)"',
        'degraded: "'
    ) `
    -Message "Nodes panel renders degraded node status with a warn visual state."

$cosRoutePath = "musu-bee\src\app\api\cos-synthesis\[company_id]\route.ts"
$cosRouteText = Get-RepoText $cosRoutePath
Add-ContainsAllCheck `
    -Scope "cos-synthesis" `
    -Name "cos synthesis structured degraded envelope" `
    -Text $cosRouteText `
    -Path $cosRoutePath `
    -Needles @(
        "degraded: true",
        "degrade_reason",
        "bridge_invalid_json",
        "bridge_timeout",
        "bridge_unavailable"
    ) `
    -Message "COS synthesis proxy returns structured degraded envelopes for invalid JSON, timeout, and bridge unavailable paths."

$projectBriefingPath = "musu-bee\src\components\ProjectBriefing.tsx"
$projectBriefingText = Get-RepoText $projectBriefingPath
Add-ContainsAllCheck `
    -Scope "cos-synthesis-ui" `
    -Name "project briefing handles degraded synthesis" `
    -Text $projectBriefingText `
    -Path $projectBriefingPath `
    -Needles @(
        "data.degraded || !data.synthesis",
        "setDegradeReason",
        "degrade_reason",
        "proxy_invalid_json"
    ) `
    -Message "Project briefing suppresses synthesized output and records degrade reason when synthesis is degraded."

$packagePath = "musu-bee\package.json"
$packageText = Get-RepoText $packagePath
Add-ContainsAllCheck `
    -Scope "ci" `
    -Name "route tests include degraded surfaces" `
    -Text $packageText `
    -Path $packagePath `
    -Needles @(
        '"test:routes"',
        "src/app/api/agents/route.test.ts",
        "src/app/api/device-status/route.test.ts"
    ) `
    -Message "Route test command includes agents and device-status degraded/fallback regression tests."

$failCount = @($checks | Where-Object { $_.status -eq "fail" }).Count
$result = [pscustomobject]@{
    schema = "musu.degraded_mode_contract.v1"
    ok = ($failCount -eq 0)
    generated_at = [datetimeoffset]::Now.ToString("o")
    fail_count = $failCount
    checks = $checks.ToArray()
}

if ($Json) {
    $result | ConvertTo-Json -Depth 8
}
else {
    "MUSU degraded mode contract audit"
    "ok: $($result.ok)"
    "fail_count: $($result.fail_count)"
    ""
    $checks | Format-Table scope, name, status, path, message -Wrap
}

if ($FailOnProblem -and -not $result.ok) {
    exit 1
}
