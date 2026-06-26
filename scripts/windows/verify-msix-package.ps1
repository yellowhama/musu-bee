[CmdletBinding()]
param(
    [string]$PackagePath,
    [string]$StartupExe,
    [string]$MusuHome,
    [string]$ExpectedApplicationExecutable = "musu-desktop.exe",
    [string]$RuntimeExecutable = "musu.exe",
    [string]$StartupExecutable = "musu-startup.exe",
    [ValidateSet("release", "debug")]
    [string]$Configuration = "debug",
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
    $StartupExe = Join-Path $repoRoot "musu-rs\target\$Configuration\$StartupExecutable"
}
if (-not $MusuHome) {
    $MusuHome = Join-Path $repoRoot ".local-build\startup-smoke"
}

Assert-True (Test-Path -LiteralPath $PackagePath) "MSIX package not found at $PackagePath"
if (-not $SkipSmoke) {
    Assert-True (Test-Path -LiteralPath $StartupExe) "$StartupExecutable not found at $StartupExe"
}

Write-Step "Inspecting MSIX package"
$package = Get-MsixPackageInfo -Path $PackagePath
$manifest = $package.Manifest
$entries = $package.Entries

Assert-True ($entries -contains $ExpectedApplicationExecutable) "MSIX package missing $ExpectedApplicationExecutable"
Assert-True ($entries -contains $RuntimeExecutable) "MSIX package missing $RuntimeExecutable"
Assert-True ($entries -contains $StartupExecutable) "MSIX package missing $StartupExecutable"

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

$applicationNode = $manifest.SelectSingleNode("/appx:Package/appx:Applications/appx:Application", $ns)
Assert-True ($null -ne $applicationNode) "MSIX manifest missing Application element"
Assert-True ($applicationNode.GetAttribute("Executable") -ieq $ExpectedApplicationExecutable) "MSIX application executable is '$($applicationNode.GetAttribute("Executable"))', expected '$ExpectedApplicationExecutable'"

$aliasExtension = $manifest.SelectSingleNode(
    "//uap3:Extension[@Category='windows.appExecutionAlias']",
    $ns
)
$aliasNode = $manifest.SelectSingleNode(
    "//uap3:Extension[@Category='windows.appExecutionAlias']//desktop:ExecutionAlias[@Alias='$RuntimeExecutable']",
    $ns
)
Assert-True ($null -ne $aliasExtension) "MSIX manifest missing appExecutionAlias extension"
Assert-True ($aliasExtension.GetAttribute("Executable") -ieq $RuntimeExecutable) "MSIX alias executable is '$($aliasExtension.GetAttribute("Executable"))', expected '$RuntimeExecutable'"
Assert-True ($null -ne $aliasNode) "MSIX manifest missing appExecutionAlias for $RuntimeExecutable"

$startupExtension = $manifest.SelectSingleNode(
    "//desktop:Extension[@Category='windows.startupTask']",
    $ns
)
$startupNode = $manifest.SelectSingleNode(
    "//desktop:Extension[@Category='windows.startupTask']//desktop:StartupTask[@TaskId='MusuBridgeStartup']",
    $ns
)
Assert-True ($null -ne $startupExtension) "MSIX manifest missing startupTask extension"
Assert-True ($startupExtension.GetAttribute("Executable") -ieq $StartupExecutable) "MSIX startup executable is '$($startupExtension.GetAttribute("Executable"))', expected '$StartupExecutable'"
Assert-True ($null -ne $startupNode) "MSIX manifest missing startupTask for $StartupExecutable"
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
    ApplicationExecutable = $applicationNode.GetAttribute("Executable")
    IncludesDesktop = $true
    IncludesMusu    = $true
    IncludesStartup = $true
    AliasExecutable = $aliasExtension.GetAttribute("Executable")
    StartupExecutable = $startupExtension.GetAttribute("Executable")
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
    if ($LASTEXITCODE -ne 0) {
        throw "packaged startup smoke failed with exit code $LASTEXITCODE"
    }
}
