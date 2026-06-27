[CmdletBinding()]
param(
    [string]$Version,
    [string]$ExpectedPackageVersion,
    [string]$OutputRoot,

    [Parameter(Mandatory = $true)][string]$SourceNodeName,
    [Parameter(Mandatory = $true)][string]$TargetNodeName,
    [Parameter(Mandatory = $true)][string]$SelectedCandidateAddr,
    [Parameter(Mandatory = $true)][string]$RouteEvidencePath,

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

function Test-RoutableAddr {
    param([Parameter(Mandatory = $true)][string]$Addr)

    if ([string]::IsNullOrWhiteSpace($Addr)) {
        return $false
    }
    $hostPart = $Addr.Trim()
    if ($hostPart.StartsWith("[")) {
        $end = $hostPart.IndexOf("]")
        if ($end -gt 0) {
            $hostPart = $hostPart.Substring(1, $end - 1)
        }
    }
    elseif ($hostPart.Contains(":")) {
        $hostPart = ($hostPart -split ":")[0]
    }
    $lower = $hostPart.ToLowerInvariant()
    if ($lower -in @("localhost", "0.0.0.0", "::", "::1", "127.0.0.1", "[::]", "[::1]")) {
        return $false
    }
    if ($lower.StartsWith("127.")) {
        return $false
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

$ttlPruneOk = (
    $TtlStaleRowInjected -and
    $TtlRegistryCurrentExcludesStaleRows -and
    $TtlExpiredRowsHidden -and
    $TtlStaleRowCountBefore -ge 1 -and
    $TtlStaleRowCountAfter -eq 0 -and
    $TtlHeartbeatTtlSec -ge 60
)
$bootReconcileOk = (
    $BootCacheAvailable -and
    $BootStaleManualPeerRemoved -and
    $BootLanOnlyManualPeerPreserved -and
    $BootSameNameCurrentCandidatePreserved -and
    $BootManualPeerCountBefore -ge 1 -and
    $BootPrunedManualPeerCount -ge 1
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
        route_evidence_candidate_addr = $routeEvidenceCandidate
        route_evidence_candidate_matches_selected = [bool]$routeEvidenceCandidateMatches
        node_pair_distinct = [bool]$nodePairDistinct
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
