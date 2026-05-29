[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$EvidencePath,
    [string]$ExpectedVersion,
    [int]$MaxAgeDays = 180,
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

if (-not (Test-Path -LiteralPath $EvidencePath)) {
    throw "Store release evidence file not found: $EvidencePath"
}

$evidence = Get-Content -LiteralPath $EvidencePath -Raw | ConvertFrom-Json

$schema = Get-StringProperty -Object $evidence -Name "schema"
$version = Get-StringProperty -Object $evidence -Name "version"
$productName = Get-StringProperty -Object $evidence -Name "product_name"
$productNameReserved = Get-BoolProperty -Object $evidence -Name "product_name_reserved"
$productNameReservedAtText = Get-StringProperty -Object $evidence -Name "product_name_reserved_at"
$submissionId = Get-StringProperty -Object $evidence -Name "submission_id"
$certificationStatus = (Get-StringProperty -Object $evidence -Name "certification_status").Trim().ToLowerInvariant()
$restrictedCapabilityStatus = (Get-StringProperty -Object $evidence -Name "restricted_capability_status").Trim().ToLowerInvariant()
$recordedBy = Get-StringProperty -Object $evidence -Name "recorded_by"
$submittedAtText = Get-StringProperty -Object $evidence -Name "submitted_at"
$certificationCompletedAtText = Get-StringProperty -Object $evidence -Name "certification_completed_at"
$restrictedCapabilityCompletedAtText = Get-StringProperty -Object $evidence -Name "restricted_capability_completed_at"
$recordedAtText = Get-StringProperty -Object $evidence -Name "recorded_at"
$publishedAtText = Get-StringProperty -Object $evidence -Name "published_at"
$evidenceOk = Get-BoolProperty -Object $evidence -Name "ok"

$submittedAt = Try-ParseDateTimeOffset -Text $submittedAtText
$productNameReservedAt = Try-ParseDateTimeOffset -Text $productNameReservedAtText
$certificationCompletedAt = Try-ParseDateTimeOffset -Text $certificationCompletedAtText
$restrictedCapabilityCompletedAt = Try-ParseDateTimeOffset -Text $restrictedCapabilityCompletedAtText
$recordedAt = Try-ParseDateTimeOffset -Text $recordedAtText
$publishedAt = Try-ParseDateTimeOffset -Text $publishedAtText
$now = [datetimeoffset]::Now
$futureTolerance = [timespan]::FromMinutes(5)

$acceptableCertificationStatuses = @("approved", "passed", "certified", "published")
$acceptableRestrictedStatuses = @("approved")

Add-CheckFromCondition "schema" ($schema -eq "musu.store_release_gate_evidence.v1") "schema is valid" "schema is not musu.store_release_gate_evidence.v1"
Add-CheckFromCondition "evidence ok" $evidenceOk "evidence reports ok=true" "evidence does not report ok=true"
Add-CheckFromCondition "version" ($version -eq $ExpectedVersion) "version matches $ExpectedVersion" "version is '$version', expected '$ExpectedVersion'"
Add-CheckFromCondition "product name" (-not [string]::IsNullOrWhiteSpace($productName)) "product_name is present" "product_name is missing"
Add-CheckFromCondition "product name reserved" $productNameReserved "product_name_reserved is true" "product_name_reserved is not true"
Add-CheckFromCondition "product name reservation timestamp" ($null -ne $productNameReservedAt) "product_name_reserved_at parses" "product_name_reserved_at is missing or invalid"
Add-CheckFromCondition "submission id" (-not [string]::IsNullOrWhiteSpace($submissionId)) "submission_id is present" "submission_id is missing"
Add-CheckFromCondition "certification status" ($acceptableCertificationStatuses -contains $certificationStatus) "certification status is release-acceptable" "certification_status '$certificationStatus' is not one of $($acceptableCertificationStatuses -join ', ')"
Add-CheckFromCondition "restricted capability status" ($acceptableRestrictedStatuses -contains $restrictedCapabilityStatus) "restricted capability approval is recorded" "restricted_capability_status '$restrictedCapabilityStatus' is not approved"
Add-CheckFromCondition "recorded by" (-not [string]::IsNullOrWhiteSpace($recordedBy)) "recorded_by is present" "recorded_by is missing"
Add-CheckFromCondition "submitted timestamp" ($null -ne $submittedAt) "submitted_at parses" "submitted_at is missing or invalid"
Add-CheckFromCondition "certification timestamp" ($null -ne $certificationCompletedAt) "certification_completed_at parses" "certification_completed_at is missing or invalid"
Add-CheckFromCondition "restricted capability timestamp" ($null -ne $restrictedCapabilityCompletedAt) "restricted_capability_completed_at parses" "restricted_capability_completed_at is missing or invalid"
Add-CheckFromCondition "recorded timestamp" ($null -ne $recordedAt) "recorded_at parses" "recorded_at is missing or invalid"

if (-not [string]::IsNullOrWhiteSpace($publishedAtText)) {
    Add-CheckFromCondition "published timestamp" ($null -ne $publishedAt) "published_at parses when present" "published_at is present but invalid"
}

if ($submittedAt -and $certificationCompletedAt) {
    Add-CheckFromCondition "certification order" ($certificationCompletedAt -ge $submittedAt) "certification_completed_at is at or after submitted_at" "certification_completed_at is before submitted_at"
}

if ($submittedAt -and $productNameReservedAt) {
    Add-CheckFromCondition "product name reservation order" ($submittedAt -ge $productNameReservedAt) "submitted_at is at or after product_name_reserved_at" "submitted_at is before product_name_reserved_at"
}

if ($submittedAt -and $restrictedCapabilityCompletedAt) {
    Add-CheckFromCondition "restricted capability order" ($restrictedCapabilityCompletedAt -ge $submittedAt) "restricted_capability_completed_at is at or after submitted_at" "restricted_capability_completed_at is before submitted_at"
}

if ($publishedAt -and $certificationCompletedAt) {
    Add-CheckFromCondition "published order" ($publishedAt -ge $certificationCompletedAt) "published_at is at or after certification_completed_at" "published_at is before certification_completed_at"
}

if ($recordedAt) {
    $latestRequiredEvent = @(
        $productNameReservedAt,
        $submittedAt,
        $certificationCompletedAt,
        $restrictedCapabilityCompletedAt
    ) | Where-Object { $null -ne $_ } | Sort-Object UtcDateTime -Descending | Select-Object -First 1
    if ($latestRequiredEvent) {
        Add-CheckFromCondition "recording order" ($recordedAt -ge $latestRequiredEvent) "recorded_at is at or after the latest required Store event" "recorded_at is before the latest required Store event"
    }
}

foreach ($timestamp in @(
    [pscustomobject]@{ name = "product_name_reserved_at"; value = $productNameReservedAt },
    [pscustomobject]@{ name = "submitted_at"; value = $submittedAt },
    [pscustomobject]@{ name = "certification_completed_at"; value = $certificationCompletedAt },
    [pscustomobject]@{ name = "restricted_capability_completed_at"; value = $restrictedCapabilityCompletedAt },
    [pscustomobject]@{ name = "published_at"; value = $publishedAt },
    [pscustomobject]@{ name = "recorded_at"; value = $recordedAt }
)) {
    if ($timestamp.value) {
        Add-CheckFromCondition "$($timestamp.name) not future" ($timestamp.value -le ($now + $futureTolerance)) "$($timestamp.name) is not in the future" "$($timestamp.name) is more than 5 minutes in the future"
    }
}

if ($recordedAt) {
    $age = [datetimeoffset]::Now - $recordedAt
    Add-CheckFromCondition "evidence age" ($age.TotalDays -le $MaxAgeDays) "recorded_at is within $MaxAgeDays days" "recorded_at is older than $MaxAgeDays days"
}

$failCount = @($checks | Where-Object { $_.status -eq "fail" }).Count
$result = [pscustomobject]@{
    ok = ($failCount -eq 0)
    evidence_path = (Resolve-Path -LiteralPath $EvidencePath).Path
    fail_count = $failCount
    version = $version
    product_name = $productName
    product_name_reserved = $productNameReserved
    submission_id = $submissionId
    certification_status = $certificationStatus
    restricted_capability_status = $restrictedCapabilityStatus
    recorded_by = $recordedBy
    checks = $checks.ToArray()
}

if ($Json) {
    $result | ConvertTo-Json -Depth 6
}
else {
    "MUSU Store release evidence verification"
    "ok: $($result.ok)"
    "evidence_path: $($result.evidence_path)"
    "product_name: $($result.product_name)"
    "submission_id: $($result.submission_id)"
    ""
    $checks | Format-Table name, status, message -Wrap
}

if (-not $result.ok) {
    exit 1
}
