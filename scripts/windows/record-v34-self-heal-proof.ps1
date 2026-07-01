[CmdletBinding()]
param(
    [string]$Version,
    [string]$ExpectedPackageVersion,
    [string]$OutputRoot,

    [Parameter(Mandatory = $true)][string]$SourceNodeName,
    [Parameter(Mandatory = $true)][string]$TargetNodeName,
    [Parameter(Mandatory = $true)][string]$SelectedCandidateAddr,
    [Parameter(Mandatory = $true)][string]$RouteEvidencePath,
    [Parameter(Mandatory = $true)][string]$TtlSourceEvidencePath,
    [Parameter(Mandatory = $true)][string]$BootSourceEvidencePath,

    [Parameter(Mandatory = $true)][string]$TtlStaleRowInjected,
    [Parameter(Mandatory = $true)][string]$TtlRegistryCurrentExcludesStaleRows,
    [Parameter(Mandatory = $true)][string]$TtlExpiredRowsHidden,
    [Parameter(Mandatory = $true)][int]$TtlStaleRowCountBefore,
    [Parameter(Mandatory = $true)][int]$TtlStaleRowCountAfter,
    [Parameter(Mandatory = $true)][int]$TtlHeartbeatTtlSec,
    [Parameter(Mandatory = $true)][string]$TtlStaleRowLastSeenAt,

    [Parameter(Mandatory = $true)][string]$BootCacheAvailable,
    [Parameter(Mandatory = $true)][string]$BootStaleManualPeerRemoved,
    [Parameter(Mandatory = $true)][string]$BootLanOnlyManualPeerPreserved,
    [Parameter(Mandatory = $true)][string]$BootSameNameCurrentCandidatePreserved,
    [Parameter(Mandatory = $true)][int]$BootManualPeerCountBefore,
    [Parameter(Mandatory = $true)][int]$BootManualPeerCountAfter,
    [Parameter(Mandatory = $true)][int]$BootPrunedManualPeerCount,

    [Parameter(Mandatory = $true)][string]$RoutePhysicalTwoNodeEvidence,
    [Parameter(Mandatory = $true)][string]$RouteStaleCandidateInjected,
    [Parameter(Mandatory = $true)][string]$RouteStaleCandidateWasFirst,
    [Parameter(Mandatory = $true)][string]$RouteSelectedReachableCandidateBeforeStale,
    [Parameter(Mandatory = $true)][string]$RouteDuplicateTaskExecutionPrevented,
    [Parameter(Mandatory = $true)][string]$RouteChecked,
    [Parameter(Mandatory = $true)][int]$RouteTaskPostCount,

    [string]$Notes = "",
    [switch]$Json
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = (Resolve-Path (Join-Path $scriptDir "..\..")).Path

function Convert-PublicVersionToPackageVersion {
    param([Parameter(Mandatory = $true)][string]$PublicVersion)

    if ($PublicVersion -match '^(\d+)\.(\d+)\.(\d+)-rc\.(\d+)$') {
        return "$($Matches[1]).$($Matches[2]).$($Matches[3]).$($Matches[4])"
    }
    if ($PublicVersion -match '^\d+\.\d+\.\d+\.\d+$') {
        return $PublicVersion
    }
    throw "Cannot convert public version '$PublicVersion' to a 4-segment package version."
}

function Split-EndpointAddr {
    param([Parameter(Mandatory = $true)][string]$Addr)

    if ([string]::IsNullOrWhiteSpace($Addr)) {
        return $null
    }

    $trimmed = $Addr.Trim()
    $uri = $null
    if ([System.Uri]::TryCreate($trimmed, [System.UriKind]::Absolute, [ref]$uri) -and -not [string]::IsNullOrWhiteSpace($uri.Host)) {
        $uriPort = if ($uri.Port -ge 0) { [int]$uri.Port } else { $null }
        return [pscustomobject]@{
            host = $uri.Host
            port = $uriPort
        }
    }

    if ($trimmed -match '[/\\]') {
        return $null
    }

    $hostPart = $trimmed
    $port = $null
    if ($hostPart.StartsWith("[") -and $hostPart.Contains("]")) {
        $end = $hostPart.IndexOf("]")
        $rest = $hostPart.Substring($end + 1)
        $hostOnly = $hostPart.Substring(1, $end - 1)
        if ($rest -match '^:(\d+)$') {
            $parsedPort = 0
            if (-not [int]::TryParse($matches[1], [ref]$parsedPort)) {
                return $null
            }
            $port = $parsedPort
        } elseif (-not [string]::IsNullOrWhiteSpace($rest)) {
            return $null
        }
        $hostPart = $hostOnly
    } else {
        $firstColon = $hostPart.IndexOf(":")
        $lastColon = $hostPart.LastIndexOf(":")
        if ($firstColon -eq $lastColon -and $firstColon -gt 0) {
            $portText = $hostPart.Substring($firstColon + 1)
            if ($portText -notmatch '^\d+$') {
                return $null
            }
            $parsedPort = 0
            if (-not [int]::TryParse($portText, [ref]$parsedPort)) {
                return $null
            }
            $port = $parsedPort
            $hostPart = $hostPart.Substring(0, $firstColon)
        }
    }

    return [pscustomobject]@{
        host = $hostPart
        port = $port
    }
}

function Test-RoutableAddr {
    param([Parameter(Mandatory = $true)][string]$Addr)

    $endpoint = Split-EndpointAddr -Addr $Addr
    if ($null -eq $endpoint) {
        return $false
    }

    $hostPart = ([string]$endpoint.host).Trim().TrimEnd(".")
    if ([string]::IsNullOrWhiteSpace($hostPart)) {
        return $false
    }
    if ($null -ne $endpoint.port -and ([int]$endpoint.port -le 0 -or [int]$endpoint.port -gt 65535)) {
        return $false
    }

    $lower = $hostPart.ToLowerInvariant()
    if ($lower -in @("localhost", "0.0.0.0", "::", "::1", "127.0.0.1", "[::]", "[::1]")) {
        return $false
    }
    if ($lower.StartsWith("127.")) {
        return $false
    }
    $ip = $null
    if ([System.Net.IPAddress]::TryParse($hostPart, [ref]$ip)) {
        $normalizedIp = $ip
        if ($ip.IsIPv4MappedToIPv6) {
            $normalizedIp = $ip.MapToIPv4()
        }
        if ([System.Net.IPAddress]::IsLoopback($normalizedIp)) {
            return $false
        }
        if ($normalizedIp.Equals([System.Net.IPAddress]::Any) -or $normalizedIp.Equals([System.Net.IPAddress]::IPv6Any)) {
            return $false
        }
    }
    return $true
}

function Get-Prop {
    param($Object, [Parameter(Mandatory = $true)][string]$Name)

    if ($null -ne $Object -and $null -ne $Object.PSObject.Properties[$Name]) {
        return $Object.PSObject.Properties[$Name].Value
    }
    return $null
}

function Read-JsonEvidenceFile {
    param([Parameter(Mandatory = $true)][string]$Path)

    $resolved = (Resolve-Path -LiteralPath $Path).Path
    $json = Get-Content -LiteralPath $resolved -Raw | ConvertFrom-Json
    $hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $resolved).Hash.ToLowerInvariant()
    return [pscustomobject]@{
        path = $resolved
        sha256 = $hash
        json = $json
    }
}

function Convert-StrictBool {
    param(
        [Parameter(Mandatory = $true)]$Value,
        [Parameter(Mandatory = $true)][string]$Name
    )

    if ($Value -is [bool]) {
        return [bool]$Value
    }

    $text = ([string]$Value).Trim()
    $normalized = $text.ToLowerInvariant()
    if ($normalized -in @("true", "`$true", "1", "yes", "y")) {
        return $true
    }
    if ($normalized -in @("false", "`$false", "0", "no", "n")) {
        return $false
    }

    throw "Parameter '$Name' must be a boolean value. Use true/false, `$true/`$false, or 1/0."
}

if ([string]::IsNullOrWhiteSpace($Version)) {
    $Version = (Get-Content -LiteralPath (Join-Path $repoRoot "VERSION") -Raw).Trim()
}
if ([string]::IsNullOrWhiteSpace($ExpectedPackageVersion)) {
    $ExpectedPackageVersion = Convert-PublicVersionToPackageVersion -PublicVersion $Version
}
if ([string]::IsNullOrWhiteSpace($OutputRoot)) {
    $OutputRoot = Join-Path $repoRoot ("docs\evidence\v34-self-heal\{0}" -f $Version)
}

$TtlStaleRowInjected = Convert-StrictBool -Value $TtlStaleRowInjected -Name "TtlStaleRowInjected"
$TtlRegistryCurrentExcludesStaleRows = Convert-StrictBool -Value $TtlRegistryCurrentExcludesStaleRows -Name "TtlRegistryCurrentExcludesStaleRows"
$TtlExpiredRowsHidden = Convert-StrictBool -Value $TtlExpiredRowsHidden -Name "TtlExpiredRowsHidden"
$BootCacheAvailable = Convert-StrictBool -Value $BootCacheAvailable -Name "BootCacheAvailable"
$BootStaleManualPeerRemoved = Convert-StrictBool -Value $BootStaleManualPeerRemoved -Name "BootStaleManualPeerRemoved"
$BootLanOnlyManualPeerPreserved = Convert-StrictBool -Value $BootLanOnlyManualPeerPreserved -Name "BootLanOnlyManualPeerPreserved"
$BootSameNameCurrentCandidatePreserved = Convert-StrictBool -Value $BootSameNameCurrentCandidatePreserved -Name "BootSameNameCurrentCandidatePreserved"
$RoutePhysicalTwoNodeEvidence = Convert-StrictBool -Value $RoutePhysicalTwoNodeEvidence -Name "RoutePhysicalTwoNodeEvidence"
$RouteStaleCandidateInjected = Convert-StrictBool -Value $RouteStaleCandidateInjected -Name "RouteStaleCandidateInjected"
$RouteStaleCandidateWasFirst = Convert-StrictBool -Value $RouteStaleCandidateWasFirst -Name "RouteStaleCandidateWasFirst"
$RouteSelectedReachableCandidateBeforeStale = Convert-StrictBool -Value $RouteSelectedReachableCandidateBeforeStale -Name "RouteSelectedReachableCandidateBeforeStale"
$RouteDuplicateTaskExecutionPrevented = Convert-StrictBool -Value $RouteDuplicateTaskExecutionPrevented -Name "RouteDuplicateTaskExecutionPrevented"
$RouteChecked = Convert-StrictBool -Value $RouteChecked -Name "RouteChecked"

$resolvedRouteEvidencePath = (Resolve-Path -LiteralPath $RouteEvidencePath).Path
$routeEvidence = Get-Content -LiteralPath $resolvedRouteEvidencePath -Raw | ConvertFrom-Json
$routeEvidenceHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $resolvedRouteEvidencePath).Hash.ToLowerInvariant()
$ttlSourceEvidence = Read-JsonEvidenceFile -Path $TtlSourceEvidencePath
$bootSourceEvidence = Read-JsonEvidenceFile -Path $BootSourceEvidencePath
$generatedAt = [datetimeoffset]::Now
$staleRowLastSeenAt = [datetimeoffset]::Parse($TtlStaleRowLastSeenAt)

$routeEvidenceSchema = [string](Get-Prop $routeEvidence "schema")
$routeEvidenceResult = [string](Get-Prop $routeEvidence "result")
$routeEvidenceCandidate = [string](Get-Prop $routeEvidence "candidate_addr")
$nodePairDistinct = $SourceNodeName -ne $TargetNodeName
$routeEvidenceCandidateMatches = (
    -not [string]::IsNullOrWhiteSpace($routeEvidenceCandidate) -and
    $routeEvidenceCandidate -eq $SelectedCandidateAddr
)
$ttlSourceMatches = (
    [string](Get-Prop $ttlSourceEvidence.json "schema") -eq "musu.v34_ttl_prune_source.v1" -and
    [bool](Get-Prop $ttlSourceEvidence.json "stale_row_injected") -eq [bool]$TtlStaleRowInjected -and
    [bool](Get-Prop $ttlSourceEvidence.json "registry_current_excludes_stale_rows") -eq [bool]$TtlRegistryCurrentExcludesStaleRows -and
    [bool](Get-Prop $ttlSourceEvidence.json "expired_rows_hidden") -eq [bool]$TtlExpiredRowsHidden -and
    [int](Get-Prop $ttlSourceEvidence.json "stale_row_count_before") -eq [int]$TtlStaleRowCountBefore -and
    [int](Get-Prop $ttlSourceEvidence.json "stale_row_count_after") -eq [int]$TtlStaleRowCountAfter -and
    [int](Get-Prop $ttlSourceEvidence.json "heartbeat_ttl_sec") -eq [int]$TtlHeartbeatTtlSec -and
    [string](Get-Prop $ttlSourceEvidence.json "stale_row_last_seen_at") -eq $staleRowLastSeenAt.ToString("o")
)
$bootSourceMatches = (
    [string](Get-Prop $bootSourceEvidence.json "schema") -eq "musu.v34_boot_reconcile_source.v1" -and
    [bool](Get-Prop $bootSourceEvidence.json "cache_available") -eq [bool]$BootCacheAvailable -and
    [bool](Get-Prop $bootSourceEvidence.json "stale_manual_peer_removed") -eq [bool]$BootStaleManualPeerRemoved -and
    [bool](Get-Prop $bootSourceEvidence.json "lan_only_manual_peer_preserved") -eq [bool]$BootLanOnlyManualPeerPreserved -and
    [bool](Get-Prop $bootSourceEvidence.json "same_name_current_candidate_preserved") -eq [bool]$BootSameNameCurrentCandidatePreserved -and
    [int](Get-Prop $bootSourceEvidence.json "manual_peer_count_before") -eq [int]$BootManualPeerCountBefore -and
    [int](Get-Prop $bootSourceEvidence.json "manual_peer_count_after") -eq [int]$BootManualPeerCountAfter -and
    [int](Get-Prop $bootSourceEvidence.json "pruned_manual_peer_count") -eq [int]$BootPrunedManualPeerCount
)

$ttlPruneOk = (
    $TtlStaleRowInjected -and
    $TtlRegistryCurrentExcludesStaleRows -and
    $TtlExpiredRowsHidden -and
    $TtlStaleRowCountBefore -ge 1 -and
    $TtlStaleRowCountAfter -eq 0 -and
    $TtlHeartbeatTtlSec -ge 60 -and
    $ttlSourceMatches
)
$bootReconcileOk = (
    $BootCacheAvailable -and
    $BootStaleManualPeerRemoved -and
    $BootLanOnlyManualPeerPreserved -and
    $BootSameNameCurrentCandidatePreserved -and
    $BootManualPeerCountBefore -ge 1 -and
    $BootPrunedManualPeerCount -ge 1 -and
    $bootSourceMatches
)
$staleCandidateE2eOk = (
    $RoutePhysicalTwoNodeEvidence -and
    $RouteStaleCandidateInjected -and
    $RouteStaleCandidateWasFirst -and
    $RouteSelectedReachableCandidateBeforeStale -and
    $RouteDuplicateTaskExecutionPrevented -and
    $RouteChecked -and
    $RouteTaskPostCount -eq 1 -and
    (Test-RoutableAddr -Addr $SelectedCandidateAddr) -and
    $nodePairDistinct -and
    $routeEvidenceCandidateMatches -and
    $routeEvidenceSchema -eq "musu.route_evidence.v1" -and
    $routeEvidenceResult -eq "success"
)

New-Item -ItemType Directory -Force -Path $OutputRoot | Out-Null

$safeSource = $SourceNodeName -replace "[^A-Za-z0-9._-]", "_"
$safeTarget = $TargetNodeName -replace "[^A-Za-z0-9._-]", "_"
$stamp = $generatedAt.ToString("yyyyMMdd-HHmmss")
$baseName = "$stamp-$safeSource-to-$safeTarget"
$evidencePath = Join-Path $OutputRoot "$baseName.v34-self-heal-proof.json"
$verificationPath = Join-Path $OutputRoot "$baseName.v34-self-heal-verification.json"
$summaryPath = Join-Path $OutputRoot "$baseName.summary.md"

$evidence = [pscustomobject]@{
    schema = "musu.v34_self_heal_proof.v1"
    ok = [bool]($ttlPruneOk -and $bootReconcileOk -and $staleCandidateE2eOk)
    version = $Version
    package_version = $ExpectedPackageVersion
    generated_at = $generatedAt.ToString("o")
    operator_machine = $env:COMPUTERNAME
    operator_user = $env:USERNAME
    ttl_prune_ok = [bool]$ttlPruneOk
    boot_reconcile_ok = [bool]$bootReconcileOk
    stale_candidate_e2e_ok = [bool]$staleCandidateE2eOk
    ttl_prune = [pscustomobject]@{
        stale_row_injected = [bool]$TtlStaleRowInjected
        registry_current_excludes_stale_rows = [bool]$TtlRegistryCurrentExcludesStaleRows
        expired_rows_hidden = [bool]$TtlExpiredRowsHidden
        stale_row_count_before = [int]$TtlStaleRowCountBefore
        stale_row_count_after = [int]$TtlStaleRowCountAfter
        heartbeat_ttl_sec = [int]$TtlHeartbeatTtlSec
        stale_row_last_seen_at = $staleRowLastSeenAt.ToString("o")
    }
    boot_reconcile = [pscustomobject]@{
        cache_available = [bool]$BootCacheAvailable
        manual_peer_count_before = [int]$BootManualPeerCountBefore
        manual_peer_count_after = [int]$BootManualPeerCountAfter
        pruned_manual_peer_count = [int]$BootPrunedManualPeerCount
        stale_manual_peer_removed = [bool]$BootStaleManualPeerRemoved
        lan_only_manual_peer_preserved = [bool]$BootLanOnlyManualPeerPreserved
        same_name_current_candidate_preserved = [bool]$BootSameNameCurrentCandidatePreserved
    }
    route_preflight = [pscustomobject]@{
        physical_two_node_evidence = [bool]$RoutePhysicalTwoNodeEvidence
        source_node_name = $SourceNodeName
        target_node_name = $TargetNodeName
        stale_candidate_injected = [bool]$RouteStaleCandidateInjected
        stale_candidate_was_first = [bool]$RouteStaleCandidateWasFirst
        selected_reachable_candidate_before_stale = [bool]$RouteSelectedReachableCandidateBeforeStale
        duplicate_task_execution_prevented = [bool]$RouteDuplicateTaskExecutionPrevented
        task_post_count = [int]$RouteTaskPostCount
        route_checked = [bool]$RouteChecked
        selected_candidate_addr = $SelectedCandidateAddr
        route_evidence = $routeEvidence
    }
    source_evidence = [pscustomobject]@{
        route_evidence_path = $resolvedRouteEvidencePath
        route_evidence_sha256 = $routeEvidenceHash
        route_evidence_candidate_addr = $routeEvidenceCandidate
        route_evidence_candidate_matches_selected = [bool]$routeEvidenceCandidateMatches
        node_pair_distinct = [bool]$nodePairDistinct
        ttl_source_evidence_path = $ttlSourceEvidence.path
        ttl_source_evidence_sha256 = $ttlSourceEvidence.sha256
        ttl_source_evidence_matches_parameters = [bool]$ttlSourceMatches
        ttl_source_evidence = $ttlSourceEvidence.json
        boot_source_evidence_path = $bootSourceEvidence.path
        boot_source_evidence_sha256 = $bootSourceEvidence.sha256
        boot_source_evidence_matches_parameters = [bool]$bootSourceMatches
        boot_source_evidence = $bootSourceEvidence.json
    }
    notes = $Notes
}

$evidence | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath $evidencePath -Encoding UTF8

$verifyScript = Join-Path $scriptDir "verify-v34-self-heal-proof.ps1"
$verifyText = (& powershell -NoProfile -ExecutionPolicy Bypass -File $verifyScript -EvidencePath $evidencePath -ExpectedVersion $Version -ExpectedPackageVersion $ExpectedPackageVersion -Json 2>&1 | Out-String).Trim()
if ($LASTEXITCODE -ne 0) {
    throw "V34 self-heal evidence did not verify.`n$verifyText"
}
$verification = $verifyText | ConvertFrom-Json
$verification | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $verificationPath -Encoding UTF8

$evidenceHash = Get-FileHash -Algorithm SHA256 -LiteralPath $evidencePath
$verificationHash = Get-FileHash -Algorithm SHA256 -LiteralPath $verificationPath

$summary = @"
# MUSU V34 Self-Heal Proof

- Version: $Version
- Verified: $($verification.ok)
- Source node: $SourceNodeName
- Target node: $TargetNodeName
- Selected candidate: $SelectedCandidateAddr
- TTL prune ok: $ttlPruneOk
- Boot reconcile ok: $bootReconcileOk
- Stale-candidate E2E ok: $staleCandidateE2eOk
- Route evidence: $resolvedRouteEvidencePath
- Route evidence SHA256: $($routeEvidenceHash.ToLowerInvariant())
- TTL source evidence: $($ttlSourceEvidence.path)
- TTL source evidence SHA256: $($ttlSourceEvidence.sha256)
- Boot source evidence: $($bootSourceEvidence.path)
- Boot source evidence SHA256: $($bootSourceEvidence.sha256)
- Evidence: $([System.IO.Path]::GetFileName($evidencePath))
- Evidence SHA256: $($evidenceHash.Hash.ToLowerInvariant())
- Verification: $([System.IO.Path]::GetFileName($verificationPath))
- Verification SHA256: $($verificationHash.Hash.ToLowerInvariant())
- Recorded at: $($generatedAt.ToString("o"))

This file records physical V34 stale registry/cache/manual-peer self-heal
evidence. It is not a synthetic proof: the route evidence path must come from a
real route preflight on two distinct physical nodes.
"@
$summary | Set-Content -LiteralPath $summaryPath -Encoding UTF8

$result = [pscustomobject]@{
    ok = $true
    version = $Version
    output_root = (Resolve-Path -LiteralPath $OutputRoot).Path
    evidence_path = (Resolve-Path -LiteralPath $evidencePath).Path
    evidence_sha256 = $evidenceHash.Hash.ToLowerInvariant()
    verification_path = (Resolve-Path -LiteralPath $verificationPath).Path
    verification_sha256 = $verificationHash.Hash.ToLowerInvariant()
    summary_path = (Resolve-Path -LiteralPath $summaryPath).Path
    source_node_name = $SourceNodeName
    target_node_name = $TargetNodeName
    selected_candidate_addr = $SelectedCandidateAddr
}

if ($Json) {
    $result | ConvertTo-Json -Depth 8
}
else {
    $result
}
