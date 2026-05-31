[CmdletBinding()]
param(
    [ValidateSet("release", "debug")]
    [string]$Configuration = "release",
    [ValidateSet("x64", "x86", "arm64", "neutral")]
    [string]$Architecture = "x64",
    [string]$BundleDir,
    [switch]$SkipBuild
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
. (Join-Path $scriptDir "msix-common.ps1")

function Write-Step([string]$Message) {
    Write-Host "==> $Message"
}

function Invoke-CapturedPowerShell {
    param(
        [Parameter(Mandatory = $true)][string[]]$ArgumentList
    )

    $hasNativePreference = Test-Path -LiteralPath "variable:PSNativeCommandUseErrorActionPreference"
    $previousNativePreference = $null
    if ($hasNativePreference) {
        $previousNativePreference = $PSNativeCommandUseErrorActionPreference
        $PSNativeCommandUseErrorActionPreference = $false
    }

    try {
        $output = & powershell @ArgumentList 2>&1
        $exitCode = $LASTEXITCODE
    }
    finally {
        if ($hasNativePreference) {
            $PSNativeCommandUseErrorActionPreference = $previousNativePreference
        }
    }

    return [pscustomobject]@{
        Output   = ($output | Out-String)
        ExitCode = $exitCode
    }
}

$repoRoot = Get-WindowsRepoRoot $MyInvocation.MyCommand.Path
$docsDir = Join-Path $repoRoot "docs"
$outputDir = Join-Path $repoRoot ".local-build\msix\output"
$startupContract = "store-reviewed-immediate-registration"

if (-not $BundleDir) {
    $timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
    $BundleDir = Join-Path $repoRoot ".local-build\msix\submission-bundles\store-reviewed-$timestamp"
}

if (-not $SkipBuild) {
    Write-Step "Building Store-reviewed MSIX artifact"
    $buildArgs = @(
        "-ExecutionPolicy", "Bypass",
        "-File", (Join-Path $scriptDir "build-msix.ps1"),
        "-Configuration", $Configuration,
        "-Architecture", $Architecture,
        "-StartupContract", $startupContract
    )
    $buildResult = Invoke-CapturedPowerShell -ArgumentList $buildArgs
    if ($buildResult.ExitCode -ne 0) {
        throw "build-msix.ps1 failed for Store-reviewed contract.`n$($buildResult.Output)"
    }
}

$packagePath = Find-LatestMsixArtifact -Directory $outputDir -StartupContract $startupContract
if (-not $packagePath -or -not (Test-Path -LiteralPath $packagePath)) {
    throw "Store-reviewed MSIX artifact not found in $outputDir"
}
$certPath = Find-LatestArtifact -Directory $outputDir -Filter "*.cer"
if (-not $certPath -or -not (Test-Path -LiteralPath $certPath)) {
    throw "Signing certificate .cer not found in $outputDir"
}

Write-Step "Verifying Store-reviewed artifact"
$verifyArgs = @(
    "-ExecutionPolicy", "Bypass",
    "-File", (Join-Path $scriptDir "verify-msix-package.ps1"),
    "-Configuration", $Configuration,
    "-StartupContract", $startupContract,
    "-SkipSmoke"
)
$verifyResult = Invoke-CapturedPowerShell -ArgumentList $verifyArgs
if ($verifyResult.ExitCode -ne 0) {
    throw "verify-msix-package.ps1 failed for Store-reviewed contract.`n$($verifyResult.Output)"
}

Write-Step "Preparing submission bundle directory"
New-Item -ItemType Directory -Path $BundleDir -Force | Out-Null

$bundleMsix = Join-Path $BundleDir (Split-Path $packagePath -Leaf)
$bundleCer = Join-Path $BundleDir (Split-Path $certPath -Leaf)
Copy-Item -LiteralPath $packagePath -Destination $bundleMsix -Force
Copy-Item -LiteralPath $certPath -Destination $bundleCer -Force

$checklistPath = Join-Path $docsDir "STORE_MSIX_RESTRICTED_CAPABILITY_SUBMISSION_CHECKLIST_2026_05_27.md"
$guidePath = Join-Path $docsDir "STORE_MSIX_PACKAGING_GUIDE_2026_05_27.md"
$pivotPath = Join-Path $docsDir "PRODUCT_CHARTER\WINDOWS_DISTRIBUTION_PIVOT_2026-05-27.md"
Copy-Item -LiteralPath $checklistPath -Destination (Join-Path $BundleDir (Split-Path $checklistPath -Leaf)) -Force
Copy-Item -LiteralPath $guidePath -Destination (Join-Path $BundleDir (Split-Path $guidePath -Leaf)) -Force
Copy-Item -LiteralPath $pivotPath -Destination (Join-Path $BundleDir (Split-Path $pivotPath -Leaf)) -Force

$verifyLogPath = Join-Path $BundleDir "verify-store-reviewed.txt"
Set-Content -LiteralPath $verifyLogPath -Value $verifyResult.Output -Encoding UTF8

$submissionNotes = @"
Store-reviewed Windows package submission notes
==============================================

Artifact:
- $(Split-Path $bundleMsix -Leaf)

Restricted startup capability justification summary:
- This package uses `desktop:StartupTask` with `rescap5:ImmediateRegistration="true"`.
- It declares `Microsoft.nonUserConfigurableStartupTasks_8wekyb3d8bbwe` so the packaged bridge can be enabled at installation time.
- `musu-startup.exe` starts the local MUSU bridge runtime required for node presence, local health checks, fleet availability, and user-invoked workflows.
- MUSU does not install raw Task Scheduler tasks, does not self-copy binaries into `~/.musu/bin`, and does not self-update packaged binaries from GitHub.
- The local-sideload package is a separate product contract and intentionally requires manual `musu bridge`; this Store-reviewed artifact is the auto-start distribution model.

Partner Center operator TODO:
1. Create or open the app in Partner Center.
2. Upload $(Split-Path $bundleMsix -Leaf).
3. On Submission options, paste the restricted capability explanation from this file and the checklist.
4. Attach any additional certification notes needed for `runFullTrust` and startup behavior.
5. Submit for certification and track the restricted capability review outcome.
"@
Set-Content -LiteralPath (Join-Path $BundleDir "submission-notes.txt") -Value $submissionNotes -Encoding UTF8

$capabilityJustification = @'
# Partner Center Restricted Capability Justification

## runFullTrust

MUSU is a packaged desktop control-plane application. `runFullTrust` is
required because the app runs a full-trust local bridge process rather than a
sandboxed UWP background task. The packaged app does not self-update its
binaries, does not install raw Task Scheduler entries, and does not copy
binaries into user-managed install locations.

## Microsoft.nonUserConfigurableStartupTasks_8wekyb3d8bbwe

MUSU uses `desktop:StartupTask` with
`rescap5:ImmediateRegistration="true"` so the packaged bridge can be enabled
at install time. This is the Store-reviewed Windows auto-start product
contract. The local-sideload package is a separate manual-start contract and
does not request this capability. `musu-startup.exe` only launches the local
bridge runtime required for node presence, local health checks, fleet
availability, and user-invoked workflows. MUSU does not install a separate
background service outside the package.
'@
Set-Content -LiteralPath (Join-Path $BundleDir "partner-center-capability-justification.md") -Value $capabilityJustification -Encoding UTF8

$metadata = [pscustomobject]@{
    StartupContract = $startupContract
    BundleDir = $BundleDir
    PackagePath = $bundleMsix
    CertificatePath = $bundleCer
    VerifyLog = $verifyLogPath
    Checklist = Join-Path $BundleDir (Split-Path $checklistPath -Leaf)
    Guide = Join-Path $BundleDir (Split-Path $guidePath -Leaf)
    Pivot = Join-Path $BundleDir (Split-Path $pivotPath -Leaf)
    CapabilityJustification = Join-Path $BundleDir "partner-center-capability-justification.md"
    PreparedAtUtc = (Get-Date).ToUniversalTime().ToString("o")
}
$metadata | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $BundleDir "bundle.json") -Encoding UTF8

$checksumsPath = Join-Path $BundleDir "SHA256SUMS.txt"
Get-ChildItem -LiteralPath $BundleDir -Recurse -File |
    Where-Object { $_.FullName -ne $checksumsPath } |
    Sort-Object FullName |
    ForEach-Object {
        $relative = $_.FullName.Substring($BundleDir.Length + 1)
        $hash = Get-FileHash -Algorithm SHA256 -LiteralPath $_.FullName
        "{0}  {1}" -f $hash.Hash.ToLowerInvariant(), ($relative -replace "\\", "/")
    } | Set-Content -LiteralPath $checksumsPath -Encoding ASCII

Write-Host ""
Write-Host "Store-reviewed submission bundle prepared."
Write-Host "Bundle directory: $BundleDir"
Write-Host "Package:          $bundleMsix"
Write-Host "Certificate:      $bundleCer"
Write-Host "Verify log:       $verifyLogPath"
