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

function Has-Property {
    param($Object, [Parameter(Mandatory = $true)][string]$Name)
    return ($null -ne $Object -and $null -ne $Object.PSObject.Properties[$Name])
}

function Get-StringProperty {
    param($Object, [Parameter(Mandatory = $true)][string]$Name)
    if (Has-Property $Object $Name) {
        return [string]$Object.PSObject.Properties[$Name].Value
    }
    return ""
}

function Get-BoolProperty {
    param($Object, [Parameter(Mandatory = $true)][string]$Name)
    if (Has-Property $Object $Name) {
        return [bool]$Object.PSObject.Properties[$Name].Value
    }
    return $false
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

function Test-PageOk {
    param($PublicMetadata, [Parameter(Mandatory = $true)][string]$Name)

    if (-not $PublicMetadata -or -not (Has-Property $PublicMetadata "pages")) {
        return $false
    }
    foreach ($page in @($PublicMetadata.pages)) {
        if ([string](Get-StringProperty $page "name") -eq $Name -and (Get-BoolProperty $page "ok")) {
            return $true
        }
    }
    return $false
}

if (-not (Test-Path -LiteralPath $EvidencePath)) {
    throw "Support operator gate retirement evidence file not found: $EvidencePath"
}

$resolvedEvidencePath = (Resolve-Path -LiteralPath $EvidencePath).Path
$evidence = Get-Content -LiteralPath $resolvedEvidencePath -Raw | ConvertFrom-Json
$schema = Get-StringProperty -Object $evidence -Name "schema"
$version = Get-StringProperty -Object $evidence -Name "version"
$supportEmail = Get-StringProperty -Object $evidence -Name "support_email"
$decision = Get-StringProperty -Object $evidence -Name "decision"
$retirementScope = Get-StringProperty -Object $evidence -Name "retirement_scope"
$generatedAtText = Get-StringProperty -Object $evidence -Name "generated_at"
$generatedAt = Try-ParseDateTimeOffset -Text $generatedAtText
$retirementDocPath = Get-StringProperty -Object $evidence -Name "retirement_doc_path"
$controls = if (Has-Property $evidence "replacement_controls") { $evidence.replacement_controls } else { $null }
$publicMetadata = if (Has-Property $evidence "public_metadata_verification") { $evidence.public_metadata_verification } else { $null }
$now = [datetimeoffset]::Now
$futureTolerance = [timespan]::FromMinutes(5)

Add-CheckFromCondition "schema" ($schema -eq "musu.support_operator_gate_retirement.v1") "schema is valid" "schema is not musu.support_operator_gate_retirement.v1"
Add-CheckFromCondition "evidence ok" (Get-BoolProperty $evidence "ok") "evidence reports ok=true" "evidence does not report ok=true"
Add-CheckFromCondition "version" ($version -eq $ExpectedVersion) "version matches $ExpectedVersion" "version is '$version', expected '$ExpectedVersion'"
Add-CheckFromCondition "support email" ($supportEmail -ieq $ExpectedSupportEmail) "support email matches $ExpectedSupportEmail" "support email is '$supportEmail', expected '$ExpectedSupportEmail'"
Add-CheckFromCondition "decision" ($decision -eq "retire_historical_mailbox_delivery_gate") "decision is scoped to mailbox delivery gate retirement" "decision must be retire_historical_mailbox_delivery_gate"
Add-CheckFromCondition "retirement scope" ($retirementScope -eq "support_mailbox_delivery_evidence_only") "retirement scope is narrow" "retirement_scope must be support_mailbox_delivery_evidence_only"
Add-CheckFromCondition "mailbox delivery not required" (-not (Get-BoolProperty $evidence "support_mailbox_delivery_evidence_required")) "mailbox delivery evidence is retired" "support_mailbox_delivery_evidence_required must be false"
Add-CheckFromCondition "support availability active" (-not (Get-BoolProperty $evidence "support_availability_retired")) "support availability is not retired" "support_availability_retired must be false"
Add-CheckFromCondition "support routes required" (Get-BoolProperty $evidence "support_routes_required") "support routes remain required" "support_routes_required must be true"
Add-CheckFromCondition "public metadata required" (Get-BoolProperty $evidence "public_support_metadata_required") "public support metadata remains required" "public_support_metadata_required must be true"

if ($generatedAt) {
    Add-Check -Name "generated timestamp" -Status "pass" -Message "generated_at parses"
    Add-CheckFromCondition "generated not future" ($generatedAt -le ($now + $futureTolerance)) "generated_at is not in the future" "generated_at is more than 5 minutes in the future"
    Add-CheckFromCondition "evidence age" (($now - $generatedAt).TotalDays -le $MaxAgeDays) "generated_at is within $MaxAgeDays days" "generated_at is older than $MaxAgeDays days"
}
else {
    Add-Check -Name "generated timestamp" -Status "fail" -Message "generated_at is missing or invalid"
}

$retirementDocFullPath = if ([string]::IsNullOrWhiteSpace($retirementDocPath)) {
    ""
}
else {
    Join-Path $repoRoot $retirementDocPath
}
Add-CheckFromCondition "retirement doc path" (-not [string]::IsNullOrWhiteSpace($retirementDocPath)) "retirement_doc_path is present" "retirement_doc_path is missing"
Add-CheckFromCondition "retirement doc exists" (-not [string]::IsNullOrWhiteSpace($retirementDocFullPath) -and (Test-Path -LiteralPath $retirementDocFullPath)) "retirement decision document exists" "retirement decision document is missing"

foreach ($controlName in @("public_support_page", "public_privacy_page", "public_config_support_email", "release_metadata_current", "support_email_kept")) {
    Add-CheckFromCondition "control $controlName" (Get-BoolProperty $controls $controlName) "replacement control $controlName is true" "replacement_controls.$controlName must be true"
}

Add-CheckFromCondition "public metadata present" ($null -ne $publicMetadata) "public metadata verification is embedded" "public_metadata_verification is missing"
Add-CheckFromCondition "public metadata schema" ($publicMetadata -and (Get-StringProperty $publicMetadata "schema") -eq "musu.store_public_metadata_verification.v2") "public metadata schema is valid" "public metadata schema is invalid"
Add-CheckFromCondition "public metadata ok" ($publicMetadata -and (Get-BoolProperty $publicMetadata "ok")) "public metadata verifier reports ok=true" "public metadata verifier must report ok=true"
Add-CheckFromCondition "public metadata support email" ($publicMetadata -and (Get-StringProperty $publicMetadata "expected_support_email") -ieq $ExpectedSupportEmail) "public metadata expected support email matches" "public metadata expected support email does not match"
Add-CheckFromCondition "public metadata release version" ($publicMetadata -and (Get-StringProperty $publicMetadata "expected_release_version") -eq $ExpectedVersion) "public metadata release version matches" "public metadata release version does not match"
Add-CheckFromCondition "public metadata https" ($publicMetadata -and (Get-StringProperty $publicMetadata "base_url") -match "^https://") "public metadata base URL is HTTPS" "public metadata base URL must be HTTPS"
Add-CheckFromCondition "support page ok" (Test-PageOk -PublicMetadata $publicMetadata -Name "support") "public support page verified" "public support page is not verified"
Add-CheckFromCondition "privacy page ok" (Test-PageOk -PublicMetadata $publicMetadata -Name "privacy") "public privacy page verified" "public privacy page is not verified"
$publicConfigOk = ($publicMetadata -and (Has-Property $publicMetadata "public_config") -and (Get-BoolProperty $publicMetadata.public_config "ok"))
Add-CheckFromCondition "public config ok" $publicConfigOk "public-config verification passed" "public-config verification must pass"

$failCount = @($checks | Where-Object { $_.status -eq "fail" }).Count
$result = [pscustomobject]@{
    ok = ($failCount -eq 0)
    evidence_path = $resolvedEvidencePath
    fail_count = [int]$failCount
    version = $version
    support_email = $supportEmail
    support_operator_gate_retired = ($failCount -eq 0)
    retirement_scope = $retirementScope
    public_metadata_base_url = if ($publicMetadata) { Get-StringProperty $publicMetadata "base_url" } else { "" }
    checks = $checks.ToArray()
}

if ($Json) {
    $result | ConvertTo-Json -Depth 8
}
else {
    "MUSU support operator gate retirement verification"
    "ok: $($result.ok)"
    "evidence_path: $($result.evidence_path)"
    "support_email: $($result.support_email)"
    ""
    $checks | Format-Table name, status, message -Wrap
}

if (-not $result.ok) {
    exit 1
}
