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
$routeReachabilityVerifier = Join-Path $scriptDir "verify-route-reachability-diagnostic.ps1"
$processAttributionSummaryVerifier = Join-Path $scriptDir "verify-process-attribution-summary.ps1"
$singleMachineVerifier = Join-Path $scriptDir "verify-single-machine-evidence.ps1"
$supportVerifier = Join-Path $scriptDir "verify-support-mailbox-evidence.ps1"
$releaseGoNoGoWriter = Join-Path $scriptDir "write-release-go-no-go.ps1"
$p2pControlPlaneEvidenceRecorder = Join-Path $scriptDir "record-p2p-control-plane-evidence.ps1"
$externalGateRecheckRecorder = Join-Path $scriptDir "record-external-release-gate-recheck.ps1"
$p2pEnvStatusReporter = Join-Path $scriptDir "show-musu-pro-p2p-env-status.ps1"
$finalHandoffStatusReporter = Join-Path $scriptDir "show-final-release-handoff-status.ps1"
$operatorApiSecurityAuditor = Join-Path $scriptDir "audit-operator-api-security-contract.ps1"
$msixLegacyConflictsChecker = Join-Path $scriptDir "check-msix-legacy-conflicts.ps1"
$routeReachabilityRecorder = Join-Path $scriptDir "record-route-reachability-diagnostic.ps1"
$supportMailboxRequestPreparer = Join-Path $scriptDir "prepare-support-mailbox-verification-request.ps1"
$oneMachineMusuProWorkOrderSmoke = Join-Path $scriptDir "smoke-one-machine-musu-pro-work-order.ps1"

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
        [Parameter(Mandatory = $true)]$Invocation,
        [switch]$RequireParsed
    )

    $parsedOk = $false
    $parsedPresent = ($null -ne $Invocation.parsed)
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
        ($Invocation.exit_code -ne 0 -and -not $parsedOk -and (-not $RequireParsed -or $parsedPresent))
    }

    $Cases.Add([pscustomobject]@{
        name = $Name
        verifier = $Verifier
        fixture_path = (Resolve-Path -LiteralPath $FixturePath).Path
        should_pass = $ShouldPass
        exit_code = [int]$Invocation.exit_code
        parsed_json = [bool]$parsedPresent
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
        '$effectiveRouteExitCode = [int]$candidateResult.exit_code',
        'if (-not $candidateOk -and $effectiveRouteExitCode -eq 0)',
        'raw_exit_code = [int]$candidateResult.exit_code',
        'exit_code = $effectiveRouteExitCode',
        'attempt_count = $routeAttempts.Count',
        'attempts = $routeAttempts.ToArray()',
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

function Test-RuntimeCpuScenarioMatrixOutputRootHygieneContract {
    param([Parameter(Mandatory = $true)][string]$ScriptPath)

    $source = Get-Content -LiteralPath $ScriptPath -Raw
    $requiredNeedles = @(
        'function Test-GitIgnoredPath',
        'git -C $repoRoot check-ignore -q -- $fullPath',
        '$outputRootWithinRepo = Test-PathWithinDirectory',
        '$outputRootGitIgnored = if ($outputRootWithinRepo) { Test-GitIgnoredPath',
        'Runtime CPU scenario matrix OutputRoot is inside the repository but is not git-ignored',
        'default .local-build output root',
        'copy verified matrix and verification JSON into docs/evidence',
        'output_root_within_repo = [bool]$outputRootWithinRepo',
        'output_root_git_ignored = [bool]$outputRootGitIgnored'
    )

    foreach ($needle in $requiredNeedles) {
        if (-not $source.Contains($needle)) {
            return $false
        }
    }
    return $true
}

function Test-RuntimeCpuScenarioMatrixDoctorSnapshotContract {
    param(
        [Parameter(Mandatory = $true)][string]$MeasureScriptPath,
        [Parameter(Mandatory = $true)][string]$VerifierScriptPath
    )

    $measure = Get-Content -LiteralPath $MeasureScriptPath -Raw
    $verifier = Get-Content -LiteralPath $VerifierScriptPath -Raw
    $measureNeedles = @(
        'Invoke-JsonCommand -FilePath $MusuExe -Arguments @("doctor", "--json")',
        'schema = "musu.runtime_cpu_background_snapshot.v1"',
        'runtime_loop_candidates = $runtimeLoopCandidates',
        'active_runtime_loop_candidate_count = $activeRuntimeLoopCandidateCount',
        'active_runtime_loop_candidate_keys = $activeRuntimeLoopCandidateKeys',
        'doctor_background_snapshot = $doctorBackgroundSnapshot'
    )
    $verifierNeedles = @(
        'doctor background snapshot present',
        'doctor background snapshot schema',
        'doctor background snapshot command',
        'doctor background snapshot completeness',
        'doctor background required fields',
        'doctor background bridge health poll bounds',
        'doctor background runtime loop candidates',
        'doctor background active runtime loop candidate keys'
    )

    foreach ($needle in $measureNeedles) {
        if (-not $measure.Contains($needle)) {
            return $false
        }
    }
    foreach ($needle in $verifierNeedles) {
        if (-not $verifier.Contains($needle)) {
            return $false
        }
    }
    return $true
}

function Test-RuntimeCpuScenarioMatrixTargetBindingContract {
    param([Parameter(Mandatory = $true)][string]$ScriptPath)

    $source = Get-Content -LiteralPath $ScriptPath -Raw
    $requiredNeedles = @(
        'Test-RouteProbeArgumentsBindTarget',
        'Test-RouteProbeArgumentsBindWaitToken',
        'post-route route command binds wait token',
        'post-route route arguments bind wait token',
        'post-route successful output contains expected token',
        'post-route failed route probe exit code',
        '$routeProbeHasNumericExitCode',
        '$routeProbeHasNonZeroExitCode',
        'post-route route command binds target',
        'post-route route arguments bind target',
        '$routeCommand.Contains("--target")',
        'Test-RouteProbeArgumentsBindTarget -Arguments $routeArguments -Target $routeTarget',
        'Test-RouteProbeArgumentsBindWaitToken -Arguments $routeArguments -ExpectedToken $routeExpectedToken'
    )

    foreach ($needle in $requiredNeedles) {
        if (-not $source.Contains($needle)) {
            return $false
        }
    }
    return $true
}

function Test-RuntimeCpuScenarioMatrixPostRouteDiagnosticContract {
    param(
        [Parameter(Mandatory = $true)][string]$MeasureScriptPath,
        [Parameter(Mandatory = $true)][string]$VerifierScriptPath
    )

    $measure = Get-Content -LiteralPath $MeasureScriptPath -Raw
    $verifier = Get-Content -LiteralPath $VerifierScriptPath -Raw
    $measureNeedles = @(
        '"--explain", "--json", $RoutePrompt',
        '"--route-evidence-path", $routeEvidencePath',
        'route_explain_command = $routeExplainCommand',
        'route_explain = $routeExplainJson',
        'network_probe = $routeNetworkProbe',
        'route_evidence_path = $routeEvidencePath',
        'route_attempt_evidence = $routeAttemptEvidence'
    )
    $verifierNeedles = @(
        'post-route route explain present',
        'post-route route explain schema',
        'post-route route explain path priority',
        'post-route route explain bridge path selection wired',
        'post-route route explain rendezvous wired',
        'post-route route evidence path',
        'post-route route attempt evidence present',
        'post-route route attempt evidence schema',
        'post-route route attempt result present',
        'post-route route attempt kind present',
        'post-route route attempt candidate addr present',
        'post-route route attempt encryption present',
        'post-route network probe present',
        'post-route network probe target'
    )

    foreach ($needle in $measureNeedles) {
        if (-not $measure.Contains($needle)) {
            return $false
        }
    }
    foreach ($needle in $verifierNeedles) {
        if (-not $verifier.Contains($needle)) {
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

function Test-SecondPcTargetedRouteVerifierContract {
    param([Parameter(Mandatory = $true)][string]$ScriptPath)

    $source = Get-Content -LiteralPath $ScriptPath -Raw
    $requiredNeedles = @(
        'if (-not [string]::IsNullOrWhiteSpace($RuntimeCpuRouteTarget)) {',
        '$verifyArgs += "-RequirePostRouteTarget"',
        '$verifyArgs += @("-ExpectedPostRouteTarget", $RuntimeCpuRouteTarget)',
        '$verifyArgs += "-RejectSelfPostRouteTarget"',
        '$verifyArgs += "-RejectLocalPostRouteTarget"'
    )

    foreach ($needle in $requiredNeedles) {
        if (-not $source.Contains($needle)) {
            return $false
        }
    }
    return $true
}

function Test-SecondPcRuntimeIdleVerifierContract {
    param([Parameter(Mandatory = $true)][string]$ScriptPath)

    $source = Get-Content -LiteralPath $ScriptPath -Raw
    $requiredNeedles = @(
        '"verify runtime idle CPU evidence"',
        '"write-release-go-no-go.ps1"',
        '-VerifyRuntimeIdleCpuEvidencePath $runtimeIdleCpuEvidencePath',
        'runtime_idle_cpu_verified',
        'runtime_idle_cpu_verification',
        'runtime_idle_cpu_error'
    )

    foreach ($needle in $requiredNeedles) {
        if (-not $source.Contains($needle)) {
            return $false
        }
    }
    return $true
}

function Test-SecondPcProcessAttributionVerifierContract {
    param([Parameter(Mandatory = $true)][string]$ScriptPath)

    $source = Get-Content -LiteralPath $ScriptPath -Raw
    $requiredNeedles = @(
        '"verify process attribution summary"',
        '"verify-process-attribution-summary.ps1"',
        '-EvidencePath $processAttributionSummaryPath',
        'process_attribution_verified',
        'process_attribution_verification',
        'process_attribution_verification_error'
    )

    foreach ($needle in $requiredNeedles) {
        if (-not $source.Contains($needle)) {
            return $false
        }
    }
    return $true
}

function Test-SecondPcRouteReachabilityHandoffContract {
    param([Parameter(Mandatory = $true)][string]$ScriptPath)

    $source = Get-Content -LiteralPath $ScriptPath -Raw
    $requiredNeedles = @(
        '[string]$RouteReachabilityTarget',
        '[switch]$SkipRouteReachabilityDiagnostic',
        '[switch]$FailOnRouteReachabilityDiagnostic',
        '.local-build\route-diagnostics',
        '"record-route-reachability-diagnostic.ps1"',
        '"verify-route-reachability-diagnostic.ps1"',
        'AllowSuccessfulReachability',
        'route_reachability_diagnostic_required',
        'route_reachability_diagnostic_path',
        'route_reachability_diagnostic_verified',
        'route_reachability_tcp_test_succeeded',
        'route_reachability_successful_multi_device_route_proof'
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

function Test-SecondPcImportRuntimeIdleVerifierContract {
    param([Parameter(Mandatory = $true)][string]$ScriptPath)

    $source = Get-Content -LiteralPath $ScriptPath -Raw
    $requiredNeedles = @(
        'write-release-go-no-go.ps1',
        '-VerifyRuntimeIdleCpuEvidencePath $canonicalRuntimeIdleCpuEvidence',
        'runtime_idle_cpu_verified = [bool]$runtimeIdleCpuVerified',
        'runtime_idle_cpu_verification = $runtimeIdleCpuVerification',
        'runtime_idle_cpu_verification_error = $runtimeIdleCpuVerificationError',
        'release_check_runtime_idle_cpu_verified_missing',
        'release_check_runtime_idle_cpu_not_verified',
        'runtime_idle_cpu_evidence_not_verified',
        'runtime_idle_cpu_verification_error:'
    )

    foreach ($needle in $requiredNeedles) {
        if (-not $source.Contains($needle)) {
            return $false
        }
    }
    return $true
}

function Test-SecondPcImportRuntimeMatrixVerifierContract {
    param([Parameter(Mandatory = $true)][string]$ScriptPath)

    $source = Get-Content -LiteralPath $ScriptPath -Raw
    $requiredNeedles = @(
        'verify-runtime-cpu-scenario-matrix.ps1',
        '-EvidencePath", $canonicalRuntimeCpuScenarioMatrix',
        '-RequiredScenarios", "startup-open,runtime-started,dashboard-open,desktop-open,post-route"',
        '-RequirePostRouteProbe',
        '$runtimeCpuRouteTarget = if ($releaseCheck -and $releaseCheck.PSObject.Properties["runtime_cpu_route_target"])',
        '$runtimeCpuScenarioVerifyArgs += "-RequirePostRouteTarget"',
        '$runtimeCpuScenarioVerifyArgs += @("-ExpectedPostRouteTarget", $runtimeCpuRouteTarget)',
        '$runtimeCpuScenarioVerifyArgs += "-RejectSelfPostRouteTarget"',
        '$runtimeCpuScenarioVerifyArgs += "-RejectLocalPostRouteTarget"',
        '$runtimeCpuScenarioVerifyArgs += "-AllowFailedPostRouteProbe"',
        'runtime_cpu_scenario_matrix_verified = [bool]$runtimeCpuScenarioMatrixVerified',
        'runtime_cpu_scenario_matrix_verification = $runtimeCpuScenarioMatrixVerification',
        'runtime_cpu_scenario_matrix_verification_error = $runtimeCpuScenarioMatrixVerificationError',
        'runtime_cpu_scenario_matrix_evidence_not_verified',
        'runtime_cpu_scenario_matrix_verification_error:'
    )

    foreach ($needle in $requiredNeedles) {
        if (-not $source.Contains($needle)) {
            return $false
        }
    }
    return $true
}

function Test-SecondPcImportProcessAttributionVerifierContract {
    param([Parameter(Mandatory = $true)][string]$ScriptPath)

    $source = Get-Content -LiteralPath $ScriptPath -Raw
    $requiredNeedles = @(
        'verify-process-attribution-summary.ps1',
        '-EvidencePath", $canonicalProcessAttributionSummary',
        'process_attribution_verified = [bool]$processAttributionVerified',
        'process_attribution_verification = $processAttributionVerification',
        'process_attribution_verification_error = $processAttributionVerificationError',
        'release_check_process_attribution_verified_missing',
        'release_check_process_attribution_not_verified',
        'process_attribution_summary_not_verified',
        'process_attribution_summary_verification_error:'
    )

    foreach ($needle in $requiredNeedles) {
        if (-not $source.Contains($needle)) {
            return $false
        }
    }
    return $true
}

function Test-SecondPcImportRouteReachabilityContract {
    param([Parameter(Mandatory = $true)][string]$ScriptPath)

    $source = Get-Content -LiteralPath $ScriptPath -Raw
    $requiredNeedles = @(
        'musu.route_reachability_diagnostic.v1',
        '.local-build\route-diagnostics',
        'verify-route-reachability-diagnostic.ps1',
        'RequireNonLocalTarget',
        'AllowSuccessfulReachability',
        'route_reachability_diagnostic_path',
        'runtime_cpu_route_target',
        'route_target_consistency_ok',
        'route_reachability_target',
        'route_reachability_diagnostic_target_consistency_ok',
        'route_reachability_diagnostic_required',
        'route_reachability_diagnostic_verified',
        'release_check_route_reachability_diagnostic_verified_missing',
        'release_check_route_reachability_diagnostic_not_verified',
        'release_check_route_targets_not_consistent',
        'missing_route_reachability_diagnostic',
        'route_reachability_diagnostic_target_not_consistent',
        'route_reachability_diagnostic_not_verified'
    )

    foreach ($needle in $requiredNeedles) {
        if (-not $source.Contains($needle)) {
            return $false
        }
    }
    return $true
}

function Test-SecondPcReleaseCheckRouteTargetConsistencyContract {
    param([Parameter(Mandatory = $true)][string]$ScriptPath)

    $source = Get-Content -LiteralPath $ScriptPath -Raw
    $requiredNeedles = @(
        "RouteReachabilityTarget must match RuntimeCpuRouteTarget when both are provided.",
        'runtime_cpu_route_target = if ([string]::IsNullOrWhiteSpace($RuntimeCpuRouteTarget)) { $null } else { $RuntimeCpuRouteTarget }',
        'route_target_consistency_ok = if ([string]::IsNullOrWhiteSpace($routeReachabilityTargetEffective) -and [string]::IsNullOrWhiteSpace($RuntimeCpuRouteTarget)) { $null } else { $true }',
        'runtime_cpu_route_target: $(if ($result.runtime_cpu_route_target) { $result.runtime_cpu_route_target } else { ''<none>'' })',
        'route_target_consistency_ok: $(if ($null -ne $result.route_target_consistency_ok) { $result.route_target_consistency_ok } else { ''<none>'' })'
    )

    foreach ($needle in $requiredNeedles) {
        if (-not $source.Contains($needle)) {
            return $false
        }
    }
    return $true
}

function Test-SecondPcKitMetadataContract {
    param([Parameter(Mandatory = $true)][string]$ScriptPath)

    $source = Get-Content -LiteralPath $ScriptPath -Raw
    $requiredNeedles = @(
        'Get-MusuSourceGitState -RepoRoot $repoRoot',
        'Unable to resolve source git commit for multi-device test kit.',
        'schema = "musu.multidevice_test_kit_metadata.v1"',
        'kit-build-metadata.json',
        'commit = [string]$sourceGitState.commit',
        'dirty = if ($null -eq $sourceGitState.dirty) { $null } else { [bool]$sourceGitState.dirty }'
    )

    foreach ($needle in $requiredNeedles) {
        if (-not $source.Contains($needle)) {
            return $false
        }
    }
    return $true
}

function Test-SecondPcReleaseCheckGitFreshnessContract {
    param([Parameter(Mandatory = $true)][string]$ScriptPath)

    $source = Get-Content -LiteralPath $ScriptPath -Raw
    $requiredNeedles = @(
        'Get-MusuSourceGitState -RepoRoot $repoRoot',
        'git_commit = [string]$sourceGitState.commit',
        'git_dirty = if ($null -eq $sourceGitState.dirty) { $null } else { [bool]$sourceGitState.dirty }',
        'git_status_short = [string]$sourceGitState.status_short',
        'git_source = [string]$sourceGitState.source',
        'git_metadata_path = [string]$sourceGitState.metadata_path'
    )

    foreach ($needle in $requiredNeedles) {
        if (-not $source.Contains($needle)) {
            return $false
        }
    }
    return $true
}

function Test-SecondPcHandoffGitFreshnessContract {
    param([Parameter(Mandatory = $true)][string]$ScriptPath)

    $source = Get-Content -LiteralPath $ScriptPath -Raw
    $requiredNeedles = @(
        'Get-MusuSourceGitState -RepoRoot $repoRoot',
        'schema = "musu.second_pc_handoff.v1"',
        'git_commit = [string]$sourceGitState.commit',
        'git_dirty = if ($null -eq $sourceGitState.dirty) { $null } else { [bool]$sourceGitState.dirty }',
        'git_status_short = [string]$sourceGitState.status_short',
        'git_source = [string]$sourceGitState.source',
        'git_metadata_path = [string]$sourceGitState.metadata_path'
    )

    foreach ($needle in $requiredNeedles) {
        if (-not $source.Contains($needle)) {
            return $false
        }
    }
    return $true
}

function Test-SecondPcImportGitFreshnessContract {
    param([Parameter(Mandatory = $true)][string]$ScriptPath)

    $source = Get-Content -LiteralPath $ScriptPath -Raw
    $requiredNeedles = @(
        'Get-MusuSourceGitState -RepoRoot $repoRoot',
        'function Test-DocumentationOrStatusOnlyGitDelta',
        'function New-GitFreshnessSummary',
        'release_check_git_commit_missing',
        'release_check_git_commit_invalid',
        'release_check_git_commit_not_current',
        'release_check_git_dirty_missing',
        'release_check_git_dirty_true',
        'handoff_git_commit_missing',
        'handoff_git_commit_invalid',
        'handoff_git_commit_not_current',
        'handoff_git_dirty_missing',
        'handoff_git_dirty_true',
        'handoff_release_check_git_commit_mismatch',
        'release_check_git_freshness = $releaseCheckGitFreshness',
        'handoff_git_freshness = $handoffGitFreshness',
        'Test-DocumentationOrStatusOnlyGitDelta -FromCommit $gitCommit -ToCommit $ExpectedGitCommit'
    )

    foreach ($needle in $requiredNeedles) {
        if (-not $source.Contains($needle)) {
            return $false
        }
    }
    return $true
}

function Test-SecondPcRoutePreflightFreshnessContract {
    param([Parameter(Mandatory = $true)][string]$ScriptPath)

    $source = Get-Content -LiteralPath $ScriptPath -Raw
    $requiredNeedles = @(
        'Get-MusuSourceGitState -RepoRoot $repoRoot',
        '"second-PC release check from return zip"',
        'function Test-DocumentationOrStatusOnlyGitDelta',
        'function New-GitFreshnessSummary',
        'release-check freshness',
        'handoff freshness',
        'handoff/release-check commit match',
        'release-check route reachability target',
        'release-check route reachability verified',
        'release-check route targets consistent',
        'release_check_path = $releaseCheckPath',
        'handoff_git_freshness = $handoffGitFreshness',
        'release_check_git_freshness = $releaseCheckGitFreshness',
        'release_check_runtime_cpu_route_target = if ([string]::IsNullOrWhiteSpace($releaseCheckRuntimeCpuRouteTarget)) { $null } else { $releaseCheckRuntimeCpuRouteTarget }',
        'release_check_route_target_consistency_ok = $releaseCheckRouteTargetConsistencyOk',
        'release_check_route_reachability_diagnostic_path = $releaseCheckDiagnosticPath',
        'release_check_route_reachability_diagnostic_target = if ([string]::IsNullOrWhiteSpace($releaseCheckDiagnosticTarget)) { $null } else { $releaseCheckDiagnosticTarget }',
        'release_check_route_reachability_diagnostic_target_consistency_ok = $releaseCheckDiagnosticTargetConsistencyOk',
        'route_target_source = if ([string]::IsNullOrWhiteSpace($routeTargetSource)) { $null } else { $routeTargetSource }',
        'release_check_route_reachability_required = $releaseCheckRouteReachabilityRequired',
        'release_check_route_reachability_verified = $releaseCheckRouteReachabilityVerified',
        'release-check diagnostic target consistent',
        'return zip is missing second-PC release-check JSON',
        'handoff and release-check come from different source commits'
    )

    foreach ($needle in $requiredNeedles) {
        if (-not $source.Contains($needle)) {
            return $false
        }
    }
    return $true
}

function Test-SecondPcReturnCardFreshnessContract {
    param([Parameter(Mandatory = $true)][string]$ScriptPath)

    $source = Get-Content -LiteralPath $ScriptPath -Raw
    $requiredNeedles = @(
        'Get-MusuSourceGitState -RepoRoot $repoRoot',
        'function Test-DocumentationOrStatusOnlyGitDelta',
        'function New-GitFreshnessSummary',
        'route_preflight_ready = [bool]$routePreflightReady',
        'handoff_git_freshness = $handoffGitFreshness',
        'release_check_git_freshness = $releaseCheckGitFreshness',
        'runtime_cpu_route_target = if ([string]::IsNullOrWhiteSpace($runtimeCpuRouteTarget)) { $null } else { $runtimeCpuRouteTarget }',
        'route_target_consistency_ok = $routeTargetConsistencyOk',
        'route_reachability_diagnostic_path = $routeReachabilityDiagnosticPath',
        'route_reachability_diagnostic_target = if ([string]::IsNullOrWhiteSpace($routeReachabilityDiagnosticTarget)) { $null } else { $routeReachabilityDiagnosticTarget }',
        'route_reachability_diagnostic_target_consistency_ok = $routeReachabilityDiagnosticTargetConsistencyOk',
        'primary_route_target = $primaryRouteTarget',
        'primary_route_target_source = $primaryRouteTargetSource',
        'route_reachability_diagnostic_required = $routeReachabilityDiagnosticRequired',
        'route_reachability_diagnostic_verified = $routeReachabilityDiagnosticVerified',
        'route_reachability_target = if ([string]::IsNullOrWhiteSpace($routeReachabilityTarget)) { $null } else { $routeReachabilityTarget }',
        'run_multidevice_smoke = "powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\smoke-multidevice-beta.ps1 -RemoteAddr $RemoteAddr -RemoteName $RemoteName -RouteTarget $primaryRouteTarget -ExpectedRouteOutput $ExpectedRouteOutput"',
        'Returned zip does not include second-PC release-check JSON',
        'Second-PC release-check route reachability diagnostic is missing or failed verification.',
        'Second-PC release-check runtime CPU route target and route reachability target differ or one side is missing.',
        'Second-PC route reachability diagnostic target differs from the release-check route reachability target or one side is missing.',
        'Second-PC handoff and release-check were captured from different source commits.',
        'release_check: $(if ($result.release_check_path)'
    )

    foreach ($needle in $requiredNeedles) {
        if (-not $source.Contains($needle)) {
            return $false
        }
    }
    return $true
}

function Test-FinalOperatorPacketMsixCommonContract {
    param([Parameter(Mandatory = $true)][string]$ScriptPath)

    $source = Get-Content -LiteralPath $ScriptPath -Raw
    return ($source.Contains('"msix-common.ps1",') -and
        $source.Contains('"test-second-pc-route-preflight.ps1",') -and
        $source.Contains('"show-second-pc-return-card.ps1",'))
}

function Test-SecondPcKitProcessAttributionVerifierContract {
    param([Parameter(Mandatory = $true)][string]$ScriptPath)

    $source = Get-Content -LiteralPath $ScriptPath -Raw
    return ($source.Contains('"show-musu-process-attribution.ps1",') -and
        $source.Contains('"verify-process-attribution-summary.ps1",'))
}

function Test-FinalOperatorPacketProcessAttributionVerifierContract {
    param([Parameter(Mandatory = $true)][string]$ScriptPath)

    $source = Get-Content -LiteralPath $ScriptPath -Raw
    return ($source.Contains('"show-musu-process-attribution.ps1",') -and
        $source.Contains('"verify-process-attribution-summary.ps1",') -and
        $source.Contains('"import-second-pc-return.ps1",'))
}

function Test-SecondPcKitRouteReachabilityContract {
    param([Parameter(Mandatory = $true)][string]$ScriptPath)

    $source = Get-Content -LiteralPath $ScriptPath -Raw
    $requiredNeedles = @(
        '"record-route-reachability-diagnostic.ps1"',
        '"verify-route-reachability-diagnostic.ps1"',
        '"test-second-pc-route-preflight.ps1"',
        'RouteReachabilityTarget',
        'musu.route_reachability_diagnostic.v1',
        '.local-build\route-diagnostics\*.route-reachability-diagnostic.json',
        '.local-build\second-pc-route-preflight\*.second-pc-route-preflight.json',
        'musu peer add',
        'musu route --explain --target <SECOND_PC_NAME>',
        'peer not found',
        'not release-grade multi-device proof',
        'verify-route-reachability-diagnostic.ps1 -EvidencePath'
    )

    foreach ($needle in $requiredNeedles) {
        if (-not $source.Contains($needle)) {
            return $false
        }
    }
    return $true
}

function Test-SupportMailboxVerificationRequestContract {
    param([Parameter(Mandatory = $true)][string]$ScriptPath)

    $source = Get-Content -LiteralPath $ScriptPath -Raw
    $requiredNeedles = @(
        'musu.support_mailbox_verification_request.v1',
        '.local-build\support-mailbox-requests',
        'record-support-mailbox-verification.ps1',
        'does not satisfy release gate',
        'release_gate_satisfied = $false',
        'evidence_warning',
        'SUPPORT_MAILBOX_VERIFICATION_EMAIL.txt',
        'VerificationId must match ^musu-[A-Za-z0-9._-]{16,}$.',
        'REPLACE_WITH_EXTERNAL_SENDER_EMAIL',
        'git_dirty'
    )

    foreach ($needle in $requiredNeedles) {
        if (-not $source.Contains($needle)) {
            return $false
        }
    }

    return -not $source.Contains('musu.support_mailbox_evidence.v1')
}

function Test-RuntimeCpuGoNoGoMatrixSelectionContract {
    param([Parameter(Mandatory = $true)][string]$ScriptPath)

    $source = Get-Content -LiteralPath $ScriptPath -Raw
    $requiredNeedles = @(
        'function Select-RuntimeCpuScenarioMatrixCandidates',
        'Get-RuntimeCpuScenarioMatrixCandidateShape',
        'Test-StringSetContainsAll -Values $shape.scenario_names -Required $RequiredScenarios',
        'Select-RuntimeCpuScenarioMatrixCandidates -Candidates $runtimeCpuScenarioMatrixCandidates -RequiredScenarios $RequiredRuntimeCpuScenarioMatrixScenarios -MaxPerMachine 12 -MaxUnknown 12',
        '$runtimeCpuSecondPcRouteAttemptRequiredScenarios = @("post-route")',
        '"-RequiredScenarios", ($runtimeCpuSecondPcRouteAttemptRequiredScenarios -join ",")',
        '"-RejectSelfPostRouteTarget"',
        '"-RejectLocalPostRouteTarget"',
        'candidate_selection = "latest-per-machine-up-to-12-plus-complete-scenario-and-target-route-candidates"'
    )

    foreach ($needle in $requiredNeedles) {
        if (-not $source.Contains($needle)) {
            return $false
        }
    }
    return $true
}

function Test-MsixInstallGoNoGoSelectionContract {
    param([Parameter(Mandatory = $true)][string]$ScriptPath)

    $source = Get-Content -LiteralPath $ScriptPath -Raw
    $requiredNeedles = @(
        '$msixInstallEvidenceCandidates += @(Get-ChildItem',
        'Select-LatestEvidenceCandidatesByMachine -Candidates $msixInstallEvidenceCandidates -MaxPerMachine 6 -MaxUnknown 6',
        'foreach ($candidate in @($msixInstallSelectedCandidates | Sort-Object LastWriteTime -Descending))',
        '-Arguments @("-EvidencePath", $candidate.FullName, "-ExpectedVersion", $version, "-Json")',
        'candidate_selection = "latest-per-machine-up-to-6"'
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
        'Select-LatestEvidenceCandidatesByMachine -Candidates $runtimeIdleCpuEvidenceCandidates -MaxPerMachine 12 -MaxUnknown 12',
        'candidate_selection = "latest-per-machine-up-to-12"',
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

function Test-RuntimeIdleCpuGoNoGoDoctorSnapshotContract {
    param([Parameter(Mandatory = $true)][string]$ScriptPath)

    $source = Get-Content -LiteralPath $ScriptPath -Raw
    $requiredNeedles = @(
        '$doctorBackgroundFieldNames = @(',
        'doctor background snapshot present',
        'doctor background snapshot schema',
        'doctor background snapshot command',
        'doctor background fields present',
        'doctor background required fields',
        'doctor background cloud heartbeat floor',
        'doctor background relay poller floor',
        'doctor background planner floor',
        'doctor background planner timeout bounds',
        'doctor background auto-update interval floor',
        'doctor background auto-update health poll bounds',
        'doctor background snapshot completeness',
        'doctor background bridge health poll bounds',
        'doctor background runtime loop candidates',
        'doctor background active runtime loop candidate keys'
    )

    foreach ($needle in $requiredNeedles) {
        if (-not $source.Contains($needle)) {
            return $false
        }
    }
    return $true
}

function Test-RuntimeIdleCpuGoNoGoMatchingProcessInventoryContract {
    param([Parameter(Mandatory = $true)][string]$ScriptPath)

    $source = Get-Content -LiteralPath $ScriptPath -Raw
    $requiredNeedles = @(
        'matching process inventory present',
        'runtime idle CPU evidence records matching process inventory for machine-wide and MUSU-owned helper attribution',
        'matching process inventory top-level fields',
        'matching process inventory includes MUSU/node/WebView2/other role buckets',
        'matching process inventory node buckets',
        'matching process inventory records machine-wide, MUSU-owned, repo-related, and unowned node helper counts',
        'matching process inventory repo-related node helpers',
        'matching process inventory records no repo-related unowned node helpers',
        'matching process inventory WebView2 buckets',
        'matching process inventory records machine-wide, MUSU-owned, and unowned WebView2 helper counts',
        '$matchingProcessInventoryBuckets = if ($matchingProcessInventory.PSObject.Properties["counts_by_bucket"]) { $matchingProcessInventory.counts_by_bucket } else { $matchingProcessInventory }',
        'Test-ObjectHasPropertyNames -Object $matchingProcessInventoryBuckets -Names @("musu", "node", "webview2", "other")',
        'Test-ObjectHasPropertyNames -Object $matchingProcessInventoryBuckets.node -Names @("machine_wide", "owned_by_musu_process_tree", "repo_related_unowned", "unowned_other")',
        'Test-ObjectHasPropertyNames -Object $matchingProcessInventoryBuckets.webview2 -Names @("machine_wide", "owned_by_musu_process_tree", "unowned_other")'
    )

    foreach ($needle in $requiredNeedles) {
        if (-not $source.Contains($needle)) {
            return $false
        }
    }
    return $true
}

function Test-RuntimeIdleCpuDirectVerifierContract {
    param([Parameter(Mandatory = $true)][string]$ScriptPath)

    $source = Get-Content -LiteralPath $ScriptPath -Raw
    $requiredNeedles = @(
        '[string]$VerifyRuntimeIdleCpuEvidencePath',
        'if (-not [string]::IsNullOrWhiteSpace($VerifyRuntimeIdleCpuEvidencePath))',
        '-EvidencePath $runtimeIdleEvidencePath',
        '-ExpectedVersion $version',
        '-ExpectedGitCommit $currentGitCommit',
        'if (-not [bool]$verification.ok) {',
        'exit 1'
    )

    foreach ($needle in $requiredNeedles) {
        if (-not $source.Contains($needle)) {
            return $false
        }
    }
    return $true
}

function Test-ProcessOwnershipGoNoGoFreshnessContract {
    param([Parameter(Mandatory = $true)][string]$ScriptPath)

    $source = Get-Content -LiteralPath $ScriptPath -Raw
    $requiredNeedles = @(
        'function Test-ProcessOwnershipEvidence',
        '[Parameter(Mandatory = $true)][string]$ExpectedGitCommit',
        'git commit present',
        'expected git commit',
        'Test-DocumentationOrStatusOnlyGitDelta -FromCommit $gitCommit -ToCommit $ExpectedGitCommit',
        'no runtime-affecting changes after the process ownership evidence commit',
        '-ExpectedGitCommit $currentGitCommit'
    )

    foreach ($needle in $requiredNeedles) {
        if (-not $source.Contains($needle)) {
            return $false
        }
    }
    return $true
}

function Test-ProcessOwnershipTransientCliContract {
    param([Parameter(Mandatory = $true)][string]$ScriptPath)

    $source = Get-Content -LiteralPath $ScriptPath -Raw
    $requiredNeedles = @(
        'function Test-MusuBridgeCommandLine',
        'function Test-MusuRuntimeRoot',
        'Test-MusuRuntimeRoot $_ $bridgePid',
        '$musuCliProcesses = @($rawProcesses',
        '"musu_cli"',
        'musu_cli = @($musuCliProcesses).Count'
    )

    foreach ($needle in $requiredNeedles) {
        if (-not $source.Contains($needle)) {
            return $false
        }
    }
    return $true
}

function Test-SingleInstanceGoNoGoFreshnessContract {
    param([Parameter(Mandatory = $true)][string]$ScriptPath)

    $source = Get-Content -LiteralPath $ScriptPath -Raw
    $requiredNeedles = @(
        'function Test-StartupSingleInstanceEvidence',
        'function Test-DesktopSingleInstanceEvidence',
        '[Parameter(Mandatory = $true)][string]$ExpectedGitCommit',
        'no runtime-affecting changes after the startup single-instance evidence commit',
        'no runtime-affecting changes after the desktop single-instance evidence commit',
        'Test-DocumentationOrStatusOnlyGitDelta -FromCommit $gitCommit -ToCommit $ExpectedGitCommit',
        '-ExpectedGitCommit $currentGitCommit'
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
    if ($candidateCount -ne 10) {
        return $false
    }

    $requiredNeedles = @(
        '$idleBusyLoopCandidateStatuses = @(',
        'idle_busy_loop_candidate_contract_verified',
        'idle_busy_loop_candidate_count',
        'idle_busy_loop_candidate_verified_count',
        'idle_busy_loop_candidate_unverified_count',
        'idle_busy_loop_candidate_status',
        'idle_busy_loop_candidate_verified_count:',
        'idle-busy-loop-candidates',
        '-Candidate "clipboard polling"',
        '-Candidate "mDNS discovery"',
        '-Candidate "health check retry loop"',
        '-Candidate "bridge readiness wait loop"',
        '-Candidate "frontend interval/refetch"',
        '-Candidate "relay payload target poller"',
        '-Candidate "autonomous planner loop"',
        '-Candidate "cloud heartbeat"',
        '-Candidate "auto-update supervisor loop"',
        '-Candidate "log/telemetry flush loop"',
        'clipboard opt-in env gate',
        'clipboard monitor cancellation token',
        'clipboard monitor ctrl-c cancellation',
        'clipboard monitor sleep',
        'clipboard monitor exits after cancellation',
        'mDNS auto-register cancellation token',
        'browse cancellation token',
        'browse cancellation select',
        'auto-register cancellation wrapper',
        'disconnect breaks browse',
        'health poll sleep',
        'bridge readiness backoff sleep',
        'no direct setInterval in non-test frontend source',
        'low-duty polling call-site inventory',
        'poller cancellation-aware sleep',
        'planner default low duty interval',
        'planner cancellation-aware sleep',
        'failure backoff sleep',
        'first tick skipped',
        'no background telemetry flush worker primitives',
        'clipboard, mDNS, health check retry, bridge readiness wait, frontend polling, relay target polling, planner, cloud heartbeat, auto-update supervisor, and log/telemetry flush loops'
    )

    foreach ($needle in $requiredNeedles) {
        if (-not $source.Contains($needle)) {
            return $false
        }
    }
    return $true
}

function Test-GoNoGoLatestOutputContract {
    param([Parameter(Mandatory = $true)][string]$ScriptPath)

    $source = Get-Content -LiteralPath $ScriptPath -Raw
    $requiredNeedles = @(
        '[string]$OutputPath',
        '.local-build\go-no-go\latest.json',
        'Resolve-GoNoGoOutputPath',
        'go_no_go_output_path',
        '$resultJson = $result | ConvertTo-Json -Depth 8',
        'Set-Content -LiteralPath $tempPath -Encoding UTF8',
        'Move-Item -LiteralPath $tempPath -Destination $goNoGoOutputPath -Force',
        'go_no_go_output_path: $($result.go_no_go_output_path)'
    )

    foreach ($needle in $requiredNeedles) {
        if (-not $source.Contains($needle)) {
            return $false
        }
    }
    return $true
}

function Test-RouteReachabilityRecorderSourceContract {
    param([Parameter(Mandatory = $true)][string]$ScriptPath)

    $source = Get-Content -LiteralPath $ScriptPath -Raw
    $requiredNeedles = @(
        'schema = "musu.route_reachability_diagnostic.v1"',
        '"status", "--json"',
        '"route", "--target", $Target, "--explain", "--json", $RoutePrompt',
        '"route", "--target", $Target, "--route-evidence-path", $routeAttemptEvidencePath, $RoutePrompt',
        'Test-TcpPort -HostName $hostPort.host',
        'neighbor_entry_is_not_route_success_proof = $true',
        'local_musu_desktop_runtime_healthy',
        'successful_multi_device_route_proof',
        'Route reachability diagnostic only'
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

function Test-RustBackgroundTelemetryFlushScopeContract {
    param([Parameter(Mandatory = $true)][string]$ScriptPath)

    $source = Get-Content -LiteralPath $ScriptPath -Raw
    $requiredNeedles = @(
        '$allowedTelemetryFlushPrimitiveFiles',
        'std::io::stdout\(\)|std::io::stderr\(\)|stdout\(\)|stderr\(\)',
        'one-shot log flush primitives stay allowlisted',
        'no background telemetry flush worker primitives',
        'telemetry_flush_primitive_hit_count',
        'allowed_telemetry_flush_primitive_hit_count',
        'allowed_telemetry_flush_primitive_hits',
        'musu-rs\src\install\uninstall.rs'
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

function Test-CrashRecoveryAuditSourceContract {
    param([Parameter(Mandatory = $true)][string]$ScriptPath)

    $source = Get-Content -LiteralPath $ScriptPath -Raw
    $requiredNeedles = @(
        'musu.crash_recovery_contract.v1',
        'stale_bridge_registry_removed',
        'stale_bridge_registry_pid',
        'registry.cleanup_stale();',
        'registry.discover("bridge").is_none()',
        'Removed stale bridge registry record.',
        'cleanup_stale_removes_dead_pids',
        'audit-musu-startup-single-instance.ps1',
        'audit-musu-process-ownership.ps1'
    )

    foreach ($needle in $requiredNeedles) {
        if (-not $source.Contains($needle)) {
            return $false
        }
    }
    return $true
}

function Test-CrashRecoveryGoNoGoContract {
    param([Parameter(Mandatory = $true)][string]$ScriptPath)

    $source = Get-Content -LiteralPath $ScriptPath -Raw
    $requiredNeedles = @(
        'audit-musu-crash-recovery-contract.ps1',
        '$crashRecoveryContractVerified',
        'crash_recovery_contract_verified',
        'crash_recovery_contract_audit',
        'crash-recovery',
        'musu.crash_recovery_contract.v1',
        'stale bridge registry'
    )

    foreach ($needle in $requiredNeedles) {
        if (-not $source.Contains($needle)) {
            return $false
        }
    }
    return $true
}

function Test-CrashRecoveryFreshnessStatusOnlyContract {
    param([Parameter(Mandatory = $true)][string[]]$ScriptPaths)

    foreach ($scriptPath in $ScriptPaths) {
        $source = Get-Content -LiteralPath $scriptPath -Raw
        if (-not $source.Contains('"scripts/windows/audit-musu-crash-recovery-contract.ps1"')) {
            return $false
        }
    }
    return $true
}

function Test-SupportMailboxFreshnessStatusOnlyContract {
    param([Parameter(Mandatory = $true)][string[]]$ScriptPaths)

    $requiredNeedles = @(
        '"scripts/windows/prepare-support-mailbox-verification-request.ps1"',
        '"scripts/windows/record-support-mailbox-verification.ps1"',
        '"scripts/windows/verify-support-mailbox-evidence.ps1"',
        '"scripts/windows/show-operator-handoff-card.ps1"'
    )

    foreach ($scriptPath in $ScriptPaths) {
        $source = Get-Content -LiteralPath $scriptPath -Raw
        foreach ($needle in $requiredNeedles) {
            if (-not $source.Contains($needle)) {
                return $false
            }
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
        'p2p_relay_route_metadata_required_count',
        'p2p_relay_route_metadata_valid_count',
        'p2p_relay_route_metadata_invalid_count',
        'p2p_relay_route_transport_proof_required_count',
        'p2p_relay_route_transport_proof_valid_count',
        'p2p_relay_route_transport_proof_invalid_count',
        'p2p_relay_payload_delivery_proof_required_count',
        'p2p_relay_payload_delivery_proof_valid_count',
        'p2p_relay_payload_delivery_proof_invalid_count',
        'p2p_runtime_not_logged_in',
        'p2p_relay_lease_store_not_release_grade',
        'p2p_relay_transport_not_wired',
        'p2p_relay_payload_endpoint_not_wired',
        'p2p_relay_route_metadata_missing',
        'p2p_relay_route_transport_proof_missing'
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
        'relay_route_metadata_valid_count',
        'relay_route_metadata_required_count',
        'relay_route_metadata_invalid_count',
        'relay_route_transport_proof_valid_count',
        'relay_route_transport_proof_required_count',
        'relay_route_transport_proof_invalid_count',
        'relay_payload_delivery_proof_valid_count',
        'relay_payload_delivery_proof_required_count',
        'relay_payload_delivery_proof_invalid_count',
        'live_evidence_relay_route_metadata_missing',
        'live_evidence_relay_route_transport_proof_missing',
        'Log in the packaged MUSU runtime with the WindowsApps alias',
        'Do not use the localhost developer dashboard to satisfy this gate',
        'logged_in=true',
        'relay_route_metadata_valid_count > 0',
        'relay_route_transport_proof_valid_count > 0'
    )

    foreach ($needle in $requiredNeedles) {
        if (-not $source.Contains($needle)) {
            return $false
        }
    }
    return $true
}

function Test-P2pEnvStatusReleasePayloadTerminologyContract {
    param([Parameter(Mandatory = $true)][string]$ScriptPath)

    $source = Get-Content -LiteralPath $ScriptPath -Raw
    $requiredNeedles = @(
        'release_payload_preflight_endpoint_implemented',
        'release_relay_tunnel_runtime_implemented',
        'release_tunnel_payload_endpoint_missing',
        'preview_store_forward_payload_queue_non_release_grade',
        'source_release_relay_tunnel_runtime_not_implemented',
        'source_preview_store_forward_payload_queue_non_release_grade',
        'source_release_relay_payload_marker_conflicts_with_preview_queue_only',
        'RELAY_TUNNEL_RUNTIME_IMPLEMENTED=true',
        'release payload endpoint queue-only legacy alias',
        'not the release /api/v1/relay/payload preflight endpoint',
        'it is not the release tunnel payload endpoint'
    )

    foreach ($needle in $requiredNeedles) {
        if (-not $source.Contains($needle)) {
            return $false
        }
    }
    return $true
}

function Test-P2pEnvStatusReleaseTunnelMarkerConflictContract {
    param([Parameter(Mandatory = $true)][string]$ScriptPath)

    $source = Get-Content -LiteralPath $ScriptPath -Raw
    $requiredNeedles = @(
        'release_relay_tunnel_runtime_source_contract_ready',
        'release_relay_tunnel_runtime_not_implemented_branch_active',
        'release_relay_tunnel_runtime_missing_source_hooks',
        'release_payload_preflight_endpoint_implemented = $sourceSummary.release_payload_preflight_endpoint_implemented',
        'release_relay_tunnel_runtime_implemented = $sourceSummary.release_relay_tunnel_runtime_implemented',
        'release_relay_tunnel_runtime_source_contract_ready = $sourceSummary.release_relay_tunnel_runtime_source_contract_ready',
        'release_relay_tunnel_runtime_not_implemented_branch_active = $sourceSummary.release_relay_tunnel_runtime_not_implemented_branch_active',
        'release_relay_tunnel_runtime_missing_source_hooks = @($sourceSummary.release_relay_tunnel_runtime_missing_source_hooks)',
        'preview_store_forward_payload_queue_non_release_grade = $sourceSummary.preview_store_forward_payload_queue_non_release_grade',
        'relay_transport_kind_release_grade = $sourceSummary.relay_transport_kind_release_grade',
        'release_payload_preflight_only',
        'release_payload_endpoint_marker_conflicts_with_preflight_only',
        'release_relay_tunnel_runtime_marker_conflicts_with_source_contract',
        'rust_source_submit_release_relay_tunnel_payload',
        'rust_target_accept_release_relay_tunnel_payload',
        'rust_transport_emits_quic_relay_tunnel_proof',
        'rust_delivery_records_release_relay_tunnel_payload',
        'source_release_relay_payload_marker_conflicts_with_preflight_only',
        'source_release_relay_tunnel_runtime_marker_conflicts_with_source_contract',
        'Do not set RELAY_PAYLOAD_ENDPOINT_IMPLEMENTED=true while /api/v1/relay/payload still returns preflight-only',
        'Do not set RELAY_TUNNEL_RUNTIME_IMPLEMENTED=true until the Rust source has release tunnel submit/accept hooks',
        'removes the release_relay_tunnel_runtime_not_implemented branch'
    )

    foreach ($needle in $requiredNeedles) {
        if (-not $source.Contains($needle)) {
            return $false
        }
    }
    return $true
}

function Test-P2pReleaseRelayTunnelRuntimeHookContract {
    param(
        [Parameter(Mandatory = $true)][string]$RendezvousPath,
        [Parameter(Mandatory = $true)][string]$RelayPayloadDrainPath
    )

    $rendezvous = Get-Content -LiteralPath $RendezvousPath -Raw
    $relayPayloadDrain = Get-Content -LiteralPath $RelayPayloadDrainPath -Raw
    $rendezvousNeedles = @(
        'submit_release_relay_tunnel_payload',
        'release_relay_tunnel_submission_contract',
        'quic_relay_tunnel',
        'quic_tls_1_3',
        'musu_quic_tls_transport',
        'release_relay_tunnel_runtime_not_implemented',
        'release_relay_tunnel_relay_url_not_wss',
        'release_relay_tunnel_peer_public_key_not_fingerprint',
        'release_relay_tunnel_payload_kind_not_forwarded_task_envelope',
        'release_relay_tunnel_payload_sha256_invalid',
        'payload_kind.trim() != "forwarded_task_envelope"',
        'is_hex_sha256'
    )
    $relayPayloadNeedles = @(
        'accept_release_relay_tunnel_payload',
        'release_relay_tunnel_acceptance_contract',
        'quic_relay_tunnel',
        'musu_quic_tls_transport',
        'release_grade: true',
        'release_relay_tunnel_payload_transport_kind_not_release_grade',
        'release_relay_tunnel_payload_not_release_grade',
        'release_relay_tunnel_payload_proof_mismatch'
    )

    foreach ($needle in $rendezvousNeedles) {
        if (-not $rendezvous.Contains($needle)) {
            return $false
        }
    }
    foreach ($needle in $relayPayloadNeedles) {
        if (-not $relayPayloadDrain.Contains($needle)) {
            return $false
        }
    }
    return $true
}

function Test-P2pRelayCandidateProtocolContract {
    param(
        [Parameter(Mandatory = $true)][string]$RendezvousStorePath,
        [Parameter(Mandatory = $true)][string]$RendezvousCandidatesRoutePath,
        [Parameter(Mandatory = $true)][string]$RoomPresenceRoutePath,
        [Parameter(Mandatory = $true)][string]$CloudPath,
        [Parameter(Mandatory = $true)][string]$CliCommandsPath
    )

    $rendezvousStore = Get-Content -LiteralPath $RendezvousStorePath -Raw
    $rendezvousCandidatesRoute = Get-Content -LiteralPath $RendezvousCandidatesRoutePath -Raw
    $roomPresenceRoute = Get-Content -LiteralPath $RoomPresenceRoutePath -Raw
    $cloud = Get-Content -LiteralPath $CloudPath -Raw
    $cliCommands = Get-Content -LiteralPath $CliCommandsPath -Raw

    $rendezvousStoreNeedles = @(
        'export type P2pRelayProtocol',
        '"quic_relay_tunnel"',
        'value === "quic_relay_tunnel"'
    )
    $webRouteNeedles = @(
        'relay_protocol: z.enum',
        '"quic_relay_tunnel"'
    )
    $cloudNeedles = @(
        'pub enum RelayProtocol',
        'QuicRelayTunnel',
        'quic_relay_tunnel'
    )
    $cliNeedles = @(
        'Relay transport protocol: quic_relay_tunnel',
        '"quic_relay_tunnel" => Ok(Some(crate::cloud::RelayProtocol::QuicRelayTunnel))',
        'unwrap_or(crate::cloud::RelayProtocol::QuicRelayTunnel)',
        'Some(crate::cloud::RelayProtocol::QuicRelayTunnel)'
    )

    foreach ($needle in $rendezvousStoreNeedles) {
        if (-not $rendezvousStore.Contains($needle)) {
            return $false
        }
    }
    foreach ($needle in $webRouteNeedles) {
        if (-not $rendezvousCandidatesRoute.Contains($needle)) {
            return $false
        }
        if (-not $roomPresenceRoute.Contains($needle)) {
            return $false
        }
    }
    foreach ($needle in $cloudNeedles) {
        if (-not $cloud.Contains($needle)) {
            return $false
        }
    }
    foreach ($needle in $cliNeedles) {
        if (-not $cliCommands.Contains($needle)) {
            return $false
        }
    }
    return $true
}

function Test-GoNoGoP2pEnvStatusSurfaceContract {
    param([Parameter(Mandatory = $true)][string]$ScriptPath)

    $source = Get-Content -LiteralPath $ScriptPath -Raw
    $requiredNeedles = @(
        '$p2pEnvStatusScript = Join-Path $scriptDir "show-musu-pro-p2p-env-status.ps1"',
        '$p2pEnvStatusArguments = @("-BaseUrl", $PublicMetadataBaseUrl, "-Version", $version, "-Json")',
        '"-EvidencePath", $p2pControlPlaneEvidenceCandidate.FullName',
        '$p2pEnvStatusReady',
        '$p2pEnvStatusBlockers',
        'P2P env blockers:',
        'p2p_control_plane_env_ready',
        'p2p_control_plane_env_blockers',
        'p2p_control_plane_env_status',
        'p2p_control_plane_env_ready:',
        'p2p_control_plane_env_blockers:'
    )

    foreach ($needle in $requiredNeedles) {
        if (-not $source.Contains($needle)) {
            return $false
        }
    }
    return $true
}

function Test-P2pRouteRecordMetadataVerifierContract {
    param([Parameter(Mandatory = $true)][string]$ScriptPath)

    $source = Get-Content -LiteralPath $ScriptPath -Raw
    $requiredNeedles = @(
        'relay route metadata coverage',
        'relay_route_metadata_required_count',
        'relay_route_metadata_valid_count',
        'relay_route_metadata_invalid_count',
        'candidate_addr',
        'total_attempt_ms',
        'peer_identity_verified',
        '$transportHandshakeMs -eq $recordHandshakeMs'
    )

    foreach ($needle in $requiredNeedles) {
        if (-not $source.Contains($needle)) {
            return $false
        }
    }
    return $true
}

function Test-P2pRouteMetadataStatusSurfaceContract {
    param(
        [Parameter(Mandatory = $true)][string]$RecorderScriptPath,
        [Parameter(Mandatory = $true)][string]$GoNoGoScriptPath,
        [Parameter(Mandatory = $true)][string]$ExternalScriptPath,
        [Parameter(Mandatory = $true)][string]$EnvStatusScriptPath,
        [Parameter(Mandatory = $true)][string]$FinalStatusScriptPath
    )

    $contracts = @(
        [pscustomobject]@{
            path = $RecorderScriptPath
            needles = @(
                'relay_route_metadata_required_count',
                'relay_route_metadata_valid_count',
                'relay_route_metadata_invalid_count',
                'Relay route metadata required count',
                'Relay route metadata valid count',
                'Relay route metadata invalid count'
            )
        },
        [pscustomobject]@{
            path = $GoNoGoScriptPath
            needles = @(
                'p2p_relay_route_metadata_required_count',
                'p2p_relay_route_metadata_valid_count',
                'p2p_relay_route_metadata_invalid_count',
                'relay_route_metadata_valid_count > 0',
                'p2p_relay_route_metadata_valid_count:'
            )
        },
        [pscustomobject]@{
            path = $ExternalScriptPath
            needles = @(
                'p2p_relay_route_metadata_required_count',
                'p2p_relay_route_metadata_valid_count',
                'p2p_relay_route_metadata_invalid_count',
                'p2p_relay_route_metadata_missing',
                'relay_route_metadata_required_count',
                'relay_route_metadata_valid_count',
                'relay_route_metadata_invalid_count'
            )
        },
        [pscustomobject]@{
            path = $EnvStatusScriptPath
            needles = @(
                'relay_route_metadata_valid_count',
                'relay_route_metadata_required_count',
                'relay_route_metadata_invalid_count',
                'live_evidence_relay_route_metadata_missing',
                'relay_route_metadata_valid_count > 0'
            )
        },
        [pscustomobject]@{
            path = $FinalStatusScriptPath
            needles = @(
                'p2p_relay_route_metadata_required_count',
                'p2p_relay_route_metadata_valid_count',
                'p2p_relay_route_metadata_invalid_count'
            )
        }
    )

    foreach ($contract in $contracts) {
        $source = Get-Content -LiteralPath $contract.path -Raw
        foreach ($needle in $contract.needles) {
            if (-not $source.Contains($needle)) {
                return $false
            }
        }
    }
    return $true
}

function Test-P2pProofCountStatusSurfaceContract {
    param(
        [Parameter(Mandatory = $true)][string]$RecorderScriptPath,
        [Parameter(Mandatory = $true)][string]$GoNoGoScriptPath,
        [Parameter(Mandatory = $true)][string]$ExternalScriptPath,
        [Parameter(Mandatory = $true)][string]$EnvStatusScriptPath,
        [Parameter(Mandatory = $true)][string]$FinalStatusScriptPath
    )

    $requiredNeedles = @(
        'relay_route_transport_proof_required_count',
        'relay_route_transport_proof_valid_count',
        'relay_route_transport_proof_invalid_count',
        'relay_payload_delivery_proof_required_count',
        'relay_payload_delivery_proof_valid_count',
        'relay_payload_delivery_proof_invalid_count'
    )
    $p2pRequiredNeedles = @(
        'p2p_relay_route_transport_proof_required_count',
        'p2p_relay_route_transport_proof_valid_count',
        'p2p_relay_route_transport_proof_invalid_count',
        'p2p_relay_payload_delivery_proof_required_count',
        'p2p_relay_payload_delivery_proof_valid_count',
        'p2p_relay_payload_delivery_proof_invalid_count'
    )

    foreach ($scriptPath in @($RecorderScriptPath, $EnvStatusScriptPath)) {
        $source = Get-Content -LiteralPath $scriptPath -Raw
        foreach ($needle in $requiredNeedles) {
            if (-not $source.Contains($needle)) {
                return $false
            }
        }
    }
    foreach ($scriptPath in @($GoNoGoScriptPath, $ExternalScriptPath, $FinalStatusScriptPath)) {
        $source = Get-Content -LiteralPath $scriptPath -Raw
        foreach ($needle in $p2pRequiredNeedles) {
            if (-not $source.Contains($needle)) {
                return $false
            }
        }
    }
    return $true
}

function Test-GoNoGoCurrentMsixLegacyConflictContract {
    param([Parameter(Mandatory = $true)][string]$ScriptPath)

    $source = Get-Content -LiteralPath $ScriptPath -Raw
    $requiredNeedles = @(
        'check-msix-legacy-conflicts.ps1',
        '$msixLegacyConflictsResult = Invoke-JsonScript',
        '$msixCurrentLegacyConflictsOk',
        'msix-current-legacy-conflicts',
        'Current Windows install state has legacy startup, bin, scheduled-task, or PATH alias conflicts.',
        'alias_shadowing',
        'alias_remediation',
        'msix_current_legacy_conflicts_ok',
        'msix_current_legacy_conflicts',
        'Current MSIX legacy conflict live check for startup helpers, scheduled tasks, legacy bins, and PATH alias shadowing'
    )

    foreach ($needle in $requiredNeedles) {
        if (-not $source.Contains($needle)) {
            return $false
        }
    }
    return $true
}

function Test-MsixLegacyConflictPersistedPathContract {
    param([Parameter(Mandatory = $true)][string]$ScriptPath)

    $source = Get-Content -LiteralPath $ScriptPath -Raw
    $requiredNeedles = @(
        'function Get-MusuAliasSourcesFromPath',
        'Split-PathList ([Environment]::GetEnvironmentVariable("Path", "Machine"))',
        'Split-PathList ([Environment]::GetEnvironmentVariable("Path", "User"))',
        'alias_path_scope = "persisted_user_machine"',
        'persisted PATH alias shadowing',
        'current_process_alias_sources',
        'current_process_first_alias_path',
        'current_process_alias_shadowing_count',
        'current_process_path_stale',
        'Start a fresh terminal or run release commands through the explicit WindowsApps alias.'
    )

    foreach ($needle in $requiredNeedles) {
        if (-not $source.Contains($needle)) {
            return $false
        }
    }
    return $true
}

function Test-OperatorApiSecurityRoomWorkOrderRejectedAuditContract {
    param([Parameter(Mandatory = $true)][string]$ScriptPath)

    $source = Get-Content -LiteralPath $ScriptPath -Raw
    $requiredNeedles = @(
        'room work order rejected input audit logging',
        'reason: "invalid_json"',
        'reason: "instruction required"',
        'POST audit-logs invalid JSON after P2P auth without forwarding to bridge',
        'POST requires a non-empty instruction',
        'bridge should not be called for invalid JSON',
        'bridge should not be called for rejected work orders',
        'assert.equal(audit.result, "rejected")',
        'assert.equal(audit.reason, "invalid_json")',
        'assert.equal(audit.reason, "instruction required")',
        'hasOwnProperty.call(audit, "text")',
        'hasOwnProperty.call(audit, "instruction")'
    )

    foreach ($needle in $requiredNeedles) {
        if (-not $source.Contains($needle)) {
            return $false
        }
    }
    return $true
}

function Test-OneMachineMusuProWorkOrderSmokeContract {
    param([Parameter(Mandatory = $true)][string]$ScriptPath)

    $source = Get-Content -LiteralPath $ScriptPath -Raw
    $requiredNeedles = @(
        'schema = "musu.one_machine_musu_pro_work_order.v1"',
        '"up", "--json"',
        '"doctor", "--json"',
        '"room", "presence", "publish"',
        '"room", "presence", "list"',
        '/api/rooms/',
        '/work-orders',
        'requires_desktop_outbound_pickup',
        'desktop_outbound_pickup',
        '"room", "work-orders", "drain"',
        'server_ack_count',
        'work_order_claim',
        'work_order_drain',
        'local bridge task response',
        'permission_envelope',
        'P2P control token',
        'owner_scoped',
        'post-run idle CPU evidence',
        'localhost:3001',
        'allow_unverified',
        'exit 1',
        'AllowUnverified'
    )

    foreach ($needle in $requiredNeedles) {
        if (-not $source.Contains($needle)) {
            return $false
        }
    }

    return (
        $source -like '*MUSU_P2P_CONTROL_TOKEN*' -and
        $source -like '*MUSU_ROUTE_EVIDENCE_TOKEN*' -and
        $source -like '*Join-Path $musuHomeCandidate "token"*' -and
        $source -like '*MUSU_CLOUD_BASE_URL*' -and
        $source -like '*measure-musu-idle-cpu.ps1*' -and
        $source -like '*-not $ok -and -not $AllowUnverified*'
    )
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
                    relay_transport_proof = [pscustomobject]@{
                        schema = "musu.relay_transport_proof.v1"
                        session_id = "rv_test"
                        lease_id = "relay-lease-test"
                        source_node_id = "pc-a"
                        target_node_id = "pc-b"
                        transport_kind = "quic_relay_tunnel"
                        relay_url = "wss://relay.musu.pro/api/v1/relay/connect"
                        tunnel_id = "relay-tunnel-test"
                        handshake_ms = 42
                        payload_bytes_transited = 128
                        payload_transited_musu_infra = $true
                        peer_identity_verified = $true
                        peer_identity_method = "quic_tls_cert_fingerprint"
                        peer_public_key = "sha256:test"
                        encryption = "quic_tls_1_3"
                        transport_verified_by = "musu_quic_tls_transport"
                        opened_at = $now.AddSeconds(-2).ToString("o")
                        closed_at = $now.ToString("o")
                    }
                    relay_payload_delivery_proof = [pscustomobject]@{
                        schema = "musu.relay_payload_delivery_proof.v1"
                        payload_id = "relay-payload-test"
                        session_id = "rv_test"
                        lease_id = "relay-lease-test"
                        source_node_id = "pc-a"
                        target_node_id = "pc-b"
                        relay_url = "wss://relay.musu.pro/api/v1/relay/connect"
                        tunnel_id = "relay-tunnel-test"
                        transport_kind = "quic_relay_tunnel"
                        relay_default_data_path = $false
                        release_grade = $true
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

function New-RouteReachabilityDiagnosticEvidence {
    [pscustomobject]@{
        schema = "musu.route_reachability_diagnostic.v1"
        version = $ExpectedVersion
        recorded_at_utc = $now.ToUniversalTime().ToString("o")
        recorded_at_kst = $now.ToOffset([timespan]::FromHours(9)).ToString("yyyy-MM-ddTHH:mm:sszzz")
        git_commit = $currentGitCommit
        git_dirty = $false
        operator_machine = "VERIFIER-TEST"
        status = [pscustomobject]@{
            schema = "musu.fleet_status_cli.v1"
            ok = $true
            bridge_url = "http://127.0.0.1:1158"
            this_node = [pscustomobject]@{
                name = "verifier-test"
                addr = "127.0.0.1:1158"
                healthy = $true
                is_self = $true
                version = $ExpectedVersion
            }
            peer = [pscustomobject]@{
                name = "SECOND-PC"
                addr = "192.168.1.192:8949"
                healthy = $false
                is_self = $false
                version = "unknown"
            }
            total_nodes = 2
            online_nodes = 1
        }
        route_explain = [pscustomobject]@{
            schema = "musu.route_explain.v1"
            version = $ExpectedVersion
            requested_target = "SECOND-PC"
            submission_endpoint = "http://192.168.1.192:8949/api/tasks/delegate"
            candidate_count = 1
            selected_candidate = [pscustomobject]@{
                name = "SECOND-PC"
                addr = "192.168.1.192:8949"
                source = "manual"
                route_kind = "lan"
                transport_scheme = "http"
                peer_identity_verified = $false
                peer_identity_method = $null
                peer_public_key_present = $false
                https_fingerprint_pin_available = $false
                encryption = "none_http_bearer"
                payload_transited_musu_infra = $false
            }
            current_transport = "http_bearer"
            bridge_path_selection_wired = $true
            rendezvous_session_wired = $true
            https_fingerprint_pinning_wired = $true
            release_grade_transport_required = "quic_tls_1_3"
            route_evidence_ready = $false
            release_blockers = @("peer_identity_verified=false for current manual/local HTTP route", "relay/tunnel fallback transport is not wired")
            path_priority = @("lan", "tailscale", "direct_quic", "relay")
            relay_policy = "relay is Connect/Pro fallback only; it must not become the default data path"
        }
        network_probe = [pscustomobject]@{
            target = "192.168.1.192"
            port = 8949
            tcp_test_succeeded = $false
            ping_succeeded = $false
            source_ipv4 = "192.168.1.154"
            source_prefix_length = 24
            interface_index = 12
            neighbor_entry_present = $true
            neighbor_link_layer_address = "A8-5E-45-15-38-C3"
            neighbor_state_raw = 5
            neighbor_entry_is_not_route_success_proof = $true
        }
        route_attempt = [pscustomobject]@{
            schema = "musu.route_evidence.v1"
            version = $ExpectedVersion
            source_node_id = "verifier-test"
            target_node_id = "SECOND-PC"
            route_kind = "lan"
            candidate_addr = "192.168.1.192:8949"
            result = "failed"
            failure_class = "submit_http_error"
            handshake_ms = 10006
            total_attempt_ms = 10006
            peer_identity_verified = $false
            encryption = "none_http_bearer"
            payload_transited_musu_infra = $false
        }
        conclusion = [pscustomobject]@{
            local_musu_desktop_runtime_healthy = $true
            target_peer_registered = $true
            target_peer_healthy = $false
            target_tcp_port_reachable = $false
            manual_lan_candidate_is_release_grade = $false
            musu_pro_relay_route_used = $false
            successful_multi_device_route_proof = $false
            release_interpretation = "Fixture failed reachability diagnostic."
        }
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

function New-RuntimeIdleCpuEvidence {
    param(
        [string]$Machine = "VERIFIER-TEST-IDLE",
        [switch]$OmitMatchingProcessInventory
    )

    $measurement = New-RuntimeMeasurement
    $evidence = [pscustomobject]@{
        schema = "musu.runtime_idle_cpu_evidence.v1"
        ok = $true
        version = $ExpectedVersion
        git_commit = $currentGitCommit
        git_dirty = $false
        git_status_short = ""
        started_at = $now.AddSeconds(-120).ToString("o")
        completed_at = $now.AddSeconds(-60).ToString("o")
        operator_machine = $Machine
        operator_user = "verifier-test"
        scenario = "desktop-open"
        require_owned_webview2 = $true
        sample_seconds = 60
        logical_processor_count = 16
        max_one_core_percent = 5.0
        max_owned_process_count = 16
        max_owned_webview2_process_count = 8
        max_total_working_set_mb = 1024.0
        process_names = @("musu", "msedgewebview2", "node")
        musu_process_names = @("musu")
        include_node = $true
        include_webview2 = $true
        include_unrelated_helpers = $false
        helper_process_scope = "musu_process_tree_or_repo_related"
        process_metadata_available = $true
        process_metadata_timed_out = $false
        bridge_registry = [pscustomobject]@{
            exists = $true
            pid = 1234
        }
        process_count_before = 8
        process_count_after = 8
        musu_process_count_after = 2
        matching_process_inventory = [pscustomobject]@{
            musu = [pscustomobject]@{
                machine_wide = 2
            }
            node = [pscustomobject]@{
                machine_wide = 4
                owned_by_musu_process_tree = 0
                repo_related_unowned = 0
                unowned_other = 4
            }
            webview2 = [pscustomobject]@{
                machine_wide = 6
                owned_by_musu_process_tree = 6
                unowned_other = 0
            }
            other = [pscustomobject]@{
                machine_wide = 0
            }
        }
        target_process_running = $true
        process_counts_by_role = $measurement.process_counts_by_role
        process_counts_by_subrole = $measurement.process_counts_by_subrole
        total_working_set_mb_after = $measurement.total_working_set_mb_after
        total_private_memory_mb_after = $measurement.total_private_memory_mb_after
        memory_totals_by_role_mb = [pscustomobject]@{
            musu = 180.0
            node = 0.0
            webview2 = 170.0
            other = 0.0
        }
        memory_totals_by_subrole_mb = [pscustomobject]@{
            musu_runtime = 0.0
            bridge_runtime = 90.0
            desktop_shell = 90.0
            node_helper = 0.0
            webview2_helper = 170.0
            other = 0.0
        }
        resource_budget_violations = @()
        hot_process_count = 0
        max_one_core_percent_by_role = $measurement.max_one_core_percent_by_role
        max_one_core_percent_by_subrole = $measurement.max_one_core_percent_by_subrole
        doctor_background_snapshot = [pscustomobject]@{
            schema = "musu.runtime_cpu_background_snapshot.v1"
            command = "musu doctor --json"
            captured_at = $now.AddSeconds(-90).ToString("o")
            overall = "ok"
            distribution = "store-msix"
            doctor_schema_complete = $true
            background_field_fallback_used = $false
            runtime_loop_candidate_fallback_used = $false
            expected_runtime_loop_candidate_keys = @("mdns_discovery", "clipboard_polling", "cloud_heartbeat", "file_sync_watch", "relay_target_polling", "autonomous_planner", "health_check_retry", "auto_update_supervisor", "bridge_readiness_wait", "log_telemetry_flush")
            missing_background_fields = @()
            missing_runtime_loop_candidate_keys = @()
            account_logged_in = $true
            bridge_service_registry_pid = 1234
            bridge_health_http_status = 200
            dashboard_reachable_url = "http://127.0.0.1:3000/app"
            background = [pscustomobject]@{
                status = "ok"
                mdns_enabled = $false
                mdns_ipv6_enabled = $false
                mdns_tailscale_enabled = $false
                mdns_virtual_interfaces_enabled = $false
                clipboard_sync_enabled = $false
                cloud_registration_enabled = $true
                cloud_heartbeat_interval_sec = 300
                cloud_heartbeat_floor_sec = 60
                file_sync_enabled = $false
                file_serve_root_count = 0
                file_serve_writable = $false
                relay_payload_poller_enabled = $false
                relay_payload_poller_interval_sec = 60
                relay_payload_poller_interval_floor_sec = 60
                relay_payload_poller_empty_backoff_max_sec = 300
                relay_payload_poller_empty_backoff_ceiling_sec = 300
                relay_payload_poller_limit = 1
                planner_enabled = $false
                planner_interval_sec = 300
                planner_interval_floor_sec = 300
                planner_command_timeout_sec = 120
                planner_command_timeout_floor_sec = 120
                planner_command_timeout_ceiling_sec = 1800
                auto_update_supervise_enabled = $false
                auto_update_check_interval_minutes = 60
                auto_update_check_interval_floor_minutes = 5
                auto_update_health_poll_initial_ms = 250
                auto_update_health_poll_max_ms = 2000
                bridge_health_poll_initial_ms = 250
                bridge_health_poll_max_ms = 2000
                runtime_loop_candidates = @(
                    [pscustomobject]@{ key = "mdns_discovery"; label = "mDNS discovery"; active = $false; activation_mode = "env-opt-in"; note = "All mDNS discovery toggles are off." },
                    [pscustomobject]@{ key = "clipboard_polling"; label = "Clipboard polling"; active = $false; activation_mode = "env-opt-in"; note = "Clipboard polling is off because MUSU_ENABLE_CLIPBOARD_SYNC is not set." },
                    [pscustomobject]@{ key = "cloud_heartbeat"; label = "Cloud heartbeat"; active = $true; activation_mode = "login-gated"; note = "Account login is present, so cloud registration can heartbeat at 300s." },
                    [pscustomobject]@{ key = "file_sync_watch"; label = "File sync/watch"; active = $false; activation_mode = "shared-root-config"; note = "No shared roots are configured, so file watcher/sync stays off." },
                    [pscustomobject]@{ key = "relay_target_polling"; label = "Relay target polling"; active = $false; activation_mode = "env-opt-in"; note = "Relay target polling is off because MUSU_ENABLE_RELAY_PAYLOAD_POLLER is not set." },
                    [pscustomobject]@{ key = "autonomous_planner"; label = "Autonomous planner"; active = $false; activation_mode = "env-opt-in"; note = "Planner is off because MUSU_ENABLE_PLANNER is not set." },
                    [pscustomobject]@{ key = "health_check_retry"; label = "Health check retry"; active = $false; activation_mode = "update-config"; note = "Health check retry stays off until update.toml enables a source and `musu auto-update --supervise` is launched." },
                    [pscustomobject]@{ key = "auto_update_supervisor"; label = "Auto-update supervisor"; active = $false; activation_mode = "update-config"; note = "update.toml is absent, so auto-update supervision stays off." },
                    [pscustomobject]@{ key = "bridge_readiness_wait"; label = "Bridge readiness wait"; active = $false; activation_mode = "request-scoped"; note = "CLI bridge readiness waits only run during commands like `musu up`/`musu bridge`, using bounded 250-2000ms backoff until the caller timeout expires." },
                    [pscustomobject]@{ key = "log_telemetry_flush"; label = "Log/telemetry flush"; active = $false; activation_mode = "one-shot-cli"; note = "Telemetry/log flush primitives are limited to explicit one-shot CLI/reporting surfaces; no background flush worker is expected." }
                )
                active_runtime_loop_candidate_count = 1
                active_runtime_loop_candidate_keys = @("cloud_heartbeat")
            }
        }
        cpu_attribution = $measurement.cpu_attribution
        samples = @(
            [pscustomobject]@{
                id = 1234
                process_name = "musu"
                cpu_pct_one_core = 0.1
            },
            [pscustomobject]@{
                id = 5678
                process_name = "msedgewebview2"
                cpu_pct_one_core = 0.2
            },
            [pscustomobject]@{
                id = 6789
                process_name = "musu"
                cpu_pct_one_core = 0.0
            }
        )
        note = "fixture"
        evidence_path = "fixture"
    }

    if ($OmitMatchingProcessInventory) {
        $evidence.PSObject.Properties.Remove("matching_process_inventory")
    }

    return $evidence
}

function New-ProcessAttributionSummaryEvidence {
    param([string]$Machine = "VERIFIER-TEST-PROCESS-ATTRIBUTION")

    [pscustomobject]@{
        schema = "musu.process_attribution_summary.v1"
        ok = $true
        generated_at = $now.ToString("o")
        summary_path = "fixture"
        audit_evidence_path = "fixture-process-ownership.json"
        operator_machine = $Machine
        bridge_registry = [pscustomobject]@{
            pid = 1234
            pid_alive = $true
            health = [pscustomobject]@{
                ok = $true
                http_status = 200
            }
        }
        counts = [pscustomobject]@{
            musu_runtime = 1
            musu_cli = 0
            desktop_shell = 1
            machine_wide_node = 4
            owned_node = 0
            unowned_node = 4
            machine_wide_webview2 = 6
            owned_webview2 = 6
            unowned_webview2 = 0
            orphan_repo_helpers = 0
        }
        findings = @(
            "Machine-wide node.exe processes are present, but none are owned by the live MUSU process tree.",
            "6 WebView2 helper process(es) are owned by MUSU.",
            "Process ownership release checks pass."
        )
        checks = @(
            [pscustomobject]@{ scope = "process-ownership"; name = "bridge registry pid alive"; status = "pass"; message = "bridge registry pid is alive" },
            [pscustomobject]@{ scope = "process-ownership"; name = "bridge health"; status = "pass"; message = "bridge /health passed" },
            [pscustomobject]@{ scope = "process-ownership"; name = "orphan repo helper count"; status = "pass"; message = "no repo-related orphan helper processes detected" }
        )
        top_node_processes = @()
        top_webview2_processes = @()
    }
}

function Write-RepoEvidenceFixture {
    param(
        [Parameter(Mandatory = $true)][string]$RelativePath,
        [Parameter(Mandatory = $true)]$Object
    )

    $fullPath = Join-Path $repoRoot $RelativePath
    $parent = Split-Path -Parent $fullPath
    New-Item -ItemType Directory -Force -Path $parent | Out-Null
    $Object | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $fullPath -Encoding UTF8
    return $fullPath
}

function Get-GoNoGoRuntimeIdleCandidate {
    param(
        [Parameter(Mandatory = $true)]$GoNoGoJson,
        [Parameter(Mandatory = $true)][string]$EvidencePath
    )

    $runtimeIdle = if ($GoNoGoJson.PSObject.Properties["runtime_idle_cpu_evidence"]) { $GoNoGoJson.runtime_idle_cpu_evidence } else { $null }
    if ($null -eq $runtimeIdle -or -not $runtimeIdle.PSObject.Properties["candidates"]) {
        return $null
    }

    foreach ($candidate in @($runtimeIdle.candidates)) {
        $candidatePath = if ($candidate.PSObject.Properties["evidence_path"]) { [string]$candidate.evidence_path } else { "" }
        if ($candidatePath -eq $EvidencePath) {
            return $candidate
        }
    }

    return $null
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
    doctor_background_snapshot = [pscustomobject]@{
        schema = "musu.runtime_cpu_background_snapshot.v1"
        command = "musu doctor --json"
        captured_at = $now.AddSeconds(-30).ToString("o")
        overall = "ok"
        distribution = "store-msix"
        doctor_schema_complete = $true
        background_field_fallback_used = $false
        runtime_loop_candidate_fallback_used = $false
        expected_runtime_loop_candidate_keys = @("mdns_discovery", "clipboard_polling", "cloud_heartbeat", "file_sync_watch", "relay_target_polling", "autonomous_planner", "health_check_retry", "auto_update_supervisor", "bridge_readiness_wait", "log_telemetry_flush")
        missing_background_fields = @()
        missing_runtime_loop_candidate_keys = @()
        account_logged_in = $true
        bridge_service_registry_pid = 1234
        bridge_health_http_status = 200
        dashboard_reachable_url = "http://127.0.0.1:3000/app"
        background = [pscustomobject]@{
            status = "ok"
            mdns_enabled = $false
            mdns_ipv6_enabled = $false
            mdns_tailscale_enabled = $false
            mdns_virtual_interfaces_enabled = $false
            clipboard_sync_enabled = $false
            cloud_registration_enabled = $true
            cloud_heartbeat_interval_sec = 300
            cloud_heartbeat_floor_sec = 60
            file_sync_enabled = $false
            file_serve_root_count = 0
            file_serve_writable = $false
            relay_payload_poller_enabled = $false
            relay_payload_poller_interval_sec = 60
            relay_payload_poller_interval_floor_sec = 60
            relay_payload_poller_empty_backoff_max_sec = 300
            relay_payload_poller_empty_backoff_ceiling_sec = 300
            relay_payload_poller_limit = 1
            planner_enabled = $false
            planner_interval_sec = 300
            planner_interval_floor_sec = 300
            planner_command_timeout_sec = 120
            planner_command_timeout_floor_sec = 120
            planner_command_timeout_ceiling_sec = 1800
            auto_update_supervise_enabled = $false
            auto_update_check_interval_minutes = 60
            auto_update_check_interval_floor_minutes = 5
            auto_update_health_poll_initial_ms = 250
            auto_update_health_poll_max_ms = 2000
            bridge_health_poll_initial_ms = 250
            bridge_health_poll_max_ms = 2000
            runtime_loop_candidates = @(
                [pscustomobject]@{ key = "mdns_discovery"; label = "mDNS discovery"; active = $false; activation_mode = "env-opt-in"; note = "All mDNS discovery toggles are off." },
                [pscustomobject]@{ key = "clipboard_polling"; label = "Clipboard polling"; active = $false; activation_mode = "env-opt-in"; note = "Clipboard polling is off because MUSU_ENABLE_CLIPBOARD_SYNC is not set." },
                [pscustomobject]@{ key = "cloud_heartbeat"; label = "Cloud heartbeat"; active = $true; activation_mode = "login-gated"; note = "Account login is present, so cloud registration can heartbeat at 300s." },
                [pscustomobject]@{ key = "file_sync_watch"; label = "File sync/watch"; active = $false; activation_mode = "shared-root-config"; note = "No shared roots are configured, so file watcher/sync stays off." },
                [pscustomobject]@{ key = "relay_target_polling"; label = "Relay target polling"; active = $false; activation_mode = "env-opt-in"; note = "Relay target polling is off because MUSU_ENABLE_RELAY_PAYLOAD_POLLER is not set." },
                [pscustomobject]@{ key = "autonomous_planner"; label = "Autonomous planner"; active = $false; activation_mode = "env-opt-in"; note = "Planner is off because MUSU_ENABLE_PLANNER is not set." },
                [pscustomobject]@{ key = "health_check_retry"; label = "Health check retry"; active = $false; activation_mode = "update-config"; note = "Health check retry stays off until update.toml enables a source and `musu auto-update --supervise` is launched." },
                [pscustomobject]@{ key = "auto_update_supervisor"; label = "Auto-update supervisor"; active = $false; activation_mode = "update-config"; note = "update.toml is absent, so auto-update supervision stays off." },
                [pscustomobject]@{ key = "bridge_readiness_wait"; label = "Bridge readiness wait"; active = $false; activation_mode = "request-scoped"; note = "CLI bridge readiness waits only run during commands like `musu up`/`musu bridge`, using bounded 250-2000ms backoff until the caller timeout expires." },
                [pscustomobject]@{ key = "log_telemetry_flush"; label = "Log/telemetry flush"; active = $false; activation_mode = "one-shot-cli"; note = "Telemetry/log flush primitives are limited to explicit one-shot CLI/reporting surfaces; no background flush worker is expected." }
            )
            active_runtime_loop_candidate_count = 1
            active_runtime_loop_candidate_keys = @("cloud_heartbeat")
        }
    }
    route_probe = [pscustomobject]@{
        ok = $true
        expected_token = "MUSU_CPU_SCENARIO_ROUTE_OK_VERIFIER_TEST"
        target = $null
        route_explain_command = "musu route --explain --json `"Reply exactly: MUSU_CPU_SCENARIO_ROUTE_OK_VERIFIER_TEST`""
        route_explain_exit_code = 0
        route_explain_stdout = '{"schema":"musu.route_explain.v1","version":"1.15.0-rc.1","requested_target":null,"channel":"cli","needs_gpu":false,"submission_endpoint":"http://127.0.0.1:9741/api/tasks/delegate","selected_candidate":null,"candidate_count":0,"current_transport":"http_bearer","bridge_path_selection_wired":true,"rendezvous_session_wired":true,"https_fingerprint_pinning_wired":true,"release_grade_transport_required":"quic_tls_1_3","route_evidence_ready":false,"release_blockers":["peer_identity_verified=false for current manual/local HTTP route"],"path_priority":["lan","tailscale","direct_quic","relay"],"relay_policy":"relay is Connect/Pro fallback only; it must not become the default data path"}'
        route_explain_stderr = ""
        route_explain_output = '{"schema":"musu.route_explain.v1","version":"1.15.0-rc.1","requested_target":null,"channel":"cli","needs_gpu":false,"submission_endpoint":"http://127.0.0.1:9741/api/tasks/delegate","selected_candidate":null,"candidate_count":0,"current_transport":"http_bearer","bridge_path_selection_wired":true,"rendezvous_session_wired":true,"https_fingerprint_pinning_wired":true,"release_grade_transport_required":"quic_tls_1_3","route_evidence_ready":false,"release_blockers":["peer_identity_verified=false for current manual/local HTTP route"],"path_priority":["lan","tailscale","direct_quic","relay"],"relay_policy":"relay is Connect/Pro fallback only; it must not become the default data path"}'
        route_explain = [pscustomobject]@{
            schema = "musu.route_explain.v1"
            version = $ExpectedVersion
            requested_target = $null
            channel = "cli"
            needs_gpu = $false
            submission_endpoint = "http://127.0.0.1:9741/api/tasks/delegate"
            selected_candidate = $null
            candidate_count = 0
            current_transport = "http_bearer"
            bridge_path_selection_wired = $true
            rendezvous_session_wired = $true
            https_fingerprint_pinning_wired = $true
            release_grade_transport_required = "quic_tls_1_3"
            route_evidence_ready = $false
            release_blockers = @("peer_identity_verified=false for current manual/local HTTP route")
            path_priority = @("lan", "tailscale", "direct_quic", "relay")
            relay_policy = "relay is Connect/Pro fallback only; it must not become the default data path"
        }
        command = "musu route --wait `"Reply exactly: MUSU_CPU_SCENARIO_ROUTE_OK_VERIFIER_TEST`""
        arguments = @("route", "--wait", "Reply exactly: MUSU_CPU_SCENARIO_ROUTE_OK_VERIFIER_TEST")
        network_probe = [pscustomobject]@{
            target = ""
            port = $null
            tcp_test_succeeded = $null
            ping_succeeded = $null
        }
        route_evidence_path = "F:\workspace\musu-bee\.local-build\runtime-cpu-scenarios\fixture.post-route.route-evidence.json"
        route_attempt_evidence = [pscustomobject]@{
            schema = "musu.route_evidence.v1"
            version = $ExpectedVersion
            recorded_at = $now.AddSeconds(-80).ToString("o")
            target_node_id = ""
            candidate_addr = "http://127.0.0.1:9741/api/tasks/delegate"
            route_kind = "local"
            result = "success"
            handshake_ms = 5
            total_attempt_ms = 7
            peer_identity_verified = $false
            peer_identity_method = $null
            peer_public_key = $null
            encryption = "none_http_bearer"
            payload_transited_musu_infra = $false
        }
        exit_code = 0
        raw_exit_code = 0
        stdout = "MUSU_CPU_SCENARIO_ROUTE_OK_VERIFIER_TEST"
        stderr = ""
        output = "MUSU_CPU_SCENARIO_ROUTE_OK_VERIFIER_TEST"
        wait_timeout_sec = 180
        command_timeout_sec = 210
        max_attempts = 1
        attempt_count = 1
        attempts = @(
            [pscustomobject]@{
                attempt = 1
                started_at = $now.AddSeconds(-90).ToString("o")
                exit_code = 0
                raw_exit_code = 0
                stdout = "MUSU_CPU_SCENARIO_ROUTE_OK_VERIFIER_TEST"
                stderr = ""
                output = "MUSU_CPU_SCENARIO_ROUTE_OK_VERIFIER_TEST"
                ok = $true
                retry_after_s = $null
                timeout_sec = 210
            }
        )
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
$runtimeCpuScenarioMatrixVerifierScript = Join-Path $scriptDir "verify-runtime-cpu-scenario-matrix.ps1"
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

$outputRootHygieneContractOk = Test-RuntimeCpuScenarioMatrixOutputRootHygieneContract -ScriptPath $runtimeCpuMeasureScript
$invocation = New-StaticVerifierInvocation `
    -Ok $outputRootHygieneContractOk `
    -Message "runtime CPU matrix capture must reject tracked in-repo OutputRoot paths before scenario files can dirty later samples"
Add-CaseResult `
    -Cases $cases `
    -Name "runtime CPU matrix rejects tracked in-repo output roots" `
    -Verifier "runtime CPU matrix source contract" `
    -FixturePath $runtimeCpuMeasureScript `
    -ShouldPass $true `
    -Invocation $invocation

$doctorSnapshotContractOk = Test-RuntimeCpuScenarioMatrixDoctorSnapshotContract `
    -MeasureScriptPath $runtimeCpuMeasureScript `
    -VerifierScriptPath $runtimeCpuScenarioMatrixVerifierScript
$invocation = New-StaticVerifierInvocation `
    -Ok $doctorSnapshotContractOk `
    -Message "runtime CPU matrix capture must record doctor background feature state and the verifier must require it"
Add-CaseResult `
    -Cases $cases `
    -Name "runtime CPU matrix captures doctor background feature snapshot" `
    -Verifier "runtime CPU matrix source contract" `
    -FixturePath $runtimeCpuMeasureScript `
    -ShouldPass $true `
    -Invocation $invocation

$postRouteDiagnosticContractOk = Test-RuntimeCpuScenarioMatrixPostRouteDiagnosticContract `
    -MeasureScriptPath $runtimeCpuMeasureScript `
    -VerifierScriptPath $runtimeCpuScenarioMatrixVerifierScript
$invocation = New-StaticVerifierInvocation `
    -Ok $postRouteDiagnosticContractOk `
    -Message "runtime CPU matrix post-route capture must preserve route explain, network probe, and raw route attempt evidence and the verifier must require them"
Add-CaseResult `
    -Cases $cases `
    -Name "runtime CPU matrix captures post-route route diagnostics" `
    -Verifier "runtime CPU matrix source contract" `
    -FixturePath $runtimeCpuMeasureScript `
    -ShouldPass $true `
    -Invocation $invocation

$supportMailboxRequestContractOk = Test-SupportMailboxVerificationRequestContract -ScriptPath $supportMailboxRequestPreparer
$invocation = New-StaticVerifierInvocation `
    -Ok $supportMailboxRequestContractOk `
    -Message "support mailbox request packet must prepare the operator email/record command without creating release evidence"
Add-CaseResult `
    -Cases $cases `
    -Name "support mailbox request packet is not release evidence" `
    -Verifier "support mailbox request source contract" `
    -FixturePath $supportMailboxRequestPreparer `
    -ShouldPass $true `
    -Invocation $invocation

$supportVerifierSource = Get-Content -LiteralPath $supportVerifier -Raw
$supportVerifierRejectsPlaceholdersOk = (
    $supportVerifierSource -like "*from address placeholder*" -and
    $supportVerifierSource -like "*replace_with*" -and
    $supportVerifierSource -like "*@example\.*"
)
$invocation = New-StaticVerifierInvocation `
    -Ok $supportVerifierRejectsPlaceholdersOk `
    -Message "support mailbox verifier must reject placeholder sender addresses"
Add-CaseResult `
    -Cases $cases `
    -Name "support mailbox verifier rejects placeholder sender addresses" `
    -Verifier "support mailbox verifier source contract" `
    -FixturePath $supportVerifier `
    -ShouldPass $true `
    -Invocation $invocation

$supportFixtureSentAt = ([datetimeoffset]::Now.AddMinutes(-3)).ToString("o")
$supportFixtureReceivedAt = ([datetimeoffset]::Now.AddMinutes(-2)).ToString("o")
$supportFixtureRecordedAt = ([datetimeoffset]::Now.AddMinutes(-1)).ToString("o")
$validSupportMailboxEvidence = [pscustomobject]@{
    schema = "musu.support_mailbox_evidence.v1"
    ok = $true
    version = $ExpectedVersion
    support_email = "musu@musu.pro"
    verification_id = "musu-support-verifier-20260607-abcdef1234567890"
    from_address = "operator@external.test"
    received_by = "HUGH_SECOND"
    sent_at = $supportFixtureSentAt
    received_at = $supportFixtureReceivedAt
    recorded_at = $supportFixtureRecordedAt
    operator_machine = "VERIFIER-TEST"
    operator_user = "verifier"
    notes = "fixture"
}
$fixture = Write-Fixture -Name "support-mailbox-valid" -Object $validSupportMailboxEvidence
$invocation = Invoke-Verifier -ScriptPath $supportVerifier -Arguments @("-EvidencePath", $fixture, "-ExpectedSupportEmail", "musu@musu.pro", "-ExpectedVersion", $ExpectedVersion, "-Json")
Add-CaseResult -Cases $cases -Name "support mailbox accepts real external sender evidence" -Verifier "verify-support-mailbox-evidence.ps1" -FixturePath $fixture -ShouldPass $true -Invocation $invocation

$placeholderSupportMailboxEvidence = Copy-JsonObject -Object $validSupportMailboxEvidence
$placeholderSupportMailboxEvidence.from_address = "<sender@example.com>"
$fixture = Write-Fixture -Name "support-mailbox-placeholder-sender" -Object $placeholderSupportMailboxEvidence
$invocation = Invoke-Verifier -ScriptPath $supportVerifier -Arguments @("-EvidencePath", $fixture, "-ExpectedSupportEmail", "musu@musu.pro", "-ExpectedVersion", $ExpectedVersion, "-Json")
Add-CaseResult -Cases $cases -Name "support mailbox rejects placeholder sender evidence" -Verifier "verify-support-mailbox-evidence.ps1" -FixturePath $fixture -ShouldPass $false -Invocation $invocation -RequireParsed

$targetBindingContractOk = Test-RuntimeCpuScenarioMatrixTargetBindingContract -ScriptPath $runtimeCpuScenarioMatrixVerifierScript
$invocation = New-StaticVerifierInvocation `
    -Ok $targetBindingContractOk `
    -Message "runtime CPU matrix verifier must bind targeted post-route evidence to the recorded route command and arguments"
Add-CaseResult `
    -Cases $cases `
    -Name "runtime CPU matrix target command binding contract" `
    -Verifier "runtime CPU matrix source contract" `
    -FixturePath $runtimeCpuScenarioMatrixVerifierScript `
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

$secondPcTargetedRouteVerifierContractOk = Test-SecondPcTargetedRouteVerifierContract -ScriptPath (Join-Path $scriptDir "run-second-pc-release-check.ps1")
$invocation = New-StaticVerifierInvocation `
    -Ok $secondPcTargetedRouteVerifierContractOk `
    -Message "second-PC release check must require target-bound post-route verification and reject self/local targets when a runtime CPU route target is supplied"
Add-CaseResult `
    -Cases $cases `
    -Name "second-PC targeted runtime CPU route verification contract" `
    -Verifier "second-PC release check source contract" `
    -FixturePath (Join-Path $scriptDir "run-second-pc-release-check.ps1") `
    -ShouldPass $true `
    -Invocation $invocation

$secondPcRuntimeIdleVerifierContractOk = Test-SecondPcRuntimeIdleVerifierContract -ScriptPath (Join-Path $scriptDir "run-second-pc-release-check.ps1")
$invocation = New-StaticVerifierInvocation `
    -Ok $secondPcRuntimeIdleVerifierContractOk `
    -Message "second-PC release check must direct-verify the desktop-open runtime idle evidence and surface runtime_idle_cpu_verified"
Add-CaseResult `
    -Cases $cases `
    -Name "second-PC release check verifies runtime idle CPU evidence" `
    -Verifier "second-PC release check source contract" `
    -FixturePath (Join-Path $scriptDir "run-second-pc-release-check.ps1") `
    -ShouldPass $true `
    -Invocation $invocation

$secondPcProcessAttributionVerifierContractOk = Test-SecondPcProcessAttributionVerifierContract -ScriptPath (Join-Path $scriptDir "run-second-pc-release-check.ps1")
$invocation = New-StaticVerifierInvocation `
    -Ok $secondPcProcessAttributionVerifierContractOk `
    -Message "second-PC release check must direct-verify the captured process attribution summary and surface process_attribution_verified"
Add-CaseResult `
    -Cases $cases `
    -Name "second-PC release check verifies process attribution summary" `
    -Verifier "second-PC release check source contract" `
    -FixturePath (Join-Path $scriptDir "run-second-pc-release-check.ps1") `
    -ShouldPass $true `
    -Invocation $invocation

$secondPcRouteReachabilityHandoffOk = Test-SecondPcRouteReachabilityHandoffContract -ScriptPath (Join-Path $scriptDir "run-second-pc-release-check.ps1")
$invocation = New-StaticVerifierInvocation `
    -Ok $secondPcRouteReachabilityHandoffOk `
    -Message "second-PC release check must return route reachability diagnostics when a non-local target is supplied"
Add-CaseResult `
    -Cases $cases `
    -Name "second-PC release check returns route reachability diagnostics" `
    -Verifier "second-PC route reachability source contract" `
    -FixturePath (Join-Path $scriptDir "run-second-pc-release-check.ps1") `
    -ShouldPass $true `
    -Invocation $invocation

$secondPcReleaseCheckRouteTargetConsistencyOk = Test-SecondPcReleaseCheckRouteTargetConsistencyContract -ScriptPath (Join-Path $scriptDir "run-second-pc-release-check.ps1")
$invocation = New-StaticVerifierInvocation `
    -Ok $secondPcReleaseCheckRouteTargetConsistencyOk `
    -Message "second-PC release check must reject mismatched runtime CPU and route reachability targets and surface target consistency in its summary"
Add-CaseResult `
    -Cases $cases `
    -Name "second-PC release check enforces route target consistency" `
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

$secondPcImportRuntimeIdleVerifierContractOk = Test-SecondPcImportRuntimeIdleVerifierContract -ScriptPath (Join-Path $scriptDir "import-second-pc-return.ps1")
$invocation = New-StaticVerifierInvocation `
    -Ok $secondPcImportRuntimeIdleVerifierContractOk `
    -Message "second-PC return import must direct-verify imported runtime idle CPU evidence and require runtime_idle_cpu_verified from the release-check summary"
Add-CaseResult `
    -Cases $cases `
    -Name "second-PC return import verifies runtime idle CPU evidence" `
    -Verifier "second-PC import source contract" `
    -FixturePath (Join-Path $scriptDir "import-second-pc-return.ps1") `
    -ShouldPass $true `
    -Invocation $invocation

$secondPcImportRuntimeMatrixVerifierContractOk = Test-SecondPcImportRuntimeMatrixVerifierContract -ScriptPath (Join-Path $scriptDir "import-second-pc-return.ps1")
$invocation = New-StaticVerifierInvocation `
    -Ok $secondPcImportRuntimeMatrixVerifierContractOk `
    -Message "second-PC return import must direct-verify imported runtime CPU matrix evidence on primary HEAD and require the verification result in release-gate imports"
Add-CaseResult `
    -Cases $cases `
    -Name "second-PC return import verifies runtime CPU matrix evidence" `
    -Verifier "second-PC import source contract" `
    -FixturePath (Join-Path $scriptDir "import-second-pc-return.ps1") `
    -ShouldPass $true `
    -Invocation $invocation

$secondPcImportProcessAttributionVerifierContractOk = Test-SecondPcImportProcessAttributionVerifierContract -ScriptPath (Join-Path $scriptDir "import-second-pc-return.ps1")
$invocation = New-StaticVerifierInvocation `
    -Ok $secondPcImportProcessAttributionVerifierContractOk `
    -Message "second-PC return import must direct-verify imported process attribution summaries on primary HEAD and require the verification result in release-gate imports"
Add-CaseResult `
    -Cases $cases `
    -Name "second-PC return import verifies process attribution summary" `
    -Verifier "second-PC import source contract" `
    -FixturePath (Join-Path $scriptDir "import-second-pc-return.ps1") `
    -ShouldPass $true `
    -Invocation $invocation

$secondPcImportRouteReachabilityOk = Test-SecondPcImportRouteReachabilityContract -ScriptPath (Join-Path $scriptDir "import-second-pc-return.ps1")
$invocation = New-StaticVerifierInvocation `
    -Ok $secondPcImportRouteReachabilityOk `
    -Message "second-PC return import must copy and verify route reachability diagnostics when the release-check required them, and reject mismatched second-PC route targets"
Add-CaseResult `
    -Cases $cases `
    -Name "second-PC return import verifies route reachability diagnostics" `
    -Verifier "second-PC route reachability source contract" `
    -FixturePath (Join-Path $scriptDir "import-second-pc-return.ps1") `
    -ShouldPass $true `
    -Invocation $invocation

$secondPcKitMetadataOk = Test-SecondPcKitMetadataContract -ScriptPath (Join-Path $scriptDir "prepare-multidevice-test-kit.ps1")
$invocation = New-StaticVerifierInvocation `
    -Ok $secondPcKitMetadataOk `
    -Message "second-PC multi-device kit must embed kit-build-metadata.json with source git commit fallback for offline operator runs"
Add-CaseResult `
    -Cases $cases `
    -Name "second-PC kit embeds source git metadata" `
    -Verifier "second-PC kit source contract" `
    -FixturePath (Join-Path $scriptDir "prepare-multidevice-test-kit.ps1") `
    -ShouldPass $true `
    -Invocation $invocation

$secondPcKitProcessAttributionVerifierOk = Test-SecondPcKitProcessAttributionVerifierContract -ScriptPath (Join-Path $scriptDir "prepare-multidevice-test-kit.ps1")
$invocation = New-StaticVerifierInvocation `
    -Ok $secondPcKitProcessAttributionVerifierOk `
    -Message "second-PC multi-device kit must ship the process attribution verifier alongside the summary/audit scripts"
Add-CaseResult `
    -Cases $cases `
    -Name "second-PC kit includes process attribution verifier" `
    -Verifier "second-PC kit source contract" `
    -FixturePath (Join-Path $scriptDir "prepare-multidevice-test-kit.ps1") `
    -ShouldPass $true `
    -Invocation $invocation

$secondPcReleaseCheckGitFreshnessOk = Test-SecondPcReleaseCheckGitFreshnessContract -ScriptPath (Join-Path $scriptDir "run-second-pc-release-check.ps1")
$invocation = New-StaticVerifierInvocation `
    -Ok $secondPcReleaseCheckGitFreshnessOk `
    -Message "second-PC release check must record git commit/dirty metadata from repo git or kit metadata fallback"
Add-CaseResult `
    -Cases $cases `
    -Name "second-PC release check records git freshness metadata" `
    -Verifier "second-PC release-check source contract" `
    -FixturePath (Join-Path $scriptDir "run-second-pc-release-check.ps1") `
    -ShouldPass $true `
    -Invocation $invocation

$secondPcHandoffGitFreshnessOk = Test-SecondPcHandoffGitFreshnessContract -ScriptPath (Join-Path $scriptDir "collect-second-pc-handoff.ps1")
$invocation = New-StaticVerifierInvocation `
    -Ok $secondPcHandoffGitFreshnessOk `
    -Message "second-PC handoff must record git commit/dirty metadata from repo git or kit metadata fallback"
Add-CaseResult `
    -Cases $cases `
    -Name "second-PC handoff records git freshness metadata" `
    -Verifier "second-PC handoff source contract" `
    -FixturePath (Join-Path $scriptDir "collect-second-pc-handoff.ps1") `
    -ShouldPass $true `
    -Invocation $invocation

$secondPcImportGitFreshnessOk = Test-SecondPcImportGitFreshnessContract -ScriptPath (Join-Path $scriptDir "import-second-pc-return.ps1")
$invocation = New-StaticVerifierInvocation `
    -Ok $secondPcImportGitFreshnessOk `
    -Message "second-PC return import must freshness-gate release-check and handoff git metadata, and reject mixed commit bundles"
Add-CaseResult `
    -Cases $cases `
    -Name "second-PC return import verifies handoff and release-check freshness" `
    -Verifier "second-PC import source contract" `
    -FixturePath (Join-Path $scriptDir "import-second-pc-return.ps1") `
    -ShouldPass $true `
    -Invocation $invocation

$secondPcRoutePreflightFreshnessOk = Test-SecondPcRoutePreflightFreshnessContract -ScriptPath (Join-Path $scriptDir "test-second-pc-route-preflight.ps1")
$invocation = New-StaticVerifierInvocation `
    -Ok $secondPcRoutePreflightFreshnessOk `
    -Message "second-PC route preflight must freshness-gate returned handoff and release-check metadata before suggesting route attempts"
Add-CaseResult `
    -Cases $cases `
    -Name "second-PC route preflight verifies returned git freshness" `
    -Verifier "second-PC route preflight source contract" `
    -FixturePath (Join-Path $scriptDir "test-second-pc-route-preflight.ps1") `
    -ShouldPass $true `
    -Invocation $invocation

$secondPcReturnCardFreshnessOk = Test-SecondPcReturnCardFreshnessContract -ScriptPath (Join-Path $scriptDir "show-second-pc-return-card.ps1")
$invocation = New-StaticVerifierInvocation `
    -Ok $secondPcReturnCardFreshnessOk `
    -Message "second-PC return card must surface returned handoff/release-check freshness so stale zips are visible before route preflight"
Add-CaseResult `
    -Cases $cases `
    -Name "second-PC return card surfaces git freshness" `
    -Verifier "second-PC return card source contract" `
    -FixturePath (Join-Path $scriptDir "show-second-pc-return-card.ps1") `
    -ShouldPass $true `
    -Invocation $invocation

$finalOperatorPacketMsixCommonOk = Test-FinalOperatorPacketMsixCommonContract -ScriptPath (Join-Path $scriptDir "prepare-final-operator-gate-packet.ps1")
$invocation = New-StaticVerifierInvocation `
    -Ok $finalOperatorPacketMsixCommonOk `
    -Message "final operator packet must include msix-common when route preflight and return-card scripts depend on it"
Add-CaseResult `
    -Cases $cases `
    -Name "final operator packet includes msix-common for route helper scripts" `
    -Verifier "final operator packet source contract" `
    -FixturePath (Join-Path $scriptDir "prepare-final-operator-gate-packet.ps1") `
    -ShouldPass $true `
    -Invocation $invocation

$finalOperatorPacketProcessAttributionVerifierOk = Test-FinalOperatorPacketProcessAttributionVerifierContract -ScriptPath (Join-Path $scriptDir "prepare-final-operator-gate-packet.ps1")
$invocation = New-StaticVerifierInvocation `
    -Ok $finalOperatorPacketProcessAttributionVerifierOk `
    -Message "final operator packet must include the process attribution verifier because import-second-pc-return.ps1 depends on it"
Add-CaseResult `
    -Cases $cases `
    -Name "final operator packet includes process attribution verifier" `
    -Verifier "final operator packet source contract" `
    -FixturePath (Join-Path $scriptDir "prepare-final-operator-gate-packet.ps1") `
    -ShouldPass $true `
    -Invocation $invocation

$secondPcKitRouteReachabilityOk = Test-SecondPcKitRouteReachabilityContract -ScriptPath (Join-Path $scriptDir "prepare-multidevice-test-kit.ps1")
$invocation = New-StaticVerifierInvocation `
    -Ok $secondPcKitRouteReachabilityOk `
    -Message "second-PC transfer kit must include route reachability tools and README guidance"
Add-CaseResult `
    -Cases $cases `
    -Name "second-PC kit includes route reachability diagnostic handoff" `
    -Verifier "second-PC route reachability source contract" `
    -FixturePath (Join-Path $scriptDir "prepare-multidevice-test-kit.ps1") `
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

$msixInstallGoNoGoSelectionOk = Test-MsixInstallGoNoGoSelectionContract -ScriptPath $releaseGoNoGoWriter
$invocation = New-StaticVerifierInvocation `
    -Ok $msixInstallGoNoGoSelectionOk `
    -Message "go/no-go must scan recent MSIX install candidates so developer warning evidence cannot mask clean strict evidence"
Add-CaseResult `
    -Cases $cases `
    -Name "go-no-go MSIX install selection scans recent candidates" `
    -Verifier "MSIX install source contract" `
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

$runtimeIdleCpuGoNoGoDoctorSnapshotOk = Test-RuntimeIdleCpuGoNoGoDoctorSnapshotContract -ScriptPath $releaseGoNoGoWriter
$invocation = New-StaticVerifierInvocation `
    -Ok $runtimeIdleCpuGoNoGoDoctorSnapshotOk `
    -Message "go/no-go runtime idle CPU evidence must require the MUSU doctor background snapshot and cadence bounds"
Add-CaseResult `
    -Cases $cases `
    -Name "go-no-go runtime idle CPU requires doctor background snapshot" `
    -Verifier "runtime idle CPU source contract" `
    -FixturePath $releaseGoNoGoWriter `
    -ShouldPass $true `
    -Invocation $invocation

$runtimeIdleCpuGoNoGoMatchingProcessInventoryOk = Test-RuntimeIdleCpuGoNoGoMatchingProcessInventoryContract -ScriptPath $releaseGoNoGoWriter
$invocation = New-StaticVerifierInvocation `
    -Ok $runtimeIdleCpuGoNoGoMatchingProcessInventoryOk `
    -Message "go/no-go runtime idle CPU evidence must require matching process inventory that separates MUSU-owned helpers from machine-wide noise"
Add-CaseResult `
    -Cases $cases `
    -Name "go-no-go runtime idle CPU requires matching process inventory" `
    -Verifier "runtime idle CPU source contract" `
    -FixturePath $releaseGoNoGoWriter `
    -ShouldPass $true `
    -Invocation $invocation

$runtimeIdleCpuDirectVerifierOk = Test-RuntimeIdleCpuDirectVerifierContract -ScriptPath $releaseGoNoGoWriter
$invocation = New-StaticVerifierInvocation `
    -Ok $runtimeIdleCpuDirectVerifierOk `
    -Message "write-release-go-no-go.ps1 must expose a direct runtime idle CPU verifier entrypoint so one evidence file can be verified without scanning the full go/no-go corpus"
Add-CaseResult `
    -Cases $cases `
    -Name "runtime idle CPU direct verifier entrypoint contract" `
    -Verifier "runtime idle CPU source contract" `
    -FixturePath $releaseGoNoGoWriter `
    -ShouldPass $true `
    -Invocation $invocation

$runtimeIdleInventoryValidRelativePath = ".local-build\runtime-idle-cpu\verifier-runtime-idle-valid-$([guid]::NewGuid().ToString('N')).json"
$runtimeIdleInventoryMissingRelativePath = ".local-build\runtime-idle-cpu\verifier-runtime-idle-missing-inventory-$([guid]::NewGuid().ToString('N')).json"
$runtimeIdleInventoryRepoOrphanRelativePath = ".local-build\runtime-idle-cpu\verifier-runtime-idle-repo-orphan-$([guid]::NewGuid().ToString('N')).json"
$runtimeIdleInventoryValidPath = $null
$runtimeIdleInventoryMissingPath = $null
$runtimeIdleInventoryRepoOrphanPath = $null
try {
    $runtimeIdleInventoryValidPath = Write-RepoEvidenceFixture `
        -RelativePath $runtimeIdleInventoryValidRelativePath `
        -Object (New-RuntimeIdleCpuEvidence -Machine "VERIFIER-IDLE-INVENTORY-OK")
    $runtimeIdleInventoryMissingPath = Write-RepoEvidenceFixture `
        -RelativePath $runtimeIdleInventoryMissingRelativePath `
        -Object (New-RuntimeIdleCpuEvidence -Machine "VERIFIER-IDLE-INVENTORY-MISSING" -OmitMatchingProcessInventory)

    $validInvocation = Invoke-Verifier -ScriptPath $releaseGoNoGoWriter -Arguments @(
        "-VerifyRuntimeIdleCpuEvidencePath", $runtimeIdleInventoryValidPath,
        "-Json"
    )
    $validParsed = if ($null -ne $validInvocation -and $validInvocation.PSObject.Properties["parsed"]) { $validInvocation.parsed } else { $null }
    $validParsedJson = ($null -ne $validParsed)

    $missingInvocation = Invoke-Verifier -ScriptPath $releaseGoNoGoWriter -Arguments @(
        "-VerifyRuntimeIdleCpuEvidencePath", $runtimeIdleInventoryMissingPath,
        "-Json"
    )
    $missingParsed = if ($null -ne $missingInvocation -and $missingInvocation.PSObject.Properties["parsed"]) { $missingInvocation.parsed } else { $null }
    $missingParsedJson = ($null -ne $missingParsed)
    $matchingInventoryFailure = if ($missingParsed -and $missingParsed.PSObject.Properties["checks"]) {
        @(
            $missingParsed.checks |
                Where-Object { $_.name -eq "matching process inventory present" -and $_.status -eq "fail" } |
                Select-Object -First 1
        )
    }
    else {
        @()
    }
    $goNoGoInventoryRegressionOk = (
        $validParsedJson -and
        $null -ne $validParsed -and
        [bool]$validParsed.ok -and
        $missingParsedJson -and
        $null -ne $missingParsed -and
        -not [bool]$missingParsed.ok -and
        @($matchingInventoryFailure).Count -gt 0
    )
    $staticInvocation = New-StaticVerifierInvocation `
        -Ok $goNoGoInventoryRegressionOk `
        -Message "runtime idle CPU direct verification accepts evidence with matching_process_inventory and rejects an otherwise-valid candidate that omits it"
    Add-CaseResult `
        -Cases $cases `
        -Name "runtime idle CPU direct verifier rejects missing matching process inventory in live fixture replay" `
        -Verifier "write-release-go-no-go.ps1" `
        -FixturePath $runtimeIdleInventoryMissingPath `
        -ShouldPass $true `
        -Invocation $staticInvocation

    $repoOrphanEvidence = New-RuntimeIdleCpuEvidence -Machine "VERIFIER-IDLE-REPO-ORPHAN"
    $repoOrphanEvidence.matching_process_inventory.node.repo_related_unowned = 1
    $repoOrphanEvidence.matching_process_inventory.node.unowned_other = 3
    $runtimeIdleInventoryRepoOrphanPath = Write-RepoEvidenceFixture `
        -RelativePath $runtimeIdleInventoryRepoOrphanRelativePath `
        -Object $repoOrphanEvidence
    $repoOrphanInvocation = Invoke-Verifier -ScriptPath $releaseGoNoGoWriter -Arguments @(
        "-VerifyRuntimeIdleCpuEvidencePath", $runtimeIdleInventoryRepoOrphanPath,
        "-Json"
    )
    $repoOrphanParsed = if ($null -ne $repoOrphanInvocation -and $repoOrphanInvocation.PSObject.Properties["parsed"]) { $repoOrphanInvocation.parsed } else { $null }
    $repoOrphanFailure = if ($repoOrphanParsed -and $repoOrphanParsed.PSObject.Properties["checks"]) {
        @(
            $repoOrphanParsed.checks |
                Where-Object { $_.name -eq "matching process inventory repo-related node helpers" -and $_.status -eq "fail" } |
                Select-Object -First 1
        )
    }
    else {
        @()
    }
    $repoOrphanRegressionOk = (
        $null -ne $repoOrphanParsed -and
        -not [bool]$repoOrphanParsed.ok -and
        @($repoOrphanFailure).Count -gt 0
    )
    $staticInvocation = New-StaticVerifierInvocation `
        -Ok $repoOrphanRegressionOk `
        -Message "runtime idle CPU direct verification rejects repo-related unowned node helpers in matching_process_inventory"
    Add-CaseResult `
        -Cases $cases `
        -Name "runtime idle CPU direct verifier rejects repo-related unowned node helpers" `
        -Verifier "write-release-go-no-go.ps1" `
        -FixturePath $runtimeIdleInventoryRepoOrphanPath `
        -ShouldPass $true `
        -Invocation $staticInvocation

    $runtimeIdleInventoryNestedRelativePath = ".local-build\runtime-idle-cpu\verifier-runtime-idle-nested-inventory-$([guid]::NewGuid().ToString('N')).json"
    $runtimeIdleInventoryNestedPath = $null
    try {
        $nestedEvidence = New-RuntimeIdleCpuEvidence -Machine "VERIFIER-IDLE-INVENTORY-NESTED"
        $nestedBuckets = $nestedEvidence.matching_process_inventory
        $nestedEvidence.matching_process_inventory = [pscustomobject]@{
            counts_by_bucket = $nestedBuckets
            top_processes = @()
        }
        $runtimeIdleInventoryNestedPath = Write-RepoEvidenceFixture `
            -RelativePath $runtimeIdleInventoryNestedRelativePath `
            -Object $nestedEvidence
        $nestedInvocation = Invoke-Verifier -ScriptPath $releaseGoNoGoWriter -Arguments @(
            "-VerifyRuntimeIdleCpuEvidencePath", $runtimeIdleInventoryNestedPath,
            "-Json"
        )
        $nestedParsed = if ($null -ne $nestedInvocation -and $nestedInvocation.PSObject.Properties["parsed"]) { $nestedInvocation.parsed } else { $null }
        $nestedRegressionOk = ($null -ne $nestedParsed -and [bool]$nestedParsed.ok)
        $staticInvocation = New-StaticVerifierInvocation `
            -Ok $nestedRegressionOk `
            -Message "runtime idle CPU direct verification accepts matching_process_inventory when role buckets are nested under counts_by_bucket"
        Add-CaseResult `
            -Cases $cases `
            -Name "runtime idle CPU direct verifier accepts nested matching process inventory buckets" `
            -Verifier "write-release-go-no-go.ps1" `
            -FixturePath $runtimeIdleInventoryNestedPath `
            -ShouldPass $true `
            -Invocation $staticInvocation
    }
    finally {
        if ($runtimeIdleInventoryNestedPath -and (Test-Path -LiteralPath $runtimeIdleInventoryNestedPath)) {
            Remove-Item -LiteralPath $runtimeIdleInventoryNestedPath -Force -ErrorAction SilentlyContinue
        }
    }
}
finally {
    if ($runtimeIdleInventoryValidPath -and (Test-Path -LiteralPath $runtimeIdleInventoryValidPath)) {
        Remove-Item -LiteralPath $runtimeIdleInventoryValidPath -Force -ErrorAction SilentlyContinue
    }
    if ($runtimeIdleInventoryMissingPath -and (Test-Path -LiteralPath $runtimeIdleInventoryMissingPath)) {
        Remove-Item -LiteralPath $runtimeIdleInventoryMissingPath -Force -ErrorAction SilentlyContinue
    }
    if ($runtimeIdleInventoryRepoOrphanPath -and (Test-Path -LiteralPath $runtimeIdleInventoryRepoOrphanPath)) {
        Remove-Item -LiteralPath $runtimeIdleInventoryRepoOrphanPath -Force -ErrorAction SilentlyContinue
    }
}

$processOwnershipGoNoGoFreshnessOk = Test-ProcessOwnershipGoNoGoFreshnessContract -ScriptPath $releaseGoNoGoWriter
$invocation = New-StaticVerifierInvocation `
    -Ok $processOwnershipGoNoGoFreshnessOk `
    -Message "go/no-go process ownership evidence must be current HEAD or differ only by documentation/evidence/status/tooling-only commits"
Add-CaseResult `
    -Cases $cases `
    -Name "go-no-go process ownership requires current freshness" `
    -Verifier "process ownership source contract" `
    -FixturePath $releaseGoNoGoWriter `
    -ShouldPass $true `
    -Invocation $invocation

$processOwnershipTransientCliOk = Test-ProcessOwnershipTransientCliContract -ScriptPath (Join-Path $scriptDir "audit-musu-process-ownership.ps1")
$invocation = New-StaticVerifierInvocation `
    -Ok $processOwnershipTransientCliOk `
    -Message "process ownership audit must count only bridge runtime roots and expose transient MUSU CLI processes separately"
Add-CaseResult `
    -Cases $cases `
    -Name "process ownership excludes transient MUSU CLI from bridge runtime count" `
    -Verifier "process ownership source contract" `
    -FixturePath (Join-Path $scriptDir "audit-musu-process-ownership.ps1") `
    -ShouldPass $true `
    -Invocation $invocation

$singleInstanceGoNoGoFreshnessOk = Test-SingleInstanceGoNoGoFreshnessContract -ScriptPath $releaseGoNoGoWriter
$invocation = New-StaticVerifierInvocation `
    -Ok $singleInstanceGoNoGoFreshnessOk `
    -Message "go/no-go startup and desktop single-instance evidence must be current HEAD or differ only by documentation/evidence/status/tooling-only commits"
Add-CaseResult `
    -Cases $cases `
    -Name "go-no-go single-instance evidence requires current freshness" `
    -Verifier "single-instance source contract" `
    -FixturePath $releaseGoNoGoWriter `
    -ShouldPass $true `
    -Invocation $invocation

$idleBusyLoopCandidateStatusContractOk = Test-IdleBusyLoopGoNoGoCandidateStatusContract -ScriptPath $releaseGoNoGoWriter
$invocation = New-StaticVerifierInvocation `
    -Ok $idleBusyLoopCandidateStatusContractOk `
    -Message "go/no-go must expose all ten idle busy-loop candidate statuses and block if any candidate is not proven"
Add-CaseResult `
    -Cases $cases `
    -Name "go-no-go exposes all idle busy-loop candidate statuses" `
    -Verifier "idle busy-loop source contract" `
    -FixturePath $releaseGoNoGoWriter `
    -ShouldPass $true `
    -Invocation $invocation

$goNoGoLatestOutputContractOk = Test-GoNoGoLatestOutputContract -ScriptPath $releaseGoNoGoWriter
$invocation = New-StaticVerifierInvocation `
    -Ok $goNoGoLatestOutputContractOk `
    -Message "go/no-go must write the current result to a default latest JSON file and expose the output path"
Add-CaseResult `
    -Cases $cases `
    -Name "go-no-go writes current latest output evidence" `
    -Verifier "go-no-go output source contract" `
    -FixturePath $releaseGoNoGoWriter `
    -ShouldPass $true `
    -Invocation $invocation

$routeReachabilityRecorderSourceContractOk = Test-RouteReachabilityRecorderSourceContract -ScriptPath $routeReachabilityRecorder
$invocation = New-StaticVerifierInvocation `
    -Ok $routeReachabilityRecorderSourceContractOk `
    -Message "route reachability recorder must capture local status, route explain, TCP probe, raw route evidence, and non-proof caveats"
Add-CaseResult `
    -Cases $cases `
    -Name "route reachability recorder captures status explain network and route evidence" `
    -Verifier "route reachability source contract" `
    -FixturePath $routeReachabilityRecorder `
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

$rustBackgroundTelemetryFlushScopeContractOk = Test-RustBackgroundTelemetryFlushScopeContract -ScriptPath (Join-Path $scriptDir "audit-rust-background-loop-contract.ps1")
$invocation = New-StaticVerifierInvocation `
    -Ok $rustBackgroundTelemetryFlushScopeContractOk `
    -Message "Rust background-loop audit must keep log/telemetry flush primitives scoped to explicit one-shot CLI surfaces and reject background flush workers"
Add-CaseResult `
    -Cases $cases `
    -Name "rust background audit limits telemetry flush scope" `
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

$crashRecoveryAuditSourceContractOk = Test-CrashRecoveryAuditSourceContract -ScriptPath (Join-Path $scriptDir "audit-musu-crash-recovery-contract.ps1")
$invocation = New-StaticVerifierInvocation `
    -Ok $crashRecoveryAuditSourceContractOk `
    -Message "crash-recovery audit must verify stale bridge registry cleanup across `musu up`, `musu down`, ServiceRegistry, startup single-instance, and process ownership"
Add-CaseResult `
    -Cases $cases `
    -Name "crash recovery audit covers stale bridge registry cleanup" `
    -Verifier "crash recovery source contract" `
    -FixturePath (Join-Path $scriptDir "audit-musu-crash-recovery-contract.ps1") `
    -ShouldPass $true `
    -Invocation $invocation

$crashRecoveryGoNoGoContractOk = Test-CrashRecoveryGoNoGoContract -ScriptPath $releaseGoNoGoWriter
$invocation = New-StaticVerifierInvocation `
    -Ok $crashRecoveryGoNoGoContractOk `
    -Message "go/no-go must block on the crash-recovery contract audit and expose crash_recovery_contract_verified"
Add-CaseResult `
    -Cases $cases `
    -Name "go-no-go blocks on crash recovery contract" `
    -Verifier "crash recovery source contract" `
    -FixturePath $releaseGoNoGoWriter `
    -ShouldPass $true `
    -Invocation $invocation

$crashRecoveryStatusOnlyContractOk = Test-CrashRecoveryFreshnessStatusOnlyContract -ScriptPaths @(
    $singleMachineVerifier,
    $runtimeCpuScenarioMatrixVerifier,
    $releaseGoNoGoWriter
)
$invocation = New-StaticVerifierInvocation `
    -Ok $crashRecoveryStatusOnlyContractOk `
    -Message "release freshness classifiers must treat the crash-recovery audit script as status-only"
Add-CaseResult `
    -Cases $cases `
    -Name "freshness classifiers allow crash recovery audit script as status-only" `
    -Verifier "release freshness classifier contract" `
    -FixturePath $releaseGoNoGoWriter `
    -ShouldPass $true `
    -Invocation $invocation

$supportMailboxStatusOnlyContractOk = Test-SupportMailboxFreshnessStatusOnlyContract -ScriptPaths @(
    $singleMachineVerifier,
    $runtimeCpuScenarioMatrixVerifier,
    $releaseGoNoGoWriter
)
$invocation = New-StaticVerifierInvocation `
    -Ok $supportMailboxStatusOnlyContractOk `
    -Message "release freshness classifiers must treat support mailbox operator/evidence tooling as status-only"
Add-CaseResult `
    -Cases $cases `
    -Name "freshness classifiers allow support mailbox tooling as status-only" `
    -Verifier "release freshness classifier contract" `
    -FixturePath $releaseGoNoGoWriter `
    -ShouldPass $true `
    -Invocation $invocation

$operatorApiRoomWorkOrderRejectedAuditContractOk = Test-OperatorApiSecurityRoomWorkOrderRejectedAuditContract -ScriptPath $operatorApiSecurityAuditor
$invocation = New-StaticVerifierInvocation `
    -Ok $operatorApiRoomWorkOrderRejectedAuditContractOk `
    -Message "operator API security audit must gate rejected room work-order command audit logging after P2P auth"
Add-CaseResult `
    -Cases $cases `
    -Name "operator API security gates rejected room work-order audit logging" `
    -Verifier "operator API security source contract" `
    -FixturePath $operatorApiSecurityAuditor `
    -ShouldPass $true `
    -Invocation $invocation

$oneMachineMusuProWorkOrderSmokeContractOk = Test-OneMachineMusuProWorkOrderSmokeContract -ScriptPath $oneMachineMusuProWorkOrderSmoke
$invocation = New-StaticVerifierInvocation `
    -Ok $oneMachineMusuProWorkOrderSmokeContractOk `
    -Message "one-machine MUSU.PRO work-order smoke must verify local Desktop readiness, MUSU.PRO presence, remote work-order POST, owner scope, and post-run idle CPU evidence without relying on localhost:3001"
Add-CaseResult `
    -Cases $cases `
    -Name "one-machine MUSU.PRO work-order smoke contract is explicit" `
    -Verifier "one-machine MUSU.PRO work-order source contract" `
    -FixturePath $oneMachineMusuProWorkOrderSmoke `
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

$p2pEnvStatusReleasePayloadTerminologyContractOk = Test-P2pEnvStatusReleasePayloadTerminologyContract -ScriptPath $p2pEnvStatusReporter
$invocation = New-StaticVerifierInvocation `
    -Ok $p2pEnvStatusReleasePayloadTerminologyContractOk `
    -Message "P2P env status must distinguish release payload preflight, missing release tunnel payload endpoint, and non-release preview queue terminology"
Add-CaseResult `
    -Cases $cases `
    -Name "P2P env status separates release payload terminology" `
    -Verifier "P2P env status source contract" `
    -FixturePath $p2pEnvStatusReporter `
    -ShouldPass $true `
    -Invocation $invocation

$p2pEnvStatusReleaseTunnelMarkerConflictContractOk = Test-P2pEnvStatusReleaseTunnelMarkerConflictContract -ScriptPath $p2pEnvStatusReporter
$invocation = New-StaticVerifierInvocation `
    -Ok $p2pEnvStatusReleaseTunnelMarkerConflictContractOk `
    -Message "P2P env status must reject marker-only release relay tunnel flips when release payload is still preflight-only or Rust tunnel hooks are missing"
Add-CaseResult `
    -Cases $cases `
    -Name "P2P env status rejects marker-only relay tunnel flips" `
    -Verifier "P2P env status source contract" `
    -FixturePath $p2pEnvStatusReporter `
    -ShouldPass $true `
    -Invocation $invocation

$rustRendezvousPath = Join-Path $repoRoot "musu-rs\src\bridge\rendezvous.rs"
$rustRelayPayloadDrainPath = Join-Path $repoRoot "musu-rs\src\bridge\handlers\relay_payload.rs"
$p2pReleaseRelayTunnelRuntimeHookContractOk = Test-P2pReleaseRelayTunnelRuntimeHookContract `
    -RendezvousPath $rustRendezvousPath `
    -RelayPayloadDrainPath $rustRelayPayloadDrainPath
$invocation = New-StaticVerifierInvocation `
    -Ok $p2pReleaseRelayTunnelRuntimeHookContractOk `
    -Message "Rust release relay tunnel hooks must bind submit/accept to quic_relay_tunnel, quic_tls_1_3 proof metadata, and non-release preview rejection"
Add-CaseResult `
    -Cases $cases `
    -Name "Rust release relay tunnel hook contract is explicit" `
    -Verifier "P2P release relay tunnel runtime source contract" `
    -FixturePath $rustRendezvousPath `
    -ShouldPass $true `
    -Invocation $invocation

$webRendezvousStorePath = Join-Path $repoRoot "musu-bee\src\lib\p2pRendezvousStore.ts"
$webRendezvousCandidatesRoutePath = Join-Path $repoRoot "musu-bee\src\app\api\v1\p2p\rendezvous\[id]\candidates\route.ts"
$webRoomPresenceRoutePath = Join-Path $repoRoot "musu-bee\src\app\api\rooms\[roomId]\presence\route.ts"
$rustCloudPath = Join-Path $repoRoot "musu-rs\src\cloud\mod.rs"
$rustCliCommandsPath = Join-Path $repoRoot "musu-rs\src\install\cli_commands.rs"
$p2pRelayCandidateProtocolContractOk = Test-P2pRelayCandidateProtocolContract `
    -RendezvousStorePath $webRendezvousStorePath `
    -RendezvousCandidatesRoutePath $webRendezvousCandidatesRoutePath `
    -RoomPresenceRoutePath $webRoomPresenceRoutePath `
    -CloudPath $rustCloudPath `
    -CliCommandsPath $rustCliCommandsPath
$invocation = New-StaticVerifierInvocation `
    -Ok $p2pRelayCandidateProtocolContractOk `
    -Message "P2P candidate exchange must accept and preserve quic_relay_tunnel in web schemas, Rust DTOs, and local room presence CLI defaults"
Add-CaseResult `
    -Cases $cases `
    -Name "P2P relay candidate protocol is release tunnel kind" `
    -Verifier "P2P relay candidate protocol source contract" `
    -FixturePath $webRendezvousStorePath `
    -ShouldPass $true `
    -Invocation $invocation

$goNoGoP2pEnvStatusSurfaceContractOk = Test-GoNoGoP2pEnvStatusSurfaceContract -ScriptPath $releaseGoNoGoWriter
$invocation = New-StaticVerifierInvocation `
    -Ok $goNoGoP2pEnvStatusSurfaceContractOk `
    -Message "go/no-go must include P2P env status readiness, blockers, and source/live/env detail from show-musu-pro-p2p-env-status.ps1"
Add-CaseResult `
    -Cases $cases `
    -Name "go-no-go surfaces P2P env status blockers" `
    -Verifier "P2P go-no-go status source contract" `
    -FixturePath $releaseGoNoGoWriter `
    -ShouldPass $true `
    -Invocation $invocation

$p2pRouteRecordMetadataVerifierContractOk = Test-P2pRouteRecordMetadataVerifierContract -ScriptPath $p2pVerifier
$invocation = New-StaticVerifierInvocation `
    -Ok $p2pRouteRecordMetadataVerifierContractOk `
    -Message "P2P verifier must require route record metadata and expose route metadata counts"
Add-CaseResult `
    -Cases $cases `
    -Name "P2P verifier requires route record metadata" `
    -Verifier "P2P verifier source contract" `
    -FixturePath $p2pVerifier `
    -ShouldPass $true `
    -Invocation $invocation

$p2pRouteMetadataStatusSurfaceContractOk = Test-P2pRouteMetadataStatusSurfaceContract `
    -RecorderScriptPath $p2pControlPlaneEvidenceRecorder `
    -GoNoGoScriptPath $releaseGoNoGoWriter `
    -ExternalScriptPath $externalGateRecheckRecorder `
    -EnvStatusScriptPath $p2pEnvStatusReporter `
    -FinalStatusScriptPath $finalHandoffStatusReporter
$invocation = New-StaticVerifierInvocation `
    -Ok $p2pRouteMetadataStatusSurfaceContractOk `
    -Message "P2P route metadata counts must surface through recorder, go/no-go, external recheck, env status, and final handoff"
Add-CaseResult `
    -Cases $cases `
    -Name "P2P route metadata counts surface through release status reports" `
    -Verifier "P2P route metadata status source contract" `
    -FixturePath $releaseGoNoGoWriter `
    -ShouldPass $true `
    -Invocation $invocation

$p2pProofCountStatusSurfaceContractOk = Test-P2pProofCountStatusSurfaceContract `
    -RecorderScriptPath $p2pControlPlaneEvidenceRecorder `
    -GoNoGoScriptPath $releaseGoNoGoWriter `
    -ExternalScriptPath $externalGateRecheckRecorder `
    -EnvStatusScriptPath $p2pEnvStatusReporter `
    -FinalStatusScriptPath $finalHandoffStatusReporter
$invocation = New-StaticVerifierInvocation `
    -Ok $p2pProofCountStatusSurfaceContractOk `
    -Message "P2P proof required/valid/invalid counts must surface through recorder, go/no-go, external recheck, env status, and final handoff"
Add-CaseResult `
    -Cases $cases `
    -Name "P2P proof count triplets surface through release status reports" `
    -Verifier "P2P proof count status source contract" `
    -FixturePath $releaseGoNoGoWriter `
    -ShouldPass $true `
    -Invocation $invocation

$goNoGoCurrentMsixLegacyConflictContractOk = Test-GoNoGoCurrentMsixLegacyConflictContract -ScriptPath $releaseGoNoGoWriter
$invocation = New-StaticVerifierInvocation `
    -Ok $goNoGoCurrentMsixLegacyConflictContractOk `
    -Message "go/no-go must include a current live MSIX legacy-conflict check so stale install evidence cannot hide PATH alias shadowing"
Add-CaseResult `
    -Cases $cases `
    -Name "go-no-go blocks on current MSIX legacy conflicts" `
    -Verifier "go-no-go MSIX legacy conflict source contract" `
    -FixturePath $releaseGoNoGoWriter `
    -ShouldPass $true `
    -Invocation $invocation

$msixLegacyConflictPersistedPathContractOk = Test-MsixLegacyConflictPersistedPathContract -ScriptPath $msixLegacyConflictsChecker
$invocation = New-StaticVerifierInvocation `
    -Ok $msixLegacyConflictPersistedPathContractOk `
    -Message "MSIX legacy conflict check must use persisted User+Machine PATH for release pass/fail while exposing stale current-process PATH separately"
Add-CaseResult `
    -Cases $cases `
    -Name "MSIX legacy conflict check separates persisted and current process PATH" `
    -Verifier "MSIX legacy conflict source contract" `
    -FixturePath $msixLegacyConflictsChecker `
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

$badP2pRelayRouteTransportProof = Copy-JsonObject -Object $validP2p
$badP2pRelayRouteTransportProofRecord = @($badP2pRelayRouteTransportProof.relay_route_evidence.records)[0]
$badP2pRelayRouteTransportProofRecord.evidence.relay_transport_proof = $null
$fixture = Write-Fixture -Name "p2p-bad-relay-route-transport-proof" -Object $badP2pRelayRouteTransportProof
$invocation = Invoke-Verifier -ScriptPath $p2pVerifier -Arguments @("-EvidencePath", $fixture, "-ExpectedVersion", $ExpectedVersion, "-ExpectedBaseUrl", "https://musu.pro", "-Json")
Add-CaseResult -Cases $cases -Name "p2p rejects relay route evidence without route transport proof" -Verifier "verify-p2p-control-plane-evidence.ps1" -FixturePath $fixture -ShouldPass $false -Invocation $invocation

$badP2pRelayRouteTransportProofIdentity = Copy-JsonObject -Object $validP2p
$badP2pRelayRouteTransportProofIdentityRecord = @($badP2pRelayRouteTransportProofIdentity.relay_route_evidence.records)[0]
$badP2pRelayRouteTransportProofIdentityRecord.evidence.relay_transport_proof.peer_identity_method = "advertised_tls_cert_fingerprint_unverified"
$fixture = Write-Fixture -Name "p2p-bad-relay-route-transport-proof-identity" -Object $badP2pRelayRouteTransportProofIdentity
$invocation = Invoke-Verifier -ScriptPath $p2pVerifier -Arguments @("-EvidencePath", $fixture, "-ExpectedVersion", $ExpectedVersion, "-ExpectedBaseUrl", "https://musu.pro", "-Json")
Add-CaseResult -Cases $cases -Name "p2p rejects relay route evidence with transport proof identity mismatch" -Verifier "verify-p2p-control-plane-evidence.ps1" -FixturePath $fixture -ShouldPass $false -Invocation $invocation

$badP2pRelayRouteRecordLatency = Copy-JsonObject -Object $validP2p
$badP2pRelayRouteRecordLatencyRecord = @($badP2pRelayRouteRecordLatency.relay_route_evidence.records)[0]
$badP2pRelayRouteRecordLatencyRecord.evidence.handshake_ms = $null
$fixture = Write-Fixture -Name "p2p-bad-relay-route-record-latency" -Object $badP2pRelayRouteRecordLatency
$invocation = Invoke-Verifier -ScriptPath $p2pVerifier -Arguments @("-EvidencePath", $fixture, "-ExpectedVersion", $ExpectedVersion, "-ExpectedBaseUrl", "https://musu.pro", "-Json")
Add-CaseResult -Cases $cases -Name "p2p rejects relay route evidence without record latency metadata" -Verifier "verify-p2p-control-plane-evidence.ps1" -FixturePath $fixture -ShouldPass $false -Invocation $invocation

$badP2pRelayRouteRecordIdentity = Copy-JsonObject -Object $validP2p
$badP2pRelayRouteRecordIdentityRecord = @($badP2pRelayRouteRecordIdentity.relay_route_evidence.records)[0]
$badP2pRelayRouteRecordIdentityRecord.evidence.peer_identity_verified = $false
$fixture = Write-Fixture -Name "p2p-bad-relay-route-record-identity" -Object $badP2pRelayRouteRecordIdentity
$invocation = Invoke-Verifier -ScriptPath $p2pVerifier -Arguments @("-EvidencePath", $fixture, "-ExpectedVersion", $ExpectedVersion, "-ExpectedBaseUrl", "https://musu.pro", "-Json")
Add-CaseResult -Cases $cases -Name "p2p rejects relay route evidence with unverified record identity metadata" -Verifier "verify-p2p-control-plane-evidence.ps1" -FixturePath $fixture -ShouldPass $false -Invocation $invocation

$badP2pRelayRouteTransportProofHandshake = Copy-JsonObject -Object $validP2p
$badP2pRelayRouteTransportProofHandshakeRecord = @($badP2pRelayRouteTransportProofHandshake.relay_route_evidence.records)[0]
$badP2pRelayRouteTransportProofHandshakeRecord.evidence.relay_transport_proof.handshake_ms = 99
$fixture = Write-Fixture -Name "p2p-bad-relay-route-transport-proof-handshake" -Object $badP2pRelayRouteTransportProofHandshake
$invocation = Invoke-Verifier -ScriptPath $p2pVerifier -Arguments @("-EvidencePath", $fixture, "-ExpectedVersion", $ExpectedVersion, "-ExpectedBaseUrl", "https://musu.pro", "-Json")
Add-CaseResult -Cases $cases -Name "p2p rejects relay route evidence with transport proof handshake mismatch" -Verifier "verify-p2p-control-plane-evidence.ps1" -FixturePath $fixture -ShouldPass $false -Invocation $invocation

$badP2pRelayPayloadProof = Copy-JsonObject -Object $validP2p
$badP2pRelayPayloadProofRecord = @($badP2pRelayPayloadProof.relay_route_evidence.records)[0]
$badP2pRelayPayloadProofRecord.evidence.relay_payload_delivery_proof = $null
$fixture = Write-Fixture -Name "p2p-bad-relay-payload-proof" -Object $badP2pRelayPayloadProof
$invocation = Invoke-Verifier -ScriptPath $p2pVerifier -Arguments @("-EvidencePath", $fixture, "-ExpectedVersion", $ExpectedVersion, "-ExpectedBaseUrl", "https://musu.pro", "-Json")
Add-CaseResult -Cases $cases -Name "p2p rejects relay route evidence without payload delivery proof" -Verifier "verify-p2p-control-plane-evidence.ps1" -FixturePath $fixture -ShouldPass $false -Invocation $invocation

$badP2pRelayPayloadProofTransportKind = Copy-JsonObject -Object $validP2p
$badP2pRelayPayloadProofTransportKindRecord = @($badP2pRelayPayloadProofTransportKind.relay_route_evidence.records)[0]
$badP2pRelayPayloadProofTransportKindRecord.evidence.relay_payload_delivery_proof.transport_kind = "http_store_forward_preview"
$badP2pRelayPayloadProofTransportKindRecord.evidence.relay_payload_delivery_proof.release_grade = $false
$fixture = Write-Fixture -Name "p2p-bad-relay-payload-proof-preview-transport" -Object $badP2pRelayPayloadProofTransportKind
$invocation = Invoke-Verifier -ScriptPath $p2pVerifier -Arguments @("-EvidencePath", $fixture, "-ExpectedVersion", $ExpectedVersion, "-ExpectedBaseUrl", "https://musu.pro", "-Json")
Add-CaseResult -Cases $cases -Name "p2p rejects relay route evidence with preview payload delivery proof transport" -Verifier "verify-p2p-control-plane-evidence.ps1" -FixturePath $fixture -ShouldPass $false -Invocation $invocation

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

$fixture = Write-Fixture -Name "route-reachability-valid-failed-peer" -Object (New-RouteReachabilityDiagnosticEvidence)
$invocation = Invoke-Verifier -ScriptPath $routeReachabilityVerifier -Arguments @("-EvidencePath", $fixture, "-ExpectedVersion", $ExpectedVersion, "-ExpectedTarget", "SECOND-PC", "-RequireNonLocalTarget", "-Json")
Add-CaseResult -Cases $cases -Name "route reachability accepts failed non-local peer diagnostic" -Verifier "verify-route-reachability-diagnostic.ps1" -FixturePath $fixture -ShouldPass $true -Invocation $invocation

$badRouteReachabilityLocalTarget = New-RouteReachabilityDiagnosticEvidence
$badRouteReachabilityLocalTarget.status.peer.addr = "127.0.0.1:8949"
$badRouteReachabilityLocalTarget.route_explain.submission_endpoint = "http://127.0.0.1:8949/api/tasks/delegate"
$badRouteReachabilityLocalTarget.route_explain.selected_candidate.addr = "127.0.0.1:8949"
$badRouteReachabilityLocalTarget.network_probe.target = "127.0.0.1"
$badRouteReachabilityLocalTarget.route_attempt.candidate_addr = "127.0.0.1:8949"
$fixture = Write-Fixture -Name "route-reachability-bad-local-target" -Object $badRouteReachabilityLocalTarget
$invocation = Invoke-Verifier -ScriptPath $routeReachabilityVerifier -Arguments @("-EvidencePath", $fixture, "-ExpectedVersion", $ExpectedVersion, "-ExpectedTarget", "SECOND-PC", "-RequireNonLocalTarget", "-Json")
Add-CaseResult -Cases $cases -Name "route reachability rejects local-only target diagnostic" -Verifier "verify-route-reachability-diagnostic.ps1" -FixturePath $fixture -ShouldPass $false -Invocation $invocation

$badRouteReachabilityFakeSuccess = New-RouteReachabilityDiagnosticEvidence
$badRouteReachabilityFakeSuccess.status.peer.healthy = $true
$badRouteReachabilityFakeSuccess.network_probe.tcp_test_succeeded = $true
$badRouteReachabilityFakeSuccess.route_attempt.result = "success"
$badRouteReachabilityFakeSuccess.route_attempt.failure_class = ""
$badRouteReachabilityFakeSuccess.route_attempt.peer_identity_verified = $true
$badRouteReachabilityFakeSuccess.route_attempt.encryption = "quic_tls_1_3"
$badRouteReachabilityFakeSuccess.conclusion.successful_multi_device_route_proof = $true
$fixture = Write-Fixture -Name "route-reachability-bad-fake-success" -Object $badRouteReachabilityFakeSuccess
$invocation = Invoke-Verifier -ScriptPath $routeReachabilityVerifier -Arguments @("-EvidencePath", $fixture, "-ExpectedVersion", $ExpectedVersion, "-ExpectedTarget", "SECOND-PC", "-RequireNonLocalTarget", "-Json")
Add-CaseResult -Cases $cases -Name "route reachability rejects fake successful route proof" -Verifier "verify-route-reachability-diagnostic.ps1" -FixturePath $fixture -ShouldPass $false -Invocation $invocation

$fixture = Write-Fixture -Name "process-attribution-valid" -Object (New-ProcessAttributionSummaryEvidence)
$invocation = Invoke-Verifier -ScriptPath $processAttributionSummaryVerifier -Arguments @("-EvidencePath", $fixture, "-Json")
Add-CaseResult -Cases $cases -Name "process attribution summary accepts clean owned/unowned helper counts" -Verifier "verify-process-attribution-summary.ps1" -FixturePath $fixture -ShouldPass $true -Invocation $invocation

$badProcessAttributionOrphan = New-ProcessAttributionSummaryEvidence
$badProcessAttributionOrphan.counts.orphan_repo_helpers = 1
$fixture = Write-Fixture -Name "process-attribution-bad-orphan-helpers" -Object $badProcessAttributionOrphan
$invocation = Invoke-Verifier -ScriptPath $processAttributionSummaryVerifier -Arguments @("-EvidencePath", $fixture, "-Json")
Add-CaseResult -Cases $cases -Name "process attribution summary rejects repo-related orphan helpers" -Verifier "verify-process-attribution-summary.ps1" -FixturePath $fixture -ShouldPass $false -Invocation $invocation

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
    route_explain_command = "musu route --target PRIMARY-PC --explain --json `"Reply exactly: MUSU_CPU_SCENARIO_ROUTE_OK_VERIFIER_TEST`""
    route_explain_exit_code = 0
    route_explain_stdout = '{"schema":"musu.route_explain.v1","version":"1.15.0-rc.1","requested_target":"PRIMARY-PC","channel":"cli","needs_gpu":false,"submission_endpoint":"https://203.0.113.2:8949/api/tasks/delegate","selected_candidate":{"name":"PRIMARY-PC","addr":"203.0.113.2:8949","source":"manual","route_kind":"direct_quic","transport_scheme":"https","peer_identity_verified":false,"peer_identity_method":"peer_public_key","peer_public_key_present":true,"https_fingerprint_pin_available":true,"encryption":"quic_tls_1_3","payload_transited_musu_infra":false},"candidate_count":1,"current_transport":"bridge_https_fingerprint_pin_available","bridge_path_selection_wired":true,"rendezvous_session_wired":true,"https_fingerprint_pinning_wired":true,"release_grade_transport_required":"quic_tls_1_3","route_evidence_ready":false,"release_blockers":["rendezvous target-candidate-assisted routing still needs real second-PC evidence"],"path_priority":["lan","tailscale","direct_quic","relay"],"relay_policy":"relay is Connect/Pro fallback only; it must not become the default data path"}'
    route_explain_stderr = ""
    route_explain_output = '{"schema":"musu.route_explain.v1","version":"1.15.0-rc.1","requested_target":"PRIMARY-PC","channel":"cli","needs_gpu":false,"submission_endpoint":"https://203.0.113.2:8949/api/tasks/delegate","selected_candidate":{"name":"PRIMARY-PC","addr":"203.0.113.2:8949","source":"manual","route_kind":"direct_quic","transport_scheme":"https","peer_identity_verified":false,"peer_identity_method":"peer_public_key","peer_public_key_present":true,"https_fingerprint_pin_available":true,"encryption":"quic_tls_1_3","payload_transited_musu_infra":false},"candidate_count":1,"current_transport":"bridge_https_fingerprint_pin_available","bridge_path_selection_wired":true,"rendezvous_session_wired":true,"https_fingerprint_pinning_wired":true,"release_grade_transport_required":"quic_tls_1_3","route_evidence_ready":false,"release_blockers":["rendezvous target-candidate-assisted routing still needs real second-PC evidence"],"path_priority":["lan","tailscale","direct_quic","relay"],"relay_policy":"relay is Connect/Pro fallback only; it must not become the default data path"}'
    route_explain = [pscustomobject]@{
        schema = "musu.route_explain.v1"
        version = $ExpectedVersion
        requested_target = "PRIMARY-PC"
        channel = "cli"
        needs_gpu = $false
        submission_endpoint = "https://203.0.113.2:8949/api/tasks/delegate"
        selected_candidate = [pscustomobject]@{
            name = "PRIMARY-PC"
            addr = "203.0.113.2:8949"
            source = "manual"
            route_kind = "direct_quic"
            transport_scheme = "https"
            peer_identity_verified = $false
            peer_identity_method = "peer_public_key"
            peer_public_key_present = $true
            https_fingerprint_pin_available = $true
            encryption = "quic_tls_1_3"
            payload_transited_musu_infra = $false
        }
        candidate_count = 1
        current_transport = "bridge_https_fingerprint_pin_available"
        bridge_path_selection_wired = $true
        rendezvous_session_wired = $true
        https_fingerprint_pinning_wired = $true
        release_grade_transport_required = "quic_tls_1_3"
        route_evidence_ready = $false
        release_blockers = @("rendezvous target-candidate-assisted routing still needs real second-PC evidence")
        path_priority = @("lan", "tailscale", "direct_quic", "relay")
        relay_policy = "relay is Connect/Pro fallback only; it must not become the default data path"
    }
    command = "musu route --target PRIMARY-PC --wait `"Reply exactly: MUSU_CPU_SCENARIO_ROUTE_OK_VERIFIER_TEST`""
    arguments = @("route", "--target", "PRIMARY-PC", "--route-evidence-path", "F:\workspace\musu-bee\.local-build\runtime-cpu-scenarios\fixture.failed-target.route-evidence.json", "--wait", "Reply exactly: MUSU_CPU_SCENARIO_ROUTE_OK_VERIFIER_TEST")
    network_probe = [pscustomobject]@{
        target = "203.0.113.2"
        port = 8949
        tcp_test_succeeded = $false
        ping_succeeded = $false
    }
    route_evidence_path = "F:\workspace\musu-bee\.local-build\runtime-cpu-scenarios\fixture.failed-target.route-evidence.json"
    route_attempt_evidence = [pscustomobject]@{
        schema = "musu.route_evidence.v1"
        version = $ExpectedVersion
        recorded_at = $now.AddSeconds(-80).ToString("o")
        target_node_id = "PRIMARY-PC"
        candidate_addr = "203.0.113.2:8949"
        route_kind = "direct_quic"
        result = "failed"
        handshake_ms = $null
        total_attempt_ms = 180000
        peer_identity_verified = $false
        peer_identity_method = "peer_public_key"
        peer_public_key = $null
        encryption = "quic_tls_1_3"
        payload_transited_musu_infra = $false
    }
    exit_code = 1
    raw_exit_code = 1
    stdout = ""
    stderr = "route failed: peer not reachable"
    output = "route failed: peer not reachable"
    wait_timeout_sec = 180
    command_timeout_sec = 210
    max_attempts = 1
    attempt_count = 1
    attempts = @(
        [pscustomobject]@{
            attempt = 1
            started_at = $now.AddSeconds(-90).ToString("o")
            exit_code = 1
            raw_exit_code = 1
            stdout = ""
            stderr = "route failed: peer not reachable"
            output = "route failed: peer not reachable"
            ok = $false
            retry_after_s = $null
            timeout_sec = 210
        }
    )
    failure_allowed = $true
}
$allowedFailedRuntimeRouteAttempt.scenarios[4].preparation.action = "musu route --target --wait"
$allowedFailedRuntimeRouteAttempt.scenarios[4].preparation.route_probe = $allowedFailedRuntimeRouteAttempt.route_probe
$fixture = Write-Fixture -Name "runtime-matrix-failed-target-route-attempt-allowed" -Object $allowedFailedRuntimeRouteAttempt
$invocation = Invoke-Verifier -ScriptPath $runtimeCpuScenarioMatrixVerifier -Arguments @("-EvidencePath", $fixture, "-ExpectedVersion", $ExpectedVersion, "-RequiredScenarios", "startup-open,runtime-started,dashboard-open,desktop-open,post-route", "-MinSampleSeconds", "60", "-MaxOneCorePercent", "5", "-RequirePostRouteProbe", "-RequirePostRouteTarget", "-ExpectedPostRouteTarget", "PRIMARY-PC", "-AllowFailedPostRouteProbe", "-Json")
Add-CaseResult -Cases $cases -Name "runtime matrix accepts explicitly allowed failed target route attempt" -Verifier "verify-runtime-cpu-scenario-matrix.ps1" -FixturePath $fixture -ShouldPass $true -Invocation $invocation

$missingAttemptMetadataRuntimeRouteAttempt = Copy-JsonObject -Object $allowedFailedRuntimeRouteAttempt
$missingAttemptMetadataRuntimeRouteAttempt.route_probe.PSObject.Properties.Remove("attempt_count")
$missingAttemptMetadataRuntimeRouteAttempt.route_probe.PSObject.Properties.Remove("attempts")
$missingAttemptMetadataRuntimeRouteAttempt.scenarios[4].preparation.route_probe = $missingAttemptMetadataRuntimeRouteAttempt.route_probe
$fixture = Write-Fixture -Name "runtime-matrix-failed-target-route-attempt-missing-attempts" -Object $missingAttemptMetadataRuntimeRouteAttempt
$invocation = Invoke-Verifier -ScriptPath $runtimeCpuScenarioMatrixVerifier -Arguments @("-EvidencePath", $fixture, "-ExpectedVersion", $ExpectedVersion, "-RequiredScenarios", "startup-open,runtime-started,dashboard-open,desktop-open,post-route", "-MinSampleSeconds", "60", "-MaxOneCorePercent", "5", "-RequirePostRouteProbe", "-RequirePostRouteTarget", "-ExpectedPostRouteTarget", "PRIMARY-PC", "-AllowFailedPostRouteProbe", "-Json")
Add-CaseResult -Cases $cases -Name "runtime matrix rejects allowed failed route attempt without per-attempt metadata" -Verifier "verify-runtime-cpu-scenario-matrix.ps1" -FixturePath $fixture -ShouldPass $false -Invocation $invocation

$zeroExitFailedRuntimeRouteAttempt = Copy-JsonObject -Object $allowedFailedRuntimeRouteAttempt
$zeroExitFailedRuntimeRouteAttempt.route_probe.exit_code = 0
$zeroExitFailedRuntimeRouteAttempt.route_probe.attempts[0].exit_code = 0
$zeroExitFailedRuntimeRouteAttempt.scenarios[4].preparation.route_probe = $zeroExitFailedRuntimeRouteAttempt.route_probe
$fixture = Write-Fixture -Name "runtime-matrix-failed-target-route-attempt-zero-exit" -Object $zeroExitFailedRuntimeRouteAttempt
$invocation = Invoke-Verifier -ScriptPath $runtimeCpuScenarioMatrixVerifier -Arguments @("-EvidencePath", $fixture, "-ExpectedVersion", $ExpectedVersion, "-RequiredScenarios", "startup-open,runtime-started,dashboard-open,desktop-open,post-route", "-MinSampleSeconds", "60", "-MaxOneCorePercent", "5", "-RequirePostRouteProbe", "-RequirePostRouteTarget", "-ExpectedPostRouteTarget", "PRIMARY-PC", "-AllowFailedPostRouteProbe", "-Json")
Add-CaseResult -Cases $cases -Name "runtime matrix rejects allowed failed route attempt with zero exit code" -Verifier "verify-runtime-cpu-scenario-matrix.ps1" -FixturePath $fixture -ShouldPass $false -Invocation $invocation -RequireParsed

$nonnumericExitFailedRuntimeRouteAttempt = Copy-JsonObject -Object $allowedFailedRuntimeRouteAttempt
$nonnumericExitFailedRuntimeRouteAttempt.route_probe.exit_code = "route-timeout"
$nonnumericExitFailedRuntimeRouteAttempt.scenarios[4].preparation.route_probe = $nonnumericExitFailedRuntimeRouteAttempt.route_probe
$fixture = Write-Fixture -Name "runtime-matrix-failed-target-route-attempt-nonnumeric-exit" -Object $nonnumericExitFailedRuntimeRouteAttempt
$invocation = Invoke-Verifier -ScriptPath $runtimeCpuScenarioMatrixVerifier -Arguments @("-EvidencePath", $fixture, "-ExpectedVersion", $ExpectedVersion, "-RequiredScenarios", "startup-open,runtime-started,dashboard-open,desktop-open,post-route", "-MinSampleSeconds", "60", "-MaxOneCorePercent", "5", "-RequirePostRouteProbe", "-RequirePostRouteTarget", "-ExpectedPostRouteTarget", "PRIMARY-PC", "-AllowFailedPostRouteProbe", "-Json")
Add-CaseResult -Cases $cases -Name "runtime matrix rejects allowed failed route attempt with nonnumeric exit code" -Verifier "verify-runtime-cpu-scenario-matrix.ps1" -FixturePath $fixture -ShouldPass $false -Invocation $invocation -RequireParsed

$targetMismatchRuntimeRouteAttempt = Copy-JsonObject -Object $allowedFailedRuntimeRouteAttempt
$fixture = Write-Fixture -Name "runtime-matrix-failed-target-route-attempt-target-mismatch" -Object $targetMismatchRuntimeRouteAttempt
$invocation = Invoke-Verifier -ScriptPath $runtimeCpuScenarioMatrixVerifier -Arguments @("-EvidencePath", $fixture, "-ExpectedVersion", $ExpectedVersion, "-RequiredScenarios", "startup-open,runtime-started,dashboard-open,desktop-open,post-route", "-MinSampleSeconds", "60", "-MaxOneCorePercent", "5", "-RequirePostRouteProbe", "-ExpectedPostRouteTarget", "SECOND-PC", "-AllowFailedPostRouteProbe", "-Json")
Add-CaseResult -Cases $cases -Name "runtime matrix rejects allowed failed route attempt for wrong target" -Verifier "verify-runtime-cpu-scenario-matrix.ps1" -FixturePath $fixture -ShouldPass $false -Invocation $invocation

$unboundTargetRuntimeRouteAttempt = Copy-JsonObject -Object $allowedFailedRuntimeRouteAttempt
$unboundTargetRuntimeRouteAttempt.route_probe.target = "SECOND-PC"
$unboundTargetRuntimeRouteAttempt.scenarios[4].preparation.route_probe = $unboundTargetRuntimeRouteAttempt.route_probe
$fixture = Write-Fixture -Name "runtime-matrix-failed-target-route-attempt-unbound-target" -Object $unboundTargetRuntimeRouteAttempt
$invocation = Invoke-Verifier -ScriptPath $runtimeCpuScenarioMatrixVerifier -Arguments @("-EvidencePath", $fixture, "-ExpectedVersion", $ExpectedVersion, "-RequiredScenarios", "startup-open,runtime-started,dashboard-open,desktop-open,post-route", "-MinSampleSeconds", "60", "-MaxOneCorePercent", "5", "-RequirePostRouteProbe", "-RequirePostRouteTarget", "-ExpectedPostRouteTarget", "SECOND-PC", "-AllowFailedPostRouteProbe", "-Json")
Add-CaseResult -Cases $cases -Name "runtime matrix rejects target field not bound to route command arguments" -Verifier "verify-runtime-cpu-scenario-matrix.ps1" -FixturePath $fixture -ShouldPass $false -Invocation $invocation

$unboundWaitTokenRuntimeRouteAttempt = Copy-JsonObject -Object $allowedFailedRuntimeRouteAttempt
$unboundWaitTokenRuntimeRouteAttempt.route_probe.command = "musu route --target PRIMARY-PC --wait `"Reply when ready`""
$unboundWaitTokenRuntimeRouteAttempt.route_probe.arguments = @("route", "--target", "PRIMARY-PC", "--wait", "Reply when ready")
$unboundWaitTokenRuntimeRouteAttempt.scenarios[4].preparation.route_probe = $unboundWaitTokenRuntimeRouteAttempt.route_probe
$fixture = Write-Fixture -Name "runtime-matrix-failed-target-route-attempt-unbound-wait-token" -Object $unboundWaitTokenRuntimeRouteAttempt
$invocation = Invoke-Verifier -ScriptPath $runtimeCpuScenarioMatrixVerifier -Arguments @("-EvidencePath", $fixture, "-ExpectedVersion", $ExpectedVersion, "-RequiredScenarios", "startup-open,runtime-started,dashboard-open,desktop-open,post-route", "-MinSampleSeconds", "60", "-MaxOneCorePercent", "5", "-RequirePostRouteProbe", "-RequirePostRouteTarget", "-ExpectedPostRouteTarget", "PRIMARY-PC", "-AllowFailedPostRouteProbe", "-Json")
Add-CaseResult -Cases $cases -Name "runtime matrix rejects route wait prompt without expected token" -Verifier "verify-runtime-cpu-scenario-matrix.ps1" -FixturePath $fixture -ShouldPass $false -Invocation $invocation

$successWithoutTokenRuntimeRouteAttempt = Copy-JsonObject -Object $validRuntimeCpuMatrix
$successWithoutTokenRuntimeRouteAttempt.route_probe.output = "task completed without verifier token"
$successWithoutTokenRuntimeRouteAttempt.route_probe.stdout = "task completed without verifier token"
$successWithoutTokenRuntimeRouteAttempt.scenarios[4].preparation.route_probe = $successWithoutTokenRuntimeRouteAttempt.route_probe
$fixture = Write-Fixture -Name "runtime-matrix-success-route-attempt-missing-output-token" -Object $successWithoutTokenRuntimeRouteAttempt
$invocation = Invoke-Verifier -ScriptPath $runtimeCpuScenarioMatrixVerifier -Arguments @("-EvidencePath", $fixture, "-ExpectedVersion", $ExpectedVersion, "-RequiredScenarios", "startup-open,runtime-started,dashboard-open,desktop-open,post-route", "-MinSampleSeconds", "60", "-MaxOneCorePercent", "5", "-RequirePostRouteProbe", "-Json")
Add-CaseResult -Cases $cases -Name "runtime matrix rejects successful route probe without token output" -Verifier "verify-runtime-cpu-scenario-matrix.ps1" -FixturePath $fixture -ShouldPass $false -Invocation $invocation

$missingRouteExplainRuntimeRouteAttempt = Copy-JsonObject -Object $validRuntimeCpuMatrix
$missingRouteExplainRuntimeRouteAttempt.route_probe.PSObject.Properties.Remove("route_explain")
$missingRouteExplainRuntimeRouteAttempt.scenarios[4].preparation.route_probe = $missingRouteExplainRuntimeRouteAttempt.route_probe
$fixture = Write-Fixture -Name "runtime-matrix-missing-route-explain" -Object $missingRouteExplainRuntimeRouteAttempt
$invocation = Invoke-Verifier -ScriptPath $runtimeCpuScenarioMatrixVerifier -Arguments @("-EvidencePath", $fixture, "-ExpectedVersion", $ExpectedVersion, "-RequiredScenarios", "startup-open,runtime-started,dashboard-open,desktop-open,post-route", "-MinSampleSeconds", "60", "-MaxOneCorePercent", "5", "-RequirePostRouteProbe", "-Json")
Add-CaseResult -Cases $cases -Name "runtime matrix rejects missing post-route route explain metadata" -Verifier "verify-runtime-cpu-scenario-matrix.ps1" -FixturePath $fixture -ShouldPass $false -Invocation $invocation

$selfTargetRuntimeRouteAttempt = Copy-JsonObject -Object $allowedFailedRuntimeRouteAttempt
$selfTargetRuntimeRouteAttempt.route_probe.target = "VERIFIER-TEST"
$selfTargetRuntimeRouteAttempt.route_probe.command = "musu route --target VERIFIER-TEST --wait `"Reply exactly: MUSU_CPU_SCENARIO_ROUTE_OK_VERIFIER_TEST`""
$selfTargetRuntimeRouteAttempt.route_probe.arguments = @("route", "--target", "VERIFIER-TEST", "--wait", "Reply exactly: MUSU_CPU_SCENARIO_ROUTE_OK_VERIFIER_TEST")
$selfTargetRuntimeRouteAttempt.route_probe.route_explain.requested_target = "VERIFIER-TEST"
$selfTargetRuntimeRouteAttempt.route_probe.route_attempt_evidence.target_node_id = "VERIFIER-TEST"
$selfTargetRuntimeRouteAttempt.scenarios[4].preparation.route_probe = $selfTargetRuntimeRouteAttempt.route_probe
$fixture = Write-Fixture -Name "runtime-matrix-failed-self-target-route-attempt" -Object $selfTargetRuntimeRouteAttempt
$invocation = Invoke-Verifier -ScriptPath $runtimeCpuScenarioMatrixVerifier -Arguments @("-EvidencePath", $fixture, "-ExpectedVersion", $ExpectedVersion, "-RequiredScenarios", "startup-open,runtime-started,dashboard-open,desktop-open,post-route", "-MinSampleSeconds", "60", "-MaxOneCorePercent", "5", "-RequirePostRouteProbe", "-RequirePostRouteTarget", "-RejectSelfPostRouteTarget", "-AllowFailedPostRouteProbe", "-Json")
Add-CaseResult -Cases $cases -Name "runtime matrix rejects self-target second-PC route attempt" -Verifier "verify-runtime-cpu-scenario-matrix.ps1" -FixturePath $fixture -ShouldPass $false -Invocation $invocation

$localTargetRuntimeRouteAttempt = Copy-JsonObject -Object $allowedFailedRuntimeRouteAttempt
$localTargetRuntimeRouteAttempt.route_probe.target = "127.0.0.1:2751"
$localTargetRuntimeRouteAttempt.route_probe.command = "musu route --target 127.0.0.1:2751 --wait `"Reply exactly: MUSU_CPU_SCENARIO_ROUTE_OK_VERIFIER_TEST`""
$localTargetRuntimeRouteAttempt.route_probe.arguments = @("route", "--target", "127.0.0.1:2751", "--wait", "Reply exactly: MUSU_CPU_SCENARIO_ROUTE_OK_VERIFIER_TEST")
$localTargetRuntimeRouteAttempt.route_probe.route_explain.requested_target = "127.0.0.1:2751"
$localTargetRuntimeRouteAttempt.route_probe.route_attempt_evidence.target_node_id = "127.0.0.1:2751"
$localTargetRuntimeRouteAttempt.scenarios[4].preparation.route_probe = $localTargetRuntimeRouteAttempt.route_probe
$fixture = Write-Fixture -Name "runtime-matrix-failed-local-target-route-attempt" -Object $localTargetRuntimeRouteAttempt
$invocation = Invoke-Verifier -ScriptPath $runtimeCpuScenarioMatrixVerifier -Arguments @("-EvidencePath", $fixture, "-ExpectedVersion", $ExpectedVersion, "-RequiredScenarios", "startup-open,runtime-started,dashboard-open,desktop-open,post-route", "-MinSampleSeconds", "60", "-MaxOneCorePercent", "5", "-RequirePostRouteProbe", "-RequirePostRouteTarget", "-RejectLocalPostRouteTarget", "-AllowFailedPostRouteProbe", "-Json")
Add-CaseResult -Cases $cases -Name "runtime matrix rejects localhost second-PC route attempt" -Verifier "verify-runtime-cpu-scenario-matrix.ps1" -FixturePath $fixture -ShouldPass $false -Invocation $invocation

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

$badRuntimeMatrixMissingDoctorBackgroundSnapshot = Copy-JsonObject -Object $validRuntimeCpuMatrix
$badRuntimeMatrixMissingDoctorBackgroundSnapshot.PSObject.Properties.Remove("doctor_background_snapshot")
$fixture = Write-Fixture -Name "runtime-matrix-missing-doctor-background-snapshot" -Object $badRuntimeMatrixMissingDoctorBackgroundSnapshot
$invocation = Invoke-Verifier -ScriptPath $runtimeCpuScenarioMatrixVerifier -Arguments @("-EvidencePath", $fixture, "-ExpectedVersion", $ExpectedVersion, "-RequiredScenarios", "startup-open,runtime-started,dashboard-open,desktop-open,post-route", "-MinSampleSeconds", "60", "-MaxOneCorePercent", "5", "-RequirePostRouteProbe", "-Json")
Add-CaseResult -Cases $cases -Name "runtime matrix rejects missing doctor background snapshot" -Verifier "verify-runtime-cpu-scenario-matrix.ps1" -FixturePath $fixture -ShouldPass $false -Invocation $invocation

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
