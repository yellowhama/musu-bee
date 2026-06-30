[CmdletBinding()]
param(
    [ValidateSet("local-sideload-manual", "store-reviewed-immediate-registration")]
    [string]$StartupContract = "local-sideload-manual",
    [string]$PackagePath,
    [string]$PackageName,
    [string]$EvidencePath,
    [string]$EvidenceRoot,
    [string]$Version,
    [ValidateSet("fail", "warn-explicit-windowsapps")]
    [string]$AliasShadowingMode = "fail",
    [switch]$Json
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
. (Join-Path $scriptDir "msix-common.ps1")

$repoRoot = Get-WindowsRepoRoot $MyInvocation.MyCommand.Path
if ([string]::IsNullOrWhiteSpace($Version)) {
    $versionPath = Join-Path $repoRoot "VERSION"
    $Version = if (Test-Path -LiteralPath $versionPath) {
        (Get-Content -LiteralPath $versionPath -Raw).Trim()
    }
    else {
        "unknown"
    }
}
if ([string]::IsNullOrWhiteSpace($EvidenceRoot)) {
    $EvidenceRoot = Join-Path $repoRoot ".local-build\msix-install"
}
if ([string]::IsNullOrWhiteSpace($EvidencePath)) {
    $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
    $machine = if ([string]::IsNullOrWhiteSpace($env:COMPUTERNAME)) { "machine" } else { $env:COMPUTERNAME }
    $safeMachine = $machine -replace "[^A-Za-z0-9._-]", "_"
    $EvidencePath = Join-Path $EvidenceRoot "$stamp-$safeMachine.evidence.json"
}
if ([string]::IsNullOrWhiteSpace($PackagePath)) {
    $PackagePath = Find-LatestMsixArtifact -Directory (Join-Path $repoRoot ".local-build\msix\output") -StartupContract $StartupContract
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

$artifactInfo = $null
$artifactContract = $null
$installedContract = $null
$pkg = $null
$installLocation = $null
$manifestPath = $null
$manifestXml = $null
$errorText = $null
$windowsAppsAliasPresent = $false
$windowsAppsAliasDiscovered = @()
$firstAliasPath = $null
$aliasShadowedBy = $null
$activeStartupConflictCount = 0
$aliasShadowingCount = 0
$expectedAppId = $null
$startApp = $null
$legacyConflicts = [pscustomobject]@{
    StartupHelpers = @()
    ScheduledTasks = @()
    LegacyBins = @()
    AliasShadowing = @()
    AlternateAliasSources = @()
    ConflictCount = 0
}

try {
    Add-CheckFromCondition "artifact path" (-not [string]::IsNullOrWhiteSpace($PackagePath) -and (Test-Path -LiteralPath $PackagePath)) "MSIX artifact exists" "MSIX artifact is missing"
    if (-not [string]::IsNullOrWhiteSpace($PackagePath) -and (Test-Path -LiteralPath $PackagePath)) {
        $PackagePath = (Resolve-Path -LiteralPath $PackagePath).Path
        $artifactInfo = Get-MsixPackageInfo -Path $PackagePath
        $artifactContract = Get-MsixStartupContract -Manifest $artifactInfo.Manifest
        if ([string]::IsNullOrWhiteSpace($PackageName)) {
            $PackageName = $artifactInfo.IdentityName
        }
    }

    Add-CheckFromCondition "package identity" (-not [string]::IsNullOrWhiteSpace($PackageName)) "package identity resolved" "package identity could not be resolved"
    if (-not [string]::IsNullOrWhiteSpace($PackageName)) {
        $pkg = Get-AppxPackage -Name $PackageName -ErrorAction SilentlyContinue | Select-Object -First 1
    }
    Add-CheckFromCondition "installed package" ($null -ne $pkg) "package is installed for current user" "package is not installed for current user"

    if ($pkg) {
        $installLocation = $pkg.InstallLocation
        $musuExe = Join-Path $installLocation "musu.exe"
        $brainExe = Join-Path $installLocation "musu-brain.exe"
        $startupExe = Join-Path $installLocation "musu-startup.exe"
        $manifestPath = Join-Path $installLocation "AppxManifest.xml"

        Add-CheckFromCondition "musu exe" (Test-Path -LiteralPath $musuExe) "musu.exe exists in installed package" "musu.exe is missing in installed package"
        Add-CheckFromCondition "brain exe" (Test-Path -LiteralPath $brainExe) "musu-brain.exe exists in installed package" "musu-brain.exe is missing in installed package"
        Add-CheckFromCondition "startup exe" (Test-Path -LiteralPath $startupExe) "musu-startup.exe exists in installed package" "musu-startup.exe is missing in installed package"
        Add-CheckFromCondition "installed manifest" (Test-Path -LiteralPath $manifestPath) "AppxManifest.xml exists in installed package" "AppxManifest.xml is missing in installed package"

        if (Test-Path -LiteralPath $manifestPath) {
            [xml]$manifestXml = Get-Content -LiteralPath $manifestPath
            $installedContract = Get-MsixStartupContract -Manifest $manifestXml
            Add-CheckFromCondition "installed alias contract" ([bool]$installedContract.HasAlias) "installed manifest declares appExecutionAlias" "installed manifest does not declare appExecutionAlias"
            Add-CheckFromCondition "installed brain fullTrust process" ([bool]$installedContract.HasBrainFullTrustProcess -and $installedContract.BrainExecutable -eq "musu-brain.exe") "installed manifest declares brain fullTrustProcess" "installed manifest does not declare brain fullTrustProcess"
            Add-CheckFromCondition "installed startup contract" ([bool]$installedContract.HasStartupTask) "installed manifest declares startupTask" "installed manifest does not declare startupTask"
            if ($artifactContract) {
                Add-CheckFromCondition `
                    "artifact contract match" `
                    (Test-MsixStartupContractEquivalent -Left $installedContract -Right $artifactContract) `
                    "installed startup contract matches current artifact" `
                    "installed startup contract does not match current artifact"
            }
        }

        if ($artifactInfo) {
            Add-CheckFromCondition "version match" ($pkg.Version.ToString() -eq [string]$artifactInfo.Version) "installed version matches artifact" "installed version does not match artifact"
        }
    }

    $windowsAppsAliasPath = Join-Path $env:LOCALAPPDATA "Microsoft\WindowsApps\musu.exe"
    $aliasCommands = @(Get-Command "musu.exe" -All -ErrorAction SilentlyContinue)
    $windowsAppsAliasPresent = Test-Path -LiteralPath $windowsAppsAliasPath
    $windowsAppsAliasDiscovered = @($aliasCommands | Where-Object { $_.Source -eq $windowsAppsAliasPath })
    $firstAliasPath = if ($aliasCommands.Count -gt 0) { $aliasCommands[0].Source } else { $null }
    $aliasShadowedBy = if (
        $windowsAppsAliasDiscovered.Count -gt 0 -and
        $firstAliasPath -and
        $firstAliasPath -ne $windowsAppsAliasPath
    ) {
        $firstAliasPath
    }
    else {
        $null
    }

    $explicitWindowsAppsAliasAvailable = ($windowsAppsAliasPresent -and $windowsAppsAliasDiscovered.Count -gt 0)
    $aliasResolutionShadowingAccepted = (
        $AliasShadowingMode -eq "warn-explicit-windowsapps" -and
        -not [string]::IsNullOrWhiteSpace($aliasShadowedBy) -and
        $explicitWindowsAppsAliasAvailable
    )

    Add-CheckFromCondition "windowsapps alias file" $windowsAppsAliasPresent "WindowsApps alias file exists" "WindowsApps alias file is missing"
    Add-CheckFromCondition "windowsapps alias discoverable" ($windowsAppsAliasDiscovered.Count -gt 0) "WindowsApps alias is discoverable via Get-Command" "WindowsApps alias is not discoverable via Get-Command"
    Add-CheckFromCondition `
        "alias not shadowed" `
        ([string]::IsNullOrWhiteSpace($aliasShadowedBy) -or $aliasResolutionShadowingAccepted) `
        ($(if ([string]::IsNullOrWhiteSpace($aliasShadowedBy)) { "PATH resolves WindowsApps alias first" } else { "PATH shadowing accepted for developer evidence; explicit WindowsApps alias is available: $windowsAppsAliasPath" })) `
        "PATH resolves another musu.exe before WindowsApps: $aliasShadowedBy"

    $legacyConflicts = Get-MusuLegacyWindowsConflicts
    $activeStartupConflictCount = @($legacyConflicts.StartupHelpers).Count + @($legacyConflicts.ScheduledTasks).Count + @($legacyConflicts.LegacyBins).Count
    $aliasShadowingCount = @($legacyConflicts.AliasShadowing).Count
    $legacyAliasShadowingAccepted = (
        $AliasShadowingMode -eq "warn-explicit-windowsapps" -and
        $aliasShadowingCount -gt 0 -and
        [bool]$legacyConflicts.WindowsAppsAliasPresent -and
        [bool]$legacyConflicts.WindowsAppsAliasDiscovered
    )
    Add-CheckFromCondition "legacy startup conflicts" ($activeStartupConflictCount -eq 0) "no legacy startup/bin conflicts found" "legacy startup/bin conflicts found"
    Add-CheckFromCondition `
        "legacy alias shadowing" `
        ($aliasShadowingCount -eq 0 -or $legacyAliasShadowingAccepted) `
        ($(if ($aliasShadowingCount -eq 0) { "no legacy alias shadowing found" } else { "legacy alias shadowing accepted for developer evidence with explicit WindowsApps invocation" })) `
        "legacy alias shadowing found"
    Add-CheckFromCondition `
        "alias shadowing policy" `
        (([string]::IsNullOrWhiteSpace($aliasShadowedBy) -and $aliasShadowingCount -eq 0) -or ($aliasResolutionShadowingAccepted -and $legacyAliasShadowingAccepted)) `
        "alias shadowing mode '$AliasShadowingMode' is satisfied" `
        "alias shadowing mode '$AliasShadowingMode' does not permit the detected PATH shadowing"

    $applicationNode = if ($manifestXml) {
        $ns = New-MsixNamespaceManager -Manifest $manifestXml
        $manifestXml.SelectSingleNode("/appx:Package/appx:Applications/appx:Application", $ns)
    }
    else {
        $null
    }
    $applicationId = if ($applicationNode) { $applicationNode.GetAttribute("Id") } else { $null }
    $expectedAppId = if ($pkg -and $applicationId) { "{0}!{1}" -f $pkg.PackageFamilyName, $applicationId } else { $null }
    $startApp = if ($expectedAppId) {
        Get-StartApps -ErrorAction SilentlyContinue | Where-Object { $_.AppID -eq $expectedAppId } | Select-Object -First 1
    }
    else {
        $null
    }
}
catch {
    $errorText = $_.Exception.Message
    Add-Check -Name "capture error" -Status "fail" -Message $errorText
}

$failCount = @($checks | Where-Object { $_.status -eq "fail" }).Count
$legacyConflicts = if ($legacyConflicts) { $legacyConflicts } else { [pscustomobject]@{} }
$evidence = [pscustomobject]@{
    schema = "musu.msix_install_evidence.v1"
    ok = ($failCount -eq 0)
    version = $Version
    startup_contract = $StartupContract
    recorded_at = (Get-Date).ToString("o")
    operator_machine = $env:COMPUTERNAME
    operator_user = $env:USERNAME
    package_path = $PackagePath
    package_name = $PackageName
    artifact_version = if ($artifactInfo) { [string]$artifactInfo.Version } else { $null }
    package_full_name = if ($pkg) { $pkg.PackageFullName } else { $null }
    installed_version = if ($pkg) { $pkg.Version.ToString() } else { $null }
    install_location = $installLocation
    startup_task_id = if ($installedContract) { $installedContract.StartupTaskId } else { $null }
    startup_enabled = if ($installedContract) { $installedContract.StartupEnabled } else { $null }
    brain_full_trust_process = if ($installedContract) { [bool]$installedContract.HasBrainFullTrustProcess } else { $false }
    brain_executable = if ($installedContract) { $installedContract.BrainExecutable } else { $null }
    startup_immediate_registration = if ($installedContract) { $installedContract.StartupImmediateRegistration } else { $null }
    non_user_configurable_startup_capability = if ($installedContract) { [bool]$installedContract.HasNonUserConfigurableStartupCapability } else { $false }
    run_full_trust = if ($installedContract) { [bool]$installedContract.HasRunFullTrust } else { $false }
    artifact_contract_match = if ($artifactContract -and $installedContract) { Test-MsixStartupContractEquivalent -Left $installedContract -Right $artifactContract } else { $false }
    windowsapps_alias_present = [bool]$windowsAppsAliasPresent
    alias_visible_in_get_command = ($windowsAppsAliasDiscovered.Count -gt 0)
    windowsapps_alias_invocation = if ($windowsAppsAliasPresent) { "& `"$windowsAppsAliasPath`"" } else { $null }
    first_alias_path = $firstAliasPath
    alias_shadowed_by = $aliasShadowedBy
    alias_shadowing_mode = $AliasShadowingMode
    alias_shadowing_accepted = [bool]($aliasResolutionShadowingAccepted -and $legacyAliasShadowingAccepted)
    alias_shadowing_release_gate = if ($aliasResolutionShadowingAccepted -and $legacyAliasShadowingAccepted) { "developer-warning-only; clean public release evidence still requires AliasShadowingMode=fail and no PATH shadowing" } else { "strict" }
    alias_resolution_order = @($aliasCommands | ForEach-Object { $_.Source })
    alternate_alias_count = @($legacyConflicts.AlternateAliasSources).Count
    alternate_alias_sources = @($legacyConflicts.AlternateAliasSources)
    alias_remediation = if ($aliasShadowingCount -gt 0) { "Move '$env:LOCALAPPDATA\Microsoft\WindowsApps' before the shadowing PATH entry, or invoke the packaged app explicitly with & `"$windowsAppsAliasPath`"." } else { $null }
    start_menu_entry = [bool]$startApp
    expected_start_app_id = $expectedAppId
    startup_conflict_count = [int]$activeStartupConflictCount
    alias_shadowing_count = [int]$aliasShadowingCount
    legacy_conflict_count = [int]$legacyConflicts.ConflictCount
    legacy_startup_helpers = (@($legacyConflicts.StartupHelpers | ForEach-Object { $_.Name }) -join "; ")
    legacy_scheduled_tasks = (@($legacyConflicts.ScheduledTasks | ForEach-Object { "{0}{1}" -f $_.TaskPath, $_.TaskName }) -join "; ")
    legacy_bins = (@($legacyConflicts.LegacyBins) -join "; ")
    fail_count = $failCount
    checks = $checks.ToArray()
    error = $errorText
}

New-Item -ItemType Directory -Force -Path (Split-Path -Parent $EvidencePath) | Out-Null
$evidence | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $EvidencePath -Encoding UTF8

if ($Json) {
    $evidence | ConvertTo-Json -Depth 8
}
else {
    "MUSU MSIX install evidence"
    "ok: $($evidence.ok)"
    "evidence_path: $((Resolve-Path -LiteralPath $EvidencePath).Path)"
    "package_full_name: $($evidence.package_full_name)"
    "startup_contract: $($evidence.startup_contract)"
    ""
    $checks | Format-Table name, status, message -Wrap
}

if (-not $evidence.ok) {
    exit 1
}
