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

function Test-ContainsAll {
    param(
        [Parameter(Mandatory = $true)][string]$Text,
        [Parameter(Mandatory = $true)][string[]]$Needles
    )

    return @($Needles | Where-Object { -not $Text.Contains($_) }).Count -eq 0
}

$policyPath = "musu-bee\src\lib\p2pRelayPolicy.ts"
$payloadRoutePath = "musu-bee\src\app\api\v1\p2p\relay\payload\route.ts"
$payloadRouteTestPath = "musu-bee\src\app\api\v1\p2p\relay\payload\route.test.ts"
$leaseRoutePath = "musu-bee\src\app\api\v1\p2p\relay\lease\route.ts"
$transportRoutePath = "musu-bee\src\app\api\v1\p2p\relay\transport\route.ts"
$routeEvidencePath = "musu-bee\src\app\api\v1\p2p\route-evidence\route.ts"
$routeEvidenceTestPath = "musu-bee\src\app\api\v1\p2p\route-evidence\route.test.ts"
$routeEvidenceStorePath = "musu-bee\src\lib\routeEvidenceStore.ts"
$rendezvousStorePath = "musu-bee\src\lib\p2pRendezvousStore.ts"
$rendezvousCandidatesRoutePath = "musu-bee\src\app\api\v1\p2p\rendezvous\[id]\candidates\route.ts"
$roomPresenceRoutePath = "musu-bee\src\app\api\rooms\[roomId]\presence\route.ts"
$roomPresenceStorePath = "musu-bee\src\lib\roomPresenceStore.ts"
$rendezvousRouteTestPath = "musu-bee\src\app\api\v1\p2p\rendezvous\route.test.ts"
$roomPresenceRouteTestPath = "musu-bee\src\app\api\rooms\[roomId]\presence\route.test.ts"
$roomRendezvousRouteTestPath = "musu-bee\src\app\api\rooms\[roomId]\rendezvous\route.test.ts"
$rendezvousPath = "musu-rs\src\bridge\rendezvous.rs"
$relayPayloadDrainPath = "musu-rs\src\bridge\handlers\relay_payload.rs"
$forwardPath = "musu-rs\src\bridge\handlers\forward.rs"
$cloudPath = "musu-rs\src\cloud\mod.rs"
$statusScriptPath = "scripts\windows\show-musu-pro-p2p-env-status.ps1"
$p2pEvidenceVerifierPath = "scripts\windows\verify-p2p-control-plane-evidence.ps1"
$releaseEvidenceVerifierTestPath = "scripts\windows\test-release-evidence-verifiers.ps1"
$packageJsonPath = "musu-bee\package.json"

$policy = Get-RepoText $policyPath
$payloadRoute = Get-RepoText $payloadRoutePath
$payloadRouteTest = Get-RepoText $payloadRouteTestPath
$leaseRoute = Get-RepoText $leaseRoutePath
$transportRoute = Get-RepoText $transportRoutePath
$routeEvidence = Get-RepoText $routeEvidencePath
$routeEvidenceTest = Get-RepoText $routeEvidenceTestPath
$routeEvidenceStore = Get-RepoText $routeEvidenceStorePath
$rendezvousStore = Get-RepoText $rendezvousStorePath
$rendezvousCandidatesRoute = Get-RepoText $rendezvousCandidatesRoutePath
$roomPresenceRoute = Get-RepoText $roomPresenceRoutePath
$roomPresenceStore = Get-RepoText $roomPresenceStorePath
$rendezvousRouteTest = Get-RepoText $rendezvousRouteTestPath
$roomPresenceRouteTest = Get-RepoText $roomPresenceRouteTestPath
$roomRendezvousRouteTest = Get-RepoText $roomRendezvousRouteTestPath
$rendezvous = Get-RepoText $rendezvousPath
$relayPayloadDrain = Get-RepoText $relayPayloadDrainPath
$forward = Get-RepoText $forwardPath
$cloud = Get-RepoText $cloudPath
$statusScript = Get-RepoText $statusScriptPath
$p2pEvidenceVerifier = Get-RepoText $p2pEvidenceVerifierPath
$releaseEvidenceVerifierTest = Get-RepoText $releaseEvidenceVerifierTestPath
$packageJson = Get-RepoText $packageJsonPath

Add-Check `
    -Scope "policy" `
    -Name "queue fallback marker is implemented" `
    -Passed ($policy.Contains("RELAY_PAYLOAD_QUEUE_ENDPOINT_IMPLEMENTED = true")) `
    -Path $policyPath `
    -Message "p2pRelayPolicy marks the lease-bound store-forward payload queue endpoint implemented."

Add-Check `
    -Scope "policy" `
    -Name "release tunnel marker remains separate" `
    -Passed (
        $policy.Contains("RELAY_CONNECT_ENDPOINT_IMPLEMENTED = false") -and
        $policy.Contains("RELAY_PAYLOAD_ENDPOINT_IMPLEMENTED = false") -and
        $policy.Contains("return RELAY_PAYLOAD_ENDPOINT_IMPLEMENTED && relayConnectEndpointWired()") -and
        $policy.Contains("relayTransportKindReleaseGrade") -and
        $policy.Contains("return transportKind === RELEASE_GRADE_TRANSPORT_REQUIRED") -and
        $policy.Contains("return relayTransportFlagEnabled() && relayTransportKindReleaseGrade() && relayPayloadEndpointWired()") -and
        $policy.Contains('blockers.push("relay_transport_kind_not_release_grade")')
    ) `
    -Path $policyPath `
    -Message "Store-forward queue fallback cannot be reported as release-grade tunnel payload transport by env flags or non-release transport kind alone."

Add-Check `
    -Scope "web-payload-queue" `
    -Name "payload queue requires auth and lease" `
    -Passed (
        Test-ContainsAll -Text $payloadRoute -Needles @(
            "authorizeP2pControl(req)",
            "p2pControlPrincipal(req)",
            "queryRelayLeases",
            "relay_payload_lease_not_found"
        )
    ) `
    -Path $payloadRoutePath `
    -Message "Payload enqueue/claim/delivery routes require P2P control auth and bind payloads to owner-scoped relay leases."

Add-Check `
    -Scope "web-payload-queue" `
    -Name "payload queue supports store claim deliver" `
    -Passed (
        Test-ContainsAll -Text $payloadRoute -Needles @(
            "appendRelayPayload",
            "claimRelayPayloads",
            "markRelayPayloadDelivered",
            "relayPayloadDeliveryProofFromDeliveredPayload",
            "payload_transit_requires_lease: true"
        )
    ) `
    -Path $payloadRoutePath `
    -Message "Hosted payload queue can store, claim, mark delivered, and return delivery proof for lease-bound payloads."

Add-Check `
    -Scope "web-payload-queue" `
    -Name "payload queue stays non release-grade" `
    -Passed (
        $payloadRoute.Contains("release_grade: false") -and
        $payloadRoute.Contains("relay_payload_queue_not_quic_tls_transport") -and
        $payloadRoute.Contains("relay_default_data_path: false")
    ) `
    -Path $payloadRoutePath `
    -Message "Store-forward queue responses explicitly remain non-release-grade and non-default data path."

Add-Check `
    -Scope "web-lease-transport" `
    -Name "relay leases require direct failure and release policy" `
    -Passed (
        Test-ContainsAll -Text $leaseRoute -Needles @(
            "relay_requires_direct_path_failure",
            "direct_route_attempt_required_before_relay",
            "relay_payload_endpoint_not_wired",
            "relay_default_data_path: false"
        )
    ) `
    -Path $leaseRoutePath `
    -Message "Relay lease policy remains fallback-only and cannot become default data path."

Add-Check `
    -Scope "web-lease-transport" `
    -Name "transport preflight reports queue and tunnel separately" `
    -Passed (
        Test-ContainsAll -Text $transportRoute -Needles @(
            "relay_payload_queue_endpoint_wired",
            "relay_payload_endpoint_wired",
            "relay_transport_wired",
            "payload_transit_requires_lease: true",
            "release_grade_transport_required"
        )
    ) `
    -Path $transportRoutePath `
    -Message "Relay transport preflight reports queue endpoint, release payload endpoint, and release transport separately."

Add-Check `
    -Scope "web-rendezvous" `
    -Name "candidate endpoint metadata is preserved through web control plane" `
    -Passed (
        (Test-ContainsAll -Text $rendezvousStore -Needles @(
            "public_addr?: string | null",
            "nat_type?: P2pNatType | null",
            "nat_observed_by?: string | null",
            "relay_url?: string | null",
            "relay_protocol?: P2pRelayProtocol | null",
            "normalizeCandidateEndpoints(input.candidate_endpoints)"
        )) -and
        (Test-ContainsAll -Text $roomPresenceStore -Needles @(
            'import { normalizeCandidateEndpoints } from "@/lib/p2pRendezvousStore"',
            "candidate_endpoints: normalizeCandidateEndpoints(input.candidate_endpoints)"
        )) -and
        (Test-ContainsAll -Text $rendezvousCandidatesRoute -Needles @(
            "public_addr",
            "nat_type",
            "nat_observed_by",
            "relay_url",
            "relay_protocol"
        )) -and
        (Test-ContainsAll -Text $roomPresenceRoute -Needles @(
            "public_addr",
            "nat_type",
            "nat_observed_by",
            "relay_url",
            "relay_protocol"
        )) -and
        (Test-ContainsAll -Text $rendezvousRouteTest -Needles @(
            "203.0.113.10:8949",
            "symmetric",
            "https://relay.musu.pro/r/lease-pc-a",
            "port_restricted_cone"
        )) -and
        (Test-ContainsAll -Text $roomPresenceRouteTest -Needles @(
            "203.0.113.100:8949",
            "restricted_cone",
            "https://relay.musu.pro/r/lease-pc-a"
        )) -and
        (Test-ContainsAll -Text $roomRendezvousRouteTest -Needles @(
            "198.51.100.192:8949",
            "open_internet",
            "https://relay.musu.pro/r/lease-pc-b"
        ))
    ) `
    -Path $rendezvousStorePath `
    -Message "musu.pro room presence and rendezvous candidate exchange preserve public endpoint, NAT, and relay descriptors used for P2P path selection."

Add-Check `
    -Scope "route-evidence" `
    -Name "relay route evidence requires release transport proof" `
    -Passed (
        Test-ContainsAll -Text $routeEvidence -Needles @(
            "transport_not_release_grade_quic_tls",
            "missing_release_grade_transport_proof",
            "relay_route_transport_not_wired",
            "relay_route_payload_endpoint_not_wired",
            "relay_payload_delivery_proof"
        )
    ) `
    -Path $routeEvidencePath `
    -Message "Queue fallback delivery proof alone cannot create release-grade relay route evidence."

Add-Check `
    -Scope "route-evidence" `
    -Name "release-grade query revalidates relay delivery proof" `
    -Passed (
        Test-ContainsAll -Text $routeEvidenceStore -Needles @(
            "hasCurrentRelayFallbackProof",
            "hasCurrentRelayTransportProof",
            "hasCurrentRelayPayloadDeliveryProof",
            "hasCurrentReleaseGradeProofs",
            "relay.payload_transport_proven === true",
            "musu.relay_payload_delivery_proof.v1",
            "query.release_grade === true && !hasCurrentReleaseGradeProofs"
        )
    ) `
    -Path $routeEvidenceStorePath `
    -Message "Release-grade queries filter stale relay records unless current fallback, transport, and delivery proof shapes are present."

Add-Check `
    -Scope "route-evidence" `
    -Name "release-grade query binds relay transport proof to fallback lease" `
    -Passed (
        (Test-ContainsAll -Text $routeEvidenceStore -Needles @(
            'const relayLeaseId = evidence.relay_fallback?.lease_id?.trim() ?? "";',
            'const evidenceSessionId = evidence.session_id?.trim() ?? "";',
            '(!relayLeaseId || proof.lease_id.trim() === relayLeaseId)',
            '(!evidenceSessionId || proof.session_id.trim() === evidenceSessionId)'
        )) -and
        (Test-ContainsAll -Text $routeEvidenceTest -Needles @(
            "stale-relay-transport-lease-mismatch-release-grade",
            "stale-relay-transport-session-mismatch-release-grade"
        ))
    ) `
    -Path $routeEvidenceStorePath `
    -Message "Release-grade relay queries reject stale records whose transport proof is not bound to the fallback lease and session."

Add-Check `
    -Scope "route-evidence" `
    -Name "release-grade query rejects non release relay transport kind" `
    -Passed (
        (Test-ContainsAll -Text $routeEvidenceStore -Needles @(
            "RELEASE_GRADE_RELAY_TRANSPORT_KINDS",
            "quic_relay_tunnel",
            "RELEASE_GRADE_RELAY_TRANSPORT_KINDS.has(proof.transport_kind.trim())"
        )) -and
        (Test-ContainsAll -Text $routeEvidenceTest -Needles @(
            "stale-relay-transport-kind-mismatch-release-grade",
            'transport_kind: "websocket_tunnel"'
        ))
    ) `
    -Path $routeEvidenceStorePath `
    -Message "Release-grade relay queries reject stale/manual records whose transport proof kind is not the release tunnel kind."

Add-Check `
    -Scope "release-verifier" `
    -Name "hosted P2P verifier rejects websocket relay descriptor" `
    -Passed (
        (Test-ContainsAll -Text $p2pEvidenceVerifier -Needles @(
            '$transportKind = Get-StringProperty -Object $relayTransport -Name "relay_transport_kind"',
            'relay transport kind is release requirement',
            '$transportKind -eq $transportReleaseRequirement -and $transportKind -eq "quic_tls_1_3"'
        )) -and
        (Test-ContainsAll -Text $releaseEvidenceVerifierTest -Needles @(
            "p2p-bad-relay-transport-kind",
            "p2p rejects non-release relay transport kind",
            '$badP2pRelayTransportKind.relay_transport.relay_transport_kind = "websocket_tunnel"'
        ))
    ) `
    -Path $p2pEvidenceVerifierPath `
    -Message "Hosted P2P evidence cannot pass with the non-release websocket/queue relay descriptor."

Add-Check `
    -Scope "rust-source" `
    -Name "source enqueues after issued lease" `
    -Passed (
        Test-ContainsAll -Text $rendezvous -Needles @(
            "submit_relay_payload_after_lease",
            "relay.lease_issued",
            "relay.lease_id",
            "cloud.submit_relay_payload(payload)",
            "relay payload queued after failed direct route"
        )
    ) `
    -Path $rendezvousPath `
    -Message "Rust bridge enqueues relay payloads only after a relay lease is issued."

Add-Check `
    -Scope "rust-target" `
    -Name "target drain accepts claimed payload and records proof" `
    -Passed (
        Test-ContainsAll -Text $relayPayloadDrain -Needles @(
            "drain_relay_payloads_for_local_target",
            "claim_relay_payloads",
            "forwarded_task_from_relay_payload",
            "mark_relay_payload_delivered",
            "record_relay_payload_delivery_route_evidence",
            "route_evidence_submitted"
        )
    ) `
    -Path $relayPayloadDrainPath `
    -Message "Target-side drain claims queued payloads, accepts local work, marks delivery, and records/submits delivery proof route evidence."

Add-Check `
    -Scope "rust-target" `
    -Name "target polling is default-off low duty" `
    -Passed (
        Test-ContainsAll -Text $relayPayloadDrain -Needles @(
            "MUSU_ENABLE_RELAY_PAYLOAD_POLLER",
            "RELAY_PAYLOAD_POLLER_DEFAULT_INTERVAL_SEC: u64 = 60",
            "RELAY_PAYLOAD_POLLER_MIN_INTERVAL_SEC: u64 = 30",
            "cancellation_token.cancelled()",
            "relay payload poller disabled"
        )
    ) `
    -Path $relayPayloadDrainPath `
    -Message "Target-side relay poller is disabled by default and has explicit low-duty sleep/backoff/cancellation."

Add-Check `
    -Scope "rust-target" `
    -Name "forwarded payload is verified before execution" `
    -Passed (
        Test-ContainsAll -Text $forward -Needles @(
            "payload.status.trim() != `"claimed`"",
            "relay_payload_target_mismatch",
            "relay_payload_kind_unsupported",
            "relay_payload_sha256_mismatch",
            "relay_payload_session_mismatch"
        )
    ) `
    -Path $forwardPath `
    -Message "Relay payload decoding verifies claimed status, target, kind, hash, and session before local task acceptance."

Add-Check `
    -Scope "rust-client" `
    -Name "cloud DTOs expose queue fallback separately" `
    -Passed (
        Test-ContainsAll -Text $cloud -Needles @(
            "P2pRelayPayloadResponse",
            "P2pRelayPayloadClaimResponse",
            "P2pRelayPayloadDeliveryResponse",
            "relay_payload_queue_endpoint_wired",
            "pub relay_default_data_path: bool",
            "pub release_grade: bool",
            "pub relay_payload_store_release_grade: bool"
        )
    ) `
    -Path $cloudPath `
    -Message "Rust cloud DTOs expose store-forward queue status separately from release-grade transport."

Add-Check `
    -Scope "status" `
    -Name "status script audits full queue fallback chain" `
    -Passed (
        Test-ContainsAll -Text $statusScript -Needles @(
            "relay_payload_queue_fallback_implemented",
            "release_connect_fail_closed_placeholder_active",
            "release_payload_endpoint_queue_only",
            "web_queue_store_claim_deliver",
            "rust_enqueue_after_lease",
            "rust_target_drain_and_delivery_proof",
            "source_release_relay_connect_endpoint_not_implemented",
            "source_release_relay_connect_placeholder_active",
            "source_relay_transport_kind_not_release_grade",
            "source_release_relay_payload_marker_conflicts_with_queue_only_endpoint"
        )
    ) `
    -Path $statusScriptPath `
    -Message "Hosted P2P status reports implemented queue fallback separately from missing release tunnel endpoints."

Add-Check `
    -Scope "tests" `
    -Name "web queue route regression coverage" `
    -Passed (
        $packageJson.Contains("src/app/api/v1/p2p/relay/payload/route.test.ts") -and
        (Test-ContainsAll -Text $payloadRouteTest -Needles @(
            "stores lease-bound relay payload as owner-scoped non release-grade queue record",
            "claims queued relay payloads for the target node",
            "marks claimed relay payload delivered",
            "KV relay payload store claims and delivers owner-scoped payloads"
        ))
    ) `
    -Path $payloadRouteTestPath `
    -Message "P2P tests cover payload queue storage, target claim, delivery, and KV-backed ownership behavior."

Add-Check `
    -Scope "tests" `
    -Name "relay route evidence rejects non release-grade queue proof" `
    -Passed (
        Test-ContainsAll -Text $routeEvidenceTest -Needles @(
            "accepts stored delivered relay payload proof while keeping file-store proof non release grade",
            "transport_not_release_grade_quic_tls",
            "missing_release_grade_transport_proof",
            "relay_route_transport_proof_kind_not_release_grade"
        )
    ) `
    -Path $routeEvidenceTestPath `
    -Message "Route evidence tests keep queue/delivery proof from bypassing release-grade transport proof."

$failCount = @($checks | Where-Object { $_.status -eq "fail" }).Count
$result = [pscustomobject]@{
    schema = "musu.p2p_store_forward_relay_contract.v1"
    ok = ($failCount -eq 0)
    generated_at = [datetimeoffset]::Now.ToString("o")
    fail_count = $failCount
    checks = $checks.ToArray()
}

if ($Json) {
    $result | ConvertTo-Json -Depth 8
}
else {
    "MUSU P2P store-forward relay contract audit"
    "ok: $($result.ok)"
    "fail_count: $($result.fail_count)"
    ""
    $checks | Format-Table scope, name, status, path, message -Wrap
}

if ($FailOnProblem -and -not $result.ok) {
    exit 1
}
