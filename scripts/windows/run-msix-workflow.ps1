[CmdletBinding()]
param(
    [ValidateSet("release", "debug")]
    [string]$Configuration = "debug",
    [ValidateSet("x64", "x86", "arm64", "neutral")]
    [string]$Architecture = "x64",
    [ValidateSet("local-sideload-manual", "store-reviewed-immediate-registration")]
    [string]$StartupContract = "local-sideload-manual",
    [switch]$SkipBuild,
    [switch]$SkipSmoke,
    [switch]$AttemptInstall,
    [switch]$MachineTrust,
    [switch]$ReplaceExisting,
    [switch]$VerifyInstalled
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Write-Step([string]$Message) {
    Write-Host ""
    Write-Host "==> $Message"
}

function Invoke-ChildPowerShell {
    param(
        [Parameter(Mandatory = $true)][string[]]$ArgumentList
    )

    & powershell @ArgumentList
    if ($LASTEXITCODE -ne 0) {
        throw "child PowerShell command failed with exit code $LASTEXITCODE"
    }
}

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Step "Build / refresh MSIX artifact"
$buildArgs = @(
    "-ExecutionPolicy", "Bypass",
    "-File", (Join-Path $scriptDir "build-msix.ps1"),
    "-Configuration", $Configuration,
    "-Architecture", $Architecture,
    "-StartupContract", $StartupContract,
    "-GenerateCert",
    "-KeepStage"
)
if ($SkipBuild) {
    $buildArgs += "-SkipBuild"
}
Invoke-ChildPowerShell -ArgumentList $buildArgs

Write-Step "Verify MSIX artifact and packaged startup contract"
$verifyArgs = @(
    "-ExecutionPolicy", "Bypass",
    "-File", (Join-Path $scriptDir "verify-msix-package.ps1"),
    "-StartupContract", $StartupContract
)
if ($SkipSmoke) {
    $verifyArgs += "-SkipSmoke"
}
Invoke-ChildPowerShell -ArgumentList $verifyArgs

Write-Step "Check sideload readiness on this machine"
Invoke-ChildPowerShell -ArgumentList @(
    "-ExecutionPolicy", "Bypass",
    "-File", (Join-Path $scriptDir "check-msix-sideload-readiness.ps1"),
    "-StartupContract", $StartupContract
)

Write-Step "Check for legacy direct-download startup conflicts"
Invoke-ChildPowerShell -ArgumentList @(
    "-ExecutionPolicy", "Bypass",
    "-File", (Join-Path $scriptDir "check-msix-legacy-conflicts.ps1")
)

if ($AttemptInstall -and $VerifyInstalled) {
    Write-Step "Install and verify packaged MSIX state"
    $oneShotArgs = @(
        "-ExecutionPolicy", "Bypass",
        "-File", (Join-Path $scriptDir "install-and-verify-msix.ps1")
    )
    if ($MachineTrust) {
        $oneShotArgs += "-MachineTrust"
    }
    if ($ReplaceExisting) {
        $oneShotArgs += "-ReplaceExisting"
    }
    $oneShotArgs += @("-StartupContract", $StartupContract)
    Invoke-ChildPowerShell -ArgumentList $oneShotArgs
}
elseif ($AttemptInstall) {
    Write-Step "Attempt MSIX install"
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
    $installArgs += @("-StartupContract", $StartupContract)
    Invoke-ChildPowerShell -ArgumentList $installArgs
}
elseif ($VerifyInstalled) {
    Write-Step "Verify installed package state"
    $installedArgs = @(
        "-ExecutionPolicy", "Bypass",
        "-File", (Join-Path $scriptDir "verify-installed-msix-package.ps1"),
        "-StartupContract", $StartupContract
    )
    Invoke-ChildPowerShell -ArgumentList $installedArgs

    if ($StartupContract -eq "store-reviewed-immediate-registration") {
        Write-Step "Verify packaged startup-task state"
        Invoke-ChildPowerShell -ArgumentList @(
            "-ExecutionPolicy", "Bypass",
            "-File", (Join-Path $scriptDir "check-packaged-startup-state.ps1"),
            "-AssertReady"
        )
    }
    else {
        Write-Step "Verify packaged runtime identity for local sideload/manual bridge contract"
        Invoke-ChildPowerShell -ArgumentList @(
            "-ExecutionPolicy", "Bypass",
            "-File", (Join-Path $scriptDir "check-packaged-startup-state.ps1")
        )
    }
}

Write-Step "Workflow complete"
