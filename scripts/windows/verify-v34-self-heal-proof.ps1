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
