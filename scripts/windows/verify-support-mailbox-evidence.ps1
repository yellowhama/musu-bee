[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$EvidencePath,
    [string]$ExpectedSupportEmail,
    [string]$ExpectedVersion,
    [int]$MaxAgeDays = 30,
    [switch]$Json
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = (Resolve-Path (Join-Path $scriptDir "..\..")).Path
. (Join-Path $scriptDir "release-config.ps1")

if ([string]::IsNullOrWhiteSpace($ExpectedVersion)) {
    $ExpectedVersion = (Get-Content -LiteralPath (Join-Path $repoRoot "VERSION") -Raw).Trim()
}
if ([string]::IsNullOrWhiteSpace($ExpectedSupportEmail)) {
    $ExpectedSupportEmail = Get-MusuReleaseSupportEmail -RepoRoot $repoRoot
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
    throw "Support mailbox evidence file not found: $EvidencePath"
}

$evidence = Get-Content -LiteralPath $EvidencePath -Raw | ConvertFrom-Json

$schema = Get-StringProperty -Object $evidence -Name "schema"
$version = Get-StringProperty -Object $evidence -Name "version"
$supportEmail = Get-StringProperty -Object $evidence -Name "support_email"
$verificationId = Get-StringProperty -Object $evidence -Name "verification_id"
$fromAddress = Get-StringProperty -Object $evidence -Name "from_address"
$receivedBy = Get-StringProperty -Object $evidence -Name "received_by"
$sentAtText = Get-StringProperty -Object $evidence -Name "sent_at"
$receivedAtText = Get-StringProperty -Object $evidence -Name "received_at"
$recordedAtText = Get-StringProperty -Object $evidence -Name "recorded_at"
$evidenceOk = Get-BoolProperty -Object $evidence -Name "ok"
$sentAt = Try-ParseDateTimeOffset -Text $sentAtText
$receivedAt = Try-ParseDateTimeOffset -Text $receivedAtText
$recordedAt = Try-ParseDateTimeOffset -Text $recordedAtText
$now = [datetimeoffset]::Now
$futureTolerance = [timespan]::FromMinutes(5)

Add-CheckFromCondition "schema" ($schema -eq "musu.support_mailbox_evidence.v1") "schema is valid" "schema is not musu.support_mailbox_evidence.v1"
Add-CheckFromCondition "evidence ok" $evidenceOk "evidence reports ok=true" "evidence does not report ok=true"
Add-CheckFromCondition "version" ($version -eq $ExpectedVersion) "version matches $ExpectedVersion" "version is '$version', expected '$ExpectedVersion'"
Add-CheckFromCondition "support email" ($supportEmail -ieq $ExpectedSupportEmail) "support email matches $ExpectedSupportEmail" "support email is '$supportEmail', expected '$ExpectedSupportEmail'"
Add-CheckFromCondition "verification id" (-not [string]::IsNullOrWhiteSpace($verificationId)) "verification_id is present" "verification_id is missing"
Add-CheckFromCondition "verification id shape" ($verificationId -match "^musu-[A-Za-z0-9._-]{16,}$") "verification_id uses a MUSU verification token" "verification_id must start with musu- and be at least 16 token characters"
Add-CheckFromCondition "from address" (-not [string]::IsNullOrWhiteSpace($fromAddress)) "from_address is present" "from_address is missing"
Add-CheckFromCondition "from address shape" ($fromAddress -match "^[^@\s]+@[^@\s]+\.[^@\s]+$") "from_address looks like an email address" "from_address is not email-shaped"
Add-CheckFromCondition "from address distinct" ($fromAddress -ine $supportEmail) "from_address is distinct from the support mailbox" "from_address must not be the support mailbox"
Add-CheckFromCondition "received by" (-not [string]::IsNullOrWhiteSpace($receivedBy)) "received_by is present" "received_by is missing"
Add-CheckFromCondition "sent timestamp" ($null -ne $sentAt) "sent_at parses" "sent_at is missing or invalid"
Add-CheckFromCondition "received timestamp" ($null -ne $receivedAt) "received_at parses" "received_at is missing or invalid"
Add-CheckFromCondition "recorded timestamp" ($null -ne $recordedAt) "recorded_at parses" "recorded_at is missing or invalid"

if ($sentAt -and $receivedAt) {
    Add-CheckFromCondition "delivery order" ($receivedAt -ge $sentAt) "received_at is at or after sent_at" "received_at is before sent_at"
}

if ($receivedAt -and $recordedAt) {
    Add-CheckFromCondition "recording order" ($recordedAt -ge $receivedAt) "recorded_at is at or after received_at" "recorded_at is before received_at"
}

foreach ($timestamp in @(
    [pscustomobject]@{ name = "sent_at"; value = $sentAt },
    [pscustomobject]@{ name = "received_at"; value = $receivedAt },
    [pscustomobject]@{ name = "recorded_at"; value = $recordedAt }
)) {
    if ($timestamp.value) {
        Add-CheckFromCondition "$($timestamp.name) not future" ($timestamp.value -le ($now + $futureTolerance)) "$($timestamp.name) is not in the future" "$($timestamp.name) is more than 5 minutes in the future"
    }
}

if ($receivedAt) {
    $age = [datetimeoffset]::Now - $receivedAt
    Add-CheckFromCondition "evidence age" ($age.TotalDays -le $MaxAgeDays) "received_at is within $MaxAgeDays days" "received_at is older than $MaxAgeDays days"
}

$failCount = @($checks | Where-Object { $_.status -eq "fail" }).Count
$result = [pscustomobject]@{
    ok = ($failCount -eq 0)
    evidence_path = (Resolve-Path -LiteralPath $EvidencePath).Path
    fail_count = $failCount
    version = $version
    support_email = $supportEmail
    verification_id = $verificationId
    from_address = $fromAddress
    received_by = $receivedBy
    sent_at = if ($sentAt) { $sentAt.ToString("o") } else { $null }
    received_at = if ($receivedAt) { $receivedAt.ToString("o") } else { $null }
    checks = $checks.ToArray()
}

if ($Json) {
    $result | ConvertTo-Json -Depth 6
}
else {
    "MUSU support mailbox evidence verification"
    "ok: $($result.ok)"
    "evidence_path: $($result.evidence_path)"
    "support_email: $($result.support_email)"
    "verification_id: $($result.verification_id)"
    ""
    $checks | Format-Table name, status, message -Wrap
}

if (-not $result.ok) {
    exit 1
}
