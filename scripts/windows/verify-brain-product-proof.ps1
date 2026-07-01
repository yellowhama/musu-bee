[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$EvidencePath,
    [string]$ExpectedVersion,
    [string]$ExpectedPackageVersion,
    [string]$ExpectedBaseUrl = "http://127.0.0.1:8080",
    [int]$MaxAgeDays = 14,
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

if ([string]::IsNullOrWhiteSpace($ExpectedVersion)) {
    $ExpectedVersion = (Get-Content -LiteralPath (Join-Path $repoRoot "VERSION") -Raw).Trim()
}
if ([string]::IsNullOrWhiteSpace($ExpectedPackageVersion)) {
    $ExpectedPackageVersion = Convert-PublicVersionToPackageVersion -PublicVersion $ExpectedVersion
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

function Get-IntProperty {
    param(
        [Parameter(Mandatory = $true)]$Object,
        [Parameter(Mandatory = $true)][string]$Name
    )

    $property = $Object.PSObject.Properties[$Name]
    if (-not $property -or $null -eq $property.Value) {
        return 0
    }
    return [int]$property.Value
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

function Test-LoopbackBaseUrl {
    param([string]$Text)

    if ([string]::IsNullOrWhiteSpace($Text)) {
        return $false
    }
    try {
        $uri = [uri]$Text
        return (
            $uri.Scheme -eq "http" -and
            ($uri.Host -eq "127.0.0.1" -or $uri.Host -eq "localhost") -and
            $uri.Port -gt 0
        )
    }
    catch {
        return $false
    }
}

function Test-BrainRootPath {
    param([string]$Path)

    if ([string]::IsNullOrWhiteSpace($Path)) {
        return $false
    }
    $normalized = $Path.Replace("\", "/")
    return (
        $normalized -match "/\.musu/brain/?$" -and
        $normalized -notmatch "(?i)/LocalState/"
    )
}

if (-not (Test-Path -LiteralPath $EvidencePath)) {
    throw "Brain product proof file not found: $EvidencePath"
}

$rawEvidenceText = Get-Content -LiteralPath $EvidencePath -Raw
$evidence = $rawEvidenceText | ConvertFrom-Json

$schema = Get-StringProperty -Object $evidence -Name "schema"
$version = Get-StringProperty -Object $evidence -Name "version"
$packageVersion = Get-StringProperty -Object $evidence -Name "package_version"
$packageFullName = Get-StringProperty -Object $evidence -Name "package_full_name"
$generatedAtText = Get-StringProperty -Object $evidence -Name "generated_at"
$brainRoot = Get-StringProperty -Object $evidence -Name "brain_root"
$baseUrl = Get-StringProperty -Object $evidence -Name "base_url"
$taskSourceId = Get-StringProperty -Object $evidence -Name "task_source_id"
$taskMarker = Get-StringProperty -Object $evidence -Name "task_marker"
$captureSourceId = Get-StringProperty -Object $evidence -Name "capture_source_id"
$captureMarker = Get-StringProperty -Object $evidence -Name "capture_marker"
$brainBinaryPath = Get-StringProperty -Object $evidence -Name "brain_binary_path"
$generatedAt = Try-ParseDateTimeOffset -Text $generatedAtText
$now = [datetimeoffset]::Now
$futureTolerance = [timespan]::FromMinutes(5)
$expectedBaseUrlNormalized = $ExpectedBaseUrl.TrimEnd("/")
$baseUrlNormalized = $baseUrl.TrimEnd("/")

Add-CheckFromCondition "schema" ($schema -eq "musu.brain_product_proof.v1") "schema is valid" "schema is not musu.brain_product_proof.v1"
Add-CheckFromCondition "evidence ok" (Get-BoolProperty -Object $evidence -Name "ok") "evidence reports ok=true" "evidence does not report ok=true"
Add-CheckFromCondition "version" ($version -eq $ExpectedVersion) "version matches $ExpectedVersion" "version is '$version', expected '$ExpectedVersion'"
Add-CheckFromCondition "package version" ($packageVersion -eq $ExpectedPackageVersion) "package_version matches $ExpectedPackageVersion" "package_version is '$packageVersion', expected '$ExpectedPackageVersion'"
Add-CheckFromCondition "package identity" (-not [string]::IsNullOrWhiteSpace($packageFullName) -and $packageFullName.Contains("_$ExpectedPackageVersion" + "_")) "package_full_name carries expected package version" "package_full_name '$packageFullName' does not carry expected package version $ExpectedPackageVersion"
Add-CheckFromCondition "generated timestamp" ($null -ne $generatedAt) "generated_at parses" "generated_at is missing or invalid"
if ($generatedAt) {
    Add-CheckFromCondition "generated not future" ($generatedAt -le ($now + $futureTolerance)) "generated_at is not in the future" "generated_at is more than 5 minutes in the future"
    $age = [datetimeoffset]::Now - $generatedAt
    Add-CheckFromCondition "evidence age" ($age.TotalDays -le $MaxAgeDays) "generated_at is within $MaxAgeDays days" "generated_at is older than $MaxAgeDays days"
}

Add-CheckFromCondition "brain root" (Test-BrainRootPath -Path $brainRoot) "brain_root is under ~/.musu/brain and not LocalState" "brain_root must be ~/.musu/brain and must not be MSIX LocalState"
Add-CheckFromCondition "base url loopback" (Test-LoopbackBaseUrl -Text $baseUrl) "base_url is loopback HTTP" "base_url must be loopback HTTP, not public or 0.0.0.0"
Add-CheckFromCondition "base url expected" ($baseUrlNormalized -eq $expectedBaseUrlNormalized) "base_url matches $expectedBaseUrlNormalized" "base_url is '$baseUrl', expected '$ExpectedBaseUrl'"
Add-CheckFromCondition "product owned loopback" (Get-BoolProperty -Object $evidence -Name "product_owned_loopback") "product_owned_loopback is true" "product_owned_loopback must be true"
Add-CheckFromCondition "public surface" (-not (Get-BoolProperty -Object $evidence -Name "brain_http_public_surface_exposed")) "brain HTTP surface is not public" "brain HTTP :8080 must not be publicly exposed"
Add-CheckFromCondition "brain binary packaged" (Get-BoolProperty -Object $evidence -Name "brain_binary_packaged") "packaged brain binary is present" "packaged brain binary was not proven"
Add-CheckFromCondition "brain binary path" (-not [string]::IsNullOrWhiteSpace($brainBinaryPath) -and $brainBinaryPath -match "(?i)musu-brain\.exe$") "brain_binary_path points to musu-brain.exe" "brain_binary_path is missing or not musu-brain.exe"
Add-CheckFromCondition "sidecar process" (Get-BoolProperty -Object $evidence -Name "sidecar_process_observed") "musu-brain sidecar process was observed" "musu-brain sidecar process was not observed"
Add-CheckFromCondition "token present" (Get-BoolProperty -Object $evidence -Name "token_present") "brain ingest token is present" "brain ingest token is missing"
Add-CheckFromCondition "token acl" (Get-BoolProperty -Object $evidence -Name "token_acl_restricted") "brain ingest token ACL is restricted" "brain ingest token ACL is not restricted"
Add-CheckFromCondition "no bearer leak" ($rawEvidenceText -notmatch "(?i)bearer\s+[A-Za-z0-9._~+-]+") "evidence does not contain a Bearer token" "evidence must not contain a Bearer token"
Add-CheckFromCondition "no token property" (-not $evidence.PSObject.Properties["token"]) "evidence does not expose a token property" "evidence must not include a token property"
Add-CheckFromCondition "version coherence" (Get-BoolProperty -Object $evidence -Name "version_coherence_ok") "version coherence was checked" "version_coherence_ok must be true"
Add-CheckFromCondition "store ownership" ((Get-StringProperty -Object $evidence -Name "source_store_owner") -eq "musu-brain") "brain is the source store owner" "source_store_owner must be musu-brain"
Add-CheckFromCondition "no shared sqlite write" (-not (Get-BoolProperty -Object $evidence -Name "musu_db_shared_write")) "musu.db shared write is false" "musu must not write directly into the brain store"

Add-CheckFromCondition "health" (Get-BoolProperty -Object $evidence -Name "health_ok") "brain /health is OK" "brain /health was not proven"
Add-CheckFromCondition "task ingest" (Get-BoolProperty -Object $evidence -Name "task_ingest_ok") "task source ingest succeeded" "task source ingest did not succeed"
Add-CheckFromCondition "task source id" (-not [string]::IsNullOrWhiteSpace($taskSourceId)) "task_source_id is present" "task_source_id is missing"
Add-CheckFromCondition "task marker" ($taskMarker -match "^musu-brain-proof-") "task_marker has the proof prefix" "task_marker is missing or not a MUSU proof marker"
Add-CheckFromCondition "task process" (Get-BoolProperty -Object $evidence -Name "task_process_ok") "task source was processed" "task source was not processed"
Add-CheckFromCondition "task recall" (Get-BoolProperty -Object $evidence -Name "task_recall_ok") "task source was recalled" "task source was not recalled"
Add-CheckFromCondition "task recall count" ((Get-IntProperty -Object $evidence -Name "task_recall_result_count") -gt 0) "task recall returned results" "task recall returned no results"

Add-CheckFromCondition "capture ux" (Get-BoolProperty -Object $evidence -Name "recall_capture_ux_ok") "recall/capture product path succeeded" "recall_capture_ux_ok must be true"
Add-CheckFromCondition "capture clip" (Get-BoolProperty -Object $evidence -Name "capture_clip_ok") "capture clip ingest succeeded" "capture clip ingest did not succeed"
Add-CheckFromCondition "capture source id" (-not [string]::IsNullOrWhiteSpace($captureSourceId)) "capture_source_id is present" "capture_source_id is missing"
Add-CheckFromCondition "capture marker" ($captureMarker -match "^musu-brain-proof-") "capture_marker has the proof prefix" "capture_marker is missing or not a MUSU proof marker"
Add-CheckFromCondition "capture process" (Get-BoolProperty -Object $evidence -Name "capture_process_ok") "capture source was processed" "capture source was not processed"
Add-CheckFromCondition "capture recall" (Get-BoolProperty -Object $evidence -Name "capture_recall_ok") "capture source was recalled" "capture source was not recalled"
Add-CheckFromCondition "capture recall count" ((Get-IntProperty -Object $evidence -Name "capture_recall_result_count") -gt 0) "capture recall returned results" "capture recall returned no results"

$failCount = @($checks | Where-Object { $_.status -eq "fail" }).Count
$result = [pscustomobject]@{
    ok = ($failCount -eq 0)
    evidence_path = (Resolve-Path -LiteralPath $EvidencePath).Path
    fail_count = $failCount
    version = $version
    package_version = $packageVersion
    package_full_name = $packageFullName
    base_url = $baseUrl
    brain_root = $brainRoot
    task_source_id = $taskSourceId
    capture_source_id = $captureSourceId
    checks = $checks.ToArray()
}

if ($Json) {
    $result | ConvertTo-Json -Depth 8
}
else {
    "MUSU brain product proof verification"
    "ok: $($result.ok)"
    "evidence_path: $($result.evidence_path)"
    "package_full_name: $($result.package_full_name)"
    "base_url: $($result.base_url)"
    ""
    $checks | Format-Table name, status, message -Wrap
}

if (-not $result.ok) {
    exit 1
}
