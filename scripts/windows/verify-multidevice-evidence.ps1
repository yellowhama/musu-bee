[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$EvidencePath,
    [string]$ExpectedVersion,
    [string]$ExpectedRouteOutput = "MUSU_REMOTE_ROUTE_OK",
    [int]$MaxAgeDays = 30,
    [switch]$AllowStatusOnly,
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

function Add-CheckFromCondition([string]$Name, [bool]$Condition, [string]$PassMessage, [string]$FailMessage) {
    if ($Condition) {
        Add-Check -Name $Name -Status "pass" -Message $PassMessage
    }
    else {
        Add-Check -Name $Name -Status "fail" -Message $FailMessage
    }
}

function Get-StringProperty {
    param(
        [Parameter(Mandatory = $true)]$Object,
        [Parameter(Mandatory = $true)][string]$Name
    )

    $property = $Object.PSObject.Properties[$Name]
    if (-not $property -or $null -eq $property.Value) {
        return ""
    }
    return [string]$property.Value
}

function Get-BoolProperty {
    param(
        [Parameter(Mandatory = $true)]$Object,
        [Parameter(Mandatory = $true)][string]$Name
    )

    $property = $Object.PSObject.Properties[$Name]
    if (-not $property -or $null -eq $property.Value) {
        return $false
    }
    return [bool]$property.Value
}

function Test-JsonProperty {
    param(
        [Parameter(Mandatory = $true)]$Object,
        [Parameter(Mandatory = $true)][string]$Name
    )

    return ($Object -and $null -ne $Object.PSObject.Properties[$Name])
}

function Get-ArrayProperty {
    param(
        [Parameter(Mandatory = $true)]$Object,
        [Parameter(Mandatory = $true)][string]$Name
    )

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

function Get-NumberProperty {
    param(
        [Parameter(Mandatory = $true)]$Object,
        [Parameter(Mandatory = $true)][string]$Name
    )

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

function Get-CommandEvidence {
    param(
        [object[]]$Commands = @(),
        [Parameter(Mandatory = $true)][string]$Pattern
    )

    @($Commands | Where-Object {
        ([string]$_.command) -like $Pattern
    }) | Select-Object -First 1
}

function Get-RouteCommandEvidence {
    param(
        [object[]]$Commands = @(),
        [switch]$Explain
    )

    @($Commands | Where-Object {
        $commandText = [string]$_.command
        if ($commandText -notlike "musu route *") {
            return $false
        }
        $isExplain = ($commandText -match '(^|\s)--explain(\s|$)')
        if ($Explain) {
            return $isExplain
        }
        return (-not $isExplain)
    }) | Select-Object -First 1
}

function Convert-OutputJson($Command) {
    if (-not $Command -or [string]::IsNullOrWhiteSpace([string]$Command.output)) {
        return $null
    }
    try {
        return ([string]$Command.output) | ConvertFrom-Json
    }
    catch {
        return $null
    }
}

if (-not (Test-Path -LiteralPath $EvidencePath)) {
    throw "Evidence file not found: $EvidencePath"
}

$evidence = Get-Content -LiteralPath $EvidencePath -Raw | ConvertFrom-Json

$schema = Get-StringProperty -Object $evidence -Name "schema"
$version = Get-StringProperty -Object $evidence -Name "version"
$startedAt = Try-ParseDateTimeOffset -Text (Get-StringProperty -Object $evidence -Name "started_at")
$completedAt = Try-ParseDateTimeOffset -Text (Get-StringProperty -Object $evidence -Name "completed_at")
$commands = Get-ArrayProperty -Object $evidence -Name "commands"
$discoverChecked = Get-BoolProperty -Object $evidence -Name "discover_checked"
$routeChecked = Get-BoolProperty -Object $evidence -Name "route_checked"
$remoteAddr = Get-StringProperty -Object $evidence -Name "remote_addr"
$remoteName = Get-StringProperty -Object $evidence -Name "remote_name"
$operatorMachine = Get-StringProperty -Object $evidence -Name "operator_machine"
$operatorUser = Get-StringProperty -Object $evidence -Name "operator_user"
$scriptError = Get-StringProperty -Object $evidence -Name "error"
$routeEvidence = $null
if ($evidence.PSObject.Properties["route_evidence"]) {
    $routeEvidence = $evidence.route_evidence
}
$routeExplainEvidence = $null
if ($evidence.PSObject.Properties["route_explain"]) {
    $routeExplainEvidence = $evidence.route_explain
}

Add-CheckFromCondition "schema" ($schema -eq "musu.multidevice_smoke_evidence.v1") "schema is valid" "schema is not musu.multidevice_smoke_evidence.v1"
Add-CheckFromCondition "evidence ok" (Get-BoolProperty -Object $evidence -Name "ok") "evidence reports ok=true" "evidence does not report ok=true"
Add-CheckFromCondition "version" (-not [string]::IsNullOrWhiteSpace($version)) "version is present" "version is missing"
Add-CheckFromCondition "expected version" ($version -eq $ExpectedVersion) "version matches $ExpectedVersion" "version does not match $ExpectedVersion"
Add-CheckFromCondition "started timestamp" ($null -ne $startedAt) "started_at parses" "started_at is missing or invalid"
Add-CheckFromCondition "completed timestamp" ($null -ne $completedAt) "completed_at parses" "completed_at is missing or invalid"
if ($completedAt) {
    $age = [datetimeoffset]::Now - $completedAt
    Add-CheckFromCondition "evidence age" ($age.TotalDays -le $MaxAgeDays -and $age.TotalSeconds -ge -300) "completed_at is within $MaxAgeDays days" "completed_at is outside the allowed evidence window"
}
if ($startedAt -and $completedAt) {
    Add-CheckFromCondition "timestamp order" ($completedAt -ge $startedAt) "completed_at is after started_at" "completed_at is before started_at"
}
Add-CheckFromCondition "operator machine" (-not [string]::IsNullOrWhiteSpace($operatorMachine)) "operator machine is present" "operator machine is missing"
Add-CheckFromCondition "operator user" (-not [string]::IsNullOrWhiteSpace($operatorUser)) "operator user is present" "operator user is missing"
Add-CheckFromCondition "remote address" (-not [string]::IsNullOrWhiteSpace($remoteAddr)) "remote_addr is present" "remote_addr is missing"
Add-CheckFromCondition "remote address includes port" ($remoteAddr -match ":\d+$") "remote_addr includes a port" "remote_addr must include host:port"
Add-CheckFromCondition "remote name" (-not [string]::IsNullOrWhiteSpace($remoteName)) "remote_name is present" "remote_name is missing"
Add-CheckFromCondition "command log" (@($commands).Count -gt 0) "command log is present" "command log is empty"
Add-CheckFromCondition "no script error" ([string]::IsNullOrWhiteSpace($scriptError)) "script error field is empty" "script error field is not empty: $scriptError"

if (@($commands).Count -gt 0) {
    $up = Get-CommandEvidence -Commands $commands -Pattern "musu up --json"
    $doctor = Get-CommandEvidence -Commands $commands -Pattern "musu doctor --json"
    $peerAdd = Get-CommandEvidence -Commands $commands -Pattern "musu peer add *"
    $peerList = Get-CommandEvidence -Commands $commands -Pattern "musu peer list"
    $discover = Get-CommandEvidence -Commands $commands -Pattern "musu discover *"
    $status = Get-CommandEvidence -Commands $commands -Pattern "musu status"
    $routeExplain = Get-RouteCommandEvidence -Commands $commands -Explain
    $route = Get-RouteCommandEvidence -Commands $commands
}
else {
    $up = $null
    $doctor = $null
    $peerAdd = $null
    $peerList = $null
    $discover = $null
    $status = $null
    $routeExplain = $null
    $route = $null
}

foreach ($entry in @(
    @{ name = "musu up"; command = $up },
    @{ name = "musu doctor"; command = $doctor },
    @{ name = "musu peer add"; command = $peerAdd },
    @{ name = "musu peer list"; command = $peerList },
    @{ name = "musu status"; command = $status }
)) {
    $command = $entry.command
    Add-CheckFromCondition "$($entry.name) present" ($null -ne $command) "$($entry.name) command is recorded" "$($entry.name) command is missing"
    if ($command) {
        Add-CheckFromCondition "$($entry.name) exit" ([int]$command.exit_code -eq 0) "$($entry.name) exited 0" "$($entry.name) exit code was $($command.exit_code)"
    }
}

if ($discoverChecked) {
    Add-CheckFromCondition "musu discover present" ($null -ne $discover) "discover command is recorded" "discover_checked=true but discover command is missing"
    if ($discover) {
        Add-CheckFromCondition "musu discover exit" ([int]$discover.exit_code -eq 0) "discover exited 0" "discover exit code was $($discover.exit_code)"
    }
}

$upJson = Convert-OutputJson -Command $up
Add-CheckFromCondition "up json" ($null -ne $upJson) "musu up output parses as JSON" "musu up output is not parseable JSON"
if ($upJson) {
    Add-CheckFromCondition "up ok" ([bool]$upJson.ok) "musu up reports ok" "musu up did not report ok"
    Add-CheckFromCondition "up bridge" ($upJson.bridge.status -eq "ok") "musu up bridge status is ok" "musu up bridge status is not ok"
}

$doctorJson = Convert-OutputJson -Command $doctor
Add-CheckFromCondition "doctor json" ($null -ne $doctorJson) "musu doctor output parses as JSON" "musu doctor output is not parseable JSON"
if ($doctorJson) {
    Add-CheckFromCondition "doctor overall" ($doctorJson.overall -ne "fail") "doctor overall is not fail" "doctor overall is fail"
    Add-CheckFromCondition "doctor bridge" ($doctorJson.bridge.status -eq "ok") "doctor bridge status is ok" "doctor bridge status is not ok"
}

if ($peerList) {
    $peerListText = [string]$peerList.output
    Add-CheckFromCondition `
        "peer listed" `
        ($peerListText.Contains($remoteAddr) -or $peerListText.Contains($remoteName)) `
        "peer list contains the remote address or name" `
        "peer list does not contain remote address '$remoteAddr' or name '$remoteName'"
}

if ($status) {
    Add-CheckFromCondition `
        "fleet status rendered" `
        (([string]$status.output).Contains("MUSU Fleet Status")) `
        "fleet status rendered" `
        "fleet status output did not render"
}

$routeRequired = -not $AllowStatusOnly
if ($routeRequired) {
    Add-CheckFromCondition "route checked" $routeChecked "route_checked=true" "route_checked is not true"
    Add-CheckFromCondition "route explain command present" ($null -ne $routeExplain) "route explain command is recorded" "route explain command is missing"
    if ($routeExplain) {
        Add-CheckFromCondition "route explain exit" ([int]$routeExplain.exit_code -eq 0) "route explain exited 0" "route explain exit code was $($routeExplain.exit_code)"
    }
    $routeExplainJson = if ($routeExplainEvidence) { $routeExplainEvidence } else { Convert-OutputJson -Command $routeExplain }
    Add-CheckFromCondition "route explain evidence present" ($null -ne $routeExplainJson) "route explain evidence is present" "route explain evidence is missing"
    if ($routeExplainJson) {
        $routeExplainSchema = Get-StringProperty -Object $routeExplainJson -Name "schema"
        $routeExplainVersion = Get-StringProperty -Object $routeExplainJson -Name "version"
        $routeExplainEndpoint = Get-StringProperty -Object $routeExplainJson -Name "submission_endpoint"
        $routeExplainReleaseTransport = Get-StringProperty -Object $routeExplainJson -Name "release_grade_transport_required"
        $routeExplainRelayPolicy = Get-StringProperty -Object $routeExplainJson -Name "relay_policy"
        $routeExplainPathPriority = Get-ArrayProperty -Object $routeExplainJson -Name "path_priority"
        $routeExplainSelected = $null
        if ($routeExplainJson.PSObject.Properties["selected_candidate"]) {
            $routeExplainSelected = $routeExplainJson.selected_candidate
        }
        $routeExplainSelectedKind = if ($routeExplainSelected) { Get-StringProperty -Object $routeExplainSelected -Name "route_kind" } else { "" }

        Add-CheckFromCondition "route explain schema" ($routeExplainSchema -eq "musu.route_explain.v1") "route explain schema is valid" "route explain schema is not musu.route_explain.v1"
        Add-CheckFromCondition "route explain version" ($routeExplainVersion -eq $ExpectedVersion) "route explain version matches $ExpectedVersion" "route explain version does not match $ExpectedVersion"
        Add-CheckFromCondition "route explain endpoint" ($routeExplainEndpoint -match "/api/tasks/delegate$") "route explain submission endpoint is a delegate endpoint" "route explain submission endpoint is missing or invalid"
        Add-CheckFromCondition "route explain selected candidate" ($null -ne $routeExplainSelected) "route explain selected a candidate" "route explain did not select a candidate"
        Add-CheckFromCondition "route explain route kind" (@("lan", "tailscale", "direct_quic", "relay") -contains $routeExplainSelectedKind) "route explain selected route_kind is $routeExplainSelectedKind" "route explain selected route_kind is missing or invalid"
        Add-CheckFromCondition "route explain path priority" ((@($routeExplainPathPriority) -join ",") -eq "lan,tailscale,direct_quic,relay") "route explain path priority is lan,tailscale,direct_quic,relay" "route explain path priority is missing or out of order"
        Add-CheckFromCondition "route explain release transport" ($routeExplainReleaseTransport -eq "quic_tls_1_3") "route explain release transport is quic_tls_1_3" "route explain release transport is not quic_tls_1_3"
        Add-CheckFromCondition "route explain relay policy" ($routeExplainRelayPolicy -match "fallback" -and $routeExplainRelayPolicy -match "must not become the default data path") "route explain relay policy documents fallback, not default data path" "route explain relay policy is missing or unsafe"
    }

    Add-CheckFromCondition "route command present" ($null -ne $route) "route command is recorded" "route command is missing"
    if ($route) {
        Add-CheckFromCondition "route exit" ([int]$route.exit_code -eq 0) "route exited 0" "route exit code was $($route.exit_code)"
        Add-CheckFromCondition `
            "route expected output" `
            (([string]$route.output).Contains($ExpectedRouteOutput)) `
            "route output contains $ExpectedRouteOutput" `
            "route output does not contain $ExpectedRouteOutput"
    }

    Add-CheckFromCondition "route evidence present" ($null -ne $routeEvidence) "route_evidence is present" "route_evidence is missing"
    if ($routeEvidence) {
        $allowedRouteKinds = @("lan", "tailscale", "direct_quic", "relay", "failed")
        $routeEvidenceSchema = Get-StringProperty -Object $routeEvidence -Name "schema"
        $routeEvidenceVersion = Get-StringProperty -Object $routeEvidence -Name "version"
        $routeKind = Get-StringProperty -Object $routeEvidence -Name "route_kind"
        $candidateAddr = Get-StringProperty -Object $routeEvidence -Name "candidate_addr"
        $encryption = Get-StringProperty -Object $routeEvidence -Name "encryption"
        $peerIdentityMethod = Get-StringProperty -Object $routeEvidence -Name "peer_identity_method"
        $peerPublicKey = Get-StringProperty -Object $routeEvidence -Name "peer_public_key"
        $routeResult = Get-StringProperty -Object $routeEvidence -Name "result"
        $transportVerifiedBy = Get-StringProperty -Object $routeEvidence -Name "transport_verified_by"
        $recordedAt = Try-ParseDateTimeOffset -Text (Get-StringProperty -Object $routeEvidence -Name "recorded_at")
        $handshakeMs = Get-NumberProperty -Object $routeEvidence -Name "handshake_ms"
        $totalAttemptMs = Get-NumberProperty -Object $routeEvidence -Name "total_attempt_ms"
        $peerIdentityPresent = Test-JsonProperty -Object $routeEvidence -Name "peer_identity_verified"
        $peerIdentityVerified = Get-BoolProperty -Object $routeEvidence -Name "peer_identity_verified"
        $payloadTransitPresent = Test-JsonProperty -Object $routeEvidence -Name "payload_transited_musu_infra"
        $payloadTransited = Get-BoolProperty -Object $routeEvidence -Name "payload_transited_musu_infra"
        $legacyEncryptionValues = @("", "none", "http", "none_http_bearer", "unknown")

        Add-CheckFromCondition "route evidence schema" ($routeEvidenceSchema -eq "musu.route_evidence.v1") "route_evidence schema is valid" "route_evidence schema is not musu.route_evidence.v1"
        Add-CheckFromCondition "route evidence version" ($routeEvidenceVersion -eq $ExpectedVersion) "route_evidence version matches $ExpectedVersion" "route_evidence version does not match $ExpectedVersion"
        Add-CheckFromCondition "route kind" ($allowedRouteKinds -contains $routeKind -and $routeKind -ne "failed") "route_kind is $routeKind" "route_kind must be one of lan/tailscale/direct_quic/relay and not failed for passing evidence"
        Add-CheckFromCondition "route candidate address" (-not [string]::IsNullOrWhiteSpace($candidateAddr) -and $candidateAddr -match ":\d+$") "route candidate_addr includes host:port" "route candidate_addr is missing or lacks a port"
        Add-CheckFromCondition "route result" ($routeResult -eq "success") "route evidence result is success" "route evidence result is not success"
        Add-CheckFromCondition "route recorded timestamp" ($null -ne $recordedAt) "route evidence recorded_at parses" "route evidence recorded_at is missing or invalid"
        Add-CheckFromCondition "route handshake timing" ($null -ne $handshakeMs -and $handshakeMs -ge 0) "route handshake_ms is present" "route handshake_ms is missing or invalid"
        Add-CheckFromCondition "route total timing" ($null -ne $totalAttemptMs -and $totalAttemptMs -gt 0) "route total_attempt_ms is present" "route total_attempt_ms is missing or invalid"
        Add-CheckFromCondition "route peer identity field" $peerIdentityPresent "peer_identity_verified is present" "peer_identity_verified is missing"
        Add-CheckFromCondition "route peer identity verified" $peerIdentityVerified "peer identity is verified" "peer identity is not verified"
        Add-CheckFromCondition "route peer identity method" (-not [string]::IsNullOrWhiteSpace($peerIdentityMethod)) "peer_identity_method is $peerIdentityMethod" "peer_identity_method is missing"
        Add-CheckFromCondition "route peer public key" (-not [string]::IsNullOrWhiteSpace($peerPublicKey)) "peer_public_key is present" "peer_public_key is missing"
        Add-CheckFromCondition "route encryption field" (-not [string]::IsNullOrWhiteSpace($encryption)) "route encryption field is present" "route encryption field is missing"
        Add-CheckFromCondition "route encryption hardened" (-not ($legacyEncryptionValues -contains $encryption.ToLowerInvariant())) "route encryption is $encryption" "route encryption is legacy or unproven: $encryption"
        Add-CheckFromCondition "route encryption release-grade" ($encryption.ToLowerInvariant() -eq "quic_tls_1_3") "route encryption is quic_tls_1_3" "route encryption is not release-grade QUIC/TLS: $encryption"
        Add-CheckFromCondition "route transport proof" ($transportVerifiedBy -eq "musu_quic_tls_transport") "route transport proof is musu_quic_tls_transport" "route transport proof is missing or not release-grade: $transportVerifiedBy"
        Add-CheckFromCondition "route payload transit field" $payloadTransitPresent "payload_transited_musu_infra is present" "payload_transited_musu_infra is missing"
        if ($routeKind -eq "relay") {
            Add-CheckFromCondition "relay transit truth" $payloadTransited "relay evidence says payload transited MUSU infra" "relay route must set payload_transited_musu_infra=true"
        }
        elseif ($allowedRouteKinds -contains $routeKind) {
            Add-CheckFromCondition "direct transit truth" (-not $payloadTransited) "direct route evidence says payload did not transit MUSU infra" "non-relay route must set payload_transited_musu_infra=false"
        }
    }
}
elseif ($routeChecked -and $route) {
    Add-CheckFromCondition "route exit" ([int]$route.exit_code -eq 0) "route exited 0" "route exit code was $($route.exit_code)"
}

$failCount = @($checks | Where-Object { $_.status -eq "fail" }).Count
$result = [pscustomobject]@{
    ok = ($failCount -eq 0)
    evidence_path = (Resolve-Path -LiteralPath $EvidencePath).Path
    fail_count = $failCount
    version = $version
    remote_addr = $remoteAddr
    remote_name = $remoteName
    route_checked = $routeChecked
    route_kind = if ($routeEvidence) { Get-StringProperty -Object $routeEvidence -Name "route_kind" } else { $null }
    checks = $checks.ToArray()
}

if ($Json) {
    $result | ConvertTo-Json -Depth 6
}
else {
    "MUSU multi-device evidence verification"
    "ok: $($result.ok)"
    "evidence_path: $($result.evidence_path)"
    "remote: $($result.remote_name) <$($result.remote_addr)>"
    "route_checked: $($result.route_checked)"
    ""
    $checks | Format-Table name, status, message -Wrap
}

if (-not $result.ok) {
    exit 1
}
