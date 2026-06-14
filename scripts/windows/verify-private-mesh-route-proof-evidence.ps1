[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$EvidencePath,
    [string]$ExpectedTargetIp,
    [string]$ExpectedControlServerUrl,
    [int]$MaxAgeDays = 30,
    [switch]$AllowMissingIntegritySidecar,
    [switch]$Json
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
. (Join-Path $scriptDir "evidence-integrity.ps1")

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

    if ($Condition) {
        Add-Check -Name $Name -Status "pass" -Message $PassMessage
    }
    else {
        Add-Check -Name $Name -Status "fail" -Message $FailMessage
    }
}

function Get-PropertyValue {
    param(
        $Object,
        [Parameter(Mandatory = $true)][string]$Name
    )

    if (-not $Object) {
        return $null
    }
    $property = $Object.PSObject.Properties[$Name]
    if (-not $property) {
        return $null
    }
    return $property.Value
}

function Get-StringProperty {
    param(
        $Object,
        [Parameter(Mandatory = $true)][string]$Name
    )

    $value = Get-PropertyValue -Object $Object -Name $Name
    if ($null -eq $value) {
        return ""
    }
    return [string]$value
}

function Get-BoolProperty {
    param(
        $Object,
        [Parameter(Mandatory = $true)][string]$Name
    )

    $value = Get-PropertyValue -Object $Object -Name $Name
    if ($null -eq $value) {
        return $false
    }
    return [bool]$value
}

function Get-IntProperty {
    param(
        $Object,
        [Parameter(Mandatory = $true)][string]$Name
    )

    $value = Get-PropertyValue -Object $Object -Name $Name
    if ($null -eq $value) {
        return $null
    }
    try {
        return [int]$value
    }
    catch {
        return $null
    }
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

function Test-TailnetIpv4 {
    param([string]$Value)

    return ($Value -match '^100\.(6[4-9]|[7-9][0-9]|1[01][0-9]|12[0-7])\.([0-9]{1,3})\.([0-9]{1,3})$')
}

function Normalize-OriginUrl {
    param([string]$Url)

    if ([string]::IsNullOrWhiteSpace($Url)) {
        return ""
    }
    return $Url.Trim().TrimEnd("/")
}

if (-not (Test-Path -LiteralPath $EvidencePath)) {
    throw "Evidence file not found: $EvidencePath"
}

$resolvedEvidencePath = (Resolve-Path -LiteralPath $EvidencePath).Path
$integrity = Test-EvidenceIntegritySidecar -EvidencePath $resolvedEvidencePath
$integrityOk = [bool]$integrity.ok
if ($AllowMissingIntegritySidecar -and [string]$integrity.status -eq "missing") {
    Add-Check -Name "integrity sidecar" -Status "pass" -Message "integrity sidecar missing but explicitly allowed"
}
else {
    Add-CheckFromCondition `
        -Name "integrity sidecar" `
        -Condition $integrityOk `
        -PassMessage "evidence sha256 matches sidecar" `
        -FailMessage ([string]$integrity.message)
}

$evidence = Get-Content -LiteralPath $resolvedEvidencePath -Raw | ConvertFrom-Json
$schema = Get-StringProperty -Object $evidence -Name "schema"
$startedAt = Try-ParseDateTimeOffset -Text (Get-StringProperty -Object $evidence -Name "started_at")
$completedAt = Try-ParseDateTimeOffset -Text (Get-StringProperty -Object $evidence -Name "completed_at")
$targetIp = Get-StringProperty -Object $evidence -Name "target_ip"
$expectedControlServer = Normalize-OriginUrl (Get-StringProperty -Object $evidence -Name "expected_control_server_url")
$meshStatus = Get-PropertyValue -Object $evidence -Name "mesh_status"
$meshVerify = Get-PropertyValue -Object $evidence -Name "mesh_verify"
$realPeer = Get-PropertyValue -Object $evidence -Name "real_peer_evidence"
$postStatus = Get-PropertyValue -Object $evidence -Name "post_callback_mesh_status"

Add-CheckFromCondition -Name "schema" -Condition ($schema -eq "musu.private_mesh_route_proof_smoke.v1") -PassMessage "schema is valid" -FailMessage "unexpected schema: $schema"
Add-CheckFromCondition -Name "evidence ok" -Condition (Get-BoolProperty -Object $evidence -Name "ok") -PassMessage "evidence reports ok=true" -FailMessage "evidence does not report ok=true"
Add-CheckFromCondition -Name "started timestamp" -Condition ($null -ne $startedAt) -PassMessage "started_at parses" -FailMessage "started_at missing or invalid"
Add-CheckFromCondition -Name "completed timestamp" -Condition ($null -ne $completedAt) -PassMessage "completed_at parses" -FailMessage "completed_at missing or invalid"
if ($startedAt -and $completedAt) {
    Add-CheckFromCondition -Name "timestamp order" -Condition ($completedAt -ge $startedAt) -PassMessage "completed_at is after started_at" -FailMessage "completed_at is before started_at"
    Add-CheckFromCondition -Name "evidence age" -Condition ($completedAt -ge ([datetimeoffset]::Now.AddDays(-1 * $MaxAgeDays))) -PassMessage "completed_at is within $MaxAgeDays days" -FailMessage "completed_at is older than $MaxAgeDays days"
}
else {
    Add-Check -Name "timestamp order" -Status "fail" -Message "timestamp order cannot be checked"
    Add-Check -Name "evidence age" -Status "fail" -Message "evidence age cannot be checked"
}

Add-CheckFromCondition -Name "target ip present" -Condition (Test-TailnetIpv4 $targetIp) -PassMessage "target_ip is a 100.64.0.0/10 tailnet IPv4" -FailMessage "target_ip is missing or not a tailnet IPv4: $targetIp"
if (-not [string]::IsNullOrWhiteSpace($ExpectedTargetIp)) {
    Add-CheckFromCondition -Name "expected target ip" -Condition ($targetIp -eq $ExpectedTargetIp) -PassMessage "target_ip matches expected target" -FailMessage "target_ip mismatch: expected $ExpectedTargetIp got $targetIp"
}

$meshStatusSchema = Get-StringProperty -Object $meshStatus -Name "schema"
$meshStatusMode = Get-StringProperty -Object $meshStatus -Name "mode"
$meshStatusControlUrl = Normalize-OriginUrl (Get-StringProperty -Object $meshStatus -Name "control_server_url")
Add-CheckFromCondition -Name "initial mesh status present" -Condition ($null -ne $meshStatus) -PassMessage "mesh_status is present" -FailMessage "mesh_status is missing"
Add-CheckFromCondition -Name "initial mesh status schema" -Condition ($meshStatusSchema -eq "musu.private_mesh_status.v1") -PassMessage "mesh_status schema is valid" -FailMessage "mesh_status schema invalid: $meshStatusSchema"
Add-CheckFromCondition -Name "initial mesh mode" -Condition ($meshStatusMode -eq "musu_headscale") -PassMessage "initial status is MUSU Headscale mode" -FailMessage "initial mode is not musu_headscale: $meshStatusMode"
Add-CheckFromCondition -Name "initial control server verified" -Condition (Get-BoolProperty -Object $meshStatus -Name "control_server_verified") -PassMessage "initial control_server_verified=true" -FailMessage "initial control_server_verified is false"
Add-CheckFromCondition -Name "initial control server url" -Condition (-not [string]::IsNullOrWhiteSpace($meshStatusControlUrl)) -PassMessage "initial control_server_url is present" -FailMessage "initial control_server_url is missing"

if (-not [string]::IsNullOrWhiteSpace($ExpectedControlServerUrl)) {
    $normalizedExpectedControlServer = Normalize-OriginUrl $ExpectedControlServerUrl
    Add-CheckFromCondition -Name "expected control server url" -Condition ($meshStatusControlUrl -eq $normalizedExpectedControlServer) -PassMessage "control_server_url matches expected URL" -FailMessage "control_server_url mismatch: expected $normalizedExpectedControlServer got $meshStatusControlUrl"
}
elseif (-not [string]::IsNullOrWhiteSpace($expectedControlServer)) {
    Add-CheckFromCondition -Name "evidence control server url" -Condition ($meshStatusControlUrl -eq $expectedControlServer) -PassMessage "control_server_url matches evidence expected URL" -FailMessage "control_server_url mismatch: expected $expectedControlServer got $meshStatusControlUrl"
}

$verifySchema = Get-StringProperty -Object $meshVerify -Name "schema"
$verifyTargetIp = Get-StringProperty -Object $meshVerify -Name "target_ip"
$verifyPing = Get-PropertyValue -Object $meshVerify -Name "ping"
Add-CheckFromCondition -Name "mesh verify present" -Condition ($null -ne $meshVerify) -PassMessage "mesh_verify is present" -FailMessage "mesh_verify is missing"
Add-CheckFromCondition -Name "mesh verify schema" -Condition ($verifySchema -eq "musu.private_mesh_verify.v1") -PassMessage "mesh_verify schema is valid" -FailMessage "mesh_verify schema invalid: $verifySchema"
Add-CheckFromCondition -Name "mesh verify target" -Condition ($verifyTargetIp -eq $targetIp) -PassMessage "mesh_verify target matches evidence target" -FailMessage "mesh_verify target mismatch: expected $targetIp got $verifyTargetIp"
Add-CheckFromCondition -Name "tailnet ping" -Condition ((Get-BoolProperty -Object $verifyPing -Name "found") -and ((Get-IntProperty -Object $verifyPing -Name "exit_code") -eq 0)) -PassMessage "tailscale ping succeeded" -FailMessage "tailscale ping was not proven"
Add-CheckFromCondition -Name "target bridge health" -Condition (Get-BoolProperty -Object $meshVerify -Name "bridge_health_ok") -PassMessage "target bridge health succeeded" -FailMessage "target bridge health was not proven"

$realPeerSchema = Get-StringProperty -Object $realPeer -Name "schema"
$realPeerRoute = Get-StringProperty -Object $realPeer -Name "expected_route_kind"
$realPeerTailIp = Get-StringProperty -Object $realPeer -Name "tailscale_ip"
$realPeerStatus = Get-PropertyValue -Object $realPeer -Name "task_status"
Add-CheckFromCondition -Name "real peer evidence present" -Condition ($null -ne $realPeer) -PassMessage "real_peer_evidence is present" -FailMessage "real_peer_evidence is missing"
Add-CheckFromCondition -Name "real peer schema" -Condition ($realPeerSchema -eq "musu.real_peer_route_proof_smoke.v1") -PassMessage "real_peer_evidence schema is valid" -FailMessage "real_peer_evidence schema invalid: $realPeerSchema"
Add-CheckFromCondition -Name "real peer ok" -Condition (Get-BoolProperty -Object $realPeer -Name "ok") -PassMessage "real peer evidence reports ok=true" -FailMessage "real peer evidence does not report ok=true"
Add-CheckFromCondition -Name "real peer route kind" -Condition ($realPeerRoute -eq "tailscale") -PassMessage "delegated proof used tailscale route" -FailMessage "delegated proof route kind is not tailscale: $realPeerRoute"
Add-CheckFromCondition -Name "real peer target binding" -Condition ($realPeerTailIp -eq $targetIp) -PassMessage "real peer tailnet IP matches target" -FailMessage "real peer tailscale_ip mismatch: expected $targetIp got $realPeerTailIp"
Add-CheckFromCondition -Name "delegated task done" -Condition ((Get-StringProperty -Object $realPeerStatus -Name "status") -eq "done") -PassMessage "delegated task reached done" -FailMessage "delegated task did not reach done"
Add-CheckFromCondition -Name "callback delivered" -Condition (Get-BoolProperty -Object $realPeerStatus -Name "callback_delivered") -PassMessage "source cockpit callback was delivered" -FailMessage "callback_delivered is not true"

$postVerification = Get-PropertyValue -Object $postStatus -Name "verification"
$postTarget = Get-StringProperty -Object $postStatus -Name "verified_target_tailnet_ip"
$postCallback = Get-StringProperty -Object $postStatus -Name "callback_tailnet_ip"
Add-CheckFromCondition -Name "post callback status present" -Condition ($null -ne $postStatus) -PassMessage "post_callback_mesh_status is present" -FailMessage "post_callback_mesh_status is missing"
Add-CheckFromCondition -Name "post control server verified" -Condition (Get-BoolProperty -Object $postStatus -Name "control_server_verified") -PassMessage "post status control_server_verified=true" -FailMessage "post status control_server_verified is false"
Add-CheckFromCondition -Name "post callback verified" -Condition (Get-BoolProperty -Object $postVerification -Name "callback_verified") -PassMessage "post status callback_verified=true" -FailMessage "post status callback_verified is false"
Add-CheckFromCondition -Name "post release grade" -Condition (Get-BoolProperty -Object $postVerification -Name "release_grade") -PassMessage "post status release_grade=true" -FailMessage "post status release_grade is false"
Add-CheckFromCondition -Name "target callback match top level" -Condition (Get-BoolProperty -Object $postStatus -Name "target_callback_match") -PassMessage "top-level target_callback_match=true" -FailMessage "top-level target_callback_match is false"
Add-CheckFromCondition -Name "target callback match verification" -Condition (Get-BoolProperty -Object $postVerification -Name "target_callback_match") -PassMessage "verification target_callback_match=true" -FailMessage "verification target_callback_match is false"
Add-CheckFromCondition -Name "verified target binding" -Condition ($postTarget -eq $targetIp) -PassMessage "verified target equals expected target" -FailMessage "verified target mismatch: expected $targetIp got $postTarget"
Add-CheckFromCondition -Name "callback target binding" -Condition ($postCallback -eq $targetIp) -PassMessage "callback tailnet IP equals expected target" -FailMessage "callback tailnet IP mismatch: expected $targetIp got $postCallback"

$failures = @($checks | Where-Object { $_.status -ne "pass" })
$result = [pscustomobject]@{
    ok = ($failures.Count -eq 0)
    schema = "musu.private_mesh_route_proof_verification.v1"
    evidence_path = $resolvedEvidencePath
    fail_count = [int]$failures.Count
    target_ip = $targetIp
    control_server_url = $meshStatusControlUrl
    release_grade = Get-BoolProperty -Object $postVerification -Name "release_grade"
    integrity_status = [string]$integrity.status
    checks = $checks.ToArray()
}

if ($Json) {
    $result | ConvertTo-Json -Depth 30
}
else {
    if ($result.ok) {
        Write-Host "Private Mesh release evidence verified: $resolvedEvidencePath"
    }
    else {
        Write-Host "Private Mesh release evidence failed: $resolvedEvidencePath"
        foreach ($failure in $failures) {
            Write-Host ("  - {0}: {1}" -f $failure.name, $failure.message)
        }
    }
}

if (-not $result.ok) {
    exit 1
}
