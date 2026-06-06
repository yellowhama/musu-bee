[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$EvidencePath,
    [string]$ExpectedVersion,
    [string]$ExpectedTarget,
    [int]$MaxAgeDays = 30,
    [bool]$RequireFailedReachability = $true,
    [switch]$RequireNonLocalTarget,
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

    Add-Check -Name $Name -Status ($(if ($Condition) { "pass" } else { "fail" })) -Message ($(if ($Condition) { $PassMessage } else { $FailMessage }))
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

function Get-NumberProperty {
    param(
        $Object,
        [Parameter(Mandatory = $true)][string]$Name
    )

    if (-not $Object) {
        return $null
    }
    $property = $Object.PSObject.Properties[$Name]
    if (-not $property -or $null -eq $property.Value) {
        return $null
    }
    try {
        return [double]$property.Value
    }
    catch {
        return $null
    }
}

function Get-ArrayProperty {
    param(
        $Object,
        [Parameter(Mandatory = $true)][string]$Name
    )

    if (-not $Object) {
        return @()
    }
    $property = $Object.PSObject.Properties[$Name]
    if (-not $property -or $null -eq $property.Value) {
        return @()
    }
    return @($property.Value)
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

function Get-CandidateHost {
    param([AllowEmptyString()][string]$CandidateAddr)

    if ([string]::IsNullOrWhiteSpace($CandidateAddr)) {
        return ""
    }

    $withoutScheme = $CandidateAddr.Trim() -replace '^[a-z][a-z0-9+.-]*://', ''
    $authority = (($withoutScheme -split '/', 2)[0]).Trim()
    if ([string]::IsNullOrWhiteSpace($authority)) {
        return ""
    }

    if ($authority.StartsWith("[")) {
        $end = $authority.IndexOf("]")
        if ($end -gt 1) {
            return $authority.Substring(1, $end - 1).Trim().TrimEnd(".")
        }
        return ""
    }

    $colonMatches = [regex]::Matches($authority, ":")
    if ($colonMatches.Count -eq 1) {
        return (($authority -split ":", 2)[0]).Trim().TrimEnd(".")
    }
    return $authority.Trim().TrimEnd(".")
}

function Test-TargetIsLocal {
    param([AllowEmptyString()][string]$CandidateAddr)

    $hostName = (Get-CandidateHost -CandidateAddr $CandidateAddr).ToLowerInvariant()
    if ([string]::IsNullOrWhiteSpace($hostName)) {
        return $true
    }
    if ($hostName -in @("localhost", "localhost.localdomain", "::1", "0:0:0:0:0:0:0:1", "0.0.0.0", "host.docker.internal")) {
        return $true
    }
    if ($hostName -like "*.localhost") {
        return $true
    }
    if ($hostName -eq "127.0.0.1" -or $hostName.StartsWith("127.")) {
        return $true
    }
    return $false
}

function Test-LoopbackHttpUrl {
    param([AllowEmptyString()][string]$Url)

    if ([string]::IsNullOrWhiteSpace($Url)) {
        return $false
    }
    $uri = $null
    if (-not [System.Uri]::TryCreate($Url, [System.UriKind]::Absolute, [ref]$uri)) {
        return $false
    }
    return ($uri.Scheme -in @("http", "https") -and ($uri.Host -eq "127.0.0.1" -or $uri.Host -eq "localhost" -or $uri.Host -eq "::1"))
}

if (-not (Test-Path -LiteralPath $EvidencePath)) {
    throw "Route reachability diagnostic evidence file not found: $EvidencePath"
}

$evidence = Get-Content -LiteralPath $EvidencePath -Raw | ConvertFrom-Json

$schema = Get-StringProperty -Object $evidence -Name "schema"
$version = Get-StringProperty -Object $evidence -Name "version"
$recordedAtText = Get-StringProperty -Object $evidence -Name "recorded_at_utc"
$recordedAt = Try-ParseDateTimeOffset -Text $recordedAtText
$now = [datetimeoffset]::Now
$futureTolerance = [timespan]::FromMinutes(5)
$operatorMachine = Get-StringProperty -Object $evidence -Name "operator_machine"

$status = if ($evidence.PSObject.Properties["status"]) { $evidence.status } else { $null }
$routeExplain = if ($evidence.PSObject.Properties["route_explain"]) { $evidence.route_explain } else { $null }
$selectedCandidate = if ($routeExplain -and $routeExplain.PSObject.Properties["selected_candidate"]) { $routeExplain.selected_candidate } else { $null }
$networkProbe = if ($evidence.PSObject.Properties["network_probe"]) { $evidence.network_probe } else { $null }
$routeAttempt = if ($evidence.PSObject.Properties["route_attempt"]) { $evidence.route_attempt } else { $null }
$conclusion = if ($evidence.PSObject.Properties["conclusion"]) { $evidence.conclusion } else { $null }

$requestedTarget = Get-StringProperty -Object $routeExplain -Name "requested_target"
$peer = if ($status -and $status.PSObject.Properties["peer"]) { $status.peer } else { $null }
$peerName = Get-StringProperty -Object $peer -Name "name"
$selectedAddr = Get-StringProperty -Object $selectedCandidate -Name "addr"
$routeAttemptCandidateAddr = Get-StringProperty -Object $routeAttempt -Name "candidate_addr"
$networkTarget = Get-StringProperty -Object $networkProbe -Name "target"
$networkPort = Get-NumberProperty -Object $networkProbe -Name "port"
$candidateAddressForLocalCheck = if (-not [string]::IsNullOrWhiteSpace($selectedAddr)) { $selectedAddr } elseif (-not [string]::IsNullOrWhiteSpace($networkTarget) -and $networkPort) { "$networkTarget`:$networkPort" } else { $routeAttemptCandidateAddr }
$pathPriority = (Get-ArrayProperty -Object $routeExplain -Name "path_priority" | ForEach-Object { [string]$_ }) -join ","

Add-CheckFromCondition "schema" ($schema -eq "musu.route_reachability_diagnostic.v1") "schema is valid" "schema is '$schema'"
Add-CheckFromCondition "version" ($version -eq $ExpectedVersion) "version matches $ExpectedVersion" "version is '$version', expected '$ExpectedVersion'"
Add-CheckFromCondition "recorded timestamp" ($null -ne $recordedAt) "recorded_at_utc parses" "recorded_at_utc is missing or invalid"
Add-CheckFromCondition "operator machine" (-not [string]::IsNullOrWhiteSpace($operatorMachine)) "operator_machine is present" "operator_machine is missing"
if ($recordedAt) {
    Add-CheckFromCondition "recorded timestamp not future" ($recordedAt -le ($now + $futureTolerance)) "recorded_at_utc is not in the future" "recorded_at_utc is more than 5 minutes in the future"
    Add-CheckFromCondition "evidence age" (($now - $recordedAt).TotalDays -le $MaxAgeDays) "recorded_at_utc is within $MaxAgeDays days" "recorded_at_utc is older than $MaxAgeDays days"
}

Add-CheckFromCondition "local status ok" (Get-BoolProperty -Object $status -Name "ok") "local status reports ok=true" "local status does not report ok=true"
Add-CheckFromCondition "local bridge url" (Test-LoopbackHttpUrl -Url (Get-StringProperty -Object $status -Name "bridge_url")) "local bridge_url is loopback HTTP(S)" "local bridge_url is missing or not loopback HTTP(S)"
$thisNode = if ($status -and $status.PSObject.Properties["this_node"]) { $status.this_node } else { $null }
Add-CheckFromCondition "this node healthy" (Get-BoolProperty -Object $thisNode -Name "healthy") "this node is healthy" "this node is not healthy"
Add-CheckFromCondition "this node self" (Get-BoolProperty -Object $thisNode -Name "is_self") "this node is marked self" "this node is not marked self"
Add-CheckFromCondition "peer registered" (-not [string]::IsNullOrWhiteSpace($peerName)) "peer is registered in status" "peer is missing from status"

if (-not [string]::IsNullOrWhiteSpace($ExpectedTarget)) {
    Add-CheckFromCondition "expected target in route explain" ($requestedTarget -eq $ExpectedTarget) "route explain requested target matches $ExpectedTarget" "route explain requested target is '$requestedTarget', expected '$ExpectedTarget'"
    Add-CheckFromCondition "expected target in status peer" ($peerName -eq $ExpectedTarget) "status peer matches $ExpectedTarget" "status peer is '$peerName', expected '$ExpectedTarget'"
}

Add-CheckFromCondition "route explain schema" ((Get-StringProperty -Object $routeExplain -Name "schema") -eq "musu.route_explain.v1") "route explain schema is valid" "route explain schema is invalid"
Add-CheckFromCondition "route explain candidate count" ((Get-NumberProperty -Object $routeExplain -Name "candidate_count") -gt 0) "route explain has at least one candidate" "route explain has no candidates"
Add-CheckFromCondition "selected candidate address" (-not [string]::IsNullOrWhiteSpace($selectedAddr)) "selected candidate address is present" "selected candidate address is missing"
Add-CheckFromCondition "selected candidate route kind" ((Get-StringProperty -Object $selectedCandidate -Name "route_kind") -in @("lan", "tailscale", "direct_quic", "relay")) "selected route_kind is valid" "selected route_kind is invalid"
Add-CheckFromCondition "selected candidate transport" (-not [string]::IsNullOrWhiteSpace((Get-StringProperty -Object $selectedCandidate -Name "transport_scheme"))) "selected transport_scheme is present" "selected transport_scheme is missing"
Add-CheckFromCondition "release transport requirement" ((Get-StringProperty -Object $routeExplain -Name "release_grade_transport_required") -eq "quic_tls_1_3") "release transport requirement is quic_tls_1_3" "release transport requirement is not quic_tls_1_3"
Add-CheckFromCondition "path priority" ($pathPriority -eq "lan,tailscale,direct_quic,relay") "path priority is canonical" "path priority is '$pathPriority', expected lan,tailscale,direct_quic,relay"

Add-CheckFromCondition "network probe target" (-not [string]::IsNullOrWhiteSpace($networkTarget)) "network probe target is present" "network probe target is missing"
Add-CheckFromCondition "network probe port" ($networkPort -and $networkPort -gt 0) "network probe port is present" "network probe port is missing or invalid"
if ($RequireNonLocalTarget) {
    Add-CheckFromCondition "non-local route target" (-not (Test-TargetIsLocal -CandidateAddr $candidateAddressForLocalCheck)) "route target is non-local" "route target is local-only and cannot prove second-PC reachability"
}

Add-CheckFromCondition "route attempt schema" ((Get-StringProperty -Object $routeAttempt -Name "schema") -eq "musu.route_evidence.v1") "route attempt schema is valid" "route attempt schema is invalid"
Add-CheckFromCondition "route attempt target" ((Get-StringProperty -Object $routeAttempt -Name "target_node_id") -eq $requestedTarget -or [string]::IsNullOrWhiteSpace($requestedTarget)) "route attempt target matches route explain" "route attempt target does not match route explain"
Add-CheckFromCondition "route attempt candidate address" ($routeAttemptCandidateAddr -eq $selectedAddr -or [string]::IsNullOrWhiteSpace($selectedAddr)) "route attempt candidate address matches selected candidate" "route attempt candidate address '$routeAttemptCandidateAddr' does not match selected candidate '$selectedAddr'"

if ($RequireFailedReachability) {
    $routeAttemptFailed = ((Get-StringProperty -Object $routeAttempt -Name "result") -eq "failed")
    $failureClass = Get-StringProperty -Object $routeAttempt -Name "failure_class"
    $tcpFailed = -not (Get-BoolProperty -Object $networkProbe -Name "tcp_test_succeeded")
    $peerUnhealthy = -not (Get-BoolProperty -Object $peer -Name "healthy")
    Add-CheckFromCondition "failed route attempt" $routeAttemptFailed "route attempt records failed result" "route attempt does not record failed result"
    Add-CheckFromCondition "failed route failure class" (-not [string]::IsNullOrWhiteSpace($failureClass)) "failed route records failure_class" "failed route failure_class is missing"
    Add-CheckFromCondition "target peer unhealthy" $peerUnhealthy "target peer is unhealthy in status" "target peer is healthy; this is not failed reachability evidence"
    Add-CheckFromCondition "tcp reachability failed" $tcpFailed "TCP reachability failed as expected for diagnostic evidence" "TCP reachability succeeded; this is not failed reachability evidence"
    Add-CheckFromCondition "not release-grade route" (-not (Get-BoolProperty -Object $conclusion -Name "manual_lan_candidate_is_release_grade")) "conclusion keeps manual candidate non-release-grade" "conclusion marks manual candidate release-grade"
    Add-CheckFromCondition "not successful multi-device proof" (-not (Get-BoolProperty -Object $conclusion -Name "successful_multi_device_route_proof")) "conclusion keeps successful multi-device proof false" "conclusion incorrectly marks successful multi-device proof true"
}

Add-CheckFromCondition "local runtime conclusion" (Get-BoolProperty -Object $conclusion -Name "local_musu_desktop_runtime_healthy") "conclusion records healthy local MUSU Desktop runtime" "conclusion does not record healthy local runtime"
Add-CheckFromCondition "neighbor entry caveat" (Get-BoolProperty -Object $networkProbe -Name "neighbor_entry_is_not_route_success_proof") "network probe records neighbor entry is not route success proof" "network probe is missing neighbor-entry caveat"
Add-CheckFromCondition "MUSU infra relay not used" (-not (Get-BoolProperty -Object $conclusion -Name "musu_pro_relay_route_used")) "conclusion records MUSU.PRO relay was not used" "conclusion incorrectly records MUSU.PRO relay route used"

$failedChecks = @($checks | Where-Object { $_.status -ne "pass" })
$result = [pscustomobject]@{
    schema = "musu.route_reachability_verification.v1"
    ok = ($failedChecks.Count -eq 0)
    evidence_path = (Resolve-Path -LiteralPath $EvidencePath).Path
    expected_version = $ExpectedVersion
    expected_target = $ExpectedTarget
    require_failed_reachability = [bool]$RequireFailedReachability
    require_non_local_target = [bool]$RequireNonLocalTarget
    fail_count = [int]$failedChecks.Count
    checks = $checks.ToArray()
}

if ($Json) {
    $result | ConvertTo-Json -Depth 8
}
else {
    "MUSU route reachability diagnostic verification"
    "ok: $($result.ok)"
    "fail_count: $($result.fail_count)"
    $checks | Format-Table name, status, message -Wrap
}

if (-not $result.ok) {
    exit 1
}
