[CmdletBinding()]
param(
    [string]$Repo = "yellowhama/musu-bee",
    [string]$Version,
    [string]$BaseUrl = "https://musu.pro",
    [string]$EvidencePath,
    [switch]$SkipGithub,
    [switch]$FailOnProblem,
    [switch]$Json
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = (Resolve-Path (Join-Path $scriptDir "..\..")).Path

if ([string]::IsNullOrWhiteSpace($Version)) {
    $Version = (Get-Content -LiteralPath (Join-Path $repoRoot "VERSION") -Raw).Trim()
}

function Get-StringProperty {
    param(
        $Object,
        [Parameter(Mandatory = $true)][string]$Name
    )

    if (-not $Object) {
        return ""
    }
    $property = $Object.PSObject.Properties[$Name]
    if (-not $property -or $null -eq $property.Value) {
        return ""
    }
    return [string]$property.Value
}

function Get-BoolProperty {
    param(
        $Object,
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

function Invoke-GhJson {
    param([Parameter(Mandatory = $true)][string[]]$Arguments)

    try {
        $raw = & gh @Arguments 2>$null
        if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace(($raw -join "`n"))) {
            return @()
        }
        $parsed = ($raw -join "`n") | ConvertFrom-Json
        if ($null -eq $parsed) {
            return @()
        }
        return @($parsed)
    }
    catch {
        return @()
    }
}

function Get-LatestP2pEvidencePath {
    param(
        [Parameter(Mandatory = $true)][string]$RepoRoot,
        [Parameter(Mandatory = $true)][string]$ReleaseVersion
    )

    $candidateDirs = @(
        (Join-Path $RepoRoot ("docs\evidence\p2p-control-plane\{0}" -f $ReleaseVersion)),
        (Join-Path $RepoRoot ".local-build\p2p-control-plane")
    )

    foreach ($dir in $candidateDirs) {
        if (-not (Test-Path -LiteralPath $dir)) {
            continue
        }
        $latest = Get-ChildItem -LiteralPath $dir -Filter "*.evidence.json" -File |
            Sort-Object LastWriteTimeUtc -Descending |
            Select-Object -First 1
        if ($latest) {
            return $latest.FullName
        }
    }

    return $null
}

function Get-EvidenceErrorClass {
    param([string]$Text)

    if ([string]::IsNullOrWhiteSpace($Text)) {
        return $null
    }
    if ($Text -like "*p2p_relay_lease_kv_not_configured*") {
        return "p2p_relay_lease_kv_not_configured"
    }
    if ($Text -like "*p2p_control_auth_not_configured*") {
        return "p2p_control_auth_not_configured"
    }
    if ($Text -like "*not_logged_in*") {
        return "p2p_runtime_not_logged_in"
    }
    if ($Text -like "*unauthorized*" -or $Text -like "*HTTP 401*") {
        return "p2p_control_unauthorized"
    }
    if ($Text -like "*relay_lease_query_failed*") {
        return "relay_lease_query_failed"
    }
    return "unknown"
}

function Get-P2pEvidenceVerification {
    param([string]$EvidenceFilePath)

    if ([string]::IsNullOrWhiteSpace($EvidenceFilePath)) {
        return $null
    }
    $verificationPath = $EvidenceFilePath -replace "\.evidence\.json$", ".verification.json"
    if ($verificationPath -eq $EvidenceFilePath -or -not (Test-Path -LiteralPath $verificationPath)) {
        return $null
    }
    try {
        return Get-Content -LiteralPath $verificationPath -Raw | ConvertFrom-Json
    }
    catch {
        return $null
    }
}

function Get-SourceRelayMarker {
    param(
        [Parameter(Mandatory = $true)][string]$RepoRoot
    )

    $policyPath = Join-Path $RepoRoot "musu-bee\src\lib\p2pRelayPolicy.ts"
    $connectRoutePath = Join-Path $RepoRoot "musu-bee\src\app\api\v1\relay\connect\route.ts"
    $releasePayloadRoutePath = Join-Path $RepoRoot "musu-bee\src\app\api\v1\relay\payload\route.ts"
    $payloadRoutePath = Join-Path $RepoRoot "musu-bee\src\app\api\v1\p2p\relay\payload\route.ts"
    $rustRendezvousPath = Join-Path $RepoRoot "musu-rs\src\bridge\rendezvous.rs"
    $rustRelayPayloadDrainPath = Join-Path $RepoRoot "musu-rs\src\bridge\handlers\relay_payload.rs"
    $summary = [ordered]@{
        checked = $false
        path = $policyPath
        error = $null
        relay_connect_endpoint_implemented = $false
        relay_payload_endpoint_implemented = $false
        release_payload_preflight_endpoint_implemented = $false
        relay_payload_queue_endpoint_implemented = $false
        release_relay_tunnel_runtime_implemented = $false
        release_relay_tunnel_runtime_source_contract_ready = $false
        release_relay_tunnel_runtime_not_implemented_branch_active = $false
        release_relay_tunnel_runtime_missing_source_hooks = @()
        release_tunnel_payload_endpoint_missing = $false
        release_payload_preflight_only = $false
        release_payload_endpoint_marker_conflicts_with_preflight_only = $false
        release_relay_tunnel_runtime_marker_conflicts_with_source_contract = $false
        release_connect_fail_closed_placeholder_active = $false
        preview_store_forward_payload_queue_non_release_grade = $false
        release_payload_endpoint_queue_only = $false
        relay_payload_queue_fallback_implemented = $false
        relay_payload_queue_fallback_components = [pscustomobject]@{
            policy_marker = $false
            web_queue_store_claim_deliver = $false
            rust_enqueue_after_lease = $false
            rust_target_drain_and_delivery_proof = $false
        }
        relay_transport_kind = ""
        release_grade_relay_transport_kind = ""
        release_grade_transport_required = ""
        relay_transport_kind_release_grade = $false
    }

    if (-not (Test-Path -LiteralPath $policyPath)) {
        $summary.error = "p2pRelayPolicy.ts_not_found"
        return [pscustomobject]$summary
    }

    try {
        $text = Get-Content -LiteralPath $policyPath -Raw
        $connectRouteText = if (Test-Path -LiteralPath $connectRoutePath) { Get-Content -LiteralPath $connectRoutePath -Raw } else { "" }
        $releasePayloadRouteText = if (Test-Path -LiteralPath $releasePayloadRoutePath) { Get-Content -LiteralPath $releasePayloadRoutePath -Raw } else { "" }
        $payloadRouteText = if (Test-Path -LiteralPath $payloadRoutePath) { Get-Content -LiteralPath $payloadRoutePath -Raw } else { "" }
        $rustRendezvousText = if (Test-Path -LiteralPath $rustRendezvousPath) { Get-Content -LiteralPath $rustRendezvousPath -Raw } else { "" }
        $rustRelayPayloadDrainText = if (Test-Path -LiteralPath $rustRelayPayloadDrainPath) { Get-Content -LiteralPath $rustRelayPayloadDrainPath -Raw } else { "" }
        $summary.checked = $true
        $summary.relay_connect_endpoint_implemented = [regex]::IsMatch($text, 'RELAY_CONNECT_ENDPOINT_IMPLEMENTED\s*=\s*true')
        $summary.relay_payload_endpoint_implemented = [regex]::IsMatch($text, 'RELAY_PAYLOAD_ENDPOINT_IMPLEMENTED\s*=\s*true')
        $summary.release_relay_tunnel_runtime_implemented = [regex]::IsMatch($text, 'RELAY_TUNNEL_RUNTIME_IMPLEMENTED\s*=\s*true')
        $summary.release_payload_preflight_endpoint_implemented = (
            [regex]::IsMatch($releasePayloadRouteText, 'musu\.relay_payload_preflight\.v1') -and
            [regex]::IsMatch($releasePayloadRouteText, 'authorizeP2pControl\(req\)') -and
            [regex]::IsMatch($releasePayloadRouteText, 'queryRelayLeases') -and
            [regex]::IsMatch($releasePayloadRouteText, 'relay_payload_endpoint_not_wired') -and
            -not [regex]::IsMatch($releasePayloadRouteText, 'appendRelayPayload')
        )
        $summary.release_payload_preflight_only = (
            [bool]$summary.release_payload_preflight_endpoint_implemented -and
            [regex]::IsMatch($releasePayloadRouteText, 'release_payload_accepted:\s*false') -and
            [regex]::IsMatch($releasePayloadRouteText, 'payload_transported:\s*false') -and
            [regex]::IsMatch($releasePayloadRouteText, 'releasePayloadBlocked') -and
            -not [regex]::IsMatch($releasePayloadRouteText, 'markRelayPayloadDelivered')
        )
        $summary.relay_payload_queue_endpoint_implemented = [regex]::IsMatch($text, 'RELAY_PAYLOAD_QUEUE_ENDPOINT_IMPLEMENTED\s*=\s*true')
        $summary.release_connect_fail_closed_placeholder_active = (
            [regex]::IsMatch($connectRouteText, 'relay_payload_transport_not_implemented') -and
            [regex]::IsMatch($connectRouteText, '\{\s*status:\s*501\s*\}') -and
            [regex]::IsMatch($connectRouteText, 'implement the QUIC/TLS relay payload service')
        )
        $summary.release_tunnel_payload_endpoint_missing = -not $summary.relay_payload_endpoint_implemented
        $summary.preview_store_forward_payload_queue_non_release_grade = (
            [regex]::IsMatch($payloadRouteText, 'release_grade:\s*false') -and
            [regex]::IsMatch($payloadRouteText, 'relay_payload_queue_not_quic_tls_transport') -and
            [regex]::IsMatch($payloadRouteText, 'relay_payload_queue_endpoint_wired:\s*true')
        )
        # Backward-compatible alias for older evidence/readers. The value describes
        # the preview store-forward queue, not the release /api/v1/relay/payload preflight endpoint.
        $summary.release_payload_endpoint_queue_only = $summary.preview_store_forward_payload_queue_non_release_grade
        $requiredReleaseTunnelHooks = [ordered]@{
            rust_source_submit_release_relay_tunnel_payload = [regex]::IsMatch($rustRendezvousText, 'submit_release_relay_tunnel_payload')
            rust_target_accept_release_relay_tunnel_payload = [regex]::IsMatch($rustRelayPayloadDrainText, 'accept_release_relay_tunnel_payload')
            rust_transport_emits_quic_relay_tunnel_proof = (
                [regex]::IsMatch($rustRendezvousText, 'quic_relay_tunnel') -and
                [regex]::IsMatch($rustRendezvousText, 'musu_quic_tls_transport')
            )
            rust_delivery_records_release_relay_tunnel_payload = (
                [regex]::IsMatch($rustRelayPayloadDrainText, 'quic_relay_tunnel') -and
                [regex]::IsMatch($rustRelayPayloadDrainText, 'release_grade:\s*true')
            )
        }
        $missingReleaseTunnelHooks = @(
            $requiredReleaseTunnelHooks.Keys |
                Where-Object { -not [bool]$requiredReleaseTunnelHooks[$_] } |
                ForEach-Object { [string]$_ }
        )
        $summary.release_relay_tunnel_runtime_missing_source_hooks = @($missingReleaseTunnelHooks)
        $summary.release_relay_tunnel_runtime_source_contract_ready = ($missingReleaseTunnelHooks.Count -eq 0)
        $summary.release_relay_tunnel_runtime_not_implemented_branch_active = (
            [regex]::IsMatch($rustRendezvousText, 'Err\(RELEASE_RELAY_TUNNEL_NOT_IMPLEMENTED\)') -or
            [regex]::IsMatch($rustRendezvousText, 'release_relay_tunnel_runtime_not_implemented')
        )
        $summary.release_payload_endpoint_marker_conflicts_with_preflight_only = (
            [bool]$summary.relay_payload_endpoint_implemented -and
            [bool]$summary.release_payload_preflight_only
        )
        $summary.release_relay_tunnel_runtime_marker_conflicts_with_source_contract = (
            [bool]$summary.release_relay_tunnel_runtime_implemented -and
            (
                -not [bool]$summary.release_relay_tunnel_runtime_source_contract_ready -or
                [bool]$summary.release_relay_tunnel_runtime_not_implemented_branch_active
            )
        )
        $queueFallbackComponents = [pscustomobject]@{
            policy_marker = [bool]$summary.relay_payload_queue_endpoint_implemented
            web_queue_store_claim_deliver = (
                [regex]::IsMatch($payloadRouteText, 'appendRelayPayload') -and
                [regex]::IsMatch($payloadRouteText, 'claimRelayPayloads') -and
                [regex]::IsMatch($payloadRouteText, 'markRelayPayloadDelivered')
            )
            rust_enqueue_after_lease = (
                [regex]::IsMatch($rustRendezvousText, 'submit_relay_payload_after_lease') -and
                [regex]::IsMatch($rustRendezvousText, 'cloud\.submit_relay_payload\(payload\)')
            )
            rust_target_drain_and_delivery_proof = (
                [regex]::IsMatch($rustRelayPayloadDrainText, 'drain_relay_payloads_for_local_target') -and
                [regex]::IsMatch($rustRelayPayloadDrainText, 'forwarded_task_from_relay_payload') -and
                [regex]::IsMatch($rustRelayPayloadDrainText, 'mark_relay_payload_delivered') -and
                [regex]::IsMatch($rustRelayPayloadDrainText, 'record_relay_payload_delivery_route_evidence')
            )
        }
        $summary.relay_payload_queue_fallback_components = $queueFallbackComponents
        $summary.relay_payload_queue_fallback_implemented = (
            [bool]$queueFallbackComponents.policy_marker -and
            [bool]$queueFallbackComponents.web_queue_store_claim_deliver -and
            [bool]$queueFallbackComponents.rust_enqueue_after_lease -and
            [bool]$queueFallbackComponents.rust_target_drain_and_delivery_proof
        )

        $transportKindMatch = [regex]::Match($text, 'RELAY_TRANSPORT_KIND\s*=\s*"([^"]+)"')
        if ($transportKindMatch.Success) {
            $summary.relay_transport_kind = $transportKindMatch.Groups[1].Value
        }

        $releaseTransportKindMatch = [regex]::Match($text, 'RELEASE_GRADE_RELAY_TRANSPORT_KIND\s*=\s*"([^"]+)"')
        if ($releaseTransportKindMatch.Success) {
            $summary.release_grade_relay_transport_kind = $releaseTransportKindMatch.Groups[1].Value
        }

        $releaseRequirementMatch = [regex]::Match($text, 'RELEASE_GRADE_TRANSPORT_REQUIRED\s*=\s*"([^"]+)"')
        if ($releaseRequirementMatch.Success) {
            $summary.release_grade_transport_required = $releaseRequirementMatch.Groups[1].Value
        }
        $summary.relay_transport_kind_release_grade = (
            -not [string]::IsNullOrWhiteSpace($summary.relay_transport_kind) -and
            -not [string]::IsNullOrWhiteSpace($summary.release_grade_relay_transport_kind) -and
            $summary.relay_transport_kind -eq $summary.release_grade_relay_transport_kind
        )
    }
    catch {
        $summary.error = $_.Exception.Message
    }

    return [pscustomobject]$summary
}

$requiredSecretNames = @(
    "MUSU_P2P_CONTROL_TOKEN_SHA256S"
)
$requiredStorageUrlNames = @(
    "KV_REST_API_URL",
    "UPSTASH_REDIS_REST_URL"
)
$requiredStorageTokenNames = @(
    "KV_REST_API_TOKEN",
    "UPSTASH_REDIS_REST_TOKEN"
)
$optionalSecretOrVariableNames = @(
    "KV_REST_API_URL",
    "UPSTASH_REDIS_REST_URL",
    "UPSTASH_REDIS_REST_TOKEN",
    "KV_REST_API_TOKEN",
    "MUSU_P2P_RELAY_ENABLED",
    "MUSU_P2P_RELAY_TRANSPORT_WIRED",
    "MUSU_P2P_RELAY_URL",
    "MUSU_P2P_RELAY_ENTITLEMENT",
    "MUSU_P2P_RELAY_LEASE_MAX_RECORDS",
    "MUSU_P2P_RELAY_LEASE_TTL_SEC"
)

$githubChecked = -not $SkipGithub
$secretNames = @()
$variableNames = @()
$githubError = $null

if ($githubChecked) {
    if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
        $githubError = "gh_not_found"
        $githubChecked = $false
    }
    else {
        $secrets = Invoke-GhJson -Arguments @("secret", "list", "--repo", $Repo, "--json", "name,updatedAt")
        $variables = Invoke-GhJson -Arguments @("variable", "list", "--repo", $Repo, "--json", "name,updatedAt")
        $secretNames = @($secrets | ForEach-Object { Get-StringProperty -Object $_ -Name "name" } | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
        $variableNames = @($variables | ForEach-Object { Get-StringProperty -Object $_ -Name "name" } | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
    }
}

$githubMissing = New-Object System.Collections.Generic.List[string]
foreach ($name in $requiredSecretNames) {
    if ($githubChecked -and ($secretNames -notcontains $name)) {
        $githubMissing.Add($name) | Out-Null
    }
}
if ($githubChecked -and (@($requiredStorageUrlNames | Where-Object { ($secretNames -contains $_) -or ($variableNames -contains $_) }).Count -eq 0)) {
    $githubMissing.Add("KV_REST_API_URL_OR_UPSTASH_REDIS_REST_URL") | Out-Null
}
if ($githubChecked -and (@($requiredStorageTokenNames | Where-Object { $secretNames -contains $_ }).Count -eq 0)) {
    $githubMissing.Add("KV_REST_API_TOKEN_OR_UPSTASH_REDIS_REST_TOKEN") | Out-Null
}

if ([string]::IsNullOrWhiteSpace($EvidencePath)) {
    $EvidencePath = Get-LatestP2pEvidencePath -RepoRoot $repoRoot -ReleaseVersion $Version
}

$sourceSummary = Get-SourceRelayMarker -RepoRoot $repoRoot

$evidenceSummary = [pscustomobject]@{
    checked = $false
    path = $null
    ok = $false
    recorded_at = $null
    relay_status_logged_in = $false
    relay_transport_logged_in = $false
    relay_leases_logged_in = $false
    relay_route_evidence_logged_in = $false
    relay_leases_ok = $false
    owner_scope_verified = $false
    owner_scoped = $false
    relay_status_transport_wired = $false
    relay_leases_transport_wired = $false
    relay_route_evidence_ok = $false
    relay_route_evidence_count = -1
    relay_route_metadata_valid_count = 0
    relay_route_metadata_required_count = 0
    relay_route_metadata_invalid_count = 0
    relay_route_transport_proof_valid_count = 0
    relay_route_transport_proof_required_count = 0
    relay_route_transport_proof_invalid_count = 0
    relay_payload_transport_proven = $false
    relay_payload_delivery_proof_valid_count = 0
    relay_payload_delivery_proof_required_count = 0
    relay_payload_delivery_proof_invalid_count = 0
    relay_transport_wired = $false
    relay_transport_descriptor_wired = $false
    relay_connect_endpoint_wired = $false
    relay_payload_endpoint_wired = $false
    relay_lease_store_configured = $false
    relay_lease_store_backend = ""
    relay_lease_store_release_grade = $false
    relay_default_data_path = $null
    error = $null
    error_class = $null
}

if (-not [string]::IsNullOrWhiteSpace($EvidencePath) -and (Test-Path -LiteralPath $EvidencePath)) {
    $evidence = Get-Content -LiteralPath $EvidencePath -Raw | ConvertFrom-Json
    $verification = Get-P2pEvidenceVerification -EvidenceFilePath $EvidencePath
    $relayLeases = if ($evidence.PSObject.Properties["relay_leases"]) { $evidence.relay_leases } else { $null }
    $relayStatus = if ($evidence.PSObject.Properties["relay_status"]) { $evidence.relay_status } else { $null }
    $relayTransport = if ($evidence.PSObject.Properties["relay_transport"]) { $evidence.relay_transport } else { $null }
    $relayRouteEvidence = if ($evidence.PSObject.Properties["relay_route_evidence"]) { $evidence.relay_route_evidence } else { $null }
    $relayError = Get-StringProperty -Object $relayLeases -Name "error"
    if ([string]::IsNullOrWhiteSpace($relayError)) {
        $relayError = Get-StringProperty -Object $relayStatus -Name "error"
    }
    if ([string]::IsNullOrWhiteSpace($relayError)) {
        $relayError = Get-StringProperty -Object $relayTransport -Name "error"
    }
    if ([string]::IsNullOrWhiteSpace($relayError)) {
        $relayError = Get-StringProperty -Object $relayRouteEvidence -Name "error"
    }
    $relayStatusTransportWired = Get-BoolProperty -Object $relayStatus -Name "relay_transport_wired"
    $relayLeasesTransportWired = Get-BoolProperty -Object $relayLeases -Name "relay_transport_wired"
    $relayTransportTransportWired = Get-BoolProperty -Object $relayTransport -Name "relay_transport_wired"
    $relayTransportDescriptorWired = (
        (Get-BoolProperty -Object $relayStatus -Name "relay_transport_descriptor_wired") -or
        (Get-BoolProperty -Object $relayTransport -Name "relay_transport_descriptor_wired")
    )
    $relayConnectEndpointWired = (
        (Get-BoolProperty -Object $relayStatus -Name "relay_connect_endpoint_wired") -or
        (Get-BoolProperty -Object $relayTransport -Name "relay_connect_endpoint_wired")
    )
    $relayPayloadEndpointWired = (
        (Get-BoolProperty -Object $relayStatus -Name "relay_payload_endpoint_wired") -or
        (Get-BoolProperty -Object $relayTransport -Name "relay_payload_endpoint_wired")
    )
    $relayLeaseStoreConfigured = (
        (Get-BoolProperty -Object $relayStatus -Name "relay_lease_store_configured") -or
        (Get-BoolProperty -Object $relayTransport -Name "relay_lease_store_configured") -or
        (Get-BoolProperty -Object $relayLeases -Name "relay_lease_store_configured")
    )
    $relayLeaseStoreBackend = Get-StringProperty -Object $relayLeases -Name "relay_lease_store_backend"
    if ([string]::IsNullOrWhiteSpace($relayLeaseStoreBackend)) {
        $relayLeaseStoreBackend = Get-StringProperty -Object $relayTransport -Name "relay_lease_store_backend"
    }
    if ([string]::IsNullOrWhiteSpace($relayLeaseStoreBackend)) {
        $relayLeaseStoreBackend = Get-StringProperty -Object $relayStatus -Name "relay_lease_store_backend"
    }
    $relayLeaseStoreReleaseGrade = (
        (Get-BoolProperty -Object $relayStatus -Name "relay_lease_store_release_grade") -or
        (Get-BoolProperty -Object $relayTransport -Name "relay_lease_store_release_grade") -or
        (Get-BoolProperty -Object $relayLeases -Name "relay_lease_store_release_grade")
    )
    $relayPayloadTransportProven = Get-BoolProperty -Object $relayRouteEvidence -Name "relay_transport_proven"
    $relayRouteEvidenceCount = if ($relayRouteEvidence -and $relayRouteEvidence.PSObject.Properties["count"]) { [int]$relayRouteEvidence.count } else { -1 }
    $relayRouteMetadataValidCount = if ($verification -and $verification.PSObject.Properties["relay_route_metadata_valid_count"]) { [int]$verification.relay_route_metadata_valid_count } else { 0 }
    $relayRouteMetadataRequiredCount = if ($verification -and $verification.PSObject.Properties["relay_route_metadata_required_count"]) { [int]$verification.relay_route_metadata_required_count } else { 0 }
    $relayRouteMetadataInvalidCount = if ($verification -and $verification.PSObject.Properties["relay_route_metadata_invalid_count"]) { [int]$verification.relay_route_metadata_invalid_count } else { 0 }
    $relayRouteTransportProofValidCount = if ($verification -and $verification.PSObject.Properties["relay_route_transport_proof_valid_count"]) { [int]$verification.relay_route_transport_proof_valid_count } else { 0 }
    $relayRouteTransportProofRequiredCount = if ($verification -and $verification.PSObject.Properties["relay_route_transport_proof_required_count"]) { [int]$verification.relay_route_transport_proof_required_count } else { 0 }
    $relayRouteTransportProofInvalidCount = if ($verification -and $verification.PSObject.Properties["relay_route_transport_proof_invalid_count"]) { [int]$verification.relay_route_transport_proof_invalid_count } else { 0 }
    $relayPayloadDeliveryProofValidCount = if ($verification -and $verification.PSObject.Properties["relay_payload_delivery_proof_valid_count"]) { [int]$verification.relay_payload_delivery_proof_valid_count } else { 0 }
    $relayPayloadDeliveryProofRequiredCount = if ($verification -and $verification.PSObject.Properties["relay_payload_delivery_proof_required_count"]) { [int]$verification.relay_payload_delivery_proof_required_count } else { 0 }
    $relayPayloadDeliveryProofInvalidCount = if ($verification -and $verification.PSObject.Properties["relay_payload_delivery_proof_invalid_count"]) { [int]$verification.relay_payload_delivery_proof_invalid_count } else { 0 }
    $evidenceSummary = [pscustomobject]@{
        checked = $true
        path = (Resolve-Path -LiteralPath $EvidencePath).Path
        ok = Get-BoolProperty -Object $evidence -Name "ok"
        recorded_at = Get-StringProperty -Object $evidence -Name "recorded_at"
        relay_status_logged_in = Get-BoolProperty -Object $relayStatus -Name "logged_in"
        relay_transport_logged_in = Get-BoolProperty -Object $relayTransport -Name "logged_in"
        relay_leases_logged_in = Get-BoolProperty -Object $relayLeases -Name "logged_in"
        relay_route_evidence_logged_in = Get-BoolProperty -Object $relayRouteEvidence -Name "logged_in"
        relay_leases_ok = Get-BoolProperty -Object $relayLeases -Name "ok"
        owner_scope_verified = Get-BoolProperty -Object $relayLeases -Name "owner_scope_verified"
        owner_scoped = Get-BoolProperty -Object $relayLeases -Name "owner_scoped"
        relay_status_transport_wired = $relayStatusTransportWired
        relay_leases_transport_wired = $relayLeasesTransportWired
        relay_route_evidence_ok = Get-BoolProperty -Object $relayRouteEvidence -Name "ok"
        relay_route_evidence_count = $relayRouteEvidenceCount
        relay_route_metadata_valid_count = $relayRouteMetadataValidCount
        relay_route_metadata_required_count = $relayRouteMetadataRequiredCount
        relay_route_metadata_invalid_count = $relayRouteMetadataInvalidCount
        relay_route_transport_proof_valid_count = $relayRouteTransportProofValidCount
        relay_route_transport_proof_required_count = $relayRouteTransportProofRequiredCount
        relay_route_transport_proof_invalid_count = $relayRouteTransportProofInvalidCount
        relay_payload_transport_proven = $relayPayloadTransportProven
        relay_payload_delivery_proof_valid_count = $relayPayloadDeliveryProofValidCount
        relay_payload_delivery_proof_required_count = $relayPayloadDeliveryProofRequiredCount
        relay_payload_delivery_proof_invalid_count = $relayPayloadDeliveryProofInvalidCount
        relay_transport_wired = ($relayStatusTransportWired -and $relayLeasesTransportWired -and $relayTransportTransportWired -and $relayPayloadTransportProven)
        relay_transport_descriptor_wired = $relayTransportDescriptorWired
        relay_connect_endpoint_wired = $relayConnectEndpointWired
        relay_payload_endpoint_wired = $relayPayloadEndpointWired
        relay_lease_store_configured = $relayLeaseStoreConfigured
        relay_lease_store_backend = $relayLeaseStoreBackend
        relay_lease_store_release_grade = $relayLeaseStoreReleaseGrade
        relay_default_data_path = if ($relayLeases) { Get-BoolProperty -Object $relayLeases -Name "relay_default_data_path" } elseif ($relayStatus) { Get-BoolProperty -Object $relayStatus -Name "relay_default_data_path" } else { $null }
        error = $relayError
        error_class = Get-EvidenceErrorClass -Text $relayError
    }
}

$blockers = New-Object System.Collections.Generic.List[string]
if ($githubError) {
    $blockers.Add($githubError) | Out-Null
}
if (-not $sourceSummary.checked) {
    $blockers.Add("source_relay_policy_marker_unavailable") | Out-Null
}
else {
    if (-not $sourceSummary.relay_payload_queue_fallback_implemented) {
        $blockers.Add("source_relay_payload_queue_fallback_not_implemented") | Out-Null
    }
    if (-not $sourceSummary.relay_connect_endpoint_implemented) {
        $blockers.Add("source_release_relay_connect_endpoint_not_implemented") | Out-Null
    }
    if (-not $sourceSummary.relay_payload_endpoint_implemented) {
        $blockers.Add("source_release_relay_payload_endpoint_not_implemented") | Out-Null
    }
    if (-not $sourceSummary.release_relay_tunnel_runtime_implemented) {
        $blockers.Add("source_release_relay_tunnel_runtime_not_implemented") | Out-Null
    }
    if ($sourceSummary.release_connect_fail_closed_placeholder_active) {
        $blockers.Add("source_release_relay_connect_placeholder_active") | Out-Null
    }
    if ($sourceSummary.preview_store_forward_payload_queue_non_release_grade) {
        $blockers.Add("source_preview_store_forward_payload_queue_non_release_grade") | Out-Null
    }
    if ($sourceSummary.relay_connect_endpoint_implemented -and $sourceSummary.release_connect_fail_closed_placeholder_active) {
        $blockers.Add("source_release_relay_connect_marker_conflicts_with_placeholder") | Out-Null
    }
    if ($sourceSummary.relay_payload_endpoint_implemented -and $sourceSummary.preview_store_forward_payload_queue_non_release_grade) {
        $blockers.Add("source_release_relay_payload_marker_conflicts_with_preview_queue_only") | Out-Null
    }
    if ($sourceSummary.release_payload_endpoint_marker_conflicts_with_preflight_only) {
        $blockers.Add("source_release_relay_payload_marker_conflicts_with_preflight_only") | Out-Null
    }
    if ($sourceSummary.release_relay_tunnel_runtime_marker_conflicts_with_source_contract) {
        $blockers.Add("source_release_relay_tunnel_runtime_marker_conflicts_with_source_contract") | Out-Null
    }
    if ($sourceSummary.release_grade_transport_required -ne "quic_tls_1_3") {
        $blockers.Add("source_release_transport_requirement_not_quic_tls") | Out-Null
    }
    if ($sourceSummary.release_grade_relay_transport_kind -ne "quic_relay_tunnel") {
        $blockers.Add("source_release_relay_transport_kind_requirement_not_quic_relay_tunnel") | Out-Null
    }
    if (-not $sourceSummary.relay_transport_kind_release_grade) {
        $blockers.Add("source_relay_transport_kind_not_release_grade") | Out-Null
    }
}
foreach ($name in $githubMissing) {
    $blockers.Add(("missing_{0}" -f $name.ToLowerInvariant())) | Out-Null
}
if (-not $evidenceSummary.checked) {
    $blockers.Add("missing_p2p_control_plane_evidence") | Out-Null
}
elseif (-not $evidenceSummary.ok) {
    if (-not [string]::IsNullOrWhiteSpace($evidenceSummary.error_class)) {
        $blockers.Add(("live_evidence_{0}" -f $evidenceSummary.error_class)) | Out-Null
    }
    else {
        $blockers.Add("live_evidence_not_ok") | Out-Null
    }
}
if ($evidenceSummary.checked -and -not $evidenceSummary.relay_transport_wired) {
    $blockers.Add("live_evidence_relay_transport_not_wired") | Out-Null
}
if ($evidenceSummary.checked -and -not $evidenceSummary.relay_payload_transport_proven) {
    $blockers.Add("live_evidence_relay_route_not_proven") | Out-Null
}
if ($evidenceSummary.checked -and $evidenceSummary.relay_route_metadata_valid_count -le 0) {
    $blockers.Add("live_evidence_relay_route_metadata_missing") | Out-Null
}
if ($evidenceSummary.checked -and $evidenceSummary.relay_route_transport_proof_valid_count -le 0) {
    $blockers.Add("live_evidence_relay_route_transport_proof_missing") | Out-Null
}
if ($evidenceSummary.checked -and $evidenceSummary.relay_payload_delivery_proof_valid_count -le 0) {
    $blockers.Add("live_evidence_relay_payload_delivery_proof_missing") | Out-Null
}

$nextSteps = New-Object System.Collections.Generic.List[string]
if ($blockers -contains "missing_kv_rest_api_url_or_upstash_redis_rest_url" -or $blockers -contains "missing_kv_rest_api_token_or_upstash_redis_rest_token" -or $blockers -contains "live_evidence_p2p_relay_lease_kv_not_configured") {
    $nextSteps.Add("Provision Vercel KV / Upstash Redis for the musu.pro project.") | Out-Null
    $nextSteps.Add("Use scripts\windows\configure-musu-pro-p2p-env.ps1 to set KV_REST_API_URL/KV_REST_API_TOKEN or UPSTASH_REDIS_REST_URL/UPSTASH_REDIS_REST_TOKEN without printing secret values.") | Out-Null
    $nextSteps.Add("Set KV_REST_API_URL and KV_REST_API_TOKEN, or the equivalent Upstash REST env names, in GitHub repo secrets/variables or Vercel production env.") | Out-Null
    $nextSteps.Add("Run gh workflow run deploy-musu-bee.yml --repo $Repo --ref main, then rerun P2P control-plane evidence.") | Out-Null
}
if ($blockers -contains "missing_musu_p2p_control_token_sha256s" -or $blockers -contains "live_evidence_p2p_control_auth_not_configured") {
    $nextSteps.Add("Set MUSU_P2P_CONTROL_TOKEN_SHA256S from scripts\windows\show-p2p-control-token-hash.ps1 -Json, then redeploy.") | Out-Null
}
if ($blockers -contains "live_evidence_p2p_runtime_not_logged_in") {
    $nextSteps.Add("Log in the packaged MUSU runtime with the WindowsApps alias, then rerun hosted P2P evidence: & `"`$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe`" login") | Out-Null
    $nextSteps.Add("Do not use the localhost developer dashboard to satisfy this gate; the required proof is a production runtime token accepted by https://musu.pro P2P control-plane endpoints.") | Out-Null
    $nextSteps.Add("After login, rerun scripts\windows\record-p2p-control-plane-evidence.ps1 -BaseUrl https://musu.pro -Json and confirm relay status, transport, leases, and route evidence all report logged_in=true.") | Out-Null
}
if ($blockers -contains "live_evidence_relay_transport_not_wired") {
    $nextSteps.Add("Implement and prove the relay payload transport before setting MUSU_P2P_RELAY_TRANSPORT_WIRED=1; the lease control-plane alone is not enough for public P2P release.") | Out-Null
    $nextSteps.Add("After relay payload transport is implemented, rerun scripts\windows\record-p2p-control-plane-evidence.ps1 and verify relay_status.relay_transport_wired and relay_leases.relay_transport_wired are both true.") | Out-Null
}
if ($blockers -contains "source_relay_payload_queue_fallback_not_implemented") {
    $nextSteps.Add("Wire the full store-forward relay queue chain: policy marker, owner-scoped web queue store/claim/deliver, source enqueue after lease, and target drain with delivery proof.") | Out-Null
}
if ($blockers -contains "source_release_relay_connect_endpoint_not_implemented") {
    $nextSteps.Add("Wire the release relay connect preflight endpoint in musu-bee\src\app\api\v1\relay\connect before relying on hosted relay status; env flags alone cannot make relay_transport_wired=true.") | Out-Null
}
if ($blockers -contains "source_release_relay_payload_endpoint_not_implemented") {
    if ($sourceSummary.release_payload_preflight_endpoint_implemented) {
        $nextSteps.Add("Current source has relay connect preflight, release payload preflight, and the store-forward payload queue fallback wired, but still marks the release tunnel payload endpoint false in musu-bee\src\lib\p2pRelayPolicy.ts.") | Out-Null
    }
    else {
        $nextSteps.Add("Current source has relay connect preflight and the store-forward payload queue fallback wired, but still marks the release tunnel payload endpoint false in musu-bee\src\lib\p2pRelayPolicy.ts.") | Out-Null
    }
    $nextSteps.Add("Add a distinct release tunnel payload endpoint that can emit quic_tls_1_3 proof before setting RELAY_PAYLOAD_ENDPOINT_IMPLEMENTED=true.") | Out-Null
}
if ($blockers -contains "source_release_relay_tunnel_runtime_not_implemented") {
    $nextSteps.Add("Implement the local release relay tunnel runtime before setting RELAY_TUNNEL_RUNTIME_IMPLEMENTED=true; DTO/proof recorders and preview queues are not enough.") | Out-Null
    $nextSteps.Add("The runtime implementation must move payload bytes through an actual quic_relay_tunnel path and emit MUSU-bound quic_tls_1_3 transport proof before relay_transport_wired can pass.") | Out-Null
}
if ($blockers -contains "source_release_relay_payload_marker_conflicts_with_preflight_only") {
    $nextSteps.Add("Do not set RELAY_PAYLOAD_ENDPOINT_IMPLEMENTED=true while /api/v1/relay/payload still returns preflight-only release_payload_accepted=false and payload_transported=false responses.") | Out-Null
}
if ($blockers -contains "source_release_relay_tunnel_runtime_marker_conflicts_with_source_contract") {
    $nextSteps.Add("Do not set RELAY_TUNNEL_RUNTIME_IMPLEMENTED=true until the Rust source has release tunnel submit/accept hooks, removes the release_relay_tunnel_runtime_not_implemented branch, and emits quic_relay_tunnel quic_tls_1_3 payload proof from the real byte path.") | Out-Null
}
if ($blockers -contains "source_relay_transport_kind_not_release_grade") {
    $nextSteps.Add("Keep relay_transport_wired=false while RELAY_TRANSPORT_KIND is not the release relay tunnel kind quic_relay_tunnel; a websocket/store-forward descriptor cannot satisfy the release transport gate.") | Out-Null
}
if ($blockers -contains "source_release_relay_transport_kind_requirement_not_quic_relay_tunnel") {
    $nextSteps.Add("Keep RELEASE_GRADE_RELAY_TRANSPORT_KIND=quic_relay_tunnel; quic_tls_1_3 is the release encryption/proof requirement, not the relay tunnel kind.") | Out-Null
}
if ($blockers -contains "source_release_relay_connect_placeholder_active") {
    $nextSteps.Add("Keep /api/v1/relay/connect fail-closed until a real relay/tunnel handshake exists; remove the 501 placeholder only with tests proving release-grade QUIC/TLS payload transport.") | Out-Null
}
if ($blockers -contains "source_preview_store_forward_payload_queue_non_release_grade") {
    $nextSteps.Add("Keep the preview store-forward payload queue labeled non-release-grade; it is not the release tunnel payload endpoint and cannot satisfy RELAY_PAYLOAD_ENDPOINT_IMPLEMENTED=true.") | Out-Null
}
if ($blockers -contains "source_release_relay_connect_marker_conflicts_with_placeholder" -or $blockers -contains "source_release_relay_payload_marker_conflicts_with_preview_queue_only") {
    $nextSteps.Add("Do not flip release source markers while the active implementation is still the fail-closed connect placeholder or non-release-grade preview queue fallback.") | Out-Null
}
if ($blockers -contains "live_evidence_relay_route_not_proven") {
    $nextSteps.Add("Record owner-scoped release-grade relay route evidence with route_kind=relay, result=success, payload_transited_musu_infra=true, and release_grade=true; env flags and relay leases alone are not sufficient.") | Out-Null
    $nextSteps.Add("Rerun scripts\windows\record-p2p-control-plane-evidence.ps1 and verify relay_route_evidence.relay_transport_proven=true with count > 0.") | Out-Null
}
if ($blockers -contains "live_evidence_relay_route_metadata_missing") {
    $nextSteps.Add("Attach and verify per-record route metadata in returned owner-scoped relay route evidence; each release route record must include candidate_addr, handshake_ms, total_attempt_ms, verified peer identity, quic_tls_1_3 encryption, and transport_verified_by=musu_quic_tls_transport.") | Out-Null
    $nextSteps.Add("Rerun scripts\windows\record-p2p-control-plane-evidence.ps1 and verify relay_route_metadata_valid_count > 0.") | Out-Null
}
if ($blockers -contains "live_evidence_relay_route_transport_proof_missing") {
    $nextSteps.Add("Attach and verify per-record relay_transport_proof in returned owner-scoped relay route evidence; the proof must bind session_id, lease_id, source_node_id, target_node_id, tunnel_id, quic_relay_tunnel, and quic_tls_1_3.") | Out-Null
    $nextSteps.Add("Rerun scripts\windows\record-p2p-control-plane-evidence.ps1 and verify relay_route_transport_proof_valid_count > 0.") | Out-Null
}
if ($blockers -contains "live_evidence_relay_payload_delivery_proof_missing") {
    $nextSteps.Add("Attach and verify per-record relay_payload_delivery_proof in returned owner-scoped relay route evidence; relay_transport_proven=true without delivery proof is not release-grade.") | Out-Null
    $nextSteps.Add("Rerun scripts\windows\record-p2p-control-plane-evidence.ps1 and verify relay_payload_delivery_proof_valid_count > 0.") | Out-Null
}
if ($nextSteps.Count -eq 0 -and $blockers.Count -gt 0) {
    $nextSteps.Add("Inspect the latest P2P evidence and rerun record-p2p-control-plane-evidence.ps1 after fixing the listed blockers.") | Out-Null
}

$result = [pscustomobject]@{
    schema = "musu.p2p_control_plane_env_status.v1"
    ok = ($blockers.Count -eq 0)
    checked_at = [datetimeoffset]::Now.ToString("o")
    repo = $Repo
    version = $Version
    base_url = $BaseUrl
    relay_payload_queue_fallback_implemented = $sourceSummary.relay_payload_queue_fallback_implemented
    release_relay_connect_endpoint_implemented = $sourceSummary.relay_connect_endpoint_implemented
    release_relay_payload_endpoint_implemented = $sourceSummary.relay_payload_endpoint_implemented
    release_payload_preflight_endpoint_implemented = $sourceSummary.release_payload_preflight_endpoint_implemented
    release_payload_preflight_only = $sourceSummary.release_payload_preflight_only
    release_tunnel_payload_endpoint_missing = $sourceSummary.release_tunnel_payload_endpoint_missing
    release_relay_tunnel_runtime_implemented = $sourceSummary.release_relay_tunnel_runtime_implemented
    release_relay_tunnel_runtime_source_contract_ready = $sourceSummary.release_relay_tunnel_runtime_source_contract_ready
    release_relay_tunnel_runtime_not_implemented_branch_active = $sourceSummary.release_relay_tunnel_runtime_not_implemented_branch_active
    release_relay_tunnel_runtime_missing_source_hooks = @($sourceSummary.release_relay_tunnel_runtime_missing_source_hooks)
    release_payload_endpoint_marker_conflicts_with_preflight_only = $sourceSummary.release_payload_endpoint_marker_conflicts_with_preflight_only
    release_relay_tunnel_runtime_marker_conflicts_with_source_contract = $sourceSummary.release_relay_tunnel_runtime_marker_conflicts_with_source_contract
    preview_store_forward_payload_queue_non_release_grade = $sourceSummary.preview_store_forward_payload_queue_non_release_grade
    relay_transport_kind = $sourceSummary.relay_transport_kind
    release_grade_relay_transport_kind = $sourceSummary.release_grade_relay_transport_kind
    release_grade_transport_required = $sourceSummary.release_grade_transport_required
    relay_transport_kind_release_grade = $sourceSummary.relay_transport_kind_release_grade
    source = $sourceSummary
    github = [pscustomobject]@{
        checked = $githubChecked
        error = $githubError
        required_secret_names = $requiredSecretNames
        required_storage_url_names = $requiredStorageUrlNames
        required_storage_token_names = $requiredStorageTokenNames
        optional_secret_or_variable_names = $optionalSecretOrVariableNames
        secret_names_present = @($secretNames | Where-Object { ($requiredSecretNames + $requiredStorageUrlNames + $requiredStorageTokenNames + $optionalSecretOrVariableNames) -contains $_ })
        variable_names_present = @($variableNames | Where-Object { ($requiredStorageUrlNames + $optionalSecretOrVariableNames) -contains $_ })
        missing_required_names = $githubMissing.ToArray()
    }
    evidence = $evidenceSummary
    blockers = $blockers.ToArray()
    next_steps = $nextSteps.ToArray()
    notes = "Secret values are never printed; this status checks GitHub names, local source relay markers, store-forward queue fallback source wiring, and live evidence only."
}

if ($Json) {
    $result | ConvertTo-Json -Depth 8
}
else {
    "MUSU musu.pro P2P env status"
    "ok: $($result.ok)"
    "repo: $Repo"
    "version: $Version"
    "base_url: $BaseUrl"
    "source store-forward relay queue fallback implemented: $($result.source.relay_payload_queue_fallback_implemented)"
    "source release relay connect endpoint implemented: $($result.source.relay_connect_endpoint_implemented)"
    "source release relay payload endpoint implemented: $($result.source.relay_payload_endpoint_implemented)"
    "source release tunnel payload endpoint missing: $($result.source.release_tunnel_payload_endpoint_missing)"
    "source release relay tunnel runtime implemented: $($result.source.release_relay_tunnel_runtime_implemented)"
    "source release relay tunnel runtime source contract ready: $($result.source.release_relay_tunnel_runtime_source_contract_ready)"
    "source release relay tunnel runtime not implemented branch active: $($result.source.release_relay_tunnel_runtime_not_implemented_branch_active)"
    "source release relay tunnel runtime missing source hooks: $((@($result.source.release_relay_tunnel_runtime_missing_source_hooks) -join ', '))"
    "source release relay payload preflight endpoint implemented: $($result.source.release_payload_preflight_endpoint_implemented)"
    "source release payload preflight only: $($result.source.release_payload_preflight_only)"
    "source release payload marker conflicts with preflight only: $($result.source.release_payload_endpoint_marker_conflicts_with_preflight_only)"
    "source release relay tunnel runtime marker conflicts with source contract: $($result.source.release_relay_tunnel_runtime_marker_conflicts_with_source_contract)"
    "source preview store-forward payload queue non-release-grade: $($result.source.preview_store_forward_payload_queue_non_release_grade)"
    "source relay transport kind: $($result.source.relay_transport_kind)"
    "source release relay transport kind required: $($result.source.release_grade_relay_transport_kind)"
    "source release transport encryption required: $($result.source.release_grade_transport_required)"
    "source relay transport kind release-grade: $($result.source.relay_transport_kind_release_grade)"
    "source release relay connect placeholder active: $($result.source.release_connect_fail_closed_placeholder_active)"
    "source release payload endpoint queue-only legacy alias: $($result.source.release_payload_endpoint_queue_only)"
    "evidence: $($result.evidence.path)"
    "evidence relay route metadata valid count: $($result.evidence.relay_route_metadata_valid_count)"
    "evidence relay route transport proof valid count: $($result.evidence.relay_route_transport_proof_valid_count)"
    "evidence relay payload delivery proof valid count: $($result.evidence.relay_payload_delivery_proof_valid_count)"
    "blockers: $(@($result.blockers) -join ', ')"
    if ($result.next_steps.Count -gt 0) {
        ""
        "Next steps:"
        foreach ($step in $result.next_steps) {
            "- $step"
        }
    }
}

if ($FailOnProblem -and -not $result.ok) {
    exit 1
}
