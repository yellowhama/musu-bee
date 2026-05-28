[CmdletBinding()]
param(
    [switch]$MachineTrust,
    [switch]$ReplaceExisting = $true,
    [ValidateSet("local-sideload-manual", "store-reviewed-immediate-registration")]
    [string]$StartupContract = "local-sideload-manual",
    [switch]$DryRun,
    [switch]$ElevatedRerun
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$scriptPath = $MyInvocation.MyCommand.Path
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
. (Join-Path $scriptDir "msix-common.ps1")

function Write-Step([string]$Message) {
    Write-Host ""
    Write-Host "==> $Message"
}

function Invoke-ChildPowerShell {
    param(
        [Parameter(Mandatory = $true)][string[]]$ArgumentList,
        [switch]$AllowFailure
    )

    & powershell @ArgumentList
    $exitCode = $LASTEXITCODE
    if (-not $AllowFailure -and $exitCode -ne 0) {
        throw "child PowerShell command failed with exit code $LASTEXITCODE"
    }
    return $exitCode
}

function Invoke-SelfElevationIfNeeded {
    if (-not $MachineTrust -or $DryRun -or (Test-IsAdministrator)) {
        return $false
    }

    Write-Step "Requesting elevated PowerShell for machine-trust install"
    $args = @(
        "-ExecutionPolicy", "Bypass",
        "-File", $scriptPath,
        "-ElevatedRerun"
    )
    if ($MachineTrust) {
        $args += "-MachineTrust"
    }
    if ($ReplaceExisting) {
        $args += "-ReplaceExisting"
    }
    $args += @("-StartupContract", $StartupContract)

    try {
        $proc = Start-Process -FilePath "powershell" -ArgumentList $args -Verb RunAs -Wait -PassThru
    }
    catch {
        throw "Elevation was required for machine-trust install, but the UAC prompt was not completed."
    }

    if ($proc.ExitCode -ne 0) {
        throw "Elevated install-and-verify run failed with exit code $($proc.ExitCode)."
    }
    return $true
}

function Get-LatestPackageIdentity() {
    $repoRoot = Get-WindowsRepoRoot $scriptPath
    $packagePath = Find-LatestMsixArtifact -Directory (Join-Path $repoRoot ".local-build\msix\output") -StartupContract $StartupContract
    if (-not $packagePath -or -not (Test-Path -LiteralPath $packagePath)) {
        return $null
    }
    return (Get-MsixPackageInfo -Path $packagePath).IdentityName
}

Write-Step "Preflight sideload readiness"
Invoke-ChildPowerShell -ArgumentList @(
    "-ExecutionPolicy", "Bypass",
    "-File", (Join-Path $scriptDir "check-msix-sideload-readiness.ps1"),
    "-StartupContract", $StartupContract
)

Write-Step "Install MSIX package"
$installArgs = @(
    "-ExecutionPolicy", "Bypass",
    "-File", (Join-Path $scriptDir "install-msix.ps1")
)
if ($MachineTrust) {
    $installArgs += "-MachineTrust"
}
if ($ReplaceExisting) {
    $installArgs += "-ReplaceExisting"
}
if ($StartupContract) {
    $installArgs += @("-StartupContract", $StartupContract)
}
if ($DryRun) {
    $installArgs += "-DryRun"
}
$packageIdentity = Get-LatestPackageIdentity
$packageInstalled = $false
if ($packageIdentity) {
    $packageInstalled = [bool](Get-AppxPackage -Name $packageIdentity -ErrorAction SilentlyContinue)
}

$installedInCurrentSession = $false
if (-not $DryRun -and $MachineTrust -and -not (Test-IsAdministrator) -and -not $packageInstalled) {
    Write-Step "Trying current-user sideload before requesting elevation"
    $currentUserArgs = @(
        "-ExecutionPolicy", "Bypass",
        "-File", (Join-Path $scriptDir "install-msix.ps1"),
        "-StartupContract", $StartupContract
    )
    $currentUserExit = Invoke-ChildPowerShell -ArgumentList $currentUserArgs -AllowFailure
    if ($currentUserExit -eq 0) {
        $installedInCurrentSession = $true
    }
    elseif (Invoke-SelfElevationIfNeeded) {
        Write-Step "Elevated install-and-verify run completed"
        return
    }
}

if (-not $installedInCurrentSession) {
    if (Invoke-SelfElevationIfNeeded) {
        Write-Step "Elevated install-and-verify run completed"
        return
    }
    Invoke-ChildPowerShell -ArgumentList $installArgs
}

if ($DryRun) {
    Write-Step "Dry run complete"
    return
}

Write-Step "Verify installed package contract"
Invoke-ChildPowerShell -ArgumentList @(
    "-ExecutionPolicy", "Bypass",
    "-File", (Join-Path $scriptDir "verify-installed-msix-package.ps1"),
    "-StartupContract", $StartupContract,
    "-CheckAlias"
)

if ($StartupContract -eq "local-sideload-manual") {
    Write-Step "Verify packaged runtime identity for local sideload/manual bridge contract"
    Invoke-ChildPowerShell -ArgumentList @(
        "-ExecutionPolicy", "Bypass",
        "-File", (Join-Path $scriptDir "check-packaged-startup-state.ps1")
    )
    Write-Host ""
    Write-Host "Local sideload contract confirmed."
    Write-Host "Automatic startup is not a success criterion for this package."
    Write-Host "Start the packaged bridge manually with:"
    Write-Host "  & `"$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe`" bridge"
}
else {
    Write-Step "Verify packaged startup-task readiness"
    Invoke-ChildPowerShell -ArgumentList @(
        "-ExecutionPolicy", "Bypass",
        "-File", (Join-Path $scriptDir "check-packaged-startup-state.ps1"),
        "-AssertReady"
    )
}

Write-Step "Install and packaged-state verification complete"
