[CmdletBinding()]
param(
    [string]$ArchiveDir,
    [string]$ArchiveManifestPath,
    [string]$ExpectedTargetNode,
    [string]$ExpectedTargetIp,
    [string]$ExpectedControlServerUrl,
    [switch]$Json
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$ReleaseBundleContract = "musu.private_mesh_release_bundle_contract.v20260614_toolchain_bound"

function Write-Step([string]$Message) {
    if (-not $Json) {
        Write-Host "==> $Message"
    }
}

function Resolve-ArchiveManifestPath {
    if (-not [string]::IsNullOrWhiteSpace($ArchiveManifestPath)) {
        return (Resolve-Path -LiteralPath $ArchiveManifestPath).Path
    }
    if ([string]::IsNullOrWhiteSpace($ArchiveDir)) {
        throw "Pass -ArchiveDir or -ArchiveManifestPath."
    }
    $dir = (Resolve-Path -LiteralPath $ArchiveDir).Path
    $path = Join-Path $dir "private-mesh-release-proof.archive.json"
    if (-not (Test-Path -LiteralPath $path)) {
        throw "Archive manifest not found: $path"
    }
    return (Resolve-Path -LiteralPath $path).Path
}

function Read-JsonFile([string]$Path) {
    if ([string]::IsNullOrWhiteSpace($Path) -or -not (Test-Path -LiteralPath $Path)) {
        return $null
    }
    return Get-Content -LiteralPath $Path -Raw | ConvertFrom-Json
}

function Get-PropertyValue([object]$Value, [string]$Name) {
    if ($null -eq $Value -or $null -eq $Value.PSObject.Properties[$Name]) {
        return $null
    }
    return $Value.$Name
}

function Get-BoolProperty([object]$Value, [string]$Name) {
    $raw = Get-PropertyValue -Value $Value -Name $Name
    if ($null -eq $raw) {
        return $false
    }
    return [bool]$raw
}

function Get-StringProperty([object]$Value, [string]$Name) {
    $raw = Get-PropertyValue -Value $Value -Name $Name
    if ($null -eq $raw) {
        return ""
    }
    return [string]$raw
}

function Get-DateTimeOffsetProperty([object]$Value, [string]$Name) {
    $raw = Get-StringProperty -Value $Value -Name $Name
    if ([string]::IsNullOrWhiteSpace($raw)) {
        return $null
    }
    try {
        return [datetimeoffset]::Parse($raw)
    }
    catch {
        return $null
    }
}

function Add-Check {
    param(
        [System.Collections.Generic.List[object]]$Checks,
        [string]$Name,
        [bool]$Ok,
        [string]$Message,
        [object]$Evidence = $null
    )
    $Checks.Add([pscustomobject]@{
        name = $Name
        ok = $Ok
        status = if ($Ok) { "pass" } else { "fail" }
        message = $Message
        evidence = $Evidence
    }) | Out-Null
}

function Find-ArtifactByRole {
    param(
        [object[]]$Artifacts,
        [string]$Role
    )
    foreach ($artifact in $Artifacts) {
        if ((Get-StringProperty -Value $artifact -Name "role") -eq $Role) {
            return $artifact
        }
    }
    return $null
}

function Find-ArtifactByRoles {
    param(
        [object[]]$Artifacts,
        [string[]]$Roles
    )
    foreach ($role in $Roles) {
        $artifact = Find-ArtifactByRole -Artifacts $Artifacts -Role $role
        if ($null -ne $artifact) {
            return $artifact
        }
    }
    return $null
}

function Test-PathInsideDirectory {
    param(
        [string]$Path,
        [string]$Directory
    )
    if ([string]::IsNullOrWhiteSpace($Path) -or [string]::IsNullOrWhiteSpace($Directory)) {
        return $false
    }
    $resolvedPath = [System.IO.Path]::GetFullPath($Path).TrimEnd([System.IO.Path]::DirectorySeparatorChar, [System.IO.Path]::AltDirectorySeparatorChar)
    $resolvedDirectory = [System.IO.Path]::GetFullPath($Directory).TrimEnd([System.IO.Path]::DirectorySeparatorChar, [System.IO.Path]::AltDirectorySeparatorChar)
    return $resolvedPath.StartsWith($resolvedDirectory + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase) -or
        $resolvedPath.StartsWith($resolvedDirectory + [System.IO.Path]::AltDirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase)
}

function Get-RouteEvidenceHost([string]$CandidateAddr) {
    $value = $CandidateAddr.Trim()
    if ([string]::IsNullOrWhiteSpace($value)) {
        return ""
    }
    if ($value -match "^https?://") {
        try {
            return ([uri]$value).Host
        }
        catch {
            return ""
        }
    }
    if ($value.Contains(":")) {
        return $value.Split(":")[0]
    }
    return $value
}

function Test-TailnetIpv4([string]$Value) {
    $parts = $Value.Split(".")
    if ($parts.Count -ne 4) {
        return $false
    }
    $numbers = @()
    foreach ($part in $parts) {
        $number = 0
        if (-not [int]::TryParse($part, [ref]$number)) {
            return $false
        }
        if ($number -lt 0 -or $number -gt 255) {
            return $false
        }
        $numbers += $number
    }
    return ($numbers[0] -eq 100 -and $numbers[1] -ge 64 -and $numbers[1] -le 127)
}

function Add-PrivateMeshRouteTransportCheck {
    param(
        [System.Collections.Generic.List[object]]$Checks,
        [object]$RouteEvidence,
        [string]$TargetIp,
        [string]$ControlServerUrl
    )
    $schema = Get-StringProperty -Value $RouteEvidence -Name "schema"
    $routeKind = Get-StringProperty -Value $RouteEvidence -Name "route_kind"
    $result = Get-StringProperty -Value $RouteEvidence -Name "result"
    $candidateAddr = Get-StringProperty -Value $RouteEvidence -Name "candidate_addr"
    $candidateHost = Get-RouteEvidenceHost -CandidateAddr $candidateAddr
    $encryption = Get-StringProperty -Value $RouteEvidence -Name "encryption"
    $transportVerifiedBy = Get-StringProperty -Value $RouteEvidence -Name "transport_verified_by"
    $privateMeshMode = Get-StringProperty -Value $RouteEvidence -Name "private_mesh_mode"
    $privateMeshControlServerUrl = Get-StringProperty -Value $RouteEvidence -Name "private_mesh_control_server_url"
    $privateMeshControlServerVerified = Get-BoolProperty -Value $RouteEvidence -Name "private_mesh_control_server_verified"
    $payloadTransitedRaw = Get-PropertyValue -Value $RouteEvidence -Name "payload_transited_musu_infra"
    $payloadTransitedMusuInfra = if ($null -eq $payloadTransitedRaw) { $true } else { [bool]$payloadTransitedRaw }
    $controlServerMatches = (-not [string]::IsNullOrWhiteSpace($privateMeshControlServerUrl)) -and
        ($privateMeshControlServerUrl.TrimEnd("/") -eq $ControlServerUrl.TrimEnd("/"))
    $ok = ($schema -eq "musu.route_evidence.v1") -and
        ($routeKind -eq "tailscale") -and
        ($result -eq "success") -and
        ($candidateHost -eq $TargetIp) -and
        (Test-TailnetIpv4 -Value $candidateHost) -and
        ($encryption -eq "tailscale_wireguard_overlay") -and
        ($transportVerifiedBy -eq "musu_private_mesh_tailnet_route") -and
        ($privateMeshMode -eq "musu_headscale") -and
        $privateMeshControlServerVerified -and
        $controlServerMatches -and
        (-not $payloadTransitedMusuInfra)
    Add-Check -Checks $Checks -Name "private mesh route transport" -Ok $ok -Message "archived route evidence must prove successful MUSU Headscale/Tailnet WireGuard overlay delivery to the target IP, bound to the expected MUSU control server, without MUSU infra transit" -Evidence @{
        schema = $schema
        route_kind = $routeKind
        result = $result
        candidate_addr = $candidateAddr
        candidate_host = $candidateHost
        target_ip = $TargetIp
        candidate_host_is_tailnet_ipv4 = Test-TailnetIpv4 -Value $candidateHost
        encryption = $encryption
        transport_verified_by = $transportVerifiedBy
        private_mesh_mode = $privateMeshMode
        private_mesh_control_server_url = $privateMeshControlServerUrl
        private_mesh_control_server_verified = $privateMeshControlServerVerified
        expected_control_server_url = $ControlServerUrl
        control_server_matches = $controlServerMatches
        payload_transited_musu_infra = $payloadTransitedMusuInfra
    }
}

function Add-ArchivedPeerIdentityBindingCheck {
    param(
        [System.Collections.Generic.List[object]]$Checks,
        [object]$RouteEvidence,
        [object]$PhysicalEvidence,
        [string]$TargetNode,
        [string]$TargetIp
    )
    $peerIdentity = Get-PropertyValue -Value $RouteEvidence -Name "peer_identity"
    $schema = Get-StringProperty -Value $peerIdentity -Name "schema"
    $identityTargetNode = Get-StringProperty -Value $peerIdentity -Name "target_node"
    $identityTargetIp = Get-StringProperty -Value $peerIdentity -Name "target_ip"
    $targetUrlHost = Get-StringProperty -Value $peerIdentity -Name "target_url_host"
    $sourceHostname = Get-StringProperty -Value $peerIdentity -Name "source_hostname"
    $targetHostname = Get-StringProperty -Value $peerIdentity -Name "target_hostname"
    $physicalHostname = Get-StringProperty -Value $PhysicalEvidence -Name "hostname"
    $targetUrlHostMatches = (-not [string]::IsNullOrWhiteSpace($targetUrlHost)) -and ($targetUrlHost -eq $TargetIp)
    $hostnameMatches = (-not [string]::IsNullOrWhiteSpace($targetHostname)) -and
        (-not [string]::IsNullOrWhiteSpace($physicalHostname)) -and
        ($targetHostname.Trim().ToLowerInvariant() -eq $physicalHostname.Trim().ToLowerInvariant())
    $ok = ($schema -eq "musu.private_mesh_peer_identity.v1") -and
        ($identityTargetNode.ToLowerInvariant() -eq $TargetNode.ToLowerInvariant()) -and
        ($identityTargetIp -eq $TargetIp) -and
        (Get-BoolProperty -Value $peerIdentity -Name "node_distinct") -and
        (Get-BoolProperty -Value $peerIdentity -Name "tailnet_ip_distinct") -and
        (-not [string]::IsNullOrWhiteSpace($sourceHostname)) -and
        (-not [string]::IsNullOrWhiteSpace($targetHostname)) -and
        (Get-BoolProperty -Value $peerIdentity -Name "physical_host_distinct") -and
        (Get-BoolProperty -Value $peerIdentity -Name "target_url_host_matches_target_ip") -and
        $targetUrlHostMatches -and
        (Get-BoolProperty -Value $peerIdentity -Name "release_identity_bound") -and
        (Get-BoolProperty -Value $peerIdentity -Name "physical_peer_verified") -and
        $hostnameMatches
    Add-Check -Checks $Checks -Name "archived peer identity target binding" -Ok $ok -Message "archived route peer_identity must match archive target node/IP, be release-bound, and match archived physical peer hostname" -Evidence @{
        schema = $schema
        archive_target_node = $TargetNode
        identity_target_node = $identityTargetNode
        archive_target_ip = $TargetIp
        identity_target_ip = $identityTargetIp
        target_url_host = $targetUrlHost
        target_url_host_matches = $targetUrlHostMatches
        source_hostname = $sourceHostname
        identity_target_hostname = $targetHostname
        physical_hostname = $physicalHostname
        hostname_matches = $hostnameMatches
        node_distinct = Get-BoolProperty -Value $peerIdentity -Name "node_distinct"
        tailnet_ip_distinct = Get-BoolProperty -Value $peerIdentity -Name "tailnet_ip_distinct"
        physical_host_distinct = Get-BoolProperty -Value $peerIdentity -Name "physical_host_distinct"
        target_url_host_matches_target_ip = Get-BoolProperty -Value $peerIdentity -Name "target_url_host_matches_target_ip"
        release_identity_bound = Get-BoolProperty -Value $peerIdentity -Name "release_identity_bound"
        physical_peer_verified = Get-BoolProperty -Value $peerIdentity -Name "physical_peer_verified"
    }
}

function Add-ArchivedBundleRequiredCheck {
    param(
        [System.Collections.Generic.List[object]]$Checks,
        [object]$BundleManifest,
        [string]$Name
    )
    $bundleChecks = @(Get-PropertyValue -Value $BundleManifest -Name "checks")
    $matching = $null
    foreach ($check in $bundleChecks) {
        if ((Get-StringProperty -Value $check -Name "name") -eq $Name) {
            $matching = $check
            break
        }
    }
    $ok = ($null -ne $matching) -and (Get-BoolProperty -Value $matching -Name "ok")
    Add-Check -Checks $Checks -Name "archived bundle required check $Name" -Ok $ok -Message "archived bundle manifest must contain a passing '$Name' check from the current release contract" -Evidence $matching
}

function Add-ArchivedVerificationBindingCheck {
    param(
        [System.Collections.Generic.List[object]]$Checks,
        [object]$Verification,
        [string]$TargetNode,
        [string]$TargetIp,
        [string]$ControlServerUrl
    )
    $schema = Get-StringProperty -Value $Verification -Name "schema"
    $okSchema = ($schema -eq "musu.private_mesh_release_proof.v1") -or
        ($schema -eq "musu.private_mesh_release_proof_runner.v1")
    $verificationTargetNode = Get-StringProperty -Value $Verification -Name "target_node"
    $verificationTargetIp = Get-StringProperty -Value $Verification -Name "target_ip"
    $verificationControlUrl = Get-StringProperty -Value $Verification -Name "expected_control_server_url"
    $completedAt = Get-DateTimeOffsetProperty -Value $Verification -Name "completed_at"
    $controlMatches = (-not [string]::IsNullOrWhiteSpace($verificationControlUrl)) -and
        ($verificationControlUrl.TrimEnd("/") -eq $ControlServerUrl.TrimEnd("/"))
    $ok = $okSchema -and
        (Get-BoolProperty -Value $Verification -Name "ok") -and
        ($verificationTargetNode -eq $TargetNode) -and
        ($verificationTargetIp -eq $TargetIp) -and
        $controlMatches -and
        ($null -ne $completedAt)
    Add-Check -Checks $Checks -Name "archived verification target binding" -Ok $ok -Message "archived verification must be ok and match archive target node/IP/control server with valid completed_at" -Evidence @{
        schema = $schema
        schema_ok = $okSchema
        verification_ok = Get-BoolProperty -Value $Verification -Name "ok"
        archive_target_node = $TargetNode
        verification_target_node = $verificationTargetNode
        archive_target_ip = $TargetIp
        verification_target_ip = $verificationTargetIp
        archive_control_server_url = $ControlServerUrl
        verification_control_server_url = $verificationControlUrl
        control_server_matches = $controlMatches
        completed_at = Get-StringProperty -Value $Verification -Name "completed_at"
        completed_at_valid = ($null -ne $completedAt)
    }
}

function Add-ArchivedPhysicalEvidenceReleaseTimeBindingCheck {
    param(
        [System.Collections.Generic.List[object]]$Checks,
        [object]$Verification,
        [object]$PhysicalEvidence,
        [string]$TargetNode,
        [string]$TargetIp,
        [string]$ControlServerUrl
    )
    $completedAt = Get-DateTimeOffsetProperty -Value $Verification -Name "completed_at"
    $generatedAt = Get-DateTimeOffsetProperty -Value $PhysicalEvidence -Name "generated_at"
    $schema = Get-StringProperty -Value $PhysicalEvidence -Name "schema"
    $nodeName = Get-StringProperty -Value $PhysicalEvidence -Name "node_name"
    $tailnetIp = Get-StringProperty -Value $PhysicalEvidence -Name "tailnet_ip"
    $evidenceControlUrl = Get-StringProperty -Value $PhysicalEvidence -Name "control_server_url"
    $hostname = Get-StringProperty -Value $PhysicalEvidence -Name "hostname"
    $controlServerMatches = (-not [string]::IsNullOrWhiteSpace($evidenceControlUrl)) -and
        ($evidenceControlUrl.TrimEnd("/") -eq $ControlServerUrl.TrimEnd("/"))
    $generatedAtFresh = ($null -ne $completedAt) -and
        ($null -ne $generatedAt) -and
        ($generatedAt -ge $completedAt.AddSeconds(-86400)) -and
        ($generatedAt -le $completedAt.AddSeconds(300))
    $ok = ($schema -eq "musu.private_mesh_physical_peer_evidence.v1") -and
        (Get-BoolProperty -Value $PhysicalEvidence -Name "physical_peer_verified") -and
        (Get-BoolProperty -Value $PhysicalEvidence -Name "control_server_verified") -and
        (-not [string]::IsNullOrWhiteSpace($hostname)) -and
        ($nodeName.ToLowerInvariant() -eq $TargetNode.ToLowerInvariant()) -and
        ($tailnetIp -eq $TargetIp) -and
        $controlServerMatches -and
        $generatedAtFresh
    Add-Check -Checks $Checks -Name "archived physical peer evidence release time binding" -Ok $ok -Message "archived physical peer evidence must match archive target node/IP/control server and be generated within 24 hours of archived verification completed_at" -Evidence @{
        schema = $schema
        target_node = $TargetNode
        physical_node_name = $nodeName
        target_ip = $TargetIp
        physical_tailnet_ip = $tailnetIp
        expected_control_server_url = $ControlServerUrl
        physical_control_server_url = $evidenceControlUrl
        control_server_matches = $controlServerMatches
        physical_peer_verified = Get-BoolProperty -Value $PhysicalEvidence -Name "physical_peer_verified"
        control_server_verified = Get-BoolProperty -Value $PhysicalEvidence -Name "control_server_verified"
        hostname = $hostname
        completed_at = Get-StringProperty -Value $Verification -Name "completed_at"
        generated_at = Get-StringProperty -Value $PhysicalEvidence -Name "generated_at"
        generated_at_fresh = $generatedAtFresh
    }
}

function Add-ToolHashChecks {
    param(
        [System.Collections.Generic.List[object]]$Checks,
        [object]$ToolHashes
    )
    Add-Check -Checks $Checks -Name "release tool hashes schema" -Ok ((Get-StringProperty -Value $ToolHashes -Name "schema") -eq "musu.private_mesh_release_proof_tool_hashes.v1") -Message "archive must preserve release proof tool hashes" -Evidence (Get-StringProperty -Value $ToolHashes -Name "schema")

    $expectedTools = [ordered]@{
        runner = "run-private-mesh-release-proof.ps1"
        smoke = "smoke-private-mesh-route-proof.ps1"
        route_verifier = "verify-private-mesh-route-proof-evidence.ps1"
        bundle_verifier = "verify-private-mesh-release-proof-bundle.ps1"
        archive = "archive-private-mesh-release-proof-bundle.ps1"
        archive_verifier = "verify-private-mesh-release-proof-archive.ps1"
        evidence_integrity = "evidence-integrity.ps1"
    }
    foreach ($entry in $expectedTools.GetEnumerator()) {
        $record = Get-PropertyValue -Value $ToolHashes -Name $entry.Key
        $recordedHash = Get-StringProperty -Value $record -Name "sha256"
        $path = Join-Path $scriptDir $entry.Value
        $actualHash = if (Test-Path -LiteralPath $path) { Get-EvidenceFileSha256 -Path $path } else { "" }
        $ok = ($recordedHash -match "^[0-9a-f]{64}$") -and ($recordedHash -eq $actualHash)
        Add-Check -Checks $Checks -Name "release tool hash $($entry.Key)" -Ok $ok -Message "archive tool hash must match current verifier toolchain" -Evidence @{
            tool = $entry.Key
            path = $path
            recorded_sha256 = $recordedHash
            current_sha256 = $actualHash
        }
    }
}

function Add-ArtifactIntegrityChecks {
    param(
        [System.Collections.Generic.List[object]]$Checks,
        [object[]]$Artifacts,
        [string]$ArchiveDirectory
    )
    foreach ($artifact in $Artifacts) {
        $role = Get-StringProperty -Value $artifact -Name "role"
        $evidencePath = Get-StringProperty -Value $artifact -Name "evidence_path"
        $recordedSidecarPath = Get-StringProperty -Value $artifact -Name "sha256_path"
        $recordedSha256 = Get-StringProperty -Value $artifact -Name "sha256"
        if ([string]::IsNullOrWhiteSpace($role) -or [string]::IsNullOrWhiteSpace($evidencePath) -or -not (Test-Path -LiteralPath $evidencePath)) {
            Add-Check -Checks $Checks -Name "archive artifact $role" -Ok $false -Message "archive artifact file is missing" -Evidence $artifact
            continue
        }
        $resolvedEvidence = (Resolve-Path -LiteralPath $evidencePath).Path
        $integrity = Test-EvidenceIntegritySidecar -EvidencePath $resolvedEvidence
        $actualSidecarPath = Get-EvidenceIntegritySidecarPath -EvidencePath $resolvedEvidence
        $evidenceInsideArchive = Test-PathInsideDirectory -Path $resolvedEvidence -Directory $ArchiveDirectory
        $sidecarInsideArchive = Test-PathInsideDirectory -Path $actualSidecarPath -Directory $ArchiveDirectory
        $ok = ([bool]$integrity.ok) -and
            $evidenceInsideArchive -and
            $sidecarInsideArchive -and
            ($recordedSidecarPath -eq $actualSidecarPath) -and
            ($recordedSha256 -eq [string]$integrity.actual)
        Add-Check -Checks $Checks -Name "archive artifact $role" -Ok $ok -Message "archive artifact file and sidecar must be inside archive directory, with matching sidecar path and SHA256" -Evidence @{
            role = $role
            evidence_path = $resolvedEvidence
            recorded_sha256_path = $recordedSidecarPath
            actual_sha256_path = $actualSidecarPath
            recorded_sha256 = $recordedSha256
            actual_sha256 = [string]$integrity.actual
            integrity_status = [string]$integrity.status
            evidence_inside_archive = $evidenceInsideArchive
            sidecar_inside_archive = $sidecarInsideArchive
        }
    }
}

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
. (Join-Path $scriptDir "evidence-integrity.ps1")

$resolvedArchiveManifestPath = Resolve-ArchiveManifestPath
$resolvedArchiveDir = Split-Path -Parent $resolvedArchiveManifestPath
$archiveManifest = Read-JsonFile -Path $resolvedArchiveManifestPath
$checks = [System.Collections.Generic.List[object]]::new()

$archiveManifestIntegrity = Test-EvidenceIntegritySidecar -EvidencePath $resolvedArchiveManifestPath
Add-Check -Checks $checks -Name "archive manifest sha256" -Ok ([bool]$archiveManifestIntegrity.ok) -Message ([string]$archiveManifestIntegrity.message) -Evidence $archiveManifestIntegrity
Add-Check -Checks $checks -Name "archive schema" -Ok ((Get-StringProperty -Value $archiveManifest -Name "schema") -eq "musu.private_mesh_release_proof_archive.v1") -Message "archive manifest schema must be musu.private_mesh_release_proof_archive.v1" -Evidence (Get-StringProperty -Value $archiveManifest -Name "schema")
Add-Check -Checks $checks -Name "archive ok" -Ok (Get-BoolProperty -Value $archiveManifest -Name "ok") -Message "archive manifest ok must be true"
Add-Check -Checks $checks -Name "archive release trusted" -Ok (Get-BoolProperty -Value $archiveManifest -Name "release_evidence_trusted") -Message "archive must contain trusted release evidence"
Add-Check -Checks $checks -Name "archive bundle ok" -Ok ((Get-BoolProperty -Value $archiveManifest -Name "bundle_manifest_ok") -and ((Get-PropertyValue -Value $archiveManifest -Name "bundle_manifest_fail_count") -eq 0)) -Message "archive bundle manifest must be ok with zero failed checks"
Add-Check -Checks $checks -Name "archive release contract" -Ok ((Get-StringProperty -Value $archiveManifest -Name "release_bundle_contract") -eq $ReleaseBundleContract) -Message "archive must use the current release bundle contract" -Evidence @{
    expected = $ReleaseBundleContract
    actual = Get-StringProperty -Value $archiveManifest -Name "release_bundle_contract"
}

$targetNode = Get-StringProperty -Value $archiveManifest -Name "target_node"
$targetIp = Get-StringProperty -Value $archiveManifest -Name "target_ip"
$controlUrl = Get-StringProperty -Value $archiveManifest -Name "expected_control_server_url"
if (-not [string]::IsNullOrWhiteSpace($ExpectedTargetNode)) {
    Add-Check -Checks $checks -Name "target node matches expectation" -Ok ($targetNode -eq $ExpectedTargetNode) -Message "archive target node must match expected value" -Evidence @{ expected = $ExpectedTargetNode; actual = $targetNode }
}
if (-not [string]::IsNullOrWhiteSpace($ExpectedTargetIp)) {
    Add-Check -Checks $checks -Name "target ip matches expectation" -Ok ($targetIp -eq $ExpectedTargetIp) -Message "archive target IP must match expected value" -Evidence @{ expected = $ExpectedTargetIp; actual = $targetIp }
}
if (-not [string]::IsNullOrWhiteSpace($ExpectedControlServerUrl)) {
    Add-Check -Checks $checks -Name "control server matches expectation" -Ok ($controlUrl.TrimEnd("/") -eq $ExpectedControlServerUrl.TrimEnd("/")) -Message "archive control server URL must match expected value" -Evidence @{ expected = $ExpectedControlServerUrl; actual = $controlUrl }
}

$artifacts = @(Get-PropertyValue -Value $archiveManifest -Name "artifacts")
$artifactCount = Get-PropertyValue -Value $archiveManifest -Name "artifact_count"
Add-Check -Checks $checks -Name "archive artifact count" -Ok (($artifacts.Count -eq $artifactCount) -and ($artifacts.Count -ge 4)) -Message "archive artifact_count must match artifacts and include minimum release evidence set" -Evidence @{ artifact_count = $artifactCount; actual_count = $artifacts.Count }
foreach ($role in @("bundle_manifest", "route_evidence", "physical_peer_evidence")) {
    Add-Check -Checks $checks -Name "archive contains $role" -Ok ($null -ne (Find-ArtifactByRole -Artifacts $artifacts -Role $role)) -Message "archive must contain $role artifact"
}
$hasVerification = ($null -ne (Find-ArtifactByRole -Artifacts $artifacts -Role "runner_verification")) -or
    ($null -ne (Find-ArtifactByRole -Artifacts $artifacts -Role "verification")) -or
    ($null -ne (Find-ArtifactByRole -Artifacts $artifacts -Role "native_verification"))
Add-Check -Checks $checks -Name "archive contains verification artifact" -Ok $hasVerification -Message "archive must contain a runner/native verification artifact"

Add-ArtifactIntegrityChecks -Checks $checks -Artifacts $artifacts -ArchiveDirectory $resolvedArchiveDir
Add-ToolHashChecks -Checks $checks -ToolHashes (Get-PropertyValue -Value $archiveManifest -Name "release_tool_hashes")

$bundleArtifact = Find-ArtifactByRole -Artifacts $artifacts -Role "bundle_manifest"
$bundleManifest = Read-JsonFile -Path (Get-StringProperty -Value $bundleArtifact -Name "evidence_path")
Add-Check -Checks $checks -Name "archived bundle schema" -Ok ((Get-StringProperty -Value $bundleManifest -Name "schema") -eq "musu.private_mesh_release_proof_bundle.v1") -Message "archived bundle manifest schema must be valid" -Evidence (Get-StringProperty -Value $bundleManifest -Name "schema")
Add-Check -Checks $checks -Name "archived bundle ok" -Ok ((Get-BoolProperty -Value $bundleManifest -Name "ok") -and ((Get-PropertyValue -Value $bundleManifest -Name "fail_count") -eq 0)) -Message "archived bundle manifest must be ok with zero failed checks"
Add-Check -Checks $checks -Name "archived bundle target matches archive" -Ok ((Get-StringProperty -Value $bundleManifest -Name "target_node") -eq $targetNode -and (Get-StringProperty -Value $bundleManifest -Name "target_ip") -eq $targetIp) -Message "archived bundle target must match archive manifest" -Evidence @{
    archive_target_node = $targetNode
    bundle_target_node = Get-StringProperty -Value $bundleManifest -Name "target_node"
    archive_target_ip = $targetIp
    bundle_target_ip = Get-StringProperty -Value $bundleManifest -Name "target_ip"
}
Add-Check -Checks $checks -Name "archived bundle contract matches archive" -Ok ((Get-StringProperty -Value $bundleManifest -Name "release_bundle_contract") -eq (Get-StringProperty -Value $archiveManifest -Name "release_bundle_contract")) -Message "archived bundle contract must match archive manifest"
Add-Check -Checks $checks -Name "archived bundle control server matches archive" -Ok ((Get-StringProperty -Value $bundleManifest -Name "expected_control_server_url").TrimEnd("/") -eq $controlUrl.TrimEnd("/")) -Message "archived bundle control server URL must match archive manifest" -Evidence @{
    archive_control_server_url = $controlUrl
    bundle_control_server_url = Get-StringProperty -Value $bundleManifest -Name "expected_control_server_url"
}
$archiveRuntimeKind = Get-StringProperty -Value $archiveManifest -Name "desktop_runtime_kind"
$bundleRuntimeKind = Get-StringProperty -Value $bundleManifest -Name "desktop_runtime_kind"
$archiveRuntimePackaged = Get-BoolProperty -Value $archiveManifest -Name "desktop_runtime_packaged"
$bundleRuntimePackaged = Get-BoolProperty -Value $bundleManifest -Name "desktop_runtime_packaged"
Add-Check -Checks $checks -Name "archived desktop runtime scope matches bundle" -Ok (
    (-not [string]::IsNullOrWhiteSpace($archiveRuntimeKind)) -and
    ($archiveRuntimeKind -eq $bundleRuntimeKind) -and
    ($archiveRuntimePackaged -eq $bundleRuntimePackaged) -and
    ((Get-StringProperty -Value $archiveManifest -Name "desktop_runtime_exe_sha256") -eq (Get-StringProperty -Value $bundleManifest -Name "desktop_runtime_exe_sha256"))
) -Message "archive manifest must preserve the bundle desktop runtime identity and packaged/unpackaged scope" -Evidence @{
    archive_desktop_runtime_kind = $archiveRuntimeKind
    bundle_desktop_runtime_kind = $bundleRuntimeKind
    archive_desktop_runtime_packaged = $archiveRuntimePackaged
    bundle_desktop_runtime_packaged = $bundleRuntimePackaged
    archive_desktop_runtime_exe_sha256 = Get-StringProperty -Value $archiveManifest -Name "desktop_runtime_exe_sha256"
    bundle_desktop_runtime_exe_sha256 = Get-StringProperty -Value $bundleManifest -Name "desktop_runtime_exe_sha256"
}
Add-ArchivedBundleRequiredCheck -Checks $checks -BundleManifest $bundleManifest -Name "physical peer evidence release time binding"
$routeArtifact = Find-ArtifactByRole -Artifacts $artifacts -Role "route_evidence"
$routeEvidence = Read-JsonFile -Path (Get-StringProperty -Value $routeArtifact -Name "evidence_path")
Add-PrivateMeshRouteTransportCheck -Checks $checks -RouteEvidence $routeEvidence -TargetIp $targetIp -ControlServerUrl $controlUrl
$verificationArtifact = Find-ArtifactByRoles -Artifacts $artifacts -Roles @("verification", "runner_verification", "native_verification")
$verification = Read-JsonFile -Path (Get-StringProperty -Value $verificationArtifact -Name "evidence_path")
Add-ArchivedVerificationBindingCheck -Checks $checks -Verification $verification -TargetNode $targetNode -TargetIp $targetIp -ControlServerUrl $controlUrl
$physicalArtifact = Find-ArtifactByRole -Artifacts $artifacts -Role "physical_peer_evidence"
$physicalEvidence = Read-JsonFile -Path (Get-StringProperty -Value $physicalArtifact -Name "evidence_path")
Add-ArchivedPeerIdentityBindingCheck -Checks $checks -RouteEvidence $routeEvidence -PhysicalEvidence $physicalEvidence -TargetNode $targetNode -TargetIp $targetIp
Add-ArchivedPhysicalEvidenceReleaseTimeBindingCheck -Checks $checks -Verification $verification -PhysicalEvidence $physicalEvidence -TargetNode $targetNode -TargetIp $targetIp -ControlServerUrl $controlUrl

$failed = @($checks | Where-Object { -not [bool]$_.ok })
$result = [ordered]@{
    schema = "musu.private_mesh_release_proof_archive_verification.v1"
    ok = ($failed.Count -eq 0)
    checked_at = (Get-Date).ToString("o")
    archive_manifest_path = $resolvedArchiveManifestPath
    target_node = $targetNode
    target_ip = $targetIp
    expected_control_server_url = $controlUrl
    desktop_runtime_kind = $archiveRuntimeKind
    desktop_runtime_packaged = $archiveRuntimePackaged
    desktop_runtime_exe_path = Get-StringProperty -Value $archiveManifest -Name "desktop_runtime_exe_path"
    desktop_runtime_exe_sha256 = Get-StringProperty -Value $archiveManifest -Name "desktop_runtime_exe_sha256"
    fail_count = $failed.Count
    checks = @($checks)
    next_action = if ($failed.Count -eq 0) {
        "Archive is self-consistent, integrity-checked, and current-toolchain verified."
    } else {
        "Do not accept this Private Mesh release proof archive. Re-run the release proof with the current verifier toolchain."
    }
}

if ($Json) {
    $result | ConvertTo-Json -Depth 80
} else {
    if ([bool]$result.ok) {
        Write-Step "Private Mesh release proof archive verified: $resolvedArchiveManifestPath"
    } else {
        Write-Step "Private Mesh release proof archive failed ($($failed.Count) failed checks): $resolvedArchiveManifestPath"
    }
}

if (-not [bool]$result.ok) {
    exit 1
}
