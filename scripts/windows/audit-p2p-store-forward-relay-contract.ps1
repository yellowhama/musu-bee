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
$releaseConnectPreflightRoutePath = "musu-bee\src\app\api\v1\relay\connect\route.ts"
$releaseConnectPreflightRouteTestPath = "musu-bee\src\app\api\v1\relay\connect\route.test.ts"
$releaseRelayLeaseValidationPath = "musu-bee\src\lib\p2pReleaseRelayLeaseValidation.ts"
$payloadStorePath = "musu-bee\src\lib\p2pRelayPayloadStore.ts"
$payloadRoutePath = "musu-bee\src\app\api\v1\p2p\relay\payload\route.ts"
$payloadRouteTestPath = "musu-bee\src\app\api\v1\p2p\relay\payload\route.test.ts"
$releasePayloadPreflightRoutePath = "musu-bee\src\app\api\v1\relay\payload\route.ts"
$releasePayloadPreflightRouteTestPath = "musu-bee\src\app\api\v1\relay\payload\route.test.ts"
$leaseRoutePath = "musu-bee\src\app\api\v1\p2p\relay\lease\route.ts"
$leaseRouteTestPath = "musu-bee\src\app\api\v1\p2p\relay\lease\route.test.ts"
$transportRoutePath = "musu-bee\src\app\api\v1\p2p\relay\transport\route.ts"
$transportProofRoutePath = "musu-bee\src\app\api\v1\p2p\relay\transport-proof\route.ts"
$transportProofRouteTestPath = "musu-bee\src\app\api\v1\p2p\relay\transport-proof\route.test.ts"
$routeEvidencePath = "musu-bee\src\app\api\v1\p2p\route-evidence\route.ts"
$routeEvidenceTestPath = "musu-bee\src\app\api\v1\p2p\route-evidence\route.test.ts"
$routeEvidenceStorePath = "musu-bee\src\lib\routeEvidenceStore.ts"
$rendezvousStorePath = "musu-bee\src\lib\p2pRendezvousStore.ts"
$rendezvousRoutePath = "musu-bee\src\app\api\v1\p2p\rendezvous\route.ts"
$rendezvousCandidatesRoutePath = "musu-bee\src\app\api\v1\p2p\rendezvous\[id]\candidates\route.ts"
$roomPresenceRoutePath = "musu-bee\src\app\api\rooms\[roomId]\presence\route.ts"
$roomRendezvousRoutePath = "musu-bee\src\app\api\rooms\[roomId]\rendezvous\route.ts"
$roomPresenceStorePath = "musu-bee\src\lib\roomPresenceStore.ts"
$rendezvousRouteTestPath = "musu-bee\src\app\api\v1\p2p\rendezvous\route.test.ts"
$roomPresenceRouteTestPath = "musu-bee\src\app\api\rooms\[roomId]\presence\route.test.ts"
$roomRendezvousRouteTestPath = "musu-bee\src\app\api\rooms\[roomId]\rendezvous\route.test.ts"
$rendezvousPath = "musu-rs\src\bridge\rendezvous.rs"
$bridgeRouteEvidencePath = "musu-rs\src\bridge\route_evidence.rs"
$relayPayloadDrainPath = "musu-rs\src\bridge\handlers\relay_payload.rs"
$forwardPath = "musu-rs\src\bridge\handlers\forward.rs"
$cloudPath = "musu-rs\src\cloud\mod.rs"
$cliCommandsPath = "musu-rs\src\install\cli_commands.rs"
$statusScriptPath = "scripts\windows\show-musu-pro-p2p-env-status.ps1"
$p2pEvidenceVerifierPath = "scripts\windows\verify-p2p-control-plane-evidence.ps1"
$releaseEvidenceVerifierTestPath = "scripts\windows\test-release-evidence-verifiers.ps1"
$packageJsonPath = "musu-bee\package.json"
$p2pControlAuthPath = "musu-bee\src\lib\p2pControlAuth.ts"

$policy = Get-RepoText $policyPath
$releaseConnectPreflightRoute = Get-RepoText $releaseConnectPreflightRoutePath
$releaseConnectPreflightRouteTest = Get-RepoText $releaseConnectPreflightRouteTestPath
$releaseRelayLeaseValidation = Get-RepoText $releaseRelayLeaseValidationPath
$payloadStore = Get-RepoText $payloadStorePath
$payloadRoute = Get-RepoText $payloadRoutePath
$payloadRouteTest = Get-RepoText $payloadRouteTestPath
$releasePayloadPreflightRoute = Get-RepoText $releasePayloadPreflightRoutePath
$releasePayloadPreflightRouteTest = Get-RepoText $releasePayloadPreflightRouteTestPath
$leaseRoute = Get-RepoText $leaseRoutePath
$leaseRouteTest = Get-RepoText $leaseRouteTestPath
$transportRoute = Get-RepoText $transportRoutePath
$transportProofRoute = Get-RepoText $transportProofRoutePath
$transportProofRouteTest = Get-RepoText $transportProofRouteTestPath
$routeEvidence = Get-RepoText $routeEvidencePath
$routeEvidenceTest = Get-RepoText $routeEvidenceTestPath
$routeEvidenceStore = Get-RepoText $routeEvidenceStorePath
$rendezvousStore = Get-RepoText $rendezvousStorePath
$rendezvousRoute = Get-RepoText $rendezvousRoutePath
$rendezvousCandidatesRoute = Get-RepoText $rendezvousCandidatesRoutePath
$roomPresenceRoute = Get-RepoText $roomPresenceRoutePath
$roomRendezvousRoute = Get-RepoText $roomRendezvousRoutePath
$roomPresenceStore = Get-RepoText $roomPresenceStorePath
$rendezvousRouteTest = Get-RepoText $rendezvousRouteTestPath
$roomPresenceRouteTest = Get-RepoText $roomPresenceRouteTestPath
$roomRendezvousRouteTest = Get-RepoText $roomRendezvousRouteTestPath
$rendezvous = Get-RepoText $rendezvousPath
$bridgeRouteEvidence = Get-RepoText $bridgeRouteEvidencePath
$relayPayloadDrain = Get-RepoText $relayPayloadDrainPath
$forward = Get-RepoText $forwardPath
$cloud = Get-RepoText $cloudPath
$cliCommands = Get-RepoText $cliCommandsPath
$statusScript = Get-RepoText $statusScriptPath
$p2pEvidenceVerifier = Get-RepoText $p2pEvidenceVerifierPath
$releaseEvidenceVerifierTest = Get-RepoText $releaseEvidenceVerifierTestPath
$packageJson = Get-RepoText $packageJsonPath
$p2pControlAuth = Get-RepoText $p2pControlAuthPath

Add-Check `
    -Scope "policy" `
    -Name "queue fallback marker is implemented" `
    -Passed ($policy.Contains("RELAY_PAYLOAD_QUEUE_ENDPOINT_IMPLEMENTED = true")) `
    -Path $policyPath `
    -Message "p2pRelayPolicy marks the lease-bound store-forward payload queue endpoint implemented."

Add-Check `
    -Scope "policy" `
    -Name "release connect preflight remains separate from payload transport" `
    -Passed (
        $policy.Contains("RELAY_CONNECT_ENDPOINT_IMPLEMENTED = true") -and
        $policy.Contains("RELAY_PAYLOAD_ENDPOINT_IMPLEMENTED = true") -and
        $policy.Contains('RELEASE_GRADE_RELAY_TRANSPORT_KIND = "quic_relay_tunnel"') -and
        $policy.Contains('RELEASE_GRADE_TRANSPORT_REQUIRED = "quic_tls_1_3"') -and
        $policy.Contains("RELAY_TUNNEL_RUNTIME_IMPLEMENTED = false") -and
        $policy.Contains("return RELAY_PAYLOAD_ENDPOINT_IMPLEMENTED && relayConnectEndpointWired()") -and
        $policy.Contains("relayTunnelRuntimeImplemented") -and
        $policy.Contains("relayTransportKindReleaseGrade") -and
        $policy.Contains("return transportKind === RELEASE_GRADE_RELAY_TRANSPORT_KIND") -and
        $policy.Contains("relayPayloadEndpointWired() &&") -and
        $policy.Contains("relayTunnelRuntimeImplemented()") -and
        $policy.Contains('blockers.push("relay_tunnel_runtime_not_implemented")') -and
        $policy.Contains('blockers.push("relay_transport_kind_not_release_grade")')
    ) `
    -Path $policyPath `
    -Message "Relay connect and payload proof endpoints can be source-wired without allowing env flags, preview queues, or missing tunnel runtime to claim release-grade payload transport."

Add-Check `
    -Scope "web-auth" `
    -Name "P2P control auth binds bearer token hashes to source nodes" `
    -Passed (
        Test-ContainsAll -Text $p2pControlAuth -Needles @(
            "MUSU_P2P_CONTROL_TOKEN_NODE_BINDINGS",
            "configuredP2pControlTokenNodeBindings",
            "p2pControlTokenSha256",
            "bound_source_node_id",
            "p2pSourceNodeAuthMismatch",
            "source_node_id_auth_mismatch"
        )
    ) `
    -Path $p2pControlAuthPath `
    -Message "P2P control auth supports hash-based source_node_id binding without storing raw node tokens."

Add-Check `
    -Scope "web-auth" `
    -Name "source node auth binding is enforced on source-claiming control-plane writes" `
    -Passed (
        (Test-ContainsAll -Text $leaseRoute -Needles @(
            "p2pSourceNodeAuthMismatch",
            "declared_source_node_id"
        )) -and
        (Test-ContainsAll -Text $payloadRoute -Needles @(
            "p2pSourceNodeAuthMismatch",
            "declared_source_node_id"
        )) -and
        (Test-ContainsAll -Text $transportProofRoute -Needles @(
            "p2pSourceNodeAuthMismatch",
            "declared_source_node_id"
        )) -and
        (Test-ContainsAll -Text $routeEvidence -Needles @(
            "p2pSourceNodeAuthMismatch",
            "declared_source_node_id"
        )) -and
        (Test-ContainsAll -Text $rendezvousRoute -Needles @(
            "p2pSourceNodeAuthMismatch",
            "declared_source_node_id"
        )) -and
        (Test-ContainsAll -Text $roomRendezvousRoute -Needles @(
            "p2pSourceNodeAuthMismatch",
            "declared_source_node_id"
        ))
    ) `
    -Path $p2pControlAuthPath `
    -Message "Rendezvous, relay lease, relay payload, transport proof, and route evidence writes fail closed when an authenticated node token is bound to a different source_node_id."

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
    -Name "delivery proof preserves custody metadata" `
    -Passed (
        Test-ContainsAll -Text $payloadStore -Needles @(
            "payload_kind: string",
            "claimed_by: string",
            "claimed_at: string",
            "created_at: string",
            "claimedBy = payload.claimed_by?.trim()",
            "claimedAt = payload.claimed_at?.trim()",
            "payload_kind: payload.payload_kind",
            "claimed_by: claimedBy",
            "claimed_at: claimedAt",
            "created_at: payload.created_at"
        )
    ) `
    -Path $payloadStorePath `
    -Message "Relay payload delivery proof binds payload kind, claimant, claim time, creation time, digest, and delivery time."

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
    -Scope "web-release-payload-preflight" `
    -Name "release connect preflight fails closed and accepts metadata only" `
    -Passed (
        (Test-ContainsAll -Text $releaseConnectPreflightRoute -Needles @(
            "musu.relay_connect.v1",
            "musu.relay_connect_request.v1",
            "}).strict()",
            "authorizeP2pControl(req)",
            "p2pControlPrincipal(req)",
            "queryRelayLeases",
            "releaseRelayLeaseBlockers",
            "release_relay_lease_not_connect_ready",
            "release_connect_lease_ready",
            "FORBIDDEN_RELAY_CONNECT_BYTE_FIELDS",
            "relay_connect_payload_bytes_not_accepted",
            "relay_connect_accepted: false",
            "payload_transported: false",
            "relay_payload_endpoint_not_wired"
        )) -and
        -not $releaseConnectPreflightRoute.Contains("appendRelayPayload") -and
        -not $releaseConnectPreflightRoute.Contains("markRelayPayloadDelivered")
    ) `
    -Path $releaseConnectPreflightRoutePath `
    -Message "The distinct release relay connect endpoint validates auth and lease state, rejects payload bytes and unknown fields, and never reuses the non-release-grade store-forward queue as release transport."

Add-Check `
    -Scope "web-release-payload-preflight" `
    -Name "release payload endpoint is proof-bound and does not use queue storage" `
    -Passed (
        (Test-ContainsAll -Text $releasePayloadPreflightRoute -Needles @(
            "musu.relay_payload_preflight.v1",
            "musu.relay_payload_preflight_request.v1",
            "musu.relay_payload_release_request.v1",
            "musu.relay_transport_proof.v1",
            "musu.relay_payload_delivery_proof.v1",
            "}).strict()",
            'tunnel_id: z.string().min(1).max(128)',
            'payload_kind: z.literal("forwarded_task_envelope")',
            "payload_sha256: z.string().regex",
            "authorizeP2pControl(req)",
            "p2pControlPrincipal(req)",
            "queryRelayLeases",
            "releaseRelayLeaseBlockers",
            "appendRelayTransportProof",
            "createRelayTransportProof",
            "release_relay_lease_not_payload_ready",
            "release_payload_lease_ready",
            "release_payload_proof_ready",
            "release_payload_contract",
            "RELAY_PAYLOAD_PATH",
            "release_payload_metadata",
            "release_payload_endpoint_preflight_wired: true",
            "release_payload_accepted: true",
            "release_payload_accepted: false",
            "payload_transported: true",
            "payload_stored: false",
            "payload_transported: false",
            "FORBIDDEN_RELEASE_PAYLOAD_BYTE_FIELDS",
            "release_payload_bytes_not_accepted"
        )) -and
        -not $releasePayloadPreflightRoute.Contains("appendRelayPayload") -and
        -not $releasePayloadPreflightRoute.Contains("markRelayPayloadDelivered")
    ) `
    -Path $releasePayloadPreflightRoutePath `
    -Message "The distinct release payload endpoint validates auth, lease state, transport proof, and delivery proof without accepting raw payload bytes or reusing the non-release-grade store-forward queue as release transport."

Add-Check `
    -Scope "web-release-payload-preflight" `
    -Name "release relay lease readiness rejects stale relay leases" `
    -Passed (
        Test-ContainsAll -Text $releaseRelayLeaseValidation -Needles @(
            "releaseRelayLeaseBlockers",
            "publicReleaseRelayLease",
            "release_relay_lease_relay_url_mismatch",
            "release_relay_lease_relay_url_not_wss",
            "release_relay_lease_direct_route_attempt_missing",
            "release_relay_lease_failure_class_missing",
            "release_relay_lease_default_data_path",
            "release_relay_lease_payload_transit_not_musu_infra"
        )
    ) `
    -Path $releaseRelayLeaseValidationPath `
    -Message "Release connect/payload preflight rejects relay leases that are stale, non-WSS, missing direct-route failure context, or no longer bound to the configured relay URL."

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
            "release_grade_relay_transport_kind",
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
            '"quic_relay_tunnel"',
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
            "relay_protocol",
            '"quic_relay_tunnel"'
        )) -and
        (Test-ContainsAll -Text $roomPresenceRoute -Needles @(
            "public_addr",
            "nat_type",
            "nat_observed_by",
            "relay_url",
            "relay_protocol",
            '"quic_relay_tunnel"'
        )) -and
        (Test-ContainsAll -Text $rendezvousRouteTest -Needles @(
            "203.0.113.10:8949",
            "symmetric",
            "https://relay.musu.pro/r/lease-pc-a",
            "quic_relay_tunnel",
            "port_restricted_cone"
        )) -and
        (Test-ContainsAll -Text $roomPresenceRouteTest -Needles @(
            "203.0.113.100:8949",
            "restricted_cone",
            "https://relay.musu.pro/r/lease-pc-a",
            "quic_relay_tunnel"
        )) -and
        (Test-ContainsAll -Text $roomRendezvousRouteTest -Needles @(
            "198.51.100.192:8949",
            "open_internet",
            "https://relay.musu.pro/r/lease-pc-b",
            "quic_relay_tunnel"
        ))
    ) `
    -Path $rendezvousStorePath `
    -Message "musu.pro room presence and rendezvous candidate exchange preserve public endpoint, NAT, and relay descriptors used for P2P path selection."

Add-Check `
    -Scope "rust-control-plane" `
    -Name "room presence advertises release relay candidate protocol" `
    -Passed (
        (Test-ContainsAll -Text $cloud -Needles @(
            "pub enum RelayProtocol",
            "QuicRelayTunnel",
            "quic_relay_tunnel"
        )) -and
        (Test-ContainsAll -Text $cliCommands -Needles @(
            "Relay transport protocol: quic_relay_tunnel",
            '"quic_relay_tunnel" => Ok(Some(crate::cloud::RelayProtocol::QuicRelayTunnel))',
            "unwrap_or(crate::cloud::RelayProtocol::QuicRelayTunnel)",
            "Some(crate::cloud::RelayProtocol::QuicRelayTunnel)"
        ))
    ) `
    -Path $cliCommandsPath `
    -Message "Local room presence relay candidates default to the release relay tunnel protocol while preserving legacy protocol parsing."

Add-Check `
    -Scope "web-rendezvous" `
    -Name "rendezvous creation request is strict metadata only" `
    -Passed (
        (Test-ContainsAll -Text $rendezvousRouteTest -Needles @(
            "rejects raw payload byte fields in rendezvous creation",
            "rendezvous_payload_bytes_not_accepted",
            "rejects unknown rendezvous creation fields",
            "unexpected_release_field"
        )) -and
        (Test-ContainsAll -Text $rendezvousRoute -Needles @(
            "CreateRendezvousSchema",
            "}).strict()",
            "FORBIDDEN_RENDEZVOUS_BYTE_FIELDS",
            "rendezvous_payload_bytes_not_accepted",
            "publicZodIssues"
        )) -and
        -not $rendezvousRoute.Contains("}).passthrough()")
    ) `
    -Path $rendezvousRoutePath `
    -Message "Rendezvous creation accepts source/target/capability metadata only and rejects raw payload fields before session storage."

Add-Check `
    -Scope "web-rendezvous" `
    -Name "rendezvous candidate exchange request is strict metadata only" `
    -Passed (
        (Test-ContainsAll -Text $rendezvousRouteTest -Needles @(
            "rejects raw payload byte fields in rendezvous candidate exchange",
            "rendezvous_candidates_payload_bytes_not_accepted",
            "rejects unknown rendezvous candidate fields",
            "unexpected_endpoint_field"
        )) -and
        (Test-ContainsAll -Text $rendezvousCandidatesRoute -Needles @(
            "CandidateEndpointSchema",
            "CandidatesSchema",
            "}).strict()",
            "FORBIDDEN_CANDIDATE_BYTE_FIELDS",
            "rendezvous_candidates_payload_bytes_not_accepted",
            "publicZodIssues"
        )) -and
        -not $rendezvousCandidatesRoute.Contains("}).passthrough()")
    ) `
    -Path $rendezvousCandidatesRoutePath `
    -Message "Rendezvous candidate exchange accepts route candidate/NAT/relay descriptor metadata only and rejects raw payload fields before cache/session storage."

Add-Check `
    -Scope "web-rooms" `
    -Name "room rendezvous request is strict metadata only" `
    -Passed (
        (Test-ContainsAll -Text $roomRendezvousRouteTest -Needles @(
            "rejects raw payload byte fields in room rendezvous creation",
            "room_rendezvous_payload_bytes_not_accepted",
            "rejects unknown room rendezvous fields including body room_id",
            "unexpected_release_field"
        )) -and
        (Test-ContainsAll -Text $roomRendezvousRoute -Needles @(
            "RoomRendezvousSchema",
            "}).strict()",
            "FORBIDDEN_ROOM_RENDEZVOUS_BYTE_FIELDS",
            "room_rendezvous_payload_bytes_not_accepted",
            "publicZodIssues"
        )) -and
        -not $roomRendezvousRoute.Contains("}).passthrough()")
    ) `
    -Path $roomRendezvousRoutePath `
    -Message "Room-scoped rendezvous accepts room source/target/context metadata only and rejects body room_id, unknown fields, and raw payload fields."

Add-Check `
    -Scope "web-rooms" `
    -Name "room presence request is strict metadata only" `
    -Passed (
        (Test-ContainsAll -Text $roomPresenceRouteTest -Needles @(
            "rejects raw payload byte fields in room presence",
            "room_presence_payload_bytes_not_accepted",
            "rejects unknown room presence and candidate fields",
            "unexpected_endpoint_field"
        )) -and
        (Test-ContainsAll -Text $roomPresenceRoute -Needles @(
            "CandidateEndpointSchema",
            "RoomPresenceSchema",
            "}).strict()",
            "FORBIDDEN_ROOM_PRESENCE_BYTE_FIELDS",
            "room_presence_payload_bytes_not_accepted",
            "publicZodIssues"
        )) -and
        -not $roomPresenceRoute.Contains("}).passthrough()")
    ) `
    -Path $roomPresenceRoutePath `
    -Message "Room presence accepts node/candidate/NAT/relay descriptor metadata only and rejects unknown fields and raw payload fields before candidate-cache seeding."

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
    -Name "relay payload delivery proof rejects preview transport" `
    -Passed (
        Test-ContainsAll -Text $routeEvidence -Needles @(
            "RELEASE_GRADE_RELAY_PAYLOAD_TRANSPORT_KINDS",
            "relay_fallback_payload_delivery_proof_transport_kind_not_release_grade",
            "relay_fallback_payload_delivery_proof_not_release_grade",
            "relay_fallback_payload_delivery_proof_stored_transport_kind_not_release_grade",
            "relay_fallback_payload_delivery_proof_stored_not_release_grade",
            "relay_fallback_payload_delivery_proof_relay_url_mismatch"
        )
    ) `
    -Path $routeEvidencePath `
    -Message "Route evidence requires relay payload delivery proof to be release-grade tunnel metadata, not preview store-forward queue metadata."

Add-Check `
    -Scope "route-evidence" `
    -Name "relay payload delivery proof verifies custody fields" `
    -Passed (
        (Test-ContainsAll -Text $routeEvidence -Needles @(
            'payload_kind: z.literal("forwarded_task_envelope")',
            "claimed_by: z.string().min(1)",
            "claimed_at: z.string().min(1)",
            "created_at: z.string().min(1)",
            "relay_fallback_payload_delivery_proof_payload_kind_mismatch",
            "relay_fallback_payload_delivery_proof_claimant_mismatch",
            "relay_fallback_payload_delivery_proof_claimed_at_mismatch",
            "relay_fallback_payload_delivery_proof_created_at_mismatch"
        )) -and
        (Test-ContainsAll -Text $routeEvidenceTest -Needles @(
            "rejects stored relay payload proof when the claimant custody field is forged",
            "relay_fallback_payload_delivery_proof_claimant_mismatch"
        ))
    ) `
    -Path $routeEvidencePath `
    -Message "Route evidence verifies delivery proof custody fields against the stored relay payload record."

Add-Check `
    -Scope "route-evidence" `
    -Name "relay fallback proves candidate coverage before relay" `
    -Passed (
        (Test-ContainsAll -Text $routeEvidence -Needles @(
            "candidate_route_kinds",
            "relay_route_candidate_set_missing",
            "relay_route_candidate_set_missing_relay_fallback",
            "relay_route_skipped_available_direct_candidate",
            "relay_route_attempted_unavailable_direct_candidate",
            "relay_route_candidate_attempt_order_mismatch"
        )) -and
        (Test-ContainsAll -Text $routeEvidenceStore -Needles @(
            "hasCurrentRelayCandidateCoverage",
            "candidate_route_kinds",
            "DIRECT_PATH_SELECTION_ORDER"
        )) -and
        (Test-ContainsAll -Text $routeEvidenceTest -Needles @(
            "keeps relay route evidence non release grade without candidate route set",
            "keeps relay route evidence non release grade when fallback skips available direct candidates",
            "keeps relay route evidence non release grade when fallback attempts unavailable direct candidates"
        )) -and
        (Test-ContainsAll -Text $bridgeRouteEvidence -Needles @(
            "candidate_route_kinds",
            "route_kind_label",
            "cloud_relay_fallback"
        )) -and
        (Test-ContainsAll -Text $forward -Needles @(
            "candidate_route_kind_labels",
            "route_kind_labels_to_cloud",
            "relay_route_metadata",
            "attempted_route_peers"
        )) -and
        (Test-ContainsAll -Text $rendezvous -Needles @(
            "candidate_route_kinds",
            "route_peers_from_target_candidates",
            "select_remote_candidates_in_order"
        )) -and
        (Test-ContainsAll -Text $cloud -Needles @(
            "candidate_route_kinds",
            "P2pRelayPayloadRequest",
            "P2pRelayPayloadStoredRecord"
        )) -and
        (Test-ContainsAll -Text $payloadRoute -Needles @(
            "candidate_route_kinds",
            "attempted_route_kinds"
        ))
    ) `
    -Path $routeEvidencePath `
    -Message "Relay fallback evidence must prove available direct/relay candidate coverage, and Rust runtime plus payload queue metadata must preserve that coverage before claiming fallback."

Add-Check `
    -Scope "route-evidence" `
    -Name "route evidence request is strict metadata only" `
    -Passed (
        (Test-ContainsAll -Text $routeEvidence -Needles @(
            "FORBIDDEN_ROUTE_EVIDENCE_BYTE_FIELDS",
            "route_evidence_payload_bytes_not_accepted",
            "RelayFallbackSchema",
            "RelayTransportProofSchema",
            "RelayPayloadDeliveryProofSchema",
            "RouteEvidenceSchema",
            "peer_identity_method_not_release_grade",
            "peer_public_key_not_fingerprint",
            "}).strict()",
            "publicZodIssues"
        )) -and
        -not $routeEvidence.Contains("}).passthrough()")
    ) `
    -Path $routeEvidencePath `
    -Message "Route evidence accepts strict route/proof metadata only and rejects raw payload fields before storage."

Add-Check `
    -Scope "web-transport-proof" `
    -Name "relay transport proof request is strict metadata only" `
    -Passed (
        (Test-ContainsAll -Text $transportProofRoute -Needles @(
            "musu.relay_transport_proof.v1",
            "}).strict()",
            "FORBIDDEN_RELAY_TRANSPORT_PROOF_BYTE_FIELDS",
            "relay_transport_proof_payload_bytes_not_accepted",
            "payload_bytes_transited",
            "peer_identity_verified",
            "peer_identity_method",
            "peer_public_key",
            "relay_transport_proof_peer_identity_method_not_release_grade",
            "musu_quic_tls_transport",
            "quic_tls_1_3"
        )) -and
        -not $transportProofRoute.Contains("appendRelayPayload") -and
        -not $transportProofRoute.Contains("payload_base64:")
    ) `
    -Path $transportProofRoutePath `
    -Message "Relay transport proof accepts proof metadata only, keeps payload bytes out of the proof recorder, and still requires actual quic_tls_1_3 tunnel proof."

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
            "relayLeaseId &&",
            "evidenceSessionId &&",
            "proof.lease_id.trim() === relayLeaseId",
            "proof.session_id.trim() === evidenceSessionId",
            "proof.peer_identity_method",
            "proof.peer_public_key",
            "RELEASE_GRADE_PEER_IDENTITY_METHODS",
            "hasCurrentPeerIdentityProof",
            'evidence.peer_public_key?.trim().startsWith("sha256:")'
        )) -and
        (Test-ContainsAll -Text $routeEvidenceTest -Needles @(
            "requires release-grade peer identity method and fingerprint for route evidence",
            "stale-direct-peer-method-release-grade",
            "stale-direct-peer-key-release-grade",
            "stale-relay-transport-lease-mismatch-release-grade",
            "stale-relay-transport-session-mismatch-release-grade",
            "stale-relay-missing-session-release-grade",
            "relay_route_transport_proof_peer_identity_method_mismatch"
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
            '$transportReleaseKind = Get-StringProperty -Object $relayTransport -Name "release_grade_relay_transport_kind"',
            'relay transport release kind',
            'relay transport kind is release tunnel',
            '$transportKind -eq $transportReleaseKind -and $transportKind -eq "quic_relay_tunnel"',
            '$transportReleaseRequirement -eq "quic_tls_1_3"'
        )) -and
        (Test-ContainsAll -Text $releaseEvidenceVerifierTest -Needles @(
            "p2p-bad-relay-transport-kind",
            "p2p rejects non-release relay transport kind",
            'release_grade_relay_transport_kind = "quic_relay_tunnel"',
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
    -Scope "rust-source" `
    -Name "release relay tunnel submit requires payload metadata" `
    -Passed (
        Test-ContainsAll -Text $rendezvous -Needles @(
            "submit_release_relay_tunnel_payload",
            "payload.source_node_id.trim().is_empty()",
            "payload.target_node_id.trim().is_empty()",
            "payload.tunnel_id.trim().is_empty()",
            'payload.payload_kind.trim() != "forwarded_task_envelope"',
            "release_relay_tunnel_payload_kind_not_forwarded_task_envelope",
            "payload_sha256",
            "is_hex_sha256",
            "release_relay_tunnel_payload_sha256_invalid"
        )
    ) `
    -Path $rendezvousPath `
    -Message "Release relay tunnel submission cannot advance without source/target/tunnel metadata, forwarded task kind, and a 64-hex digest."

Add-Check `
    -Scope "rust-source" `
    -Name "route evidence carries relay transport proof to cloud" `
    -Passed (
        Test-ContainsAll -Text $bridgeRouteEvidence -Needles @(
            "pub struct RouteRelayTransportProof",
            "relay_transport_proof: Option<RouteRelayTransportProof>",
            ".map(cloud_relay_transport_proof)",
            "fn cloud_relay_transport_proof",
            "musu.relay_transport_proof.v1",
            "quic_relay_tunnel",
            "peer_identity_verified",
            "peer_identity_method",
            "peer_public_key",
            "cloud transport proof",
            "record_release_relay_payload_delivery_route_evidence",
            "RELEASE_RELAY_PAYLOAD_DELIVERY_ROUTE_EVIDENCE_NOTE",
            "relay_transport_proof: Some(transport_proof)",
            "connect_pro_fallback_only"
        )
    ) `
    -Path $bridgeRouteEvidencePath `
    -Message "Rust route evidence preserves release relay transport proof in local evidence and cloud submission DTOs."

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
            "relay_transport_proof_from_cloud_proof",
            "delivery_response.relay_transport_proof.as_ref()",
            "record_release_relay_payload_delivery_route_evidence",
            "release_relay_transport_proof_missing",
            "route_evidence_submitted"
        )
    ) `
    -Path $relayPayloadDrainPath `
    -Message "Target-side drain claims queued payloads, accepts local work, marks delivery, records preview delivery proof, and uses attached release transport proof before recording release-grade route evidence."

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
            "RouteRelayPayloadDeliveryProof",
            "relay_payload_queue_endpoint_wired",
            "pub relay_default_data_path: bool",
            "pub release_grade: bool",
            "pub transport_kind: String",
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
            "release_payload_preflight_endpoint_implemented",
            "release_relay_tunnel_runtime_implemented",
            "release_tunnel_payload_endpoint_missing",
            "release_connect_fail_closed_placeholder_active",
            "preview_store_forward_payload_queue_non_release_grade",
            "release_payload_endpoint_queue_only",
            "web_queue_store_claim_deliver",
            "rust_enqueue_after_lease",
            "rust_target_drain_and_delivery_proof",
            "source_release_relay_connect_endpoint_not_implemented",
            "source_release_relay_tunnel_runtime_not_implemented",
            "source_release_relay_connect_placeholder_active",
            "source_preview_store_forward_payload_queue_non_release_grade",
            "source_relay_transport_kind_not_release_grade",
            "source_release_relay_payload_marker_conflicts_with_preview_queue_only"
        )
    ) `
    -Path $statusScriptPath `
    -Message "Hosted P2P status reports implemented queue fallback separately from missing release tunnel endpoints."

Add-Check `
    -Scope "tests" `
    -Name "source node auth binding regression coverage" `
    -Passed (
        (Test-ContainsAll -Text $leaseRouteTest -Needles @(
            "rejects relay lease when bearer token is bound to another source node",
            "source_node_id_auth_mismatch"
        )) -and
        (Test-ContainsAll -Text $payloadRouteTest -Needles @(
            "rejects relay payload when bearer token is bound to another source node",
            "source_node_id_auth_mismatch"
        )) -and
        (Test-ContainsAll -Text $rendezvousRouteTest -Needles @(
            "rejects rendezvous creation when bearer token is bound to another source node",
            "source_node_id_auth_mismatch"
        )) -and
        (Test-ContainsAll -Text $roomRendezvousRouteTest -Needles @(
            "POST rejects room rendezvous creation when bearer token is bound to another source node",
            "source_node_id_auth_mismatch"
        ))
    ) `
    -Path $payloadRouteTestPath `
    -Message "P2P tests cover source_node_id auth binding failures on relay payload and rendezvous writes."

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
    -Name "release connect preflight regression coverage" `
    -Passed (
        $packageJson.Contains("src/app/api/v1/relay/connect/route.test.ts") -and
        (Test-ContainsAll -Text $releaseConnectPreflightRouteTest -Needles @(
            "requires P2P control auth before reporting relay connect preflight status",
            "reports relay connect preflight without claiming payload transport",
            "verifies relay lease but rejects payload transit while release tunnel runtime is unwired",
            "returns relay connect status fields for invalid JSON",
            "rejects relay connect payload bytes before lease lookup",
            "relay_connect_payload_bytes_not_accepted",
            "rejects unknown relay connect preflight fields",
            "rejects relay connect preflight when relay lease no longer matches configured relay URL",
            "release_relay_lease_not_connect_ready",
            "release_relay_lease_relay_url_mismatch",
            "unexpected_release_field",
            "lease_verified",
            "payload_transported"
        ))
    ) `
    -Path $releaseConnectPreflightRouteTestPath `
    -Message "P2P tests cover the distinct release relay connect preflight endpoint and keep it separate from queue storage."

Add-Check `
    -Scope "tests" `
    -Name "release payload preflight regression coverage" `
    -Passed (
        $packageJson.Contains("src/app/api/v1/relay/payload/route.test.ts") -and
        (Test-ContainsAll -Text $releasePayloadPreflightRouteTest -Needles @(
            "requires P2P control auth before reporting release relay payload preflight",
            "reports release payload preflight without treating the queue as release transport",
            "returns release payload preflight status fields for invalid JSON",
            "rejects release payload bytes before lease lookup while endpoint accepts proof metadata only",
            "release_payload_bytes_not_accepted",
            "rejects unknown release payload preflight fields",
            "rejects release payload preflight when relay lease no longer matches configured relay URL",
            "release_relay_lease_not_payload_ready",
            "release_relay_lease_relay_url_mismatch",
            "unexpected_release_field",
            "verifies relay lease metadata but rejects release payload transport while runtime is unwired",
            "accepts lease-bound release payload proof metadata without storing raw payload bytes",
            "musu.relay_payload_release_request.v1",
            "musu.relay_transport_proof.v1",
            "musu.relay_payload_delivery_proof.v1",
            "lease_verified",
            "release_payload_accepted",
            "payload_stored",
            "payload_transported"
        ))
    ) `
    -Path $releasePayloadPreflightRouteTestPath `
    -Message "P2P tests cover the distinct release payload preflight endpoint and keep it separate from queue storage."

Add-Check `
    -Scope "tests" `
    -Name "relay transport proof strict metadata regression coverage" `
    -Passed (
        $packageJson.Contains("src/app/api/v1/p2p/relay/transport-proof/route.test.ts") -and
        (Test-ContainsAll -Text $transportProofRouteTest -Needles @(
            "rejects relay transport proof payload bytes before lease lookup",
            "relay_transport_proof_payload_bytes_not_accepted",
            "rejects unknown relay transport proof fields",
            "unexpected_release_field",
            "stores lease-bound relay transport proof owner-scoped",
            "relay_transport_proof_peer_identity_unverified"
        ))
    ) `
    -Path $transportProofRouteTestPath `
    -Message "P2P tests cover strict metadata-only relay transport proof submission and keep payload bytes out of the proof recorder."

Add-Check `
    -Scope "tests" `
    -Name "relay route evidence rejects non release-grade queue proof" `
    -Passed (
        Test-ContainsAll -Text $routeEvidenceTest -Needles @(
            "accepts stored delivered relay payload proof while keeping file-store proof non release grade",
            "relay_fallback_payload_delivery_proof_transport_kind_not_release_grade",
            "relay_fallback_payload_delivery_proof_stored_transport_kind_not_release_grade",
            "relay_fallback_payload_delivery_proof_stored_not_release_grade",
            "transport_not_release_grade_quic_tls",
            "missing_release_grade_transport_proof",
            "relay_route_transport_proof_kind_not_release_grade"
        )
    ) `
    -Path $routeEvidenceTestPath `
    -Message "Route evidence tests keep queue/delivery proof from bypassing release-grade transport proof."

Add-Check `
    -Scope "tests" `
    -Name "route evidence strict metadata regression coverage" `
    -Passed (
        Test-ContainsAll -Text $routeEvidenceTest -Needles @(
            "rejects raw payload byte fields in route evidence",
            "rejects nested raw payload byte fields in route evidence proofs",
            "rejects unknown route evidence fields",
            "route_evidence_payload_bytes_not_accepted",
            "unexpected_release_field"
        )
    ) `
    -Path $routeEvidenceTestPath `
    -Message "Route evidence tests cover strict metadata-only submission and keep raw payload bytes out of evidence records."

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
