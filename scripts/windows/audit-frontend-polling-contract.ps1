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
$lowDutyPollingCallSites = New-Object System.Collections.Generic.List[object]
$lowDutyPollingSignalGaps = New-Object System.Collections.Generic.List[object]

$expectedLowDutyPollingCallSitePaths = @(
    "musu-bee\src\app\app\screen\page.tsx",
    "musu-bee\src\app\c\[id]\page.tsx",
    "musu-bee\src\app\c\[id]\workflows\[wfId]\edit\RunPanel.tsx",
    "musu-bee\src\app\dashboard\fleet\page.tsx",
    "musu-bee\src\app\fleet\page.tsx",
    "musu-bee\src\app\m\[id]\page.tsx",
    "musu-bee\src\components\ApprovalsPanel.tsx",
    "musu-bee\src\components\AppShell.tsx",
    "musu-bee\src\components\CostsPanel.tsx",
    "musu-bee\src\components\DoctorStatusCard.tsx",
    "musu-bee\src\components\GoalsPanel.tsx",
    "musu-bee\src\components\IssuesPanel.tsx",
    "musu-bee\src\components\NodePanel.tsx",
    "musu-bee\src\components\NodesPanel.tsx",
    "musu-bee\src\components\ProjectsPanel.tsx",
    "musu-bee\src\components\TasksPanel.tsx",
    "musu-bee\src\components\canvas\useCompaniesCanvasData.ts",
    "musu-bee\src\components\canvas\useCompanyMessageFlow.ts",
    "musu-bee\src\components\dashboard\DashboardClient.tsx",
    "musu-bee\src\components\onboarding\useOnboardingFlow.ts",
    "musu-bee\src\lib\useAgentsSurface.ts",
    "musu-bee\src\lib\useBoundedEventSource.ts",
    "musu-bee\src\lib\useDeviceDiscovery.ts",
    "musu-bee\src\lib\useInbox.ts",
    "musu-bee\src\lib\useNodes.ts",
    "musu-bee\src\lib\useProcesses.ts",
    "musu-bee\src\lib\useServiceHealth.ts",
    "musu-bee\views\nodes\NodesView.tsx",
    "musu-bee\views\tasks\TasksView.tsx"
)

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

$viewsPollerPath = "musu-bee\views\shared\useLowDutyPolling.ts"
$viewsPollerText = Get-RepoText $viewsPollerPath
Add-RegexCheck -Scope "views-poller" -Name "views task timeout option" -Text $viewsPollerText -Pattern 'taskTimeoutMs\?:\s*number' -Path $viewsPollerPath -Message "MCP app views poller exposes a task timeout option."
Add-RegexCheck -Scope "views-poller" -Name "views default task timeout" -Text $viewsPollerText -Pattern 'DEFAULT_LOW_DUTY_POLL_TASK_TIMEOUT_MS\s*=\s*10_000' -Path $viewsPollerPath -Message "MCP app views poller defaults each task to a 10s timeout."
Add-RegexCheck -Scope "views-poller" -Name "views minimum interval clamp" -Text $viewsPollerText -Pattern 'MIN_LOW_DUTY_POLL_INTERVAL_MS\s*=\s*5_000' -Path $viewsPollerPath -Message "MCP app views poller clamps accidental tight intervals at 5s."
Add-RegexCheck -Scope "views-poller" -Name "views hidden-tab backoff" -Text $viewsPollerText -Pattern 'LOW_DUTY_HIDDEN_BACKOFF_MULTIPLIER\s*=\s*4' -Path $viewsPollerPath -Message "MCP app views poller backs off hidden tabs."
Add-RegexCheck -Scope "views-poller" -Name "views timeout abort signal" -Text $viewsPollerText -Pattern 'AbortSignal\.timeout\(taskTimeoutMs\)' -Path $viewsPollerPath -Message "MCP app views poller creates a timeout abort signal."
Add-RegexCheck -Scope "views-poller" -Name "views combined abort signal" -Text $viewsPollerText -Pattern 'AbortSignal\.any' -Path $viewsPollerPath -Message "MCP app views poller combines cleanup and timeout abort signals."
Add-RegexCheck -Scope "views-poller" -Name "views no overlapping tasks" -Text $viewsPollerText -Pattern '\binFlight\b' -Path $viewsPollerPath -Message "MCP app views poller tracks in-flight work to avoid overlapping refreshes."
Add-RegexCheck -Scope "views-poller" -Name "views cleanup aborts task" -Text $viewsPollerText -Pattern 'controller\?\.abort\(\)' -Path $viewsPollerPath -Message "MCP app views poller aborts an active task during cleanup."
Add-RegexCheck -Scope "views-poller" -Name "views single visibility listener owner" -Text $viewsPollerText -Pattern 'document\.addEventListener\("visibilitychange"' -Path $viewsPollerPath -Message "MCP app views poller owns the visibilitychange listener."
Add-NoRegexCheck -Scope "views-poller" -Name "views no interval timer in shared poller" -Text $viewsPollerText -Pattern 'setInterval\s*\(' -Path $viewsPollerPath -Message "MCP app views poller uses one-shot timers, not setInterval."

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
    },
    [pscustomobject]@{
        path = "musu-bee\views\nodes\NodesView.tsx"
        required = @('useLowDutyPolling', 'intervalMs:\s*POLL_INTERVAL_MS', 'taskTimeoutMs:\s*10_000', 'useLowDutyPolling\(\(signal\)\s*=>\s*pollNodes\(signal\)', 'callServerTool\([\s\S]*name:\s*"poll_agents"[\s\S]*signal\s*\?\s*\{\s*signal\s*\}\s*:\s*undefined')
        disallowed = @('setInterval\s*\(', 'document\.addEventListener\("visibilitychange"')
        description = "MCP nodes view polling"
    },
    [pscustomobject]@{
        path = "musu-bee\views\tasks\TasksView.tsx"
        required = @('useLowDutyPolling', 'intervalMs:\s*POLL_INTERVAL_MS', 'taskTimeoutMs:\s*10_000', 'useLowDutyPolling\(\(signal\)\s*=>\s*pollTasks\(null,\s*signal\)', 'callServerTool\([\s\S]*name:\s*"poll_tasks"[\s\S]*signal\s*\?\s*\{\s*signal\s*\}\s*:\s*undefined')
        disallowed = @('setInterval\s*\(', 'document\.addEventListener\("visibilitychange"')
        description = "MCP tasks view polling"
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

$viewsApiPath = "musu-bee\views\shared\api.ts"
$viewsApiText = Get-RepoText $viewsApiPath
Add-RegexCheck -Scope "views-api" -Name "task fetch wrapper accepts abort signal" -Text $viewsApiText -Pattern 'fetchTasks\([\s\S]*signal\?:\s*AbortSignal' -Path $viewsApiPath -Message "MCP app task fetch wrapper accepts poller abort signals."
Add-RegexCheck -Scope "views-api" -Name "task fetch wrapper passes abort signal" -Text $viewsApiText -Pattern 'fetch\(`\$\{config\.bridgeUrl\}/api/tasks\?\$\{qs\}`[\s\S]*signal,' -Path $viewsApiPath -Message "MCP app task fetch wrapper passes abort signals to fetch."
Add-RegexCheck -Scope "views-api" -Name "task cancel wrapper accepts abort signal" -Text $viewsApiText -Pattern 'cancelTask\([\s\S]*signal\?:\s*AbortSignal' -Path $viewsApiPath -Message "MCP app task cancel wrapper accepts abort signals."
Add-RegexCheck -Scope "views-api" -Name "task cancel wrapper passes abort signal" -Text $viewsApiText -Pattern 'fetch\(`\$\{config\.bridgeUrl\}/api/tasks/\$\{taskId\}`[\s\S]*signal,' -Path $viewsApiPath -Message "MCP app task cancel wrapper passes abort signals to fetch."

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
Add-RegexCheck -Scope "sse" -Name "chat SSE retry cap" -Text $chatText -Pattern 'SSE_MAX_RETRIES\s*=\s*5' -Path $chatPath -Message "Chat SSE reconnect attempts are capped."
Add-RegexCheck -Scope "sse" -Name "chat SSE retry cap guard" -Text $chatText -Pattern 'reconnectAttempts\.current\s*>=\s*SSE_MAX_RETRIES' -Path $chatPath -Message "Chat SSE stops reconnecting after the retry cap."
Add-RegexCheck -Scope "sse" -Name "chat SSE stale generation guard" -Text $chatText -Pattern 'reconnectGenerationRef\.current\s*!==\s*reconnectGeneration' -Path $chatPath -Message "Chat SSE ignores stale reconnect generations."
Add-RegexCheck -Scope "sse" -Name "chat SSE clears timer" -Text $chatText -Pattern 'clearReconnectTimer' -Path $chatPath -Message "Chat SSE reconnect timers are cleared."
Add-RegexCheck -Scope "sse" -Name "chat SSE resets reconnect state" -Text $chatText -Pattern 'resetReconnectState' -Path $chatPath -Message "Chat SSE resets reconnect counters on successful connect or lifecycle reset."
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

$boundedSsePath = "musu-bee\src\lib\useBoundedEventSource.ts"
$boundedSseText = Get-RepoText $boundedSsePath
Add-RegexCheck -Scope "sse" -Name "bounded SSE initial reconnect" -Text $boundedSseText -Pattern 'BOUNDED_SSE_RECONNECT_INITIAL_MS\s*=\s*1_000' -Path $boundedSsePath -Message "Shared bounded EventSource reconnect starts at 1s."
Add-RegexCheck -Scope "sse" -Name "bounded SSE max reconnect" -Text $boundedSseText -Pattern 'BOUNDED_SSE_RECONNECT_MAX_MS\s*=\s*10_000' -Path $boundedSsePath -Message "Shared bounded EventSource reconnect caps at 10s."
Add-RegexCheck -Scope "sse" -Name "bounded SSE retry cap" -Text $boundedSseText -Pattern 'BOUNDED_SSE_MAX_RETRIES\s*=\s*5' -Path $boundedSsePath -Message "Shared bounded EventSource reconnect attempts are capped."
Add-RegexCheck -Scope "sse" -Name "bounded SSE visibility reconnect poller" -Text $boundedSseText -Pattern 'useLowDutyPolling[\s\S]*BOUNDED_SSE_VISIBILITY_RECONNECT_CHECK_MS' -Path $boundedSsePath -Message "Shared bounded EventSource uses low-duty visibility reconnect checks."
Add-RegexCheck -Scope "sse" -Name "bounded SSE closes failed stream" -Text $boundedSseText -Pattern 'es\.close\(\)[\s\S]*reconnectAttempts\s*>=\s*maxRetries' -Path $boundedSsePath -Message "Shared bounded EventSource closes failed streams and respects retry cap."
Add-NoRegexCheck -Scope "sse" -Name "bounded SSE no visibility listener" -Text $boundedSseText -Pattern 'document\.addEventListener\("visibilitychange"' -Path $boundedSsePath -Message "Shared bounded EventSource delegates visibility cadence to the low-duty poller."

$ceoChatPath = "musu-bee\src\components\dispatch\CeoChatClient.tsx"
$ceoChatText = Get-RepoText $ceoChatPath
Add-RegexCheck -Scope "sse" -Name "CEO dispatch streams tracked" -Text $ceoChatText -Pattern 'runStreamsRef\s*=\s*useRef<Map<string,\s*EventSource>>\(new Map\(\)\)' -Path $ceoChatPath -Message "CEO dispatch run streams are tracked for cleanup."
Add-RegexCheck -Scope "sse" -Name "CEO dispatch close helper" -Text $ceoChatText -Pattern 'closeRunStream' -Path $ceoChatPath -Message "CEO dispatch run streams have an explicit close helper."
Add-RegexCheck -Scope "sse" -Name "CEO dispatch stream registered" -Text $ceoChatText -Pattern 'runStreamsRef\.current\.set\(runId,\s*es\)' -Path $ceoChatPath -Message "CEO dispatch registers each EventSource by run id."
Add-RegexCheck -Scope "sse" -Name "CEO dispatch stream removed" -Text $ceoChatText -Pattern 'runStreamsRef\.current\.delete\(runId\)' -Path $ceoChatPath -Message "CEO dispatch removes EventSources when closing them."
Add-RegexCheck -Scope "sse" -Name "CEO dispatch unmount cleanup" -Text $ceoChatText -Pattern 'runStreamsRef\.current\.values\(\)[\s\S]*stream\.close\(\)[\s\S]*runStreamsRef\.current\.clear\(\)' -Path $ceoChatPath -Message "CEO dispatch closes active run streams on unmount."
Add-RegexCheck -Scope "sse" -Name "CEO dispatch error closes stream" -Text $ceoChatText -Pattern 'es\.onerror\s*=\s*\(\)\s*=>\s*\{[\s\S]*closeCurrentStream\(\)' -Path $ceoChatPath -Message "CEO dispatch closes run streams on SSE errors."
Add-NoRegexCheck -Scope "sse" -Name "CEO dispatch no interval" -Text $ceoChatText -Pattern 'setInterval\s*\(' -Path $ceoChatPath -Message "CEO dispatch does not use interval polling."

$contractTestPath = "musu-bee\src\app\runtime-polling-contract.test.ts"
$contractTestText = Get-RepoText $contractTestPath
foreach ($marker in @(
    "dashboard refresh loop stays on shared low-duty polling",
    "dashboard relay reconnect stays bounded with capped backoff",
    "chat SSE reconnect is capped and ignores stale generations",
    "fleet store SSE reconnect is bounded and explicitly closed",
    "shared bounded EventSource closes failed streams and caps reconnects",
    "dashboard axis pages use bounded EventSource instead of browser auto-retry",
    "CEO dispatch run streams are explicitly closed",
    "node panel refresh loop stays on shared low-duty polling",
    "MCP app views use cancellable low-duty polling instead of setInterval",
    "shared low-duty polling supports bounded task timeout cancellation",
    "shared low-duty polling clamps accidental tight intervals",
    "frontend polling audit inventories all low-duty call sites"
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

$tauriShellPath = "musu-bee\src-tauri-shell\main.js"
$tauriShellText = Get-RepoText $tauriShellPath
Add-NoRegexCheck -Scope "desktop-shell" -Name "Tauri shell no interval loop" -Text $tauriShellText -Pattern 'setInterval\s*\(' -Path $tauriShellPath -Message "Tauri shell does not own an interval polling loop."
Add-NoRegexCheck -Scope "desktop-shell" -Name "Tauri shell no timeout loop" -Text $tauriShellText -Pattern 'setTimeout\s*\(' -Path $tauriShellPath -Message "Tauri shell does not own a retry or refresh timeout loop."
Add-NoRegexCheck -Scope "desktop-shell" -Name "Tauri shell no animation loop" -Text $tauriShellText -Pattern 'requestAnimationFrame\s*\(' -Path $tauriShellPath -Message "Tauri shell does not own an animation loop."

$sourceRoots = @("musu-bee\src", "musu-bee\views")
$sourceFiles = @()
foreach ($relativeRoot in $sourceRoots) {
    $sourceRoot = Join-Path $repoRoot $relativeRoot
    if (-not (Test-Path -LiteralPath $sourceRoot)) {
        Add-Check -Scope "source" -Name "frontend source root exists: $relativeRoot" -Passed $false -Path $relativeRoot -Message "$relativeRoot is missing."
        continue
    }

    $sourceFiles += @(
        Get-ChildItem -LiteralPath $sourceRoot -Recurse -File |
            Where-Object {
                $_.Extension -in @(".ts", ".tsx") -and
                $_.Name -notmatch '\.(test|spec)\.tsx?$' -and
                $_.Name -notmatch '\.d\.ts$'
            }
    )
}

foreach ($file in $sourceFiles) {
    $relative = $file.FullName
    if ($relative.StartsWith($repoRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
        $relative = $relative.Substring($repoRoot.Length).TrimStart("\", "/")
    }
    $relative = $relative.Replace("/", "\")
    $text = Get-Content -LiteralPath $file.FullName -Raw
    $isSharedPollerDefinition = $relative -in @($pollerPath, $viewsPollerPath)
    $lowDutyMatches = [regex]::Matches($text, 'useLowDutyPolling\s*\(')
    if (-not $isSharedPollerDefinition -and $lowDutyMatches.Count -gt 0) {
        $signalAware = (
            [regex]::IsMatch($text, 'useLowDutyPolling\s*\(\s*(?:async\s*)?\(?\s*signal\b') -or
            [regex]::IsMatch($text, 'useLowDutyPolling\s*\(\s*(?:async\s*)?\(\s*signal\s*:\s*AbortSignal') -or
            [regex]::IsMatch($text, 'function\s+\w+\s*\([^)]*\bsignal\b') -or
            [regex]::IsMatch($text, '(?:const|let)\s+\w+\s*=\s*(?:useCallback\s*\(\s*)?(?:async\s*)?\([^)]*\bsignal\b') -or
            [regex]::IsMatch($text, '(?:const|let)\s+\w+\s*=\s*(?:useCallback\s*\(\s*)?async\s+\([^)]*\bsignal\b')
        )
        $site = [pscustomobject]@{
            path = $relative
            call_count = $lowDutyMatches.Count
            signal_aware = [bool]$signalAware
        }
        $lowDutyPollingCallSites.Add($site) | Out-Null
        if (-not $signalAware) {
            $lowDutyPollingSignalGaps.Add([pscustomobject]@{
                path = $relative
                call_count = $lowDutyMatches.Count
                reason = "polling callback does not expose AbortSignal"
            }) | Out-Null
        }
    }
    if ([regex]::IsMatch($text, 'setInterval\s*\(')) {
        $directIntervalHits.Add([pscustomobject]@{ path = $relative }) | Out-Null
    }
    if ($relative -notin @($pollerPath, $viewsPollerPath) -and $text.Contains('addEventListener("visibilitychange"')) {
        $directVisibilityListenerHits.Add([pscustomobject]@{ path = $relative }) | Out-Null
        }
    }

$actualLowDutyPollingCallSitePaths = @($lowDutyPollingCallSites | ForEach-Object { [string]$_.path } | Sort-Object -Unique)
$expectedLowDutyPollingCallSitePathsSorted = @($expectedLowDutyPollingCallSitePaths | Sort-Object -Unique)
$missingLowDutyPollingCallSites = @($expectedLowDutyPollingCallSitePathsSorted | Where-Object { $actualLowDutyPollingCallSitePaths -notcontains $_ })
$unexpectedLowDutyPollingCallSites = @($actualLowDutyPollingCallSitePaths | Where-Object { $expectedLowDutyPollingCallSitePathsSorted -notcontains $_ })
$lowDutyPollingInventoryOk = (
    $missingLowDutyPollingCallSites.Count -eq 0 -and
    $unexpectedLowDutyPollingCallSites.Count -eq 0 -and
    $actualLowDutyPollingCallSitePaths.Count -eq $expectedLowDutyPollingCallSitePathsSorted.Count
)
$lowDutyPollingMissingSummary = if ($missingLowDutyPollingCallSites.Count -eq 0) { "none" } else { $missingLowDutyPollingCallSites -join ", " }
$lowDutyPollingUnexpectedSummary = if ($unexpectedLowDutyPollingCallSites.Count -eq 0) { "none" } else { $unexpectedLowDutyPollingCallSites -join ", " }

Add-Check `
    -Scope "source" `
    -Name "no direct setInterval in non-test frontend source" `
    -Passed ($directIntervalHits.Count -eq 0) `
    -Path ($sourceRoots -join ", ") `
    -Message ($(if ($directIntervalHits.Count -eq 0) { "No direct setInterval calls found in non-test frontend source or MCP app views." } else { "Direct setInterval calls found: $(@($directIntervalHits | ForEach-Object { $_.path }) -join ', ')." }))
Add-Check `
    -Scope "source" `
    -Name "visibilitychange owned only by shared poller" `
    -Passed ($directVisibilityListenerHits.Count -eq 0) `
    -Path ($sourceRoots -join ", ") `
    -Message ($(if ($directVisibilityListenerHits.Count -eq 0) { "No direct visibilitychange listeners found outside shared pollers." } else { "Direct visibilitychange listeners found outside shared pollers: $(@($directVisibilityListenerHits | ForEach-Object { $_.path }) -join ', ')." }))
Add-Check `
    -Scope "source" `
    -Name "low-duty polling call-site inventory" `
    -Passed $lowDutyPollingInventoryOk `
    -Path ($sourceRoots -join ", ") `
    -Message ($(if ($lowDutyPollingInventoryOk) { "Found exact expected $($expectedLowDutyPollingCallSitePathsSorted.Count) non-test low-duty polling call-site file(s)." } else { "Low-duty polling inventory drift found. expected=$($expectedLowDutyPollingCallSitePathsSorted.Count), actual=$($actualLowDutyPollingCallSitePaths.Count), missing=$lowDutyPollingMissingSummary, unexpected=$lowDutyPollingUnexpectedSummary." }))
Add-Check `
    -Scope "source" `
    -Name "low-duty polling callbacks expose abort signals" `
    -Passed ($lowDutyPollingSignalGaps.Count -eq 0) `
    -Path ($sourceRoots -join ", ") `
    -Message ($(if ($lowDutyPollingSignalGaps.Count -eq 0) { "All inventoried low-duty polling call sites expose AbortSignal-aware callbacks." } else { "Low-duty polling signal gaps found: $(@($lowDutyPollingSignalGaps | ForEach-Object { $_.path }) -join ', ')." }))

$failCount = @($checks | Where-Object { $_.status -eq "fail" }).Count
$result = [pscustomobject]@{
    schema = "musu.frontend_polling_contract.v1"
    ok = ($failCount -eq 0)
    generated_at = [datetimeoffset]::Now.ToString("o")
    fail_count = $failCount
    low_duty_polling_call_site_count = $actualLowDutyPollingCallSitePaths.Count
    expected_low_duty_polling_call_site_count = $expectedLowDutyPollingCallSitePathsSorted.Count
    low_duty_polling_call_sites = $lowDutyPollingCallSites.ToArray()
    missing_low_duty_polling_call_site_count = $missingLowDutyPollingCallSites.Count
    missing_low_duty_polling_call_sites = @($missingLowDutyPollingCallSites)
    unexpected_low_duty_polling_call_site_count = $unexpectedLowDutyPollingCallSites.Count
    unexpected_low_duty_polling_call_sites = @($unexpectedLowDutyPollingCallSites)
    low_duty_polling_signal_gap_count = $lowDutyPollingSignalGaps.Count
    low_duty_polling_signal_gaps = $lowDutyPollingSignalGaps.ToArray()
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
    "low_duty_polling_call_site_count: $($result.low_duty_polling_call_site_count)"
    "low_duty_polling_signal_gap_count: $($result.low_duty_polling_signal_gap_count)"
    "direct_interval_hit_count: $($result.direct_interval_hit_count)"
    "direct_visibility_listener_hit_count: $($result.direct_visibility_listener_hit_count)"
    ""
    $checks | Format-Table scope, name, status, path, message -Wrap
}

if ($FailOnProblem -and -not $result.ok) {
    exit 1
}
