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
$multiDeviceVerifier = Join-Path $scriptDir "verify-multidevice-evidence.ps1"
$runtimeCpuScenarioMatrixVerifier = Join-Path $scriptDir "verify-runtime-cpu-scenario-matrix.ps1"

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

function Invoke-Verifier {
    param(
        [Parameter(Mandatory = $true)][string]$ScriptPath,
        [Parameter(Mandatory = $true)][string[]]$Arguments
    )

    $output = & powershell -NoProfile -ExecutionPolicy Bypass -File $ScriptPath @Arguments 2>&1
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

$now = [datetimeoffset]::Now

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
        relay_runtime_fallback_lease_request_wired = $true
        release_grade_transport_required = "quic_tls_1_3"
        relay_default_data_path = $false
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
}

$validMultiDevice = [pscustomobject]@{
    schema = "musu.multidevice_smoke_evidence.v1"
    ok = $true
    version = $ExpectedVersion
    started_at = $now.AddSeconds(-20).ToString("o")
    completed_at = $now.ToString("o")
    operator_machine = "VERIFIER-TEST"
    operator_user = "verifier-test"
    remote_addr = "10.0.0.2:8949"
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
            command = "musu peer add SECOND-PC 10.0.0.2:8949"
            exit_code = 0
            output = "peer added"
        },
        [pscustomobject]@{
            command = "musu peer list"
            exit_code = 0
            output = "SECOND-PC 10.0.0.2:8949"
        },
        [pscustomobject]@{
            command = "musu status"
            exit_code = 0
            output = "MUSU Fleet Status`nSECOND-PC online"
        },
        [pscustomobject]@{
            command = "musu route SECOND-PC -- echo MUSU_REMOTE_ROUTE_OK"
            exit_code = 0
            output = "MUSU_REMOTE_ROUTE_OK"
        }
    )
    route_evidence = [pscustomobject]@{
        schema = "musu.route_evidence.v1"
        version = $ExpectedVersion
        route_kind = "direct_quic"
        candidate_addr = "10.0.0.2:8949"
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
        [switch]$OmitResourceBudgetViolations
    )

    $measurement = [pscustomobject]@{
        ok = $true
        git_dirty = $false
        sample_seconds = 60
        process_counts_by_role = [pscustomobject]@{
            musu = 2
            node = 0
            webview2 = $WebView2Count
            other = 0
        }
        max_one_core_percent_by_role = [pscustomobject]@{
            musu = 0.1
            node = 0.0
            webview2 = 0.2
            other = 0.0
        }
        total_working_set_mb_after = $WorkingSetMb
        total_private_memory_mb_after = 320.0
        resource_budget_violations = @()
        hot_process_count = 0
    }

    if ($OmitResourceBudgetViolations) {
        $measurement.PSObject.Properties.Remove("resource_budget_violations")
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
    sample_seconds = 60
    max_one_core_percent = 5.0
    max_owned_process_count = 16
    max_owned_webview2_process_count = 8
    max_total_working_set_mb = 1024.0
    requested_scenarios = @("runtime-started", "dashboard-open", "desktop-open", "post-route")
    route_probe = [pscustomobject]@{
        ok = $true
        expected_token = "MUSU_CPU_SCENARIO_ROUTE_OK_VERIFIER_TEST"
        output = "MUSU_CPU_SCENARIO_ROUTE_OK_VERIFIER_TEST"
    }
    fail_count = 0
    scenarios = @(
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
            preparation = [pscustomobject]@{ action = "musu route --wait" }
            measurement = (New-RuntimeMeasurement)
        }
    )
}

$cases = New-Object System.Collections.Generic.List[object]

$fixture = Write-Fixture -Name "p2p-valid" -Object $validP2p
$invocation = Invoke-Verifier -ScriptPath $p2pVerifier -Arguments @("-EvidencePath", $fixture, "-ExpectedVersion", $ExpectedVersion, "-ExpectedBaseUrl", "https://musu.pro", "-Json")
Add-CaseResult -Cases $cases -Name "p2p accepts release-grade hosted control-plane evidence" -Verifier "verify-p2p-control-plane-evidence.ps1" -FixturePath $fixture -ShouldPass $true -Invocation $invocation

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
$badP2pStore.relay_leases.relay_lease_store_configured = $false
$badP2pStore.relay_leases.relay_lease_store_backend = "unconfigured"
$badP2pStore.relay_leases.relay_lease_store_release_grade = $false
$fixture = Write-Fixture -Name "p2p-bad-store" -Object $badP2pStore
$invocation = Invoke-Verifier -ScriptPath $p2pVerifier -Arguments @("-EvidencePath", $fixture, "-ExpectedVersion", $ExpectedVersion, "-ExpectedBaseUrl", "https://musu.pro", "-Json")
Add-CaseResult -Cases $cases -Name "p2p rejects unconfigured relay lease storage" -Verifier "verify-p2p-control-plane-evidence.ps1" -FixturePath $fixture -ShouldPass $false -Invocation $invocation

$badP2pDefaultRelay = Copy-JsonObject -Object $validP2p
$badP2pDefaultRelay.relay_status.relay_default_data_path = $true
$badP2pDefaultRelay.relay_leases.relay_default_data_path = $true
$fixture = Write-Fixture -Name "p2p-bad-default-relay" -Object $badP2pDefaultRelay
$invocation = Invoke-Verifier -ScriptPath $p2pVerifier -Arguments @("-EvidencePath", $fixture, "-ExpectedVersion", $ExpectedVersion, "-ExpectedBaseUrl", "https://musu.pro", "-Json")
Add-CaseResult -Cases $cases -Name "p2p rejects relay as default data path" -Verifier "verify-p2p-control-plane-evidence.ps1" -FixturePath $fixture -ShouldPass $false -Invocation $invocation

$fixture = Write-Fixture -Name "multidevice-valid" -Object $validMultiDevice
$invocation = Invoke-Verifier -ScriptPath $multiDeviceVerifier -Arguments @("-EvidencePath", $fixture, "-ExpectedVersion", $ExpectedVersion, "-Json")
Add-CaseResult -Cases $cases -Name "multidevice accepts release-grade direct QUIC route evidence" -Verifier "verify-multidevice-evidence.ps1" -FixturePath $fixture -ShouldPass $true -Invocation $invocation

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
$invocation = Invoke-Verifier -ScriptPath $runtimeCpuScenarioMatrixVerifier -Arguments @("-EvidencePath", $fixture, "-ExpectedVersion", $ExpectedVersion, "-RequiredScenarios", "runtime-started,dashboard-open,desktop-open,post-route", "-MinSampleSeconds", "60", "-MaxOneCorePercent", "5", "-RequirePostRouteProbe", "-Json")
Add-CaseResult -Cases $cases -Name "runtime matrix accepts complete resource-budget evidence" -Verifier "verify-runtime-cpu-scenario-matrix.ps1" -FixturePath $fixture -ShouldPass $true -Invocation $invocation

$badRuntimeMatrixMissingBudgetField = Copy-JsonObject -Object $validRuntimeCpuMatrix
$badRuntimeMatrixMissingBudgetField.scenarios[0].measurement.PSObject.Properties.Remove("resource_budget_violations")
$fixture = Write-Fixture -Name "runtime-matrix-missing-resource-budget-field" -Object $badRuntimeMatrixMissingBudgetField
$invocation = Invoke-Verifier -ScriptPath $runtimeCpuScenarioMatrixVerifier -Arguments @("-EvidencePath", $fixture, "-ExpectedVersion", $ExpectedVersion, "-RequiredScenarios", "runtime-started,dashboard-open,desktop-open,post-route", "-MinSampleSeconds", "60", "-MaxOneCorePercent", "5", "-RequirePostRouteProbe", "-Json")
Add-CaseResult -Cases $cases -Name "runtime matrix rejects missing resource budget field" -Verifier "verify-runtime-cpu-scenario-matrix.ps1" -FixturePath $fixture -ShouldPass $false -Invocation $invocation

$badRuntimeMatrixWorkingSet = Copy-JsonObject -Object $validRuntimeCpuMatrix
$badRuntimeMatrixWorkingSet.scenarios[1].measurement.total_working_set_mb_after = 2048.0
$fixture = Write-Fixture -Name "runtime-matrix-working-set-over-budget" -Object $badRuntimeMatrixWorkingSet
$invocation = Invoke-Verifier -ScriptPath $runtimeCpuScenarioMatrixVerifier -Arguments @("-EvidencePath", $fixture, "-ExpectedVersion", $ExpectedVersion, "-RequiredScenarios", "runtime-started,dashboard-open,desktop-open,post-route", "-MinSampleSeconds", "60", "-MaxOneCorePercent", "5", "-RequirePostRouteProbe", "-Json")
Add-CaseResult -Cases $cases -Name "runtime matrix rejects working set over budget" -Verifier "verify-runtime-cpu-scenario-matrix.ps1" -FixturePath $fixture -ShouldPass $false -Invocation $invocation

$badRuntimeMatrixWebView2 = Copy-JsonObject -Object $validRuntimeCpuMatrix
$badRuntimeMatrixWebView2.scenarios[2].measurement.process_counts_by_role.webview2 = 9
$fixture = Write-Fixture -Name "runtime-matrix-webview2-over-budget" -Object $badRuntimeMatrixWebView2
$invocation = Invoke-Verifier -ScriptPath $runtimeCpuScenarioMatrixVerifier -Arguments @("-EvidencePath", $fixture, "-ExpectedVersion", $ExpectedVersion, "-RequiredScenarios", "runtime-started,dashboard-open,desktop-open,post-route", "-MinSampleSeconds", "60", "-MaxOneCorePercent", "5", "-RequirePostRouteProbe", "-Json")
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
