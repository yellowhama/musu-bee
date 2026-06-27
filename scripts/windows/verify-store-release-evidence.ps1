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

function Get-SafeStringProperty {
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

function Get-SafeBoolProperty {
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

function Get-SafeIntProperty {
    param(
        $Object,
        [Parameter(Mandatory = $true)][string]$Name,
        [int]$Default = -1
    )

    if (-not $Object) {
        return $Default
    }
    $property = $Object.PSObject.Properties[$Name]
    if (-not $property -or $null -eq $property.Value) {
        return $Default
    }
    return [int]$property.Value
}

function Get-ObjectProperty {
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

function Test-Sha256 {
    param([string]$Value)

    return ($Value -match "^[a-fA-F0-9]{64}$")
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
$storeInstallSource = (Get-StringProperty -Object $evidence -Name "store_install_source").Trim().ToLowerInvariant()
$storeInstallObservedAtText = Get-StringProperty -Object $evidence -Name "store_install_observed_at"
$storeLaunchObservedAtText = Get-StringProperty -Object $evidence -Name "store_launch_observed_at"
$storeSignedInstallEvidencePath = Get-StringProperty -Object $evidence -Name "store_signed_install_evidence_path"
$storeSignedInstallEvidenceSha256 = Get-StringProperty -Object $evidence -Name "store_signed_install_evidence_sha256"
$storeSignedInstallEvidence = Get-ObjectProperty -Object $evidence -Name "store_signed_install_evidence"
$storeSignedInstallVerification = Get-ObjectProperty -Object $evidence -Name "store_signed_install_verification"
$storeDesktopEntrypointEvidencePath = Get-StringProperty -Object $evidence -Name "store_desktop_entrypoint_evidence_path"
$storeDesktopEntrypointEvidenceSha256 = Get-StringProperty -Object $evidence -Name "store_desktop_entrypoint_evidence_sha256"
$storeDesktopEntrypointEvidence = Get-ObjectProperty -Object $evidence -Name "store_desktop_entrypoint_evidence"
$evidenceOk = Get-BoolProperty -Object $evidence -Name "ok"

$submittedAt = Try-ParseDateTimeOffset -Text $submittedAtText
$productNameReservedAt = Try-ParseDateTimeOffset -Text $productNameReservedAtText
$certificationCompletedAt = Try-ParseDateTimeOffset -Text $certificationCompletedAtText
$restrictedCapabilityCompletedAt = Try-ParseDateTimeOffset -Text $restrictedCapabilityCompletedAtText
$recordedAt = Try-ParseDateTimeOffset -Text $recordedAtText
$publishedAt = Try-ParseDateTimeOffset -Text $publishedAtText
$storeInstallObservedAt = Try-ParseDateTimeOffset -Text $storeInstallObservedAtText
$storeLaunchObservedAt = Try-ParseDateTimeOffset -Text $storeLaunchObservedAtText
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
Add-CheckFromCondition "store install source" ($storeInstallSource -eq "microsoft_store") "store_install_source is microsoft_store" "store_install_source must be microsoft_store"
Add-CheckFromCondition "store install observed timestamp" ($null -ne $storeInstallObservedAt) "store_install_observed_at parses" "store_install_observed_at is missing or invalid"
Add-CheckFromCondition "store launch observed timestamp" ($null -ne $storeLaunchObservedAt) "store_launch_observed_at parses" "store_launch_observed_at is missing or invalid"
Add-CheckFromCondition "store signed install evidence path" (-not [string]::IsNullOrWhiteSpace($storeSignedInstallEvidencePath)) "store signed install evidence path is present" "store_signed_install_evidence_path is missing"
Add-CheckFromCondition "store signed install evidence hash" (Test-Sha256 $storeSignedInstallEvidenceSha256) "store signed install evidence SHA256 metadata is present" "store_signed_install_evidence_sha256 must be a SHA256 hash"
Add-CheckFromCondition "store signed install evidence embedded" ($null -ne $storeSignedInstallEvidence) "store signed install evidence is embedded" "store_signed_install_evidence is required"
Add-CheckFromCondition "store signed install verification embedded" ($null -ne $storeSignedInstallVerification) "store signed install verification is embedded" "store_signed_install_verification is required"
Add-CheckFromCondition "store desktop entrypoint evidence path" (-not [string]::IsNullOrWhiteSpace($storeDesktopEntrypointEvidencePath)) "store desktop entrypoint evidence path is present" "store_desktop_entrypoint_evidence_path is missing"
Add-CheckFromCondition "store desktop entrypoint evidence hash" (Test-Sha256 $storeDesktopEntrypointEvidenceSha256) "store desktop entrypoint evidence SHA256 metadata is present" "store_desktop_entrypoint_evidence_sha256 must be a SHA256 hash"
Add-CheckFromCondition "store desktop entrypoint evidence embedded" ($null -ne $storeDesktopEntrypointEvidence) "store desktop entrypoint evidence is embedded" "store_desktop_entrypoint_evidence is required"

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

if ($certificationCompletedAt -and $storeInstallObservedAt) {
    Add-CheckFromCondition "store install after certification" ($storeInstallObservedAt -ge $certificationCompletedAt) "store_install_observed_at is at or after certification_completed_at" "store_install_observed_at is before certification_completed_at"
}

if ($restrictedCapabilityCompletedAt -and $storeInstallObservedAt) {
    Add-CheckFromCondition "store install after restricted capability" ($storeInstallObservedAt -ge $restrictedCapabilityCompletedAt) "store_install_observed_at is at or after restricted_capability_completed_at" "store_install_observed_at is before restricted_capability_completed_at"
}

if ($storeInstallObservedAt -and $storeLaunchObservedAt) {
    Add-CheckFromCondition "store launch after install" ($storeLaunchObservedAt -ge $storeInstallObservedAt) "store_launch_observed_at is at or after store_install_observed_at" "store_launch_observed_at is before store_install_observed_at"
}

if ($publishedAt -and $certificationCompletedAt) {
    Add-CheckFromCondition "published order" ($publishedAt -ge $certificationCompletedAt) "published_at is at or after certification_completed_at" "published_at is before certification_completed_at"
}

if ($recordedAt) {
    $latestRequiredEvent = @(
        $productNameReservedAt,
        $submittedAt,
        $certificationCompletedAt,
        $restrictedCapabilityCompletedAt,
        $storeInstallObservedAt,
        $storeLaunchObservedAt
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
    [pscustomobject]@{ name = "store_install_observed_at"; value = $storeInstallObservedAt },
    [pscustomobject]@{ name = "store_launch_observed_at"; value = $storeLaunchObservedAt },
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

$installVersion = Get-SafeStringProperty -Object $storeSignedInstallEvidence -Name "version"
$installStartupContract = Get-SafeStringProperty -Object $storeSignedInstallEvidence -Name "startup_contract"
$installPackageFullName = Get-SafeStringProperty -Object $storeSignedInstallEvidence -Name "package_full_name"
$installStartMenuEntry = Get-SafeBoolProperty -Object $storeSignedInstallEvidence -Name "start_menu_entry"
Add-CheckFromCondition "store signed install schema" ((Get-SafeStringProperty -Object $storeSignedInstallEvidence -Name "schema") -eq "musu.msix_install_evidence.v1") "store signed install evidence schema is valid" "store signed install evidence schema is invalid"
Add-CheckFromCondition "store signed install ok" (Get-SafeBoolProperty -Object $storeSignedInstallEvidence -Name "ok") "store signed install evidence reports ok=true" "store signed install evidence does not report ok=true"
Add-CheckFromCondition "store signed install version" ($installVersion -eq $ExpectedVersion) "store signed install evidence version matches $ExpectedVersion" "store signed install evidence version is '$installVersion'"
Add-CheckFromCondition "store signed install startup contract" ($installStartupContract -eq "store-reviewed-immediate-registration") "store signed install uses store-reviewed-immediate-registration" "store signed install startup_contract is '$installStartupContract'"
Add-CheckFromCondition "store signed install package" (-not [string]::IsNullOrWhiteSpace($installPackageFullName)) "store signed install package_full_name is present" "store signed install package_full_name is missing"
Add-CheckFromCondition "store signed install start menu" $installStartMenuEntry "store signed install evidence has Start menu entry" "store signed install evidence does not prove Start menu entry"
Add-CheckFromCondition "store signed install alias clean" ((Get-SafeStringProperty -Object $storeSignedInstallEvidence -Name "alias_shadowing_mode") -eq "fail" -and -not (Get-SafeBoolProperty -Object $storeSignedInstallEvidence -Name "alias_shadowing_accepted")) "store signed install evidence uses strict alias policy" "store signed install evidence does not use strict alias policy"
Add-CheckFromCondition "store signed install verification ok" (Get-SafeBoolProperty -Object $storeSignedInstallVerification -Name "ok") "store signed install verification reports ok=true" "store signed install verification does not report ok=true"
Add-CheckFromCondition "store signed install verification fail count" ((Get-SafeIntProperty -Object $storeSignedInstallVerification -Name "fail_count") -eq 0) "store signed install verification has fail_count=0" "store signed install verification has failures"
Add-CheckFromCondition "store signed install verification startup contract" ((Get-SafeStringProperty -Object $storeSignedInstallVerification -Name "startup_contract") -eq "store-reviewed-immediate-registration") "store signed install verification is bound to store-reviewed startup contract" "store signed install verification is not bound to store-reviewed startup contract"

$entryInstalled = Get-ObjectProperty -Object $storeDesktopEntrypointEvidence -Name "installed"
$entryVersion = Get-SafeStringProperty -Object $storeDesktopEntrypointEvidence -Name "version"
$entryStartupContract = Get-SafeStringProperty -Object $storeDesktopEntrypointEvidence -Name "startup_contract"
$entryExpectedExecutable = Get-SafeStringProperty -Object $storeDesktopEntrypointEvidence -Name "expected_application_executable"
$entryInstalledPackageFullName = Get-SafeStringProperty -Object $entryInstalled -Name "package_full_name"
Add-CheckFromCondition "store desktop entrypoint schema" ((Get-SafeStringProperty -Object $storeDesktopEntrypointEvidence -Name "schema") -eq "musu.msix_desktop_entrypoint_audit.v1") "store desktop entrypoint evidence schema is valid" "store desktop entrypoint evidence schema is invalid"
Add-CheckFromCondition "store desktop entrypoint ok" (Get-SafeBoolProperty -Object $storeDesktopEntrypointEvidence -Name "ok") "store desktop entrypoint evidence reports ok=true" "store desktop entrypoint evidence does not report ok=true"
Add-CheckFromCondition "store desktop entrypoint version" ($entryVersion -eq $ExpectedVersion) "store desktop entrypoint evidence version matches $ExpectedVersion" "store desktop entrypoint evidence version is '$entryVersion'"
Add-CheckFromCondition "store desktop entrypoint startup contract" ($entryStartupContract -eq "store-reviewed-immediate-registration") "store desktop entrypoint uses store-reviewed-immediate-registration" "store desktop entrypoint startup_contract is '$entryStartupContract'"
Add-CheckFromCondition "store desktop entrypoint installed required" (Get-SafeBoolProperty -Object $storeDesktopEntrypointEvidence -Name "require_installed_package") "store desktop entrypoint audit required installed package" "store desktop entrypoint audit did not require installed package"
Add-CheckFromCondition "store desktop entrypoint executable" ($entryExpectedExecutable -eq "musu-desktop.exe") "store desktop entrypoint expects musu-desktop.exe" "store desktop entrypoint expected executable is '$entryExpectedExecutable'"
Add-CheckFromCondition "store desktop entrypoint installed present" ($null -ne $entryInstalled) "store desktop entrypoint evidence includes installed package audit" "store desktop entrypoint evidence is missing installed package audit"
Add-CheckFromCondition "store desktop entrypoint installed package matches install evidence" (-not [string]::IsNullOrWhiteSpace($entryInstalledPackageFullName) -and $entryInstalledPackageFullName -eq $installPackageFullName) "store desktop entrypoint package matches store signed install package" "store desktop entrypoint package does not match store signed install package"
Add-CheckFromCondition "store desktop entrypoint installed executable" ((Get-SafeStringProperty -Object $entryInstalled -Name "application_executable") -eq "musu-desktop.exe") "installed Store Start menu app launches musu-desktop.exe" "installed Store Start menu app does not launch musu-desktop.exe"
Add-CheckFromCondition "store desktop entrypoint contract match" (Get-SafeBoolProperty -Object $entryInstalled -Name "startup_contract_matches_artifact") "installed Store startup contract matches artifact" "installed Store startup contract does not match artifact"
Add-CheckFromCondition "store desktop entrypoint contains executable" (Get-SafeBoolProperty -Object $entryInstalled -Name "contains_expected_application_executable") "installed Store package contains musu-desktop.exe" "installed Store package does not contain musu-desktop.exe"
Add-CheckFromCondition "store desktop entrypoint start menu" (Get-SafeBoolProperty -Object $entryInstalled -Name "start_menu_entry") "installed Store package has Start menu entry" "installed Store package does not have Start menu entry"

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
    store_install_source = $storeInstallSource
    store_install_observed_at = if ($storeInstallObservedAt) { $storeInstallObservedAt.ToString("o") } else { $null }
    store_launch_observed_at = if ($storeLaunchObservedAt) { $storeLaunchObservedAt.ToString("o") } else { $null }
    store_signed_install_package_full_name = $installPackageFullName
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
    "store_install_source: $($result.store_install_source)"
    "store_signed_install_package_full_name: $($result.store_signed_install_package_full_name)"
    ""
    $checks | Format-Table name, status, message -Wrap
}

if (-not $result.ok) {
    exit 1
}
