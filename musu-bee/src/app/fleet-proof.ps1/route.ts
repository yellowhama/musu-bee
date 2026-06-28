import { NextResponse } from "next/server";
import { PUBLIC_RELEASE_VERSION } from "@/lib/publicRelease";

// GET /fleet-proof.ps1 - serve a post-install proof collector for another PC:
//     & ([scriptblock]::Create((irm https://musu.pro/fleet-proof.ps1))) `
//       -ExpectedNodeName hugh-main -ExpectedDirectPeerName hugh_second `
//       -RequireBrainToken -RequireReleaseGradeRoute -Json
//
// The installer and repair scripts remain the canonical mutation paths. This
// route only assembles their evidence with package-version, bridge, fleet, and
// brain token checks so a remote operator can paste one JSON proof. The
// release-grade route check is opt-in because it executes a delegated task.
export const dynamic = "force-dynamic";

function publicVersionToPackageVersion(version: string) {
  const rc = version.match(/^(\d+)\.(\d+)\.(\d+)-rc\.(\d+)$/);
  if (rc) {
    return `${rc[1]}.${rc[2]}.${rc[3]}.${rc[4]}`;
  }
  const stable = version.match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (stable) {
    return `${stable[1]}.${stable[2]}.${stable[3]}.0`;
  }
  throw new Error(`unsupported public release version: ${version}`);
}

const PROOF_SCRIPT = String.raw`[CmdletBinding()]
param(
    [string]$ExpectedNodeName = "",
    [string]$ExpectedDirectPeerName = "",
    [string]$ExpectedReleaseVersion = "__EXPECTED_RELEASE_VERSION__",
    [string]$ExpectedPackageVersion = "__EXPECTED_PACKAGE_VERSION__",
    [int]$TimeoutSec = 60,
    [int]$RouteWaitTimeoutSec = 60,
    [switch]$NoRestart,
    [switch]$RequireBrainToken,
    [switch]$RequireReleaseGradeRoute,
    [switch]$Json
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$InstallScriptUrl = "https://musu.pro/install.ps1"
$RepairFleetScriptUrl = "https://musu.pro/repair-fleet.ps1"
$checks = New-Object System.Collections.Generic.List[object]

function Add-Check {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [ValidateSet("pass", "warn", "fail", "skip")]
        [Parameter(Mandatory = $true)][string]$Status,
        [Parameter(Mandatory = $true)][string]$Message,
        [object]$Details = $null
    )

    $checks.Add([pscustomobject]@{
        name = $Name
        status = $Status
        message = $Message
        details = $Details
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
    } else {
        Add-Check -Name $Name -Status "fail" -Message $FailMessage
    }
}

function Quote-PowerShellString {
    param([AllowEmptyString()][string]$Value)
    return "'" + $Value.Replace("'", "''") + "'"
}

function Invoke-ChildPowerShell {
    param([Parameter(Mandatory = $true)][string]$CommandText)

    $shell = if (Get-Command pwsh -ErrorAction SilentlyContinue) { "pwsh" } else { "powershell" }
    $output = & $shell -NoProfile -ExecutionPolicy Bypass -Command $CommandText 2>&1
    $exitCode = $LASTEXITCODE
    $raw = ($output | ForEach-Object { [string]$_ }) -join ([Environment]::NewLine)
    return [pscustomobject]@{
        exit_code = $exitCode
        raw = $raw
    }
}

function Invoke-MusuJson {
    param([Parameter(Mandatory = $true)][string[]]$Arguments)

    try {
        $output = & musu @Arguments 2>&1
        $exitCode = $LASTEXITCODE
        $raw = ($output | ForEach-Object { [string]$_ }) -join ([Environment]::NewLine)
        if ($exitCode -ne 0) {
            return [pscustomobject]@{
                ok = $false
                exit_code = $exitCode
                raw = $raw
                json = $null
            }
        }
        return [pscustomobject]@{
            ok = $true
            exit_code = $exitCode
            raw = $raw
            json = ($raw | ConvertFrom-Json)
        }
    } catch {
        return [pscustomobject]@{
            ok = $false
            exit_code = 1
            raw = $_.Exception.Message
            json = $null
        }
    }
}

function Invoke-Musu {
    param([Parameter(Mandatory = $true)][string[]]$Arguments)

    try {
        $output = & musu @Arguments 2>&1
        $exitCode = $LASTEXITCODE
        $raw = ($output | ForEach-Object { [string]$_ }) -join ([Environment]::NewLine)
        return [pscustomobject]@{
            ok = ($exitCode -eq 0)
            exit_code = $exitCode
            raw = $raw
        }
    } catch {
        return [pscustomobject]@{
            ok = $false
            exit_code = 1
            raw = $_.Exception.Message
        }
    }
}

function Get-PropertyValue {
    param(
        $Object,
        [Parameter(Mandatory = $true)][string]$Name,
        $Default = $null
    )

    if (-not $Object) {
        return $Default
    }
    $property = $Object.PSObject.Properties[$Name]
    if (-not $property -or $null -eq $property.Value) {
        return $Default
    }
    return $property.Value
}

function Get-StringPropertyValue {
    param(
        $Object,
        [Parameter(Mandatory = $true)][string]$Name
    )

    $value = Get-PropertyValue -Object $Object -Name $Name -Default ""
    if ($null -eq $value) {
        return ""
    }
    return [string]$value
}

function Get-BoolPropertyValue {
    param(
        $Object,
        [Parameter(Mandatory = $true)][string]$Name
    )

    $value = Get-PropertyValue -Object $Object -Name $Name -Default $false
    if ($null -eq $value) {
        return $false
    }
    return [bool]$value
}

function Get-PackageVersionFromFullName {
    param([AllowEmptyString()][string]$PackageFullName)

    if ([string]::IsNullOrWhiteSpace($PackageFullName)) {
        return ""
    }
    if ($PackageFullName -match '^[^_]+_([^_]+)_') {
        return $Matches[1]
    }
    return ""
}

function Test-RemoteUsableUrl {
    param([AllowEmptyString()][string]$Url)

    if ([string]::IsNullOrWhiteSpace($Url)) {
        return $false
    }
    $uri = $null
    if (-not [System.Uri]::TryCreate($Url, [System.UriKind]::Absolute, [ref]$uri)) {
        return $false
    }
    if ($uri.Scheme -notin @("http", "https")) {
        return $false
    }
    if ($uri.Port -eq 0) {
        return $false
    }
    $hostName = $uri.Host.Trim()
    if ($hostName.StartsWith("[") -and $hostName.EndsWith("]")) {
        $hostName = $hostName.Substring(1, $hostName.Length - 2)
    }
    $hostName = $hostName.TrimEnd(".").ToLowerInvariant()
    if ([string]::IsNullOrWhiteSpace($hostName) -or $hostName -eq "localhost") {
        return $false
    }
    $ip = $null
    if ([System.Net.IPAddress]::TryParse($hostName, [ref]$ip)) {
        if ($ip.AddressFamily -eq [System.Net.Sockets.AddressFamily]::InterNetwork) {
            $ipv4 = $ip.ToString()
            return (-not ($ipv4 -eq "0.0.0.0" -or $ipv4.StartsWith("127.")))
        }
        if ($ip.AddressFamily -eq [System.Net.Sockets.AddressFamily]::InterNetworkV6) {
            if ($ip.IsIPv4MappedToIPv6) {
                $mapped = $ip.MapToIPv4().ToString()
                return (-not ($mapped -eq "0.0.0.0" -or $mapped.StartsWith("127.")))
            }
            return (-not ($ip.Equals([System.Net.IPAddress]::IPv6Loopback) -or $ip.Equals([System.Net.IPAddress]::IPv6Any)))
        }
    }
    return $true
}

function Test-RemoteUsableAddr {
    param([AllowEmptyString()][string]$Addr)

    if ([string]::IsNullOrWhiteSpace($Addr)) {
        return $false
    }
    return Test-RemoteUsableUrl -Url ("http://{0}" -f $Addr)
}

function Test-RestrictedAcl {
    param([Parameter(Mandatory = $true)][string]$Path)

    if (-not (Test-Path -LiteralPath $Path)) {
        return [pscustomobject]@{
            exists = $false
            ok = $false
            summary = "missing"
        }
    }

    $acl = Get-Acl -LiteralPath $Path
    $owner = [string]$acl.Owner
    $bad = @()
    foreach ($entry in @($acl.Access)) {
        $identity = [string]$entry.IdentityReference
        $allowed = (
            $identity -eq $owner -or
            $identity -match '\\Administrators$' -or
            $identity -match '^(NT AUTHORITY\\SYSTEM|SYSTEM)$'
        )
        if (-not $allowed) {
            $bad += $identity
        }
    }

    return [pscustomobject]@{
        exists = $true
        ok = ($bad.Count -eq 0)
        summary = $(if ($bad.Count -eq 0) { "restricted" } else { "unexpected identities: $($bad -join ', ')" })
    }
}

function New-RouteEvidenceSummary {
    param($Evidence, [AllowEmptyString()][string]$EvidencePath)

    if (-not $Evidence) {
        return $null
    }

    return [pscustomobject]@{
        path = $EvidencePath
        schema = Get-StringPropertyValue -Object $Evidence -Name "schema"
        version = Get-StringPropertyValue -Object $Evidence -Name "version"
        source_node_id = Get-StringPropertyValue -Object $Evidence -Name "source_node_id"
        target_node_id = Get-StringPropertyValue -Object $Evidence -Name "target_node_id"
        route_kind = Get-StringPropertyValue -Object $Evidence -Name "route_kind"
        candidate_addr = Get-StringPropertyValue -Object $Evidence -Name "candidate_addr"
        result = Get-StringPropertyValue -Object $Evidence -Name "result"
        peer_identity_verified = Get-BoolPropertyValue -Object $Evidence -Name "peer_identity_verified"
        peer_identity_method = Get-StringPropertyValue -Object $Evidence -Name "peer_identity_method"
        peer_public_key_present = -not [string]::IsNullOrWhiteSpace((Get-StringPropertyValue -Object $Evidence -Name "peer_public_key"))
        encryption = Get-StringPropertyValue -Object $Evidence -Name "encryption"
        transport_verified_by = Get-StringPropertyValue -Object $Evidence -Name "transport_verified_by"
        payload_transited_musu_infra = Get-BoolPropertyValue -Object $Evidence -Name "payload_transited_musu_infra"
        total_attempt_ms = Get-PropertyValue -Object $Evidence -Name "total_attempt_ms" -Default $null
        recorded_at = Get-StringPropertyValue -Object $Evidence -Name "recorded_at"
    }
}

$packageFullName = ""
$installedPackageVersion = ""
$bridgeBindAddr = ""
$advertisedPublicUrl = ""
$selfNodeName = ""
$onlineNodes = $null
$totalNodes = $null
$directHealthyNodes = $null
$repairEvidence = $null
$remoteCloudWarningCount = $null
$brainTokenAcl = [pscustomobject]@{ exists = $false; ok = $false; summary = "not checked" }
$releaseGradeRouteEvidence = $null
$releaseGradeRouteEvidencePath = ""
$releaseGradeRouteVerified = $false

$networkPrefix = "try { [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12 } catch {}; "

try {
    $installCommand = $networkPrefix + "& ([scriptblock]::Create((Invoke-WebRequest -UseBasicParsing -Uri " + (Quote-PowerShellString $InstallScriptUrl) + ").Content)) -ValidateReleaseOnly"
    $installCheck = Invoke-ChildPowerShell -CommandText $installCommand
    Add-CheckFromCondition -Name "public_install_channel_validate_release" -Condition ($installCheck.exit_code -eq 0 -and $installCheck.raw -match "MUSU release channel validation passed") -PassMessage "Hosted install.ps1 validates the current public release channel." -FailMessage "Hosted install.ps1 validation failed with exit $($installCheck.exit_code): $($installCheck.raw)"
} catch {
    Add-Check -Name "public_install_channel_validate_release" -Status "fail" -Message $_.Exception.Message
}

try {
    $repairCommand = $networkPrefix + "& ([scriptblock]::Create((Invoke-WebRequest -UseBasicParsing -Uri " + (Quote-PowerShellString $RepairFleetScriptUrl) + ").Content)) -TimeoutSec $TimeoutSec -Json"
    if (-not [string]::IsNullOrWhiteSpace($ExpectedNodeName)) {
        $repairCommand += " -ExpectedNodeName " + (Quote-PowerShellString $ExpectedNodeName)
    }
    if ($NoRestart) {
        $repairCommand += " -NoRestart"
    }
    $repairRun = Invoke-ChildPowerShell -CommandText $repairCommand
    if ($repairRun.exit_code -eq 0) {
        try {
            $repairEvidence = $repairRun.raw | ConvertFrom-Json
        } catch {
            $repairEvidence = $null
        }
    }
    Add-CheckFromCondition -Name "public_repair_fleet_script" -Condition ($repairRun.exit_code -eq 0 -and $repairEvidence -and [string]$repairEvidence.schema -eq "musu.fleet_node_public_url_repair.v1") -PassMessage "Hosted repair-fleet.ps1 produced fleet URL repair evidence." -FailMessage "Hosted repair-fleet.ps1 failed with exit $($repairRun.exit_code): $($repairRun.raw)"
    if ($repairEvidence) {
        Add-CheckFromCondition -Name "repair_advertised_url_remote_usable" -Condition ([bool]$repairEvidence.advertised_public_url_remote_usable -and (Test-RemoteUsableUrl -Url ([string]$repairEvidence.advertised_public_url))) -PassMessage "Repair evidence advertised URL is remote usable: $($repairEvidence.advertised_public_url)" -FailMessage "Repair evidence advertised URL is not remote usable: $($repairEvidence.advertised_public_url)"
    }
} catch {
    Add-Check -Name "public_repair_fleet_script" -Status "fail" -Message $_.Exception.Message
}

$packageStatus = Invoke-MusuJson -Arguments @("package-status")
Add-CheckFromCondition -Name "musu_package_status_json" -Condition ([bool]$packageStatus.ok) -PassMessage "musu package-status returned JSON." -FailMessage "musu package-status failed: $($packageStatus.raw)"
if ($packageStatus.ok) {
    $packageFullName = [string]$packageStatus.json.package_full_name
    $installedPackageVersion = Get-PackageVersionFromFullName -PackageFullName $packageFullName
    Add-CheckFromCondition -Name "package_identity" -Condition ([string]$packageStatus.json.distribution -eq "store-msix" -and [bool]$packageStatus.json.has_package_identity) -PassMessage "MUSU is running from the store-msix package identity." -FailMessage "MUSU is not running from the expected store-msix package identity."
    Add-CheckFromCondition -Name "installed_package_version_matches_release" -Condition ($installedPackageVersion -eq $ExpectedPackageVersion) -PassMessage "Installed package version matches expected $ExpectedPackageVersion." -FailMessage "Installed package version '$installedPackageVersion' does not match expected '$ExpectedPackageVersion' (package_full_name=$packageFullName)."
}

$doctor = Invoke-MusuJson -Arguments @("doctor", "--json")
Add-CheckFromCondition -Name "musu_doctor_json" -Condition ([bool]$doctor.ok) -PassMessage "musu doctor --json returned JSON." -FailMessage "musu doctor --json failed: $($doctor.raw)"
if ($doctor.ok) {
    $bridgeBindAddr = [string]$doctor.json.bridge.service_registry_bind_addr
    $advertisedPublicUrl = [string]$doctor.json.bridge.advertised_public_url
    Add-CheckFromCondition -Name "local_bridge_reachable" -Condition ([string]$doctor.json.bridge.status -eq "ok" -and [int]$doctor.json.bridge.health_http_status -eq 200) -PassMessage "Local bridge health is reachable." -FailMessage "Local bridge is not healthy."
    Add-CheckFromCondition -Name "self_advertised_url_remote_usable" -Condition ([bool]$doctor.json.bridge.advertised_public_url_remote_usable -and (Test-RemoteUsableUrl -Url $advertisedPublicUrl)) -PassMessage "Self advertised URL is usable by other PCs: $advertisedPublicUrl" -FailMessage "Self advertised URL is not remote usable: $advertisedPublicUrl"
}

$status = Invoke-MusuJson -Arguments @("status", "--json")
Add-CheckFromCondition -Name "musu_status_json" -Condition ([bool]$status.ok) -PassMessage "musu status --json returned JSON." -FailMessage "musu status --json failed: $($status.raw)"
if ($status.ok) {
    $fleet = $status.json.fleet
    $thisNode = $fleet.this_node
    $peers = @($fleet.peers)
    $selfNodeName = [string]$thisNode.name
    $onlineNodes = [int]$fleet.online_nodes
    $totalNodes = [int]$fleet.total_nodes

    if (-not [string]::IsNullOrWhiteSpace($ExpectedNodeName)) {
        Add-CheckFromCondition -Name "expected_node_name" -Condition ($selfNodeName -eq $ExpectedNodeName) -PassMessage "This node is $selfNodeName." -FailMessage "Expected this node to be '$ExpectedNodeName', got '$selfNodeName'."
    }

    $directHealthy = 0
    if ($thisNode -and [bool]$thisNode.healthy) {
        $directHealthy += 1
    }
    foreach ($peer in $peers) {
        $reachableVia = [string](Get-PropertyValue -Object $peer -Name "reachable_via" -Default "direct")
        if ([bool]$peer.healthy -and $reachableVia -ne "relay") {
            $directHealthy += 1
        }
    }
    $directHealthyNodes = $directHealthy
    Add-CheckFromCondition -Name "online_nodes_direct_only" -Condition ($onlineNodes -eq $directHealthy) -PassMessage "online_nodes counts direct/healthy nodes only: $onlineNodes" -FailMessage "online_nodes=$onlineNodes, directHealthy=$directHealthy"

    if (-not [string]::IsNullOrWhiteSpace($ExpectedDirectPeerName)) {
        $peer = @($peers | Where-Object { [string]$_.name -eq $ExpectedDirectPeerName }) | Select-Object -First 1
        $peerReachableVia = [string](Get-PropertyValue -Object $peer -Name "reachable_via" -Default "")
        $peerHealthyDirect = ($peer -and [bool]$peer.healthy -and $peerReachableVia -ne "relay")
        Add-CheckFromCondition -Name "expected_direct_peer" -Condition ([bool]$peerHealthyDirect) -PassMessage "Expected peer '$ExpectedDirectPeerName' is healthy over direct route." -FailMessage "Expected peer '$ExpectedDirectPeerName' is not healthy over direct route."
    } else {
        Add-Check -Name "expected_direct_peer" -Status "skip" -Message "No -ExpectedDirectPeerName supplied."
    }
}

$nodes = Invoke-MusuJson -Arguments @("nodes", "--json", "--include-unusable")
if ($nodes.ok) {
    $cloudSelf = @($nodes.json.nodes | Where-Object { $_.is_this_pc -eq $true }) | Select-Object -First 1
    $remoteCloudWarnings = @($nodes.json.nodes | Where-Object { $_.is_this_pc -ne $true -and $_.public_url_remote_usable -ne $true })
    $remoteCloudWarningCount = [int]$remoteCloudWarnings.Count
    Add-CheckFromCondition -Name "cloud_self_public_url_remote_usable" -Condition ($cloudSelf -and [bool]$cloudSelf.public_url_remote_usable -and (Test-RemoteUsableUrl -Url ([string]$cloudSelf.public_url))) -PassMessage "Cloud self public_url is remote usable: $($cloudSelf.public_url)" -FailMessage "Cloud self public_url is missing or unusable."
    if ($remoteCloudWarnings.Count -eq 0) {
        Add-Check -Name "remote_cloud_registry_rows" -Status "pass" -Message "No remote cloud registry row has an unusable public_url."
    } else {
        Add-Check -Name "remote_cloud_registry_rows" -Status "warn" -Message "Remote cloud registry has unusable public_url rows." -Details $remoteCloudWarnings
    }
} else {
    Add-Check -Name "musu_nodes_include_unusable_json" -Status "fail" -Message "musu nodes --json --include-unusable failed: $($nodes.raw)"
}

$brainTokenPath = Join-Path $env:USERPROFILE ".musu\brain\runtime\musu-ingest.token"
$brainTokenAcl = Test-RestrictedAcl -Path $brainTokenPath
if ($brainTokenAcl.exists) {
    Add-CheckFromCondition -Name "brain_ingest_token_acl_restricted" -Condition ([bool]$brainTokenAcl.ok) -PassMessage "brain runtime/musu-ingest.token ACL is restricted." -FailMessage "brain runtime/musu-ingest.token ACL is not restricted: $($brainTokenAcl.summary)"
} elseif ($RequireBrainToken) {
    Add-Check -Name "brain_ingest_token_acl_restricted" -Status "fail" -Message "brain runtime/musu-ingest.token is missing; launch the packaged desktop first-run path, then rerun."
} else {
    Add-Check -Name "brain_ingest_token_acl_restricted" -Status "skip" -Message "brain runtime/musu-ingest.token is not present and -RequireBrainToken was not set."
}

if ($RequireReleaseGradeRoute) {
    if ([string]::IsNullOrWhiteSpace($ExpectedDirectPeerName)) {
        Add-Check -Name "release_grade_route_expected_peer" -Status "fail" -Message "-RequireReleaseGradeRoute requires -ExpectedDirectPeerName so the task route is bound to a peer."
    } else {
        $routeProofMarker = "MUSU_RELEASE_GRADE_ROUTE_PROOF_{0}" -f ([guid]::NewGuid().ToString("N"))
        $releaseGradeRouteEvidencePath = Join-Path ([System.IO.Path]::GetTempPath()) ("musu-fleet-proof-route-{0}.json" -f ([guid]::NewGuid().ToString("N")))
        $routeRun = Invoke-Musu -Arguments @(
            "route",
            "--target", $ExpectedDirectPeerName,
            "--adapter", "echo",
            "--wait",
            "--wait-timeout-sec", ([string]$RouteWaitTimeoutSec),
            "--route-evidence-path", $releaseGradeRouteEvidencePath,
            $routeProofMarker
        )
        Add-CheckFromCondition -Name "release_grade_route_command" -Condition ([bool]$routeRun.ok) -PassMessage "musu route completed for release-grade proof target '$ExpectedDirectPeerName'." -FailMessage "musu route failed for release-grade proof target '$ExpectedDirectPeerName' with exit $($routeRun.exit_code)."
        Add-CheckFromCondition -Name "release_grade_route_output" -Condition ([string]$routeRun.raw -match [regex]::Escape($routeProofMarker)) -PassMessage "Route output contains the proof marker." -FailMessage "Route output did not contain the proof marker."

        if (Test-Path -LiteralPath $releaseGradeRouteEvidencePath) {
            try {
                $releaseGradeRouteEvidence = Get-Content -LiteralPath $releaseGradeRouteEvidencePath -Raw | ConvertFrom-Json
            } catch {
                Add-Check -Name "release_grade_route_evidence_json" -Status "fail" -Message "Route evidence JSON could not be parsed: $($_.Exception.Message)"
            }
        } else {
            Add-Check -Name "release_grade_route_evidence_present" -Status "fail" -Message "musu route did not write route evidence at $releaseGradeRouteEvidencePath."
        }

        if ($releaseGradeRouteEvidence) {
            $routeSchema = Get-StringPropertyValue -Object $releaseGradeRouteEvidence -Name "schema"
            $routeVersion = Get-StringPropertyValue -Object $releaseGradeRouteEvidence -Name "version"
            $routeTarget = Get-StringPropertyValue -Object $releaseGradeRouteEvidence -Name "target_node_id"
            $routeKind = Get-StringPropertyValue -Object $releaseGradeRouteEvidence -Name "route_kind"
            $routeResult = Get-StringPropertyValue -Object $releaseGradeRouteEvidence -Name "result"
            $peerIdentityVerified = Get-BoolPropertyValue -Object $releaseGradeRouteEvidence -Name "peer_identity_verified"
            $peerIdentityMethod = Get-StringPropertyValue -Object $releaseGradeRouteEvidence -Name "peer_identity_method"
            $peerPublicKey = Get-StringPropertyValue -Object $releaseGradeRouteEvidence -Name "peer_public_key"
            $encryption = Get-StringPropertyValue -Object $releaseGradeRouteEvidence -Name "encryption"
            $transportVerifiedBy = Get-StringPropertyValue -Object $releaseGradeRouteEvidence -Name "transport_verified_by"
            $payloadTransited = Get-BoolPropertyValue -Object $releaseGradeRouteEvidence -Name "payload_transited_musu_infra"

            Add-CheckFromCondition -Name "release_grade_route_evidence_schema" -Condition ($routeSchema -eq "musu.route_evidence.v1") -PassMessage "Route evidence schema is musu.route_evidence.v1." -FailMessage "Route evidence schema is '$routeSchema'."
            Add-CheckFromCondition -Name "release_grade_route_evidence_version" -Condition ($routeVersion -eq $ExpectedReleaseVersion) -PassMessage "Route evidence version matches $ExpectedReleaseVersion." -FailMessage "Route evidence version '$routeVersion' does not match expected '$ExpectedReleaseVersion'."
            Add-CheckFromCondition -Name "release_grade_route_target" -Condition ($routeTarget -eq $ExpectedDirectPeerName) -PassMessage "Route evidence target is $routeTarget." -FailMessage "Route evidence target '$routeTarget' does not match expected '$ExpectedDirectPeerName'."
            Add-CheckFromCondition -Name "release_grade_route_kind" -Condition (@("lan", "tailscale", "direct_quic", "relay") -contains $routeKind) -PassMessage "Route evidence kind is $routeKind." -FailMessage "Route evidence kind '$routeKind' is not a release candidate route kind."
            Add-CheckFromCondition -Name "release_grade_route_result" -Condition ($routeResult -eq "success") -PassMessage "Route evidence result is success." -FailMessage "Route evidence result is '$routeResult'."
            Add-CheckFromCondition -Name "release_grade_route_peer_identity" -Condition $peerIdentityVerified -PassMessage "Route peer identity is verified." -FailMessage "Route peer identity is not verified."
            Add-CheckFromCondition -Name "release_grade_route_peer_identity_method" -Condition (-not [string]::IsNullOrWhiteSpace($peerIdentityMethod)) -PassMessage "Route peer identity method is $peerIdentityMethod." -FailMessage "Route peer identity method is missing."
            Add-CheckFromCondition -Name "release_grade_route_peer_public_key" -Condition (-not [string]::IsNullOrWhiteSpace($peerPublicKey)) -PassMessage "Route peer public key is present." -FailMessage "Route peer public key is missing."
            Add-CheckFromCondition -Name "release_grade_route_encryption" -Condition ($encryption.ToLowerInvariant() -eq "quic_tls_1_3") -PassMessage "Route encryption is quic_tls_1_3." -FailMessage "Route encryption is not release-grade: $encryption."
            Add-CheckFromCondition -Name "release_grade_route_transport" -Condition ($transportVerifiedBy -eq "musu_quic_tls_transport") -PassMessage "Route transport proof is musu_quic_tls_transport." -FailMessage "Route transport proof is missing or not release-grade: $transportVerifiedBy."
            if ($routeKind -eq "relay") {
                Add-CheckFromCondition -Name "release_grade_route_payload_transit" -Condition $payloadTransited -PassMessage "Relay route evidence records MUSU infra payload transit." -FailMessage "Relay route evidence must set payload_transited_musu_infra=true."
            } else {
                Add-CheckFromCondition -Name "release_grade_route_payload_transit" -Condition (-not $payloadTransited) -PassMessage "Direct route evidence records no MUSU infra payload transit." -FailMessage "Direct route evidence must set payload_transited_musu_infra=false."
            }

            $releaseGradeRouteVerified = (
                $routeSchema -eq "musu.route_evidence.v1" -and
                $routeVersion -eq $ExpectedReleaseVersion -and
                $routeTarget -eq $ExpectedDirectPeerName -and
                (@("lan", "tailscale", "direct_quic", "relay") -contains $routeKind) -and
                $routeResult -eq "success" -and
                $peerIdentityVerified -and
                (-not [string]::IsNullOrWhiteSpace($peerIdentityMethod)) -and
                (-not [string]::IsNullOrWhiteSpace($peerPublicKey)) -and
                $encryption.ToLowerInvariant() -eq "quic_tls_1_3" -and
                $transportVerifiedBy -eq "musu_quic_tls_transport" -and
                (($routeKind -eq "relay" -and $payloadTransited) -or ($routeKind -ne "relay" -and -not $payloadTransited))
            )
        }
    }
} else {
    Add-Check -Name "release_grade_route_proof" -Status "skip" -Message "Not requested. This fleet proof validates install/package/direct fleet health; add -RequireReleaseGradeRoute to execute and verify release-grade route evidence."
}

$failCount = @($checks | Where-Object { $_.status -eq "fail" }).Count
$warnCount = @($checks | Where-Object { $_.status -eq "warn" }).Count
$result = [pscustomobject]@{
    schema = "musu.fleet_node_proof.v1"
    generated_at = (Get-Date).ToUniversalTime().ToString("o")
    ok = ($failCount -eq 0)
    fail_count = $failCount
    warn_count = $warnCount
    expected_node_name = $ExpectedNodeName
    expected_direct_peer_name = $ExpectedDirectPeerName
    expected_release_version = $ExpectedReleaseVersion
    expected_package_version = $ExpectedPackageVersion
    package_full_name = $packageFullName
    installed_package_version = $installedPackageVersion
    repair = $repairEvidence
    bridge_bind_addr = $bridgeBindAddr
    advertised_public_url = $advertisedPublicUrl
    self_node = $selfNodeName
    total_nodes = $totalNodes
    online_nodes = $onlineNodes
    direct_healthy_nodes = $directHealthyNodes
    remote_cloud_warning_count = $remoteCloudWarningCount
    brain_token_required = [bool]$RequireBrainToken
    brain_token_present = [bool]$brainTokenAcl.exists
    release_grade_route_required = [bool]$RequireReleaseGradeRoute
    release_grade_route_verified = [bool]$releaseGradeRouteVerified
    release_grade_route_evidence = (New-RouteEvidenceSummary -Evidence $releaseGradeRouteEvidence -EvidencePath $releaseGradeRouteEvidencePath)
    checks = @($checks.ToArray())
}

if ($Json) {
    $result | ConvertTo-Json -Depth 12
} else {
    $result | Format-List
}

if ($failCount -gt 0) {
    exit 1
}
`;

export async function GET() {
  const expectedPackageVersion = publicVersionToPackageVersion(PUBLIC_RELEASE_VERSION);
  const script = PROOF_SCRIPT.replaceAll(
    "__EXPECTED_RELEASE_VERSION__",
    PUBLIC_RELEASE_VERSION,
  ).replaceAll("__EXPECTED_PACKAGE_VERSION__", expectedPackageVersion);

  return new NextResponse(script, {
    status: 200,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, max-age=300",
    },
  });
}
