[CmdletBinding()]
param(
    [string]$ExpectedVersion,
    [string]$OutputRoot,
    [switch]$Json
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = (Resolve-Path (Join-Path $scriptDir "..\..")).Path

if ([string]::IsNullOrWhiteSpace($ExpectedVersion)) {
    $ExpectedVersion = (Get-Content -LiteralPath (Join-Path $repoRoot "VERSION") -Raw).Trim()
}
if ([string]::IsNullOrWhiteSpace($OutputRoot)) {
    $stamp = [datetimeoffset]::Now.ToString("yyyyMMdd-HHmmss")
    $OutputRoot = Join-Path $repoRoot ".local-build\release-evidence-verifier-tests\$stamp"
}

New-Item -ItemType Directory -Force -Path $OutputRoot | Out-Null

$p2pVerifier = Join-Path $scriptDir "verify-p2p-control-plane-evidence.ps1"
$msixVerifier = Join-Path $scriptDir "verify-msix-install-evidence.ps1"
$multiDeviceVerifier = Join-Path $scriptDir "verify-multidevice-evidence.ps1"
$runtimeCpuScenarioMatrixVerifier = Join-Path $scriptDir "verify-runtime-cpu-scenario-matrix.ps1"
$singleMachineVerifier = Join-Path $scriptDir "verify-single-machine-evidence.ps1"
$releaseGoNoGoWriter = Join-Path $scriptDir "write-release-go-no-go.ps1"
$externalGateRecheckRecorder = Join-Path $scriptDir "record-external-release-gate-recheck.ps1"
$p2pEnvStatusReporter = Join-Path $scriptDir "show-musu-pro-p2p-env-status.ps1"

function Copy-JsonObject {
    param([Parameter(Mandatory = $true)]$Object)

    return ($Object | ConvertTo-Json -Depth 30 | ConvertFrom-Json)
}

function Write-Fixture {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)]$Object
    )

    $path = Join-Path $OutputRoot "$Name.json"
    $Object | ConvertTo-Json -Depth 30 | Set-Content -LiteralPath $path -Encoding UTF8
    return $path
}

function Get-CurrentPowerShellExecutable {
    $currentProcessPath = $null
    try {
        $currentProcessPath = [System.Diagnostics.Process]::GetCurrentProcess().MainModule.FileName
    }
    catch {
        $currentProcessPath = $null
    }

    if (-not [string]::IsNullOrWhiteSpace($currentProcessPath) -and (Test-Path -LiteralPath $currentProcessPath)) {
        return $currentProcessPath
    }

    $edition = if ($PSVersionTable.ContainsKey("PSEdition")) { [string]$PSVersionTable.PSEdition } else { "" }
    if ($edition -eq "Core") {
        return "pwsh"
    }
    return "powershell.exe"
}

$powerShellExecutable = Get-CurrentPowerShellExecutable

function Invoke-Verifier {
    param(
        [Parameter(Mandatory = $true)][string]$ScriptPath,
        [Parameter(Mandatory = $true)][string[]]$Arguments
    )

    $output = & $powerShellExecutable -NoProfile -ExecutionPolicy Bypass -File $ScriptPath @Arguments 2>&1
    $exitCode = $LASTEXITCODE
    $text = ($output | Out-String).Trim()
    $parsed = $null
    if (-not [string]::IsNullOrWhiteSpace($text)) {
        try {
            $parsed = $text | ConvertFrom-Json
        }
        catch {
            $parsed = $null
        }
    }

    [pscustomobject]@{
        exit_code = $exitCode
        parsed = $parsed
        raw = $text
    }
}

function Add-CaseResult {
    param(
        [System.Collections.Generic.List[object]]$Cases,
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][string]$Verifier,
        [Parameter(Mandatory = $true)][string]$FixturePath,
        [Parameter(Mandatory = $true)][bool]$ShouldPass,
        [Parameter(Mandatory = $true)]$Invocation
    )

    $parsedOk = $false
    $failCount = $null
    if ($Invocation.parsed) {
        if ($Invocation.parsed.PSObject.Properties["ok"]) {
            $parsedOk = [bool]$Invocation.parsed.ok
        }
        if ($Invocation.parsed.PSObject.Properties["fail_count"]) {
            $failCount = [int]$Invocation.parsed.fail_count
        }
    }

    $passedExpectation = if ($ShouldPass) {
        ($Invocation.exit_code -eq 0 -and $parsedOk)
    }
    else {
        ($Invocation.exit_code -ne 0 -and -not $parsedOk)
    }

    $Cases.Add([pscustomobject]@{
        name = $Name
        verifier = $Verifier
        fixture_path = (Resolve-Path -LiteralPath $FixturePath).Path
        should_pass = $ShouldPass
        exit_code = [int]$Invocation.exit_code
        parsed_ok = [bool]$parsedOk
        fail_count = $failCount
        passed_expectation = [bool]$passedExpectation
        raw = if ($passedExpectation) { $null } else { $Invocation.raw }
    }) | Out-Null
}

function New-StaticVerifierInvocation {
    param(
        [Parameter(Mandatory = $true)][bool]$Ok,
        [Parameter(Mandatory = $true)][string]$Message
    )

    [pscustomobject]@{
        exit_code = if ($Ok) { 0 } else { 1 }
        parsed = [pscustomobject]@{
            ok = $Ok
            fail_count = if ($Ok) { 0 } else { 1 }
        }
        raw = $Message
    }
}

function Test-TestSourceFilesAllowedAsStatusOnly {
    param([Parameter(Mandatory = $true)][string]$ScriptPath)

    $source = Get-Content -LiteralPath $ScriptPath -Raw
    return (
        $source -like '*"*.test.ts"*' -and
        $source -like '*"*.test.tsx"*' -and
        $source -like '*"*.spec.ts"*' -and
        $source -like '*"*.spec.tsx"*'
    )
}

function Test-ControlPlaneOnlySourceFilesAllowedAsStatusOnly {
    param([Parameter(Mandatory = $true)][string]$ScriptPath)

    $source = Get-Content -LiteralPath $ScriptPath -Raw
    $requiredNeedles = @(
        '"musu-bee/src/app/api/v1/p2p/*"',
        '"musu-bee/src/app/api/v1/relay/*"',
        '"musu-bee/src/app/api/rooms/*"',
        '"musu-bee/src/lib/routeEvidence*.ts"',
        '"musu-bee/src/lib/p2p*.ts"'
    )

    foreach ($needle in $requiredNeedles) {
        if (-not $source.Contains($needle)) {
            return $false
        }
    }
    return $true
}

function Test-RuntimeCpuScenarioMatrixRouteProbeContract {
    param([Parameter(Mandatory = $true)][string]$ScriptPath)

    $source = Get-Content -LiteralPath $ScriptPath -Raw
    $requiredNeedles = @(
        '[int]$RouteWaitTimeoutSec = 180',
        'RouteWaitTimeoutSec must be between 1 and 3600.',
        '$RoutePrompt = $RoutePrompt.Replace("{TOKEN}", $expectedRouteToken)',
        'RoutePrompt must include expected token',
        '"--wait-timeout-sec"',
        '$routeProbeCommandTimeoutSec = [Math]::Max($CommandTimeoutSec, $RouteWaitTimeoutSec + 30)',
        'wait_timeout_sec = $RouteWaitTimeoutSec',
        'command_timeout_sec = $routeProbeCommandTimeoutSec'
    )

    foreach ($needle in $requiredNeedles) {
        if (-not $source.Contains($needle)) {
            return $false
        }
    }
    return $true
}

function Test-SecondPcRuntimeCpuRouteWaitTimeoutPassThrough {
    param([Parameter(Mandatory = $true)][string]$ScriptPath)

    $source = Get-Content -LiteralPath $ScriptPath -Raw
    $requiredNeedles = @(
        '[int]$RuntimeCpuRouteWaitTimeoutSec = 180',
        '"-RouteWaitTimeoutSec", ([string]$RuntimeCpuRouteWaitTimeoutSec)'
    )

    foreach ($needle in $requiredNeedles) {
        if (-not $source.Contains($needle)) {
            return $false
        }
    }
    return $true
}

function Test-SecondPcImportRuntimeCpuSubroleContract {
    param([Parameter(Mandatory = $true)][string]$ScriptPath)

    $source = Get-Content -LiteralPath $ScriptPath -Raw
    $requiredNeedles = @(
        'runtime_cpu_subrole_contract_ok',
        'process_counts_by_subrole',
        'max_one_core_percent_by_subrole',
        'memory_totals_by_subrole_mb',
        'bridge_runtime',
        'desktop_shell',
        'webview2_helper',
        'release_check_runtime_cpu_subrole_contract_ok_missing',
        'runtime_idle_cpu_subrole_contract_failed',
        'runtime_cpu_scenario_subrole_contract_failed'
    )

    foreach ($needle in $requiredNeedles) {
        if (-not $source.Contains($needle)) {
            return $false
        }
    }
    return $true
}

function Test-RuntimeCpuGoNoGoMatrixSelectionContract {
    param([Parameter(Mandatory = $true)][string]$ScriptPath)

    $source = Get-Content -LiteralPath $ScriptPath -Raw
    $requiredNeedles = @(
        'Select-LatestEvidenceCandidatesByMachine -Candidates $runtimeCpuScenarioMatrixCandidates -MaxPerMachine 12 -MaxUnknown 12',
        '$runtimeCpuSecondPcRouteAttemptRequiredScenarios = @("post-route")',
        '"-RequiredScenarios", ($runtimeCpuSecondPcRouteAttemptRequiredScenarios -join ",")',
        'candidate_selection = "latest-per-machine-up-to-12"'
    )

    foreach ($needle in $requiredNeedles) {
        if (-not $source.Contains($needle)) {
            return $false
        }
    }
    return $true
}

function Test-RuntimeIdleCpuGoNoGoFullRoleAttributionContract {
    param([Parameter(Mandatory = $true)][string]$ScriptPath)

    $source = Get-Content -LiteralPath $ScriptPath -Raw
    $requiredNeedles = @(
        'function Test-ObjectHasPropertyNames',
        '$cpuAttributionRoleNames = @("musu", "node", "webview2", "other")',
        'process counts by MUSU/node/WebView2/other role are recorded',
        'CPU attribution records MUSU/node/WebView2/other sample counts by role',
        'CPU attribution records MUSU/node/WebView2/other CPU totals by role',
        'CPU attribution records MUSU/node/WebView2/other max one-core CPU by role',
        'Test-ObjectHasPropertyNames -Object $processCountsByRole -Names $cpuAttributionRoleNames',
        'Test-ObjectHasPropertyNames -Object $sampleCountByRole -Names $cpuAttributionRoleNames',
        'Test-ObjectHasPropertyNames -Object $totalCpuByRole -Names $cpuAttributionRoleNames',
        'Test-ObjectHasPropertyNames -Object $maxCpuByRole -Names $cpuAttributionRoleNames'
    )

    foreach ($needle in $requiredNeedles) {
        if (-not $source.Contains($needle)) {
            return $false
        }
    }
    return $true
}

function Test-IdleBusyLoopGoNoGoCandidateStatusContract {
    param([Parameter(Mandatory = $true)][string]$ScriptPath)

    $source = Get-Content -LiteralPath $ScriptPath -Raw
    $candidateCount = [regex]::Matches($source, '(?m)^\s*-Candidate\s+"').Count
    if ($candidateCount -ne 8) {
        return $false
    }

    $requiredNeedles = @(
        '$idleBusyLoopCandidateStatuses = @(',
        'idle_busy_loop_candidate_contract_verified',
        'idle_busy_loop_candidate_status',
        'idle-busy-loop-candidates',
        '-Candidate "clipboard polling"',
        '-Candidate "mDNS discovery"',
        '-Candidate "health check retry loop"',
        '-Candidate "bridge readiness wait loop"',
        '-Candidate "frontend interval/refetch"',
        '-Candidate "relay payload target poller"',
        '-Candidate "cloud heartbeat"',
        '-Candidate "log/telemetry flush loop"',
        'clipboard opt-in env gate',
        'clipboard monitor sleep',
        'disconnect breaks browse',
        'health poll sleep',
        'bridge readiness backoff sleep',
        'no direct setInterval in non-test frontend source',
        'poller cancellation-aware sleep',
        'failure backoff sleep',
        'no background telemetry flush worker primitives',
        'clipboard, mDNS, health check retry, bridge readiness wait, frontend polling, relay target polling, cloud heartbeat, and log/telemetry flush loops'
    )

    foreach ($needle in $requiredNeedles) {
        if (-not $source.Contains($needle)) {
            return $false
        }
    }
    return $true
}

function Test-RustBackgroundFilesystemWatcherScopeContract {
    param([Parameter(Mandatory = $true)][string]$ScriptPath)

    $source = Get-Content -LiteralPath $ScriptPath -Raw
    $requiredNeedles = @(
        'watch command scoped dispatch',
        'indexer command dispatch only',
        'bridge does not start indexer watch',
        '$allowedFilesystemWatcherFiles',
        '$allowedFileSyncWatcherCallFiles',
        'RecommendedWatcher|recommended_watcher|watcher\.watch\(',
        'filesystem watcher primitives stay allowlisted',
        'file sync watcher starts only from bridge config or sync CLI',
        'filesystem_watcher_primitive_hit_count',
        'file_sync_watcher_start_hit_count'
    )

    foreach ($needle in $requiredNeedles) {
        if (-not $source.Contains($needle)) {
            return $false
        }
    }
    return $true
}

function Test-RustBackgroundNetworkWatcherScopeContract {
    param([Parameter(Mandatory = $true)][string]$ScriptPath)

    $source = Get-Content -LiteralPath $ScriptPath -Raw
    $requiredNeedles = @(
        'discover command scoped dispatch',
        '$allowedNetworkWatcherFiles',
        'poll_device_token\(|discover_peers\(|auto_register_peers\(|query_relay_payloads\(',
        'claim_relay_payloads\(|mark_relay_payload_delivered\(|run_relay_payload_poller\(',
        'start_relay_payload_poller_if_enabled\(|tokio::time::interval\(|IntervalStream::new\(',
        'network watcher primitives stay allowlisted',
        'network_watcher_primitive_hit_count'
    )

    foreach ($needle in $requiredNeedles) {
        if (-not $source.Contains($needle)) {
            return $false
        }
    }
    return $true
}

function Test-DegradedModeAuditSourceContract {
    param([Parameter(Mandatory = $true)][string]$ScriptPath)

    $source = Get-Content -LiteralPath $ScriptPath -Raw
    $requiredNeedles = @(
        'musu.degraded_mode_contract.v1',
        'agents_unavailable',
        'agents_stale',
        'health-fallback',
        'offline-fallback',
        'fetch_error',
        'DeviceStatusResponse',
        'DEGRADED',
        'ProjectBriefing',
        'src/app/api/device-status/route.test.ts'
    )

    foreach ($needle in $requiredNeedles) {
        if (-not $source.Contains($needle)) {
            return $false
        }
    }
    return $true
}

function Test-DegradedModeGoNoGoContract {
    param([Parameter(Mandatory = $true)][string]$ScriptPath)

    $source = Get-Content -LiteralPath $ScriptPath -Raw
    $requiredNeedles = @(
        'audit-degraded-mode-contract.ps1',
        '$degradedModeContractVerified',
        'degraded_mode_contract_verified',
        'degraded_mode_contract_audit',
        'degraded-mode',
        'musu.degraded_mode_contract.v1',
        'fabricated healthy state'
    )

    foreach ($needle in $requiredNeedles) {
        if (-not $source.Contains($needle)) {
            return $false
        }
    }
    return $true
}

function Test-DegradedModeFreshnessStatusOnlyContract {
    param([Parameter(Mandatory = $true)][string[]]$ScriptPaths)

    foreach ($scriptPath in $ScriptPaths) {
        $source = Get-Content -LiteralPath $scriptPath -Raw
        if (-not $source.Contains('"scripts/windows/audit-degraded-mode-contract.ps1"')) {
            return $false
        }
    }
    return $true
}

function Test-ExternalGateRecheckActionableContract {
    param([Parameter(Mandatory = $true)][string]$ScriptPath)

    $source = Get-Content -LiteralPath $ScriptPath -Raw
    $requiredNeedles = @(
        'public_metadata_checked',
        'public_metadata_ok',
        'second_pc_tcp_error',
        'p2p_relay_status_logged_in',
        'p2p_relay_transport_logged_in',
        'p2p_relay_leases_logged_in',
        'p2p_relay_route_evidence_logged_in',
        'p2p_owner_scope_verified',
        'p2p_relay_lease_store_configured',
        'p2p_relay_lease_store_backend',
        'p2p_relay_lease_store_release_grade',
        'p2p_relay_transport_descriptor_wired',
        'p2p_relay_transport_wired',
        'p2p_relay_connect_endpoint_wired',
        'p2p_relay_payload_endpoint_wired',
        'p2p_runtime_not_logged_in',
        'p2p_relay_lease_store_not_release_grade',
        'p2p_relay_transport_not_wired',
        'p2p_relay_payload_endpoint_not_wired'
    )

    foreach ($needle in $requiredNeedles) {
        if (-not $source.Contains($needle)) {
            return $false
        }
    }
    return $true
}

function Test-P2pEnvStatusRuntimeLoginActionContract {
    param([Parameter(Mandatory = $true)][string]$ScriptPath)

    $source = Get-Content -LiteralPath $ScriptPath -Raw
    $requiredNeedles = @(
        'p2p_runtime_not_logged_in',
        'live_evidence_p2p_runtime_not_logged_in',
        'relay_status_logged_in',
        'relay_transport_logged_in',
        'relay_leases_logged_in',
        'relay_route_evidence_logged_in',
        'relay_lease_store_configured',
        'relay_lease_store_backend',
        'relay_lease_store_release_grade',
        'relay_transport_descriptor_wired',
        'relay_connect_endpoint_wired',
        'relay_payload_endpoint_wired',
        'Log in the packaged MUSU runtime with the WindowsApps alias',
        'Do not use the localhost developer dashboard to satisfy this gate',
        'logged_in=true'
    )

    foreach ($needle in $requiredNeedles) {
        if (-not $source.Contains($needle)) {
            return $false
        }
    }
    return $true
}

$now = [datetimeoffset]::Now
$currentGitCommit = (& git -C $repoRoot rev-parse HEAD 2>$null | Out-String).Trim()

$validBridgeOnlySingleMachine = [pscustomobject]@{
    schema = "musu.single_machine_smoke_evidence.v1"
    ok = $true
    version = $ExpectedVersion
    git_commit = $currentGitCommit
    musu_exe = "C:\Users\verifier\AppData\Local\Microsoft\WindowsApps\musu.exe"
    allow_developer_runtime = $false
    smoke_run_id = "VERIFIER_TEST_BRIDGE_ONLY"
    started_at = $now.AddSeconds(-30).ToString("o")
    completed_at = $now.ToString("o")
    machine = "VERIFIER-TEST"
    dashboard_required = $false
    single_machine_surface = "local-bridge-only"
    dashboard_base_url = ""
    dashboard_base_url_source = "bridge-only-packaged-runtime"
    dashboard_reachable_url = ""
    bridge_url = "http://127.0.0.1:8377"
    workspace_uri = "file:///F:/workspace/musu-bee"
    doctor_overall = "ok"
    dashboard_doctor_overall = "ok"
    device_node_count = 0
    dashboard_task_id = $null
    dashboard_task_status = $null
    dashboard_task_poll_error_count = 0
    dashboard_task_poll_last_error = $null
    expected_dashboard_output = $null
    dashboard_output = $null
    sse_status_code = 0
    sse_content_type = ""
    cli_route_checked = $true
    expected_cli_output = "MUSU_CLI_ROUTE_OK_VERIFIER_TEST"
    cli_route_output = "MUSU_CLI_ROUTE_OK_VERIFIER_TEST"
}

$validP2p = [pscustomobject]@{
    schema = "musu.p2p_control_plane_live_evidence.v1"
    ok = $true
    version = $ExpectedVersion
    base_url = "https://musu.pro"
    recorded_at = $now.ToString("o")
    operator_machine = "VERIFIER-TEST"
    operator_user = "verifier-test"
    relay_status_exit_code = 0
    relay_status = [pscustomobject]@{
        schema = "musu.relay_status.v1"
        registry_url = "https://musu.pro"
        logged_in = $true
        bridge_path_selection_wired = $true
        rendezvous_session_wired = $true
        route_evidence_client_wired = $true
        relay_control_plane_lease_wired = $true
        relay_transport_preflight_ok = $true
        relay_transport_descriptor_wired = $true
        relay_transport_wired = $true
        relay_connect_endpoint_wired = $true
        relay_payload_endpoint_wired = $true
        relay_runtime_fallback_lease_request_wired = $true
        release_grade_transport_required = "quic_tls_1_3"
        relay_default_data_path = $false
        relay_lease_store_configured = $true
        relay_lease_store_backend = "upstash_redis"
        relay_lease_store_release_grade = $true
        relay_transport_blockers = @()
    }
    relay_transport_exit_code = 0
    relay_transport = [pscustomobject]@{
        schema = "musu.relay_transport.v1"
        registry_url = "https://musu.pro"
        logged_in = $true
        ok = $true
        owner_scope_verified = $true
        owner_scoped = $true
        relay_control_plane_wired = $true
        relay_transport_descriptor_wired = $true
        relay_transport_wired = $true
        relay_connect_endpoint_wired = $true
        relay_payload_endpoint_wired = $true
        relay_default_data_path = $false
        relay_url = "wss://relay.musu.pro/api/v1/relay/connect"
        relay_connect_path = "/api/v1/relay/connect"
        relay_transport_kind = "quic_relay_tunnel"
        release_grade_relay_transport_kind = "quic_relay_tunnel"
        release_grade_transport_required = "quic_tls_1_3"
        payload_transit_requires_lease = $true
        policy = "connect_pro_fallback_only"
        relay_lease_store_configured = $true
        relay_lease_store_backend = "upstash_redis"
        relay_lease_store_release_grade = $true
        blockers = @()
    }
    relay_leases_exit_code = 0
    relay_leases = [pscustomobject]@{
        schema = "musu.relay_leases.v1"
        registry_url = "https://musu.pro"
        logged_in = $true
        ok = $true
        owner_scope_verified = $true
        owner_scoped = $true
        relay_control_plane_wired = $true
        relay_transport_wired = $true
        relay_default_data_path = $false
        relay_lease_store_configured = $true
        relay_lease_store_backend = "upstash_redis"
        relay_lease_store_release_grade = $true
        count = 0
    }
    relay_route_evidence_exit_code = 0
    relay_route_evidence = [pscustomobject]@{
        schema = "musu.relay_route_evidence.v1"
        registry_url = "https://musu.pro"
        logged_in = $true
        ok = $true
        owner_scope_verified = $true
        owner_scoped = $true
        relay_transport_proven = $true
        count = 1
        filters = [pscustomobject]@{
            limit = 5
            route_kind = "relay"
            result = "success"
            release_grade = $true
            source_node_id = $null
            target_node_id = $null
        }
        records = @(
            [pscustomobject]@{
                id = "route-evidence-relay-test"
                received_at = $now.ToString("o")
                release_grade = $true
                blockers = @()
                evidence = [pscustomobject]@{
                    schema = "musu.route_evidence.v1"
                    version = $ExpectedVersion
                    source_node_id = "pc-a"
                    target_node_id = "pc-b"
                    session_id = "rv_test"
                    route_kind = "relay"
                    candidate_addr = "relay.musu.pro:443"
                    handshake_ms = 42
                    total_attempt_ms = 311
                    peer_identity_verified = $true
                    peer_identity_method = "quic_tls_cert_fingerprint"
                    peer_public_key = "sha256:test"
                    encryption = "quic_tls_1_3"
                    transport_verified_by = "musu_quic_tls_transport"
                    payload_transited_musu_infra = $true
                    result = "success"
                    recorded_at = $now.ToString("o")
                    relay_fallback = [pscustomobject]@{
                        direct_path_failed = $true
                        lease_requested = $true
                        status = "issued"
                        lease_issued = $true
                        attempted_route_kinds = @("lan", "tailscale")
                        requested_capability = "remote_command"
                        policy = "connect_pro_fallback_only"
                        blockers = @()
                        lease_id = "relay-lease-test"
                    }
                    relay_payload_delivery_proof = [pscustomobject]@{
                        schema = "musu.relay_payload_delivery_proof.v1"
                        payload_id = "relay-payload-test"
                        session_id = "rv_test"
                        lease_id = "relay-lease-test"
                        source_node_id = "pc-a"
                        target_node_id = "pc-b"
                        tunnel_id = "relay-tunnel-test"
                        payload_sha256 = "sha256:relay-payload-test"
                        payload_bytes = 128
                        delivered_at = $now.ToString("o")
                    }
                }
            }
        )
    }
}

$validMultiDevice = [pscustomobject]@{
    schema = "musu.multidevice_smoke_evidence.v1"
    ok = $true
    version = $ExpectedVersion
    started_at = $now.AddSeconds(-20).ToString("o")
    completed_at = $now.ToString("o")
    operator_machine = "VERIFIER-TEST"
    operator_user = "verifier-test"
    remote_addr = "203.0.113.2:8949"
    remote_name = "SECOND-PC"
    discover_checked = $false
    route_checked = $true
    error = ""
    commands = @(
        [pscustomobject]@{
            command = "musu up --json"
            exit_code = 0
            output = '{"ok":true,"bridge":{"status":"ok"}}'
        },
        [pscustomobject]@{
            command = "musu doctor --json"
            exit_code = 0
            output = '{"overall":"ok","bridge":{"status":"ok"}}'
        },
        [pscustomobject]@{
            command = "musu peer add 203.0.113.2:8949 --name SECOND-PC"
            exit_code = 0
            output = "peer added"
        },
        [pscustomobject]@{
            command = "musu peer list"
            exit_code = 0
            output = "SECOND-PC 203.0.113.2:8949"
        },
        [pscustomobject]@{
            command = "musu status"
            exit_code = 0
            output = "MUSU Fleet Status`nSECOND-PC online"
        },
        [pscustomobject]@{
            command = "musu route Explain release-smoke route plan for SECOND-PC --target SECOND-PC --explain --json"
            exit_code = 0
            output = '{"schema":"musu.route_explain.v1","version":"1.15.0-rc.1","requested_target":"SECOND-PC","channel":"cli","needs_gpu":false,"submission_endpoint":"https://203.0.113.2:8949/api/tasks/delegate","selected_candidate":{"name":"SECOND-PC","addr":"203.0.113.2:8949","source":"manual","route_kind":"direct_quic","transport_scheme":"https","peer_identity_verified":true,"peer_identity_method":"peer_public_key","peer_public_key_present":true,"https_fingerprint_pin_available":true,"encryption":"quic_tls_1_3","payload_transited_musu_infra":false},"candidate_count":1,"current_transport":"quic_tls_1_3","bridge_path_selection_wired":true,"rendezvous_session_wired":true,"https_fingerprint_pinning_wired":true,"release_grade_transport_required":"quic_tls_1_3","route_evidence_ready":true,"release_blockers":[],"path_priority":["lan","tailscale","direct_quic","relay"],"relay_policy":"relay is Connect/Pro fallback only; it must not become the default data path"}'
        },
        [pscustomobject]@{
            command = "musu route Reply exactly: MUSU_REMOTE_ROUTE_OK --target SECOND-PC --route-evidence-path .local-build\\multi-device\\verifier.route-evidence.json --wait"
            exit_code = 0
            output = "MUSU_REMOTE_ROUTE_OK"
        }
    )
    route_explain = [pscustomobject]@{
        schema = "musu.route_explain.v1"
        version = $ExpectedVersion
        requested_target = "SECOND-PC"
        channel = "cli"
        needs_gpu = $false
        submission_endpoint = "https://203.0.113.2:8949/api/tasks/delegate"
        selected_candidate = [pscustomobject]@{
            name = "SECOND-PC"
            addr = "203.0.113.2:8949"
            source = "manual"
            route_kind = "direct_quic"
            transport_scheme = "https"
            peer_identity_verified = $true
            peer_identity_method = "peer_public_key"
            peer_public_key_present = $true
            https_fingerprint_pin_available = $true
            encryption = "quic_tls_1_3"
            payload_transited_musu_infra = $false
        }
        candidate_count = 1
        current_transport = "quic_tls_1_3"
        bridge_path_selection_wired = $true
        rendezvous_session_wired = $true
        https_fingerprint_pinning_wired = $true
        release_grade_transport_required = "quic_tls_1_3"
        route_evidence_ready = $true
        release_blockers = @()
        path_priority = @("lan", "tailscale", "direct_quic", "relay")
        relay_policy = "relay is Connect/Pro fallback only; it must not become the default data path"
    }
    route_evidence = [pscustomobject]@{
        schema = "musu.route_evidence.v1"
        version = $ExpectedVersion
        route_kind = "direct_quic"
        candidate_addr = "203.0.113.2:8949"
        encryption = "quic_tls_1_3"
        peer_identity_method = "peer_public_key"
        peer_public_key = "ed25519:test-release-evidence-verifier"
        result = "success"
        transport_verified_by = "musu_quic_tls_transport"
        recorded_at = $now.ToString("o")
        handshake_ms = 12
        total_attempt_ms = 31
        peer_identity_verified = $true
        payload_transited_musu_infra = $false
    }
}

function New-RuntimeMeasurement {
    param(
        [int]$WebView2Count = 6,
        [double]$WorkingSetMb = 512.0,
        [switch]$OmitResourceBudgetViolations,
        [switch]$OmitCpuAttribution
    )

    $measurement = [pscustomobject]@{
        ok = $true
        git_dirty = $false
        sample_seconds = 60
        cpu_sample_count = 3
        process_metadata_available = $true
        process_metadata_timed_out = $false
        helper_process_scope = "musu_process_tree_or_repo_related"
        process_counts_by_role = [pscustomobject]@{
            musu = 2
            node = 0
            webview2 = $WebView2Count
            other = 0
        }
        process_counts_by_subrole = [pscustomobject]@{
            musu_runtime = 0
            bridge_runtime = 1
            desktop_shell = 1
            node_helper = 0
            webview2_helper = $WebView2Count
            other = 0
        }
        max_one_core_percent_by_role = [pscustomobject]@{
            musu = 0.1
            node = 0.0
            webview2 = 0.2
            other = 0.0
        }
        max_one_core_percent_by_subrole = [pscustomobject]@{
            musu_runtime = 0.0
            bridge_runtime = 0.1
            desktop_shell = 0.0
            node_helper = 0.0
            webview2_helper = 0.2
            other = 0.0
        }
        total_working_set_mb_after = $WorkingSetMb
        total_private_memory_mb_after = 320.0
        resource_budget_violations = @()
        hot_process_count = 0
        cpu_attribution = [pscustomobject]@{
            schema = "musu.runtime_idle_cpu_attribution.v1"
            attribution_scope = "musu_process_tree_or_repo_related"
            sample_count = 3
            roles_observed = @("musu", "webview2")
            subroles_observed = @("bridge_runtime", "desktop_shell", "webview2_helper")
            sample_count_by_role = [pscustomobject]@{
                musu = 2
                node = 0
                webview2 = 1
                other = 0
            }
            sample_count_by_subrole = [pscustomobject]@{
                musu_runtime = 0
                bridge_runtime = 1
                desktop_shell = 1
                node_helper = 0
                webview2_helper = 1
                other = 0
            }
            total_cpu_seconds_by_role = [pscustomobject]@{
                musu = 0.01
                node = 0.0
                webview2 = 0.02
                other = 0.0
            }
            total_cpu_seconds_by_subrole = [pscustomobject]@{
                musu_runtime = 0.0
                bridge_runtime = 0.01
                desktop_shell = 0.0
                node_helper = 0.0
                webview2_helper = 0.02
                other = 0.0
            }
            max_one_core_percent_by_role = [pscustomobject]@{
                musu = 0.1
                node = 0.0
                webview2 = 0.2
                other = 0.0
            }
            max_one_core_percent_by_subrole = [pscustomobject]@{
                musu_runtime = 0.0
                bridge_runtime = 0.1
                desktop_shell = 0.0
                node_helper = 0.0
                webview2_helper = 0.2
                other = 0.0
            }
            top_processes = @(
                [pscustomobject]@{
                    id = 1234
                    process_name = "musu"
                    process_role = "musu"
                    process_subrole = "bridge_runtime"
                    bridge_registry_pid_match = $true
                    cpu_seconds_delta = 0.01
                    cpu_pct_one_core = 0.1
                    parent_process_id = 4321
                    ownership_classification = "musu_process_name"
                    command_line_hash = "fixture"
                    command_line_hint = "musu"
                },
                [pscustomobject]@{
                    id = 5678
                    process_name = "msedgewebview2"
                    process_role = "webview2"
                    process_subrole = "webview2_helper"
                    bridge_registry_pid_match = $false
                    cpu_seconds_delta = 0.02
                    cpu_pct_one_core = 0.2
                    parent_process_id = 1234
                    ownership_classification = "owned_by_musu_process_tree"
                    command_line_hash = "fixture"
                    command_line_hint = "msedgewebview2"
                }
            )
            required_roles_present = [pscustomobject]@{
                musu = $true
                webview2 = ($WebView2Count -gt 0)
            }
            required_subroles_present = [pscustomobject]@{
                bridge_runtime = $true
                desktop_shell = $true
                webview2_helper = ($WebView2Count -gt 0)
            }
        }
    }

    if ($OmitResourceBudgetViolations) {
        $measurement.PSObject.Properties.Remove("resource_budget_violations")
    }
    if ($OmitCpuAttribution) {
        $measurement.PSObject.Properties.Remove("cpu_attribution")
    }

    return $measurement
}

$validRuntimeCpuMatrix = [pscustomobject]@{
    schema = "musu.runtime_cpu_scenario_matrix.v1"
    ok = $true
    version = $ExpectedVersion
    git_commit = (& git -C $repoRoot rev-parse HEAD 2>$null | Out-String).Trim()
    git_dirty = $false
    started_at = $now.AddSeconds(-240).ToString("yyyyMMdd-HHmmss")
    completed_at = $now.ToString("o")
    operator_machine = "VERIFIER-TEST"
    operator_user = "verifier-test"
    musu_exe = "C:\Users\verifier\AppData\Local\Microsoft\WindowsApps\musu.exe"
    allow_developer_runtime = $false
    musu_exe_release_identity = $true
    sample_seconds = 60
    max_one_core_percent = 5.0
    max_owned_process_count = 16
    max_owned_webview2_process_count = 8
    max_total_working_set_mb = 1024.0
    requested_scenarios = @("startup-open", "runtime-started", "dashboard-open", "desktop-open", "post-route")
    route_probe = [pscustomobject]@{
        ok = $true
        expected_token = "MUSU_CPU_SCENARIO_ROUTE_OK_VERIFIER_TEST"
        target = $null
        command = "musu route --wait `"Reply exactly: MUSU_CPU_SCENARIO_ROUTE_OK_VERIFIER_TEST`""
        arguments = @("route", "--wait", "Reply exactly: MUSU_CPU_SCENARIO_ROUTE_OK_VERIFIER_TEST")
        exit_code = 0
        stdout = "MUSU_CPU_SCENARIO_ROUTE_OK_VERIFIER_TEST"
        stderr = ""
        output = "MUSU_CPU_SCENARIO_ROUTE_OK_VERIFIER_TEST"
        failure_allowed = $false
    }
    fail_count = 0
    scenarios = @(
        [pscustomobject]@{
            scenario = "startup-open"
            preparation = [pscustomobject]@{ action = "Start packaged desktop app"; desktop_app_id = "Yellowhama.MUSU_ygcjq669as2b6!MUSU"; sample_delay_seconds = 2.0 }
            measurement = (New-RuntimeMeasurement)
        },
        [pscustomobject]@{
            scenario = "runtime-started"
            preparation = [pscustomobject]@{ action = "musu up --json" }
            measurement = (New-RuntimeMeasurement)
        },
        [pscustomobject]@{
            scenario = "dashboard-open"
            preparation = [pscustomobject]@{ action = "Start-Process DashboardUrl"; dashboard_url = "http://127.0.0.1:3000" }
            measurement = (New-RuntimeMeasurement)
        },
        [pscustomobject]@{
            scenario = "desktop-open"
            preparation = [pscustomobject]@{ action = "Start packaged desktop app"; desktop_app_id = "Yellowhama.MUSU_ygcjq669as2b6!MUSU" }
            measurement = (New-RuntimeMeasurement)
        },
        [pscustomobject]@{
            scenario = "post-route"
            preparation = [pscustomobject]@{ action = "musu route --wait"; route_probe = $null }
            measurement = (New-RuntimeMeasurement)
        }
    )
}

function New-MsixInstallEvidence {
    param(
        [switch]$Shadowed,
        [switch]$WarningMode
    )

    $aliasPath = "C:\Users\verifier\AppData\Local\Microsoft\WindowsApps\musu.exe"
    $shadowPath = "C:\Users\verifier\.cargo\bin\musu.exe"
    $requiredChecks = @(
        "artifact path",
        "package identity",
        "installed package",
        "musu exe",
        "startup exe",
        "installed manifest",
        "installed alias contract",
        "installed startup contract",
        "artifact contract match",
        "version match",
        "windowsapps alias file",
        "windowsapps alias discoverable",
        "alias not shadowed",
        "legacy startup conflicts",
        "legacy alias shadowing"
    )

    [pscustomobject]@{
        schema = "musu.msix_install_evidence.v1"
        ok = $true
        version = $ExpectedVersion
        startup_contract = "local-sideload-manual"
        recorded_at = $now.ToString("o")
        operator_machine = "VERIFIER-TEST"
        operator_user = "verifier-test"
        package_path = "F:\workspace\musu-bee\.local-build\msix\output\musu_1.15.0.0_x64_local-sideload-manual.msix"
        package_name = "Yellowhama.MUSU"
        artifact_version = "1.15.0.0"
        package_full_name = "Yellowhama.MUSU_1.15.0.0_x64__ygcjq669as2b6"
        installed_version = "1.15.0.0"
        install_location = "C:\Program Files\WindowsApps\Yellowhama.MUSU_1.15.0.0_x64__ygcjq669as2b6"
        startup_task_id = "MusuBridgeStartup"
        startup_enabled = "true"
        startup_immediate_registration = "false"
        non_user_configurable_startup_capability = $false
        run_full_trust = $true
        artifact_contract_match = $true
        windowsapps_alias_present = $true
        alias_visible_in_get_command = $true
        windowsapps_alias_invocation = "& `"$aliasPath`""
        first_alias_path = if ($Shadowed) { $shadowPath } else { $aliasPath }
        alias_shadowed_by = if ($Shadowed) { $shadowPath } else { $null }
        alias_shadowing_mode = if ($WarningMode) { "warn-explicit-windowsapps" } else { "fail" }
        alias_shadowing_accepted = [bool]($Shadowed -and $WarningMode)
        alias_resolution_order = if ($Shadowed) { @($shadowPath, $aliasPath) } else { @($aliasPath) }
        alternate_alias_count = if ($Shadowed) { 1 } else { 0 }
        alternate_alias_sources = if ($Shadowed) { @($shadowPath) } else { @() }
        alias_remediation = if ($Shadowed) { "Move WindowsApps before the shadowing PATH entry." } else { $null }
        start_menu_entry = $true
        expected_start_app_id = "Yellowhama.MUSU_ygcjq669as2b6!MUSU"
        startup_conflict_count = 0
        alias_shadowing_count = if ($Shadowed) { 1 } else { 0 }
        legacy_conflict_count = if ($Shadowed) { 1 } else { 0 }
        legacy_startup_helpers = ""
        legacy_scheduled_tasks = ""
        legacy_bins = ""
        fail_count = 0
        checks = @($requiredChecks | ForEach-Object {
            [pscustomobject]@{
                name = $_
                status = "pass"
                message = "fixture check passed"
            }
        })
        error = $null
    }
}

$cases = New-Object System.Collections.Generic.List[object]

$freshnessClassifierScripts = @(
    $singleMachineVerifier,
    $runtimeCpuScenarioMatrixVerifier,
    $releaseGoNoGoWriter
)
foreach ($classifierScript in $freshnessClassifierScripts) {
    $classifierOk = Test-TestSourceFilesAllowedAsStatusOnly -ScriptPath $classifierScript
    $classifierName = [System.IO.Path]::GetFileName($classifierScript)
    $invocation = New-StaticVerifierInvocation `
        -Ok $classifierOk `
        -Message "test/spec source files must be freshness status-only in $classifierName"
    Add-CaseResult `
        -Cases $cases `
        -Name "freshness classifier allows test-only source files in $classifierName" `
        -Verifier "release freshness classifier contract" `
        -FixturePath $classifierScript `
        -ShouldPass $true `
        -Invocation $invocation

    $controlPlaneClassifierOk = Test-ControlPlaneOnlySourceFilesAllowedAsStatusOnly -ScriptPath $classifierScript
    $invocation = New-StaticVerifierInvocation `
        -Ok $controlPlaneClassifierOk `
        -Message "server-only P2P control-plane source files must not stale local-runtime CPU evidence in $classifierName"
    Add-CaseResult `
        -Cases $cases `
        -Name "freshness classifier allows server-only P2P control-plane files in $classifierName" `
        -Verifier "release freshness classifier contract" `
        -FixturePath $classifierScript `
        -ShouldPass $true `
        -Invocation $invocation
}

$runtimeCpuMeasureScript = Join-Path $scriptDir "measure-musu-runtime-cpu-scenarios.ps1"
$routeProbeContractOk = Test-RuntimeCpuScenarioMatrixRouteProbeContract -ScriptPath $runtimeCpuMeasureScript
$invocation = New-StaticVerifierInvocation `
    -Ok $routeProbeContractOk `
    -Message "runtime CPU matrix route probe must use its own wait timeout, pass --wait-timeout-sec, and fail fast on token-mismatched success prompts"
Add-CaseResult `
    -Cases $cases `
    -Name "runtime CPU matrix route probe timeout and prompt contract" `
    -Verifier "runtime CPU matrix source contract" `
    -FixturePath $runtimeCpuMeasureScript `
    -ShouldPass $true `
    -Invocation $invocation

$secondPcRouteTimeoutPassThroughOk = Test-SecondPcRuntimeCpuRouteWaitTimeoutPassThrough -ScriptPath (Join-Path $scriptDir "run-second-pc-release-check.ps1")
$invocation = New-StaticVerifierInvocation `
    -Ok $secondPcRouteTimeoutPassThroughOk `
    -Message "second-PC release check must pass the runtime CPU route wait timeout through to the matrix capture"
Add-CaseResult `
    -Cases $cases `
    -Name "second-PC runtime CPU route wait timeout pass-through" `
    -Verifier "second-PC release check source contract" `
    -FixturePath (Join-Path $scriptDir "run-second-pc-release-check.ps1") `
    -ShouldPass $true `
    -Invocation $invocation

$secondPcImportSubroleContractOk = Test-SecondPcImportRuntimeCpuSubroleContract -ScriptPath (Join-Path $scriptDir "import-second-pc-return.ps1")
$invocation = New-StaticVerifierInvocation `
    -Ok $secondPcImportSubroleContractOk `
    -Message "second-PC return import must reject release-gate CPU evidence without current bridge/desktop/WebView2 subrole attribution"
Add-CaseResult `
    -Cases $cases `
    -Name "second-PC return import requires runtime CPU subrole contract" `
    -Verifier "second-PC import source contract" `
    -FixturePath (Join-Path $scriptDir "import-second-pc-return.ps1") `
    -ShouldPass $true `
    -Invocation $invocation

$runtimeCpuGoNoGoMatrixSelectionOk = Test-RuntimeCpuGoNoGoMatrixSelectionContract -ScriptPath $releaseGoNoGoWriter
$invocation = New-StaticVerifierInvocation `
    -Ok $runtimeCpuGoNoGoMatrixSelectionOk `
    -Message "go/no-go must evaluate full runtime matrices and post-route-only targeted attempts independently"
Add-CaseResult `
    -Cases $cases `
    -Name "go-no-go separates full runtime matrix and targeted route attempt selection" `
    -Verifier "runtime CPU matrix source contract" `
    -FixturePath $releaseGoNoGoWriter `
    -ShouldPass $true `
    -Invocation $invocation

$runtimeIdleCpuGoNoGoFullRoleAttributionOk = Test-RuntimeIdleCpuGoNoGoFullRoleAttributionContract -ScriptPath $releaseGoNoGoWriter
$invocation = New-StaticVerifierInvocation `
    -Ok $runtimeIdleCpuGoNoGoFullRoleAttributionOk `
    -Message "go/no-go runtime idle CPU evidence must require MUSU/node/WebView2/other role attribution fields"
Add-CaseResult `
    -Cases $cases `
    -Name "go-no-go runtime idle CPU requires full role attribution" `
    -Verifier "runtime idle CPU source contract" `
    -FixturePath $releaseGoNoGoWriter `
    -ShouldPass $true `
    -Invocation $invocation

$idleBusyLoopCandidateStatusContractOk = Test-IdleBusyLoopGoNoGoCandidateStatusContract -ScriptPath $releaseGoNoGoWriter
$invocation = New-StaticVerifierInvocation `
    -Ok $idleBusyLoopCandidateStatusContractOk `
    -Message "go/no-go must expose all eight idle busy-loop candidate statuses and block if any candidate is not proven"
Add-CaseResult `
    -Cases $cases `
    -Name "go-no-go exposes all idle busy-loop candidate statuses" `
    -Verifier "idle busy-loop source contract" `
    -FixturePath $releaseGoNoGoWriter `
    -ShouldPass $true `
    -Invocation $invocation

$rustBackgroundWatcherScopeContractOk = Test-RustBackgroundFilesystemWatcherScopeContract -ScriptPath (Join-Path $scriptDir "audit-rust-background-loop-contract.ps1")
$invocation = New-StaticVerifierInvocation `
    -Ok $rustBackgroundWatcherScopeContractOk `
    -Message "Rust background-loop audit must keep filesystem watchers scoped to explicit indexer/sync surfaces and out of the default bridge path"
Add-CaseResult `
    -Cases $cases `
    -Name "rust background audit limits filesystem watcher scope" `
    -Verifier "rust background loop source contract" `
    -FixturePath (Join-Path $scriptDir "audit-rust-background-loop-contract.ps1") `
    -ShouldPass $true `
    -Invocation $invocation

$rustBackgroundNetworkWatcherScopeContractOk = Test-RustBackgroundNetworkWatcherScopeContract -ScriptPath (Join-Path $scriptDir "audit-rust-background-loop-contract.ps1")
$invocation = New-StaticVerifierInvocation `
    -Ok $rustBackgroundNetworkWatcherScopeContractOk `
    -Message "Rust background-loop audit must keep network watcher/poller primitives scoped to explicit CLI, opt-in, low-duty, or request-scoped surfaces"
Add-CaseResult `
    -Cases $cases `
    -Name "rust background audit limits network watcher scope" `
    -Verifier "rust background loop source contract" `
    -FixturePath (Join-Path $scriptDir "audit-rust-background-loop-contract.ps1") `
    -ShouldPass $true `
    -Invocation $invocation

$degradedModeAuditSourceContractOk = Test-DegradedModeAuditSourceContract -ScriptPath (Join-Path $scriptDir "audit-degraded-mode-contract.ps1")
$invocation = New-StaticVerifierInvocation `
    -Ok $degradedModeAuditSourceContractOk `
    -Message "degraded-mode audit must verify unavailable, stale, fallback, and UI degraded-state exposure"
Add-CaseResult `
    -Cases $cases `
    -Name "degraded mode audit covers unavailable stale fallback surfaces" `
    -Verifier "degraded mode source contract" `
    -FixturePath (Join-Path $scriptDir "audit-degraded-mode-contract.ps1") `
    -ShouldPass $true `
    -Invocation $invocation

$degradedModeGoNoGoContractOk = Test-DegradedModeGoNoGoContract -ScriptPath $releaseGoNoGoWriter
$invocation = New-StaticVerifierInvocation `
    -Ok $degradedModeGoNoGoContractOk `
    -Message "go/no-go must block on the degraded mode contract audit and expose degraded_mode_contract_verified"
Add-CaseResult `
    -Cases $cases `
    -Name "go-no-go blocks on degraded mode contract" `
    -Verifier "degraded mode source contract" `
    -FixturePath $releaseGoNoGoWriter `
    -ShouldPass $true `
    -Invocation $invocation

$degradedModeStatusOnlyContractOk = Test-DegradedModeFreshnessStatusOnlyContract -ScriptPaths @(
    $singleMachineVerifier,
    $runtimeCpuScenarioMatrixVerifier,
    $releaseGoNoGoWriter
)
$invocation = New-StaticVerifierInvocation `
    -Ok $degradedModeStatusOnlyContractOk `
    -Message "release freshness classifiers must treat the degraded-mode audit script as status-only"
Add-CaseResult `
    -Cases $cases `
    -Name "freshness classifiers allow degraded mode audit script as status-only" `
    -Verifier "release freshness classifier contract" `
    -FixturePath $releaseGoNoGoWriter `
    -ShouldPass $true `
    -Invocation $invocation

$externalGateRecheckActionableContractOk = Test-ExternalGateRecheckActionableContract -ScriptPath $externalGateRecheckRecorder
$invocation = New-StaticVerifierInvocation `
    -Ok $externalGateRecheckActionableContractOk `
    -Message "external release-gate recheck must flatten public metadata, second-PC reachability, and P2P control-plane root-cause fields"
Add-CaseResult `
    -Cases $cases `
    -Name "external gate recheck exposes actionable root-cause fields" `
    -Verifier "external gate recheck source contract" `
    -FixturePath $externalGateRecheckRecorder `
    -ShouldPass $true `
    -Invocation $invocation

$p2pEnvStatusRuntimeLoginActionContractOk = Test-P2pEnvStatusRuntimeLoginActionContract -ScriptPath $p2pEnvStatusReporter
$invocation = New-StaticVerifierInvocation `
    -Ok $p2pEnvStatusRuntimeLoginActionContractOk `
    -Message "P2P env status must expose runtime logged-in state and packaged-login remediation"
Add-CaseResult `
    -Cases $cases `
    -Name "P2P env status exposes runtime login remediation" `
    -Verifier "P2P env status source contract" `
    -FixturePath $p2pEnvStatusReporter `
    -ShouldPass $true `
    -Invocation $invocation

$fixture = Write-Fixture -Name "single-machine-valid-bridge-only-packaged-runtime" -Object $validBridgeOnlySingleMachine
$invocation = Invoke-Verifier -ScriptPath $singleMachineVerifier -Arguments @("-EvidencePath", $fixture, "-ExpectedVersion", $ExpectedVersion, "-ExpectedGitCommit", $currentGitCommit, "-Json")
Add-CaseResult -Cases $cases -Name "single-machine accepts packaged bridge-only local runtime evidence" -Verifier "verify-single-machine-evidence.ps1" -FixturePath $fixture -ShouldPass $true -Invocation $invocation

$badSingleMachineDevDashboard = Copy-JsonObject -Object $validBridgeOnlySingleMachine
$badSingleMachineDevDashboard.dashboard_required = $true
$badSingleMachineDevDashboard.single_machine_surface = "dashboard"
$badSingleMachineDevDashboard.dashboard_base_url = "http://127.0.0.1:3001"
$badSingleMachineDevDashboard.dashboard_base_url_source = "musu up.dashboard.reachable_url"
$badSingleMachineDevDashboard.dashboard_reachable_url = "http://127.0.0.1:3001/app"
$badSingleMachineDevDashboard.device_node_count = 1
$badSingleMachineDevDashboard.dashboard_task_id = "dev-dashboard-task"
$badSingleMachineDevDashboard.dashboard_task_status = "done"
$badSingleMachineDevDashboard.expected_dashboard_output = "MUSU_RELEASE_SMOKE_OK_VERIFIER_TEST"
$badSingleMachineDevDashboard.dashboard_output = "MUSU_RELEASE_SMOKE_OK_VERIFIER_TEST"
$badSingleMachineDevDashboard.sse_status_code = 200
$badSingleMachineDevDashboard.sse_content_type = "text/event-stream"
$fixture = Write-Fixture -Name "single-machine-bad-dev-dashboard-3001" -Object $badSingleMachineDevDashboard
$invocation = Invoke-Verifier -ScriptPath $singleMachineVerifier -Arguments @("-EvidencePath", $fixture, "-ExpectedVersion", $ExpectedVersion, "-ExpectedGitCommit", $currentGitCommit, "-Json")
Add-CaseResult -Cases $cases -Name "single-machine rejects packaged evidence tied to dev dashboard 3001" -Verifier "verify-single-machine-evidence.ps1" -FixturePath $fixture -ShouldPass $false -Invocation $invocation

$fixture = Write-Fixture -Name "msix-valid-clean-alias" -Object (New-MsixInstallEvidence)
$invocation = Invoke-Verifier -ScriptPath $msixVerifier -Arguments @("-EvidencePath", $fixture, "-ExpectedVersion", $ExpectedVersion, "-Json")
Add-CaseResult -Cases $cases -Name "msix accepts clean WindowsApps alias evidence by default" -Verifier "verify-msix-install-evidence.ps1" -FixturePath $fixture -ShouldPass $true -Invocation $invocation

$fixture = Write-Fixture -Name "msix-shadow-warning-default-reject" -Object (New-MsixInstallEvidence -Shadowed -WarningMode)
$invocation = Invoke-Verifier -ScriptPath $msixVerifier -Arguments @("-EvidencePath", $fixture, "-ExpectedVersion", $ExpectedVersion, "-Json")
Add-CaseResult -Cases $cases -Name "msix rejects developer alias shadow warning evidence by default" -Verifier "verify-msix-install-evidence.ps1" -FixturePath $fixture -ShouldPass $false -Invocation $invocation

$fixture = Write-Fixture -Name "msix-shadow-warning-explicit-accept" -Object (New-MsixInstallEvidence -Shadowed -WarningMode)
$invocation = Invoke-Verifier -ScriptPath $msixVerifier -Arguments @("-EvidencePath", $fixture, "-ExpectedVersion", $ExpectedVersion, "-AliasShadowingMode", "warn-explicit-windowsapps", "-Json")
Add-CaseResult -Cases $cases -Name "msix accepts developer alias shadow warning only with explicit verifier mode" -Verifier "verify-msix-install-evidence.ps1" -FixturePath $fixture -ShouldPass $true -Invocation $invocation

$fixture = Write-Fixture -Name "p2p-valid" -Object $validP2p
$invocation = Invoke-Verifier -ScriptPath $p2pVerifier -Arguments @("-EvidencePath", $fixture, "-ExpectedVersion", $ExpectedVersion, "-ExpectedBaseUrl", "https://musu.pro", "-Json")
Add-CaseResult -Cases $cases -Name "p2p accepts release-grade hosted control-plane evidence" -Verifier "verify-p2p-control-plane-evidence.ps1" -FixturePath $fixture -ShouldPass $true -Invocation $invocation

$badP2pRelayTransportKind = Copy-JsonObject -Object $validP2p
$badP2pRelayTransportKind.relay_transport.relay_transport_kind = "websocket_tunnel"
$fixture = Write-Fixture -Name "p2p-bad-relay-transport-kind" -Object $badP2pRelayTransportKind
$invocation = Invoke-Verifier -ScriptPath $p2pVerifier -Arguments @("-EvidencePath", $fixture, "-ExpectedVersion", $ExpectedVersion, "-ExpectedBaseUrl", "https://musu.pro", "-Json")
Add-CaseResult -Cases $cases -Name "p2p rejects non-release relay transport kind" -Verifier "verify-p2p-control-plane-evidence.ps1" -FixturePath $fixture -ShouldPass $false -Invocation $invocation

$badP2pBaseUrl = Copy-JsonObject -Object $validP2p
$badP2pBaseUrl.base_url = "https://example.invalid"
$fixture = Write-Fixture -Name "p2p-bad-base-url" -Object $badP2pBaseUrl
$invocation = Invoke-Verifier -ScriptPath $p2pVerifier -Arguments @("-EvidencePath", $fixture, "-ExpectedVersion", $ExpectedVersion, "-ExpectedBaseUrl", "https://musu.pro", "-Json")
Add-CaseResult -Cases $cases -Name "p2p rejects non-musu.pro base_url" -Verifier "verify-p2p-control-plane-evidence.ps1" -FixturePath $fixture -ShouldPass $false -Invocation $invocation

$badP2pOwnerScope = Copy-JsonObject -Object $validP2p
$badP2pOwnerScope.relay_leases.owner_scope_verified = $false
$fixture = Write-Fixture -Name "p2p-bad-owner-scope" -Object $badP2pOwnerScope
$invocation = Invoke-Verifier -ScriptPath $p2pVerifier -Arguments @("-EvidencePath", $fixture, "-ExpectedVersion", $ExpectedVersion, "-ExpectedBaseUrl", "https://musu.pro", "-Json")
Add-CaseResult -Cases $cases -Name "p2p rejects unverified owner scope" -Verifier "verify-p2p-control-plane-evidence.ps1" -FixturePath $fixture -ShouldPass $false -Invocation $invocation

$badP2pStore = Copy-JsonObject -Object $validP2p
$badP2pStore.relay_status.relay_transport_preflight_ok = $false
$badP2pStore.relay_status.relay_lease_store_configured = $false
$badP2pStore.relay_status.relay_lease_store_backend = "unconfigured"
$badP2pStore.relay_status.relay_lease_store_release_grade = $false
$badP2pStore.relay_status.relay_transport_blockers = @("relay_lease_store_not_configured", "relay_lease_store_not_release_grade")
$badP2pStore.relay_transport.relay_lease_store_configured = $false
$badP2pStore.relay_transport.relay_lease_store_backend = "unconfigured"
$badP2pStore.relay_transport.relay_lease_store_release_grade = $false
$badP2pStore.relay_leases.relay_lease_store_configured = $false
$badP2pStore.relay_leases.relay_lease_store_backend = "unconfigured"
$badP2pStore.relay_leases.relay_lease_store_release_grade = $false
$fixture = Write-Fixture -Name "p2p-bad-store" -Object $badP2pStore
$invocation = Invoke-Verifier -ScriptPath $p2pVerifier -Arguments @("-EvidencePath", $fixture, "-ExpectedVersion", $ExpectedVersion, "-ExpectedBaseUrl", "https://musu.pro", "-Json")
Add-CaseResult -Cases $cases -Name "p2p rejects unconfigured relay lease storage" -Verifier "verify-p2p-control-plane-evidence.ps1" -FixturePath $fixture -ShouldPass $false -Invocation $invocation

$badP2pDefaultRelay = Copy-JsonObject -Object $validP2p
$badP2pDefaultRelay.relay_status.relay_default_data_path = $true
$badP2pDefaultRelay.relay_transport.relay_default_data_path = $true
$badP2pDefaultRelay.relay_leases.relay_default_data_path = $true
$fixture = Write-Fixture -Name "p2p-bad-default-relay" -Object $badP2pDefaultRelay
$invocation = Invoke-Verifier -ScriptPath $p2pVerifier -Arguments @("-EvidencePath", $fixture, "-ExpectedVersion", $ExpectedVersion, "-ExpectedBaseUrl", "https://musu.pro", "-Json")
Add-CaseResult -Cases $cases -Name "p2p rejects relay as default data path" -Verifier "verify-p2p-control-plane-evidence.ps1" -FixturePath $fixture -ShouldPass $false -Invocation $invocation

$badP2pRelayTransport = Copy-JsonObject -Object $validP2p
$badP2pRelayTransport.relay_status.relay_transport_preflight_ok = $false
$badP2pRelayTransport.relay_status.relay_transport_wired = $false
$badP2pRelayTransport.relay_status.relay_payload_endpoint_wired = $false
$badP2pRelayTransport.relay_status.relay_transport_blockers = @("relay_transport_not_wired", "relay_payload_endpoint_not_wired")
$badP2pRelayTransport.relay_transport.ok = $false
$badP2pRelayTransport.relay_transport.relay_transport_wired = $false
$badP2pRelayTransport.relay_transport.relay_payload_endpoint_wired = $false
$badP2pRelayTransport.relay_transport.blockers = @("relay_transport_not_wired", "relay_payload_endpoint_not_wired")
$badP2pRelayTransport.relay_leases.relay_transport_wired = $false
$fixture = Write-Fixture -Name "p2p-bad-relay-transport" -Object $badP2pRelayTransport
$invocation = Invoke-Verifier -ScriptPath $p2pVerifier -Arguments @("-EvidencePath", $fixture, "-ExpectedVersion", $ExpectedVersion, "-ExpectedBaseUrl", "https://musu.pro", "-Json")
Add-CaseResult -Cases $cases -Name "p2p rejects lease-only relay without payload transport" -Verifier "verify-p2p-control-plane-evidence.ps1" -FixturePath $fixture -ShouldPass $false -Invocation $invocation

$badP2pRelayConnectEndpoint = Copy-JsonObject -Object $validP2p
$badP2pRelayConnectEndpoint.relay_status.relay_connect_endpoint_wired = $false
$badP2pRelayConnectEndpoint.relay_transport.relay_connect_endpoint_wired = $false
$fixture = Write-Fixture -Name "p2p-bad-relay-connect-endpoint" -Object $badP2pRelayConnectEndpoint
$invocation = Invoke-Verifier -ScriptPath $p2pVerifier -Arguments @("-EvidencePath", $fixture, "-ExpectedVersion", $ExpectedVersion, "-ExpectedBaseUrl", "https://musu.pro", "-Json")
Add-CaseResult -Cases $cases -Name "p2p rejects relay transport without connect endpoint" -Verifier "verify-p2p-control-plane-evidence.ps1" -FixturePath $fixture -ShouldPass $false -Invocation $invocation

$badP2pRelayPayloadProof = Copy-JsonObject -Object $validP2p
$badP2pRelayPayloadProofRecord = @($badP2pRelayPayloadProof.relay_route_evidence.records)[0]
$badP2pRelayPayloadProofRecord.evidence.relay_payload_delivery_proof = $null
$fixture = Write-Fixture -Name "p2p-bad-relay-payload-proof" -Object $badP2pRelayPayloadProof
$invocation = Invoke-Verifier -ScriptPath $p2pVerifier -Arguments @("-EvidencePath", $fixture, "-ExpectedVersion", $ExpectedVersion, "-ExpectedBaseUrl", "https://musu.pro", "-Json")
Add-CaseResult -Cases $cases -Name "p2p rejects relay route evidence without payload delivery proof" -Verifier "verify-p2p-control-plane-evidence.ps1" -FixturePath $fixture -ShouldPass $false -Invocation $invocation

$badP2pRelayRouteEvidence = Copy-JsonObject -Object $validP2p
$badP2pRelayRouteEvidence.relay_route_evidence.ok = $false
$badP2pRelayRouteEvidence.relay_route_evidence.relay_transport_proven = $false
$badP2pRelayRouteEvidence.relay_route_evidence.count = 0
$badP2pRelayRouteEvidence.relay_route_evidence.records = @()
$fixture = Write-Fixture -Name "p2p-bad-relay-route-evidence" -Object $badP2pRelayRouteEvidence
$invocation = Invoke-Verifier -ScriptPath $p2pVerifier -Arguments @("-EvidencePath", $fixture, "-ExpectedVersion", $ExpectedVersion, "-ExpectedBaseUrl", "https://musu.pro", "-Json")
Add-CaseResult -Cases $cases -Name "p2p rejects relay transport flag without release-grade relay route evidence" -Verifier "verify-p2p-control-plane-evidence.ps1" -FixturePath $fixture -ShouldPass $false -Invocation $invocation

$fixture = Write-Fixture -Name "multidevice-valid" -Object $validMultiDevice
$invocation = Invoke-Verifier -ScriptPath $multiDeviceVerifier -Arguments @("-EvidencePath", $fixture, "-ExpectedVersion", $ExpectedVersion, "-Json")
Add-CaseResult -Cases $cases -Name "multidevice accepts release-grade direct QUIC route evidence" -Verifier "verify-multidevice-evidence.ps1" -FixturePath $fixture -ShouldPass $true -Invocation $invocation

$missingRouteExplain = Copy-JsonObject -Object $validMultiDevice
$missingRouteExplain.route_explain = $null
$missingRouteExplain.commands = @($missingRouteExplain.commands | Where-Object { ([string]$_.command) -notmatch '(^|\s)--explain(\s|$)' })
$fixture = Write-Fixture -Name "multidevice-missing-route-explain" -Object $missingRouteExplain
$invocation = Invoke-Verifier -ScriptPath $multiDeviceVerifier -Arguments @("-EvidencePath", $fixture, "-ExpectedVersion", $ExpectedVersion, "-Json")
Add-CaseResult -Cases $cases -Name "multidevice rejects missing route explain path-selection evidence" -Verifier "verify-multidevice-evidence.ps1" -FixturePath $fixture -ShouldPass $false -Invocation $invocation

$badRouteTransport = Copy-JsonObject -Object $validMultiDevice
$badRouteTransport.route_evidence.transport_verified_by = "musu_bridge_forward_fingerprint_pinned_client"
$fixture = Write-Fixture -Name "multidevice-bad-transport-proof" -Object $badRouteTransport
$invocation = Invoke-Verifier -ScriptPath $multiDeviceVerifier -Arguments @("-EvidencePath", $fixture, "-ExpectedVersion", $ExpectedVersion, "-Json")
Add-CaseResult -Cases $cases -Name "multidevice rejects non-release-grade transport proof" -Verifier "verify-multidevice-evidence.ps1" -FixturePath $fixture -ShouldPass $false -Invocation $invocation

$badRouteKind = Copy-JsonObject -Object $validMultiDevice
$badRouteKind.route_evidence.route_kind = "failed"
$badRouteKind.route_evidence.result = "failed"
$fixture = Write-Fixture -Name "multidevice-bad-route-kind" -Object $badRouteKind
$invocation = Invoke-Verifier -ScriptPath $multiDeviceVerifier -Arguments @("-EvidencePath", $fixture, "-ExpectedVersion", $ExpectedVersion, "-Json")
Add-CaseResult -Cases $cases -Name "multidevice rejects failed route_kind" -Verifier "verify-multidevice-evidence.ps1" -FixturePath $fixture -ShouldPass $false -Invocation $invocation

$badRouteKindCandidateAddr = Copy-JsonObject -Object $validMultiDevice
$badRouteKindCandidateAddr.route_explain.selected_candidate.route_kind = "lan"
$badRouteKindCandidateAddr.route_evidence.route_kind = "lan"
$badRouteKindCandidateAddr.route_evidence.candidate_addr = "203.0.113.2:8949"
$fixture = Write-Fixture -Name "multidevice-bad-route-kind-candidate-addr" -Object $badRouteKindCandidateAddr
$invocation = Invoke-Verifier -ScriptPath $multiDeviceVerifier -Arguments @("-EvidencePath", $fixture, "-ExpectedVersion", $ExpectedVersion, "-Json")
Add-CaseResult -Cases $cases -Name "multidevice rejects route_kind candidate_addr mismatch" -Verifier "verify-multidevice-evidence.ps1" -FixturePath $fixture -ShouldPass $false -Invocation $invocation

$badDirectTransit = Copy-JsonObject -Object $validMultiDevice
$badDirectTransit.route_evidence.payload_transited_musu_infra = $true
$fixture = Write-Fixture -Name "multidevice-bad-direct-transit" -Object $badDirectTransit
$invocation = Invoke-Verifier -ScriptPath $multiDeviceVerifier -Arguments @("-EvidencePath", $fixture, "-ExpectedVersion", $ExpectedVersion, "-Json")
Add-CaseResult -Cases $cases -Name "multidevice rejects direct route that claims MUSU infra payload transit" -Verifier "verify-multidevice-evidence.ps1" -FixturePath $fixture -ShouldPass $false -Invocation $invocation

$badRelayTransit = Copy-JsonObject -Object $validMultiDevice
$badRelayTransit.route_evidence.route_kind = "relay"
$badRelayTransit.route_evidence.payload_transited_musu_infra = $false
$fixture = Write-Fixture -Name "multidevice-bad-relay-transit" -Object $badRelayTransit
$invocation = Invoke-Verifier -ScriptPath $multiDeviceVerifier -Arguments @("-EvidencePath", $fixture, "-ExpectedVersion", $ExpectedVersion, "-Json")
Add-CaseResult -Cases $cases -Name "multidevice rejects relay route without MUSU infra payload transit" -Verifier "verify-multidevice-evidence.ps1" -FixturePath $fixture -ShouldPass $false -Invocation $invocation

$fixture = Write-Fixture -Name "runtime-matrix-valid" -Object $validRuntimeCpuMatrix
$invocation = Invoke-Verifier -ScriptPath $runtimeCpuScenarioMatrixVerifier -Arguments @("-EvidencePath", $fixture, "-ExpectedVersion", $ExpectedVersion, "-RequiredScenarios", "startup-open,runtime-started,dashboard-open,desktop-open,post-route", "-MinSampleSeconds", "60", "-MaxOneCorePercent", "5", "-RequirePostRouteProbe", "-Json")
Add-CaseResult -Cases $cases -Name "runtime matrix accepts complete resource-budget evidence" -Verifier "verify-runtime-cpu-scenario-matrix.ps1" -FixturePath $fixture -ShouldPass $true -Invocation $invocation

$fixture = Write-Fixture -Name "runtime-matrix-local-route-target-required" -Object $validRuntimeCpuMatrix
$invocation = Invoke-Verifier -ScriptPath $runtimeCpuScenarioMatrixVerifier -Arguments @("-EvidencePath", $fixture, "-ExpectedVersion", $ExpectedVersion, "-RequiredScenarios", "startup-open,runtime-started,dashboard-open,desktop-open,post-route", "-MinSampleSeconds", "60", "-MaxOneCorePercent", "5", "-RequirePostRouteProbe", "-RequirePostRouteTarget", "-Json")
Add-CaseResult -Cases $cases -Name "runtime matrix rejects local post-route when target route attempt is required" -Verifier "verify-runtime-cpu-scenario-matrix.ps1" -FixturePath $fixture -ShouldPass $false -Invocation $invocation

$validRuntimeMatrixWithoutDashboardUrl = Copy-JsonObject -Object $validRuntimeCpuMatrix
foreach ($scenario in @($validRuntimeMatrixWithoutDashboardUrl.scenarios)) {
    if ($scenario.scenario -eq "dashboard-open") {
        $scenario.preparation = [pscustomobject]@{
            action = "none"
            discovery_action = "musu up --json"
            dashboard_url = ""
            dashboard_url_source = "musu_up_dashboard_open"
            note = "DashboardUrl not supplied or discovered; measured current runtime state only."
        }
    }
}
$fixture = Write-Fixture -Name "runtime-matrix-packaged-no-dashboard-url" -Object $validRuntimeMatrixWithoutDashboardUrl
$invocation = Invoke-Verifier -ScriptPath $runtimeCpuScenarioMatrixVerifier -Arguments @("-EvidencePath", $fixture, "-ExpectedVersion", $ExpectedVersion, "-RequiredScenarios", "startup-open,runtime-started,dashboard-open,desktop-open,post-route", "-MinSampleSeconds", "60", "-MaxOneCorePercent", "5", "-RequirePostRouteProbe", "-Json")
Add-CaseResult -Cases $cases -Name "runtime matrix accepts packaged runtime without dashboard URL" -Verifier "verify-runtime-cpu-scenario-matrix.ps1" -FixturePath $fixture -ShouldPass $true -Invocation $invocation

$badRuntimeMatrixMusuExe = Copy-JsonObject -Object $validRuntimeCpuMatrix
$badRuntimeMatrixMusuExe.musu_exe = "F:\workspace\musu-bee\musu-rs\target\debug\musu.exe"
$badRuntimeMatrixMusuExe.musu_exe_release_identity = $false
$fixture = Write-Fixture -Name "runtime-matrix-debug-musu-exe" -Object $badRuntimeMatrixMusuExe
$invocation = Invoke-Verifier -ScriptPath $runtimeCpuScenarioMatrixVerifier -Arguments @("-EvidencePath", $fixture, "-ExpectedVersion", $ExpectedVersion, "-RequiredScenarios", "startup-open,runtime-started,dashboard-open,desktop-open,post-route", "-MinSampleSeconds", "60", "-MaxOneCorePercent", "5", "-RequirePostRouteProbe", "-Json")
Add-CaseResult -Cases $cases -Name "runtime matrix rejects debug MUSU executable identity" -Verifier "verify-runtime-cpu-scenario-matrix.ps1" -FixturePath $fixture -ShouldPass $false -Invocation $invocation

$allowedFailedRuntimeRouteAttempt = Copy-JsonObject -Object $validRuntimeCpuMatrix
$allowedFailedRuntimeRouteAttempt.route_probe = [pscustomobject]@{
    ok = $false
    expected_token = "MUSU_CPU_SCENARIO_ROUTE_OK_VERIFIER_TEST"
    target = "PRIMARY-PC"
    command = "musu route --target PRIMARY-PC --wait `"Reply exactly: MUSU_CPU_SCENARIO_ROUTE_OK_VERIFIER_TEST`""
    arguments = @("route", "--target", "PRIMARY-PC", "--wait", "Reply exactly: MUSU_CPU_SCENARIO_ROUTE_OK_VERIFIER_TEST")
    exit_code = 1
    stdout = ""
    stderr = "route failed: peer not reachable"
    output = "route failed: peer not reachable"
    failure_allowed = $true
}
$allowedFailedRuntimeRouteAttempt.scenarios[4].preparation.action = "musu route --target --wait"
$allowedFailedRuntimeRouteAttempt.scenarios[4].preparation.route_probe = $allowedFailedRuntimeRouteAttempt.route_probe
$fixture = Write-Fixture -Name "runtime-matrix-failed-target-route-attempt-allowed" -Object $allowedFailedRuntimeRouteAttempt
$invocation = Invoke-Verifier -ScriptPath $runtimeCpuScenarioMatrixVerifier -Arguments @("-EvidencePath", $fixture, "-ExpectedVersion", $ExpectedVersion, "-RequiredScenarios", "startup-open,runtime-started,dashboard-open,desktop-open,post-route", "-MinSampleSeconds", "60", "-MaxOneCorePercent", "5", "-RequirePostRouteProbe", "-RequirePostRouteTarget", "-ExpectedPostRouteTarget", "PRIMARY-PC", "-AllowFailedPostRouteProbe", "-Json")
Add-CaseResult -Cases $cases -Name "runtime matrix accepts explicitly allowed failed target route attempt" -Verifier "verify-runtime-cpu-scenario-matrix.ps1" -FixturePath $fixture -ShouldPass $true -Invocation $invocation

$targetMismatchRuntimeRouteAttempt = Copy-JsonObject -Object $allowedFailedRuntimeRouteAttempt
$fixture = Write-Fixture -Name "runtime-matrix-failed-target-route-attempt-target-mismatch" -Object $targetMismatchRuntimeRouteAttempt
$invocation = Invoke-Verifier -ScriptPath $runtimeCpuScenarioMatrixVerifier -Arguments @("-EvidencePath", $fixture, "-ExpectedVersion", $ExpectedVersion, "-RequiredScenarios", "startup-open,runtime-started,dashboard-open,desktop-open,post-route", "-MinSampleSeconds", "60", "-MaxOneCorePercent", "5", "-RequirePostRouteProbe", "-ExpectedPostRouteTarget", "SECOND-PC", "-AllowFailedPostRouteProbe", "-Json")
Add-CaseResult -Cases $cases -Name "runtime matrix rejects allowed failed route attempt for wrong target" -Verifier "verify-runtime-cpu-scenario-matrix.ps1" -FixturePath $fixture -ShouldPass $false -Invocation $invocation

$badRuntimeMatrixStartupPrep = Copy-JsonObject -Object $validRuntimeCpuMatrix
$badRuntimeMatrixStartupPrep.scenarios[0].preparation.action = "none"
$badRuntimeMatrixStartupPrep.scenarios[0].preparation.sample_delay_seconds = 10.0
$fixture = Write-Fixture -Name "runtime-matrix-startup-no-op" -Object $badRuntimeMatrixStartupPrep
$invocation = Invoke-Verifier -ScriptPath $runtimeCpuScenarioMatrixVerifier -Arguments @("-EvidencePath", $fixture, "-ExpectedVersion", $ExpectedVersion, "-RequiredScenarios", "startup-open,runtime-started,dashboard-open,desktop-open,post-route", "-MinSampleSeconds", "60", "-MaxOneCorePercent", "5", "-RequirePostRouteProbe", "-Json")
Add-CaseResult -Cases $cases -Name "runtime matrix rejects startup-open without immediate app activation" -Verifier "verify-runtime-cpu-scenario-matrix.ps1" -FixturePath $fixture -ShouldPass $false -Invocation $invocation

$badRuntimeMatrixMissingBudgetField = Copy-JsonObject -Object $validRuntimeCpuMatrix
$badRuntimeMatrixMissingBudgetField.scenarios[0].measurement.PSObject.Properties.Remove("resource_budget_violations")
$fixture = Write-Fixture -Name "runtime-matrix-missing-resource-budget-field" -Object $badRuntimeMatrixMissingBudgetField
$invocation = Invoke-Verifier -ScriptPath $runtimeCpuScenarioMatrixVerifier -Arguments @("-EvidencePath", $fixture, "-ExpectedVersion", $ExpectedVersion, "-RequiredScenarios", "startup-open,runtime-started,dashboard-open,desktop-open,post-route", "-MinSampleSeconds", "60", "-MaxOneCorePercent", "5", "-RequirePostRouteProbe", "-Json")
Add-CaseResult -Cases $cases -Name "runtime matrix rejects missing resource budget field" -Verifier "verify-runtime-cpu-scenario-matrix.ps1" -FixturePath $fixture -ShouldPass $false -Invocation $invocation

$badRuntimeMatrixMissingCpuAttribution = Copy-JsonObject -Object $validRuntimeCpuMatrix
$badRuntimeMatrixMissingCpuAttribution.scenarios[0].measurement.PSObject.Properties.Remove("cpu_attribution")
$fixture = Write-Fixture -Name "runtime-matrix-missing-cpu-attribution" -Object $badRuntimeMatrixMissingCpuAttribution
$invocation = Invoke-Verifier -ScriptPath $runtimeCpuScenarioMatrixVerifier -Arguments @("-EvidencePath", $fixture, "-ExpectedVersion", $ExpectedVersion, "-RequiredScenarios", "startup-open,runtime-started,dashboard-open,desktop-open,post-route", "-MinSampleSeconds", "60", "-MaxOneCorePercent", "5", "-RequirePostRouteProbe", "-Json")
Add-CaseResult -Cases $cases -Name "runtime matrix rejects missing CPU attribution" -Verifier "verify-runtime-cpu-scenario-matrix.ps1" -FixturePath $fixture -ShouldPass $false -Invocation $invocation

$badRuntimeMatrixMissingProcessMetadata = Copy-JsonObject -Object $validRuntimeCpuMatrix
$badRuntimeMatrixMissingProcessMetadata.scenarios[0].measurement.process_metadata_available = $false
$fixture = Write-Fixture -Name "runtime-matrix-missing-process-metadata" -Object $badRuntimeMatrixMissingProcessMetadata
$invocation = Invoke-Verifier -ScriptPath $runtimeCpuScenarioMatrixVerifier -Arguments @("-EvidencePath", $fixture, "-ExpectedVersion", $ExpectedVersion, "-RequiredScenarios", "startup-open,runtime-started,dashboard-open,desktop-open,post-route", "-MinSampleSeconds", "60", "-MaxOneCorePercent", "5", "-RequirePostRouteProbe", "-Json")
Add-CaseResult -Cases $cases -Name "runtime matrix rejects missing process metadata attribution" -Verifier "verify-runtime-cpu-scenario-matrix.ps1" -FixturePath $fixture -ShouldPass $false -Invocation $invocation

$badRuntimeMatrixTimedOutProcessMetadata = Copy-JsonObject -Object $validRuntimeCpuMatrix
$badRuntimeMatrixTimedOutProcessMetadata.scenarios[0].measurement.process_metadata_timed_out = $true
$fixture = Write-Fixture -Name "runtime-matrix-process-metadata-timeout" -Object $badRuntimeMatrixTimedOutProcessMetadata
$invocation = Invoke-Verifier -ScriptPath $runtimeCpuScenarioMatrixVerifier -Arguments @("-EvidencePath", $fixture, "-ExpectedVersion", $ExpectedVersion, "-RequiredScenarios", "startup-open,runtime-started,dashboard-open,desktop-open,post-route", "-MinSampleSeconds", "60", "-MaxOneCorePercent", "5", "-RequirePostRouteProbe", "-Json")
Add-CaseResult -Cases $cases -Name "runtime matrix rejects timed-out process metadata attribution" -Verifier "verify-runtime-cpu-scenario-matrix.ps1" -FixturePath $fixture -ShouldPass $false -Invocation $invocation

$badRuntimeMatrixUnscopedHelpers = Copy-JsonObject -Object $validRuntimeCpuMatrix
$badRuntimeMatrixUnscopedHelpers.scenarios[0].measurement.helper_process_scope = "all_matching_process_names"
$badRuntimeMatrixUnscopedHelpers.scenarios[0].measurement.cpu_attribution.attribution_scope = "all_matching_process_names"
$fixture = Write-Fixture -Name "runtime-matrix-unscoped-helper-attribution" -Object $badRuntimeMatrixUnscopedHelpers
$invocation = Invoke-Verifier -ScriptPath $runtimeCpuScenarioMatrixVerifier -Arguments @("-EvidencePath", $fixture, "-ExpectedVersion", $ExpectedVersion, "-RequiredScenarios", "startup-open,runtime-started,dashboard-open,desktop-open,post-route", "-MinSampleSeconds", "60", "-MaxOneCorePercent", "5", "-RequirePostRouteProbe", "-Json")
Add-CaseResult -Cases $cases -Name "runtime matrix rejects unscoped helper attribution" -Verifier "verify-runtime-cpu-scenario-matrix.ps1" -FixturePath $fixture -ShouldPass $false -Invocation $invocation

$badRuntimeMatrixMissingNodeCpuRole = Copy-JsonObject -Object $validRuntimeCpuMatrix
$badRuntimeMatrixMissingNodeCpuRole.scenarios[0].measurement.cpu_attribution.sample_count_by_role.PSObject.Properties.Remove("node")
$badRuntimeMatrixMissingNodeCpuRole.scenarios[0].measurement.cpu_attribution.total_cpu_seconds_by_role.PSObject.Properties.Remove("node")
$badRuntimeMatrixMissingNodeCpuRole.scenarios[0].measurement.cpu_attribution.max_one_core_percent_by_role.PSObject.Properties.Remove("node")
$fixture = Write-Fixture -Name "runtime-matrix-missing-node-cpu-role" -Object $badRuntimeMatrixMissingNodeCpuRole
$invocation = Invoke-Verifier -ScriptPath $runtimeCpuScenarioMatrixVerifier -Arguments @("-EvidencePath", $fixture, "-ExpectedVersion", $ExpectedVersion, "-RequiredScenarios", "startup-open,runtime-started,dashboard-open,desktop-open,post-route", "-MinSampleSeconds", "60", "-MaxOneCorePercent", "5", "-RequirePostRouteProbe", "-Json")
Add-CaseResult -Cases $cases -Name "runtime matrix rejects CPU attribution without node role fields" -Verifier "verify-runtime-cpu-scenario-matrix.ps1" -FixturePath $fixture -ShouldPass $false -Invocation $invocation

$badRuntimeMatrixMissingBridgeSubrole = Copy-JsonObject -Object $validRuntimeCpuMatrix
$badRuntimeMatrixMissingBridgeSubrole.scenarios[0].measurement.process_counts_by_subrole.PSObject.Properties.Remove("bridge_runtime")
$badRuntimeMatrixMissingBridgeSubrole.scenarios[0].measurement.cpu_attribution.sample_count_by_subrole.PSObject.Properties.Remove("bridge_runtime")
$badRuntimeMatrixMissingBridgeSubrole.scenarios[0].measurement.cpu_attribution.total_cpu_seconds_by_subrole.PSObject.Properties.Remove("bridge_runtime")
$badRuntimeMatrixMissingBridgeSubrole.scenarios[0].measurement.cpu_attribution.max_one_core_percent_by_subrole.PSObject.Properties.Remove("bridge_runtime")
$fixture = Write-Fixture -Name "runtime-matrix-missing-bridge-runtime-subrole" -Object $badRuntimeMatrixMissingBridgeSubrole
$invocation = Invoke-Verifier -ScriptPath $runtimeCpuScenarioMatrixVerifier -Arguments @("-EvidencePath", $fixture, "-ExpectedVersion", $ExpectedVersion, "-RequiredScenarios", "startup-open,runtime-started,dashboard-open,desktop-open,post-route", "-MinSampleSeconds", "60", "-MaxOneCorePercent", "5", "-RequirePostRouteProbe", "-Json")
Add-CaseResult -Cases $cases -Name "runtime matrix rejects CPU attribution without bridge runtime subrole fields" -Verifier "verify-runtime-cpu-scenario-matrix.ps1" -FixturePath $fixture -ShouldPass $false -Invocation $invocation

$badRuntimeMatrixWorkingSet = Copy-JsonObject -Object $validRuntimeCpuMatrix
$badRuntimeMatrixWorkingSet.scenarios[1].measurement.total_working_set_mb_after = 2048.0
$fixture = Write-Fixture -Name "runtime-matrix-working-set-over-budget" -Object $badRuntimeMatrixWorkingSet
$invocation = Invoke-Verifier -ScriptPath $runtimeCpuScenarioMatrixVerifier -Arguments @("-EvidencePath", $fixture, "-ExpectedVersion", $ExpectedVersion, "-RequiredScenarios", "startup-open,runtime-started,dashboard-open,desktop-open,post-route", "-MinSampleSeconds", "60", "-MaxOneCorePercent", "5", "-RequirePostRouteProbe", "-Json")
Add-CaseResult -Cases $cases -Name "runtime matrix rejects working set over budget" -Verifier "verify-runtime-cpu-scenario-matrix.ps1" -FixturePath $fixture -ShouldPass $false -Invocation $invocation

$badRuntimeMatrixWebView2 = Copy-JsonObject -Object $validRuntimeCpuMatrix
$badRuntimeMatrixWebView2.scenarios[2].measurement.process_counts_by_role.webview2 = 9
$fixture = Write-Fixture -Name "runtime-matrix-webview2-over-budget" -Object $badRuntimeMatrixWebView2
$invocation = Invoke-Verifier -ScriptPath $runtimeCpuScenarioMatrixVerifier -Arguments @("-EvidencePath", $fixture, "-ExpectedVersion", $ExpectedVersion, "-RequiredScenarios", "startup-open,runtime-started,dashboard-open,desktop-open,post-route", "-MinSampleSeconds", "60", "-MaxOneCorePercent", "5", "-RequirePostRouteProbe", "-Json")
Add-CaseResult -Cases $cases -Name "runtime matrix rejects WebView2 process count over budget" -Verifier "verify-runtime-cpu-scenario-matrix.ps1" -FixturePath $fixture -ShouldPass $false -Invocation $invocation

$failedCases = @($cases | Where-Object { -not [bool]$_.passed_expectation })
$result = [pscustomobject]@{
    schema = "musu.release_evidence_verifier_regression.v1"
    ok = ($failedCases.Count -eq 0)
    generated_at = ([datetimeoffset]::Now).ToString("o")
    version = $ExpectedVersion
    output_root = (Resolve-Path -LiteralPath $OutputRoot).Path
    case_count = $cases.Count
    failed_case_count = $failedCases.Count
    cases = $cases.ToArray()
}

$resultPath = Join-Path $OutputRoot "release-evidence-verifier-regression.json"
$result | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath $resultPath -Encoding UTF8

if ($Json) {
    $result | ConvertTo-Json -Depth 12
}
else {
    "MUSU release evidence verifier regression"
    "ok: $($result.ok)"
    "output_root: $($result.output_root)"
    ""
    $cases | Format-Table name, should_pass, exit_code, parsed_ok, passed_expectation -Wrap
}

if (-not $result.ok) {
    exit 1
}
