[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$EvidencePath,
    [string]$ExpectedVersion,
    [string]$ExpectedBaseUrl = "https://musu.pro",
    [int]$MaxAgeDays = 14,
    [switch]$Json
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = (Resolve-Path (Join-Path $scriptDir "..\..")).Path

if ([string]::IsNullOrWhiteSpace($ExpectedVersion)) {
    $ExpectedVersion = (Get-Content -LiteralPath (Join-Path $repoRoot "VERSION") -Raw).Trim()
}

$checks = New-Object System.Collections.Generic.List[object]

function Add-Check {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [ValidateSet("pass", "fail")]
        [Parameter(Mandatory = $true)][string]$Status,
        [Parameter(Mandatory = $true)][string]$Message
    )

    $checks.Add([pscustomobject]@{
        name = $Name
        status = $Status
        message = $Message
    }) | Out-Null
}

function Add-CheckFromCondition {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][bool]$Condition,
        [Parameter(Mandatory = $true)][string]$PassMessage,
        [Parameter(Mandatory = $true)][string]$FailMessage
    )

    if ($Condition) {
        Add-Check -Name $Name -Status "pass" -Message $PassMessage
    }
    else {
        Add-Check -Name $Name -Status "fail" -Message $FailMessage
    }
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

function Get-NumberProperty {
    param(
        $Object,
        [Parameter(Mandatory = $true)][string]$Name
    )

    if (-not $Object) {
        return $null
    }
    $property = $Object.PSObject.Properties[$Name]
    if (-not $property -or $null -eq $property.Value) {
        return $null
    }
    try {
        return [double]$property.Value
    }
    catch {
        return $null
    }
}

function Try-ParseDateTimeOffset {
    param([string]$Text)

    if ([string]::IsNullOrWhiteSpace($Text)) {
        return $null
    }
    try {
        return [datetimeoffset]::Parse($Text)
    }
    catch {
        return $null
    }
}

if (-not (Test-Path -LiteralPath $EvidencePath)) {
    throw "P2P control-plane evidence file not found: $EvidencePath"
}

$evidence = Get-Content -LiteralPath $EvidencePath -Raw | ConvertFrom-Json
$schema = Get-StringProperty -Object $evidence -Name "schema"
$version = Get-StringProperty -Object $evidence -Name "version"
$baseUrl = Get-StringProperty -Object $evidence -Name "base_url"
$recordedAtText = Get-StringProperty -Object $evidence -Name "recorded_at"
$operatorMachine = Get-StringProperty -Object $evidence -Name "operator_machine"
$statusExitCode = if ($evidence.PSObject.Properties["relay_status_exit_code"]) { [int]$evidence.relay_status_exit_code } else { -1 }
$transportExitCode = if ($evidence.PSObject.Properties["relay_transport_exit_code"]) { [int]$evidence.relay_transport_exit_code } else { -1 }
$leasesExitCode = if ($evidence.PSObject.Properties["relay_leases_exit_code"]) { [int]$evidence.relay_leases_exit_code } else { -1 }
$routeEvidenceExitCode = if ($evidence.PSObject.Properties["relay_route_evidence_exit_code"]) { [int]$evidence.relay_route_evidence_exit_code } else { -1 }
$evidenceOk = Get-BoolProperty -Object $evidence -Name "ok"
$recordedAt = Try-ParseDateTimeOffset -Text $recordedAtText
$now = [datetimeoffset]::Now
$futureTolerance = [timespan]::FromMinutes(5)

$relayStatus = if ($evidence.PSObject.Properties["relay_status"]) { $evidence.relay_status } else { $null }
$relayTransport = if ($evidence.PSObject.Properties["relay_transport"]) { $evidence.relay_transport } else { $null }
$relayLeases = if ($evidence.PSObject.Properties["relay_leases"]) { $evidence.relay_leases } else { $null }
$relayRouteEvidence = if ($evidence.PSObject.Properties["relay_route_evidence"]) { $evidence.relay_route_evidence } else { $null }

Add-CheckFromCondition "schema" ($schema -eq "musu.p2p_control_plane_live_evidence.v1") "schema is valid" "schema is not musu.p2p_control_plane_live_evidence.v1"
Add-CheckFromCondition "evidence ok" $evidenceOk "evidence reports ok=true" "evidence does not report ok=true"
Add-CheckFromCondition "version" ($version -eq $ExpectedVersion) "version matches $ExpectedVersion" "version is '$version', expected '$ExpectedVersion'"
Add-CheckFromCondition "base url" ($baseUrl.TrimEnd("/") -eq $ExpectedBaseUrl.TrimEnd("/")) "base_url matches $ExpectedBaseUrl" "base_url is '$baseUrl', expected '$ExpectedBaseUrl'"
Add-CheckFromCondition "recorded timestamp" ($null -ne $recordedAt) "recorded_at parses" "recorded_at is missing or invalid"
Add-CheckFromCondition "operator machine" (-not [string]::IsNullOrWhiteSpace($operatorMachine)) "operator_machine is present" "operator_machine is missing"

if ($recordedAt) {
    Add-CheckFromCondition "recorded timestamp not future" ($recordedAt -le ($now + $futureTolerance)) "recorded_at is not in the future" "recorded_at is more than 5 minutes in the future"
    $age = $now - $recordedAt
    Add-CheckFromCondition "evidence age" ($age.TotalDays -le $MaxAgeDays) "recorded_at is within $MaxAgeDays days" "recorded_at is older than $MaxAgeDays days"
}

Add-CheckFromCondition "relay status exit" ($statusExitCode -eq 0) "relay status command exited 0" "relay status command exited $statusExitCode"
Add-CheckFromCondition "relay transport exit" ($transportExitCode -eq 0) "relay transport command exited 0" "relay transport command exited $transportExitCode"
Add-CheckFromCondition "relay leases exit" ($leasesExitCode -eq 0) "relay leases command exited 0" "relay leases command exited $leasesExitCode"
Add-CheckFromCondition "relay route evidence exit" ($routeEvidenceExitCode -eq 0) "relay route evidence command exited 0" "relay route evidence command exited $routeEvidenceExitCode"

$statusSchema = Get-StringProperty -Object $relayStatus -Name "schema"
$statusRegistryUrl = Get-StringProperty -Object $relayStatus -Name "registry_url"
Add-CheckFromCondition "relay status schema" ($statusSchema -eq "musu.relay_status.v1") "relay status schema is valid" "relay status schema is '$statusSchema'"
Add-CheckFromCondition "relay status registry url" ($statusRegistryUrl.TrimEnd("/") -eq $ExpectedBaseUrl.TrimEnd("/")) "relay status registry_url matches $ExpectedBaseUrl" "relay status registry_url is '$statusRegistryUrl'"
Add-CheckFromCondition "relay status logged in" (Get-BoolProperty -Object $relayStatus -Name "logged_in") "relay status is logged in" "relay status is not logged in"
Add-CheckFromCondition "bridge path selection wired" (Get-BoolProperty -Object $relayStatus -Name "bridge_path_selection_wired") "bridge path selection is wired" "bridge path selection is not wired"
Add-CheckFromCondition "rendezvous session wired" (Get-BoolProperty -Object $relayStatus -Name "rendezvous_session_wired") "rendezvous session is wired" "rendezvous session is not wired"
Add-CheckFromCondition "route evidence client wired" (Get-BoolProperty -Object $relayStatus -Name "route_evidence_client_wired") "route evidence client is wired" "route evidence client is not wired"
Add-CheckFromCondition "relay lease control-plane wired" (Get-BoolProperty -Object $relayStatus -Name "relay_control_plane_lease_wired") "relay lease control-plane is wired" "relay lease control-plane is not wired"
Add-CheckFromCondition "relay status transport wired" (Get-BoolProperty -Object $relayStatus -Name "relay_transport_wired") "relay status reports relay transport is wired" "relay status reports relay transport is not wired"
Add-CheckFromCondition "relay status transport preflight ok" (Get-BoolProperty -Object $relayStatus -Name "relay_transport_preflight_ok") "relay status reports relay transport preflight ok=true" "relay status reports relay transport preflight is not ok"
Add-CheckFromCondition "relay status transport descriptor wired" (Get-BoolProperty -Object $relayStatus -Name "relay_transport_descriptor_wired") "relay status reports relay transport descriptor is wired" "relay status does not report relay transport descriptor wired"
Add-CheckFromCondition "relay status connect endpoint wired" (Get-BoolProperty -Object $relayStatus -Name "relay_connect_endpoint_wired") "relay status reports relay connect endpoint is wired" "relay status does not report relay connect endpoint wired"
Add-CheckFromCondition "relay status payload endpoint wired" (Get-BoolProperty -Object $relayStatus -Name "relay_payload_endpoint_wired") "relay status reports relay payload endpoint is wired" "relay status does not report relay payload endpoint wired"
Add-CheckFromCondition "relay runtime fallback wired" (Get-BoolProperty -Object $relayStatus -Name "relay_runtime_fallback_lease_request_wired") "runtime relay fallback lease request is wired" "runtime relay fallback lease request is not wired"
Add-CheckFromCondition "release transport requirement" ((Get-StringProperty -Object $relayStatus -Name "release_grade_transport_required") -eq "quic_tls_1_3") "release transport requirement is quic_tls_1_3" "release transport requirement is not quic_tls_1_3"
Add-CheckFromCondition "relay not default data path" (-not (Get-BoolProperty -Object $relayStatus -Name "relay_default_data_path")) "relay is not the default data path" "relay is incorrectly marked as default data path"
$statusTransportBlockersPresent = ($relayStatus -and $relayStatus.PSObject.Properties["relay_transport_blockers"])
$statusTransportBlockerCount = if ($statusTransportBlockersPresent -and $null -ne $relayStatus.relay_transport_blockers) { @($relayStatus.relay_transport_blockers).Count } else { -1 }
Add-CheckFromCondition "relay status transport blockers empty" ($statusTransportBlockerCount -eq 0) "relay status reports no relay transport blockers" "relay status reports relay transport blockers or omits blocker status"
Add-CheckFromCondition "relay status store configured" (Get-BoolProperty -Object $relayStatus -Name "relay_lease_store_configured") "relay status reports relay lease store is configured" "relay status does not report relay lease store configured"
Add-CheckFromCondition "relay status store release-grade" (Get-BoolProperty -Object $relayStatus -Name "relay_lease_store_release_grade") "relay status reports relay lease store is release-grade" "relay status does not report release-grade relay lease store"

$transportSchema = Get-StringProperty -Object $relayTransport -Name "schema"
$transportRegistryUrl = Get-StringProperty -Object $relayTransport -Name "registry_url"
$transportRelayUrl = Get-StringProperty -Object $relayTransport -Name "relay_url"
$transportKind = Get-StringProperty -Object $relayTransport -Name "relay_transport_kind"
$transportReleaseKind = Get-StringProperty -Object $relayTransport -Name "release_grade_relay_transport_kind"
$transportReleaseRequirement = Get-StringProperty -Object $relayTransport -Name "release_grade_transport_required"
$transportBlockersPresent = ($relayTransport -and $relayTransport.PSObject.Properties["blockers"])
$transportBlockerCount = if ($transportBlockersPresent -and $null -ne $relayTransport.blockers) { @($relayTransport.blockers).Count } else { -1 }
Add-CheckFromCondition "relay transport schema" ($transportSchema -eq "musu.relay_transport.v1") "relay transport schema is valid" "relay transport schema is '$transportSchema'"
Add-CheckFromCondition "relay transport registry url" ($transportRegistryUrl.TrimEnd("/") -eq $ExpectedBaseUrl.TrimEnd("/")) "relay transport registry_url matches $ExpectedBaseUrl" "relay transport registry_url is '$transportRegistryUrl'"
Add-CheckFromCondition "relay transport logged in" (Get-BoolProperty -Object $relayTransport -Name "logged_in") "relay transport query is logged in" "relay transport query is not logged in"
Add-CheckFromCondition "relay transport ok" (Get-BoolProperty -Object $relayTransport -Name "ok") "relay transport preflight reports ok=true" "relay transport preflight does not report ok=true"
Add-CheckFromCondition "relay transport owner scope verified" (Get-BoolProperty -Object $relayTransport -Name "owner_scope_verified") "relay transport owner scope is verified" "relay transport owner scope is not verified"
Add-CheckFromCondition "relay transport owner scoped" (Get-BoolProperty -Object $relayTransport -Name "owner_scoped") "relay transport query is owner-scoped" "relay transport query is not owner-scoped"
Add-CheckFromCondition "relay transport control-plane wired" (Get-BoolProperty -Object $relayTransport -Name "relay_control_plane_wired") "relay transport control-plane is wired" "relay transport control-plane is not wired"
Add-CheckFromCondition "relay transport descriptor wired" (Get-BoolProperty -Object $relayTransport -Name "relay_transport_descriptor_wired") "relay transport descriptor is wired" "relay transport descriptor is not wired"
Add-CheckFromCondition "relay transport wired" (Get-BoolProperty -Object $relayTransport -Name "relay_transport_wired") "relay transport preflight reports relay transport is wired" "relay transport preflight reports relay transport is not wired"
Add-CheckFromCondition "relay transport connect endpoint wired" (Get-BoolProperty -Object $relayTransport -Name "relay_connect_endpoint_wired") "relay transport preflight reports relay connect endpoint is wired" "relay transport preflight does not report relay connect endpoint wired"
Add-CheckFromCondition "relay transport not default data path" (-not (Get-BoolProperty -Object $relayTransport -Name "relay_default_data_path")) "relay transport reports relay_default_data_path=false" "relay transport reports relay_default_data_path=true"
Add-CheckFromCondition "relay transport URL" ($transportRelayUrl.StartsWith("wss://")) "relay transport URL is wss" "relay transport URL is missing or not wss"
Add-CheckFromCondition "relay transport kind present" (-not [string]::IsNullOrWhiteSpace($transportKind)) "relay transport kind is present" "relay transport kind is missing"
Add-CheckFromCondition "relay transport release kind" ($transportReleaseKind -eq "quic_relay_tunnel") "relay transport release kind is quic_relay_tunnel" "relay transport release kind is '$transportReleaseKind'"
Add-CheckFromCondition "relay transport release requirement" ($transportReleaseRequirement -eq "quic_tls_1_3") "relay transport release requirement is quic_tls_1_3" "relay transport release requirement is '$transportReleaseRequirement'"
Add-CheckFromCondition "relay transport kind is release tunnel" ($transportKind -eq $transportReleaseKind -and $transportKind -eq "quic_relay_tunnel") "relay transport kind matches release-grade quic_relay_tunnel" "relay transport kind is '$transportKind', expected release-grade quic_relay_tunnel"
Add-CheckFromCondition "relay payload requires lease" (Get-BoolProperty -Object $relayTransport -Name "payload_transit_requires_lease") "relay payload transit requires a lease" "relay payload transit does not require a lease"
Add-CheckFromCondition "relay transport blockers empty" ($transportBlockerCount -eq 0) "relay transport preflight has no blockers" "relay transport preflight blockers are present or missing"
Add-CheckFromCondition "relay transport store status present" (-not [string]::IsNullOrWhiteSpace((Get-StringProperty -Object $relayTransport -Name "relay_lease_store_backend"))) "relay transport lease store backend is present" "relay transport lease store backend is missing"
Add-CheckFromCondition "relay transport store configured" (Get-BoolProperty -Object $relayTransport -Name "relay_lease_store_configured") "relay transport lease store is configured" "relay transport lease store is not configured"
Add-CheckFromCondition "relay transport store release-grade" (Get-BoolProperty -Object $relayTransport -Name "relay_lease_store_release_grade") "relay transport lease store is release-grade" "relay transport lease store is not release-grade"

$leasesSchema = Get-StringProperty -Object $relayLeases -Name "schema"
$leasesRegistryUrl = Get-StringProperty -Object $relayLeases -Name "registry_url"
Add-CheckFromCondition "relay leases schema" ($leasesSchema -eq "musu.relay_leases.v1") "relay leases schema is valid" "relay leases schema is '$leasesSchema'"
Add-CheckFromCondition "relay leases registry url" ($leasesRegistryUrl.TrimEnd("/") -eq $ExpectedBaseUrl.TrimEnd("/")) "relay leases registry_url matches $ExpectedBaseUrl" "relay leases registry_url is '$leasesRegistryUrl'"
Add-CheckFromCondition "relay leases logged in" (Get-BoolProperty -Object $relayLeases -Name "logged_in") "relay leases query is logged in" "relay leases query is not logged in"
Add-CheckFromCondition "relay leases ok" (Get-BoolProperty -Object $relayLeases -Name "ok") "relay leases query reports ok=true" "relay leases query does not report ok=true"
Add-CheckFromCondition "relay leases owner scope verified" (Get-BoolProperty -Object $relayLeases -Name "owner_scope_verified") "relay leases owner scope is verified" "relay leases owner scope is not verified"
Add-CheckFromCondition "relay leases owner scoped" (Get-BoolProperty -Object $relayLeases -Name "owner_scoped") "relay leases query is owner-scoped" "relay leases query is not owner-scoped"
Add-CheckFromCondition "relay leases control-plane wired" (Get-BoolProperty -Object $relayLeases -Name "relay_control_plane_wired") "relay leases control-plane is wired" "relay leases control-plane is not wired"
Add-CheckFromCondition "relay leases transport wired" (Get-BoolProperty -Object $relayLeases -Name "relay_transport_wired") "relay leases report relay transport is wired" "relay leases report relay transport is not wired"
Add-CheckFromCondition "relay leases not default data path" (-not (Get-BoolProperty -Object $relayLeases -Name "relay_default_data_path")) "relay leases report relay_default_data_path=false" "relay leases report relay_default_data_path=true"
Add-CheckFromCondition "relay lease store status present" (-not [string]::IsNullOrWhiteSpace((Get-StringProperty -Object $relayLeases -Name "relay_lease_store_backend"))) "relay lease store backend is present" "relay lease store backend is missing"
Add-CheckFromCondition "relay lease store configured" (Get-BoolProperty -Object $relayLeases -Name "relay_lease_store_configured") "relay lease store is configured" "relay lease store is not configured"
Add-CheckFromCondition "relay lease store release-grade" (Get-BoolProperty -Object $relayLeases -Name "relay_lease_store_release_grade") "relay lease store is release-grade" "relay lease store is not release-grade"

$leaseCount = if ($relayLeases -and $relayLeases.PSObject.Properties["count"]) { [int]$relayLeases.count } else { -1 }
Add-CheckFromCondition "relay leases count present" ($leaseCount -ge 0) "relay lease count is present" "relay lease count is missing"

$routeEvidenceSchema = Get-StringProperty -Object $relayRouteEvidence -Name "schema"
$routeEvidenceRegistryUrl = Get-StringProperty -Object $relayRouteEvidence -Name "registry_url"
$routeEvidenceFilters = if ($relayRouteEvidence -and $relayRouteEvidence.PSObject.Properties["filters"]) { $relayRouteEvidence.filters } else { $null }
Add-CheckFromCondition "relay route evidence schema" ($routeEvidenceSchema -eq "musu.relay_route_evidence.v1") "relay route evidence schema is valid" "relay route evidence schema is '$routeEvidenceSchema'"
Add-CheckFromCondition "relay route evidence registry url" ($routeEvidenceRegistryUrl.TrimEnd("/") -eq $ExpectedBaseUrl.TrimEnd("/")) "relay route evidence registry_url matches $ExpectedBaseUrl" "relay route evidence registry_url is '$routeEvidenceRegistryUrl'"
Add-CheckFromCondition "relay route evidence logged in" (Get-BoolProperty -Object $relayRouteEvidence -Name "logged_in") "relay route evidence query is logged in" "relay route evidence query is not logged in"
Add-CheckFromCondition "relay route evidence ok" (Get-BoolProperty -Object $relayRouteEvidence -Name "ok") "relay route evidence query reports ok=true" "relay route evidence query does not report ok=true"
Add-CheckFromCondition "relay route evidence owner scope verified" (Get-BoolProperty -Object $relayRouteEvidence -Name "owner_scope_verified") "relay route evidence owner scope is verified" "relay route evidence owner scope is not verified"
Add-CheckFromCondition "relay route evidence owner scoped" (Get-BoolProperty -Object $relayRouteEvidence -Name "owner_scoped") "relay route evidence query is owner-scoped" "relay route evidence query is not owner-scoped"
Add-CheckFromCondition "relay route evidence filter route kind" ((Get-StringProperty -Object $routeEvidenceFilters -Name "route_kind") -eq "relay") "relay route evidence query filters route_kind=relay" "relay route evidence query does not filter route_kind=relay"
Add-CheckFromCondition "relay route evidence filter result" ((Get-StringProperty -Object $routeEvidenceFilters -Name "result") -eq "success") "relay route evidence query filters result=success" "relay route evidence query does not filter result=success"
Add-CheckFromCondition "relay route evidence filter release grade" (Get-BoolProperty -Object $routeEvidenceFilters -Name "release_grade") "relay route evidence query filters release_grade=true" "relay route evidence query does not filter release_grade=true"
$routeEvidenceCount = if ($relayRouteEvidence -and $relayRouteEvidence.PSObject.Properties["count"]) { [int]$relayRouteEvidence.count } else { -1 }
Add-CheckFromCondition "relay route evidence count" ($routeEvidenceCount -gt 0) "release-grade relay route evidence is present" "release-grade relay route evidence is missing"
Add-CheckFromCondition "relay payload transport proven" (Get-BoolProperty -Object $relayRouteEvidence -Name "relay_transport_proven") "relay payload transport is proven by release-grade route evidence" "relay payload transport is not proven by release-grade route evidence"

$routeEvidenceRecords = [object[]]@()
if ($relayRouteEvidence -and $relayRouteEvidence.PSObject.Properties["records"] -and $null -ne $relayRouteEvidence.records) {
    $routeEvidenceRecords = [object[]]@($relayRouteEvidence.records)
}
$routeEvidenceRecordCount = [int]$routeEvidenceRecords.Length
$relayTransportProofRequiredCount = 0
$relayTransportProofValidCount = 0
$relayTransportProofInvalidCount = 0
$relayPayloadProofRequiredCount = 0
$relayPayloadProofValidCount = 0
$relayPayloadProofInvalidCount = 0
foreach ($record in $routeEvidenceRecords) {
    $recordEvidence = if ($record -and $record.PSObject.Properties["evidence"]) { $record.evidence } else { $null }
    if (-not $recordEvidence) {
        continue
    }

    $recordRouteKind = Get-StringProperty -Object $recordEvidence -Name "route_kind"
    $recordResult = Get-StringProperty -Object $recordEvidence -Name "result"
    $recordPayloadTransited = Get-BoolProperty -Object $recordEvidence -Name "payload_transited_musu_infra"
    if ($recordRouteKind -ne "relay" -or $recordResult -ne "success" -or -not $recordPayloadTransited) {
        continue
    }

    $relayPayloadProofRequiredCount += 1
    $relayTransportProofRequiredCount += 1
    $recordSessionId = Get-StringProperty -Object $recordEvidence -Name "session_id"
    $recordSourceNodeId = Get-StringProperty -Object $recordEvidence -Name "source_node_id"
    $recordTargetNodeId = Get-StringProperty -Object $recordEvidence -Name "target_node_id"
    $recordPeerIdentityMethod = Get-StringProperty -Object $recordEvidence -Name "peer_identity_method"
    $recordPeerPublicKey = Get-StringProperty -Object $recordEvidence -Name "peer_public_key"
    $transportProof = if ($recordEvidence.PSObject.Properties["relay_transport_proof"]) { $recordEvidence.relay_transport_proof } else { $null }
    $transportOpenedAt = Try-ParseDateTimeOffset -Text (Get-StringProperty -Object $transportProof -Name "opened_at")
    $transportClosedAtText = Get-StringProperty -Object $transportProof -Name "closed_at"
    $transportClosedAt = Try-ParseDateTimeOffset -Text $transportClosedAtText
    $transportPayloadBytes = Get-NumberProperty -Object $transportProof -Name "payload_bytes_transited"
    $transportSessionId = Get-StringProperty -Object $transportProof -Name "session_id"
    $transportLeaseId = Get-StringProperty -Object $transportProof -Name "lease_id"
    $transportSourceNodeId = Get-StringProperty -Object $transportProof -Name "source_node_id"
    $transportTargetNodeId = Get-StringProperty -Object $transportProof -Name "target_node_id"
    $relayFallback = if ($recordEvidence.PSObject.Properties["relay_fallback"]) { $recordEvidence.relay_fallback } else { $null }
    $fallbackLeaseId = Get-StringProperty -Object $relayFallback -Name "lease_id"

    $transportProofValid = (
        (Get-StringProperty -Object $transportProof -Name "schema") -eq "musu.relay_transport_proof.v1" -and
        -not [string]::IsNullOrWhiteSpace($recordSessionId) -and
        -not [string]::IsNullOrWhiteSpace($recordSourceNodeId) -and
        -not [string]::IsNullOrWhiteSpace($recordTargetNodeId) -and
        -not [string]::IsNullOrWhiteSpace($fallbackLeaseId) -and
        $transportSessionId -eq $recordSessionId -and
        $transportLeaseId -eq $fallbackLeaseId -and
        $transportSourceNodeId -eq $recordSourceNodeId -and
        $transportTargetNodeId -eq $recordTargetNodeId -and
        (Get-StringProperty -Object $transportProof -Name "transport_kind") -eq "quic_relay_tunnel" -and
        (Get-StringProperty -Object $transportProof -Name "relay_url").StartsWith("wss://") -and
        -not [string]::IsNullOrWhiteSpace((Get-StringProperty -Object $transportProof -Name "tunnel_id")) -and
        $null -ne $transportPayloadBytes -and
        $transportPayloadBytes -gt 0 -and
        (Get-BoolProperty -Object $transportProof -Name "payload_transited_musu_infra") -and
        (Get-BoolProperty -Object $transportProof -Name "peer_identity_verified") -and
        (Get-StringProperty -Object $transportProof -Name "peer_identity_method") -eq $recordPeerIdentityMethod -and
        $recordPeerIdentityMethod -eq "quic_tls_cert_fingerprint" -and
        (Get-StringProperty -Object $transportProof -Name "peer_public_key") -eq $recordPeerPublicKey -and
        $recordPeerPublicKey.StartsWith("sha256:") -and
        (Get-StringProperty -Object $transportProof -Name "encryption") -eq "quic_tls_1_3" -and
        (Get-StringProperty -Object $transportProof -Name "transport_verified_by") -eq "musu_quic_tls_transport" -and
        $null -ne $transportOpenedAt -and
        ([string]::IsNullOrWhiteSpace($transportClosedAtText) -or ($null -ne $transportClosedAt -and $transportClosedAt -ge $transportOpenedAt))
    )

    if ($transportProofValid) {
        $relayTransportProofValidCount += 1
    }
    else {
        $relayTransportProofInvalidCount += 1
    }

    $proof = if ($recordEvidence.PSObject.Properties["relay_payload_delivery_proof"]) { $recordEvidence.relay_payload_delivery_proof } else { $null }
    $proofDeliveredAt = Try-ParseDateTimeOffset -Text (Get-StringProperty -Object $proof -Name "delivered_at")
    $proofPayloadBytes = Get-NumberProperty -Object $proof -Name "payload_bytes"
    $proofSessionId = Get-StringProperty -Object $proof -Name "session_id"
    $proofLeaseId = Get-StringProperty -Object $proof -Name "lease_id"
    $proofSourceNodeId = Get-StringProperty -Object $proof -Name "source_node_id"
    $proofTargetNodeId = Get-StringProperty -Object $proof -Name "target_node_id"
    $proofRelayUrl = Get-StringProperty -Object $proof -Name "relay_url"
    $proofTunnelId = Get-StringProperty -Object $proof -Name "tunnel_id"
    $proofTransportKind = Get-StringProperty -Object $proof -Name "transport_kind"
    $proofRelayDefaultDataPath = Get-BoolProperty -Object $proof -Name "relay_default_data_path"
    $proofReleaseGrade = Get-BoolProperty -Object $proof -Name "release_grade"
    $transportRelayUrl = Get-StringProperty -Object $transportProof -Name "relay_url"
    $transportTunnelId = Get-StringProperty -Object $transportProof -Name "tunnel_id"

    $proofValid = (
        (Get-StringProperty -Object $proof -Name "schema") -eq "musu.relay_payload_delivery_proof.v1" -and
        -not [string]::IsNullOrWhiteSpace((Get-StringProperty -Object $proof -Name "payload_id")) -and
        -not [string]::IsNullOrWhiteSpace($proofSessionId) -and
        -not [string]::IsNullOrWhiteSpace($proofLeaseId) -and
        -not [string]::IsNullOrWhiteSpace($proofSourceNodeId) -and
        -not [string]::IsNullOrWhiteSpace($proofTargetNodeId) -and
        -not [string]::IsNullOrWhiteSpace($proofRelayUrl) -and
        $proofRelayUrl.StartsWith("wss://") -and
        -not [string]::IsNullOrWhiteSpace((Get-StringProperty -Object $proof -Name "tunnel_id")) -and
        $proofTransportKind -eq "quic_relay_tunnel" -and
        $proofRelayDefaultDataPath -eq $false -and
        $proofReleaseGrade -eq $true -and
        -not [string]::IsNullOrWhiteSpace((Get-StringProperty -Object $proof -Name "payload_sha256")) -and
        $null -ne $proofPayloadBytes -and
        $proofPayloadBytes -gt 0 -and
        $null -ne $proofDeliveredAt -and
        -not [string]::IsNullOrWhiteSpace($recordSessionId) -and
        -not [string]::IsNullOrWhiteSpace($recordSourceNodeId) -and
        -not [string]::IsNullOrWhiteSpace($recordTargetNodeId) -and
        -not [string]::IsNullOrWhiteSpace($fallbackLeaseId) -and
        $proofSessionId -eq $recordSessionId -and
        $proofSourceNodeId -eq $recordSourceNodeId -and
        $proofTargetNodeId -eq $recordTargetNodeId -and
        $proofLeaseId -eq $fallbackLeaseId -and
        ([string]::IsNullOrWhiteSpace($transportRelayUrl) -or $proofRelayUrl -eq $transportRelayUrl) -and
        ([string]::IsNullOrWhiteSpace($transportTunnelId) -or $proofTunnelId -eq $transportTunnelId)
    )

    if ($proofValid) {
        $relayPayloadProofValidCount += 1
    }
    else {
        $relayPayloadProofInvalidCount += 1
    }
}
Add-CheckFromCondition "relay route evidence records present" ($routeEvidenceRecordCount -ge $routeEvidenceCount -and $routeEvidenceCount -gt 0) "relay route evidence records are present" "relay route evidence records are missing or fewer than count"
Add-CheckFromCondition "relay route transport proof present" ($relayTransportProofValidCount -gt 0) "relay route transport proof is present in release-grade relay route evidence" "relay route transport proof is missing from release-grade relay route evidence"
Add-CheckFromCondition "relay route transport proof coverage" ($relayTransportProofRequiredCount -gt 0 -and $relayTransportProofInvalidCount -eq 0) "all returned relay success route records include valid relay transport proof" "one or more returned relay success route records lack valid relay transport proof"
Add-CheckFromCondition "relay payload delivery proof present" ($relayPayloadProofValidCount -gt 0) "relay payload delivery proof is present in release-grade relay route evidence" "relay payload delivery proof is missing from release-grade relay route evidence"
Add-CheckFromCondition "relay payload delivery proof coverage" ($relayPayloadProofRequiredCount -gt 0 -and $relayPayloadProofInvalidCount -eq 0) "all returned relay success route records include valid payload delivery proof" "one or more returned relay success route records lack valid payload delivery proof"

$relayStatusTransportWired = Get-BoolProperty -Object $relayStatus -Name "relay_transport_wired"
$relayStatusTransportPreflightOk = Get-BoolProperty -Object $relayStatus -Name "relay_transport_preflight_ok"
$relayStatusTransportDescriptorWired = Get-BoolProperty -Object $relayStatus -Name "relay_transport_descriptor_wired"
$relayStatusConnectEndpointWired = Get-BoolProperty -Object $relayStatus -Name "relay_connect_endpoint_wired"
$relayStatusPayloadEndpointWired = Get-BoolProperty -Object $relayStatus -Name "relay_payload_endpoint_wired"
$relayTransportPreflightOk = Get-BoolProperty -Object $relayTransport -Name "ok"
$relayTransportDescriptorWired = Get-BoolProperty -Object $relayTransport -Name "relay_transport_descriptor_wired"
$relayTransportTransportWired = Get-BoolProperty -Object $relayTransport -Name "relay_transport_wired"
$relayTransportConnectEndpointWired = Get-BoolProperty -Object $relayTransport -Name "relay_connect_endpoint_wired"
$relayTransportPayloadEndpointWired = Get-BoolProperty -Object $relayTransport -Name "relay_payload_endpoint_wired"
$relayLeasesTransportWired = Get-BoolProperty -Object $relayLeases -Name "relay_transport_wired"
$relayPayloadTransportProven = Get-BoolProperty -Object $relayRouteEvidence -Name "relay_transport_proven"
$failCount = @($checks | Where-Object { $_.status -eq "fail" }).Count
$result = [pscustomobject]@{
    ok = ($failCount -eq 0)
    evidence_path = (Resolve-Path -LiteralPath $EvidencePath).Path
    fail_count = $failCount
    version = $version
    base_url = $baseUrl
    recorded_at = if ($recordedAt) { $recordedAt.ToString("o") } else { $null }
    operator_machine = $operatorMachine
    relay_status_logged_in = Get-BoolProperty -Object $relayStatus -Name "logged_in"
    relay_leases_ok = Get-BoolProperty -Object $relayLeases -Name "ok"
    relay_status_transport_wired = $relayStatusTransportWired
    relay_status_transport_preflight_ok = $relayStatusTransportPreflightOk
    relay_status_transport_descriptor_wired = $relayStatusTransportDescriptorWired
    relay_status_connect_endpoint_wired = $relayStatusConnectEndpointWired
    relay_status_payload_endpoint_wired = $relayStatusPayloadEndpointWired
    relay_transport_preflight_ok = $relayTransportPreflightOk
    relay_transport_descriptor_wired = $relayTransportDescriptorWired
    relay_transport_connect_endpoint_wired = $relayTransportConnectEndpointWired
    relay_transport_descriptor_ok = ($relayTransportPreflightOk -and $relayTransportDescriptorWired -and $relayTransportConnectEndpointWired)
    relay_transport_preflight_transport_wired = $relayTransportTransportWired
    relay_transport_payload_endpoint_wired = $relayTransportPayloadEndpointWired
    relay_transport_kind = $transportKind
    relay_transport_url = $transportRelayUrl
    relay_leases_transport_wired = $relayLeasesTransportWired
    relay_route_evidence_ok = Get-BoolProperty -Object $relayRouteEvidence -Name "ok"
    relay_route_evidence_count = $routeEvidenceCount
    relay_payload_transport_proven = $relayPayloadTransportProven
    relay_route_transport_proof_required_count = $relayTransportProofRequiredCount
    relay_route_transport_proof_valid_count = $relayTransportProofValidCount
    relay_route_transport_proof_invalid_count = $relayTransportProofInvalidCount
    relay_payload_delivery_proof_required_count = $relayPayloadProofRequiredCount
    relay_payload_delivery_proof_valid_count = $relayPayloadProofValidCount
    relay_payload_delivery_proof_invalid_count = $relayPayloadProofInvalidCount
    relay_transport_wired = ($relayStatusTransportWired -and $relayStatusTransportPreflightOk -and $relayStatusTransportDescriptorWired -and $relayStatusConnectEndpointWired -and $relayStatusPayloadEndpointWired -and $relayTransportPreflightOk -and $relayTransportDescriptorWired -and $relayTransportConnectEndpointWired -and $relayTransportTransportWired -and $relayTransportPayloadEndpointWired -and $relayLeasesTransportWired -and $relayPayloadTransportProven)
    owner_scope_verified = Get-BoolProperty -Object $relayLeases -Name "owner_scope_verified"
    relay_lease_count = $leaseCount
    relay_lease_store_configured = Get-BoolProperty -Object $relayLeases -Name "relay_lease_store_configured"
    relay_lease_store_backend = Get-StringProperty -Object $relayLeases -Name "relay_lease_store_backend"
    relay_lease_store_release_grade = Get-BoolProperty -Object $relayLeases -Name "relay_lease_store_release_grade"
    checks = $checks.ToArray()
}

if ($Json) {
    $result | ConvertTo-Json -Depth 6
}
else {
    "MUSU P2P control-plane live evidence verification"
    "ok: $($result.ok)"
    "evidence_path: $($result.evidence_path)"
    "base_url: $($result.base_url)"
    "owner_scope_verified: $($result.owner_scope_verified)"
    ""
    $checks | Format-Table name, status, message -Wrap
}

if (-not $result.ok) {
    exit 1
}
