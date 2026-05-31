[CmdletBinding()]
param(
    [string]$PackagePath,
    [string]$CertPath,
    [string]$CertPassword = "password",
    [string]$PackageName,
    [ValidateSet("local-sideload-manual", "store-reviewed-immediate-registration")]
    [string]$StartupContract = "local-sideload-manual",
    [switch]$ReplaceExisting,
    [switch]$MachineTrust,
    [switch]$DryRun,
    [switch]$SkipCertInstall,
    [switch]$AllowRestrictedCapabilitySideload
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
. (Join-Path $scriptDir "msix-common.ps1")

function Write-Step([string]$Message) {
    Write-Host "==> $Message"
}

function Resolve-DefaultPath([string]$Candidate) {
    if (Test-Path -LiteralPath $Candidate) {
        return (Resolve-Path -LiteralPath $Candidate).Path
    }
    return $Candidate
}

function Invoke-CertUtil {
    param(
        [Parameter(Mandatory = $true)][string[]]$ArgumentList
    )

    $rendered = $ArgumentList -join " "
    if ($DryRun) {
        Write-Host "[dry-run] certutil $rendered"
        return
    }

    & certutil @ArgumentList | Out-Null
    if ($LASTEXITCODE -ne 0) {
        throw "certutil failed with exit code ${LASTEXITCODE}: certutil $rendered"
    }
}

$repoRoot = Get-WindowsRepoRoot $MyInvocation.MyCommand.Path

if (-not $PackagePath) {
    $PackagePath = Find-LatestMsixArtifact -Directory (Join-Path $repoRoot ".local-build\msix\output") -StartupContract $StartupContract
}
if (-not $CertPath) {
    $CertPath = Find-LatestMsixCertificateArtifact -Directory (Join-Path $repoRoot ".local-build\msix\output")
}

if (-not (Test-Path -LiteralPath $PackagePath)) {
    throw "MSIX package not found at $PackagePath"
}
if (-not $SkipCertInstall -and -not (Test-Path -LiteralPath $CertPath)) {
    throw "Certificate not found at $CertPath"
}

$msixIdentity = Get-MsixPackageInfo -Path $PackagePath
$artifactContract = Get-MsixStartupContract -Manifest $msixIdentity.Manifest
$artifactThumbprint = Get-MsixCertificateThumbprint -CertPath $CertPath -CertPassword $CertPassword
if (-not $PackageName) {
    $PackageName = $msixIdentity.IdentityName
}

if ($MachineTrust -and -not $DryRun -and -not (Test-IsAdministrator)) {
    throw "Machine-level certificate trust requires an elevated PowerShell session. Rerun as Administrator or omit -MachineTrust."
}

if (
    -not $DryRun -and
    [bool]$artifactContract.HasNonUserConfigurableStartupCapability -and
    -not $AllowRestrictedCapabilitySideload
) {
    throw @"
Refusing to sideload the Store-reviewed restricted-capability MSIX.

This artifact declares Microsoft.nonUserConfigurableStartupTasks_8wekyb3d8bbwe
and is intended for Partner Center certification/re-signing, not ordinary
operator sideload testing. A local Add-AppxPackage attempt can fail after
removing the currently installed package.

Use the local-sideload package for primary/second-PC install evidence:
  powershell -ExecutionPolicy Bypass -File $($MyInvocation.MyCommand.Path) -StartupContract local-sideload-manual -ReplaceExisting

If you are intentionally testing restricted-capability sideload behavior on a
prepared machine, rerun with -AllowRestrictedCapabilitySideload.
"@
}

if (-not $SkipCertInstall) {
    $storeScope = if ($MachineTrust) { "LocalMachine" } else { "CurrentUser" }
    Write-Step "Importing signing certificate into $storeScope stores"
    $certExtension = [System.IO.Path]::GetExtension($CertPath).ToLowerInvariant()
    $publicCertPath = if ($certExtension -eq ".pfx" -or $certExtension -eq ".p12") {
        [System.IO.Path]::ChangeExtension($CertPath, ".cer")
    }
    else {
        $CertPath
    }
    if ($DryRun) {
        if ($certExtension -eq ".pfx" -or $certExtension -eq ".p12") {
            Write-Host "[dry-run] Import-PfxCertificate -FilePath $CertPath -CertStoreLocation Cert:\$storeScope\TrustedPeople"
            Write-Host "[dry-run] Export-Certificate -> $publicCertPath"
        }
        else {
            Write-Host "[dry-run] Import-Certificate -FilePath $CertPath -CertStoreLocation Cert:\$storeScope\TrustedPeople"
        }
    }
    else {
        if ($certExtension -eq ".pfx" -or $certExtension -eq ".p12") {
            $pwd = ConvertTo-SecureString $CertPassword -AsPlainText -Force
            $pfx = Get-PfxData -FilePath $CertPath -Password $pwd

            Import-PfxCertificate `
                -FilePath $CertPath `
                -CertStoreLocation ("Cert:\{0}\TrustedPeople" -f $storeScope) `
                -Password $pwd | Out-Null

            $cert = Get-ChildItem ("Cert:\{0}\TrustedPeople" -f $storeScope) | Where-Object {
                $_.Thumbprint -eq $pfx.EndEntityCertificates[0].Thumbprint
            } | Select-Object -First 1

            if (-not $cert) {
                throw "Imported cert not found in ${storeScope}\TrustedPeople."
            }

            Export-Certificate -Cert $cert -FilePath $publicCertPath -Force | Out-Null
        }
        else {
            Import-Certificate `
                -FilePath $CertPath `
                -CertStoreLocation ("Cert:\{0}\TrustedPeople" -f $storeScope) | Out-Null
        }
    }

    if ($MachineTrust) {
        Invoke-CertUtil -ArgumentList @("-addstore", "Root", $publicCertPath)
    }
    else {
        Invoke-CertUtil -ArgumentList @("-user", "-addstore", "Root", $publicCertPath)
    }
}

Write-Step "Installing MSIX package"
if ($DryRun) {
    if ($ReplaceExisting) {
        Write-Host "[dry-run] Remove-AppxPackage <existing $PackageName package, if present>"
    }
    Write-Host "[dry-run] Add-AppxPackage $PackagePath"
    Write-Host "[dry-run] Get-AppxPackage -Name $PackageName"
    return
}

$existingPackage = Get-AppxPackage -Name $PackageName -ErrorAction SilentlyContinue | Select-Object -First 1
if ($existingPackage -and -not $ReplaceExisting) {
    $installedManifestPath = Join-Path $existingPackage.InstallLocation "AppxManifest.xml"
    if (Test-Path -LiteralPath $installedManifestPath) {
        [xml]$installedManifest = Get-Content -LiteralPath $installedManifestPath
        $installedContract = Get-MsixStartupContract -Manifest $installedManifest
        $sameVersion = $existingPackage.Version.ToString() -eq $msixIdentity.Version
        $sameContract = Test-MsixStartupContractEquivalent -Left $installedContract -Right $artifactContract

        if ($sameVersion) {
            throw @"
An MSIX package with identity '$PackageName' and version '$($existingPackage.Version)' is already installed.

If you rebuilt the same version with a new manifest or startup contract, rerun with:
  powershell -ExecutionPolicy Bypass -File $($MyInvocation.MyCommand.Path) -ReplaceExisting$(if ($MachineTrust) { " -MachineTrust" } else { "" })

Installed startup contract:
  ImmediateRegistration = '$($installedContract.StartupImmediateRegistration)'
  NonUserConfigurableStartupCapability = $($installedContract.HasNonUserConfigurableStartupCapability)

Artifact startup contract:
  ImmediateRegistration = '$($artifactContract.StartupImmediateRegistration)'
  NonUserConfigurableStartupCapability = $($artifactContract.HasNonUserConfigurableStartupCapability)

Contract match: $sameContract
"@
        }
    }
}
if ($existingPackage -and $ReplaceExisting -and -not $MachineTrust -and $artifactThumbprint) {
    $machineTrusted = @(
        Get-ChildItem "Cert:\LocalMachine\TrustedPeople" -ErrorAction SilentlyContinue
        Get-ChildItem "Cert:\LocalMachine\Root" -ErrorAction SilentlyContinue
    ) | Where-Object {
        $_.Thumbprint -eq $artifactThumbprint
    } | Select-Object -First 1

    if (-not $machineTrusted) {
        throw @"
Refusing to remove the existing package before reinstall.

The replacement certificate thumbprint '$artifactThumbprint' is not trusted in
LocalMachine\TrustedPeople or LocalMachine\Root, and this machine previously
required machine-level trust for AppX deployment.

Rerun from an elevated PowerShell with:
  powershell -ExecutionPolicy Bypass -File $($MyInvocation.MyCommand.Path) -MachineTrust -ReplaceExisting
"@
    }
}
if ($existingPackage -and $ReplaceExisting) {
    Write-Step "Removing existing MSIX package"
    Remove-AppxPackage -Package $existingPackage.PackageFullName
}

try {
    Add-AppxPackage $PackagePath
}
catch {
    $message = $_.Exception.Message
    if ($message -match "0x800B0109") {
        throw @"
MSIX install failed with 0x800B0109 (certificate trust).

On this machine, CurrentUser trust was not enough for AppX deployment.
You likely need machine-level trust for the signing certificate.

Try one of:
  1. Run this script from an elevated PowerShell with -MachineTrust.
  2. Run: winapp cert install "$CertPath"
  3. Import the signing certificate into LocalMachine\Root / LocalMachine\TrustedPeople.
"@
    }
    throw
}

Write-Step "Installed package"
Get-AppxPackage -Name $PackageName | Select-Object Name, PackageFullName, InstallLocation
