[CmdletBinding()]
param(
    [string]$PackageDir,
    [string]$ManifestPath,
    [switch]$NoInstall,
    [switch]$DryRun
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Assert-CommandAvailable([string]$CommandName, [string]$InstallHint) {
    if ($DryRun) {
        return
    }
    if (-not (Get-Command $CommandName -ErrorAction SilentlyContinue)) {
        throw "$CommandName is not installed. $InstallHint"
    }
}

function Assert-DeveloperModeEnabled() {
    if ($DryRun) {
        return
    }

    $key = "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\AppModelUnlock"
    $prop = Get-ItemProperty -Path $key -Name AllowDevelopmentWithoutDevLicense -ErrorAction SilentlyContinue
    if (-not $prop -or $prop.AllowDevelopmentWithoutDevLicense -ne 1) {
        throw "Developer Mode is not enabled. Enable Settings > Privacy & security > For developers > Developer Mode, then rerun this script."
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

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = (Resolve-Path (Join-Path $scriptDir "..\..")).Path

Assert-CommandAvailable -CommandName "winapp" -InstallHint "Install Microsoft WinApp CLI with: winget install -e --id Microsoft.WinAppCLI --source winget"
Assert-DeveloperModeEnabled

if (-not $PackageDir) {
    $PackageDir = Join-Path $repoRoot ".local-build\msix\stage\musu"
}
if (-not $ManifestPath) {
    $ManifestPath = Join-Path $PackageDir "Package.appxmanifest"
    if ((-not $DryRun) -and (-not (Test-Path -LiteralPath $ManifestPath))) {
        $ManifestPath = Join-Path $PackageDir "appxmanifest.xml"
    }
}

$packageDirResolved = $PackageDir
if (Test-Path -LiteralPath $PackageDir) {
    $packageDirResolved = (Resolve-Path -LiteralPath $PackageDir).Path
}
$manifestResolved = $ManifestPath
if (Test-Path -LiteralPath $ManifestPath) {
    $manifestResolved = (Resolve-Path -LiteralPath $ManifestPath).Path
}
$entrypoint = Join-Path $packageDirResolved "musu.exe"

if (-not $DryRun) {
    if (-not (Test-Path -LiteralPath $entrypoint)) {
        throw "musu.exe not found at $entrypoint. Run build-msix.ps1 first or pass -PackageDir."
    }
    if (-not (Test-Path -LiteralPath $manifestResolved)) {
        throw "Manifest not found at $manifestResolved. Run build-msix.ps1 first or pass -ManifestPath."
    }
}

$args = @(
    "create-debug-identity",
    $entrypoint,
    "--manifest",
    $manifestResolved
)

if ($NoInstall) {
    $args += "--no-install"
}

Invoke-Checked -FilePath "winapp" -ArgumentList $args -WorkingDirectory $repoRoot

Write-Host ""
Write-Host "Debug package identity flow completed."
Write-Host "Entrypoint: $entrypoint"
Write-Host "Manifest:   $manifestResolved"
