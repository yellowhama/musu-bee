[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$EvidencePath,
    [string]$ExpectedVersion,
    [ValidateSet("local-sideload-manual", "store-reviewed-immediate-registration", "")]
    [string]$ExpectedStartupContract = "",
    [int]$MaxAgeDays = 30,
    [switch]$Json
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

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

if (-not (Test-Path -LiteralPath $EvidencePath)) {
    throw "MSIX install evidence file not found: $EvidencePath"
}

$evidence = Get-Content -LiteralPath $EvidencePath -Raw | ConvertFrom-Json
$schema = Get-StringProperty -Object $evidence -Name "schema"
$ok = Get-BoolProperty -Object $evidence -Name "ok"
$version = Get-StringProperty -Object $evidence -Name "version"
$startupContract = Get-StringProperty -Object $evidence -Name "startup_contract"
$recordedAt = Try-ParseDateTimeOffset -Text (Get-StringProperty -Object $evidence -Name "recorded_at")
$packageName = Get-StringProperty -Object $evidence -Name "package_name"
$packageFullName = Get-StringProperty -Object $evidence -Name "package_full_name"
$installedVersion = Get-StringProperty -Object $evidence -Name "installed_version"
$installLocation = Get-StringProperty -Object $evidence -Name "install_location"

Add-CheckFromCondition "schema" ($schema -eq "musu.msix_install_evidence.v1") "schema is valid" "schema is not musu.msix_install_evidence.v1"
Add-CheckFromCondition "evidence ok" $ok "evidence reports ok=true" "evidence does not report ok=true"
Add-CheckFromCondition "version" (-not [string]::IsNullOrWhiteSpace($version)) "version is present" "version is missing"
if (-not [string]::IsNullOrWhiteSpace($ExpectedVersion)) {
    Add-CheckFromCondition "expected version" ($version -eq $ExpectedVersion) "version matches $ExpectedVersion" "version does not match $ExpectedVersion"
}
Add-CheckFromCondition "startup contract" ($startupContract -in @("local-sideload-manual", "store-reviewed-immediate-registration")) "startup contract is valid" "startup contract is invalid"
if (-not [string]::IsNullOrWhiteSpace($ExpectedStartupContract)) {
    Add-CheckFromCondition "expected startup contract" ($startupContract -eq $ExpectedStartupContract) "startup contract matches $ExpectedStartupContract" "startup contract does not match $ExpectedStartupContract"
}
Add-CheckFromCondition "recorded timestamp" ($null -ne $recordedAt) "recorded_at parses" "recorded_at is missing or invalid"
if ($recordedAt) {
    $age = [datetimeoffset]::Now - $recordedAt
    Add-CheckFromCondition "evidence age" ($age.TotalDays -le $MaxAgeDays) "recorded_at is within $MaxAgeDays days" "recorded_at is older than $MaxAgeDays days"
}

Add-CheckFromCondition "package name" (-not [string]::IsNullOrWhiteSpace($packageName)) "package name is present" "package name is missing"
Add-CheckFromCondition "package full name" (-not [string]::IsNullOrWhiteSpace($packageFullName)) "package full name is present" "package full name is missing"
Add-CheckFromCondition "installed version" (-not [string]::IsNullOrWhiteSpace($installedVersion)) "installed version is present" "installed version is missing"
Add-CheckFromCondition "install location" (-not [string]::IsNullOrWhiteSpace($installLocation)) "install location is present" "install location is missing"
Add-CheckFromCondition "artifact contract match" (Get-BoolProperty -Object $evidence -Name "artifact_contract_match") "installed contract matches artifact" "installed contract does not match artifact"
Add-CheckFromCondition "WindowsApps alias" (Get-BoolProperty -Object $evidence -Name "windowsapps_alias_present") "WindowsApps alias exists" "WindowsApps alias is missing"
Add-CheckFromCondition "alias discoverable" (Get-BoolProperty -Object $evidence -Name "alias_visible_in_get_command") "alias is discoverable via Get-Command" "alias is not discoverable via Get-Command"
Add-CheckFromCondition "alias not shadowed" ([string]::IsNullOrWhiteSpace((Get-StringProperty -Object $evidence -Name "alias_shadowed_by"))) "alias is not shadowed" "alias is shadowed by another musu.exe"
Add-CheckFromCondition "startup task" (-not [string]::IsNullOrWhiteSpace((Get-StringProperty -Object $evidence -Name "startup_task_id"))) "startup task id is present" "startup task id is missing"
Add-CheckFromCondition "startup conflicts" ((Get-IntProperty -Object $evidence -Name "startup_conflict_count") -eq 0) "no legacy startup conflicts" "legacy startup conflicts are present"
Add-CheckFromCondition "alias shadowing conflicts" ((Get-IntProperty -Object $evidence -Name "alias_shadowing_count") -eq 0) "no alias shadowing conflicts" "alias shadowing conflicts are present"
Add-CheckFromCondition "legacy conflicts" ((Get-IntProperty -Object $evidence -Name "legacy_conflict_count") -eq 0) "no legacy conflicts" "legacy conflicts are present"

$nestedFailCount = @($evidence.checks | Where-Object { $_.status -eq "fail" }).Count
Add-CheckFromCondition "nested checks" ($nestedFailCount -eq 0) "capture checks have no failures" "capture checks contain $nestedFailCount failure(s)"

$failCount = @($checks | Where-Object { $_.status -eq "fail" }).Count
$result = [pscustomobject]@{
    ok = ($failCount -eq 0)
    evidence_path = (Resolve-Path -LiteralPath $EvidencePath).Path
    fail_count = $failCount
    version = $version
    startup_contract = $startupContract
    package_full_name = $packageFullName
    install_location = $installLocation
    checks = $checks.ToArray()
}

if ($Json) {
    $result | ConvertTo-Json -Depth 6
}
else {
    "MUSU MSIX install evidence verification"
    "ok: $($result.ok)"
    "evidence_path: $($result.evidence_path)"
    "package_full_name: $($result.package_full_name)"
    "startup_contract: $($result.startup_contract)"
    ""
    $checks | Format-Table name, status, message -Wrap
}

if (-not $result.ok) {
    exit 1
}
