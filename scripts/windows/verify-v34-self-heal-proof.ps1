param(
    [Parameter(Mandatory = $true)]
    [string]$EvidencePath,
    [string]$ExpectedVersion = "",
    [string]$ExpectedPackageVersion = "",
    [switch]$Json
)

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = (Resolve-Path (Join-Path $scriptDir "..\..")).Path

if ([string]::IsNullOrWhiteSpace($ExpectedVersion)) {
    $ExpectedVersion = (Get-Content -LiteralPath (Join-Path $repoRoot "VERSION") -Raw).Trim()
}

function Convert-PublicVersionToPackageVersion([string]$Version) {
    $trimmed = $Version.Trim()
    $match = [regex]::Match($trimmed, '^(\d+)\.(\d+)\.(\d+)-rc\.(\d+)$')
    if ($match.Success) {
        return "{0}.{1}.{2}.{3}" -f $match.Groups[1].Value, $match.Groups[2].Value, $match.Groups[3].Value, $match.Groups[4].Value
    }
    $stable = [regex]::Match($trimmed, '^(\d+)\.(\d+)\.(\d+)$')
    if ($stable.Success) {
        return "{0}.{1}.{2}.0" -f $stable.Groups[1].Value, $stable.Groups[2].Value, $stable.Groups[3].Value
    }
    return $trimmed
}

if ([string]::IsNullOrWhiteSpace($ExpectedPackageVersion)) {
    $ExpectedPackageVersion = Convert-PublicVersionToPackageVersion $ExpectedVersion
}

$checks = New-Object System.Collections.Generic.List[object]

function Add-Check([string]$Name, [string]$Status, [string]$Message) {
    $checks.Add([pscustomobject]@{
        name = $Name
        status = $Status
        message = $Message
    }) | Out-Null
}

function Has-Property($Object, [string]$Name) {
    return ($null -ne $Object -and $null -ne $Object.PSObject.Properties[$Name])
}

function Get-Prop($Object, [string]$Name) {
    if (Has-Property $Object $Name) {
        return $Object.PSObject.Properties[$Name].Value
    }
    return $null
}

function Test-True($Object, [string]$Name) {
    return ((Has-Property $Object $Name) -and [bool](Get-Prop $Object $Name))
}

function Test-IntAtLeast($Object, [string]$Name, [int]$Minimum) {
    if (-not (Has-Property $Object $Name)) {
        return $false
    }
    try {
        return ([int](Get-Prop $Object $Name) -ge $Minimum)
    } catch {
        return $false
    }
}

function Test-IntEquals($Object, [string]$Name, [int]$Expected) {
    if (-not (Has-Property $Object $Name)) {
        return $false
    }
    try {
        return ([int](Get-Prop $Object $Name) -eq $Expected)
    } catch {
        return $false
    }
}

function Test-NonEmptyString($Object, [string]$Name) {
    return ((Has-Property $Object $Name) -and -not [string]::IsNullOrWhiteSpace([string](Get-Prop $Object $Name)))
}

function Test-RoutableAddr([string]$Addr) {
    if ([string]::IsNullOrWhiteSpace($Addr)) {
        return $false
    }
    $addrHost = $Addr.Trim()
    if ($addrHost.StartsWith("[")) {
        $end = $addrHost.IndexOf("]")
        if ($end -gt 0) {
            $addrHost = $addrHost.Substring(1, $end - 1)
        }
    } elseif ($addrHost.Contains(":")) {
        $addrHost = ($addrHost -split ":")[0]
    }
    $lower = $addrHost.ToLowerInvariant()
    if ($lower -in @("localhost", "0.0.0.0", "::", "::1", "127.0.0.1")) {
        return $false
    }
    if ($lower.StartsWith("127.")) {
        return $false
    }
    if ($lower -eq "[::]" -or $lower -eq "[::1]") {
        return $false
    }
    return $true
}

function Test-Sha256([string]$Value) {
    return (-not [string]::IsNullOrWhiteSpace($Value) -and $Value -match '^[a-fA-F0-9]{64}$')
}

function Test-PositiveInt($Object, [string]$Name) {
    if (-not (Has-Property $Object $Name)) {
        return $false
    }
    try {
        return ([int](Get-Prop $Object $Name) -gt 0)
    } catch {
        return $false
    }
}

function Convert-StrictBoolValue($Value) {
    if ($Value -is [bool]) {
        return [bool]$Value
    }
    $text = ([string]$Value).Trim().ToLowerInvariant()
    if ($text -in @("true", "`$true", "1", "yes", "y")) {
        return $true
    }
    if ($text -in @("false", "`$false", "0", "no", "n")) {
        return $false
    }
    throw "Not a strict boolean value: $Value"
}

function Test-BoolFieldMatches($LeftObject, [string]$LeftName, $RightObject, [string]$RightName) {
    if (-not ((Has-Property $LeftObject $LeftName) -and (Has-Property $RightObject $RightName))) {
        return $false
    }
    try {
        return ((Convert-StrictBoolValue (Get-Prop $LeftObject $LeftName)) -eq (Convert-StrictBoolValue (Get-Prop $RightObject $RightName)))
    } catch {
        return $false
    }
}

function Test-IntFieldMatches($LeftObject, [string]$LeftName, $RightObject, [string]$RightName) {
    if (-not ((Has-Property $LeftObject $LeftName) -and (Has-Property $RightObject $RightName))) {
        return $false
    }
    try {
        return ([int](Get-Prop $LeftObject $LeftName) -eq [int](Get-Prop $RightObject $RightName))
    } catch {
        return $false
    }
}

function Test-StringFieldMatches($LeftObject, [string]$LeftName, $RightObject, [string]$RightName) {
    return ((Has-Property $LeftObject $LeftName) -and (Has-Property $RightObject $RightName) -and ([string](Get-Prop $LeftObject $LeftName) -eq [string](Get-Prop $RightObject $RightName)))
}

$resolvedEvidencePath = ""
$evidence = $null
try {
    $resolvedEvidencePath = (Resolve-Path -LiteralPath $EvidencePath).Path
    $evidence = Get-Content -LiteralPath $resolvedEvidencePath -Raw | ConvertFrom-Json
} catch {
    Add-Check "evidence readable" "fail" "failed to read evidence JSON: $($_.Exception.Message)"
}

if ($evidence) {
    if ([string](Get-Prop $evidence "schema") -eq "musu.v34_self_heal_proof.v1") {
        Add-Check "schema" "pass" "schema is valid"
    } else {
        Add-Check "schema" "fail" "schema must be musu.v34_self_heal_proof.v1"
    }

    if (Test-True $evidence "ok") {
        Add-Check "evidence ok" "pass" "evidence reports ok=true"
    } else {
        Add-Check "evidence ok" "fail" "evidence must report ok=true"
    }

    if ([string](Get-Prop $evidence "version") -eq $ExpectedVersion) {
        Add-Check "version" "pass" "version matches $ExpectedVersion"
    } else {
        Add-Check "version" "fail" "version must match $ExpectedVersion"
    }

    if ([string](Get-Prop $evidence "package_version") -eq $ExpectedPackageVersion) {
        Add-Check "package version" "pass" "package_version matches $ExpectedPackageVersion"
    } else {
        Add-Check "package version" "fail" "package_version must match $ExpectedPackageVersion"
    }

    $generatedAtRaw = [string](Get-Prop $evidence "generated_at")
    [datetime]$generatedAt = [datetime]::MinValue
    $generatedAtParsed = $false
    try {
        $generatedAt = [datetime]::Parse(
            $generatedAtRaw,
            [System.Globalization.CultureInfo]::InvariantCulture,
            [System.Globalization.DateTimeStyles]::RoundtripKind
        )
        $generatedAtParsed = $true
    } catch {
        $generatedAtParsed = $false
    }
    if ($generatedAtParsed) {
        Add-Check "generated timestamp" "pass" "generated_at parses"
        if ($generatedAt.ToUniversalTime() -le (Get-Date).ToUniversalTime().AddMinutes(5)) {
            Add-Check "generated not future" "pass" "generated_at is not in the future"
        } else {
            Add-Check "generated not future" "fail" "generated_at is more than five minutes in the future"
        }
        if ($generatedAt.ToUniversalTime() -ge (Get-Date).ToUniversalTime().AddDays(-14)) {
            Add-Check "evidence age" "pass" "generated_at is within 14 days"
        } else {
            Add-Check "evidence age" "fail" "generated_at is older than 14 days"
        }
    } else {
        Add-Check "generated timestamp" "fail" "generated_at must parse as a timestamp"
    }

    foreach ($flag in @("ttl_prune_ok", "boot_reconcile_ok", "stale_candidate_e2e_ok")) {
        if (Test-True $evidence $flag) {
            Add-Check $flag "pass" "$flag is true"
        } else {
            Add-Check $flag "fail" "$flag must be true"
        }
    }

    $ttl = Get-Prop $evidence "ttl_prune"
    if ($ttl) {
        Add-Check "ttl details" "pass" "ttl_prune details are present"
    } else {
        Add-Check "ttl details" "fail" "ttl_prune details are required"
    }
    if (Test-True $ttl "stale_row_injected") {
        Add-Check "ttl stale row injected" "pass" "stale row injection is recorded"
    } else {
        Add-Check "ttl stale row injected" "fail" "ttl_prune.stale_row_injected must be true"
    }
    if (Test-True $ttl "registry_current_excludes_stale_rows") {
        Add-Check "ttl current excludes stale" "pass" "current registry excludes stale rows"
    } else {
        Add-Check "ttl current excludes stale" "fail" "ttl_prune.registry_current_excludes_stale_rows must be true"
    }
    if (Test-True $ttl "expired_rows_hidden") {
        Add-Check "ttl expired hidden" "pass" "expired rows are hidden"
    } else {
        Add-Check "ttl expired hidden" "fail" "ttl_prune.expired_rows_hidden must be true"
    }
    if (Test-IntAtLeast $ttl "stale_row_count_before" 1) {
        Add-Check "ttl stale before" "pass" "at least one stale row existed before prune"
    } else {
        Add-Check "ttl stale before" "fail" "ttl_prune.stale_row_count_before must be >= 1"
    }
    if (Test-IntEquals $ttl "stale_row_count_after" 0) {
        Add-Check "ttl stale after" "pass" "no stale rows remain visible after prune"
    } else {
        Add-Check "ttl stale after" "fail" "ttl_prune.stale_row_count_after must be 0"
    }
    if (Test-IntAtLeast $ttl "heartbeat_ttl_sec" 60) {
        Add-Check "ttl seconds" "pass" "heartbeat_ttl_sec is present"
    } else {
        Add-Check "ttl seconds" "fail" "ttl_prune.heartbeat_ttl_sec must be >= 60"
    }

    $boot = Get-Prop $evidence "boot_reconcile"
    if ($boot) {
        Add-Check "boot details" "pass" "boot_reconcile details are present"
    } else {
        Add-Check "boot details" "fail" "boot_reconcile details are required"
    }
    foreach ($flag in @("cache_available", "stale_manual_peer_removed", "lan_only_manual_peer_preserved", "same_name_current_candidate_preserved")) {
        if (Test-True $boot $flag) {
            Add-Check "boot $flag" "pass" "boot_reconcile.$flag is true"
        } else {
            Add-Check "boot $flag" "fail" "boot_reconcile.$flag must be true"
        }
    }
    if (Test-IntAtLeast $boot "manual_peer_count_before" 1) {
        Add-Check "boot manual before" "pass" "manual peers existed before reconcile"
    } else {
        Add-Check "boot manual before" "fail" "boot_reconcile.manual_peer_count_before must be >= 1"
    }
    if (Test-IntAtLeast $boot "pruned_manual_peer_count" 1) {
        Add-Check "boot pruned count" "pass" "boot reconcile pruned stale manual peers"
    } else {
        Add-Check "boot pruned count" "fail" "boot_reconcile.pruned_manual_peer_count must be >= 1"
    }

    $route = Get-Prop $evidence "route_preflight"
    if ($route) {
        Add-Check "route details" "pass" "route_preflight details are present"
    } else {
        Add-Check "route details" "fail" "route_preflight details are required"
    }
    foreach ($flag in @("physical_two_node_evidence", "stale_candidate_injected", "stale_candidate_was_first", "selected_reachable_candidate_before_stale", "duplicate_task_execution_prevented", "route_checked")) {
        if (Test-True $route $flag) {
            Add-Check "route $flag" "pass" "route_preflight.$flag is true"
        } else {
            Add-Check "route $flag" "fail" "route_preflight.$flag must be true"
        }
    }
    if (Test-IntEquals $route "task_post_count" 1) {
        Add-Check "route task count" "pass" "exactly one task POST was executed"
    } else {
        Add-Check "route task count" "fail" "route_preflight.task_post_count must be exactly 1"
    }
    if (Test-NonEmptyString $route "source_node_name" -and Test-NonEmptyString $route "target_node_name" -and [string](Get-Prop $route "source_node_name") -ne [string](Get-Prop $route "target_node_name")) {
        Add-Check "route node pair" "pass" "source and target node names are present and distinct"
    } else {
        Add-Check "route node pair" "fail" "route_preflight must include distinct source_node_name and target_node_name"
    }
    $selectedAddr = [string](Get-Prop $route "selected_candidate_addr")
    if (Test-RoutableAddr $selectedAddr) {
        Add-Check "route selected candidate" "pass" "selected candidate is remotely routable"
    } else {
        Add-Check "route selected candidate" "fail" "route_preflight.selected_candidate_addr must be remotely routable"
    }

    $routeEvidence = Get-Prop $route "route_evidence"
    $routeSourceNode = [string](Get-Prop $route "source_node_name")
    $routeTargetNode = [string](Get-Prop $route "target_node_name")
    if ($routeEvidence -and [string](Get-Prop $routeEvidence "schema") -eq "musu.route_evidence.v1") {
        Add-Check "route evidence schema" "pass" "embedded route_evidence schema is valid"
    } else {
        Add-Check "route evidence schema" "fail" "route_preflight.route_evidence must have schema musu.route_evidence.v1"
    }
    if ($routeEvidence -and [string](Get-Prop $routeEvidence "version") -eq $ExpectedVersion) {
        Add-Check "route evidence version" "pass" "embedded route evidence version matches $ExpectedVersion"
    } else {
        Add-Check "route evidence version" "fail" "route_preflight.route_evidence.version must match $ExpectedVersion"
    }
    if ($routeEvidence -and [string](Get-Prop $routeEvidence "result") -eq "success") {
        Add-Check "route evidence result" "pass" "embedded route evidence succeeded"
    } else {
        Add-Check "route evidence result" "fail" "route_preflight.route_evidence.result must be success"
    }
    if ($routeEvidence -and [string](Get-Prop $routeEvidence "source_node_id") -eq $routeSourceNode) {
        Add-Check "route evidence source binding" "pass" "embedded route evidence source_node_id matches route_preflight.source_node_name"
    } else {
        Add-Check "route evidence source binding" "fail" "route_preflight.route_evidence.source_node_id must match route_preflight.source_node_name"
    }
    if ($routeEvidence -and [string](Get-Prop $routeEvidence "target_node_id") -eq $routeTargetNode) {
        Add-Check "route evidence target binding" "pass" "embedded route evidence target_node_id matches route_preflight.target_node_name"
    } else {
        Add-Check "route evidence target binding" "fail" "route_preflight.route_evidence.target_node_id must match route_preflight.target_node_name"
    }
    if ($routeEvidence -and [string](Get-Prop $routeEvidence "candidate_addr") -eq $selectedAddr) {
        Add-Check "route evidence candidate binding" "pass" "embedded route evidence candidate_addr matches selected_candidate_addr"
    } else {
        Add-Check "route evidence candidate binding" "fail" "route_preflight.route_evidence.candidate_addr must match route_preflight.selected_candidate_addr"
    }
    $routeKind = if ($routeEvidence) { [string](Get-Prop $routeEvidence "route_kind") } else { "" }
    if ($routeKind -in @("lan", "tailscale", "direct_quic")) {
        Add-Check "route evidence direct kind" "pass" "embedded route evidence route_kind is direct: $routeKind"
    } else {
        Add-Check "route evidence direct kind" "fail" "route_preflight.route_evidence.route_kind must be lan, tailscale, or direct_quic"
    }
    if ($routeEvidence -and (Has-Property $routeEvidence "payload_transited_musu_infra") -and -not [bool](Get-Prop $routeEvidence "payload_transited_musu_infra")) {
        Add-Check "route evidence direct payload path" "pass" "embedded direct route evidence did not transit MUSU infrastructure"
    } else {
        Add-Check "route evidence direct payload path" "fail" "route_preflight.route_evidence.payload_transited_musu_infra must be false for stale direct self-heal proof"
    }
    if (Test-PositiveInt $routeEvidence "total_attempt_ms") {
        Add-Check "route evidence attempt timing" "pass" "embedded route evidence total_attempt_ms is positive"
    } else {
        Add-Check "route evidence attempt timing" "fail" "route_preflight.route_evidence.total_attempt_ms must be positive"
    }
    $routeFailureClass = if ($routeEvidence) { [string](Get-Prop $routeEvidence "failure_class") } else { "" }
    if ([string]::IsNullOrWhiteSpace($routeFailureClass)) {
        Add-Check "route evidence failure class" "pass" "embedded route evidence failure_class is empty for success"
    } else {
        Add-Check "route evidence failure class" "fail" "route_preflight.route_evidence.failure_class must be empty for success"
    }
    $routeRecordedAtRaw = if ($routeEvidence) { [string](Get-Prop $routeEvidence "recorded_at") } else { "" }
    [datetime]$routeRecordedAt = [datetime]::MinValue
    $routeRecordedAtParsed = $false
    try {
        $routeRecordedAt = [datetime]::Parse(
            $routeRecordedAtRaw,
            [System.Globalization.CultureInfo]::InvariantCulture,
            [System.Globalization.DateTimeStyles]::RoundtripKind
        )
        $routeRecordedAtParsed = $true
    } catch {
        $routeRecordedAtParsed = $false
    }
    if ($routeRecordedAtParsed) {
        Add-Check "route evidence recorded timestamp" "pass" "embedded route evidence recorded_at parses"
        if ($routeRecordedAt.ToUniversalTime() -le (Get-Date).ToUniversalTime().AddMinutes(5)) {
            Add-Check "route evidence recorded not future" "pass" "embedded route evidence recorded_at is not in the future"
        } else {
            Add-Check "route evidence recorded not future" "fail" "route_preflight.route_evidence.recorded_at is more than five minutes in the future"
        }
        if ($routeRecordedAt.ToUniversalTime() -ge (Get-Date).ToUniversalTime().AddDays(-14)) {
            Add-Check "route evidence age" "pass" "embedded route evidence recorded_at is within 14 days"
        } else {
            Add-Check "route evidence age" "fail" "route_preflight.route_evidence.recorded_at is older than 14 days"
        }
    } else {
        Add-Check "route evidence recorded timestamp" "fail" "route_preflight.route_evidence.recorded_at must parse as a timestamp"
    }

    $sourceEvidence = Get-Prop $evidence "source_evidence"
    if ($sourceEvidence) {
        Add-Check "source evidence details" "pass" "source_evidence details are present"
    } else {
        Add-Check "source evidence details" "fail" "source_evidence details are required"
    }
    if (Test-True $sourceEvidence "route_evidence_candidate_matches_selected") {
        Add-Check "source evidence candidate match" "pass" "source evidence confirms route candidate matches selected candidate"
    } else {
        Add-Check "source evidence candidate match" "fail" "source_evidence.route_evidence_candidate_matches_selected must be true"
    }
    if (Test-True $sourceEvidence "node_pair_distinct") {
        Add-Check "source evidence node pair" "pass" "source evidence confirms distinct physical node names"
    } else {
        Add-Check "source evidence node pair" "fail" "source_evidence.node_pair_distinct must be true"
    }
    if ($sourceEvidence -and [string](Get-Prop $sourceEvidence "route_evidence_candidate_addr") -eq $selectedAddr) {
        Add-Check "source evidence candidate binding" "pass" "source evidence route_evidence_candidate_addr matches selected candidate"
    } else {
        Add-Check "source evidence candidate binding" "fail" "source_evidence.route_evidence_candidate_addr must match route_preflight.selected_candidate_addr"
    }
    if ($sourceEvidence -and (Test-Sha256 ([string](Get-Prop $sourceEvidence "route_evidence_sha256")))) {
        Add-Check "source evidence route hash" "pass" "source evidence includes a route evidence SHA256"
    } else {
        Add-Check "source evidence route hash" "fail" "source_evidence.route_evidence_sha256 must be a SHA256 hash"
    }
    if ($sourceEvidence -and (Test-NonEmptyString $sourceEvidence "route_evidence_path")) {
        Add-Check "source evidence route path" "pass" "source evidence includes the route evidence path"
    } else {
        Add-Check "source evidence route path" "fail" "source_evidence.route_evidence_path is required"
    }

    $ttlSource = Get-Prop $sourceEvidence "ttl_source_evidence"
    if ($ttlSource -and [string](Get-Prop $ttlSource "schema") -eq "musu.v34_ttl_prune_source.v1") {
        Add-Check "ttl source schema" "pass" "TTL source evidence schema is valid"
    } else {
        Add-Check "ttl source schema" "fail" "source_evidence.ttl_source_evidence must have schema musu.v34_ttl_prune_source.v1"
    }
    if ($sourceEvidence -and (Test-Sha256 ([string](Get-Prop $sourceEvidence "ttl_source_evidence_sha256")))) {
        Add-Check "ttl source hash" "pass" "TTL source evidence is hash-bound"
    } else {
        Add-Check "ttl source hash" "fail" "source_evidence.ttl_source_evidence_sha256 must be a SHA256 hash"
    }
    foreach ($name in @("before_snapshot_sha256", "after_snapshot_sha256")) {
        if ($ttlSource -and (Test-Sha256 ([string](Get-Prop $ttlSource $name)))) {
            Add-Check "ttl source $name" "pass" "TTL source evidence includes $name"
        } else {
            Add-Check "ttl source $name" "fail" "source_evidence.ttl_source_evidence.$name must be a SHA256 hash"
        }
    }
    foreach ($name in @("before_snapshot", "after_snapshot")) {
        if ($ttlSource -and (Has-Property $ttlSource $name)) {
            Add-Check "ttl source $name" "pass" "TTL source evidence includes $name"
        } else {
            Add-Check "ttl source $name" "fail" "source_evidence.ttl_source_evidence.$name is required"
        }
    }
    $ttlBeforeSnapshot = Get-Prop $ttlSource "before_snapshot"
    $ttlAfterSnapshot = Get-Prop $ttlSource "after_snapshot"
    if ($ttlBeforeSnapshot -and [string](Get-Prop $ttlBeforeSnapshot "schema") -eq "musu.v34_ttl_snapshot.v1") {
        Add-Check "ttl before snapshot schema" "pass" "TTL before snapshot schema is valid"
    } else {
        Add-Check "ttl before snapshot schema" "fail" "TTL before snapshot must use schema musu.v34_ttl_snapshot.v1"
    }
    if ($ttlAfterSnapshot -and [string](Get-Prop $ttlAfterSnapshot "schema") -eq "musu.v34_ttl_snapshot.v1") {
        Add-Check "ttl after snapshot schema" "pass" "TTL after snapshot schema is valid"
    } else {
        Add-Check "ttl after snapshot schema" "fail" "TTL after snapshot must use schema musu.v34_ttl_snapshot.v1"
    }
    if (Test-BoolFieldMatches $ttlBeforeSnapshot "stale_row_injected" $ttlSource "stale_row_injected") {
        Add-Check "ttl before snapshot stale injected" "pass" "TTL before snapshot stale_row_injected matches source evidence"
    } else {
        Add-Check "ttl before snapshot stale injected" "fail" "TTL before snapshot stale_row_injected must match source evidence"
    }
    if (Test-IntFieldMatches $ttlBeforeSnapshot "stale_row_count" $ttlSource "stale_row_count_before") {
        Add-Check "ttl before snapshot stale count" "pass" "TTL before snapshot stale_row_count matches source evidence"
    } else {
        Add-Check "ttl before snapshot stale count" "fail" "TTL before snapshot stale_row_count must match source evidence stale_row_count_before"
    }
    if (Test-IntFieldMatches $ttlAfterSnapshot "stale_row_count" $ttlSource "stale_row_count_after") {
        Add-Check "ttl after snapshot stale count" "pass" "TTL after snapshot stale_row_count matches source evidence"
    } else {
        Add-Check "ttl after snapshot stale count" "fail" "TTL after snapshot stale_row_count must match source evidence stale_row_count_after"
    }
    if (Test-IntFieldMatches $ttlBeforeSnapshot "heartbeat_ttl_sec" $ttlSource "heartbeat_ttl_sec" -and Test-IntFieldMatches $ttlAfterSnapshot "heartbeat_ttl_sec" $ttlSource "heartbeat_ttl_sec") {
        Add-Check "ttl snapshot ttl seconds" "pass" "TTL snapshots heartbeat_ttl_sec matches source evidence"
    } else {
        Add-Check "ttl snapshot ttl seconds" "fail" "TTL snapshots heartbeat_ttl_sec must match source evidence"
    }
    if (Test-StringFieldMatches $ttlBeforeSnapshot "stale_row_last_seen_at" $ttlSource "stale_row_last_seen_at") {
        Add-Check "ttl before snapshot last seen" "pass" "TTL before snapshot stale_row_last_seen_at matches source evidence"
    } else {
        Add-Check "ttl before snapshot last seen" "fail" "TTL before snapshot stale_row_last_seen_at must match source evidence"
    }
    if (Test-BoolFieldMatches $ttlAfterSnapshot "registry_current_excludes_stale_rows" $ttlSource "registry_current_excludes_stale_rows") {
        Add-Check "ttl after snapshot current excludes stale" "pass" "TTL after snapshot current-excludes-stale flag matches source evidence"
    } else {
        Add-Check "ttl after snapshot current excludes stale" "fail" "TTL after snapshot registry_current_excludes_stale_rows must match source evidence"
    }
    if (Test-BoolFieldMatches $ttlAfterSnapshot "expired_rows_hidden" $ttlSource "expired_rows_hidden") {
        Add-Check "ttl after snapshot expired hidden" "pass" "TTL after snapshot expired_rows_hidden matches source evidence"
    } else {
        Add-Check "ttl after snapshot expired hidden" "fail" "TTL after snapshot expired_rows_hidden must match source evidence"
    }
    if (Test-True $sourceEvidence "ttl_source_evidence_matches_parameters") {
        Add-Check "ttl source matches wrapper" "pass" "TTL source evidence matches wrapper fields"
    } else {
        Add-Check "ttl source matches wrapper" "fail" "source_evidence.ttl_source_evidence_matches_parameters must be true"
    }
    $ttlFieldPairs = @(
        @("stale_row_injected", "stale_row_injected", "bool"),
        @("registry_current_excludes_stale_rows", "registry_current_excludes_stale_rows", "bool"),
        @("expired_rows_hidden", "expired_rows_hidden", "bool"),
        @("stale_row_count_before", "stale_row_count_before", "int"),
        @("stale_row_count_after", "stale_row_count_after", "int"),
        @("heartbeat_ttl_sec", "heartbeat_ttl_sec", "int"),
        @("stale_row_last_seen_at", "stale_row_last_seen_at", "string")
    )
    foreach ($pair in $ttlFieldPairs) {
        $leftName = $pair[0]
        $rightName = $pair[1]
        $kind = $pair[2]
        $matches = switch ($kind) {
            "bool" { Test-BoolFieldMatches $ttlSource $leftName $ttl $rightName }
            "int" { Test-IntFieldMatches $ttlSource $leftName $ttl $rightName }
            default { Test-StringFieldMatches $ttlSource $leftName $ttl $rightName }
        }
        if ($matches) {
            Add-Check "ttl source $leftName" "pass" "TTL source field $leftName matches wrapper"
        } else {
            Add-Check "ttl source $leftName" "fail" "TTL source field $leftName must match ttl_prune.$rightName"
        }
    }

    $bootSource = Get-Prop $sourceEvidence "boot_source_evidence"
    if ($bootSource -and [string](Get-Prop $bootSource "schema") -eq "musu.v34_boot_reconcile_source.v1") {
        Add-Check "boot source schema" "pass" "boot source evidence schema is valid"
    } else {
        Add-Check "boot source schema" "fail" "source_evidence.boot_source_evidence must have schema musu.v34_boot_reconcile_source.v1"
    }
    if ($sourceEvidence -and (Test-Sha256 ([string](Get-Prop $sourceEvidence "boot_source_evidence_sha256")))) {
        Add-Check "boot source hash" "pass" "boot source evidence is hash-bound"
    } else {
        Add-Check "boot source hash" "fail" "source_evidence.boot_source_evidence_sha256 must be a SHA256 hash"
    }
    foreach ($name in @("before_snapshot_sha256", "after_snapshot_sha256")) {
        if ($bootSource -and (Test-Sha256 ([string](Get-Prop $bootSource $name)))) {
            Add-Check "boot source $name" "pass" "boot source evidence includes $name"
        } else {
            Add-Check "boot source $name" "fail" "source_evidence.boot_source_evidence.$name must be a SHA256 hash"
        }
    }
    foreach ($name in @("before_snapshot", "after_snapshot")) {
        if ($bootSource -and (Has-Property $bootSource $name)) {
            Add-Check "boot source $name" "pass" "boot source evidence includes $name"
        } else {
            Add-Check "boot source $name" "fail" "source_evidence.boot_source_evidence.$name is required"
        }
    }
    $bootBeforeSnapshot = Get-Prop $bootSource "before_snapshot"
    $bootAfterSnapshot = Get-Prop $bootSource "after_snapshot"
    if ($bootBeforeSnapshot -and [string](Get-Prop $bootBeforeSnapshot "schema") -eq "musu.v34_boot_snapshot.v1") {
        Add-Check "boot before snapshot schema" "pass" "boot before snapshot schema is valid"
    } else {
        Add-Check "boot before snapshot schema" "fail" "boot before snapshot must use schema musu.v34_boot_snapshot.v1"
    }
    if ($bootAfterSnapshot -and [string](Get-Prop $bootAfterSnapshot "schema") -eq "musu.v34_boot_snapshot.v1") {
        Add-Check "boot after snapshot schema" "pass" "boot after snapshot schema is valid"
    } else {
        Add-Check "boot after snapshot schema" "fail" "boot after snapshot must use schema musu.v34_boot_snapshot.v1"
    }
    if (Test-BoolFieldMatches $bootBeforeSnapshot "cache_available" $bootSource "cache_available" -and Test-BoolFieldMatches $bootAfterSnapshot "cache_available" $bootSource "cache_available") {
        Add-Check "boot snapshot cache available" "pass" "boot snapshots cache_available matches source evidence"
    } else {
        Add-Check "boot snapshot cache available" "fail" "boot snapshots cache_available must match source evidence"
    }
    if (Test-IntFieldMatches $bootBeforeSnapshot "manual_peer_count" $bootSource "manual_peer_count_before") {
        Add-Check "boot before snapshot peer count" "pass" "boot before snapshot manual_peer_count matches source evidence"
    } else {
        Add-Check "boot before snapshot peer count" "fail" "boot before snapshot manual_peer_count must match source evidence manual_peer_count_before"
    }
    if (Test-IntFieldMatches $bootAfterSnapshot "manual_peer_count" $bootSource "manual_peer_count_after") {
        Add-Check "boot after snapshot peer count" "pass" "boot after snapshot manual_peer_count matches source evidence"
    } else {
        Add-Check "boot after snapshot peer count" "fail" "boot after snapshot manual_peer_count must match source evidence manual_peer_count_after"
    }
    if (Test-IntFieldMatches $bootAfterSnapshot "pruned_manual_peer_count" $bootSource "pruned_manual_peer_count") {
        Add-Check "boot after snapshot pruned count" "pass" "boot after snapshot pruned_manual_peer_count matches source evidence"
    } else {
        Add-Check "boot after snapshot pruned count" "fail" "boot after snapshot pruned_manual_peer_count must match source evidence"
    }
    if ($bootBeforeSnapshot -and (Test-True $bootBeforeSnapshot "stale_manual_peer_present") -and $bootAfterSnapshot -and (Has-Property $bootAfterSnapshot "stale_manual_peer_present") -and -not [bool](Get-Prop $bootAfterSnapshot "stale_manual_peer_present")) {
        Add-Check "boot snapshot stale peer removed" "pass" "boot snapshots show stale manual peer removed"
    } else {
        Add-Check "boot snapshot stale peer removed" "fail" "boot snapshots must show stale manual peer present before and absent after"
    }
    if (Test-BoolFieldMatches $bootAfterSnapshot "lan_only_manual_peer_present" $bootSource "lan_only_manual_peer_preserved") {
        Add-Check "boot after snapshot lan peer preserved" "pass" "boot after snapshot lan-only peer presence matches source evidence"
    } else {
        Add-Check "boot after snapshot lan peer preserved" "fail" "boot after snapshot lan_only_manual_peer_present must match source evidence"
    }
    if (Test-BoolFieldMatches $bootAfterSnapshot "same_name_current_candidate_present" $bootSource "same_name_current_candidate_preserved") {
        Add-Check "boot after snapshot current candidate preserved" "pass" "boot after snapshot current-candidate presence matches source evidence"
    } else {
        Add-Check "boot after snapshot current candidate preserved" "fail" "boot after snapshot same_name_current_candidate_present must match source evidence"
    }
    if (Test-True $sourceEvidence "boot_source_evidence_matches_parameters") {
        Add-Check "boot source matches wrapper" "pass" "boot source evidence matches wrapper fields"
    } else {
        Add-Check "boot source matches wrapper" "fail" "source_evidence.boot_source_evidence_matches_parameters must be true"
    }
    $bootFieldPairs = @(
        @("cache_available", "cache_available", "bool"),
        @("stale_manual_peer_removed", "stale_manual_peer_removed", "bool"),
        @("lan_only_manual_peer_preserved", "lan_only_manual_peer_preserved", "bool"),
        @("same_name_current_candidate_preserved", "same_name_current_candidate_preserved", "bool"),
        @("manual_peer_count_before", "manual_peer_count_before", "int"),
        @("manual_peer_count_after", "manual_peer_count_after", "int"),
        @("pruned_manual_peer_count", "pruned_manual_peer_count", "int")
    )
    foreach ($pair in $bootFieldPairs) {
        $leftName = $pair[0]
        $rightName = $pair[1]
        $kind = $pair[2]
        $matches = switch ($kind) {
            "bool" { Test-BoolFieldMatches $bootSource $leftName $boot $rightName }
            "int" { Test-IntFieldMatches $bootSource $leftName $boot $rightName }
            default { Test-StringFieldMatches $bootSource $leftName $boot $rightName }
        }
        if ($matches) {
            Add-Check "boot source $leftName" "pass" "boot source field $leftName matches wrapper"
        } else {
            Add-Check "boot source $leftName" "fail" "boot source field $leftName must match boot_reconcile.$rightName"
        }
    }
}

$failures = @($checks | Where-Object { $_.status -eq "fail" })
$result = [pscustomobject]@{
    ok = ($failures.Count -eq 0)
    evidence_path = $resolvedEvidencePath
    fail_count = [int]$failures.Count
    version = $ExpectedVersion
    package_version = $ExpectedPackageVersion
    checks = @($checks.ToArray())
}

if ($Json) {
    $result | ConvertTo-Json -Depth 8
} elseif ($result.ok) {
    Write-Host "V34 self-heal proof verification passed"
} else {
    Write-Host "V34 self-heal proof verification failed ($($result.fail_count) failures)"
    foreach ($failure in $failures) {
        Write-Host "- $($failure.name): $($failure.message)"
    }
}

if (-not $result.ok) {
    exit 1
}
