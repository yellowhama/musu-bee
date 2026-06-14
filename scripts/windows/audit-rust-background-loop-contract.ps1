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
Add-RegexCheck -Scope "planner" -Name "planner cancellation token" -Text $bridgeText -Pattern 'let planner_cancel = CancellationToken::new\(\)' -Path $bridgePath -Message "Planner loop owns an explicit cancellation token."
Add-RegexCheck -Scope "planner" -Name "planner ctrl-c cancellation" -Text $bridgeText -Pattern 'planner_ctrl_c\.cancel\(\)' -Path $bridgePath -Message "Planner loop cancellation token is cancelled on Ctrl-C."
Add-RegexCheck -Scope "clipboard" -Name "clipboard opt-in env gate" -Text $bridgeText -Pattern 'MUSU_ENABLE_CLIPBOARD_SYNC' -Path $bridgePath -Message "Clipboard polling only starts behind MUSU_ENABLE_CLIPBOARD_SYNC."
Add-RegexCheck -Scope "relay-payload-poller" -Name "relay payload poller opt-in env gate" -Text $bridgeText -Pattern 'MUSU_ENABLE_RELAY_PAYLOAD_POLLER|start_relay_payload_poller_if_enabled' -Path $bridgePath -Message "Relay payload polling only starts behind MUSU_ENABLE_RELAY_PAYLOAD_POLLER."
Add-RegexCheck -Scope "mdns" -Name "mDNS opt-in env gate" -Text $bridgeText -Pattern 'MUSU_ENABLE_MDNS' -Path $bridgePath -Message "mDNS discovery only starts behind MUSU_ENABLE_MDNS."
Add-RegexCheck -Scope "mdns" -Name "mDNS auto-register cancellation token" -Text $bridgeText -Pattern 'auto_register_peers_with_cancellation\([\s\S]*cloud_registration_cancel\.clone\(\)' -Path $bridgePath -Message "Bridge mDNS auto-registration receives the cloud loop cancellation token."
Add-RegexCheck -Scope "cloud-heartbeat" -Name "heartbeat interval env" -Text $bridgeText -Pattern 'MUSU_CLOUD_HEARTBEAT_INTERVAL_SEC' -Path $bridgePath -Message "Cloud registration heartbeat interval is explicit."
Add-RegexCheck -Scope "cloud-heartbeat" -Name "heartbeat default" -Text $bridgeText -Pattern 'CLOUD_HEARTBEAT_DEFAULT_INTERVAL_SEC:\s*u64\s*=\s*300|unwrap_or\(300\)' -Path $bridgePath -Message "Cloud registration heartbeat defaults to 300s."
Add-RegexCheck -Scope "cloud-heartbeat" -Name "heartbeat minimum floor" -Text $bridgeText -Pattern 'CLOUD_HEARTBEAT_MIN_INTERVAL_SEC:\s*u64\s*=\s*60|\.max\(60\)' -Path $bridgePath -Message "Cloud registration heartbeat clamps to at least 60s."
Add-RegexCheck -Scope "cloud-heartbeat" -Name "failure backoff exponent" -Text $bridgeText -Pattern 'consecutive_failures' -Path $bridgePath -Message "Cloud registration loop tracks consecutive failures."
Add-RegexCheck -Scope "cloud-heartbeat" -Name "failure backoff sleep" -Text $bridgeText -Pattern 'cloud_registration_sleep_duration[\s\S]*tokio::time::sleep\(sleep_for\)' -Path $bridgePath -Message "Cloud registration loop sleeps with failure backoff."
Add-RegexCheck -Scope "cloud-heartbeat" -Name "cancellation token" -Text $bridgeText -Pattern 'CancellationToken::new\(\)[\s\S]*cloud_registration_ctrl_c\.cancel\(\)' -Path $bridgePath -Message "Cloud registration loop owns an explicit cancellation token."
Add-RegexCheck -Scope "cloud-heartbeat" -Name "cancellation-aware sleep" -Text $bridgeText -Pattern 'tokio::select!\s*\{[\s\S]*cloud_registration_cancel\.cancelled\(\)[\s\S]*tokio::time::sleep\(sleep_for\)' -Path $bridgePath -Message "Cloud registration loop sleep exits on cancellation."
Add-RegexCheck -Scope "planner" -Name "planner ctrl-c watcher spawn" -Text $bridgeText -Pattern 'tokio::spawn\(async move \{[\s\S]*planner_ctrl_c\.cancel\(\)' -Path $bridgePath -Message "Planner Ctrl-C watcher is spawned only with the planner's cancellation token."
Add-RegexCheck -Scope "planner" -Name "planner loop spawn" -Text $bridgeText -Pattern 'tokio::spawn\(async move \{[\s\S]*run_planner_loop\(runner_clone,\s*planner_cancel\)\.await' -Path $bridgePath -Message "Planner background task starts only from the explicit MUSU_ENABLE_PLANNER gate."
Add-RegexCheck -Scope "cloud-heartbeat" -Name "heartbeat ctrl-c watcher spawn" -Text $bridgeText -Pattern 'tokio::spawn\(async move \{[\s\S]*cloud_registration_ctrl_c\.cancel\(\)' -Path $bridgePath -Message "Cloud heartbeat Ctrl-C watcher is paired with the cloud registration cancellation token."
Add-RegexCheck -Scope "cloud-heartbeat" -Name "heartbeat loop spawn" -Text $bridgeText -Pattern 'tokio::spawn\(async move \{[\s\S]*starting low-duty musu\.pro cloud registration loop[\s\S]*loop\s*\{' -Path $bridgePath -Message "Cloud heartbeat background loop is the low-duty registration loop covered by heartbeat checks."
Add-RegexCheck -Scope "file-sync" -Name "sync loop spawn configured roots only" -Text $bridgeText -Pattern 'if !cfg\.file_serve_roots\.is_empty\(\)[\s\S]*tokio::spawn\(crate::install::sync::run_sync_loop' -Path $bridgePath -Message "File sync loop is spawned only when file serve roots are configured."

$controlPath = "musu-rs\src\control\mod.rs"
$controlText = Get-RepoText $controlPath
Add-RegexCheck -Scope "control-mcp" -Name "ctrl-c watcher spawn cancels service token" -Text $controlText -Pattern 'tokio::spawn\(async move \{[\s\S]*tokio::signal::ctrl_c\(\)\.await\.is_ok\(\)[\s\S]*ct\.cancel\(\)' -Path $controlPath -Message "Control MCP Ctrl-C watcher only cancels the rmcp service token."
Add-RegexCheck -Scope "control-mcp" -Name "serve with cancellation token" -Text $controlText -Pattern '\.serve_with_ct\(transport,\s*ct\.clone\(\)\)' -Path $controlPath -Message "Control MCP server is served with the same cancellation token."
Add-RegexCheck -Scope "control-mcp" -Name "waits on transport close" -Text $controlText -Pattern 'service\.waiting\(\)\.await' -Path $controlPath -Message "Control MCP command exits when the rmcp transport closes."

$cloudPath = "musu-rs\src\cloud\mod.rs"
$cloudText = Get-RepoText $cloudPath
Add-RegexCheck -Scope "cloud-client" -Name "default cloud client timeout" -Text $cloudText -Pattern 'Client::builder\(\)[\s\S]*\.timeout\(std::time::Duration::from_secs\(10\)\)' -Path $cloudPath -Message "Fire-and-forget cloud submissions use the default 10s cloud client timeout unless wrapped tighter."

$plannerPath = "musu-rs\src\brain\planner.rs"
$plannerText = Get-RepoText $plannerPath
Add-RegexCheck -Scope "planner" -Name "planner default low duty interval" -Text $plannerText -Pattern 'PLANNER_DEFAULT_INTERVAL_SEC:\s*u64\s*=\s*300' -Path $plannerPath -Message "Planner defaults to a 300s cadence."
Add-RegexCheck -Scope "planner" -Name "planner minimum interval" -Text $plannerText -Pattern 'PLANNER_MIN_INTERVAL_SEC:\s*u64\s*=\s*60' -Path $plannerPath -Message "Planner interval clamps to at least 60s."
Add-RegexCheck -Scope "planner" -Name "planner command timeout cap" -Text $plannerText -Pattern 'PLANNER_MAX_COMMAND_TIMEOUT_SEC:\s*u64\s*=\s*120' -Path $plannerPath -Message "Planner command timeout is capped."
Add-RegexCheck -Scope "planner" -Name "planner cancellation-aware sleep" -Text $plannerText -Pattern 'tokio::select!\s*\{[\s\S]*cancellation_token\.cancelled\(\)[\s\S]*sleep\(Duration::from_secs\(interval\)\)' -Path $plannerPath -Message "Planner loop sleeps every cycle under a cancellation-aware select."
Add-RegexCheck -Scope "planner" -Name "planner exits after cancellation" -Text $plannerText -Pattern 'cancellation_token\.is_cancelled\(\)[\s\S]*break' -Path $plannerPath -Message "Planner loop exits promptly after cancellation."
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

$cliCommonPath = "musu-rs\src\adapter\cli_common.rs"
$cliCommonText = Get-RepoText $cliCommonPath
Add-RegexCheck -Scope "adapter-cli-common" -Name "generic CLI child kill on drop" -Text $cliCommonText -Pattern '\.kill_on_drop\(true\)' -Path $cliCommonPath -Message "Generic CLI adapter child processes are killed if the async command handle is dropped."
Add-RegexCheck -Scope "adapter-cli-common" -Name "stdin writer one-shot spawn" -Text $cliCommonText -Pattern 'tokio::spawn\(async move \{[\s\S]*stdin\.write_all\(p\.as_bytes\(\)\)\.await[\s\S]*stdin\.shutdown\(\)\.await' -Path $cliCommonPath -Message "Generic CLI stdin writer spawn writes once, shuts stdin down, and exits."
Add-RegexCheck -Scope "adapter-cli-common" -Name "stderr drain exits on eof or error" -Text $cliCommonText -Pattern 'tokio::spawn\(async move \{[\s\S]*reader\.read_line\(&mut line\)\.await[\s\S]*Ok\(0\) => break[\s\S]*Err\(_\) => break' -Path $cliCommonPath -Message "Generic CLI stderr drain task waits on pipe reads and exits on EOF or read error."
Add-RegexCheck -Scope "adapter-cli-common" -Name "stream per-iteration timeout" -Text $cliCommonText -Pattern 'PER_ITER_TIMEOUT:\s*Duration\s*=\s*Duration::from_millis\(500\)' -Path $cliCommonPath -Message "Generic CLI stdout stream has a bounded no-deadline read timeout."
Add-RegexCheck -Scope "adapter-cli-common" -Name "stream cancellation-aware read" -Text $cliCommonText -Pattern 'tokio::select!\s*\{[\s\S]*cancel\.notified\(\)[\s\S]*tokio::time::timeout\(per_iter,\s*read_fut\)' -Path $cliCommonPath -Message "Generic CLI stdout stream loop selects between cancellation and bounded reads."
Add-RegexCheck -Scope "adapter-cli-common" -Name "stream hard deadline timeout" -Text $cliCommonText -Pattern 'if now >= d[\s\S]*return CliOutcome::Timeout' -Path $cliCommonPath -Message "Generic CLI stdout stream exits when its monotonic deadline is reached."
Add-RegexCheck -Scope "adapter-cli-common" -Name "stream bounded read without cancel" -Text $cliCommonText -Pattern 'tokio::time::timeout\(per_iter,\s*read_fut\)\.await' -Path $cliCommonPath -Message "Generic CLI stdout stream still bounds reads when no cancel token is supplied."

$clipboardPath = "musu-rs\src\io\clipboard.rs"
$clipboardText = Get-RepoText $clipboardPath
Add-RegexCheck -Scope "clipboard" -Name "clipboard monitor cancellation token" -Text $clipboardText -Pattern 'CancellationToken::new\(\)' -Path $clipboardPath -Message "Clipboard monitor owns an explicit cancellation token."
Add-RegexCheck -Scope "clipboard" -Name "clipboard monitor ctrl-c cancellation" -Text $clipboardText -Pattern 'tokio::spawn\(async move \{[\s\S]*ctrl_c_token\.cancel\(\)' -Path $clipboardPath -Message "Clipboard monitor cancellation token is cancelled on Ctrl-C."
Add-RegexCheck -Scope "clipboard" -Name "clipboard monitor spawn blocking" -Text $clipboardText -Pattern 'tokio::task::spawn_blocking\(move \|\| \{[\s\S]*while !worker_token\.is_cancelled\(\)' -Path $clipboardPath -Message "Clipboard monitor is the known blocking background poller covered by the clipboard opt-in gate and cancellation token."
Add-RegexCheck -Scope "clipboard" -Name "clipboard monitor sleep" -Text $clipboardText -Pattern 'std::thread::sleep\(Duration::from_secs\(2\)\)' -Path $clipboardPath -Message "Clipboard monitor sleeps between polls."
Add-RegexCheck -Scope "clipboard" -Name "clipboard monitor exits after cancellation" -Text $clipboardText -Pattern 'worker_token\.is_cancelled\(\)[\s\S]*break' -Path $clipboardPath -Message "Clipboard monitor exits the blocking loop after cancellation."

$auditPath = "musu-rs\src\bridge\audit.rs"
$auditText = Get-RepoText $auditPath
Add-RegexCheck -Scope "audit-failure-window" -Name "audit failure pruning finite deque loop" -Text $auditText -Pattern 'while let Some\(front\) = q\.front\(\)[\s\S]*q\.pop_front\(\)[\s\S]*break' -Path $auditPath -Message "Audit failure-window pruning only walks and drains a finite VecDeque."
Add-RegexCheck -Scope "audit-failure-window" -Name "audit failure window bounded duration" -Text $auditText -Pattern 'FAILURE_RATE_WINDOW:\s*Duration\s*=\s*Duration::from_secs\(5 \* 60\)' -Path $auditPath -Message "Audit failure-window pruning is bounded by a fixed retention window."

$rateLimitPath = "musu-rs\src\bridge\rate_limit.rs"
$rateLimitText = Get-RepoText $rateLimitPath
Add-RegexCheck -Scope "rate-limit-window" -Name "rate limit pruning finite deque loop" -Text $rateLimitText -Pattern 'while let Some\(front\) = self\.timestamps\.front\(\)[\s\S]*self\.timestamps\.pop_front\(\)[\s\S]*break' -Path $rateLimitPath -Message "Rate-limit window pruning only walks and drains a finite VecDeque."
Add-RegexCheck -Scope "rate-limit-window" -Name "rate limit fixed window" -Text $rateLimitText -Pattern 'WINDOW:\s*Duration\s*=\s*Duration::from_secs\(60\)' -Path $rateLimitPath -Message "Rate-limit pruning is bounded by a fixed 60s window."

$relayPayloadPath = "musu-rs\src\bridge\handlers\relay_payload.rs"
$relayPayloadText = Get-RepoText $relayPayloadPath
Add-RegexCheck -Scope "relay-payload-poller" -Name "poller ctrl-c watcher spawn" -Text $relayPayloadText -Pattern 'tokio::spawn\(async move \{[\s\S]*ctrl_c_token\.cancel\(\)' -Path $relayPayloadPath -Message "Relay payload poller Ctrl-C watcher cancels the poller token."
Add-RegexCheck -Scope "relay-payload-poller" -Name "poller task spawn" -Text $relayPayloadText -Pattern 'tokio::spawn\(run_relay_payload_poller\(state,\s*config,\s*cancellation_token\)\)' -Path $relayPayloadPath -Message "Relay payload poller spawn targets the cancellation-aware low-duty poller."
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
Add-RegexCheck -Scope "mdns" -Name "browse cancellation token" -Text $mdnsText -Pattern 'discover_peers_with_cancellation[\s\S]*Option<CancellationToken>' -Path $mdnsPath -Message "mDNS browse accepts an explicit cancellation token for background callers."
Add-RegexCheck -Scope "mdns" -Name "browse cancellation select" -Text $mdnsText -Pattern 'tokio::select!\s*\{[\s\S]*cancellation_token\.cancelled\(\)[\s\S]*result\s*=\s*receive' -Path $mdnsPath -Message "mDNS browse can exit the receive wait when cancellation fires."
Add-RegexCheck -Scope "mdns" -Name "auto-register cancellation wrapper" -Text $mdnsText -Pattern 'auto_register_peers_with_cancellation[\s\S]*auto_register_peers_with_optional_cancellation\([\s\S]*Some\(cancellation_token\)' -Path $mdnsPath -Message "mDNS auto-registration has a cancellation-aware wrapper for bridge background use."
Add-RegexCheck -Scope "mdns" -Name "browse blocking receive under timeout" -Text $mdnsText -Pattern 'tokio::time::timeout\([\s\S]*tokio::task::spawn_blocking\([\s\S]*recv_timeout\(Duration::from_secs\(1\)\)' -Path $mdnsPath -Message "mDNS blocking receive is wrapped by the browse deadline and its own recv timeout."
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

$indexerModPath = "musu-rs\src\indexer\mod.rs"
$indexerModText = Get-RepoText $indexerModPath
Add-RegexCheck -Scope "indexer-watch" -Name "watch command scoped dispatch" -Text $indexerModText -Pattern 'IndexerAction::Watch\s*\{[\s\S]*watch::run_watch\(work_dir,\s*name\)\.await' -Path $indexerModPath -Message "Indexer watch starts only from the explicit `musu indexer watch` subcommand dispatch."

$mainPath = "musu-rs\src\main.rs"
$mainText = Get-RepoText $mainPath
Add-RegexCheck -Scope "indexer-watch" -Name "indexer command dispatch only" -Text $mainText -Pattern 'Cmd::Indexer\s*\{\s*action\s*\}[\s\S]*indexer::run\(action\)\.await' -Path $mainPath -Message "Indexer actions are reached through the CLI Indexer command dispatcher."
Add-NoRegexCheck -Scope "indexer-watch" -Name "bridge does not start indexer watch" -Text $bridgeText -Pattern 'indexer::watch|run_watch\(' -Path $bridgePath -Message "Default bridge/runtime path does not call the indexer watcher."
Add-RegexCheck -Scope "mdns" -Name "discover command scoped dispatch" -Text $mainText -Pattern 'Cmd::Discover\s*\{\s*timeout\s*\}[\s\S]*peer::mdns::discover_peers' -Path $mainPath -Message "mDNS active discovery is scoped to the explicit `musu discover` command dispatch."

$autoUpdatePath = "musu-rs\src\install\auto_update.rs"
$autoUpdateText = Get-RepoText $autoUpdatePath
Add-RegexCheck -Scope "auto-update" -Name "config minimum interval" -Text $autoUpdateText -Pattern 'check_interval_minutes\s*<\s*(AUTO_UPDATE_MIN_INTERVAL_MINUTES|5)' -Path $autoUpdatePath -Message "Auto-update supervise interval refuses values below 5 minutes."
Add-RegexCheck -Scope "auto-update" -Name "first tick skipped" -Text $autoUpdateText -Pattern 'ticker\.tick\(\)\.await;[\s\S]*loop\s*\{[\s\S]*(ticker\.tick\(\)\.await|tokio::select!\s*\{[\s\S]*ticker\.tick\(\))' -Path $autoUpdatePath -Message "Auto-update supervise loop skips immediate boot-time update and then waits on interval ticks."
Add-RegexCheck -Scope "auto-update" -Name "supervise loop ctrl-c watcher" -Text $autoUpdateText -Pattern 'let cancellation_token = CancellationToken::new\(\)[\s\S]*tokio::spawn\(async move \{[\s\S]*tokio::signal::ctrl_c\(\)\.await\.is_ok\(\)[\s\S]*ctrl_c_token\.cancel\(\)' -Path $autoUpdatePath -Message "Auto-update supervise loop owns a Ctrl-C cancellation token and watcher."
Add-RegexCheck -Scope "auto-update" -Name "supervise loop cancellation-aware tick" -Text $autoUpdateText -Pattern 'tokio::select!\s*\{[\s\S]*cancellation_token\.cancelled\(\)[\s\S]*ticker\.tick\(\)' -Path $autoUpdatePath -Message "Auto-update supervise loop waits on either cancellation or the next interval tick."
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

$deviceLoginPath = "musu-rs\src\install\cli_commands\device_login.rs"
$deviceLoginText = Get-RepoText $deviceLoginPath
Add-RegexCheck -Scope "cli-login" -Name "login device flow expiry" -Text $deviceLoginText -Pattern 'Duration::from_secs\(flow\.response\.expires_in as u64\)' -Path $deviceLoginPath -Message "CLI login device-code polling uses the server-provided expiry as a deadline."
Add-RegexCheck -Scope "cli-login" -Name "login timeout break" -Text $deviceLoginText -Pattern 'start\.elapsed\(\)\s*>\s*timeout[\s\S]*Login timed out' -Path $deviceLoginPath -Message "CLI login exits when the device-code flow expires."
Add-RegexCheck -Scope "cli-login" -Name "login polling interval helper" -Text $cloudText -Pattern 'pub fn poll_interval_secs\(&self\)\s*->\s*u32[\s\S]*unwrap_or\(5\)\.max\(5\)' -Path $cloudPath -Message "Device-code login response normalizes poll cadence with a 5s floor."
Add-RegexCheck -Scope "cli-login" -Name "login polling sleep" -Text $deviceLoginText -Pattern 'tokio::time::sleep\(flow\.response\.poll_interval\(\)\)\.await' -Path $deviceLoginPath -Message "CLI login sleeps at the server-provided device-flow cadence with a 5s floor."
Add-RegexCheck -Scope "cli-login" -Name "login poll primitive" -Text $deviceLoginText -Pattern 'poll_device_token\(&flow\.response\.device_code\)' -Path $deviceLoginPath -Message "CLI login polling is limited to the explicit device-code login command."
Add-RegexCheck -Scope "cli-login" -Name "desktop login background safe" -Text $deviceLoginText -Pattern 'run_desktop_login[\s\S]*poll_and_finalize\(&flow,\s*true\)\.await' -Path $deviceLoginPath -Message "Desktop login reuses the same bounded device-flow finalizer."

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
Add-RegexCheck -Scope "workflow-executor" -Name "topological sort finite queue loop" -Text $workflowExecutorText -Pattern 'while let Some\(id\) = queue\.pop\(\)[\s\S]*queue\.push\(dep\.clone\(\)\)' -Path $workflowExecutorPath -Message "Workflow executor topological sort drains a finite dependency queue."
Add-RegexCheck -Scope "workflow-executor" -Name "topological sort cycle rejection" -Text $workflowExecutorText -Pattern 'order\.len\(\) != steps\.len\(\)[\s\S]*workflow has circular dependencies' -Path $workflowExecutorPath -Message "Workflow executor topological sort rejects cycles instead of looping indefinitely."

$workflowSpecPath = "musu-rs\src\workflow\workflow_spec.rs"
$workflowSpecText = Get-RepoText $workflowSpecPath
Add-RegexCheck -Scope "workflow-spec" -Name "cycle detection finite queue loop" -Text $workflowSpecText -Pattern 'while let Some\(node\) = queue\.pop_front\(\)[\s\S]*visited \+= 1[\s\S]*queue\.push_back\(neighbor\)' -Path $workflowSpecPath -Message "Workflow spec cycle detection drains a finite Kahn queue."
Add-RegexCheck -Scope "workflow-spec" -Name "cycle detection mismatch rejection" -Text $workflowSpecText -Pattern 'visited != self\.agents\.len\(\)[\s\S]*WorkflowSpecError::CycleDetected' -Path $workflowSpecPath -Message "Workflow spec rejects cycles when the finite queue cannot visit all agents."
Add-RegexCheck -Scope "workflow-spec" -Name "topological order finite queue loop" -Text $workflowSpecText -Pattern 'while let Some\(node\) = queue\.pop_front\(\)[\s\S]*order\.push\(node\.to_string\(\)\)[\s\S]*queue\.push_back\(n\)' -Path $workflowSpecPath -Message "Workflow spec topological order drains a finite queue."

$indexerSyncPath = "musu-rs\src\indexer\sync.rs"
$indexerSyncText = Get-RepoText $indexerSyncPath
Add-RegexCheck -Scope "indexer-sync" -Name "scan spawn_blocking awaited" -Text $indexerSyncText -Pattern 'tokio::task::spawn_blocking\(move \|\| scanner::scan\(&work_dir_for_scan,\s*&profile_for_scan\)\)[\s\S]*\.await[\s\S]*scan task panicked' -Path $indexerSyncPath -Message "Indexer scan uses spawn_blocking but awaits the bounded scan result before continuing."
Add-RegexCheck -Scope "indexer-sync" -Name "empty or missing workspace returns" -Text $indexerSyncText -Pattern 'work_dir\.as_os_str\(\)\.is_empty\(\) \|\| !work_dir\.exists\(\)[\s\S]*skipped_reason: Some\("no_work_dir"\.to_string\(\)\)' -Path $indexerSyncPath -Message "Post-create index sync exits early for empty or missing workspaces."

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
Add-RegexCheck -Scope "pty" -Name "pty write spawn_blocking request scoped" -Text $ptyText -Pattern 'tokio::task::spawn_blocking\(move \|\| \{[\s\S]*std::io::Write::write_all' -Path $ptyPath -Message "PTY websocket writes use request-scoped spawn_blocking calls with no polling loop."

$wsProxyPath = "musu-rs\src\bridge\handlers\ws_proxy.rs"
$wsProxyText = Get-RepoText $wsProxyPath
Add-RegexCheck -Scope "ws-proxy" -Name "websocket proxy request upgrade" -Text $wsProxyText -Pattern 'ws\.on_upgrade\(move \|socket\| handle_ws_proxy\(socket,\s*upstream_url\)\)' -Path $wsProxyPath -Message "WebSocket proxy loops are tied to explicit request upgrades."
Add-RegexCheck -Scope "ws-proxy" -Name "client side awaits inbound websocket" -Text $wsProxyText -Pattern 'while let Some\(msg\) = client_rx\.next\(\)\.await' -Path $wsProxyPath -Message "WebSocket proxy client-to-upstream loop waits on inbound client frames instead of polling."
Add-RegexCheck -Scope "ws-proxy" -Name "upstream side awaits inbound websocket" -Text $wsProxyText -Pattern 'while let Some\(msg\) = upstream_rx\.next\(\)\.await' -Path $wsProxyPath -Message "WebSocket proxy upstream-to-client loop waits on inbound upstream frames instead of polling."
Add-RegexCheck -Scope "ws-proxy" -Name "client side exits on upstream send failure" -Text $wsProxyText -Pattern 'upstream_tx\.send\(tung_msg\)\.await\.is_err\(\)[\s\S]*break' -Path $wsProxyPath -Message "WebSocket proxy client side exits when upstream sending fails."
Add-RegexCheck -Scope "ws-proxy" -Name "upstream side exits on client send failure" -Text $wsProxyText -Pattern 'client_tx\.send\(axum_msg\)\.await\.is_err\(\)[\s\S]*break' -Path $wsProxyPath -Message "WebSocket proxy upstream side exits when client sending fails."
Add-RegexCheck -Scope "ws-proxy" -Name "bidirectional proxy closes on either side" -Text $wsProxyText -Pattern 'tokio::select!\s*\{[\s\S]*client_to_upstream[\s\S]*upstream_to_client' -Path $wsProxyPath -Message "WebSocket proxy drops the opposite half when either direction closes."

$filesPath = "musu-rs\src\bridge\handlers\files.rs"
$filesText = Get-RepoText $filesPath
Add-RegexCheck -Scope "files-api" -Name "directory listing awaits next entry" -Text $filesText -Pattern 'while let Some\(entry\) = read_dir[\s\S]*\.next_entry\(\)[\s\S]*\.await' -Path $filesPath -Message "File API directory listing waits on async directory entries instead of polling."
Add-RegexCheck -Scope "files-api" -Name "directory listing request scoped" -Text $filesText -Pattern 'pub async fn list_dir[\s\S]*while let Some\(entry\) = read_dir' -Path $filesPath -Message "File API directory listing loop is scoped to one list_dir request."

$forwardPath = "musu-rs\src\bridge\handlers\forward.rs"
$forwardText = Get-RepoText $forwardPath
Add-RegexCheck -Scope "forward-multipart" -Name "multipart loop awaits next field" -Text $forwardText -Pattern 'while let Some\(field\) = multipart[\s\S]*\.next_field\(\)[\s\S]*\.await' -Path $forwardPath -Message "Forwarded task multipart loop waits on request fields instead of polling."
Add-RegexCheck -Scope "forward-multipart" -Name "multipart loop request scoped" -Text $forwardText -Pattern 'pub async fn receive_forwarded[\s\S]*while let Some\(field\) = multipart' -Path $forwardPath -Message "Forwarded task multipart loop is scoped to one receive request."

$webdavPath = "musu-rs\src\bridge\handlers\webdav.rs"
$webdavText = Get-RepoText $webdavPath
Add-RegexCheck -Scope "webdav-propfind" -Name "propfind loop awaits directory entry" -Text $webdavText -Pattern 'while let Ok\(Some\(entry\)\) = rd\.next_entry\(\)\.await' -Path $webdavPath -Message "WebDAV PROPFIND waits on async directory entries instead of polling."
Add-RegexCheck -Scope "webdav-propfind" -Name "propfind loop request scoped" -Text $webdavText -Pattern 'async fn handle_propfind[\s\S]*while let Ok\(Some\(entry\)\) = rd\.next_entry\(\)\.await' -Path $webdavPath -Message "WebDAV PROPFIND directory loop is scoped to one request."

$webrtcPath = "musu-rs\src\io\webrtc.rs"
$webrtcText = Get-RepoText $webrtcPath
Add-RegexCheck -Scope "webrtc-screen-share" -Name "screen share ffmpeg request path" -Text $webrtcText -Pattern 'Command::new\("ffmpeg"\)' -Path $webrtcPath -Message "WebRTC screen-share loop is tied to an explicit ffmpeg capture request."
Add-RegexCheck -Scope "webrtc-screen-share" -Name "data channel pong one-shot spawn" -Text $webrtcText -Pattern 'tokio::spawn\(async move \{[\s\S]*dc\.send_text\("pong"\)\.await' -Path $webrtcPath -Message "WebRTC data-channel heartbeat spawn sends one pong and returns."
Add-RegexCheck -Scope "webrtc-screen-share" -Name "rtcp reader request-scoped spawn" -Text $webrtcText -Pattern 'tokio::spawn\(async move \{[\s\S]*let mut rtcp_buf[\s\S]*rtp_sender\.read\(&mut rtcp_buf\)' -Path $webrtcPath -Message "WebRTC RTCP reader loop is spawned only inside the explicit screen-share request path."
Add-RegexCheck -Scope "webrtc-screen-share" -Name "rtcp reader awaits inbound packets" -Text $webrtcText -Pattern 'while let Ok\(\(_, _\)\) = rtp_sender\.read\(&mut rtcp_buf\)\.await \{\}' -Path $webrtcPath -Message "WebRTC RTCP reader waits on inbound RTCP reads instead of polling."
Add-RegexCheck -Scope "webrtc-screen-share" -Name "rtcp reader exits on read failure" -Text $webrtcText -Pattern 'while let Ok\(\(_, _\)\) = rtp_sender\.read\(&mut rtcp_buf\)\.await \{\}[\s\S]*RTCP reader loop exited' -Path $webrtcPath -Message "WebRTC RTCP reader exits when the RTCP read stream closes or errors."
Add-RegexCheck -Scope "webrtc-screen-share" -Name "screen share capture task spawn" -Text $webrtcText -Pattern 'tokio::spawn\(async move \{[\s\S]*Starting FFmpeg screen capture' -Path $webrtcPath -Message "WebRTC screen-share capture task is spawned only for the explicit screen-share request."
Add-RegexCheck -Scope "webrtc-screen-share" -Name "screen share stdout read awaits" -Text $webrtcText -Pattern 'stdout\.read\(&mut buf\)\.await' -Path $webrtcPath -Message "WebRTC screen-share loop awaits ffmpeg stdout reads."
Add-RegexCheck -Scope "webrtc-screen-share" -Name "NAL splitter drains finite buffer" -Text $webrtcText -Pattern 'while let Some\(idx\) = find_nal_unit_start\(&h264_stream\)[\s\S]*h264_stream\.drain' -Path $webrtcPath -Message "WebRTC NAL splitter drains the finite buffered stdout chunk."
Add-RegexCheck -Scope "webrtc-screen-share" -Name "screen share kills child on failure" -Text $webrtcText -Pattern 'track_clone[\s\S]*write_sample[\s\S]*child\.kill\(\)\.await' -Path $webrtcPath -Message "WebRTC screen-share loop kills ffmpeg if sample writes fail."
Add-RegexCheck -Scope "webrtc-screen-share" -Name "screen share kills child on exit" -Text $webrtcText -Pattern 'let _ = child\.kill\(\)\.await;[\s\S]*FFmpeg screen capture loop exited' -Path $webrtcPath -Message "WebRTC screen-share loop kills ffmpeg when the capture loop exits."

$bridgeServicesPath = "musu-rs\src\bridge\services.rs"
$bridgeServicesText = Get-RepoText $bridgeServicesPath
Add-RegexCheck -Scope "process-enumeration" -Name "windows snapshot enumeration" -Text $bridgeServicesText -Pattern 'CreateToolhelp32Snapshot\(TH32CS_SNAPPROCESS,\s*0\)' -Path $bridgeServicesPath -Message "Windows process enumeration is a finite snapshot walk."
Add-RegexCheck -Scope "process-enumeration" -Name "windows snapshot break" -Text $bridgeServicesText -Pattern 'Process32NextW\(snapshot,\s*&mut entry\)\s*==\s*0[\s\S]*break' -Path $bridgeServicesPath -Message "Windows process enumeration exits when the snapshot is exhausted."
Add-RegexCheck -Scope "process-enumeration" -Name "windows snapshot close" -Text $bridgeServicesText -Pattern 'CloseHandle\(snapshot\)' -Path $bridgeServicesPath -Message "Windows process enumeration closes the snapshot handle."

$writerRunnerPath = "musu-rs\src\writer\runner.rs"
$writerRunnerText = Get-RepoText $writerRunnerPath
Add-RegexCheck -Scope "task-runner" -Name "task spawn registered handle" -Text $writerRunnerText -Pattern 'let join = tokio::spawn\(async move \{[\s\S]*run_one\(inner\.clone\(\),\s*spec,\s*cancel_for_task\)\.await[\s\S]*registry\.insert' -Path $writerRunnerPath -Message "Writer tasks are spawned and immediately registered for cancellation/reconciliation."
Add-RegexCheck -Scope "task-runner" -Name "registry guard removes task" -Text $writerRunnerText -Pattern 'struct RegistryGuard[\s\S]*impl Drop for RegistryGuard[\s\S]*registry\.remove\(&self\.task_id\)' -Path $writerRunnerPath -Message "Writer task join handles are removed from the registry on task exit."
Add-RegexCheck -Scope "task-callback" -Name "callback bounded retry spawn" -Text $writerRunnerText -Pattern 'tokio::spawn\(async move \{[\s\S]*for attempt in 0\.\.3u32[\s\S]*\.timeout\(std::time::Duration::from_secs\(10\)\)' -Path $writerRunnerPath -Message "Task callbacks run in a spawned one-shot with bounded retry count and per-request timeout."
Add-RegexCheck -Scope "task-callback" -Name "callback retry backoff sleep" -Text $writerRunnerText -Pattern 'tokio::time::sleep\(std::time::Duration::from_secs\(1 << attempt\)\)\.await' -Path $writerRunnerPath -Message "Task callback retries sleep between attempts instead of spinning."
Add-RegexCheck -Scope "wiki-index" -Name "musu-crawl fire-and-forget thread" -Text $writerRunnerText -Pattern 'std::thread::spawn\(move \|\| \{[\s\S]*Command::new\(musu_crawl_exe\)[\s\S]*\.output\(\)' -Path $writerRunnerPath -Message "Semantic SSOT markdown indexing runs as a one-shot thread after a task markdown write."
Add-RegexCheck -Scope "task-runner" -Name "admission safety recheck interval" -Text $writerRunnerText -Pattern 'ADMISSION_RECHECK_INTERVAL:\s*Duration\s*=\s*Duration::from_secs\(1\)' -Path $writerRunnerPath -Message "Task admission loop has a slow safety recheck interval."
Add-RegexCheck -Scope "task-runner" -Name "admission notify or sleep or cancel" -Text $writerRunnerText -Pattern 'tokio::select!\s*\{[\s\S]*notified[\s\S]*tokio::time::sleep\(ADMISSION_RECHECK_INTERVAL\)[\s\S]*cancel\.notified\(\)' -Path $writerRunnerPath -Message "Task admission loop waits on notify, bounded sleep, or cancel."
Add-RegexCheck -Scope "task-runner" -Name "stream no-deadline per-iter timeout" -Text $writerRunnerText -Pattern 'remaining\.unwrap_or\(Duration::from_millis\(500\)\)' -Path $writerRunnerPath -Message "Task stdout stream loop bounds no-deadline reads to 500ms per iteration."
Add-RegexCheck -Scope "task-runner" -Name "stream cancel and timeout select" -Text $writerRunnerText -Pattern 'tokio::select!\s*\{[\s\S]*cancel\.notified\(\)[\s\S]*tokio::time::timeout\(per_iter,\s*read_fut\)' -Path $writerRunnerPath -Message "Task stdout stream loop selects between cancel and bounded read."
Add-RegexCheck -Scope "task-runner" -Name "stream deadline timeout" -Text $writerRunnerText -Pattern 'if now >= d[\s\S]*StreamOutcome::Timeout' -Path $writerRunnerPath -Message "Task stdout stream loop exits when its deadline is reached."

$writerClaudePath = "musu-rs\src\writer\claude.rs"
$writerClaudeText = Get-RepoText $writerClaudePath
Add-RegexCheck -Scope "writer-claude" -Name "stdin write one-shot spawn" -Text $writerClaudeText -Pattern 'tokio::spawn\(async move \{[\s\S]*stdin\.write_all\(prompt\.as_bytes\(\)\)\.await[\s\S]*stdin\.shutdown\(\)\.await' -Path $writerClaudePath -Message "Claude stdin writer spawn writes the prompt once, shuts stdin down, and exits."
Add-RegexCheck -Scope "writer-claude" -Name "claude child kill on drop" -Text $writerClaudeText -Pattern '\.kill_on_drop\(true\)' -Path $writerClaudePath -Message "Claude child process is killed if the async command handle is dropped."

$companiesPath = "musu-rs\src\bridge\handlers\companies.rs"
$companiesText = Get-RepoText $companiesPath
Add-RegexCheck -Scope "companies-index-sync" -Name "post-create sync fire-and-forget spawn" -Text $companiesText -Pattern 'tokio::spawn\(async move \{[\s\S]*sync_workspace_async\(' -Path $companiesPath -Message "Company creation starts a fire-and-forget index sync so HTTP 201 is not blocked by disk scan."
Add-RegexCheck -Scope "companies-index-sync" -Name "post-create sync nonfatal warn" -Text $companiesText -Pattern 'indexer sync after create_company failed; non-fatal' -Path $companiesPath -Message "Post-create index sync failure is logged as non-fatal and does not retry-spin."

$nodesPath = "musu-rs\src\bridge\handlers\nodes.rs"
$nodesText = Get-RepoText $nodesPath
Add-RegexCheck -Scope "nodes-health" -Name "peer health spawned per finite entry" -Text $nodesText -Pattern 'for \(name,\s*entry\) in peer_entries[\s\S]*tokio::spawn\(async move \{[\s\S]*timeout\(Duration::from_secs\(3\)' -Path $nodesPath -Message "Node listing spawns one bounded health check per finite peer entry."
Add-RegexCheck -Scope "nodes-health" -Name "peer health join awaited" -Text $nodesText -Pattern 'for t in tasks \{[\s\S]*if let Ok\(\(name,\s*entry,\s*healthy\)\) = t\.await' -Path $nodesPath -Message "Node listing awaits every spawned peer health check before returning."

$routeEvidencePath = "musu-rs\src\bridge\route_evidence.rs"
$routeEvidenceText = Get-RepoText $routeEvidencePath
Add-RegexCheck -Scope "route-evidence-submit" -Name "route evidence one-shot spawn" -Text $routeEvidenceText -Pattern 'tokio::spawn\(async move \{[\s\S]*submit_recorded_route_evidence_if_configured' -Path $routeEvidencePath -Message "Route evidence cloud submission is a one-shot spawned task with no polling loop."
Add-RegexCheck -Scope "route-evidence-submit" -Name "route evidence no-token skip" -Text $routeEvidenceText -Pattern 'SkippedNoToken[\s\S]*return Ok\(RouteEvidenceSubmitOutcome::SkippedNoToken\)' -Path $routeEvidencePath -Message "Route evidence cloud submission exits early when no account token is configured."

$rendezvousPath = "musu-rs\src\bridge\rendezvous.rs"
$rendezvousText = Get-RepoText $rendezvousPath
Add-RegexCheck -Scope "rendezvous" -Name "rendezvous timeout clamp" -Text $rendezvousText -Pattern 'MUSU_P2P_RENDEZVOUS_CLIENT_TIMEOUT_MS[\s\S]*\.clamp\(250,\s*10_000\)' -Path $rendezvousPath -Message "Rendezvous cloud calls have a clamped timeout budget."
Add-RegexCheck -Scope "rendezvous" -Name "publish candidates one-shot spawn" -Text $rendezvousText -Pattern 'spawn_publish_target_candidates[\s\S]*tokio::spawn\(async move \{[\s\S]*publish_local_candidates' -Path $rendezvousPath -Message "Publishing local candidates is a one-shot spawned cloud task."
Add-RegexCheck -Scope "rendezvous" -Name "publish candidates timeout" -Text $rendezvousText -Pattern 'tokio::time::timeout\(\s*rendezvous_timeout\(\),\s*cloud\.add_rendezvous_candidates' -Path $rendezvousPath -Message "Publishing local candidates is wrapped by the rendezvous timeout."
Add-RegexCheck -Scope "rendezvous" -Name "close session one-shot spawn" -Text $rendezvousText -Pattern 'spawn_close_rendezvous_session[\s\S]*tokio::spawn\(async move \{[\s\S]*close_rendezvous' -Path $rendezvousPath -Message "Closing a rendezvous session is a one-shot spawned cloud task."
Add-RegexCheck -Scope "rendezvous" -Name "close session timeout" -Text $rendezvousText -Pattern 'tokio::time::timeout\(rendezvous_timeout\(\),\s*cloud\.close_rendezvous\(&session_id\)\)' -Path $rendezvousPath -Message "Closing rendezvous sessions is wrapped by the rendezvous timeout."

$workflowHandlerPath = "musu-rs\src\bridge\handlers\workflow.rs"
$workflowHandlerText = Get-RepoText $workflowHandlerPath
Add-RegexCheck -Scope "workflow-handler" -Name "execute workflow one-shot spawn" -Text $workflowHandlerText -Pattern 'tokio::spawn\(async move \{[\s\S]*execute_workflow\(&state_clone,\s*&id_clone\)\.await' -Path $workflowHandlerPath -Message "Workflow HTTP execution starts one spawned executor task and returns immediately."
Add-RegexCheck -Scope "workflow-handler" -Name "execute workflow failure logged" -Text $workflowHandlerText -Pattern 'workflow execution failed' -Path $workflowHandlerPath -Message "Workflow executor spawn logs failure instead of retry-spinning."

$privateMeshPath = "musu-rs\src\install\private_mesh.rs"
$privateMeshText = Get-RepoText $privateMeshPath
Add-RegexCheck -Scope "private-mesh-release-proof" -Name "release task poll deadline" -Text $privateMeshText -Pattern 'async fn poll_release_task[\s\S]*let deadline = Instant::now\(\) \+ timeout' -Path $privateMeshPath -Message "Private mesh release-task polling is bounded by a caller-supplied deadline."
Add-RegexCheck -Scope "private-mesh-release-proof" -Name "release task poll loop bounded" -Text $privateMeshText -Pattern 'while Instant::now\(\) < deadline[\s\S]*get_bridge_json\(client,\s*token,\s*url\.clone\(\),\s*Duration::from_secs\(5\)\)' -Path $privateMeshPath -Message "Private mesh release-task polling uses timeout-bound status requests inside the deadline."
Add-RegexCheck -Scope "private-mesh-release-proof" -Name "release task poll sleep" -Text $privateMeshText -Pattern 'tokio::time::sleep\(Duration::from_millis\(500\)\)\.await' -Path $privateMeshPath -Message "Private mesh release-task polling sleeps between status checks."
Add-RegexCheck -Scope "private-mesh-release-proof" -Name "release task timeout reports last error" -Text $privateMeshText -Pattern 'source task status did not reach a terminal state before timeout[\s\S]*last poll error' -Path $privateMeshPath -Message "Private mesh release-task polling exits with a timeout error instead of spinning forever."
Add-RegexCheck -Scope "private-mesh-command" -Name "tailscale command timeout deadline" -Text $privateMeshText -Pattern 'fn run_tail_command_owned_with_timeout[\s\S]*let deadline = std::time::Instant::now\(\) \+ timeout' -Path $privateMeshPath -Message "Tailscale command helper uses an explicit timeout deadline."
Add-RegexCheck -Scope "private-mesh-command" -Name "tailscale command wait sleep" -Text $privateMeshText -Pattern 'child\.try_wait\(\)[\s\S]*std::thread::sleep\(Duration::from_millis\(50\)\)' -Path $privateMeshPath -Message "Tailscale command helper sleeps between try_wait probes."
Add-RegexCheck -Scope "private-mesh-command" -Name "tailscale command kill on timeout" -Text $privateMeshText -Pattern 'timed_out = true[\s\S]*child\.kill\(\)[\s\S]*child\.wait\(\)' -Path $privateMeshPath -Message "Tailscale command helper kills and reaps the child on timeout."

$startupPath = "musu-rs\src\install\startup.rs"
$startupText = Get-RepoText $startupPath
Add-RegexCheck -Scope "startup-login" -Name "startup service does not start login" -Text $startupText -Pattern 'if mode == LaunchMode::UserOpen \{[\s\S]*spawn_desktop_login_if_needed\(&musu_home\)' -Path $startupPath -Message "Packaged startup only spawns device-flow login for explicit user-open launches."
Add-RegexCheck -Scope "startup-login" -Name "startup token fast path" -Text $startupText -Pattern 'load_token\(musu_home\)\.is_some\(\)[\s\S]*skipping device-flow[\s\S]*return;' -Path $startupPath -Message "Desktop startup skips the login spawn when an account token already exists."
Add-RegexCheck -Scope "startup-login" -Name "startup login detached spawn bounded by device flow" -Text $startupText -Pattern 'tokio::spawn\(async move \{[\s\S]*run_desktop_login\(on_pending\)\.await[\s\S]*device-flow did not complete; bridge stays up' -Path $startupPath -Message "Desktop startup login spawn is detached, non-fatal, and delegates to the bounded device-flow finalizer."

$rustSourceRoot = Join-Path $repoRoot "musu-rs\src"
$rawBusyLoopHits = New-Object System.Collections.Generic.List[object]
$unauditedSpawnHits = New-Object System.Collections.Generic.List[object]
$telemetryFlushPrimitiveHits = New-Object System.Collections.Generic.List[object]
$allowedTelemetryFlushPrimitiveHits = New-Object System.Collections.Generic.List[object]
$filesystemWatcherPrimitiveHits = New-Object System.Collections.Generic.List[object]
$fileSyncWatcherStartHits = New-Object System.Collections.Generic.List[object]
$networkWatcherPrimitiveHits = New-Object System.Collections.Generic.List[object]
if (-not (Test-Path -LiteralPath $rustSourceRoot)) {
    Add-Check -Scope "source" -Name "rust source root exists" -Passed $false -Path "musu-rs\src" -Message "Rust source root is missing."
}
else {
    $allowedFilesystemWatcherFiles = @(
        "musu-rs\src\indexer\watch.rs",
        "musu-rs\src\install\sync.rs"
    )
    $allowedFileSyncWatcherCallFiles = @(
        "musu-rs\src\bridge\mod.rs",
        "musu-rs\src\install\cli_commands.rs"
    )
    $allowedNetworkWatcherFiles = @(
        "musu-rs\src\bridge\mod.rs",
        "musu-rs\src\bridge\handlers\relay_payload.rs",
        "musu-rs\src\cloud\mod.rs",
        "musu-rs\src\control\http_server.rs",
        "musu-rs\src\install\auto_update.rs",
        "musu-rs\src\install\cli_commands.rs",
        "musu-rs\src\install\cli_commands\device_login.rs",
        "musu-rs\src\main.rs",
        "musu-rs\src\peer\mdns.rs"
    )
    $allowedTelemetryFlushPrimitiveFiles = @(
        "musu-rs\src\install\uninstall.rs"
    )
    $allowlistedLoopFiles = @(
        "musu-rs\src\adapter\cli_common.rs",
        "musu-rs\src\adapter\claude.rs",
        "musu-rs\src\brain\planner.rs",
        "musu-rs\src\bridge\mod.rs",
        "musu-rs\src\bridge\handlers\relay_payload.rs",
        "musu-rs\src\bridge\handlers\pty.rs",
        "musu-rs\src\bridge\handlers\ws_proxy.rs",
        "musu-rs\src\bridge\services.rs",
        "musu-rs\src\control\http_server.rs",
        "musu-rs\src\indexer\watch.rs",
        "musu-rs\src\install\auto_update.rs",
        "musu-rs\src\install\cli_commands.rs",
        "musu-rs\src\install\cli_commands\device_login.rs",
        "musu-rs\src\install\private_mesh.rs",
        "musu-rs\src\install\sync.rs",
        "musu-rs\src\io\clipboard.rs",
        "musu-rs\src\io\webrtc.rs",
        "musu-rs\src\peer\hardware.rs",
        "musu-rs\src\peer\mdns.rs",
        "musu-rs\src\workflow\executor.rs",
        "musu-rs\src\writer\runner.rs"
    )
    $allowlistedWhileLetFiles = @(
        "musu-rs\src\bridge\audit.rs",
        "musu-rs\src\bridge\handlers\files.rs",
        "musu-rs\src\bridge\handlers\forward.rs",
        "musu-rs\src\bridge\handlers\webdav.rs",
        "musu-rs\src\bridge\handlers\ws_proxy.rs",
        "musu-rs\src\bridge\rate_limit.rs",
        "musu-rs\src\io\webrtc.rs",
        "musu-rs\src\workflow\executor.rs",
        "musu-rs\src\workflow\workflow_spec.rs"
    )
    $allowlistedSpawnFiles = @(
        "musu-rs\src\adapter\cli_common.rs",
        "musu-rs\src\bridge\handlers\companies.rs",
        "musu-rs\src\bridge\handlers\nodes.rs",
        "musu-rs\src\bridge\handlers\pty.rs",
        "musu-rs\src\bridge\handlers\relay_payload.rs",
        "musu-rs\src\bridge\handlers\workflow.rs",
        "musu-rs\src\bridge\mod.rs",
        "musu-rs\src\bridge\rendezvous.rs",
        "musu-rs\src\bridge\route_evidence.rs",
        "musu-rs\src\control\mod.rs",
        "musu-rs\src\indexer\sync.rs",
        "musu-rs\src\install\auto_update.rs",
        "musu-rs\src\install\startup.rs",
        "musu-rs\src\io\clipboard.rs",
        "musu-rs\src\io\webrtc.rs",
        "musu-rs\src\peer\mdns.rs",
        "musu-rs\src\writer\claude.rs",
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
        if ([regex]::IsMatch($text, 'while\s+let\s+') -and ($relative -notin $allowlistedWhileLetFiles)) {
            $rawBusyLoopHits.Add([pscustomobject]@{ path = $relative }) | Out-Null
        }
        $spawnMatches = [regex]::Matches($text, '\b(?:tokio::spawn|tokio::task::spawn_blocking|std::thread::spawn|thread::spawn)\s*\(')
        if ($spawnMatches.Count -gt 0 -and ($relative -notin $allowlistedSpawnFiles)) {
            $unauditedSpawnHits.Add([pscustomobject]@{ path = $relative; count = $spawnMatches.Count }) | Out-Null
        }
        $telemetryFlushMatches = [regex]::Matches(
            $text,
            '\b(?:std::io::stdout\(\)|std::io::stderr\(\)|stdout\(\)|stderr\(\))\.flush\(\)|\bforce_flush\s*\(|\bflush_tracer_provider\s*\(|\b(?:opentelemetry|tracing_appender|non_blocking|metrics_exporter|prometheus_exporter)\b'
        )
        if ($telemetryFlushMatches.Count -gt 0) {
            if ($relative -in $allowedTelemetryFlushPrimitiveFiles) {
                $allowedTelemetryFlushPrimitiveHits.Add([pscustomobject]@{ path = $relative; count = $telemetryFlushMatches.Count }) | Out-Null
            }
            else {
                $telemetryFlushPrimitiveHits.Add([pscustomobject]@{ path = $relative; count = $telemetryFlushMatches.Count }) | Out-Null
            }
        }
        if ([regex]::IsMatch($text, 'RecommendedWatcher|recommended_watcher|watcher\.watch\(') -and ($relative -notin $allowedFilesystemWatcherFiles)) {
            $filesystemWatcherPrimitiveHits.Add([pscustomobject]@{ path = $relative }) | Out-Null
        }
        $fileSyncWatcherStartMatches = [regex]::Matches($text, 'crate::install::sync::start_watcher\(')
        if ($fileSyncWatcherStartMatches.Count -gt 0 -and ($relative -notin $allowedFileSyncWatcherCallFiles)) {
            $fileSyncWatcherStartHits.Add([pscustomobject]@{ path = $relative; count = $fileSyncWatcherStartMatches.Count }) | Out-Null
        }
        $networkWatcherMatches = [regex]::Matches(
            $text,
            'poll_device_token\(|discover_peers\(|auto_register_peers\(|query_relay_payloads\(|claim_relay_payloads\(|mark_relay_payload_delivered\(|run_relay_payload_poller\(|start_relay_payload_poller_if_enabled\(|tokio::time::interval\(|IntervalStream::new\(|recv_timeout\(Duration::from_secs\(1\)\)|starting low-duty musu\.pro cloud registration loop'
        )
        if ($networkWatcherMatches.Count -gt 0 -and ($relative -notin $allowedNetworkWatcherFiles)) {
            $networkWatcherPrimitiveHits.Add([pscustomobject]@{ path = $relative; count = $networkWatcherMatches.Count }) | Out-Null
        }
    }

    Add-Check `
        -Scope "source" `
        -Name "new rust loops must be audited" `
        -Passed ($rawBusyLoopHits.Count -eq 0) `
        -Path "musu-rs\src" `
        -Message ($(if ($rawBusyLoopHits.Count -eq 0) { "No unaudited Rust loop constructs found outside the allowlist." } else { "Unaudited Rust loop constructs found: $(@($rawBusyLoopHits | ForEach-Object { $_.path }) -join ', ')." }))
    Add-Check `
        -Scope "source" `
        -Name "new rust spawns must be audited" `
        -Passed ($unauditedSpawnHits.Count -eq 0) `
        -Path "musu-rs\src" `
        -Message ($(if ($unauditedSpawnHits.Count -eq 0) { "No unaudited Rust spawn constructs found outside the allowlist." } else { "Unaudited Rust spawn constructs found: $(@($unauditedSpawnHits | ForEach-Object { "$($_.path) ($($_.count))" }) -join ', ')." }))
    Add-Check `
        -Scope "logging-telemetry" `
        -Name "one-shot log flush primitives stay allowlisted" `
        -Passed ($telemetryFlushPrimitiveHits.Count -eq 0) `
        -Path "musu-rs\src" `
        -Message ($(if ($telemetryFlushPrimitiveHits.Count -eq 0) { "Allowed one-shot log flush primitives: $(@($allowedTelemetryFlushPrimitiveHits | ForEach-Object { "$($_.path) ($($_.count))" }) -join ', ')." } else { "Log/telemetry flush primitives found outside the allowlist: $(@($telemetryFlushPrimitiveHits | ForEach-Object { "$($_.path) ($($_.count))" }) -join ', ')." }))
    Add-Check `
        -Scope "logging-telemetry" `
        -Name "no background telemetry flush worker primitives" `
        -Passed ($telemetryFlushPrimitiveHits.Count -eq 0) `
        -Path "musu-rs\src" `
        -Message ($(if ($telemetryFlushPrimitiveHits.Count -eq 0) { "No Rust background telemetry/log flush worker primitives found." } else { "Telemetry/log flush worker primitives found: $(@($telemetryFlushPrimitiveHits | ForEach-Object { "$($_.path) ($($_.count))" }) -join ', ')." }))
    Add-Check `
        -Scope "source" `
        -Name "filesystem watcher primitives stay allowlisted" `
        -Passed ($filesystemWatcherPrimitiveHits.Count -eq 0) `
        -Path "musu-rs\src" `
        -Message ($(if ($filesystemWatcherPrimitiveHits.Count -eq 0) { "Filesystem watcher primitives are limited to indexer watch and file sync implementations." } else { "Filesystem watcher primitives found outside the allowlist: $(@($filesystemWatcherPrimitiveHits | ForEach-Object { $_.path }) -join ', ')." }))
    Add-Check `
        -Scope "source" `
        -Name "file sync watcher starts only from bridge config or sync CLI" `
        -Passed ($fileSyncWatcherStartHits.Count -eq 0) `
        -Path "musu-rs\src" `
        -Message ($(if ($fileSyncWatcherStartHits.Count -eq 0) { "File-sync watcher start calls are limited to the configured bridge path and explicit `musu sync` CLI." } else { "File-sync watcher start calls found outside the allowlist: $(@($fileSyncWatcherStartHits | ForEach-Object { "$($_.path) ($($_.count))" }) -join ', ')." }))
    Add-Check `
        -Scope "source" `
        -Name "network watcher primitives stay allowlisted" `
        -Passed ($networkWatcherPrimitiveHits.Count -eq 0) `
        -Path "musu-rs\src" `
        -Message ($(if ($networkWatcherPrimitiveHits.Count -eq 0) { "Network watcher/poller primitives are limited to explicit CLI, opt-in mDNS/relay-poller, low-duty cloud heartbeat, auto-update, control SSE, and relay payload handler/client surfaces." } else { "Network watcher/poller primitives found outside the allowlist: $(@($networkWatcherPrimitiveHits | ForEach-Object { "$($_.path) ($($_.count))" }) -join ', ')." }))
}

$failCount = @($checks | Where-Object { $_.status -eq "fail" }).Count
$result = [pscustomobject]@{
    schema = "musu.rust_background_loop_contract.v1"
    ok = ($failCount -eq 0)
    generated_at = [datetimeoffset]::Now.ToString("o")
    fail_count = $failCount
    unaudited_loop_hit_count = $rawBusyLoopHits.Count
    unaudited_loop_hits = $rawBusyLoopHits.ToArray()
    unaudited_spawn_hit_count = $unauditedSpawnHits.Count
    unaudited_spawn_hits = $unauditedSpawnHits.ToArray()
    telemetry_flush_primitive_hit_count = $telemetryFlushPrimitiveHits.Count
    telemetry_flush_primitive_hits = $telemetryFlushPrimitiveHits.ToArray()
    allowed_telemetry_flush_primitive_hit_count = $allowedTelemetryFlushPrimitiveHits.Count
    allowed_telemetry_flush_primitive_hits = $allowedTelemetryFlushPrimitiveHits.ToArray()
    filesystem_watcher_primitive_hit_count = $filesystemWatcherPrimitiveHits.Count
    filesystem_watcher_primitive_hits = $filesystemWatcherPrimitiveHits.ToArray()
    file_sync_watcher_start_hit_count = $fileSyncWatcherStartHits.Count
    file_sync_watcher_start_hits = $fileSyncWatcherStartHits.ToArray()
    network_watcher_primitive_hit_count = $networkWatcherPrimitiveHits.Count
    network_watcher_primitive_hits = $networkWatcherPrimitiveHits.ToArray()
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
    "unaudited_spawn_hit_count: $($result.unaudited_spawn_hit_count)"
    ""
    $checks | Format-Table scope, name, status, path, message -Wrap
}

if ($FailOnProblem -and -not $result.ok) {
    exit 1
}
