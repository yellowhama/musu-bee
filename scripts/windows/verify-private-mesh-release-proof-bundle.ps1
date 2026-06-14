[CmdletBinding()]
param(
    [string]$EvidenceRoot,
    [string]$VerificationPath,
    [string]$ExpectedTargetNode,
    [string]$ExpectedTargetIp,
    [string]$ExpectedControlServerUrl,
    [string]$ManifestPath,
    [switch]$Json
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$ReleaseBundleContract = "musu.private_mesh_release_bundle_contract.v20260614_toolchain_bound"
$PhysicalPeerEvidenceMaxAgeSeconds = 86400
$PhysicalPeerEvidenceFutureSkewSeconds = 300

function Write-Step([string]$Message) {
    if (-not $Json) {
        Write-Host "==> $Message"
    }
}

function Resolve-ReleaseVerificationPath {
    if (-not [string]::IsNullOrWhiteSpace($VerificationPath)) {
        return (Resolve-Path -LiteralPath $VerificationPath).Path
    }
    if ([string]::IsNullOrWhiteSpace($EvidenceRoot)) {
        throw "Pass -EvidenceRoot or -VerificationPath."
    }
    $root = (Resolve-Path -LiteralPath $EvidenceRoot).Path
    $path = Join-Path $root "private-mesh-release-proof.verification.json"
    if (-not (Test-Path -LiteralPath $path)) {
        throw "Release proof verification file not found: $path"
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

function Add-IntegrityCheck {
    param(
        [System.Collections.Generic.List[object]]$Checks,
        [string]$Name,
        [string]$Path
    )
    if ([string]::IsNullOrWhiteSpace($Path) -or -not (Test-Path -LiteralPath $Path)) {
        Add-Check -Checks $Checks -Name $Name -Ok $false -Message "missing evidence file" -Evidence $Path
        return
    }
    $resolved = (Resolve-Path -LiteralPath $Path).Path
    $integrity = Test-EvidenceIntegritySidecar -EvidencePath $resolved
    Add-Check -Checks $Checks -Name $Name -Ok ([bool]$integrity.ok) -Message ([string]$integrity.message) -Evidence $integrity
}

function Add-PhysicalEvidenceTargetBindingCheck {
    param(
        [System.Collections.Generic.List[object]]$Checks,
        [string]$Path,
        [string]$TargetNode,
        [string]$TargetIp,
        [string]$ControlServerUrl,
        [object]$ReleaseCompletedAt
    )
    if ([string]::IsNullOrWhiteSpace($Path) -or -not (Test-Path -LiteralPath $Path)) {
        Add-Check -Checks $Checks -Name "physical peer evidence target binding" -Ok $false -Message "missing physical peer evidence file" -Evidence $Path
        return
    }
    $physical = Read-JsonFile -Path $Path
    $schema = Get-StringProperty -Value $physical -Name "schema"
    $nodeName = Get-StringProperty -Value $physical -Name "node_name"
    $tailnetIp = Get-StringProperty -Value $physical -Name "tailnet_ip"
    $evidenceControlUrl = Get-StringProperty -Value $physical -Name "control_server_url"
    $hostname = Get-StringProperty -Value $physical -Name "hostname"
    $generatedAt = Get-DateTimeOffsetProperty -Value $physical -Name "generated_at"
    $controlUrlMatches = [string]::IsNullOrWhiteSpace($ControlServerUrl) -or
        ($evidenceControlUrl.TrimEnd("/") -eq $ControlServerUrl.TrimEnd("/"))
    $generatedAtFresh = ($null -ne $generatedAt) -and
        ($null -ne $ReleaseCompletedAt) -and
        ($generatedAt -ge $ReleaseCompletedAt.AddSeconds(-1 * $PhysicalPeerEvidenceMaxAgeSeconds)) -and
        ($generatedAt -le $ReleaseCompletedAt.AddSeconds($PhysicalPeerEvidenceFutureSkewSeconds))
    $ok = ($schema -eq "musu.private_mesh_physical_peer_evidence.v1") -and
        (Get-BoolProperty -Value $physical -Name "physical_peer_verified") -and
        (Get-BoolProperty -Value $physical -Name "control_server_verified") -and
        (-not [string]::IsNullOrWhiteSpace($hostname)) -and
        $generatedAtFresh -and
        ($nodeName.ToLowerInvariant() -eq $TargetNode.ToLowerInvariant()) -and
        ($tailnetIp -eq $TargetIp) -and
        $controlUrlMatches
    Add-Check -Checks $Checks -Name "physical peer evidence target binding" -Ok $ok -Message "physical peer evidence must match target node/IP/control server, include target hostname, and be generated within 24 hours of release proof completed_at" -Evidence @{
        expected_node = $TargetNode
        actual_node = $nodeName
        expected_ip = $TargetIp
        actual_ip = $tailnetIp
        expected_control_server_url = $ControlServerUrl
        actual_control_server_url = $evidenceControlUrl
        target_hostname = $hostname
        generated_at = Get-StringProperty -Value $physical -Name "generated_at"
        release_completed_at = if ($null -eq $ReleaseCompletedAt) { "" } else { $ReleaseCompletedAt.ToString("o") }
        generated_at_fresh = $generatedAtFresh
        max_age_seconds = $PhysicalPeerEvidenceMaxAgeSeconds
        future_skew_seconds = $PhysicalPeerEvidenceFutureSkewSeconds
        schema = $schema
        physical_peer_verified = Get-BoolProperty -Value $physical -Name "physical_peer_verified"
        control_server_verified = Get-BoolProperty -Value $physical -Name "control_server_verified"
    }
}

function Add-NativePeerIdentityTargetBindingCheck {
    param(
        [System.Collections.Generic.List[object]]$Checks,
        [object]$PeerIdentity,
        [string]$TargetNode,
        [string]$TargetIp
    )
    $schema = Get-StringProperty -Value $PeerIdentity -Name "schema"
    $identityTargetNode = Get-StringProperty -Value $PeerIdentity -Name "target_node"
    $identityTargetIp = Get-StringProperty -Value $PeerIdentity -Name "target_ip"
    $targetUrlHost = Get-StringProperty -Value $PeerIdentity -Name "target_url_host"
    $sourceHostname = Get-StringProperty -Value $PeerIdentity -Name "source_hostname"
    $targetHostname = Get-StringProperty -Value $PeerIdentity -Name "target_hostname"
    $targetUrlHostMatches = [string]::IsNullOrWhiteSpace($targetUrlHost) -or ($targetUrlHost -eq $TargetIp)
    $ok = ($schema -eq "musu.private_mesh_peer_identity.v1") -and
        ($identityTargetNode.ToLowerInvariant() -eq $TargetNode.ToLowerInvariant()) -and
        ($identityTargetIp -eq $TargetIp) -and
        (Get-BoolProperty -Value $PeerIdentity -Name "node_distinct") -and
        (Get-BoolProperty -Value $PeerIdentity -Name "tailnet_ip_distinct") -and
        (-not [string]::IsNullOrWhiteSpace($sourceHostname)) -and
        (-not [string]::IsNullOrWhiteSpace($targetHostname)) -and
        (Get-BoolProperty -Value $PeerIdentity -Name "physical_host_distinct") -and
        (Get-BoolProperty -Value $PeerIdentity -Name "target_url_host_matches_target_ip") -and
        $targetUrlHostMatches -and
        (Get-BoolProperty -Value $PeerIdentity -Name "release_identity_bound") -and
        (Get-BoolProperty -Value $PeerIdentity -Name "physical_peer_verified")
    Add-Check -Checks $Checks -Name "native peer identity target binding" -Ok $ok -Message "native peer_identity must match target node/IP, include distinct physical hostnames, and be release-bound" -Evidence @{
        expected_node = $TargetNode
        actual_node = $identityTargetNode
        expected_ip = $TargetIp
        actual_ip = $identityTargetIp
        target_url_host = $targetUrlHost
        source_hostname = $sourceHostname
        target_hostname = $targetHostname
        schema = $schema
        node_distinct = Get-BoolProperty -Value $PeerIdentity -Name "node_distinct"
        tailnet_ip_distinct = Get-BoolProperty -Value $PeerIdentity -Name "tailnet_ip_distinct"
        physical_host_distinct = Get-BoolProperty -Value $PeerIdentity -Name "physical_host_distinct"
        target_url_host_matches_target_ip = Get-BoolProperty -Value $PeerIdentity -Name "target_url_host_matches_target_ip"
        release_identity_bound = Get-BoolProperty -Value $PeerIdentity -Name "release_identity_bound"
        physical_peer_verified = Get-BoolProperty -Value $PeerIdentity -Name "physical_peer_verified"
    }
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
    Add-Check -Checks $Checks -Name "private mesh route transport" -Ok $ok -Message "route evidence must prove successful MUSU Headscale/Tailnet WireGuard overlay delivery to the target IP, bound to the expected MUSU control server, without MUSU infra transit" -Evidence @{
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

function Add-PhysicalNativeHostnameConsistencyCheck {
    param(
        [System.Collections.Generic.List[object]]$Checks,
        [string]$PhysicalEvidencePath,
        [object]$PeerIdentity
    )
    if ([string]::IsNullOrWhiteSpace($PhysicalEvidencePath) -or -not (Test-Path -LiteralPath $PhysicalEvidencePath)) {
        Add-Check -Checks $Checks -Name "physical/native hostname consistency" -Ok $false -Message "missing physical peer evidence file" -Evidence $PhysicalEvidencePath
        return
    }
    $physical = Read-JsonFile -Path $PhysicalEvidencePath
    $physicalHostname = Get-StringProperty -Value $physical -Name "hostname"
    $identityTargetHostname = Get-StringProperty -Value $PeerIdentity -Name "target_hostname"
    $ok = (-not [string]::IsNullOrWhiteSpace($physicalHostname)) -and
        (-not [string]::IsNullOrWhiteSpace($identityTargetHostname)) -and
        ($physicalHostname.Trim().ToLowerInvariant() -eq $identityTargetHostname.Trim().ToLowerInvariant())
    Add-Check -Checks $Checks -Name "physical/native hostname consistency" -Ok $ok -Message "physical peer evidence hostname must match native peer_identity target_hostname" -Evidence @{
        physical_hostname = $physicalHostname
        native_peer_identity_target_hostname = $identityTargetHostname
    }
}

function Add-ReleaseToolHashChecks {
    param(
        [System.Collections.Generic.List[object]]$Checks,
        [object]$ToolHashes
    )
    $expectedSchema = "musu.private_mesh_release_proof_tool_hashes.v1"
    $schema = Get-StringProperty -Value $ToolHashes -Name "schema"
    Add-Check -Checks $Checks -Name "release tool hashes schema" -Ok ($schema -eq $expectedSchema) -Message "runner must record release proof tool SHA256 hashes" -Evidence $schema

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
        Add-Check -Checks $Checks -Name "release tool hash $($entry.Key)" -Ok $ok -Message "recorded release proof tool hash must match current verifier toolchain" -Evidence @{
            tool = $entry.Key
            path = $path
            recorded_sha256 = $recordedHash
            current_sha256 = $actualHash
        }
    }
}

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
. (Join-Path $scriptDir "evidence-integrity.ps1")

$resolvedVerificationPath = Resolve-ReleaseVerificationPath
$resolvedRoot = Split-Path -Parent $resolvedVerificationPath
if ([string]::IsNullOrWhiteSpace($ManifestPath)) {
    $ManifestPath = Join-Path $resolvedRoot "private-mesh-release-proof.bundle-manifest.json"
}

$checks = [System.Collections.Generic.List[object]]::new()
$runner = Read-JsonFile -Path $resolvedVerificationPath

Add-Check -Checks $checks -Name "runner verification exists" -Ok ($null -ne $runner) -Message "runner verification JSON is readable" -Evidence $resolvedVerificationPath
Add-IntegrityCheck -Checks $checks -Name "runner verification sha256" -Path $resolvedVerificationPath

$schema = Get-StringProperty -Value $runner -Name "schema"
Add-Check -Checks $checks -Name "runner schema" -Ok ($schema -eq "musu.private_mesh_release_proof_runner.v1") -Message "runner schema must be musu.private_mesh_release_proof_runner.v1" -Evidence $schema
Add-Check -Checks $checks -Name "runner ok" -Ok (Get-BoolProperty -Value $runner -Name "ok") -Message "runner ok must be true"
$releaseCompletedAt = Get-DateTimeOffsetProperty -Value $runner -Name "completed_at"
Add-Check -Checks $checks -Name "runner completed_at" -Ok ($null -ne $releaseCompletedAt) -Message "runner completed_at must be valid RFC3339 so physical evidence freshness is replayable" -Evidence (Get-StringProperty -Value $runner -Name "completed_at")
Add-Check -Checks $checks -Name "software route trusted" -Ok (Get-BoolProperty -Value $runner -Name "software_route_trusted") -Message "software route trust must be true"
Add-Check -Checks $checks -Name "release identity bound" -Ok (Get-BoolProperty -Value $runner -Name "release_identity_bound") -Message "release identity must be bound to the claimed peer"
Add-Check -Checks $checks -Name "physical peer verified" -Ok (Get-BoolProperty -Value $runner -Name "physical_peer_verified") -Message "target-generated physical peer evidence must be accepted"
Add-Check -Checks $checks -Name "release evidence trusted" -Ok (Get-BoolProperty -Value $runner -Name "release_evidence_trusted") -Message "final release_evidence_trusted must be true"
Add-Check -Checks $checks -Name "release bundle contract" -Ok ((Get-StringProperty -Value $runner -Name "release_bundle_contract") -eq $ReleaseBundleContract) -Message "runner must use the current release bundle contract" -Evidence @{
    expected = $ReleaseBundleContract
    actual = Get-StringProperty -Value $runner -Name "release_bundle_contract"
}
$desktopRuntimeKind = Get-StringProperty -Value $runner -Name "desktop_runtime_kind"
$desktopRuntimePackaged = Get-BoolProperty -Value $runner -Name "desktop_runtime_packaged"
$desktopRuntimeExePath = Get-StringProperty -Value $runner -Name "desktop_runtime_exe_path"
$desktopRuntimeExeSha256 = Get-StringProperty -Value $runner -Name "desktop_runtime_exe_sha256"
Add-Check -Checks $checks -Name "desktop runtime scope recorded" -Ok (-not [string]::IsNullOrWhiteSpace($desktopRuntimeKind)) -Message "release proof must record whether it came from packaged desktop runtime or an external CLI runner" -Evidence @{
    desktop_runtime_kind = $desktopRuntimeKind
    desktop_runtime_packaged = $desktopRuntimePackaged
    desktop_runtime_exe_path = $desktopRuntimeExePath
    desktop_runtime_exe_sha256 = $desktopRuntimeExeSha256
}
Add-ReleaseToolHashChecks -Checks $checks -ToolHashes (Get-PropertyValue -Value $runner -Name "release_tool_hashes")

$targetNode = Get-StringProperty -Value $runner -Name "target_node"
$targetIp = Get-StringProperty -Value $runner -Name "target_ip"
$controlUrl = Get-StringProperty -Value $runner -Name "expected_control_server_url"
if (-not [string]::IsNullOrWhiteSpace($ExpectedTargetNode)) {
    Add-Check -Checks $checks -Name "target node matches expectation" -Ok ($targetNode -eq $ExpectedTargetNode) -Message "target node must match expected value" -Evidence @{ expected = $ExpectedTargetNode; actual = $targetNode }
}
if (-not [string]::IsNullOrWhiteSpace($ExpectedTargetIp)) {
    Add-Check -Checks $checks -Name "target ip matches expectation" -Ok ($targetIp -eq $ExpectedTargetIp) -Message "target IP must match expected value" -Evidence @{ expected = $ExpectedTargetIp; actual = $targetIp }
}
if (-not [string]::IsNullOrWhiteSpace($ExpectedControlServerUrl)) {
    Add-Check -Checks $checks -Name "control server matches expectation" -Ok ($controlUrl.TrimEnd("/") -eq $ExpectedControlServerUrl.TrimEnd("/")) -Message "control server URL must match expected value" -Evidence @{ expected = $ExpectedControlServerUrl; actual = $controlUrl }
}

$routeEvidencePath = Get-StringProperty -Value $runner -Name "evidence_path"
$physicalEvidencePath = Get-StringProperty -Value $runner -Name "physical_peer_evidence_path"
$nativeEvidencePath = Get-StringProperty -Value $runner -Name "native_release_evidence_path"
$nativeVerificationPath = Get-StringProperty -Value $runner -Name "native_verification_path"

Add-IntegrityCheck -Checks $checks -Name "route evidence sha256" -Path $routeEvidencePath
Add-IntegrityCheck -Checks $checks -Name "physical peer evidence sha256" -Path $physicalEvidencePath
Add-IntegrityCheck -Checks $checks -Name "native release evidence sha256" -Path $nativeEvidencePath
Add-IntegrityCheck -Checks $checks -Name "native verification sha256" -Path $nativeVerificationPath
$routeEvidence = Read-JsonFile -Path $routeEvidencePath
Add-PrivateMeshRouteTransportCheck -Checks $checks -RouteEvidence $routeEvidence -TargetIp $targetIp -ControlServerUrl $controlUrl
Add-PhysicalEvidenceTargetBindingCheck -Checks $checks -Path $physicalEvidencePath -TargetNode $targetNode -TargetIp $targetIp -ControlServerUrl $controlUrl -ReleaseCompletedAt $releaseCompletedAt

$nativeReport = Read-JsonFile -Path $nativeVerificationPath
$nativeEvidence = Read-JsonFile -Path $nativeEvidencePath
$nativeSchema = Get-StringProperty -Value $nativeReport -Name "schema"
Add-Check -Checks $checks -Name "native release proof schema" -Ok ($nativeSchema -eq "musu.private_mesh_release_proof.v1") -Message "native release proof schema must be musu.private_mesh_release_proof.v1" -Evidence $nativeSchema
Add-Check -Checks $checks -Name "native release proof ok" -Ok (Get-BoolProperty -Value $nativeReport -Name "ok") -Message "native release proof ok must be true"
Add-Check -Checks $checks -Name "native evidence ok" -Ok (Get-BoolProperty -Value $nativeEvidence -Name "ok") -Message "native route/callback evidence ok must be true"

$peerIdentity = Get-PropertyValue -Value $nativeEvidence -Name "peer_identity"
Add-NativePeerIdentityTargetBindingCheck -Checks $checks -PeerIdentity $peerIdentity -TargetNode $targetNode -TargetIp $targetIp
Add-PhysicalNativeHostnameConsistencyCheck -Checks $checks -PhysicalEvidencePath $physicalEvidencePath -PeerIdentity $peerIdentity
Add-Check -Checks $checks -Name "native peer identity bound" -Ok (Get-BoolProperty -Value $peerIdentity -Name "release_identity_bound") -Message "native peer identity must be bound"
Add-Check -Checks $checks -Name "native physical peer verified" -Ok (Get-BoolProperty -Value $peerIdentity -Name "physical_peer_verified") -Message "native physical peer evidence must be verified"

$failed = @($checks | Where-Object { -not [bool]$_.ok })
$artifacts = [ordered]@{
    runner_verification = $resolvedVerificationPath
    runner_verification_sha256 = Get-EvidenceIntegritySidecarPath -EvidencePath $resolvedVerificationPath
    route_evidence = $routeEvidencePath
    route_evidence_sha256 = if ($routeEvidencePath) { Get-EvidenceIntegritySidecarPath -EvidencePath $routeEvidencePath } else { "" }
    physical_peer_evidence = $physicalEvidencePath
    physical_peer_evidence_sha256 = if ($physicalEvidencePath) { Get-EvidenceIntegritySidecarPath -EvidencePath $physicalEvidencePath } else { "" }
    native_release_evidence = $nativeEvidencePath
    native_release_evidence_sha256 = if ($nativeEvidencePath) { Get-EvidenceIntegritySidecarPath -EvidencePath $nativeEvidencePath } else { "" }
    native_verification = $nativeVerificationPath
    native_verification_sha256 = if ($nativeVerificationPath) { Get-EvidenceIntegritySidecarPath -EvidencePath $nativeVerificationPath } else { "" }
}

$manifest = [ordered]@{
    schema = "musu.private_mesh_release_proof_bundle.v1"
    ok = ($failed.Count -eq 0)
    checked_at = (Get-Date).ToString("o")
    evidence_root = $resolvedRoot
    target_node = $targetNode
    target_ip = $targetIp
    expected_control_server_url = $controlUrl
    release_bundle_contract = $ReleaseBundleContract
    desktop_runtime_kind = $desktopRuntimeKind
    desktop_runtime_packaged = $desktopRuntimePackaged
    desktop_runtime_exe_path = $desktopRuntimeExePath
    desktop_runtime_exe_sha256 = $desktopRuntimeExeSha256
    release_evidence_trusted = Get-BoolProperty -Value $runner -Name "release_evidence_trusted"
    release_tool_hashes = Get-PropertyValue -Value $runner -Name "release_tool_hashes"
    fail_count = $failed.Count
    checks = @($checks)
    artifacts = $artifacts
    next_action = if ($failed.Count -eq 0) {
        "Archive this manifest, every listed artifact, and every listed SHA256 sidecar with the release evidence."
    } else {
        "Do not claim final Private Mesh release proof. Fix failed checks and rerun the strict physical release proof flow."
    }
}

$manifest | ConvertTo-Json -Depth 60 | Set-Content -LiteralPath $ManifestPath -Encoding utf8
Write-EvidenceIntegritySidecar -EvidencePath $ManifestPath | Out-Null

if ($Json) {
    Get-Content -LiteralPath $ManifestPath -Raw
} else {
    if ([bool]$manifest.ok) {
        Write-Step "Private Mesh release proof bundle verified: $ManifestPath"
    } else {
        Write-Step "Private Mesh release proof bundle failed ($($failed.Count) failed checks): $ManifestPath"
    }
}

if (-not [bool]$manifest.ok) {
    exit 1
}
