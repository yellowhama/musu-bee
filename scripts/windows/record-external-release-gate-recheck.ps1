[CmdletBinding()]
param(
    [string]$BaseUrl = "https://musu.pro",
    [string]$SecondPcHost = "192.168.1.192",
    [int]$SecondPcPort = 8949,
    [string]$Version,
    [string]$OutputRoot,
    [int]$ScriptTimeoutSeconds = 120,
    [switch]$FailOnNotReady,
    [switch]$FailOnReadyBlockers,
    [switch]$Json
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = (Resolve-Path (Join-Path $scriptDir "..\..")).Path

if ([string]::IsNullOrWhiteSpace($Version)) {
    $Version = (Get-Content -LiteralPath (Join-Path $repoRoot "VERSION") -Raw).Trim()
}
if ([string]::IsNullOrWhiteSpace($OutputRoot)) {
    $OutputRoot = Join-Path $repoRoot ("docs\evidence\external-gates\{0}" -f $Version)
}
if ($ScriptTimeoutSeconds -lt 1) {
    throw "ScriptTimeoutSeconds must be at least 1."
}

New-Item -ItemType Directory -Force -Path $OutputRoot | Out-Null

function Invoke-JsonScript {
    param(
        [Parameter(Mandatory = $true)][string]$FilePath,
        [string[]]$Arguments = @(),
        [switch]$AllowFailure
    )

    $processArgs = @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $FilePath) + $Arguments

    function ConvertTo-ProcessArgument {
        param([Parameter(Mandatory = $true)][AllowEmptyString()][string]$Value)

        if ([string]::IsNullOrEmpty($Value)) {
            return '""'
        }
        if ($Value -notmatch '[\s"]') {
            return $Value
        }
        return '"' + ($Value.Replace('"', '\"')) + '"'
    }

    $watch = [Diagnostics.Stopwatch]::StartNew()
    $startInfo = New-Object System.Diagnostics.ProcessStartInfo
    $startInfo.FileName = "powershell.exe"
    $startInfo.Arguments = (($processArgs | ForEach-Object { ConvertTo-ProcessArgument -Value ([string]$_) }) -join " ")
    $startInfo.WorkingDirectory = $repoRoot
    $startInfo.UseShellExecute = $false
    $startInfo.RedirectStandardOutput = $true
    $startInfo.RedirectStandardError = $true
    $startInfo.CreateNoWindow = $true

    $process = $null
    $startError = $null
    try {
        $process = [System.Diagnostics.Process]::Start($startInfo)
    }
    catch {
        $startError = $_.Exception.Message
    }

    if (-not $process) {
        $watch.Stop()
        if (-not $AllowFailure) {
            throw "Script failed to start: $FilePath`n$startError"
        }
        return [pscustomobject]@{
            exit_code = -1
            timed_out = $false
            elapsed_ms = [int]$watch.ElapsedMilliseconds
            json = $null
            raw = $startError
            stderr = $startError
        }
    }

    $stdoutTask = $process.StandardOutput.ReadToEndAsync()
    $stderrTask = $process.StandardError.ReadToEndAsync()
    $completed = $process.WaitForExit($ScriptTimeoutSeconds * 1000)
    $timedOut = -not $completed
    if ($timedOut) {
        try {
            $process.Kill()
        }
        catch {
        }
        $process.WaitForExit()
    }
    $watch.Stop()

    $exitCode = if ($timedOut) { -1 } else { $process.ExitCode }
    try { $stdoutTask.Wait(5000) | Out-Null } catch { }
    try { $stderrTask.Wait(5000) | Out-Null } catch { }
    $text = if ($stdoutTask.IsCompleted) { ([string]$stdoutTask.Result).Trim() } else { "" }
    $stderr = if ($stderrTask.IsCompleted) { ([string]$stderrTask.Result).Trim() } else { "" }
    $rawText = @($text, $stderr) | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }
    $raw = ($rawText -join "`n").Trim()
    $parsed = $null
    if (-not [string]::IsNullOrWhiteSpace($text)) {
        try {
            $parsed = $text | ConvertFrom-Json
        }
        catch {
            if (-not $AllowFailure) {
                throw "Script did not return parseable JSON: $FilePath`n$raw"
            }
        }
    }

    if ($timedOut -and -not $AllowFailure) {
        throw "Script timed out after ${ScriptTimeoutSeconds}s: $FilePath"
    }

    if ($exitCode -ne 0 -and -not $AllowFailure) {
        throw "Script failed with exit code ${exitCode}: $FilePath`n$raw"
    }

    [pscustomobject]@{
        exit_code = $exitCode
        timed_out = [bool]$timedOut
        elapsed_ms = [int]$watch.ElapsedMilliseconds
        json = $parsed
        raw = $raw
        stderr = $stderr
    }
}

function Get-BoolProperty {
    param(
        [Parameter(Mandatory = $true)]$Object,
        [Parameter(Mandatory = $true)][string]$Name
    )

    if (-not $Object) {
        return $false
    }
    $property = $Object.PSObject.Properties[$Name]
    if (-not $property -or $null -eq $property.Value) {
        return $false
    }
    return [bool]$property.Value
}

function ConvertTo-NetAddressString {
    param($Value)

    if ($null -eq $Value) {
        return ""
    }
    if ($Value -is [array]) {
        if ($Value.Count -eq 0) {
            return ""
        }
        return ConvertTo-NetAddressString -Value $Value[0]
    }
    if ($Value -is [System.Net.IPAddress]) {
        return $Value.ToString()
    }

    foreach ($name in @("IPAddress", "Address", "IP")) {
        $property = $Value.PSObject.Properties[$name]
        if ($property -and $null -ne $property.Value -and -not [string]::IsNullOrWhiteSpace([string]$property.Value)) {
            return [string]$property.Value
        }
    }

    return [string]$Value
}

function Select-ObjectProperties {
    param($Object)

    if (-not $Object) {
        return $null
    }

    [pscustomobject]@{
        computer_name = [string]$Object.ComputerName
        remote_address = ConvertTo-NetAddressString -Value $Object.RemoteAddress
        remote_port = if ($Object.PSObject.Properties["RemotePort"]) { [int]$Object.RemotePort } else { $null }
        interface_alias = [string]$Object.InterfaceAlias
        source_address = ConvertTo-NetAddressString -Value $Object.SourceAddress
        ping_succeeded = [bool]$Object.PingSucceeded
        tcp_test_succeeded = [bool]$Object.TcpTestSucceeded
    }
}

function ConvertTo-BlockerName {
    param([Parameter(Mandatory = $true)][string]$Text)

    return ($Text.ToLowerInvariant() -replace "[^a-z0-9]+", "_" -replace "^_+", "" -replace "_+$", "")
}

$recordedAt = [datetimeoffset]::Now
$stamp = $recordedAt.ToString("yyyyMMdd-HHmmss")
$safeMachine = if ([string]::IsNullOrWhiteSpace($env:COMPUTERNAME)) { "machine" } else { $env:COMPUTERNAME -replace "[^A-Za-z0-9._-]", "_" }
$baseName = "$stamp-$safeMachine.external-gates"
$evidencePath = Join-Path $OutputRoot "$baseName.evidence.json"
$summaryPath = Join-Path $OutputRoot "$baseName.summary.md"

$goNoGo = Invoke-JsonScript `
    -FilePath (Join-Path $scriptDir "write-release-go-no-go.ps1") `
    -Arguments @("-PublicMetadataBaseUrl", $BaseUrl, "-ScriptTimeoutSeconds", ([string]$ScriptTimeoutSeconds), "-Json") `
    -AllowFailure

$secondPcProbe = $null
$secondPcProbeError = $null
try {
    $secondPcProbe = Test-NetConnection -ComputerName $SecondPcHost -Port $SecondPcPort -WarningAction SilentlyContinue
}
catch {
    $secondPcProbeError = $_.Exception.Message
}
$secondPc = Select-ObjectProperties -Object $secondPcProbe

$p2pEnv = Invoke-JsonScript `
    -FilePath (Join-Path $scriptDir "show-musu-pro-p2p-env-status.ps1") `
    -Arguments @("-BaseUrl", $BaseUrl, "-Json") `
    -AllowFailure

$p2pEvidence = Invoke-JsonScript `
    -FilePath (Join-Path $scriptDir "record-p2p-control-plane-evidence.ps1") `
    -Arguments @("-BaseUrl", $BaseUrl, "-AllowUnverified", "-Json") `
    -AllowFailure

$releaseReady = ($goNoGo.json -and [bool]$goNoGo.json.ready_for_public_desktop_release)
$secondPcReachable = ($secondPc -and [bool]$secondPc.tcp_test_succeeded)
$p2pEnvOk = ($p2pEnv.json -and [bool]$p2pEnv.json.ok)
$p2pEvidenceOk = ($p2pEvidence.json -and [bool]$p2pEvidence.json.ok)

$goNoGoBlockers = @()
if ($goNoGo.json -and $goNoGo.json.PSObject.Properties["blockers"]) {
    $goNoGoBlockers = @(
        $goNoGo.json.blockers | ForEach-Object {
            [pscustomobject]@{
                area = [string]$_.area
                message = [string]$_.message
            }
        }
    )
}

$blockers = New-Object System.Collections.Generic.List[string]
if (-not $releaseReady) {
    [void]$blockers.Add("release_go_no_go_not_ready")
}
foreach ($blocker in $goNoGoBlockers) {
    if (-not [string]::IsNullOrWhiteSpace($blocker.area)) {
        [void]$blockers.Add(("go_no_go_{0}" -f (ConvertTo-BlockerName -Text $blocker.area)))
    }
}
if (-not $secondPcReachable) {
    [void]$blockers.Add("second_pc_unreachable")
}
if (-not $p2pEnvOk) {
    [void]$blockers.Add("p2p_env_not_ready")
}
if (-not $p2pEvidenceOk) {
    [void]$blockers.Add("p2p_control_plane_evidence_not_verified")
}

$result = [pscustomobject]@{
    schema = "musu.external_release_gate_recheck.v1"
    ok = ($blockers.Count -eq 0)
    version = $Version
    recorded_at = $recordedAt.ToString("o")
    operator_machine = $env:COMPUTERNAME
    operator_user = $env:USERNAME
    base_url = $BaseUrl
    second_pc_host = $SecondPcHost
    second_pc_port = $SecondPcPort
    release_ready = [bool]$releaseReady
    local_artifacts_ready = if ($goNoGo.json) { [bool]$goNoGo.json.local_artifacts_ready } else { $false }
    single_machine_verified = if ($goNoGo.json) { [bool]$goNoGo.json.single_machine_verified } else { $false }
    runtime_idle_cpu_verified = if ($goNoGo.json) { [bool]$goNoGo.json.runtime_idle_cpu_verified } else { $false }
    runtime_idle_cpu_valid_machine_count = if ($goNoGo.json) { $goNoGo.json.runtime_idle_cpu_valid_machine_count } else { $null }
    runtime_cpu_scenario_matrix_verified = if ($goNoGo.json) { [bool]$goNoGo.json.runtime_cpu_scenario_matrix_verified } else { $false }
    runtime_cpu_scenario_matrix_valid_machine_count = if ($goNoGo.json) { $goNoGo.json.runtime_cpu_scenario_matrix_valid_machine_count } else { $null }
    multi_device_verified = if ($goNoGo.json) { [bool]$goNoGo.json.multi_device_verified } else { $false }
    support_mailbox_verified = if ($goNoGo.json) { [bool]$goNoGo.json.support_mailbox_verified } else { $false }
    store_release_verified = if ($goNoGo.json) { [bool]$goNoGo.json.store_release_verified } else { $false }
    p2p_control_plane_verified = if ($goNoGo.json) { [bool]$goNoGo.json.p2p_control_plane_verified } else { $false }
    second_pc_reachability = $secondPc
    second_pc_probe_error = $secondPcProbeError
    p2p_env_ok = [bool]$p2pEnvOk
    p2p_env = $p2pEnv.json
    p2p_env_exit_code = $p2pEnv.exit_code
    p2p_evidence_ok = [bool]$p2pEvidenceOk
    p2p_evidence_result = $p2pEvidence.json
    p2p_evidence_exit_code = $p2pEvidence.exit_code
    p2p_evidence_path = if ($p2pEvidence.json) { [string]$p2pEvidence.json.evidence_path } else { $null }
    p2p_verification_path = if ($p2pEvidence.json) { [string]$p2pEvidence.json.verification_path } else { $null }
    blockers = $blockers.ToArray()
    go_no_go_blockers = $goNoGoBlockers
    go_no_go = $goNoGo.json
    go_no_go_exit_code = $goNoGo.exit_code
    go_no_go_timed_out = [bool]$goNoGo.timed_out
    p2p_env_timed_out = [bool]$p2pEnv.timed_out
    p2p_evidence_timed_out = [bool]$p2pEvidence.timed_out
}

$result | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath $evidencePath -Encoding UTF8
$hash = Get-FileHash -Algorithm SHA256 -LiteralPath $evidencePath
$runtimeIdleCpuText = if ($null -ne $result.runtime_idle_cpu_valid_machine_count) { [string]$result.runtime_idle_cpu_valid_machine_count } else { "n/a" }
$runtimeCpuMatrixText = if ($null -ne $result.runtime_cpu_scenario_matrix_valid_machine_count) { [string]$result.runtime_cpu_scenario_matrix_valid_machine_count } else { "n/a" }
$secondPcTcpText = if ($result.second_pc_reachability) { [string]$result.second_pc_reachability.tcp_test_succeeded } else { "False" }
$blockerText = if ($result.blockers.Count -gt 0) { $result.blockers -join ", " } else { "none" }

$summary = @"
# MUSU External Release Gate Recheck

- Version: $Version
- Release ready: $($result.release_ready)
- Local artifacts ready: $($result.local_artifacts_ready)
- Single-machine verified: $($result.single_machine_verified)
- Runtime idle CPU: $runtimeIdleCpuText
- Runtime CPU matrix: $runtimeCpuMatrixText
- Second PC: ${SecondPcHost}:${SecondPcPort}
- Second PC TCP reachable: $secondPcTcpText
- P2P env ready: $($result.p2p_env_ok)
- P2P evidence verified: $($result.p2p_evidence_ok)
- P2P evidence: $($result.p2p_evidence_path)
- Blockers: $blockerText
- Evidence: $([System.IO.Path]::GetFileName($evidencePath))
- Evidence SHA256: $($hash.Hash.ToLowerInvariant())
- Recorded at: $($recordedAt.ToString("o"))

This record is a repeatable snapshot of the remaining external release gates:
second-PC reachability, live P2P control-plane readiness, and final go/no-go.
"@
$summary | Set-Content -LiteralPath $summaryPath -Encoding UTF8

$final = [pscustomobject]@{
    ok = [bool]$result.ok
    version = $Version
    evidence_path = (Resolve-Path -LiteralPath $evidencePath).Path
    evidence_sha256 = $hash.Hash.ToLowerInvariant()
    summary_path = (Resolve-Path -LiteralPath $summaryPath).Path
    release_ready = [bool]$result.release_ready
    local_artifacts_ready = [bool]$result.local_artifacts_ready
    second_pc_reachable = [bool]$secondPcReachable
    p2p_env_ok = [bool]$p2pEnvOk
    p2p_evidence_ok = [bool]$p2pEvidenceOk
    p2p_evidence_path = $result.p2p_evidence_path
    blockers = $result.blockers
}

if ($Json) {
    $final | ConvertTo-Json -Depth 6
}
else {
    $final
}

if (($FailOnNotReady -or $FailOnReadyBlockers) -and -not [bool]$final.ok) {
    exit 1
}
