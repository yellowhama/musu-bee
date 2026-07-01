[CmdletBinding()]
param(
    [string]$BaseUrl = "https://musu.pro",
    [string]$Version,
    [string]$OutputPath,
    [switch]$SkipGithub,
    [switch]$Json
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = (Resolve-Path (Join-Path $scriptDir "..\..")).Path
$generatedAt = [datetimeoffset]::Now

if ([string]::IsNullOrWhiteSpace($Version)) {
    $Version = (Get-Content -LiteralPath (Join-Path $repoRoot "VERSION") -Raw).Trim()
}

function New-Requirement {
    param(
        [Parameter(Mandatory = $true)][string]$Id,
        [Parameter(Mandatory = $true)][string]$Status,
        [Parameter(Mandatory = $true)][string]$Evidence,
        [Parameter(Mandatory = $true)][string]$Next
    )

    return [pscustomobject]@{
        id = $Id
        status = $Status
        evidence = $Evidence
        next = $Next
    }
}

function Get-IntProperty {
    param(
        $Object,
        [Parameter(Mandatory = $true)][string]$Name
    )

    if (-not $Object) {
        return 0
    }
    $property = $Object.PSObject.Properties[$Name]
    if (-not $property -or $null -eq $property.Value) {
        return 0
    }
    return [int]$property.Value
}

$statusScript = Join-Path $scriptDir "show-musu-pro-p2p-env-status.ps1"
$statusArgs = @{
    BaseUrl = $BaseUrl
    Version = $Version
    Json = $true
}
if ($SkipGithub) {
    $statusArgs.SkipGithub = $true
}

$statusRaw = & $statusScript @statusArgs 2>&1
$statusExit = $LASTEXITCODE
$statusText = ($statusRaw -join "`n")
$status = $null
$statusParseOk = $false
try {
    $status = $statusText | ConvertFrom-Json
    $statusParseOk = ($null -ne $status)
}
catch {
    $statusParseOk = $false
}

$blockers = @()
$requirements = New-Object System.Collections.Generic.List[object]

if (-not $statusParseOk) {
    $blockers += "p2p_env_status_unparseable"
}
elseif ($statusExit -ne 0) {
    $blockers += "p2p_env_status_command_failed"
}
else {
    $sourceContractReady = [bool]$status.release_relay_tunnel_runtime_source_contract_ready
    $runtimeImplemented = [bool]$status.release_relay_tunnel_runtime_implemented
    $notImplementedBranchActive = [bool]$status.release_relay_tunnel_runtime_not_implemented_branch_active
    $markerConflicts = [bool]$status.release_relay_tunnel_runtime_marker_conflicts_with_source_contract
    $transportKindReleaseGrade = [bool]$status.relay_transport_kind_release_grade
    $evidence = $status.evidence

    if (-not $sourceContractReady) {
        $blockers += "release_relay_tunnel_source_contract_not_ready"
    }
    if ($markerConflicts) {
        $blockers += "runtime_marker_conflicts_with_source_contract"
    }
    if (-not $runtimeImplemented) {
        $blockers += "runtime_byte_path_missing"
    }
    if (-not $notImplementedBranchActive -and -not $runtimeImplemented) {
        $blockers += "runtime_guard_branch_missing_before_implementation"
    }
    if (-not $transportKindReleaseGrade) {
        $blockers += "relay_transport_kind_not_quic_relay_tunnel"
    }

    $routeCount = Get-IntProperty -Object $evidence -Name "relay_route_evidence_count"
    $metadataValidCount = Get-IntProperty -Object $evidence -Name "relay_route_metadata_valid_count"
    $transportProofValidCount = Get-IntProperty -Object $evidence -Name "relay_route_transport_proof_valid_count"
    $payloadProofValidCount = Get-IntProperty -Object $evidence -Name "relay_payload_delivery_proof_valid_count"

    if ($routeCount -le 0) {
        $blockers += "release_relay_route_evidence_missing"
    }
    if ($metadataValidCount -le 0) {
        $blockers += "release_relay_route_metadata_missing"
    }
    if ($transportProofValidCount -le 0) {
        $blockers += "release_relay_transport_proof_missing"
    }
    if ($payloadProofValidCount -le 0) {
        $blockers += "release_relay_payload_delivery_proof_missing"
    }

    $requirements.Add((New-Requirement `
        -Id "source_contract_ready" `
        -Status ($(if ($sourceContractReady) { "satisfied" } else { "missing" })) `
        -Evidence "release_relay_tunnel_runtime_source_contract_ready=$sourceContractReady" `
        -Next "Keep submit/accept/proof source hooks explicit before runtime marker changes.")) | Out-Null
    $requirements.Add((New-Requirement `
        -Id "runtime_marker_guard" `
        -Status ($(if ((-not $runtimeImplemented) -and $notImplementedBranchActive -and (-not $markerConflicts)) { "satisfied" } else { "failed" })) `
        -Evidence "RELAY_TUNNEL_RUNTIME_IMPLEMENTED=$runtimeImplemented; release_relay_tunnel_runtime_not_implemented_branch_active=$notImplementedBranchActive" `
        -Next "Do not set RELAY_TUNNEL_RUNTIME_IMPLEMENTED=true until the real byte path is implemented and the not-implemented branch is removed.")) | Out-Null
    $requirements.Add((New-Requirement `
        -Id "runtime_byte_path" `
        -Status ($(if ($runtimeImplemented) { "satisfied" } else { "missing" })) `
        -Evidence "release_relay_tunnel_runtime_implemented=$runtimeImplemented" `
        -Next "Implement actual quic_relay_tunnel payload byte transit in the local runtime.")) | Out-Null
    $requirements.Add((New-Requirement `
        -Id "transport_proof" `
        -Status ($(if ($transportProofValidCount -gt 0) { "satisfied" } else { "missing" })) `
        -Evidence "relay_route_transport_proof_valid_count=$transportProofValidCount" `
        -Next "Emit MUSU-bound quic_tls_1_3 relay_transport_proof from the real quic_relay_tunnel path.")) | Out-Null
    $requirements.Add((New-Requirement `
        -Id "payload_delivery_proof" `
        -Status ($(if ($payloadProofValidCount -gt 0) { "satisfied" } else { "missing" })) `
        -Evidence "relay_payload_delivery_proof_valid_count=$payloadProofValidCount" `
        -Next "Attach relay_payload_delivery_proof to the owner-scoped relay route record.")) | Out-Null
    $requirements.Add((New-Requirement `
        -Id "route_evidence" `
        -Status ($(if ($routeCount -gt 0 -and $metadataValidCount -gt 0) { "satisfied" } else { "missing" })) `
        -Evidence "relay_route_evidence_count=$routeCount; relay_route_metadata_valid_count=$metadataValidCount" `
        -Next "Record owner-scoped route_kind=relay success evidence with latency, identity, and transport metadata.")) | Out-Null
    $requirements.Add((New-Requirement `
        -Id "two_pc_failure_injection" `
        -Status "missing" `
        -Evidence "No current two-PC direct-blocked relay execution proof is accepted." `
        -Next "Run a physical two-PC failure-injection proof with direct blocked and relay task execution succeeding.")) | Out-Null
}

$runtimeMarkerCanBeFlipped = (
    $statusParseOk -and
    [bool]$status.release_relay_tunnel_runtime_implemented -and
    -not [bool]$status.release_relay_tunnel_runtime_not_implemented_branch_active -and
    -not [bool]$status.release_relay_tunnel_runtime_marker_conflicts_with_source_contract
)

$result = [ordered]@{
    schema = "musu.release_relay_transport_design_gate.v1"
    generated_at = $generatedAt.ToString("o")
    ok = ($statusParseOk -and $statusExit -eq 0 -and -not ($blockers -contains "release_relay_tunnel_source_contract_not_ready") -and -not ($blockers -contains "runtime_marker_conflicts_with_source_contract") -and -not ($blockers -contains "runtime_guard_branch_missing_before_implementation"))
    release_ready = $false
    base_url = $BaseUrl
    version = $Version
    p2p_env_status_command = "powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\show-musu-pro-p2p-env-status.ps1 -BaseUrl $BaseUrl -Version $Version -Json"
    p2p_env_status_parse_ok = [bool]$statusParseOk
    p2p_env_status_exit_code = $statusExit
    runtime_marker_can_be_flipped = [bool]$runtimeMarkerCanBeFlipped
    must_keep_runtime_marker_false = (-not [bool]$runtimeMarkerCanBeFlipped)
    required_runtime_marker = "RELAY_TUNNEL_RUNTIME_IMPLEMENTED=false until real quic_relay_tunnel byte transit and quic_tls_1_3 proof exist"
    source_runtime_blocker = "source_release_relay_tunnel_runtime_not_implemented"
    required_transport_kind = "quic_relay_tunnel"
    required_encryption = "quic_tls_1_3"
    blockers = @($blockers)
    requirements = $requirements.ToArray()
    implementation_sequence = @(
        "Implement local quic_relay_tunnel byte transit for delegated work payloads.",
        "Emit bound relay_transport_proof with session_id, lease_id, source_node_id, target_node_id, tunnel_id, transport_kind=quic_relay_tunnel, encryption=quic_tls_1_3, and transport_verified_by=musu_quic_tls_transport.",
        "Attach relay_payload_delivery_proof from the real byte path, not from preview store-forward queue fallback.",
        "Record owner-scoped route_kind=relay success evidence with payload_transited_musu_infra=true and release_grade=true.",
        "Remove the release_relay_tunnel_runtime_not_implemented branch and only then set RELAY_TUNNEL_RUNTIME_IMPLEMENTED=true.",
        "Run a physical two-PC direct-blocked relay execution proof and record live p2p-control-plane evidence."
    )
    verification_commands = @(
        "powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\audit-release-relay-transport-design-gate.ps1 -BaseUrl $BaseUrl -Json",
        "powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\show-musu-pro-p2p-env-status.ps1 -BaseUrl $BaseUrl -Version $Version -Json",
        "powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\record-p2p-control-plane-evidence.ps1 -BaseUrl $BaseUrl -Json",
        "powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\verify-p2p-control-plane-evidence.ps1 -EvidencePath <P2P_CONTROL_PLANE_EVIDENCE_JSON> -ExpectedVersion $Version -RequireIntegrity -Json"
    )
    p2p_env_status = $status
    notes = "This is a design/implementation gate. It must not be used as release proof and it never makes relay_transport_product_verified=true by itself."
}

$jsonText = $result | ConvertTo-Json -Depth 24
if (-not [string]::IsNullOrWhiteSpace($OutputPath)) {
    $outputDir = Split-Path -Parent $OutputPath
    if (-not [string]::IsNullOrWhiteSpace($outputDir)) {
        New-Item -ItemType Directory -Force -Path $outputDir | Out-Null
    }
    Set-Content -LiteralPath $OutputPath -Value $jsonText -Encoding UTF8
}

if ($Json) {
    $jsonText
}
else {
    "release relay transport design gate ok: $($result.ok)"
    "release ready: $($result.release_ready)"
    "runtime marker can be flipped: $($result.runtime_marker_can_be_flipped)"
    "must keep runtime marker false: $($result.must_keep_runtime_marker_false)"
    "blockers: $((@($result.blockers) -join ', '))"
}
