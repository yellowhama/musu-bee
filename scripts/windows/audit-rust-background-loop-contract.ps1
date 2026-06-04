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

$bridgePath = "musu-rs\src\bridge\mod.rs"
$bridgeText = Get-RepoText $bridgePath
Add-RegexCheck -Scope "planner" -Name "planner opt-in env gate" -Text $bridgeText -Pattern 'MUSU_ENABLE_PLANNER' -Path $bridgePath -Message "Planner loop only starts behind MUSU_ENABLE_PLANNER."
Add-RegexCheck -Scope "clipboard" -Name "clipboard opt-in env gate" -Text $bridgeText -Pattern 'MUSU_ENABLE_CLIPBOARD_SYNC' -Path $bridgePath -Message "Clipboard polling only starts behind MUSU_ENABLE_CLIPBOARD_SYNC."
Add-RegexCheck -Scope "relay-payload-poller" -Name "relay payload poller opt-in env gate" -Text $bridgeText -Pattern 'MUSU_ENABLE_RELAY_PAYLOAD_POLLER|start_relay_payload_poller_if_enabled' -Path $bridgePath -Message "Relay payload polling only starts behind MUSU_ENABLE_RELAY_PAYLOAD_POLLER."
Add-RegexCheck -Scope "mdns" -Name "mDNS opt-in env gate" -Text $bridgeText -Pattern 'MUSU_ENABLE_MDNS' -Path $bridgePath -Message "mDNS discovery only starts behind MUSU_ENABLE_MDNS."
Add-RegexCheck -Scope "cloud-heartbeat" -Name "heartbeat interval env" -Text $bridgeText -Pattern 'MUSU_CLOUD_HEARTBEAT_INTERVAL_SEC' -Path $bridgePath -Message "Cloud registration heartbeat interval is explicit."
Add-RegexCheck -Scope "cloud-heartbeat" -Name "heartbeat default" -Text $bridgeText -Pattern 'unwrap_or\(300\)' -Path $bridgePath -Message "Cloud registration heartbeat defaults to 300s."
Add-RegexCheck -Scope "cloud-heartbeat" -Name "heartbeat minimum floor" -Text $bridgeText -Pattern '\.max\(60\)' -Path $bridgePath -Message "Cloud registration heartbeat clamps to at least 60s."
Add-RegexCheck -Scope "cloud-heartbeat" -Name "failure backoff exponent" -Text $bridgeText -Pattern 'consecutive_failures' -Path $bridgePath -Message "Cloud registration loop tracks consecutive failures."
Add-RegexCheck -Scope "cloud-heartbeat" -Name "failure backoff sleep" -Text $bridgeText -Pattern 'sleep_for\s*=\s*Duration::from_secs[\s\S]*tokio::time::sleep\(sleep_for\)\.await' -Path $bridgePath -Message "Cloud registration loop sleeps with failure backoff."

$plannerPath = "musu-rs\src\brain\planner.rs"
$plannerText = Get-RepoText $plannerPath
Add-RegexCheck -Scope "planner" -Name "planner default low duty interval" -Text $plannerText -Pattern 'PLANNER_DEFAULT_INTERVAL_SEC:\s*u64\s*=\s*300' -Path $plannerPath -Message "Planner defaults to a 300s cadence."
Add-RegexCheck -Scope "planner" -Name "planner minimum interval" -Text $plannerText -Pattern 'PLANNER_MIN_INTERVAL_SEC:\s*u64\s*=\s*60' -Path $plannerPath -Message "Planner interval clamps to at least 60s."
Add-RegexCheck -Scope "planner" -Name "planner command timeout cap" -Text $plannerText -Pattern 'PLANNER_MAX_COMMAND_TIMEOUT_SEC:\s*u64\s*=\s*120' -Path $plannerPath -Message "Planner command timeout is capped."
Add-RegexCheck -Scope "planner" -Name "planner sleeps before work" -Text $plannerText -Pattern 'sleep\(Duration::from_secs\(interval\)\)\.await' -Path $plannerPath -Message "Planner loop sleeps every cycle."
Add-RegexCheck -Scope "planner" -Name "planner child kill on drop" -Text $plannerText -Pattern '\.kill_on_drop\(true\)' -Path $plannerPath -Message "Planner child process is killed when dropped."
Add-RegexCheck -Scope "planner" -Name "planner timeout wrapper" -Text $plannerText -Pattern 'timeout\(Duration::from_secs\(command_timeout\),\s*cmd\.output\(\)\)' -Path $plannerPath -Message "Planner child execution is timeout-bound."

$claudeAdapterPath = "musu-rs\src\adapter\claude.rs"
$claudeAdapterText = Get-RepoText $claudeAdapterPath
Add-RegexCheck -Scope "adapter-claude" -Name "shim per-iteration timeout" -Text $claudeAdapterText -Pattern 'PER_ITER_TIMEOUT:\s*Duration\s*=\s*Duration::from_millis\(500\)' -Path $claudeAdapterPath -Message "Claude adapter shim has a bounded no-deadline read timeout."
Add-RegexCheck -Scope "adapter-claude" -Name "shim monotonic deadline" -Text $claudeAdapterText -Pattern 'timeout\.map\(\|t\|\s*Instant::now\(\)\s*\+\s*t\)' -Path $claudeAdapterPath -Message "Claude adapter shim converts task timeouts into monotonic deadlines."
Add-RegexCheck -Scope "adapter-claude" -Name "shim preempt deadline" -Text $claudeAdapterText -Pattern 'deadline_unix_ms[\s\S]*now_ms\s*>=\s*deadline_ms' -Path $claudeAdapterPath -Message "Claude adapter shim honors caller preempt deadlines."
Add-RegexCheck -Scope "adapter-claude" -Name "shim cancellation-aware read" -Text $claudeAdapterText -Pattern 'tokio::select!\s*\{[\s\S]*cancel\.notified\(\)[\s\S]*tokio::time::timeout\(per_iter,\s*read_fut\)' -Path $claudeAdapterPath -Message "Claude adapter shim read loop selects between cancel and bounded stdout read."
Add-RegexCheck -Scope "adapter-claude" -Name "shim bounded read without cancel" -Text $claudeAdapterText -Pattern 'tokio::time::timeout\(per_iter,\s*read_fut\)\.await' -Path $claudeAdapterPath -Message "Claude adapter shim still bounds reads when no cancel token is supplied."
Add-RegexCheck -Scope "adapter-claude" -Name "shim shared kill path" -Text $claudeAdapterText -Pattern 'writer::runner::graceful_kill' -Path $claudeAdapterPath -Message "Claude adapter shim reuses the task runner kill path on cancel/timeout/error."

$clipboardPath = "musu-rs\src\io\clipboard.rs"
$clipboardText = Get-RepoText $clipboardPath
Add-RegexCheck -Scope "clipboard" -Name "clipboard monitor sleep" -Text $clipboardText -Pattern 'std::thread::sleep\(Duration::from_secs\(2\)\)' -Path $clipboardPath -Message "Clipboard monitor sleeps between polls."

$relayPayloadPath = "musu-rs\src\bridge\handlers\relay_payload.rs"
$relayPayloadText = Get-RepoText $relayPayloadPath
Add-RegexCheck -Scope "relay-payload-poller" -Name "poller default low duty interval" -Text $relayPayloadText -Pattern 'RELAY_PAYLOAD_POLLER_DEFAULT_INTERVAL_SEC:\s*u64\s*=\s*60' -Path $relayPayloadPath -Message "Relay payload poller defaults to a 60s cadence."
Add-RegexCheck -Scope "relay-payload-poller" -Name "poller minimum interval" -Text $relayPayloadText -Pattern 'RELAY_PAYLOAD_POLLER_MIN_INTERVAL_SEC:\s*u64\s*=\s*30' -Path $relayPayloadPath -Message "Relay payload poller interval clamps to at least 30s."
Add-RegexCheck -Scope "relay-payload-poller" -Name "poller empty backoff cap" -Text $relayPayloadText -Pattern 'RELAY_PAYLOAD_POLLER_DEFAULT_EMPTY_BACKOFF_MAX_SEC:\s*u64\s*=\s*300' -Path $relayPayloadPath -Message "Relay payload poller empty/failure backoff defaults to a 300s cap."
Add-RegexCheck -Scope "relay-payload-poller" -Name "poller hard backoff ceiling" -Text $relayPayloadText -Pattern 'RELAY_PAYLOAD_POLLER_EMPTY_BACKOFF_MAX_CEILING_SEC:\s*u64\s*=\s*3_600' -Path $relayPayloadPath -Message "Relay payload poller backoff has a hard ceiling."
Add-RegexCheck -Scope "relay-payload-poller" -Name "poller bounded drain limit" -Text $relayPayloadText -Pattern 'normalize_relay_payload_poller_limit[\s\S]*drain_limit' -Path $relayPayloadPath -Message "Relay payload poller shares the manual drain limit clamp."
Add-RegexCheck -Scope "relay-payload-poller" -Name "poller cancellation-aware sleep" -Text $relayPayloadText -Pattern 'tokio::select!\s*\{[\s\S]*cancellation_token\.cancelled\(\)[\s\S]*tokio::time::sleep\(sleep_for\)' -Path $relayPayloadPath -Message "Relay payload poller sleeps under a cancellation-aware select."
Add-RegexCheck -Scope "relay-payload-poller" -Name "poller calls shared drain primitive" -Text $relayPayloadText -Pattern 'drain_relay_payloads_for_local_target' -Path $relayPayloadPath -Message "Relay payload poller reuses the request-driven drain primitive instead of duplicating transport logic."

$mdnsPath = "musu-rs\src\peer\mdns.rs"
$mdnsText = Get-RepoText $mdnsPath
Add-RegexCheck -Scope "mdns" -Name "IPv6 separate opt-in" -Text $mdnsText -Pattern 'MUSU_MDNS_ENABLE_IPV6' -Path $mdnsPath -Message "mDNS IPv6 has its own opt-in gate."
Add-RegexCheck -Scope "mdns" -Name "Tailscale separate opt-in" -Text $mdnsText -Pattern 'MUSU_MDNS_ENABLE_TAILSCALE' -Path $mdnsPath -Message "mDNS Tailscale interfaces have their own opt-in gate."
Add-RegexCheck -Scope "mdns" -Name "virtual interfaces separate opt-in" -Text $mdnsText -Pattern 'MUSU_MDNS_ENABLE_VIRTUAL_INTERFACES' -Path $mdnsPath -Message "mDNS virtual/VPN interfaces have their own opt-in gate."
Add-RegexCheck -Scope "mdns" -Name "browse bounded by deadline" -Text $mdnsText -Pattern 'deadline\s*=\s*tokio::time::Instant::now\(\)\s*\+\s*duration' -Path $mdnsPath -Message "mDNS browse loop is bounded by a caller-supplied duration."
Add-RegexCheck -Scope "mdns" -Name "recv timeout bounded" -Text $mdnsText -Pattern 'recv_timeout\(Duration::from_secs\(1\)\)' -Path $mdnsPath -Message "mDNS blocking receive uses a 1s timeout."
Add-RegexCheck -Scope "mdns" -Name "disconnect breaks browse" -Text $mdnsText -Pattern 'MdnsRecvTimeoutKind::Disconnected[\s\S]*break;' -Path $mdnsPath -Message "mDNS browse exits early when the receiver disconnects."

$syncPath = "musu-rs\src\install\sync.rs"
$syncText = Get-RepoText $syncPath
Add-RegexCheck -Scope "file-sync" -Name "bounded event queue" -Text $syncText -Pattern 'SYNC_EVENT_QUEUE_CAPACITY:\s*usize\s*=\s*1024' -Path $syncPath -Message "File sync watcher queue is bounded."
Add-RegexCheck -Scope "file-sync" -Name "bounded batch size" -Text $syncText -Pattern 'SYNC_BATCH_MAX_EVENTS:\s*usize\s*=\s*256' -Path $syncPath -Message "File sync batches are capped."
Add-RegexCheck -Scope "file-sync" -Name "bounded debounce window" -Text $syncText -Pattern 'SYNC_BATCH_MAX_WINDOW:\s*Duration\s*=\s*Duration::from_secs\(2\)' -Path $syncPath -Message "File sync batching has a bounded max window."
Add-RegexCheck -Scope "file-sync" -Name "try_send drops overflow" -Text $syncText -Pattern 'tx_clone\.try_send' -Path $syncPath -Message "File sync watcher does not block indefinitely on queue overflow."
Add-RegexCheck -Scope "file-sync" -Name "recv await blocks when idle" -Text $syncText -Pattern 'rx\.recv\(\)\.await' -Path $syncPath -Message "File sync loop waits on receiver when idle."
Add-RegexCheck -Scope "file-sync" -Name "batch cap cooldown" -Text $syncText -Pattern 'SYNC_BATCH_COOLDOWN' -Path $syncPath -Message "File sync loop yields after batch-cap churn."
Add-RegexCheck -Scope "file-sync" -Name "batch debounce receive timeout" -Text $syncText -Pattern 'tokio::time::timeout\(remaining_window,\s*rx\.recv\(\)\)' -Path $syncPath -Message "File sync batching waits for additional events with a bounded timeout."
Add-RegexCheck -Scope "file-sync" -Name "batch cap cooldown sleep" -Text $syncText -Pattern 'tokio::time::sleep\(SYNC_BATCH_COOLDOWN\)\.await' -Path $syncPath -Message "File sync loop sleeps after batch-cap churn."
Add-RegexCheck -Scope "file-sync" -Name "peer write timeout" -Text $syncText -Pattern '\.timeout\(Duration::from_secs\(30\)\)' -Path $syncPath -Message "File sync peer write requests are timeout-bound."

$indexerWatchPath = "musu-rs\src\indexer\watch.rs"
$indexerWatchText = Get-RepoText $indexerWatchPath
Add-RegexCheck -Scope "indexer-watch" -Name "watch loop event driven" -Text $indexerWatchText -Pattern 'notify\.notified\(\)\.await' -Path $indexerWatchPath -Message "Indexer watch loop blocks on notify when idle."
Add-RegexCheck -Scope "indexer-watch" -Name "watch debounce sleep" -Text $indexerWatchText -Pattern 'tokio::time::sleep\(Duration::from_secs\(2\)\)\.await' -Path $indexerWatchPath -Message "Indexer watch loop debounces file events with a 2s sleep."
Add-RegexCheck -Scope "indexer-watch" -Name "watch dirty flag" -Text $indexerWatchText -Pattern 'dirty_clone[\s\S]*notify_clone\.notify_one\(\)' -Path $indexerWatchPath -Message "Indexer watch loop only re-syncs after a dirty file event."
Add-RegexCheck -Scope "indexer-watch" -Name "watch db sidecar filter" -Text $indexerWatchText -Pattern '\.db-wal[\s\S]*\.db-shm' -Path $indexerWatchPath -Message "Indexer watch loop filters sqlite sidecar writes to avoid feedback loops."
Add-RegexCheck -Scope "indexer-watch" -Name "watch sync primitive" -Text $indexerWatchText -Pattern 'sync_workspace_async\(work_dir\.clone\(\),\s*name\.clone\(\)\)' -Path $indexerWatchPath -Message "Indexer watch loop uses the shared sync primitive after debounce."

$autoUpdatePath = "musu-rs\src\install\auto_update.rs"
$autoUpdateText = Get-RepoText $autoUpdatePath
Add-RegexCheck -Scope "auto-update" -Name "config minimum interval" -Text $autoUpdateText -Pattern 'check_interval_minutes\s*<\s*5' -Path $autoUpdatePath -Message "Auto-update supervise interval refuses values below 5 minutes."
Add-RegexCheck -Scope "auto-update" -Name "first tick skipped" -Text $autoUpdateText -Pattern 'ticker\.tick\(\)\.await;[\s\S]*loop\s*\{[\s\S]*ticker\.tick\(\)\.await;' -Path $autoUpdatePath -Message "Auto-update supervise loop skips immediate boot-time update and then waits on interval ticks."
Add-RegexCheck -Scope "auto-update" -Name "health poll initial backoff" -Text $autoUpdateText -Pattern 'HEALTH_POLL_INITIAL_MS:\s*u64\s*=\s*250' -Path $autoUpdatePath -Message "Auto-update health poll starts with a bounded delay."
Add-RegexCheck -Scope "auto-update" -Name "health poll max backoff" -Text $autoUpdateText -Pattern 'HEALTH_POLL_MAX_MS:\s*u64\s*=\s*2_000' -Path $autoUpdatePath -Message "Auto-update health poll delay is capped."
Add-RegexCheck -Scope "auto-update" -Name "health poll sleep" -Text $autoUpdateText -Pattern 'let delay = health_poll_delay\(attempt\)\.min\(remaining\);[\s\S]*tokio::time::sleep\(delay\)\.await' -Path $autoUpdatePath -Message "Auto-update health polling sleeps between attempts."

$cliPath = "musu-rs\src\install\cli_commands.rs"
$cliText = Get-RepoText $cliPath
Add-RegexCheck -Scope "cli-bridge-health" -Name "bridge health poll initial backoff" -Text $cliText -Pattern 'BRIDGE_HEALTH_POLL_INITIAL_MS:\s*u64\s*=\s*250' -Path $cliPath -Message "CLI bridge readiness starts with a bounded health-poll delay."
Add-RegexCheck -Scope "cli-bridge-health" -Name "bridge health poll max backoff" -Text $cliText -Pattern 'BRIDGE_HEALTH_POLL_MAX_MS:\s*u64\s*=\s*2_000' -Path $cliPath -Message "CLI bridge readiness health-poll delay is capped."
Add-RegexCheck -Scope "cli-bridge-health" -Name "bridge readiness deadline" -Text $cliText -Pattern 'async fn wait_for_bridge[\s\S]*deadline\s*=\s*std::time::Instant::now\(\)\s*\+\s*timeout' -Path $cliPath -Message "CLI bridge readiness wait is bounded by the caller timeout."
Add-RegexCheck -Scope "cli-bridge-health" -Name "bridge readiness backoff sleep" -Text $cliText -Pattern 'async fn wait_for_bridge[\s\S]*bridge_health_poll_delay\(attempt\)\.min\(deadline\.saturating_duration_since\(now\)\)[\s\S]*tokio::time::sleep\(delay\)\.await' -Path $cliPath -Message "CLI bridge readiness sleeps with bounded backoff between health checks."
Add-RegexCheck -Scope "cli-route-wait" -Name "route wait default timeout" -Text $cliText -Pattern 'ROUTE_WAIT_DEFAULT_TIMEOUT_SECS:\s*u64\s*=\s*300' -Path $cliPath -Message "CLI route --wait has a default timeout."
Add-RegexCheck -Scope "cli-route-wait" -Name "route wait maximum timeout" -Text $cliText -Pattern 'ROUTE_WAIT_MAX_TIMEOUT_SECS:\s*u64\s*=\s*3_600' -Path $cliPath -Message "CLI route --wait timeout has a hard ceiling."
Add-RegexCheck -Scope "cli-route-wait" -Name "route wait option" -Text $cliText -Pattern 'wait_timeout_sec:\s*u64' -Path $cliPath -Message "CLI route exposes an explicit --wait-timeout-sec option."
Add-RegexCheck -Scope "cli-route-wait" -Name "route wait deadline" -Text $cliText -Pattern 'wait_deadline\s*=\s*std::time::Instant::now\(\)\s*\+\s*wait_timeout' -Path $cliPath -Message "CLI route --wait computes a bounded wait deadline."
Add-RegexCheck -Scope "cli-route-wait" -Name "route wait request timeout" -Text $cliText -Pattern 'ROUTE_WAIT_STATUS_REQUEST_TIMEOUT_SECS[\s\S]*\.timeout\(request_timeout\)' -Path $cliPath -Message "CLI route --wait status requests are timeout-bound."
Add-RegexCheck -Scope "cli-route-wait" -Name "route wait sleep" -Text $cliText -Pattern 'let sleep_for\s*=\s*std::time::Duration::from_secs\(ROUTE_WAIT_POLL_INTERVAL_SECS\)[\s\S]*tokio::time::sleep\(sleep_for\)\.await' -Path $cliPath -Message "CLI route --wait sleeps between status polls."
Add-RegexCheck -Scope "cli-route-wait" -Name "route wait timeout evidence class" -Text $cliText -Pattern 'remote_task_wait_timeout' -Path $cliPath -Message "CLI route --wait records timeout as a failed wait class instead of spinning forever."
Add-RegexCheck -Scope "cli-login" -Name "login device flow expiry" -Text $cliText -Pattern 'flow\.expires_in[\s\S]*Duration::from_secs\(flow\.expires_in as u64\)' -Path $cliPath -Message "CLI login device-code polling uses the server-provided expiry as a deadline."
Add-RegexCheck -Scope "cli-login" -Name "login timeout break" -Text $cliText -Pattern 'start\.elapsed\(\)\s*>\s*timeout[\s\S]*Login timed out' -Path $cliPath -Message "CLI login exits when the device-code flow expires."
Add-RegexCheck -Scope "cli-login" -Name "login polling sleep" -Text $cliText -Pattern 'tokio::time::sleep\(std::time::Duration::from_secs\(5\)\)\.await' -Path $cliPath -Message "CLI login sleeps 5s between device-token polls."
Add-RegexCheck -Scope "cli-login" -Name "login poll primitive" -Text $cliText -Pattern 'poll_device_token\(&flow\.device_code\)' -Path $cliPath -Message "CLI login polling is limited to the explicit device-code login command."

$controlHttpPath = "musu-rs\src\control\http_server.rs"
$controlHttpText = Get-RepoText $controlHttpPath
Add-RegexCheck -Scope "control-sse" -Name "control SSE heartbeat interval" -Text $controlHttpText -Pattern 'IntervalStream::new\(\s*tokio::time::interval\(\s*std::time::Duration::from_secs\(30\)\s*,?\s*\)\s*\)' -Path $controlHttpPath -Message "Control-plane SSE heartbeat uses a bounded 30s interval."
Add-RegexCheck -Scope "control-sse" -Name "control SSE heartbeat event" -Text $controlHttpText -Pattern '\.event\("heartbeat"\)' -Path $controlHttpPath -Message "Control-plane SSE stream emits heartbeat events instead of spinning on an empty stream."
Add-RegexCheck -Scope "control-sse" -Name "control SSE interval stream mapping" -Text $controlHttpText -Pattern 'IntervalStream::new[\s\S]*\.map\(\|_\|\s*\{[\s\S]*Event::default\(\)[\s\S]*\.event\("heartbeat"\)' -Path $controlHttpPath -Message "Control-plane SSE maps interval ticks to heartbeat events."

$workflowExecutorPath = "musu-rs\src\workflow\executor.rs"
$workflowExecutorText = Get-RepoText $workflowExecutorPath
Add-RegexCheck -Scope "workflow-executor" -Name "task completion poll sleep" -Text $workflowExecutorText -Pattern 'tokio::time::sleep\(std::time::Duration::from_secs\(2\)\)\.await' -Path $workflowExecutorPath -Message "Workflow executor task-completion polling sleeps between DB checks."
Add-RegexCheck -Scope "workflow-executor" -Name "task completion max wait" -Text $workflowExecutorText -Pattern 'max_wait\s*=\s*std::time::Duration::from_secs\(3600\)' -Path $workflowExecutorPath -Message "Workflow executor task-completion polling has a 1h cap."
Add-RegexCheck -Scope "workflow-executor" -Name "task completion deadline break" -Text $workflowExecutorText -Pattern 'start\.elapsed\(\)\s*>\s*max_wait[\s\S]*break\s+"failed"\.to_string\(\)' -Path $workflowExecutorPath -Message "Workflow executor exits the poll loop when the max wait is reached."
Add-RegexCheck -Scope "workflow-executor" -Name "task completion terminal states" -Text $workflowExecutorText -Pattern '"done"\s*\|\s*"failed"\s*\|\s*"cancelled"\s*=>\s*break\s*s' -Path $workflowExecutorPath -Message "Workflow executor exits the poll loop on terminal task states."

$hardwarePath = "musu-rs\src\peer\hardware.rs"
$hardwareText = Get-RepoText $hardwarePath
Add-RegexCheck -Scope "hardware-probe" -Name "probe wait step" -Text $hardwareText -Pattern 'HARDWARE_PROBE_WAIT_STEP:\s*Duration\s*=\s*Duration::from_millis\(50\)' -Path $hardwarePath -Message "Hardware child probes sleep between try_wait checks."
Add-RegexCheck -Scope "hardware-probe" -Name "probe nonblocking wait" -Text $hardwareText -Pattern 'child\.try_wait\(\)' -Path $hardwarePath -Message "Hardware child probe loop uses nonblocking try_wait."
Add-RegexCheck -Scope "hardware-probe" -Name "probe timeout kill" -Text $hardwareText -Pattern 'started\.elapsed\(\)\s*>=\s*timeout[\s\S]*child\.kill\(\)' -Path $hardwarePath -Message "Hardware child probe loop kills commands that exceed their timeout."
Add-RegexCheck -Scope "hardware-probe" -Name "probe sleep" -Text $hardwareText -Pattern 'std::thread::sleep\(HARDWARE_PROBE_WAIT_STEP\)' -Path $hardwarePath -Message "Hardware child probe loop sleeps when the child is still running."

$ptyPath = "musu-rs\src\bridge\handlers\pty.rs"
$ptyText = Get-RepoText $ptyPath
Add-RegexCheck -Scope "pty" -Name "pty reader blocks on read" -Text $ptyText -Pattern 'std::thread::spawn[\s\S]*r\.read\(&mut buf\)' -Path $ptyPath -Message "PTY reader loop is a request-scoped blocking read loop."
Add-RegexCheck -Scope "pty" -Name "pty reader exits on send failure" -Text $ptyText -Pattern 'tx\.blocking_send\(buf\[\.\.n\]\.to_vec\(\)\)\.is_err\(\)[\s\S]*break' -Path $ptyPath -Message "PTY reader loop exits when the websocket channel closes."
Add-RegexCheck -Scope "pty" -Name "pty websocket select" -Text $ptyText -Pattern 'tokio::select!\s*\{[\s\S]*rx\.recv\(\)[\s\S]*socket\.recv\(\)' -Path $ptyPath -Message "PTY websocket loop waits on PTY output or websocket input."
Add-RegexCheck -Scope "pty" -Name "pty websocket close break" -Text $ptyText -Pattern 'Message::Close\(_\)[\s\S]*None\s*=>\s*break' -Path $ptyPath -Message "PTY websocket loop exits on close or disconnected socket."

$webrtcPath = "musu-rs\src\io\webrtc.rs"
$webrtcText = Get-RepoText $webrtcPath
Add-RegexCheck -Scope "webrtc-screen-share" -Name "screen share ffmpeg request path" -Text $webrtcText -Pattern 'Command::new\("ffmpeg"\)' -Path $webrtcPath -Message "WebRTC screen-share loop is tied to an explicit ffmpeg capture request."
Add-RegexCheck -Scope "webrtc-screen-share" -Name "screen share stdout read awaits" -Text $webrtcText -Pattern 'stdout\.read\(&mut buf\)\.await' -Path $webrtcPath -Message "WebRTC screen-share loop awaits ffmpeg stdout reads."
Add-RegexCheck -Scope "webrtc-screen-share" -Name "screen share kills child on failure" -Text $webrtcText -Pattern 'track_clone[\s\S]*write_sample[\s\S]*child\.kill\(\)\.await' -Path $webrtcPath -Message "WebRTC screen-share loop kills ffmpeg if sample writes fail."
Add-RegexCheck -Scope "webrtc-screen-share" -Name "screen share kills child on exit" -Text $webrtcText -Pattern 'let _ = child\.kill\(\)\.await;[\s\S]*FFmpeg screen capture loop exited' -Path $webrtcPath -Message "WebRTC screen-share loop kills ffmpeg when the capture loop exits."

$bridgeServicesPath = "musu-rs\src\bridge\services.rs"
$bridgeServicesText = Get-RepoText $bridgeServicesPath
Add-RegexCheck -Scope "process-enumeration" -Name "windows snapshot enumeration" -Text $bridgeServicesText -Pattern 'CreateToolhelp32Snapshot\(TH32CS_SNAPPROCESS,\s*0\)' -Path $bridgeServicesPath -Message "Windows process enumeration is a finite snapshot walk."
Add-RegexCheck -Scope "process-enumeration" -Name "windows snapshot break" -Text $bridgeServicesText -Pattern 'Process32NextW\(snapshot,\s*&mut entry\)\s*==\s*0[\s\S]*break' -Path $bridgeServicesPath -Message "Windows process enumeration exits when the snapshot is exhausted."
Add-RegexCheck -Scope "process-enumeration" -Name "windows snapshot close" -Text $bridgeServicesText -Pattern 'CloseHandle\(snapshot\)' -Path $bridgeServicesPath -Message "Windows process enumeration closes the snapshot handle."

$writerRunnerPath = "musu-rs\src\writer\runner.rs"
$writerRunnerText = Get-RepoText $writerRunnerPath
Add-RegexCheck -Scope "task-runner" -Name "admission safety recheck interval" -Text $writerRunnerText -Pattern 'ADMISSION_RECHECK_INTERVAL:\s*Duration\s*=\s*Duration::from_secs\(1\)' -Path $writerRunnerPath -Message "Task admission loop has a slow safety recheck interval."
Add-RegexCheck -Scope "task-runner" -Name "admission notify or sleep or cancel" -Text $writerRunnerText -Pattern 'tokio::select!\s*\{[\s\S]*notified[\s\S]*tokio::time::sleep\(ADMISSION_RECHECK_INTERVAL\)[\s\S]*cancel\.notified\(\)' -Path $writerRunnerPath -Message "Task admission loop waits on notify, bounded sleep, or cancel."
Add-RegexCheck -Scope "task-runner" -Name "stream no-deadline per-iter timeout" -Text $writerRunnerText -Pattern 'remaining\.unwrap_or\(Duration::from_millis\(500\)\)' -Path $writerRunnerPath -Message "Task stdout stream loop bounds no-deadline reads to 500ms per iteration."
Add-RegexCheck -Scope "task-runner" -Name "stream cancel and timeout select" -Text $writerRunnerText -Pattern 'tokio::select!\s*\{[\s\S]*cancel\.notified\(\)[\s\S]*tokio::time::timeout\(per_iter,\s*read_fut\)' -Path $writerRunnerPath -Message "Task stdout stream loop selects between cancel and bounded read."
Add-RegexCheck -Scope "task-runner" -Name "stream deadline timeout" -Text $writerRunnerText -Pattern 'if now >= d[\s\S]*StreamOutcome::Timeout' -Path $writerRunnerPath -Message "Task stdout stream loop exits when its deadline is reached."

$rustSourceRoot = Join-Path $repoRoot "musu-rs\src"
$rawBusyLoopHits = New-Object System.Collections.Generic.List[object]
if (-not (Test-Path -LiteralPath $rustSourceRoot)) {
    Add-Check -Scope "source" -Name "rust source root exists" -Passed $false -Path "musu-rs\src" -Message "Rust source root is missing."
}
else {
    $allowlistedLoopFiles = @(
        "musu-rs\src\adapter\claude.rs",
        "musu-rs\src\brain\planner.rs",
        "musu-rs\src\bridge\mod.rs",
        "musu-rs\src\bridge\handlers\relay_payload.rs",
        "musu-rs\src\bridge\handlers\pty.rs",
        "musu-rs\src\bridge\services.rs",
        "musu-rs\src\control\http_server.rs",
        "musu-rs\src\indexer\watch.rs",
        "musu-rs\src\install\auto_update.rs",
        "musu-rs\src\install\cli_commands.rs",
        "musu-rs\src\install\sync.rs",
        "musu-rs\src\io\clipboard.rs",
        "musu-rs\src\io\webrtc.rs",
        "musu-rs\src\peer\hardware.rs",
        "musu-rs\src\peer\mdns.rs",
        "musu-rs\src\workflow\executor.rs",
        "musu-rs\src\writer\runner.rs"
    )

    $rustFiles = Get-ChildItem -LiteralPath $rustSourceRoot -Recurse -File -Filter "*.rs"
    foreach ($file in $rustFiles) {
        $relative = $file.FullName
        if ($relative.StartsWith($repoRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
            $relative = $relative.Substring($repoRoot.Length).TrimStart("\", "/")
        }
        $relative = $relative.Replace("/", "\")
        $text = Get-Content -LiteralPath $file.FullName -Raw
        if ([regex]::IsMatch($text, 'while\s+true|loop\s*\{') -and ($relative -notin $allowlistedLoopFiles)) {
            $rawBusyLoopHits.Add([pscustomobject]@{ path = $relative }) | Out-Null
        }
    }

    Add-Check `
        -Scope "source" `
        -Name "new rust loops must be audited" `
        -Passed ($rawBusyLoopHits.Count -eq 0) `
        -Path "musu-rs\src" `
        -Message ($(if ($rawBusyLoopHits.Count -eq 0) { "No unaudited Rust loop constructs found outside the allowlist." } else { "Unaudited Rust loop constructs found: $(@($rawBusyLoopHits | ForEach-Object { $_.path }) -join ', ')." }))
}

$failCount = @($checks | Where-Object { $_.status -eq "fail" }).Count
$result = [pscustomobject]@{
    schema = "musu.rust_background_loop_contract.v1"
    ok = ($failCount -eq 0)
    generated_at = [datetimeoffset]::Now.ToString("o")
    fail_count = $failCount
    unaudited_loop_hit_count = $rawBusyLoopHits.Count
    unaudited_loop_hits = $rawBusyLoopHits.ToArray()
    checks = $checks.ToArray()
}

if ($Json) {
    $result | ConvertTo-Json -Depth 8
}
else {
    "MUSU Rust background loop contract audit"
    "ok: $($result.ok)"
    "fail_count: $($result.fail_count)"
    "unaudited_loop_hit_count: $($result.unaudited_loop_hit_count)"
    ""
    $checks | Format-Table scope, name, status, path, message -Wrap
}

if ($FailOnProblem -and -not $result.ok) {
    exit 1
}
