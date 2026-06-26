[CmdletBinding()]
param(
    [string]$Repo = "yellowhama/musu-bee",
    [string]$ReleaseTag = "desktop-latest",
    [string]$OutputDir,
    [string]$PublicReleasePath,
    [string]$VersionPath,
    [string]$CertPath,
    [string]$InstallScriptPath,
    [string]$UninstallScriptPath,
    [string]$SetupExePath,
    [switch]$SkipSetupExe,
    [switch]$ConfirmUpload,
    [switch]$ValidateSiteAfterUpload,
    [switch]$DryRun
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = (Resolve-Path (Join-Path $scriptDir "..\..")).Path

if (-not $OutputDir) {
    $OutputDir = Join-Path $repoRoot ".local-build\msix\output"
}
if (-not $PublicReleasePath) {
    $PublicReleasePath = Join-Path $repoRoot "musu-bee\src\lib\publicRelease.ts"
}
if (-not $VersionPath) {
    $VersionPath = Join-Path $repoRoot "VERSION"
}
if (-not $CertPath) {
    $CertPath = Join-Path $repoRoot ".local-build\signing\blossompark.musu.cer"
}
if (-not $InstallScriptPath) {
    $InstallScriptPath = Join-Path $repoRoot "scripts\windows\Install-MUSU.ps1"
}
if (-not $UninstallScriptPath) {
    $UninstallScriptPath = Join-Path $repoRoot "scripts\windows\Uninstall-MUSU.ps1"
}

function Write-Step {
    param([Parameter(Mandatory = $true)][string]$Message)
    Write-Host "==> $Message"
}

function Resolve-RequiredFile {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][string]$Label
    )

    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        throw "$Label not found: $Path"
    }
    return (Resolve-Path -LiteralPath $Path).Path
}

function Assert-CommandAvailable {
    param(
        [Parameter(Mandatory = $true)][string]$CommandName,
        [Parameter(Mandatory = $true)][string]$InstallHint
    )

    if (-not (Get-Command $CommandName -ErrorAction SilentlyContinue)) {
        throw "$CommandName is not installed. $InstallHint"
    }
}

function Invoke-Checked {
    param(
        [Parameter(Mandatory = $true)][string]$FilePath,
        [Parameter()][string[]]$ArgumentList = @(),
        [Parameter()][string]$WorkingDirectory
    )

    $rendered = ($ArgumentList | ForEach-Object {
        if ($_ -match "\s") { '"' + $_ + '"' } else { $_ }
    }) -join " "

    if ($DryRun) {
        if ($WorkingDirectory) { Write-Host "[dry-run] pushd $WorkingDirectory" }
        Write-Host "[dry-run] $FilePath $rendered"
        if ($WorkingDirectory) { Write-Host "[dry-run] popd" }
        return
    }

    if ($WorkingDirectory) { Push-Location $WorkingDirectory }
    try {
        & $FilePath @ArgumentList
        if ($LASTEXITCODE -ne 0) {
            throw "command failed with exit code ${LASTEXITCODE}: $FilePath $rendered"
        }
    } finally {
        if ($WorkingDirectory) { Pop-Location }
    }
}

function Invoke-ReadOnlyCheck {
    param(
        [Parameter(Mandatory = $true)][string]$FilePath,
        [Parameter()][string[]]$ArgumentList = @(),
        [Parameter()][string]$WorkingDirectory
    )

    $rendered = ($ArgumentList | ForEach-Object {
        if ($_ -match "\s") { '"' + $_ + '"' } else { $_ }
    }) -join " "

    if ($WorkingDirectory) { Push-Location $WorkingDirectory }
    try {
        & $FilePath @ArgumentList
        if ($LASTEXITCODE -ne 0) {
            throw "read-only check failed with exit code ${LASTEXITCODE}: $FilePath $rendered"
        }
    } finally {
        if ($WorkingDirectory) { Pop-Location }
    }
}

function Convert-PublicVersionToPackageVersion {
    param([Parameter(Mandatory = $true)][string]$PublicVersion)

    if ($PublicVersion -match '^(\d+)\.(\d+)\.(\d+)-rc\.(\d+)$') {
        return "$($Matches[1]).$($Matches[2]).$($Matches[3]).$($Matches[4])"
    }
    if ($PublicVersion -match '^(\d+)\.(\d+)\.(\d+)$') {
        return "$($Matches[1]).$($Matches[2]).$($Matches[3]).0"
    }
    throw "Unsupported public VERSION format: $PublicVersion"
}

function Get-RequiredMatch {
    param(
        [Parameter(Mandatory = $true)][string]$Text,
        [Parameter(Mandatory = $true)][string]$Pattern,
        [Parameter(Mandatory = $true)][string]$Label
    )

    $match = [regex]::Match($Text, $Pattern)
    if (-not $match.Success) {
        throw "Could not parse $Label."
    }
    return $match.Groups[1].Value
}

function Get-AppInstallerVersions {
    param([Parameter(Mandatory = $true)][string]$Path)

    $text = Get-Content -LiteralPath $Path -Raw
    $appVersion = Get-RequiredMatch -Text $text -Pattern '<AppInstaller[\s\S]*?\sVersion="([^"]+)"' -Label "AppInstaller Version from $Path"
    $mainVersion = Get-RequiredMatch -Text $text -Pattern '<MainPackage[\s\S]*?\sVersion="([^"]+)"' -Label "MainPackage Version from $Path"
    return [pscustomobject]@{
        AppInstallerVersion = $appVersion
        MainPackageVersion = $mainVersion
    }
}

$OutputDir = (Resolve-Path -LiteralPath $OutputDir).Path
$PublicReleasePath = Resolve-RequiredFile -Path $PublicReleasePath -Label "publicRelease.ts"
$VersionPath = Resolve-RequiredFile -Path $VersionPath -Label "VERSION"
$CertPath = Resolve-RequiredFile -Path $CertPath -Label "signing certificate"
$InstallScriptPath = Resolve-RequiredFile -Path $InstallScriptPath -Label "Install-MUSU.ps1"
$UninstallScriptPath = Resolve-RequiredFile -Path $UninstallScriptPath -Label "Uninstall-MUSU.ps1"

$publicReleaseText = Get-Content -LiteralPath $PublicReleasePath -Raw
$publicVersionFromFile = (Get-Content -LiteralPath $VersionPath -Raw).Trim()
$publicVersionFromSiteSource = Get-RequiredMatch `
    -Text $publicReleaseText `
    -Pattern 'PUBLIC_RELEASE_VERSION\s*=\s*"([^"]+)"' `
    -Label "PUBLIC_RELEASE_VERSION from publicRelease.ts"

if ($publicVersionFromSiteSource -ne $publicVersionFromFile) {
    throw "publicRelease.ts version '$publicVersionFromSiteSource' does not match VERSION '$publicVersionFromFile'."
}

$expectedPackageVersion = Convert-PublicVersionToPackageVersion -PublicVersion $publicVersionFromFile
$numericVersion = ($publicVersionFromFile -split "-", 2)[0].Trim()
$setupAssetName = Get-RequiredMatch `
    -Text $publicReleaseText `
    -Pattern 'DESKTOP_SETUP_EXE_URL\s*=\s*`\$\{DESKTOP_RELEASE_BASE\}/([^`]+)`' `
    -Label "DESKTOP_SETUP_EXE_URL asset name from publicRelease.ts"

if ($setupAssetName -notmatch '^MUSU_(\d+\.\d+\.\d+)_x64-setup\.exe$') {
    throw "Unexpected setup asset name in publicRelease.ts: $setupAssetName"
}
if ($Matches[1] -ne $numericVersion) {
    throw "Setup asset '$setupAssetName' does not match VERSION base '$numericVersion'."
}
if (-not $SetupExePath) {
    $SetupExePath = Join-Path $repoRoot "musu-bee\src-tauri\target\release\bundle\nsis\$setupAssetName"
}

$appInstallerPath = Resolve-RequiredFile -Path (Join-Path $OutputDir "musu.appinstaller") -Label "musu.appinstaller"
$hostedMsixPath = Resolve-RequiredFile -Path (Join-Path $OutputDir "musu-desktop-x64.msix") -Label "musu-desktop-x64.msix"
$versionedMsixPath = Resolve-RequiredFile `
    -Path (Join-Path $OutputDir ("musu_{0}_x64_local-sideload-manual.msix" -f $expectedPackageVersion)) `
    -Label "versioned local-sideload MSIX"

if ((Get-Item -LiteralPath $hostedMsixPath).Length -ne (Get-Item -LiteralPath $versionedMsixPath).Length) {
    throw "Hosted MSIX copy length does not match versioned MSIX: $hostedMsixPath vs $versionedMsixPath"
}

$versions = Get-AppInstallerVersions -Path $appInstallerPath
if ($versions.AppInstallerVersion -ne $expectedPackageVersion -or $versions.MainPackageVersion -ne $expectedPackageVersion) {
    throw "musu.appinstaller targets AppInstaller=$($versions.AppInstallerVersion), MainPackage=$($versions.MainPackageVersion); expected $expectedPackageVersion."
}

$installScriptText = Get-Content -LiteralPath $InstallScriptPath -Raw
$installerExpectedVersion = Get-RequiredMatch `
    -Text $installScriptText `
    -Pattern '\$ExpectedReleaseVersion\s*=\s*"([^"]+)"' `
    -Label "ExpectedReleaseVersion from Install-MUSU.ps1"
if ($installerExpectedVersion -ne $publicVersionFromFile) {
    throw "Install-MUSU.ps1 expects '$installerExpectedVersion' but VERSION is '$publicVersionFromFile'."
}

$installerExpectedThumbprint = Get-RequiredMatch `
    -Text $installScriptText `
    -Pattern '\$ExpectedCertThumbprint\s*=\s*"([A-Fa-f0-9]+)"' `
    -Label "ExpectedCertThumbprint from Install-MUSU.ps1"
$cert = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2 $CertPath
$actualThumbprint = $cert.Thumbprint.ToUpperInvariant()
if ($actualThumbprint -ne $installerExpectedThumbprint.ToUpperInvariant()) {
    throw "Install-MUSU.ps1 pins cert $installerExpectedThumbprint but $CertPath is $actualThumbprint."
}

$assets = New-Object System.Collections.Generic.List[string]
$assets.Add($hostedMsixPath)
$assets.Add($appInstallerPath)
$assets.Add($CertPath)
$assets.Add($InstallScriptPath)
$assets.Add($UninstallScriptPath)

if (-not $SkipSetupExe) {
    $SetupExePath = Resolve-RequiredFile -Path $SetupExePath -Label "NSIS setup exe"
    if ((Split-Path -Leaf $SetupExePath) -ne $setupAssetName) {
        throw "Setup exe basename must be '$setupAssetName', got '$(Split-Path -Leaf $SetupExePath)'."
    }
    $assets.Add($SetupExePath)
}

Write-Step "Auditing local appinstaller contract"
$auditScript = Join-Path $scriptDir "audit-appinstaller-contract.ps1"
Invoke-ReadOnlyCheck -FilePath "powershell" -ArgumentList @(
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    $auditScript,
    "-OutputDir",
    $OutputDir
) -WorkingDirectory $repoRoot

Write-Step "desktop-latest preflight OK"
Write-Host "Repo:              $Repo"
Write-Host "Release tag:       $ReleaseTag"
Write-Host "Public version:    $publicVersionFromFile"
Write-Host "Package version:   $expectedPackageVersion"
Write-Host "Cert thumbprint:   $actualThumbprint"
Write-Host "Assets:"
foreach ($asset in $assets) {
    $item = Get-Item -LiteralPath $asset
    Write-Host ("  - {0} ({1} bytes)" -f $item.FullName, $item.Length)
}

$uploadArgs = @("release", "upload", $ReleaseTag) + $assets.ToArray() + @("--clobber", "--repo", $Repo)
if (-not $ConfirmUpload) {
    Write-Host ""
    Write-Host "Upload not run. Re-run with -ConfirmUpload to publish:"
    Write-Host ("  gh {0}" -f (($uploadArgs | ForEach-Object { if ($_ -match "\s") { '"' + $_ + '"' } else { $_ } }) -join " "))
    exit 0
}

Assert-CommandAvailable -CommandName "gh" -InstallHint "Install GitHub CLI and authenticate with release write access."
Write-Step "Uploading desktop-latest assets with --clobber"
Invoke-Checked -FilePath "gh" -ArgumentList $uploadArgs -WorkingDirectory $repoRoot

Write-Step "Running desktop release canary"
$canaryScript = Join-Path $scriptDir "canary-desktop-release.ps1"
Invoke-Checked -FilePath "powershell" -ArgumentList @(
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    $canaryScript,
    "-OutputDir",
    $OutputDir
) -WorkingDirectory $repoRoot

if ($ValidateSiteAfterUpload) {
    Write-Step "Running live install-channel validation"
    $installChannelVerifier = Join-Path $scriptDir "verify-musu-pro-install-channel.ps1"
    Invoke-Checked -FilePath "powershell" -ArgumentList @(
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        $installChannelVerifier,
        "-Json"
    ) -WorkingDirectory $repoRoot
} else {
    Write-Host ""
    Write-Host "Skipped live install-channel validation. After Vercel deploy, run:"
    Write-Host "  powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\verify-musu-pro-install-channel.ps1 -Json"
}

Write-Host ""
Write-Host "desktop-latest publish completed."
