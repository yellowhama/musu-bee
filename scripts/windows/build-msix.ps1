[CmdletBinding()]
param(
    [ValidateSet("release", "debug")]
    [string]$Configuration = "release",
    [ValidateSet("x64", "x86", "arm64", "neutral")]
    [string]$Architecture = "x64",
    [ValidateSet("local-sideload-manual", "store-reviewed-immediate-registration")]
    [string]$StartupContract = "local-sideload-manual",
    [string]$IdentityName = "Yellowhama.MUSU",
    [string]$Publisher = "CN=Yellowhama",
    [string]$DisplayName = "MUSU",
    [string]$PublisherDisplayName = "Yellowhama",
    [string]$Description = "MUSU desktop shell for the local AI operations runtime",
    [string]$ApplicationExecutable = "musu-desktop.exe",
    [string]$RuntimeExecutable = "musu.exe",
    [string]$StartupExecutable = "musu-startup.exe",
    [string]$Version,
    [string]$StageDir,
    [string]$OutputDir,
    [string]$CertPath,
    [string]$CertPassword = "password",
    [string]$SourceIconPath,
    [switch]$GenerateCert,
    [switch]$InstallCert,
    [switch]$SkipBuild,
    [switch]$KeepStage,
    [switch]$DryRun
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Write-Step([string]$Message) {
    Write-Host "==> $Message"
}

function Assert-CommandAvailable([string]$CommandName, [string]$InstallHint) {
    if ($DryRun) {
        return
    }
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
        if ($WorkingDirectory) {
            Write-Host "[dry-run] pushd $WorkingDirectory"
        }
        Write-Host "[dry-run] $FilePath $rendered"
        if ($WorkingDirectory) {
            Write-Host "[dry-run] popd"
        }
        return
    }

    if ($WorkingDirectory) {
        Push-Location $WorkingDirectory
    }

    try {
        & $FilePath @ArgumentList
        if ($LASTEXITCODE -ne 0) {
            throw "command failed with exit code ${LASTEXITCODE}: $FilePath $rendered"
        }
    }
    finally {
        if ($WorkingDirectory) {
            Pop-Location
        }
    }
}

function Normalize-Version([string]$RawVersion) {
    $trimmed = $RawVersion.Trim()
    $core = $trimmed.Split("-", 2)[0].Split("+", 2)[0]
    $parts = $core.Split(".")
    foreach ($part in $parts) {
        if ($part -notmatch "^\d+$") {
            throw "Version '$trimmed' must reduce to numeric segments for MSIX."
        }
    }
    if ($parts.Count -eq 3) {
        return "$core.0"
    }
    if ($parts.Count -eq 4) {
        return $core
    }
    throw "Version '$trimmed' must have 3 or 4 numeric segments for MSIX."
}

function Resolve-OptionalPath([string]$PathValue) {
    if ([string]::IsNullOrWhiteSpace($PathValue)) {
        return $null
    }
    if ($DryRun -and -not (Test-Path -LiteralPath $PathValue)) {
        return $PathValue
    }
    return (Resolve-Path -LiteralPath $PathValue).Path
}

function Get-ManifestPath([string]$PackageDir) {
    $candidates = @(
        (Join-Path $PackageDir "Package.appxmanifest"),
        (Join-Path $PackageDir "appxmanifest.xml")
    )
    foreach ($candidate in $candidates) {
        if (Test-Path -LiteralPath $candidate) {
            return $candidate
        }
    }
    return (Join-Path $PackageDir "Package.appxmanifest")
}

function New-ManifestContent {
    param(
        [string]$PackageIdentity,
        [string]$PackagePublisher,
        [string]$PackageVersion,
        [string]$PackageArchitecture,
        [string]$AppDisplayName,
        [string]$AppPublisherDisplayName,
        [string]$AppDescription,
        [string]$ApplicationExecutable,
        [string]$RuntimeExecutable,
        [string]$StartupExecutable,
        [string]$StartupContract
    )

    $uap4Namespace = ""
    $rescap5Namespace = ""
    $ignorableNamespaces = "uap uap3 desktop rescap"
    $startupTaskExtraAttribute = ""
    $extraCapability = ""

    if ($StartupContract -eq "store-reviewed-immediate-registration") {
        $uap4Namespace = '  xmlns:uap4="http://schemas.microsoft.com/appx/manifest/uap/windows10/4"'
        $rescap5Namespace = '  xmlns:rescap5="http://schemas.microsoft.com/appx/manifest/foundation/windows10/restrictedcapabilities/5"'
        $ignorableNamespaces = "uap uap3 uap4 desktop rescap rescap5"
        $startupTaskExtraAttribute = 'rescap5:ImmediateRegistration="true"'
        $extraCapability = '    <uap4:CustomCapability Name="Microsoft.nonUserConfigurableStartupTasks_8wekyb3d8bbwe" />'
    }

    @"
<?xml version="1.0" encoding="utf-8"?>
<Package
  xmlns="http://schemas.microsoft.com/appx/manifest/foundation/windows10"
  xmlns:uap="http://schemas.microsoft.com/appx/manifest/uap/windows10"
  xmlns:uap3="http://schemas.microsoft.com/appx/manifest/uap/windows10/3"
  xmlns:desktop="http://schemas.microsoft.com/appx/manifest/desktop/windows10"
  xmlns:rescap="http://schemas.microsoft.com/appx/manifest/foundation/windows10/restrictedcapabilities"
$uap4Namespace
$rescap5Namespace
  IgnorableNamespaces="$ignorableNamespaces">
  <Identity
    Name="$PackageIdentity"
    Publisher="$PackagePublisher"
    Version="$PackageVersion"
    ProcessorArchitecture="$PackageArchitecture" />
  <Properties>
    <DisplayName>$AppDisplayName</DisplayName>
    <PublisherDisplayName>$AppPublisherDisplayName</PublisherDisplayName>
    <Description>$AppDescription</Description>
    <Logo>Assets\StoreLogo.png</Logo>
  </Properties>
  <Dependencies>
    <TargetDeviceFamily
      Name="Windows.Desktop"
      MinVersion="10.0.17763.0"
      MaxVersionTested="10.0.26100.0" />
  </Dependencies>
  <Resources>
    <Resource Language="en-us" />
  </Resources>
  <Applications>
    <Application
      Id="MUSU"
      Executable="$ApplicationExecutable"
      EntryPoint="Windows.FullTrustApplication">
      <uap:VisualElements
        DisplayName="$AppDisplayName"
        Description="$AppDescription"
        BackgroundColor="transparent"
        Square150x150Logo="Assets\Square150x150Logo.png"
        Square44x44Logo="Assets\Square44x44Logo.png"
        AppListEntry="default">
        <uap:DefaultTile Wide310x150Logo="Assets\Wide310x150Logo.png" />
        <uap:SplashScreen Image="Assets\SplashScreen.png" />
      </uap:VisualElements>
      <Extensions>
        <uap3:Extension
          Category="windows.appExecutionAlias"
          Executable="$RuntimeExecutable"
          EntryPoint="Windows.FullTrustApplication">
          <uap3:AppExecutionAlias>
            <desktop:ExecutionAlias Alias="$RuntimeExecutable" />
          </uap3:AppExecutionAlias>
        </uap3:Extension>
        <desktop:Extension
          Category="windows.startupTask"
          Executable="$StartupExecutable"
          EntryPoint="Windows.FullTrustApplication">
          <desktop:StartupTask
            TaskId="MusuBridgeStartup"
            Enabled="true"
            $startupTaskExtraAttribute
            DisplayName="$AppDisplayName Bridge" />
        </desktop:Extension>
      </Extensions>
    </Application>
  </Applications>
  <Capabilities>
    <rescap:Capability Name="runFullTrust" />
$extraCapability
  </Capabilities>
</Package>
"@
}

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = (Resolve-Path (Join-Path $scriptDir "..\..")).Path
$musuRsDir = Join-Path $repoRoot "musu-rs"
$musuBeeDir = Join-Path $repoRoot "musu-bee"
$tauriDir = Join-Path $musuBeeDir "src-tauri"
. (Join-Path $scriptDir "msix-common.ps1")

if (-not $SkipBuild) {
    Assert-CommandAvailable -CommandName "cargo" -InstallHint "Install Rust and ensure cargo is on PATH."
    Assert-CommandAvailable -CommandName "npm" -InstallHint "Install Node.js/npm and ensure npm is on PATH."
}
Assert-CommandAvailable -CommandName "winapp" -InstallHint "Install Microsoft WinApp CLI with: winget install -e --id Microsoft.WinAppCLI --source winget"

if (-not $Version) {
    $Version = Normalize-Version (Get-Content -LiteralPath (Join-Path $repoRoot "VERSION") -Raw)
} else {
    $Version = Normalize-Version $Version
}

if (-not $StageDir) {
    $StageDir = Join-Path $repoRoot ".local-build\msix\stage"
}
if (-not $OutputDir) {
    $OutputDir = Join-Path $repoRoot ".local-build\msix\output"
}
if (-not $SourceIconPath) {
    $defaultIcon = Join-Path $repoRoot "musu-bee\src-tauri\icons\icon.png"
    if (Test-Path -LiteralPath $defaultIcon) {
        $SourceIconPath = $defaultIcon
    }
}

$contractSuffix = Get-StartupContractArtifactSuffix $StartupContract
$packageDir = Join-Path $StageDir ("musu-{0}" -f $contractSuffix)
$musuExe = Join-Path $musuRsDir "target\$Configuration\$RuntimeExecutable"
$startupExe = Join-Path $musuRsDir "target\$Configuration\$StartupExecutable"
$desktopExe = Join-Path $tauriDir "target\$Configuration\$ApplicationExecutable"
$generatedCertPath = Join-Path $OutputDir ("{0}_cert.pfx" -f $IdentityName)

if (-not $SkipBuild) {
    Write-Step "Building packaged runtime executables"
    $buildArgs = @("build", "--bin", "musu", "--bin", "musu-startup")
    if ($Configuration -eq "release") {
        $buildArgs += "--release"
    }
    Invoke-Checked -FilePath "cargo" -ArgumentList $buildArgs -WorkingDirectory $musuRsDir

    Write-Step "Building Tauri desktop executable"
    Invoke-Checked -FilePath "npm" -ArgumentList @("run", "build:tauri-shell") -WorkingDirectory $musuBeeDir
    $desktopBuildArgs = @("build")
    if ($Configuration -eq "release") {
        $desktopBuildArgs += "--release"
    }
    Invoke-Checked -FilePath "cargo" -ArgumentList $desktopBuildArgs -WorkingDirectory $tauriDir
}

if (-not $DryRun -and -not (Test-Path -LiteralPath $musuExe)) {
    throw "$RuntimeExecutable not found at $musuExe"
}
if (-not $DryRun -and -not (Test-Path -LiteralPath $startupExe)) {
    throw "$StartupExecutable not found at $startupExe"
}
if (-not $DryRun -and -not (Test-Path -LiteralPath $desktopExe)) {
    throw "$ApplicationExecutable not found at $desktopExe"
}

$resolvedIcon = Resolve-OptionalPath $SourceIconPath
$resolvedCert = Resolve-OptionalPath $CertPath
if (-not $resolvedCert -and (Test-Path -LiteralPath $generatedCertPath)) {
    $resolvedCert = (Resolve-Path -LiteralPath $generatedCertPath).Path
}

Write-Step "Preparing MSIX stage directory"
if ($DryRun) {
    Write-Host "[dry-run] reset $packageDir"
} else {
    if (Test-Path -LiteralPath $packageDir) {
        Remove-Item -LiteralPath $packageDir -Recurse -Force
    }
    New-Item -ItemType Directory -Path $packageDir -Force | Out-Null
    New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null
    Copy-Item -LiteralPath $musuExe -Destination (Join-Path $packageDir $RuntimeExecutable)
    Copy-Item -LiteralPath $startupExe -Destination (Join-Path $packageDir $StartupExecutable)
    Copy-Item -LiteralPath $desktopExe -Destination (Join-Path $packageDir $ApplicationExecutable)
}

Write-Step "Generating MSIX assets with WinApp CLI"
Invoke-Checked -FilePath "winapp" -ArgumentList @(
    "manifest",
    "generate",
    ".",
    "--executable",
    (".\{0}" -f $ApplicationExecutable),
    "--package-name",
    $IdentityName,
    "--publisher-name",
    $Publisher,
    "--if-exists",
    "overwrite"
) -WorkingDirectory $packageDir

$manifestPath = Get-ManifestPath -PackageDir $packageDir

Write-Step "Writing package manifest"
$manifestContent = New-ManifestContent `
    -PackageIdentity $IdentityName `
    -PackagePublisher $Publisher `
    -PackageVersion $Version `
    -PackageArchitecture $Architecture `
    -AppDisplayName $DisplayName `
    -AppPublisherDisplayName $PublisherDisplayName `
    -AppDescription $Description `
    -ApplicationExecutable $ApplicationExecutable `
    -RuntimeExecutable $RuntimeExecutable `
    -StartupExecutable $StartupExecutable `
    -StartupContract $StartupContract

if ($DryRun) {
    Write-Host "[dry-run] write manifest to $manifestPath"
} else {
    Set-Content -LiteralPath $manifestPath -Value $manifestContent -Encoding UTF8
}

if ($resolvedIcon) {
    Write-Step "Updating package assets from source icon"
    Invoke-Checked -FilePath "winapp" -ArgumentList @(
        "manifest",
        "update-assets",
        $resolvedIcon,
        "--manifest",
        $manifestPath
    ) -WorkingDirectory $packageDir
}

$outputMsix = Join-Path $OutputDir ("musu_{0}_{1}_{2}.msix" -f $Version, $Architecture, $contractSuffix)
$legacyOutputMsix = Join-Path $OutputDir ("musu_{0}_{1}.msix" -f $Version, $Architecture)
$packArgs = @(
    "pack",
    $packageDir,
    "--manifest",
    $manifestPath,
    "--executable",
    $ApplicationExecutable,
    "--output",
    $outputMsix
)

if ($resolvedCert) {
    Write-Step "Reusing existing signing certificate"
    $packArgs += @("--cert", $resolvedCert, "--cert-password", $CertPassword)
} elseif ($GenerateCert) {
    Write-Step "Generating new signing certificate"
    $packArgs += @("--generate-cert")
    if ($InstallCert) {
        $packArgs += @("--install-cert")
    }
}

Write-Step "Packing MSIX"
Invoke-Checked -FilePath "winapp" -ArgumentList $packArgs -WorkingDirectory $repoRoot

if (-not $KeepStage -and -not $DryRun) {
    Write-Step "Cleaning stage directory"
    Remove-Item -LiteralPath $packageDir -Recurse -Force
}

if (-not $DryRun -and $legacyOutputMsix -ne $outputMsix -and (Test-Path -LiteralPath $legacyOutputMsix)) {
    Write-Step "Removing legacy unsuffixed MSIX artifact"
    Remove-Item -LiteralPath $legacyOutputMsix -Force
}

Write-Host ""
Write-Host "MSIX packaging flow prepared successfully."
Write-Host "Stage directory: $packageDir"
Write-Host "Manifest:        $manifestPath"
Write-Host "Output package:  $outputMsix"
Write-Host "Startup contract: $StartupContract"
