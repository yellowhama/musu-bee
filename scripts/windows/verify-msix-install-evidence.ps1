[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$EvidencePath,
    [string]$ExpectedVersion,
    [ValidateSet("local-sideload-manual", "store-reviewed-immediate-registration", "")]
    [string]$ExpectedStartupContract = "",
    [int]$MaxAgeDays = 30,
    [ValidateSet("fail", "warn-explicit-windowsapps")]
    [string]$AliasShadowingMode = "fail",
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

function Get-NestedCheck {
    param(
        [object[]]$NestedChecks = @(),
        [Parameter(Mandatory = $true)][string]$Name
    )

    @($NestedChecks | Where-Object {
        $check = $_
        if ($null -eq $check) {
            $false
        }
        else {
            (Get-StringProperty -Object $check -Name "name") -eq $Name
        }
    }) | Select-Object -First 1
}

function Get-NestedCheckStatus {
    param($Check)

    if (-not $Check) {
        return ""
    }
    return (Get-StringProperty -Object $Check -Name "status")
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
$artifactVersion = Get-StringProperty -Object $evidence -Name "artifact_version"
$installLocation = Get-StringProperty -Object $evidence -Name "install_location"
$operatorMachine = Get-StringProperty -Object $evidence -Name "operator_machine"
$operatorUser = Get-StringProperty -Object $evidence -Name "operator_user"
$nestedChecks = Get-ArrayProperty -Object $evidence -Name "checks"
$now = [datetimeoffset]::Now
$futureTolerance = [timespan]::FromMinutes(5)
$aliasShadowedBy = Get-StringProperty -Object $evidence -Name "alias_shadowed_by"
$aliasShadowingCount = Get-IntProperty -Object $evidence -Name "alias_shadowing_count"
$legacyConflictCount = Get-IntProperty -Object $evidence -Name "legacy_conflict_count"
$startupConflictCount = Get-IntProperty -Object $evidence -Name "startup_conflict_count"
$evidenceAliasShadowingMode = Get-StringProperty -Object $evidence -Name "alias_shadowing_mode"
if ([string]::IsNullOrWhiteSpace($evidenceAliasShadowingMode)) {
    $evidenceAliasShadowingMode = "fail"
}
$aliasShadowingPresent = (-not [string]::IsNullOrWhiteSpace($aliasShadowedBy) -or $aliasShadowingCount -gt 0)
$explicitWindowsAppsAliasAvailable = (
    (Get-BoolProperty -Object $evidence -Name "windowsapps_alias_present") -and
    (Get-BoolProperty -Object $evidence -Name "alias_visible_in_get_command") -and
    -not [string]::IsNullOrWhiteSpace((Get-StringProperty -Object $evidence -Name "windowsapps_alias_invocation"))
)
$aliasShadowingAccepted = (
    $aliasShadowingPresent -and
    $AliasShadowingMode -eq "warn-explicit-windowsapps" -and
    $evidenceAliasShadowingMode -eq "warn-explicit-windowsapps" -and
    (Get-BoolProperty -Object $evidence -Name "alias_shadowing_accepted") -and
    $explicitWindowsAppsAliasAvailable
)
$legacyConflictsOnlyAliasShadowing = (
    $legacyConflictCount -eq $aliasShadowingCount -and
    $startupConflictCount -eq 0
)

Add-CheckFromCondition "schema" ($schema -eq "musu.msix_install_evidence.v1") "schema is valid" "schema is not musu.msix_install_evidence.v1"
Add-CheckFromCondition "evidence ok" $ok "evidence reports ok=true" "evidence does not report ok=true"
Add-CheckFromCondition "version" (-not [string]::IsNullOrWhiteSpace($version)) "version is present" "version is missing"
Add-CheckFromCondition "expected version" ($version -eq $ExpectedVersion) "version matches $ExpectedVersion" "version does not match $ExpectedVersion"
Add-CheckFromCondition "startup contract" ($startupContract -in @("local-sideload-manual", "store-reviewed-immediate-registration")) "startup contract is valid" "startup contract is invalid"
if (-not [string]::IsNullOrWhiteSpace($ExpectedStartupContract)) {
    Add-CheckFromCondition "expected startup contract" ($startupContract -eq $ExpectedStartupContract) "startup contract matches $ExpectedStartupContract" "startup contract does not match $ExpectedStartupContract"
}
Add-CheckFromCondition "recorded timestamp" ($null -ne $recordedAt) "recorded_at parses" "recorded_at is missing or invalid"
if ($recordedAt) {
    $age = [datetimeoffset]::Now - $recordedAt
    Add-CheckFromCondition "evidence age" ($age.TotalDays -le $MaxAgeDays -and $age.TotalSeconds -ge -300) "recorded_at is within $MaxAgeDays days" "recorded_at is outside the allowed evidence window"
    Add-CheckFromCondition "recorded timestamp not future" ($recordedAt -le ($now + $futureTolerance)) "recorded_at is not in the future" "recorded_at is more than 5 minutes in the future"
}

Add-CheckFromCondition "package name" (-not [string]::IsNullOrWhiteSpace($packageName)) "package name is present" "package name is missing"
Add-CheckFromCondition "package full name" (-not [string]::IsNullOrWhiteSpace($packageFullName)) "package full name is present" "package full name is missing"
Add-CheckFromCondition "installed version" (-not [string]::IsNullOrWhiteSpace($installedVersion)) "installed version is present" "installed version is missing"
Add-CheckFromCondition "artifact version" (-not [string]::IsNullOrWhiteSpace($artifactVersion)) "artifact version is present" "artifact version is missing"
if (-not [string]::IsNullOrWhiteSpace($installedVersion) -and -not [string]::IsNullOrWhiteSpace($artifactVersion)) {
    Add-CheckFromCondition "installed artifact version match" ($installedVersion -eq $artifactVersion) "installed version matches artifact version" "installed version does not match artifact version"
}
Add-CheckFromCondition "install location" (-not [string]::IsNullOrWhiteSpace($installLocation)) "install location is present" "install location is missing"
Add-CheckFromCondition "operator machine" (-not [string]::IsNullOrWhiteSpace($operatorMachine)) "operator_machine is present" "operator_machine is missing"
Add-CheckFromCondition "operator user" (-not [string]::IsNullOrWhiteSpace($operatorUser)) "operator_user is present" "operator_user is missing"
Add-CheckFromCondition "artifact contract match" (Get-BoolProperty -Object $evidence -Name "artifact_contract_match") "installed contract matches artifact" "installed contract does not match artifact"
Add-CheckFromCondition "brain fullTrust process" (Get-BoolProperty -Object $evidence -Name "brain_full_trust_process") "brain fullTrustProcess is declared" "brain fullTrustProcess is not declared"
Add-CheckFromCondition "brain executable" ((Get-StringProperty -Object $evidence -Name "brain_executable") -eq "musu-brain.exe") "brain executable is musu-brain.exe" "brain executable is missing or invalid"
Add-CheckFromCondition "WindowsApps alias" (Get-BoolProperty -Object $evidence -Name "windowsapps_alias_present") "WindowsApps alias exists" "WindowsApps alias is missing"
Add-CheckFromCondition "alias discoverable" (Get-BoolProperty -Object $evidence -Name "alias_visible_in_get_command") "alias is discoverable via Get-Command" "alias is not discoverable via Get-Command"
Add-CheckFromCondition "alias shadowing mode" ($evidenceAliasShadowingMode -in @("fail", "warn-explicit-windowsapps")) "alias shadowing mode is valid" "alias shadowing mode is invalid"
Add-CheckFromCondition `
    "alias shadowing policy" `
    (-not $aliasShadowingPresent -or $aliasShadowingAccepted) `
    ($(if (-not $aliasShadowingPresent) { "no PATH alias shadowing is present" } else { "PATH alias shadowing is accepted only for explicit WindowsApps developer evidence" })) `
    "PATH alias shadowing is present and AliasShadowingMode='$AliasShadowingMode' does not allow it"
Add-CheckFromCondition `
    "alias not shadowed" `
    ([string]::IsNullOrWhiteSpace($aliasShadowedBy) -or $aliasShadowingAccepted) `
    ($(if ([string]::IsNullOrWhiteSpace($aliasShadowedBy)) { "alias is not shadowed" } else { "alias shadowing is accepted for explicit WindowsApps developer evidence" })) `
    "alias is shadowed by another musu.exe"
Add-CheckFromCondition "startup task" (-not [string]::IsNullOrWhiteSpace((Get-StringProperty -Object $evidence -Name "startup_task_id"))) "startup task id is present" "startup task id is missing"
Add-CheckFromCondition "startup conflicts" ($startupConflictCount -eq 0) "no legacy startup conflicts" "legacy startup conflicts are present"
Add-CheckFromCondition `
    "alias shadowing conflicts" `
    ($aliasShadowingCount -eq 0 -or $aliasShadowingAccepted) `
    ($(if ($aliasShadowingCount -eq 0) { "no alias shadowing conflicts" } else { "alias shadowing conflicts are accepted for explicit WindowsApps developer evidence" })) `
    "alias shadowing conflicts are present"
Add-CheckFromCondition `
    "legacy conflicts" `
    ($legacyConflictCount -eq 0 -or ($aliasShadowingAccepted -and $legacyConflictsOnlyAliasShadowing)) `
    ($(if ($legacyConflictCount -eq 0) { "no legacy conflicts" } else { "only alias shadowing legacy conflicts are accepted for explicit WindowsApps developer evidence" })) `
    "legacy conflicts are present"

$requiredNestedChecks = @(
    "artifact path",
    "package identity",
    "installed package",
    "musu exe",
    "brain exe",
    "startup exe",
    "installed manifest",
    "installed alias contract",
    "installed brain fullTrust process",
    "installed startup contract",
    "artifact contract match",
    "version match",
    "windowsapps alias file",
    "windowsapps alias discoverable",
    "alias not shadowed",
    "legacy startup conflicts",
    "legacy alias shadowing"
)
Add-CheckFromCondition "nested checks present" (@($nestedChecks).Count -gt 0) "capture checks are present" "capture checks are missing"
foreach ($requiredCheck in $requiredNestedChecks) {
    $nestedCheck = Get-NestedCheck -NestedChecks $nestedChecks -Name $requiredCheck
    $status = Get-NestedCheckStatus -Check $nestedCheck
    Add-CheckFromCondition "capture check: $requiredCheck" ($status -eq "pass") "capture check '$requiredCheck' passed" "capture check '$requiredCheck' is missing or not passing"
}

$nestedFailCount = @($nestedChecks | Where-Object { (Get-NestedCheckStatus -Check $_) -eq "fail" }).Count
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
    alias_shadowing_mode = $evidenceAliasShadowingMode
    alias_shadowing_accepted = [bool]$aliasShadowingAccepted
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
