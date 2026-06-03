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
$directIntervalHits = New-Object System.Collections.Generic.List[object]
$directVisibilityListenerHits = New-Object System.Collections.Generic.List[object]

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

function Add-NoRegexCheck {
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
        -Passed (-not [regex]::IsMatch($Text, $Pattern)) `
        -Path $Path `
        -Message $Message
}

$pollerPath = "musu-bee\src\lib\useLowDutyPolling.ts"
$pollerText = Get-RepoText $pollerPath
Add-RegexCheck -Scope "poller" -Name "task timeout option" -Text $pollerText -Pattern 'taskTimeoutMs\?:\s*number' -Path $pollerPath -Message "Shared poller exposes a task timeout option."
Add-RegexCheck -Scope "poller" -Name "default task timeout" -Text $pollerText -Pattern 'DEFAULT_LOW_DUTY_POLL_TASK_TIMEOUT_MS\s*=\s*10_000' -Path $pollerPath -Message "Shared poller defaults each task to a 10s timeout."
Add-RegexCheck -Scope "poller" -Name "minimum interval clamp" -Text $pollerText -Pattern 'MIN_LOW_DUTY_POLL_INTERVAL_MS\s*=\s*5_000' -Path $pollerPath -Message "Shared poller clamps accidental tight intervals at 5s."
Add-RegexCheck -Scope "poller" -Name "hidden-tab backoff" -Text $pollerText -Pattern 'LOW_DUTY_HIDDEN_BACKOFF_MULTIPLIER\s*=\s*4' -Path $pollerPath -Message "Shared poller backs off hidden tabs."
Add-RegexCheck -Scope "poller" -Name "timeout abort signal" -Text $pollerText -Pattern 'AbortSignal\.timeout\(taskTimeoutMs\)' -Path $pollerPath -Message "Shared poller creates a timeout abort signal."
Add-RegexCheck -Scope "poller" -Name "combined abort signal" -Text $pollerText -Pattern 'AbortSignal\.any' -Path $pollerPath -Message "Shared poller combines cleanup and timeout abort signals."
Add-RegexCheck -Scope "poller" -Name "no overlapping tasks" -Text $pollerText -Pattern '\binFlight\b' -Path $pollerPath -Message "Shared poller tracks in-flight work to avoid overlapping refreshes."
Add-RegexCheck -Scope "poller" -Name "cleanup aborts task" -Text $pollerText -Pattern 'controller\?\.abort\(\)' -Path $pollerPath -Message "Shared poller aborts an active task during cleanup."
Add-RegexCheck -Scope "poller" -Name "single visibility listener owner" -Text $pollerText -Pattern 'document\.addEventListener\("visibilitychange"' -Path $pollerPath -Message "Shared poller owns the visibilitychange listener."
Add-NoRegexCheck -Scope "poller" -Name "no interval timer in shared poller" -Text $pollerText -Pattern 'setInterval\s*\(' -Path $pollerPath -Message "Shared poller uses one-shot timers, not setInterval."

$surfaceChecks = @(
    [pscustomobject]@{
        path = "musu-bee\src\app\c\[id]\workflows\[wfId]\edit\RunPanel.tsx"
        required = @('useLowDutyPolling', 'intervalMs:\s*5_000')
        disallowed = @('setInterval\s*\(')
        description = "workflow run panel polling"
    },
    [pscustomobject]@{
        path = "musu-bee\src\app\app\screen\page.tsx"
        required = @('useLowDutyPolling', 'maxBackoffMs:\s*120_000')
        disallowed = @('setInterval\s*\(')
        description = "remote screen device polling"
    },
    [pscustomobject]@{
        path = "musu-bee\src\lib\useAgentsSurface.ts"
        required = @('useLowDutyPolling', 'AGENTS_SURFACE_REFRESH_HIDDEN_MS')
        disallowed = @('setInterval\s*\(', 'document\.addEventListener\("visibilitychange"')
        description = "agents surface polling"
    },
    [pscustomobject]@{
        path = "musu-bee\src\components\onboarding\useOnboardingFlow.ts"
        required = @('useLowDutyPolling', 'pollResearchTask')
        disallowed = @('setInterval\s*\(')
        description = "onboarding research polling"
    },
    [pscustomobject]@{
        path = "musu-bee\src\components\dashboard\DashboardClient.tsx"
        required = @('useLowDutyPolling', 'intervalMs:\s*DASHBOARD_REFRESH_VISIBLE_MS', 'maxBackoffMs:\s*DASHBOARD_REFRESH_HIDDEN_MS', 'taskTimeoutMs:\s*DASHBOARD_REFRESH_TIMEOUT_MS')
        disallowed = @('setInterval\s*\(', 'document\.addEventListener\("visibilitychange"')
        description = "dashboard aggregate polling"
    },
    [pscustomobject]@{
        path = "musu-bee\src\components\NodePanel.tsx"
        required = @('useLowDutyPolling', 'intervalMs:\s*NODE_PANEL_REFRESH_VISIBLE_MS', 'maxBackoffMs:\s*NODE_PANEL_REFRESH_HIDDEN_MS')
        disallowed = @('setInterval\s*\(', 'document\.addEventListener\("visibilitychange"')
        description = "node panel polling"
    }
)

foreach ($surface in $surfaceChecks) {
    $text = Get-RepoText $surface.path
    foreach ($pattern in $surface.required) {
        Add-RegexCheck `
            -Scope "surface" `
            -Name "$($surface.description): required $pattern" `
            -Text $text `
            -Pattern $pattern `
            -Path $surface.path `
            -Message "$($surface.description) keeps the required low-duty polling marker."
    }
    foreach ($pattern in $surface.disallowed) {
        Add-NoRegexCheck `
            -Scope "surface" `
            -Name "$($surface.description): disallowed $pattern" `
            -Text $text `
            -Pattern $pattern `
            -Path $surface.path `
            -Message "$($surface.description) does not own tight interval or visibility polling directly."
    }
}

$dashboardPath = "musu-bee\src\components\dashboard\DashboardClient.tsx"
$dashboardText = Get-RepoText $dashboardPath
Add-RegexCheck -Scope "relay" -Name "relay connect is on demand" -Text $dashboardText -Pattern 'handleRelayConnect' -Path $dashboardPath -Message "Dashboard relay connection is user/action driven."
Add-RegexCheck -Scope "relay" -Name "relay token is fetched only by connect path" -Text $dashboardText -Pattern 'fetchRelayToken' -Path $dashboardPath -Message "Dashboard has an explicit relay-token fetch helper."
Add-NoRegexCheck -Scope "relay" -Name "no mount-time relay autoconnect wording" -Text $dashboardText -Pattern 'Auto-connect when relayInfo' -Path $dashboardPath -Message "Dashboard does not keep the old mount-time relay autoconnect path."
Add-NoRegexCheck -Scope "relay" -Name "no direct relay autoconnect call" -Text $dashboardText -Pattern 'connectRelay\(relayInfo,\s*selectedNode\)' -Path $dashboardPath -Message "Dashboard does not call connectRelay from a relayInfo effect."
Add-RegexCheck -Scope "relay" -Name "relay initial reconnect cap" -Text $dashboardText -Pattern 'RELAY_RECONNECT_INITIAL_MS\s*=\s*5_000' -Path $dashboardPath -Message "Relay reconnect starts at 5s."
Add-RegexCheck -Scope "relay" -Name "relay max reconnect cap" -Text $dashboardText -Pattern 'RELAY_RECONNECT_MAX_MS\s*=\s*60_000' -Path $dashboardPath -Message "Relay reconnect caps at 60s."
Add-RegexCheck -Scope "relay" -Name "relay multiplier" -Text $dashboardText -Pattern 'RELAY_RECONNECT_MULTIPLIER\s*=\s*2' -Path $dashboardPath -Message "Relay reconnect uses bounded exponential backoff."
Add-RegexCheck -Scope "relay" -Name "relay retry count cap" -Text $dashboardText -Pattern 'MAX_RETRIES\s*=\s*5' -Path $dashboardPath -Message "Relay reconnect attempts are capped."
Add-RegexCheck -Scope "relay" -Name "relay retry cleanup" -Text $dashboardText -Pattern 'clearRetry' -Path $dashboardPath -Message "Relay reconnect timers have a cleanup path."
Add-NoRegexCheck -Scope "relay" -Name "no legacy fixed retry delay" -Text $dashboardText -Pattern 'const RETRY_DELAY_MS\s*=' -Path $dashboardPath -Message "Relay reconnect does not use an uncapped fixed retry loop."

$chatPath = "musu-bee\src\lib\useChat.ts"
$chatText = Get-RepoText $chatPath
Add-RegexCheck -Scope "sse" -Name "chat SSE initial reconnect" -Text $chatText -Pattern 'SSE_RECONNECT_INITIAL_MS\s*=\s*1_000' -Path $chatPath -Message "Chat SSE reconnect starts at 1s."
Add-RegexCheck -Scope "sse" -Name "chat SSE max reconnect" -Text $chatText -Pattern 'SSE_RECONNECT_MAX_MS\s*=\s*10_000' -Path $chatPath -Message "Chat SSE reconnect caps at 10s."
Add-RegexCheck -Scope "sse" -Name "chat SSE multiplier" -Text $chatText -Pattern 'SSE_RECONNECT_MULTIPLIER\s*=\s*2' -Path $chatPath -Message "Chat SSE reconnect has exponential backoff."
Add-RegexCheck -Scope "sse" -Name "chat SSE stale generation guard" -Text $chatText -Pattern 'reconnectGenerationRef\.current\s*!==\s*reconnectGeneration' -Path $chatPath -Message "Chat SSE ignores stale reconnect generations."
Add-RegexCheck -Scope "sse" -Name "chat SSE clears timer" -Text $chatText -Pattern 'clearReconnectTimer' -Path $chatPath -Message "Chat SSE reconnect timers are cleared."
Add-RegexCheck -Scope "sse" -Name "chat SSE connecting state guarded" -Text $chatText -Pattern 'EventSource\.CONNECTING' -Path $chatPath -Message "Chat SSE avoids duplicate reconnects while EventSource is connecting."

$fleetStorePath = "musu-bee\src\store\useFleetStore.ts"
$fleetStoreText = Get-RepoText $fleetStorePath
Add-RegexCheck -Scope "sse" -Name "fleet SSE initial reconnect" -Text $fleetStoreText -Pattern 'FLEET_SSE_RECONNECT_INITIAL_MS\s*=\s*1_000' -Path $fleetStorePath -Message "Fleet SSE reconnect starts at 1s."
Add-RegexCheck -Scope "sse" -Name "fleet SSE max reconnect" -Text $fleetStoreText -Pattern 'FLEET_SSE_RECONNECT_MAX_MS\s*=\s*10_000' -Path $fleetStorePath -Message "Fleet SSE reconnect caps at 10s."
Add-RegexCheck -Scope "sse" -Name "fleet SSE retry cap" -Text $fleetStoreText -Pattern 'FLEET_SSE_MAX_RETRIES\s*=\s*5' -Path $fleetStorePath -Message "Fleet SSE reconnect attempts are capped."
Add-RegexCheck -Scope "sse" -Name "fleet SSE stale generation guard" -Text $fleetStoreText -Pattern 'fleetReconnectGeneration\s*!==\s*reconnectGeneration' -Path $fleetStorePath -Message "Fleet SSE ignores stale reconnect generations."
Add-RegexCheck -Scope "sse" -Name "fleet SSE clears timer" -Text $fleetStoreText -Pattern 'clearFleetReconnectTimer' -Path $fleetStorePath -Message "Fleet SSE reconnect timers are cleared."
Add-RegexCheck -Scope "sse" -Name "fleet SSE close helper" -Text $fleetStoreText -Pattern 'closeSSE' -Path $fleetStorePath -Message "Fleet SSE exposes explicit close/cleanup."
Add-NoRegexCheck -Scope "sse" -Name "fleet SSE no interval" -Text $fleetStoreText -Pattern 'setInterval\s*\(' -Path $fleetStorePath -Message "Fleet SSE does not use setInterval."

$fleetPagePath = "musu-bee\src\app\dashboard\fleet\page.tsx"
$fleetPageText = Get-RepoText $fleetPagePath
Add-RegexCheck -Scope "sse" -Name "fleet page closes SSE on unmount" -Text $fleetPageText -Pattern 'return \(\) => closeSSE\(\)' -Path $fleetPagePath -Message "Fleet dashboard closes SSE on unmount."

$agentPagePath = "musu-bee\src\app\dashboard\agent\[id]\page.tsx"
$agentPageText = Get-RepoText $agentPagePath
Add-RegexCheck -Scope "sse" -Name "agent page closes SSE on unmount" -Text $agentPageText -Pattern 'return \(\) => closeSSE\(\)' -Path $agentPagePath -Message "Agent dashboard closes SSE on unmount."

$contractTestPath = "musu-bee\src\app\runtime-polling-contract.test.ts"
$contractTestText = Get-RepoText $contractTestPath
foreach ($marker in @(
    "dashboard refresh loop stays on shared low-duty polling",
    "dashboard relay reconnect stays bounded with capped backoff",
    "chat SSE reconnect clears timers and ignores stale generations",
    "fleet store SSE reconnect is bounded and explicitly closed",
    "node panel refresh loop stays on shared low-duty polling",
    "shared low-duty polling supports bounded task timeout cancellation",
    "shared low-duty polling clamps accidental tight intervals"
)) {
    Add-Check `
        -Scope "test" `
        -Name "runtime polling test marker: $marker" `
        -Passed ($contractTestText.Contains($marker)) `
        -Path $contractTestPath `
        -Message "Runtime polling contract test includes '$marker'."
}

$packageJsonPath = "musu-bee\package.json"
$packageJsonText = Get-RepoText $packageJsonPath
Add-Check `
    -Scope "test" `
    -Name "package script test:runtime-polling" `
    -Passed ($packageJsonText.Contains('"test:runtime-polling"')) `
    -Path $packageJsonPath `
    -Message "Frontend package exposes the runtime polling contract test script."

$workflowPath = ".github\workflows\test.yml"
$workflowText = Get-RepoText $workflowPath
Add-Check `
    -Scope "ci" `
    -Name "CI runtime polling test step" `
    -Passed ($workflowText.Contains("Runtime polling contract tests") -and $workflowText.Contains("npm run test:runtime-polling")) `
    -Path $workflowPath `
    -Message "CI runs the runtime polling contract tests."

$sourceRoot = Join-Path $repoRoot "musu-bee\src"
if (-not (Test-Path -LiteralPath $sourceRoot)) {
    Add-Check -Scope "source" -Name "frontend source root exists" -Passed $false -Path "musu-bee\src" -Message "Frontend source root is missing."
}
else {
    $sourceFiles = @(
        Get-ChildItem -LiteralPath $sourceRoot -Recurse -File |
            Where-Object {
                $_.Extension -in @(".ts", ".tsx") -and
                $_.Name -notmatch '\.(test|spec)\.tsx?$' -and
                $_.Name -notmatch '\.d\.ts$'
            }
    )

    foreach ($file in $sourceFiles) {
        $relative = $file.FullName
        if ($relative.StartsWith($repoRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
            $relative = $relative.Substring($repoRoot.Length).TrimStart("\", "/")
        }
        $relative = $relative.Replace("/", "\")
        $text = Get-Content -LiteralPath $file.FullName -Raw
        if ([regex]::IsMatch($text, 'setInterval\s*\(')) {
            $directIntervalHits.Add([pscustomobject]@{ path = $relative }) | Out-Null
        }
        if ($relative -ne $pollerPath -and $text.Contains('addEventListener("visibilitychange"')) {
            $directVisibilityListenerHits.Add([pscustomobject]@{ path = $relative }) | Out-Null
        }
    }

    Add-Check `
        -Scope "source" `
        -Name "no direct setInterval in non-test frontend source" `
        -Passed ($directIntervalHits.Count -eq 0) `
        -Path "musu-bee\src" `
        -Message ($(if ($directIntervalHits.Count -eq 0) { "No direct setInterval calls found in non-test frontend source." } else { "Direct setInterval calls found: $(@($directIntervalHits | ForEach-Object { $_.path }) -join ', ')." }))
    Add-Check `
        -Scope "source" `
        -Name "visibilitychange owned only by shared poller" `
        -Passed ($directVisibilityListenerHits.Count -eq 0) `
        -Path "musu-bee\src" `
        -Message ($(if ($directVisibilityListenerHits.Count -eq 0) { "No direct visibilitychange listeners found outside the shared poller." } else { "Direct visibilitychange listeners found outside shared poller: $(@($directVisibilityListenerHits | ForEach-Object { $_.path }) -join ', ')." }))
}

$failCount = @($checks | Where-Object { $_.status -eq "fail" }).Count
$result = [pscustomobject]@{
    schema = "musu.frontend_polling_contract.v1"
    ok = ($failCount -eq 0)
    generated_at = [datetimeoffset]::Now.ToString("o")
    fail_count = $failCount
    direct_interval_hit_count = $directIntervalHits.Count
    direct_interval_hits = $directIntervalHits.ToArray()
    direct_visibility_listener_hit_count = $directVisibilityListenerHits.Count
    direct_visibility_listener_hits = $directVisibilityListenerHits.ToArray()
    checks = $checks.ToArray()
}

if ($Json) {
    $result | ConvertTo-Json -Depth 8
}
else {
    "MUSU frontend polling contract audit"
    "ok: $($result.ok)"
    "fail_count: $($result.fail_count)"
    "direct_interval_hit_count: $($result.direct_interval_hit_count)"
    "direct_visibility_listener_hit_count: $($result.direct_visibility_listener_hit_count)"
    ""
    $checks | Format-Table scope, name, status, path, message -Wrap
}

if ($FailOnProblem -and -not $result.ok) {
    exit 1
}
