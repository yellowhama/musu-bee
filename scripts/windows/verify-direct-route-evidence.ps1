param(
    [Parameter(Mandatory = $true)]
    [string]$EvidencePath,
    [string]$ExpectedVersion = "",
    [string]$ExpectedSourceNodeName = "",
    [string]$ExpectedTargetNodeName = "",
    [switch]$Json
)

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = (Resolve-Path (Join-Path $scriptDir "..\..")).Path

if ([string]::IsNullOrWhiteSpace($ExpectedVersion)) {
    $ExpectedVersion = (Get-Content -LiteralPath (Join-Path $repoRoot "VERSION") -Raw).Trim()
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
    }
    elseif ($addrHost.Contains(":")) {
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
}
catch {
    Add-Check "evidence readable" "fail" "failed to read evidence JSON: $($_.Exception.Message)"
}

if ($evidence) {
    if ([string](Get-Prop $evidence "schema") -eq "musu.route_evidence.v1") {
        Add-Check "schema" "pass" "route evidence schema is valid"
    }
    else {
        Add-Check "schema" "fail" "schema must be musu.route_evidence.v1"
    }

    if ([string](Get-Prop $evidence "version") -eq $ExpectedVersion) {
        Add-Check "version" "pass" "version matches $ExpectedVersion"
    }
    else {
        Add-Check "version" "fail" "version must match $ExpectedVersion"
    }

    if ([string](Get-Prop $evidence "result") -eq "success") {
        Add-Check "result" "pass" "route attempt succeeded"
    }
    else {
        Add-Check "result" "fail" "route evidence result must be success"
    }

    $sourceNode = [string](Get-Prop $evidence "source_node_id")
    $targetNode = [string](Get-Prop $evidence "target_node_id")
    if (Test-NonEmptyString $evidence "source_node_id" -and Test-NonEmptyString $evidence "target_node_id" -and $sourceNode -ne $targetNode) {
        Add-Check "node pair" "pass" "source and target nodes are present and distinct"
    }
    else {
        Add-Check "node pair" "fail" "source_node_id and target_node_id must be distinct non-empty values"
    }

    if ([string]::IsNullOrWhiteSpace($ExpectedSourceNodeName) -or $sourceNode -eq $ExpectedSourceNodeName) {
        Add-Check "expected source" "pass" "source node matches expected constraint"
    }
    else {
        Add-Check "expected source" "fail" "source_node_id must be $ExpectedSourceNodeName"
    }

    if ([string]::IsNullOrWhiteSpace($ExpectedTargetNodeName) -or $targetNode -eq $ExpectedTargetNodeName) {
        Add-Check "expected target" "pass" "target node matches expected constraint"
    }
    else {
        Add-Check "expected target" "fail" "target_node_id must be $ExpectedTargetNodeName"
    }

    $routeKind = [string](Get-Prop $evidence "route_kind")
    if ($routeKind -in @("lan", "tailscale", "direct_quic")) {
        Add-Check "route kind" "pass" "route kind is a direct route: $routeKind"
    }
    else {
        Add-Check "route kind" "fail" "route_kind must be lan, tailscale, or direct_quic"
    }

    $candidateAddr = [string](Get-Prop $evidence "candidate_addr")
    if (Test-RoutableAddr $candidateAddr) {
        Add-Check "candidate addr" "pass" "candidate address is remotely routable"
    }
    else {
        Add-Check "candidate addr" "fail" "candidate_addr must be remotely routable"
    }

    if (Has-Property $evidence "payload_transited_musu_infra" -and -not [bool](Get-Prop $evidence "payload_transited_musu_infra")) {
        Add-Check "payload path" "pass" "payload did not transit MUSU infrastructure"
    }
    else {
        Add-Check "payload path" "fail" "payload_transited_musu_infra must be false for direct route proof"
    }

    $failureClass = [string](Get-Prop $evidence "failure_class")
    if ([string]::IsNullOrWhiteSpace($failureClass)) {
        Add-Check "failure class" "pass" "failure_class is empty for successful proof"
    }
    else {
        Add-Check "failure class" "fail" "failure_class must be empty for successful proof"
    }

    if ((Has-Property $evidence "total_attempt_ms") -and [int](Get-Prop $evidence "total_attempt_ms") -gt 0) {
        Add-Check "attempt timing" "pass" "total_attempt_ms is positive"
    }
    else {
        Add-Check "attempt timing" "fail" "total_attempt_ms must be positive"
    }
}

$failures = @($checks | Where-Object { $_.status -eq "fail" })
$result = [pscustomobject]@{
    ok = ($failures.Count -eq 0)
    evidence_path = $resolvedEvidencePath
    fail_count = [int]$failures.Count
    version = $ExpectedVersion
    source_node_id = if ($evidence) { [string](Get-Prop $evidence "source_node_id") } else { "" }
    target_node_id = if ($evidence) { [string](Get-Prop $evidence "target_node_id") } else { "" }
    route_kind = if ($evidence) { [string](Get-Prop $evidence "route_kind") } else { "" }
    candidate_addr = if ($evidence) { [string](Get-Prop $evidence "candidate_addr") } else { "" }
    peer_identity_verified = if ($evidence -and (Has-Property $evidence "peer_identity_verified")) { [bool](Get-Prop $evidence "peer_identity_verified") } else { $false }
    encryption = if ($evidence) { [string](Get-Prop $evidence "encryption") } else { "" }
    release_grade_transport = if ($evidence -and (Has-Property $evidence "peer_identity_verified")) { [bool](Get-Prop $evidence "peer_identity_verified") } else { $false }
    checks = @($checks.ToArray())
}

if ($Json) {
    $result | ConvertTo-Json -Depth 8
}
elseif ($result.ok) {
    Write-Host "Direct route evidence verification passed"
}
else {
    Write-Host "Direct route evidence verification failed ($($result.fail_count) failures)"
    foreach ($failure in $failures) {
        Write-Host "- $($failure.name): $($failure.message)"
    }
}

if (-not $result.ok) {
    exit 1
}
