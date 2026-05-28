[CmdletBinding()]
param(
    [string]$PackagePath,
    [string]$CertPath,
    [ValidateSet("local-sideload-manual", "store-reviewed-immediate-registration")]
    [string]$StartupContract = "local-sideload-manual"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
. (Join-Path $scriptDir "msix-common.ps1")

function Write-Step([string]$Message) {
    Write-Host "==> $Message"
}

function Get-DeveloperModeEnabled() {
    $key = "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\AppModelUnlock"
    $prop = Get-ItemProperty -Path $key -Name AllowDevelopmentWithoutDevLicense -ErrorAction SilentlyContinue
    return [bool]($prop -and $prop.AllowDevelopmentWithoutDevLicense -eq 1)
}

function Get-CertPresence([string]$Thumbprint, [string]$StorePath) {
    return [bool](Get-ChildItem -Path $StorePath -ErrorAction SilentlyContinue | Where-Object {
        $_.Thumbprint -eq $Thumbprint
    } | Select-Object -First 1)
}

$repoRoot = Get-WindowsRepoRoot $MyInvocation.MyCommand.Path

if (-not $PackagePath) {
    $PackagePath = Find-LatestMsixArtifact -Directory (Join-Path $repoRoot ".local-build\msix\output") -StartupContract $StartupContract
}
if (-not $CertPath) {
    $CertPath = Find-LatestArtifact -Directory (Join-Path $repoRoot ".local-build\msix\output") -Filter "*.pfx"
}

Write-Step "Inspecting MSIX sideload prerequisites"

$admin = Test-IsAdministrator
$developerMode = Get-DeveloperModeEnabled
$winAppPresent = [bool](Get-Command winapp -ErrorAction SilentlyContinue)
$packageExists = [bool]($PackagePath -and (Test-Path -LiteralPath $PackagePath))
$certExists = [bool]($CertPath -and (Test-Path -LiteralPath $CertPath))
$thumbprint = $null
$certStores = @{}

if ($certExists) {
    $pfx = Get-PfxData -FilePath $CertPath -Password (ConvertTo-SecureString "password" -AsPlainText -Force)
    $thumbprint = $pfx.EndEntityCertificates[0].Thumbprint
    $certStores = @{
        CurrentUserTrustedPeople = Get-CertPresence -Thumbprint $thumbprint -StorePath "Cert:\CurrentUser\TrustedPeople"
        CurrentUserRoot          = Get-CertPresence -Thumbprint $thumbprint -StorePath "Cert:\CurrentUser\Root"
        LocalMachineTrustedPeople = Get-CertPresence -Thumbprint $thumbprint -StorePath "Cert:\LocalMachine\TrustedPeople"
        LocalMachineRoot          = Get-CertPresence -Thumbprint $thumbprint -StorePath "Cert:\LocalMachine\Root"
    }
}

$packageName = $null
if ($packageExists) {
    try {
        $packageName = (Get-MsixPackageInfo -Path $PackagePath).IdentityName
    }
    catch {
        $packageName = $null
    }
}

$installedPackage = $null
if ($packageName) {
    $installedPackage = Get-AppxPackage -Name $packageName -ErrorAction SilentlyContinue
}

[pscustomobject]@{
    IsAdministrator            = $admin
    DeveloperModeEnabled       = $developerMode
    WinAppCliPresent           = $winAppPresent
    PackagePath                = $PackagePath
    PackageExists              = $packageExists
    PackageIdentity            = $packageName
    CertPath                   = $CertPath
    CertExists                 = $certExists
    CertThumbprint             = $thumbprint
    CurrentUserTrustedPeople   = $certStores.CurrentUserTrustedPeople
    CurrentUserRoot            = $certStores.CurrentUserRoot
    LocalMachineTrustedPeople  = $certStores.LocalMachineTrustedPeople
    LocalMachineRoot           = $certStores.LocalMachineRoot
    PackageInstalled           = [bool]$installedPackage
} | Format-List

Write-Host ""
Write-Host "Guidance:"
if (-not $packageExists) {
    Write-Host "- Build an MSIX first with scripts\windows\build-msix.ps1"
}
if (-not $certExists) {
    Write-Host "- Generate or provide a signing certificate before sideload install."
}
if (-not $developerMode) {
    Write-Host "- Developer Mode is OFF. Needed for debug-identity flows, not always for Add-AppxPackage."
}
if (-not $admin) {
    Write-Host "- Session is NOT elevated. If CurrentUser trust is insufficient, rerun install with elevation and -MachineTrust."
}
if ($certExists -and -not $certStores.LocalMachineTrustedPeople -and -not $certStores.LocalMachineRoot) {
    Write-Host "- Certificate is not trusted in LocalMachine stores. This machine previously needed machine-level trust for sideload."
}
if ($installedPackage) {
    Write-Host "- Package already appears installed."
}
