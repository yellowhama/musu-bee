[CmdletBinding()]
param(
    [string]$Version,
    [string]$OutputRoot,

    [Parameter(Mandatory = $true)][string]$TtlBeforeSnapshotPath,
    [Parameter(Mandatory = $true)][string]$TtlAfterSnapshotPath,
    [Parameter(Mandatory = $true)][string]$BootBeforeSnapshotPath,
    [Parameter(Mandatory = $true)][string]$BootAfterSnapshotPath,

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

    [string]$Notes = "",
    [switch]$Json
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = (Resolve-Path (Join-Path $scriptDir "..\..")).Path

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

function Read-Snapshot {
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

function Get-Prop {
    param($Object, [Parameter(Mandatory = $true)][string]$Name)

    if ($null -ne $Object -and $null -ne $Object.PSObject.Properties[$Name]) {
        return $Object.PSObject.Properties[$Name].Value
    }
    throw "Snapshot is missing required property '$Name'."
}

function Require-SnapshotSchema {
    param(
        [Parameter(Mandatory = $true)]$Snapshot,
        [Parameter(Mandatory = $true)][string]$ExpectedSchema,
        [Parameter(Mandatory = $true)][string]$Name
    )

    $actual = [string](Get-Prop -Object $Snapshot -Name "schema")
    if ($actual -ne $ExpectedSchema) {
        throw "$Name must use schema '$ExpectedSchema'; found '$actual'."
    }
}

function Require-BoolPropertyEquals {
    param(
        [Parameter(Mandatory = $true)]$Snapshot,
        [Parameter(Mandatory = $true)][string]$PropertyName,
        [Parameter(Mandatory = $true)][bool]$Expected,
        [Parameter(Mandatory = $true)][string]$Name
    )

    $actual = Convert-StrictBool -Value (Get-Prop -Object $Snapshot -Name $PropertyName) -Name "$Name.$PropertyName"
    if ($actual -ne $Expected) {
        throw "$Name.$PropertyName must be $Expected; found $actual."
    }
}

function Require-IntPropertyEquals {
    param(
        [Parameter(Mandatory = $true)]$Snapshot,
        [Parameter(Mandatory = $true)][string]$PropertyName,
        [Parameter(Mandatory = $true)][int]$Expected,
        [Parameter(Mandatory = $true)][string]$Name
    )

    $actual = [int](Get-Prop -Object $Snapshot -Name $PropertyName)
    if ($actual -ne $Expected) {
        throw "$Name.$PropertyName must be $Expected; found $actual."
    }
}

function Require-TimestampPropertyEquals {
    param(
        [Parameter(Mandatory = $true)]$Snapshot,
        [Parameter(Mandatory = $true)][string]$PropertyName,
        [Parameter(Mandatory = $true)][datetimeoffset]$Expected,
        [Parameter(Mandatory = $true)][string]$Name
    )

    $actual = [datetimeoffset]::Parse([string](Get-Prop -Object $Snapshot -Name $PropertyName))
    if ($actual.ToString("o") -ne $Expected.ToString("o")) {
        throw "$Name.$PropertyName must be $($Expected.ToString("o")); found $($actual.ToString("o"))."
    }
}

function Assert-TtlSnapshotContract {
    param(
        [Parameter(Mandatory = $true)]$Before,
        [Parameter(Mandatory = $true)]$After,
        [Parameter(Mandatory = $true)][bool]$StaleRowInjected,
        [Parameter(Mandatory = $true)][bool]$RegistryCurrentExcludesStaleRows,
        [Parameter(Mandatory = $true)][bool]$ExpiredRowsHidden,
        [Parameter(Mandatory = $true)][int]$StaleRowCountBefore,
        [Parameter(Mandatory = $true)][int]$StaleRowCountAfter,
        [Parameter(Mandatory = $true)][int]$HeartbeatTtlSec,
        [Parameter(Mandatory = $true)][datetimeoffset]$StaleRowLastSeenAt
    )

    Require-SnapshotSchema -Snapshot $Before -ExpectedSchema "musu.v34_ttl_snapshot.v1" -Name "TTL before snapshot"
    Require-SnapshotSchema -Snapshot $After -ExpectedSchema "musu.v34_ttl_snapshot.v1" -Name "TTL after snapshot"
    Require-BoolPropertyEquals -Snapshot $Before -PropertyName "stale_row_injected" -Expected $StaleRowInjected -Name "TTL before snapshot"
    Require-IntPropertyEquals -Snapshot $Before -PropertyName "stale_row_count" -Expected $StaleRowCountBefore -Name "TTL before snapshot"
    Require-IntPropertyEquals -Snapshot $After -PropertyName "stale_row_count" -Expected $StaleRowCountAfter -Name "TTL after snapshot"
    Require-IntPropertyEquals -Snapshot $Before -PropertyName "heartbeat_ttl_sec" -Expected $HeartbeatTtlSec -Name "TTL before snapshot"
    Require-IntPropertyEquals -Snapshot $After -PropertyName "heartbeat_ttl_sec" -Expected $HeartbeatTtlSec -Name "TTL after snapshot"
    Require-TimestampPropertyEquals -Snapshot $Before -PropertyName "stale_row_last_seen_at" -Expected $StaleRowLastSeenAt -Name "TTL before snapshot"
    Require-BoolPropertyEquals -Snapshot $After -PropertyName "registry_current_excludes_stale_rows" -Expected $RegistryCurrentExcludesStaleRows -Name "TTL after snapshot"
    Require-BoolPropertyEquals -Snapshot $After -PropertyName "expired_rows_hidden" -Expected $ExpiredRowsHidden -Name "TTL after snapshot"
}

function Assert-BootSnapshotContract {
    param(
        [Parameter(Mandatory = $true)]$Before,
        [Parameter(Mandatory = $true)]$After,
        [Parameter(Mandatory = $true)][bool]$CacheAvailable,
        [Parameter(Mandatory = $true)][bool]$StaleManualPeerRemoved,
        [Parameter(Mandatory = $true)][bool]$LanOnlyManualPeerPreserved,
        [Parameter(Mandatory = $true)][bool]$SameNameCurrentCandidatePreserved,
        [Parameter(Mandatory = $true)][int]$ManualPeerCountBefore,
        [Parameter(Mandatory = $true)][int]$ManualPeerCountAfter,
        [Parameter(Mandatory = $true)][int]$PrunedManualPeerCount
    )

    Require-SnapshotSchema -Snapshot $Before -ExpectedSchema "musu.v34_boot_snapshot.v1" -Name "Boot before snapshot"
    Require-SnapshotSchema -Snapshot $After -ExpectedSchema "musu.v34_boot_snapshot.v1" -Name "Boot after snapshot"
    Require-BoolPropertyEquals -Snapshot $Before -PropertyName "cache_available" -Expected $CacheAvailable -Name "Boot before snapshot"
    Require-BoolPropertyEquals -Snapshot $After -PropertyName "cache_available" -Expected $CacheAvailable -Name "Boot after snapshot"
    Require-IntPropertyEquals -Snapshot $Before -PropertyName "manual_peer_count" -Expected $ManualPeerCountBefore -Name "Boot before snapshot"
    Require-IntPropertyEquals -Snapshot $After -PropertyName "manual_peer_count" -Expected $ManualPeerCountAfter -Name "Boot after snapshot"
    Require-IntPropertyEquals -Snapshot $After -PropertyName "pruned_manual_peer_count" -Expected $PrunedManualPeerCount -Name "Boot after snapshot"
    Require-BoolPropertyEquals -Snapshot $Before -PropertyName "stale_manual_peer_present" -Expected $StaleManualPeerRemoved -Name "Boot before snapshot"
    Require-BoolPropertyEquals -Snapshot $After -PropertyName "stale_manual_peer_present" -Expected $false -Name "Boot after snapshot"
    Require-BoolPropertyEquals -Snapshot $After -PropertyName "lan_only_manual_peer_present" -Expected $LanOnlyManualPeerPreserved -Name "Boot after snapshot"
    Require-BoolPropertyEquals -Snapshot $After -PropertyName "same_name_current_candidate_present" -Expected $SameNameCurrentCandidatePreserved -Name "Boot after snapshot"
}

if ([string]::IsNullOrWhiteSpace($Version)) {
    $Version = (Get-Content -LiteralPath (Join-Path $repoRoot "VERSION") -Raw).Trim()
}
if ([string]::IsNullOrWhiteSpace($OutputRoot)) {
    $OutputRoot = Join-Path $repoRoot (".local-build\v34-source-artifacts\{0}" -f $Version)
}

$ttlStaleRowInjectedBool = Convert-StrictBool -Value $TtlStaleRowInjected -Name "TtlStaleRowInjected"
$ttlRegistryCurrentExcludesStaleRowsBool = Convert-StrictBool -Value $TtlRegistryCurrentExcludesStaleRows -Name "TtlRegistryCurrentExcludesStaleRows"
$ttlExpiredRowsHiddenBool = Convert-StrictBool -Value $TtlExpiredRowsHidden -Name "TtlExpiredRowsHidden"
$bootCacheAvailableBool = Convert-StrictBool -Value $BootCacheAvailable -Name "BootCacheAvailable"
$bootStaleManualPeerRemovedBool = Convert-StrictBool -Value $BootStaleManualPeerRemoved -Name "BootStaleManualPeerRemoved"
$bootLanOnlyManualPeerPreservedBool = Convert-StrictBool -Value $BootLanOnlyManualPeerPreserved -Name "BootLanOnlyManualPeerPreserved"
$bootSameNameCurrentCandidatePreservedBool = Convert-StrictBool -Value $BootSameNameCurrentCandidatePreserved -Name "BootSameNameCurrentCandidatePreserved"

$ttlStaleRowLastSeenAtParsed = [datetimeoffset]::Parse($TtlStaleRowLastSeenAt)

$ttlBefore = Read-Snapshot -Path $TtlBeforeSnapshotPath
$ttlAfter = Read-Snapshot -Path $TtlAfterSnapshotPath
$bootBefore = Read-Snapshot -Path $BootBeforeSnapshotPath
$bootAfter = Read-Snapshot -Path $BootAfterSnapshotPath

Assert-TtlSnapshotContract `
    -Before $ttlBefore.json `
    -After $ttlAfter.json `
    -StaleRowInjected $ttlStaleRowInjectedBool `
    -RegistryCurrentExcludesStaleRows $ttlRegistryCurrentExcludesStaleRowsBool `
    -ExpiredRowsHidden $ttlExpiredRowsHiddenBool `
    -StaleRowCountBefore $TtlStaleRowCountBefore `
    -StaleRowCountAfter $TtlStaleRowCountAfter `
    -HeartbeatTtlSec $TtlHeartbeatTtlSec `
    -StaleRowLastSeenAt $ttlStaleRowLastSeenAtParsed

Assert-BootSnapshotContract `
    -Before $bootBefore.json `
    -After $bootAfter.json `
    -CacheAvailable $bootCacheAvailableBool `
    -StaleManualPeerRemoved $bootStaleManualPeerRemovedBool `
    -LanOnlyManualPeerPreserved $bootLanOnlyManualPeerPreservedBool `
    -SameNameCurrentCandidatePreserved $bootSameNameCurrentCandidatePreservedBool `
    -ManualPeerCountBefore $BootManualPeerCountBefore `
    -ManualPeerCountAfter $BootManualPeerCountAfter `
    -PrunedManualPeerCount $BootPrunedManualPeerCount

$generatedAt = [datetimeoffset]::Now
$stamp = $generatedAt.ToString("yyyyMMdd-HHmmss")

New-Item -ItemType Directory -Force -Path $OutputRoot | Out-Null

$ttlSourcePath = Join-Path $OutputRoot "$stamp.v34-ttl-source.json"
$bootSourcePath = Join-Path $OutputRoot "$stamp.v34-boot-source.json"
$summaryPath = Join-Path $OutputRoot "$stamp.v34-source-artifacts.summary.md"

$ttlSource = [pscustomobject]@{
    schema = "musu.v34_ttl_prune_source.v1"
    version = $Version
    generated_at = $generatedAt.ToString("o")
    source_type = "operator_snapshot_pair"
    stale_row_injected = [bool]$ttlStaleRowInjectedBool
    registry_current_excludes_stale_rows = [bool]$ttlRegistryCurrentExcludesStaleRowsBool
    expired_rows_hidden = [bool]$ttlExpiredRowsHiddenBool
    stale_row_count_before = [int]$TtlStaleRowCountBefore
    stale_row_count_after = [int]$TtlStaleRowCountAfter
    heartbeat_ttl_sec = [int]$TtlHeartbeatTtlSec
    stale_row_last_seen_at = $ttlStaleRowLastSeenAtParsed.ToString("o")
    before_snapshot_path = $ttlBefore.path
    before_snapshot_sha256 = $ttlBefore.sha256
    before_snapshot = $ttlBefore.json
    after_snapshot_path = $ttlAfter.path
    after_snapshot_sha256 = $ttlAfter.sha256
    after_snapshot = $ttlAfter.json
    notes = $Notes
}

$bootSource = [pscustomobject]@{
    schema = "musu.v34_boot_reconcile_source.v1"
    version = $Version
    generated_at = $generatedAt.ToString("o")
    source_type = "operator_snapshot_pair"
    cache_available = [bool]$bootCacheAvailableBool
    manual_peer_count_before = [int]$BootManualPeerCountBefore
    manual_peer_count_after = [int]$BootManualPeerCountAfter
    pruned_manual_peer_count = [int]$BootPrunedManualPeerCount
    stale_manual_peer_removed = [bool]$bootStaleManualPeerRemovedBool
    lan_only_manual_peer_preserved = [bool]$bootLanOnlyManualPeerPreservedBool
    same_name_current_candidate_preserved = [bool]$bootSameNameCurrentCandidatePreservedBool
    before_snapshot_path = $bootBefore.path
    before_snapshot_sha256 = $bootBefore.sha256
    before_snapshot = $bootBefore.json
    after_snapshot_path = $bootAfter.path
    after_snapshot_sha256 = $bootAfter.sha256
    after_snapshot = $bootAfter.json
    notes = $Notes
}

$ttlSource | ConvertTo-Json -Depth 16 | Set-Content -LiteralPath $ttlSourcePath -Encoding UTF8
$bootSource | ConvertTo-Json -Depth 16 | Set-Content -LiteralPath $bootSourcePath -Encoding UTF8

$ttlSourceHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $ttlSourcePath).Hash.ToLowerInvariant()
$bootSourceHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $bootSourcePath).Hash.ToLowerInvariant()

$summary = @"
# MUSU V34 Source Artifacts

- Version: $Version
- TTL source: $([System.IO.Path]::GetFileName($ttlSourcePath))
- TTL source SHA256: $ttlSourceHash
- TTL before snapshot SHA256: $($ttlBefore.sha256)
- TTL after snapshot SHA256: $($ttlAfter.sha256)
- Boot source: $([System.IO.Path]::GetFileName($bootSourcePath))
- Boot source SHA256: $bootSourceHash
- Boot before snapshot SHA256: $($bootBefore.sha256)
- Boot after snapshot SHA256: $($bootAfter.sha256)
- Recorded at: $($generatedAt.ToString("o"))

Use these two JSON files as `-TtlSourceEvidencePath` and
`-BootSourceEvidencePath` when running `record-v34-self-heal-proof.ps1`.
"@
$summary | Set-Content -LiteralPath $summaryPath -Encoding UTF8

$result = [pscustomobject]@{
    ok = $true
    version = $Version
    output_root = (Resolve-Path -LiteralPath $OutputRoot).Path
    ttl_source_evidence_path = (Resolve-Path -LiteralPath $ttlSourcePath).Path
    ttl_source_evidence_sha256 = $ttlSourceHash
    boot_source_evidence_path = (Resolve-Path -LiteralPath $bootSourcePath).Path
    boot_source_evidence_sha256 = $bootSourceHash
    summary_path = (Resolve-Path -LiteralPath $summaryPath).Path
}

if ($Json) {
    $result | ConvertTo-Json -Depth 8
} else {
    $result
}
