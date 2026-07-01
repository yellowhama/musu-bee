[CmdletBinding()]
param(
    [string]$PackageName,
    [string]$PackagePath,
    [string]$BrainExecutable = "musu-brain.exe",
    [ValidateSet("local-sideload-manual", "store-reviewed-immediate-registration")]
    [string]$StartupContract = "local-sideload-manual",
    [switch]$CheckAlias
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
. (Join-Path $scriptDir "msix-common.ps1")

function Write-Step([string]$Message) {
    Write-Host "==> $Message"
}

function Assert-True([bool]$Condition, [string]$Message) {
    if (-not $Condition) {
        throw $Message
    }
}

Write-Step "Inspecting installed MSIX package"

if (-not $PackageName) {
    if (-not $PackagePath) {
        $repoRoot = Get-WindowsRepoRoot $MyInvocation.MyCommand.Path
        $PackagePath = Find-LatestMsixArtifact -Directory (Join-Path $repoRoot ".local-build\msix\output") -StartupContract $StartupContract
    }
    if ($PackagePath -and (Test-Path -LiteralPath $PackagePath)) {
        $PackageName = (Get-MsixPackageInfo -Path $PackagePath).IdentityName
    }
}

if (-not $PackageName) {
    throw "Unable to resolve package identity. Pass -PackageName or -PackagePath."
}

$pkg = Get-AppxPackage -Name $PackageName -ErrorAction SilentlyContinue
if (-not $pkg) {
    throw "Package '$PackageName' is not installed for the current user."
}

$installLocation = $pkg.InstallLocation
$musuExe = Join-Path $installLocation "musu.exe"
$brainExe = Join-Path $installLocation $BrainExecutable
$startupExe = Join-Path $installLocation "musu-startup.exe"
$manifestPath = Join-Path $installLocation "AppxManifest.xml"

Assert-True (Test-Path -LiteralPath $musuExe) "Installed package is missing musu.exe at $musuExe"
Assert-True (Test-Path -LiteralPath $brainExe) "Installed package is missing $BrainExecutable at $brainExe"
Assert-True (Test-Path -LiteralPath $startupExe) "Installed package is missing musu-startup.exe at $startupExe"
Assert-True (Test-Path -LiteralPath $manifestPath) "Installed package is missing AppxManifest.xml at $manifestPath"

[xml]$manifestXml = Get-Content -LiteralPath $manifestPath
$ns = New-MsixNamespaceManager -Manifest $manifestXml
$installedContract = Get-MsixStartupContract -Manifest $manifestXml
$applicationNode = $manifestXml.SelectSingleNode("/appx:Package/appx:Applications/appx:Application", $ns)
$applicationId = if ($applicationNode) { $applicationNode.GetAttribute("Id") } else { $null }
$visualElements = $manifestXml.SelectSingleNode("//uap:VisualElements", $ns)
$appListEntry = if ($visualElements) { $visualElements.GetAttribute("AppListEntry") } else { $null }

$startupTask = $manifestXml.SelectSingleNode(
    "//desktop:Extension[@Category='windows.startupTask']//desktop:StartupTask[@TaskId='MusuBridgeStartup']",
    $ns
)
$alias = $manifestXml.SelectSingleNode(
    "//uap3:Extension[@Category='windows.appExecutionAlias']//desktop:ExecutionAlias[@Alias='musu.exe']",
    $ns
)
$brainExtension = $manifestXml.SelectSingleNode(
    "//desktop:Extension[@Category='windows.fullTrustProcess' and @Executable='$BrainExecutable']",
    $ns
)
$brainProcess = $manifestXml.SelectSingleNode(
    "//desktop:Extension[@Category='windows.fullTrustProcess' and @Executable='$BrainExecutable']//desktop:FullTrustProcess",
    $ns
)
$customStartupCapability = $manifestXml.SelectSingleNode(
    "//uap4:CustomCapability[@Name='Microsoft.nonUserConfigurableStartupTasks_8wekyb3d8bbwe']",
    $ns
)

Assert-True ($null -ne $startupTask) "Installed package manifest is missing startupTask 'MusuBridgeStartup'"
Assert-True ($null -ne $alias) "Installed package manifest is missing appExecutionAlias 'musu.exe'"
Assert-True ($null -ne $brainExtension) "Installed package manifest is missing fullTrustProcess for $BrainExecutable"
Assert-True ($null -ne $brainProcess) "Installed package manifest is missing FullTrustProcess declaration for $BrainExecutable"
$startupImmediateRegistration = $startupTask.GetAttribute("ImmediateRegistration", $ns.LookupNamespace("rescap5"))

$artifactContract = $null
$matchesArtifactContract = $null
if ($PackagePath -and (Test-Path -LiteralPath $PackagePath)) {
    $artifactContract = Get-MsixStartupContract -Manifest (Get-MsixPackageInfo -Path $PackagePath).Manifest
    $matchesArtifactContract = Test-MsixStartupContractEquivalent -Left $installedContract -Right $artifactContract
}

$expectedAppId = if ($applicationId) { "{0}!{1}" -f $pkg.PackageFamilyName, $applicationId } else { $null }
$startApp = if ($expectedAppId) {
    Get-StartApps -ErrorAction SilentlyContinue | Where-Object { $_.AppID -eq $expectedAppId } | Select-Object -First 1
} else {
    $null
}
$aliasCommands = @(Get-Command musu.exe -All -ErrorAction SilentlyContinue)
$windowsAppsAliasPath = Join-Path $env:LOCALAPPDATA "Microsoft\WindowsApps\musu.exe"
$windowsAppsAliasPresent = Test-Path -LiteralPath $windowsAppsAliasPath
$windowsAppsAliasDiscovered = @($aliasCommands | Where-Object { $_.Source -eq $windowsAppsAliasPath })
$firstAliasPath = if ($aliasCommands.Count -gt 0) { $aliasCommands[0].Source } else { $null }
$aliasShadowedBy = if (
    $windowsAppsAliasDiscovered.Count -gt 0 -and
    $firstAliasPath -and
    $firstAliasPath -ne $windowsAppsAliasPath
) {
    $firstAliasPath
} else {
    $null
}
$aliasResolutionOrder = @($aliasCommands | ForEach-Object { $_.Source }) -join "; "
$legacyConflicts = Get-MusuLegacyWindowsConflicts
$activeStartupConflictCount = @($legacyConflicts.StartupHelpers).Count + @($legacyConflicts.ScheduledTasks).Count + @($legacyConflicts.LegacyBins).Count
$aliasShadowingCount = @($legacyConflicts.AliasShadowing).Count
$alternateAliasCount = @($legacyConflicts.AlternateAliasSources).Count

[pscustomobject]@{
    PackageName              = $pkg.Name
    PackageFullName          = $pkg.PackageFullName
    Version                  = $pkg.Version.ToString()
    InstallLocation          = $installLocation
    MusuExePresent           = $true
    BrainExePresent          = $true
    BrainFullTrustProcess    = $true
    StartupExePresent        = $true
    StartupTaskId            = $startupTask.GetAttribute("TaskId")
    StartupEnabled           = $startupTask.GetAttribute("Enabled")
    AppListEntry             = $appListEntry
    StartupImmediateRegistration = $startupImmediateRegistration
    NonUserConfigurableStartupCapability = [bool]$customStartupCapability
    MatchesArtifactContract  = $matchesArtifactContract
    ArtifactImmediateRegistration = if ($artifactContract) { $artifactContract.StartupImmediateRegistration } else { $null }
    ArtifactNonUserConfigurableStartupCapability = if ($artifactContract) { $artifactContract.HasNonUserConfigurableStartupCapability } else { $null }
    AliasPresent             = $true
    StartMenuEntry           = [bool]$startApp
    ExpectedStartAppId       = $expectedAppId
    WindowsAppsAliasPath     = $windowsAppsAliasPath
    WindowsAppsAliasPresent  = $windowsAppsAliasPresent
    AliasVisibleInGetCommand = ($windowsAppsAliasDiscovered.Count -gt 0)
    FirstAliasPath           = $firstAliasPath
    AliasShadowedBy          = $aliasShadowedBy
    AliasResolutionOrder     = $aliasResolutionOrder
    WindowsAppsAliasInvocation = if ($windowsAppsAliasPresent) { "& `"$windowsAppsAliasPath`"" } else { $null }
    LegacyConflictCount      = $legacyConflicts.ConflictCount
    StartupConflictCount     = $activeStartupConflictCount
    AliasShadowingCount      = $aliasShadowingCount
    AlternateAliasCount      = $alternateAliasCount
    AlternateAliasSources    = (@($legacyConflicts.AlternateAliasSources) -join "; ")
    LegacyStartupHelpers     = (@($legacyConflicts.StartupHelpers | ForEach-Object { $_.Name }) -join "; ")
    LegacyScheduledTasks     = (@($legacyConflicts.ScheduledTasks | ForEach-Object { "{0}{1}" -f $_.TaskPath, $_.TaskName }) -join "; ")
    LegacyBins               = (@($legacyConflicts.LegacyBins) -join "; ")
} | Format-List

if ($activeStartupConflictCount -gt 0) {
    Write-Warning "Legacy direct-download startup artifacts are still present. Use check-msix-legacy-conflicts.ps1 before treating packaged startup results as clean."
}
elseif ($aliasShadowingCount -gt 0) {
    Write-Warning "Packaged install looks clean, but PATH still resolves another musu.exe before the WindowsApps alias."
}

if ($null -ne $matchesArtifactContract -and -not $matchesArtifactContract) {
    Write-Warning "Installed package startup contract does not match the current artifact. Reinstall with install-msix.ps1 -ReplaceExisting before treating runtime results as current."
}

if ($CheckAlias) {
    if (-not $windowsAppsAliasPresent) {
        throw "musu.exe execution alias stub is missing from WindowsApps: $windowsAppsAliasPath"
    }
    if ($windowsAppsAliasDiscovered.Count -eq 0) {
        throw "musu.exe execution alias exists on disk but is not discoverable via Get-Command -All."
    }
    if ($aliasShadowedBy) {
        Write-Warning "WindowsApps execution alias exists, but PATH order currently resolves '$aliasShadowedBy' first."
    }
    Write-Step "Execution alias resolves"
    Write-Host $windowsAppsAliasPath
}
