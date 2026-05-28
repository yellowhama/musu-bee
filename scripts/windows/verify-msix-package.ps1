[CmdletBinding()]
param(
    [string]$PackagePath,
    [string]$StartupExe,
    [string]$MusuHome,
    [ValidateSet("local-sideload-manual", "store-reviewed-immediate-registration")]
    [string]$StartupContract = "local-sideload-manual",
    [switch]$SkipSmoke
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
$repoRoot = Get-WindowsRepoRoot $MyInvocation.MyCommand.Path

if (-not $PackagePath) {
    $PackagePath = Find-LatestMsixArtifact -Directory (Join-Path $repoRoot ".local-build\msix\output") -StartupContract $StartupContract
}
if (-not $StartupExe) {
    $StartupExe = Join-Path $repoRoot "musu-rs\target\debug\musu-startup.exe"
}
if (-not $MusuHome) {
    $MusuHome = Join-Path $repoRoot ".local-build\startup-smoke"
}

Assert-True (Test-Path -LiteralPath $PackagePath) "MSIX package not found at $PackagePath"
Assert-True (Test-Path -LiteralPath $StartupExe) "musu-startup.exe not found at $StartupExe"

Write-Step "Inspecting MSIX package"
$package = Get-MsixPackageInfo -Path $PackagePath
$manifest = $package.Manifest
$entries = $package.Entries

Assert-True ($entries -contains "musu.exe") "MSIX package missing musu.exe"
Assert-True ($entries -contains "musu-startup.exe") "MSIX package missing musu-startup.exe"

$ns = New-Object System.Xml.XmlNamespaceManager($manifest.NameTable)
$ns.AddNamespace("appx", "http://schemas.microsoft.com/appx/manifest/foundation/windows10")
$ns.AddNamespace("uap", "http://schemas.microsoft.com/appx/manifest/uap/windows10")
$ns.AddNamespace("uap3", "http://schemas.microsoft.com/appx/manifest/uap/windows10/3")
$ns.AddNamespace("uap4", "http://schemas.microsoft.com/appx/manifest/uap/windows10/4")
$ns.AddNamespace("desktop", "http://schemas.microsoft.com/appx/manifest/desktop/windows10")
$ns.AddNamespace("rescap", "http://schemas.microsoft.com/appx/manifest/foundation/windows10/restrictedcapabilities")
$ns.AddNamespace("rescap5", "http://schemas.microsoft.com/appx/manifest/foundation/windows10/restrictedcapabilities/5")

$identity = $manifest.SelectSingleNode("/appx:Package/appx:Identity", $ns)
Assert-True ($null -ne $identity) "MSIX manifest missing Identity element"

$aliasNode = $manifest.SelectSingleNode(
    "//uap3:Extension[@Category='windows.appExecutionAlias']//desktop:ExecutionAlias[@Alias='musu.exe']",
    $ns
)
Assert-True ($null -ne $aliasNode) "MSIX manifest missing appExecutionAlias for musu.exe"

$startupNode = $manifest.SelectSingleNode(
    "//desktop:Extension[@Category='windows.startupTask']//desktop:StartupTask[@TaskId='MusuBridgeStartup']",
    $ns
)
Assert-True ($null -ne $startupNode) "MSIX manifest missing startupTask for musu-startup.exe"
Assert-True ($startupNode.Enabled -eq "true") "MSIX startupTask is not enabled"
$startupImmediateRegistration = $startupNode.GetAttribute("ImmediateRegistration", "http://schemas.microsoft.com/appx/manifest/foundation/windows10/restrictedcapabilities/5")

$fullTrustNode = $manifest.SelectSingleNode(
    "//rescap:Capability[@Name='runFullTrust']",
    $ns
)
Assert-True ($null -ne $fullTrustNode) "MSIX manifest missing runFullTrust capability"
$customStartupCapability = $manifest.SelectSingleNode(
    "//uap4:CustomCapability[@Name='Microsoft.nonUserConfigurableStartupTasks_8wekyb3d8bbwe']",
    $ns
)

if ($StartupContract -eq "local-sideload-manual") {
    Assert-True ([string]::IsNullOrWhiteSpace($startupImmediateRegistration)) "Local sideload package must not request ImmediateRegistration."
    Assert-True ($null -eq $customStartupCapability) "Local sideload package must not declare the restricted startup custom capability."
}
else {
    Assert-True ($startupImmediateRegistration -eq "true") "Store-reviewed package must set ImmediateRegistration=true on MusuBridgeStartup."
    Assert-True ($null -ne $customStartupCapability) "Store-reviewed package must declare the restricted startup custom capability."
}

Write-Step "MSIX manifest and contents look correct"
[pscustomobject]@{
    PackagePath     = $PackagePath
    IdentityName    = $package.IdentityName
    Publisher       = $package.Publisher
    Version         = $package.Version
    IncludesMusu    = $true
    IncludesStartup = $true
    StartupTaskId   = $startupNode.TaskId
    StartupEnabled  = $startupNode.Enabled
    StartupContract = $StartupContract
    StartupImmediateRegistration = $startupImmediateRegistration
    HasRestrictedStartupCapability = [bool]$customStartupCapability
} | Format-List

if (-not $SkipSmoke) {
    Write-Step "Running packaged startup smoke"
    powershell -ExecutionPolicy Bypass -File (Join-Path $scriptDir "smoke-packaged-startup.ps1") `
        -StartupExe $StartupExe `
        -MusuHome $MusuHome
}
