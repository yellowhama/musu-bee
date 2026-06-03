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
$leasesExitCode = if ($evidence.PSObject.Properties["relay_leases_exit_code"]) { [int]$evidence.relay_leases_exit_code } else { -1 }
$routeEvidenceExitCode = if ($evidence.PSObject.Properties["relay_route_evidence_exit_code"]) { [int]$evidence.relay_route_evidence_exit_code } else { -1 }
$evidenceOk = Get-BoolProperty -Object $evidence -Name "ok"
$recordedAt = Try-ParseDateTimeOffset -Text $recordedAtText
$now = [datetimeoffset]::Now
$futureTolerance = [timespan]::FromMinutes(5)

$relayStatus = if ($evidence.PSObject.Properties["relay_status"]) { $evidence.relay_status } else { $null }
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
Add-CheckFromCondition "relay runtime fallback wired" (Get-BoolProperty -Object $relayStatus -Name "relay_runtime_fallback_lease_request_wired") "runtime relay fallback lease request is wired" "runtime relay fallback lease request is not wired"
Add-CheckFromCondition "release transport requirement" ((Get-StringProperty -Object $relayStatus -Name "release_grade_transport_required") -eq "quic_tls_1_3") "release transport requirement is quic_tls_1_3" "release transport requirement is not quic_tls_1_3"
Add-CheckFromCondition "relay not default data path" (-not (Get-BoolProperty -Object $relayStatus -Name "relay_default_data_path")) "relay is not the default data path" "relay is incorrectly marked as default data path"

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

$relayStatusTransportWired = Get-BoolProperty -Object $relayStatus -Name "relay_transport_wired"
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
    relay_leases_transport_wired = $relayLeasesTransportWired
    relay_route_evidence_ok = Get-BoolProperty -Object $relayRouteEvidence -Name "ok"
    relay_route_evidence_count = $routeEvidenceCount
    relay_payload_transport_proven = $relayPayloadTransportProven
    relay_transport_wired = ($relayStatusTransportWired -and $relayLeasesTransportWired -and $relayPayloadTransportProven)
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
