[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
. (Join-Path $scriptDir "msix-common.ps1")

function Invoke-CapturedPowerShell {
    param(
        [Parameter(Mandatory = $true)][string[]]$ArgumentList
    )

    $output = & powershell @ArgumentList 2>&1
    return [pscustomobject]@{
        ExitCode = $LASTEXITCODE
        Output = ($output | Out-String)
    }
}

$repoRoot = Get-WindowsRepoRoot $MyInvocation.MyCommand.Path
$bundleRoot = Join-Path $repoRoot ".local-build\msix\submission-bundles"
$latestBundle = $null
if (Test-Path -LiteralPath $bundleRoot) {
    $latestBundle = Get-ChildItem -LiteralPath $bundleRoot -Directory |
        Sort-Object LastWriteTime -Descending |
        Select-Object -First 1
}

$localVerify = Invoke-CapturedPowerShell -ArgumentList @(
    "-ExecutionPolicy", "Bypass",
    "-File", (Join-Path $scriptDir "verify-msix-package.ps1"),
    "-StartupContract", "local-sideload-manual",
    "-SkipSmoke"
)

$storeVerify = Invoke-CapturedPowerShell -ArgumentList @(
    "-ExecutionPolicy", "Bypass",
    "-File", (Join-Path $scriptDir "verify-msix-package.ps1"),
    "-StartupContract", "store-reviewed-immediate-registration",
    "-SkipSmoke"
)

$installedLocal = Invoke-CapturedPowerShell -ArgumentList @(
    "-ExecutionPolicy", "Bypass",
    "-File", (Join-Path $scriptDir "install-and-verify-msix.ps1"),
    "-StartupContract", "local-sideload-manual"
)

$result = [pscustomobject]@{
    LocalArtifactPresent = [bool](Find-LatestMsixArtifact -Directory (Join-Path $repoRoot ".local-build\msix\output") -StartupContract "local-sideload-manual")
    StoreArtifactPresent = [bool](Find-LatestMsixArtifact -Directory (Join-Path $repoRoot ".local-build\msix\output") -StartupContract "store-reviewed-immediate-registration")
    LocalArtifactVerifyExit = $localVerify.ExitCode
    StoreArtifactVerifyExit = $storeVerify.ExitCode
    LocalManualInstallVerifyExit = $installedLocal.ExitCode
    LatestSubmissionBundle = if ($latestBundle) { $latestBundle.FullName } else { $null }
    LatestSubmissionBundlePresent = [bool]$latestBundle
    RemainingExternalGate = "Partner Center submission + Microsoft restricted capability review"
}

$result | Format-List

Write-Host ""
Write-Host "=== local-sideload-manual verify ==="
Write-Host $localVerify.Output
Write-Host "=== store-reviewed-immediate-registration verify ==="
Write-Host $storeVerify.Output
Write-Host "=== local-sideload-manual install-and-verify ==="
Write-Host $installedLocal.Output
