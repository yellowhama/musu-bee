[CmdletBinding()]
param(
    [switch]$Json,
    [switch]$FailOnBlocking
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = (Resolve-Path (Join-Path $scriptDir "..\..")).Path
$appRoot = Join-Path $repoRoot "musu-bee"
$tauriRoot = Join-Path $appRoot "src-tauri"

$checks = New-Object System.Collections.Generic.List[object]

function Add-Check {
    param(
        [Parameter(Mandatory = $true)][string]$Area,
        [Parameter(Mandatory = $true)][string]$Name,
        [ValidateSet("pass", "warn", "fail")]
        [Parameter(Mandatory = $true)][string]$Status,
        [Parameter(Mandatory = $true)][string]$Message
    )

    $checks.Add([pscustomobject]@{
        area = $Area
        name = $Name
        status = $Status
        message = $Message
    }) | Out-Null
}

function Test-JsonFile([string]$Path) {
    if (-not (Test-Path -LiteralPath $Path)) {
        return $null
    }
    return Get-Content -LiteralPath $Path -Raw | ConvertFrom-Json
}

function Get-CurrentPowerShellExecutable {
    $currentProcessPath = $null
    try {
        $currentProcessPath = [System.Diagnostics.Process]::GetCurrentProcess().MainModule.FileName
    }
    catch {
        $currentProcessPath = $null
    }

    if (-not [string]::IsNullOrWhiteSpace($currentProcessPath) -and (Test-Path -LiteralPath $currentProcessPath)) {
        return $currentProcessPath
    }

    $edition = if ($PSVersionTable.ContainsKey("PSEdition")) { [string]$PSVersionTable.PSEdition } else { "" }
    if ($edition -eq "Core") {
        return "pwsh"
    }
    return "powershell.exe"
}

function Resolve-TauriPath([string]$RelativePath) {
    if ([string]::IsNullOrWhiteSpace($RelativePath)) {
        return $null
    }
    return Join-Path $tauriRoot $RelativePath
}

$powerShellExecutable = Get-CurrentPowerShellExecutable

$versionPath = Join-Path $repoRoot "VERSION"
$repoVersion = if (Test-Path -LiteralPath $versionPath) {
    (Get-Content -LiteralPath $versionPath -Raw).Trim()
} else {
    ""
}
$numericReleaseVersion = if ($repoVersion.Contains("-")) {
    $repoVersion.Split("-", 2)[0]
} else {
    $repoVersion
}
$gitCommit = (& git -C $repoRoot rev-parse HEAD 2>$null | Out-String).Trim()

$packageJsonPath = Join-Path $appRoot "package.json"
$packageLockPath = Join-Path $appRoot "package-lock.json"
$tauriConfigPath = Join-Path $tauriRoot "tauri.conf.json"
$tauriCargoPath = Join-Path $tauriRoot "Cargo.toml"
$nextConfigPath = Join-Path $appRoot "next.config.mjs"

$packageJson = Test-JsonFile $packageJsonPath
$packageLockText = if (Test-Path -LiteralPath $packageLockPath) { Get-Content -LiteralPath $packageLockPath -Raw } else { "" }
$tauriConfig = Test-JsonFile $tauriConfigPath
$nextConfig = if (Test-Path -LiteralPath $nextConfigPath) { Get-Content -LiteralPath $nextConfigPath -Raw } else { "" }
$tauriCargo = if (Test-Path -LiteralPath $tauriCargoPath) { Get-Content -LiteralPath $tauriCargoPath -Raw } else { "" }

if ([string]::IsNullOrWhiteSpace($repoVersion)) {
    Add-Check "version" "repo VERSION" "fail" "VERSION file is missing or empty."
}
else {
    Add-Check "version" "repo VERSION" "pass" "Repository release version is $repoVersion."
}

if ($packageJson -and $packageJson.version -eq $repoVersion) {
    Add-Check "desktop-shell" "package.json version" "pass" "package.json matches VERSION."
}
else {
    Add-Check "desktop-shell" "package.json version" "fail" "package.json version does not match VERSION."
}

if ($packageJson -and $packageJson.engines -and [string]$packageJson.engines.node -match "22") {
    Add-Check "desktop-shell" "Node runtime floor" "pass" "package.json requires Node $($packageJson.engines.node), compatible with node:sqlite."
}
else {
    Add-Check "desktop-shell" "Node runtime floor" "fail" "package.json must require Node 22+ because server routes use node:sqlite."
}

if (-not [string]::IsNullOrWhiteSpace($packageLockText)) {
    $lockVersionMatches = [regex]::Matches($packageLockText, '"version"\s*:\s*"([^"]+)"')
    $lockRootVersion = if ($lockVersionMatches.Count -ge 1) { $lockVersionMatches[0].Groups[1].Value } else { "" }
    $lockPackageVersion = if ($lockVersionMatches.Count -ge 2) { $lockVersionMatches[1].Groups[1].Value } else { "" }
    if ($lockRootVersion -eq $repoVersion -and $lockPackageVersion -eq $repoVersion) {
        Add-Check "desktop-shell" "package-lock version" "pass" "package-lock root and package entry match VERSION."
    }
    else {
        Add-Check "desktop-shell" "package-lock version" "fail" "package-lock versions do not match VERSION."
    }
}
else {
    Add-Check "desktop-shell" "package-lock version" "fail" "package-lock.json is missing."
}

if ($tauriConfig -and (($tauriConfig.version -eq $repoVersion) -or ($tauriConfig.version -eq $numericReleaseVersion))) {
    Add-Check "desktop-shell" "Tauri version" "pass" "tauri.conf.json version is $($tauriConfig.version) for release $repoVersion."
}
else {
    Add-Check "desktop-shell" "Tauri version" "fail" "tauri.conf.json version must match VERSION or its numeric Windows bundle version $numericReleaseVersion."
}

if ($tauriConfig -and $tauriConfig.identifier -and $tauriConfig.identifier -ne "com.tauri.dev") {
    Add-Check "desktop-shell" "Tauri identifier" "pass" "Tauri identifier is $($tauriConfig.identifier)."
}
else {
    Add-Check "desktop-shell" "Tauri identifier" "fail" "Tauri identifier is missing or still set to com.tauri.dev."
}

if ($tauriConfig -and $tauriConfig.app.security.csp) {
    Add-Check "desktop-shell" "Tauri CSP" "pass" "Tauri CSP is explicit."
}
else {
    Add-Check "desktop-shell" "Tauri CSP" "fail" "Tauri CSP is null or missing."
}

if ($tauriConfig -and $tauriConfig.app.withGlobalTauri -eq $true) {
    Add-Check "desktop-shell" "Tauri IPC bridge" "pass" "withGlobalTauri is enabled for the static desktop shell."
}
else {
    Add-Check "desktop-shell" "Tauri IPC bridge" "fail" "withGlobalTauri must be enabled so the static shell can invoke runtime commands."
}

$mainWindow = if ($tauriConfig -and $tauriConfig.app.windows.Count -gt 0) { $tauriConfig.app.windows[0] } else { $null }
if ($mainWindow -and $mainWindow.decorations -eq $true -and $mainWindow.transparent -eq $false) {
    Add-Check "desktop-shell" "native window controls" "pass" "Main Tauri window uses native decorations and opaque background."
}
else {
    Add-Check "desktop-shell" "native window controls" "fail" "Main Tauri window is frameless/transparent without an audited custom titlebar."
}

if ($tauriCargo -match 'version\s*=\s*"([^"]+)"' -and $Matches[1] -eq $repoVersion) {
    Add-Check "desktop-shell" "Tauri Cargo version" "pass" "src-tauri Cargo version matches VERSION."
}
else {
    Add-Check "desktop-shell" "Tauri Cargo version" "fail" "src-tauri Cargo version does not match VERSION."
}

if ($tauriCargo -notmatch 'description\s*=\s*"A Tauri App"' -and $tauriCargo -notmatch 'authors\s*=\s*\["you"\]') {
    Add-Check "desktop-shell" "Tauri Cargo metadata" "pass" "src-tauri Cargo metadata is no longer scaffold placeholder text."
}
else {
    Add-Check "desktop-shell" "Tauri Cargo metadata" "fail" "src-tauri Cargo metadata still contains scaffold placeholders."
}

$frontendDist = if ($tauriConfig) { [string]$tauriConfig.build.frontendDist } else { "" }
$frontendDistPath = Resolve-TauriPath $frontendDist
$frontendIndex = if ($frontendDistPath) { Join-Path $frontendDistPath "index.html" } else { $null }
if ($frontendIndex -and (Test-Path -LiteralPath $frontendIndex)) {
    Add-Check "desktop-shell" "Tauri frontendDist" "pass" "frontendDist index exists at $frontendIndex."
}
else {
    Add-Check "desktop-shell" "Tauri frontendDist" "fail" "frontendDist '$frontendDist' does not contain index.html. Run npm run build:tauri-shell before the desktop build."
}

$beforeBuildCommand = if ($tauriConfig) { [string]$tauriConfig.build.beforeBuildCommand } else { "" }
$packageBuildScript = if ($packageJson) { [string]$packageJson.scripts.build } else { "" }
if ($beforeBuildCommand -eq "npm run build:tauri-shell") {
    Add-Check "desktop-shell" "Tauri build command" "pass" "beforeBuildCommand builds the dedicated Tauri desktop shell."
}
elseif (
    (($beforeBuildCommand -match "next build") -or ($beforeBuildCommand -eq "npm run build" -and $packageBuildScript -match "next build")) -and
    $frontendDist -eq "../out" -and
    $nextConfig -notmatch "output\s*:\s*['`"]export['`"]"
) {
    Add-Check "desktop-shell" "Tauri build command" "fail" "Tauri beforeBuildCommand resolves to Next build, but next.config.mjs does not produce a static out/ export for frontendDist."
}
elseif (-not [string]::IsNullOrWhiteSpace($beforeBuildCommand)) {
    Add-Check "desktop-shell" "Tauri build command" "pass" "beforeBuildCommand is set to '$beforeBuildCommand'."
}
else {
    Add-Check "desktop-shell" "Tauri build command" "warn" "beforeBuildCommand is empty."
}

$shellSourceRoot = Join-Path $appRoot "src-tauri-shell"
$shellSources = @("index.html", "styles.css", "main.js")
$missingShellSources = @($shellSources | Where-Object { -not (Test-Path -LiteralPath (Join-Path $shellSourceRoot $_)) })
if ($missingShellSources.Count -eq 0) {
    Add-Check "desktop-shell" "Tauri shell source" "pass" "Dedicated Tauri shell source files are present."
}
else {
    Add-Check "desktop-shell" "Tauri shell source" "fail" "Missing Tauri shell source files: $($missingShellSources -join ', ')."
}

$tauriLibPath = Join-Path $tauriRoot "src\lib.rs"
$tauriLib = if (Test-Path -LiteralPath $tauriLibPath) { Get-Content -LiteralPath $tauriLibPath -Raw } else { "" }
if (
    $tauriLib -match "desktop_status" -and
    $tauriLib -match "start_runtime" -and
    $tauriLib -match "open_dashboard" -and
    $tauriLib -match "generate_handler"
) {
    Add-Check "desktop-shell" "Tauri runtime commands" "pass" "Desktop shell can invoke status, start, and dashboard commands."
}
else {
    Add-Check "desktop-shell" "Tauri runtime commands" "fail" "Desktop shell runtime commands are missing from src-tauri/src/lib.rs."
}

$localMsix = Join-Path $repoRoot ".local-build\msix\output\musu_1.15.0.0_x64_local-sideload-manual.msix"
$storeMsix = Join-Path $repoRoot ".local-build\msix\output\musu_1.15.0.0_x64_store-reviewed-immediate-registration.msix"
$bundleRoot = Join-Path $repoRoot ".local-build\msix\submission-bundles"
$latestBundle = if (Test-Path -LiteralPath $bundleRoot) {
    Get-ChildItem -LiteralPath $bundleRoot -Directory -Filter "store-reviewed-*" |
        Sort-Object LastWriteTime -Descending |
        Select-Object -First 1
} else {
    $null
}

if (Test-Path -LiteralPath $localMsix) {
    Add-Check "runtime-package" "local sideload MSIX" "pass" "Current local-sideload MSIX exists."
}
else {
    Add-Check "runtime-package" "local sideload MSIX" "fail" "Current local-sideload MSIX is missing."
}

if (Test-Path -LiteralPath $storeMsix) {
    Add-Check "runtime-package" "Store-reviewed MSIX" "pass" "Current Store-reviewed MSIX exists."
}
else {
    Add-Check "runtime-package" "Store-reviewed MSIX" "fail" "Current Store-reviewed MSIX is missing."
}

$msixEntrypointAuditScript = Join-Path $scriptDir "audit-msix-desktop-entrypoint.ps1"
if (Test-Path -LiteralPath $msixEntrypointAuditScript) {
    foreach ($target in @(
        [pscustomobject]@{
            label = "local sideload MSIX desktop entrypoint"
            path = $localMsix
            contract = "local-sideload-manual"
        },
        [pscustomobject]@{
            label = "Store-reviewed MSIX desktop entrypoint"
            path = $storeMsix
            contract = "store-reviewed-immediate-registration"
        }
    )) {
        if (Test-Path -LiteralPath $target.path) {
            $entrypointOutput = & $powerShellExecutable -NoProfile -ExecutionPolicy Bypass -File $msixEntrypointAuditScript -PackagePath $target.path -StartupContract $target.contract -Json 2>&1
            if ($LASTEXITCODE -eq 0) {
                try {
                    $entrypointAudit = ($entrypointOutput | Out-String).Trim() | ConvertFrom-Json
                    if ([bool]$entrypointAudit.ok) {
                        Add-Check "runtime-package" $target.label "pass" "MSIX application entrypoint launches $($entrypointAudit.expected_application_executable)."
                    }
                    else {
                        $failed = @($entrypointAudit.checks | Where-Object { $_.status -eq "fail" } | Select-Object -First 3 | ForEach-Object { $_.message })
                        Add-Check "runtime-package" $target.label "fail" "MSIX desktop entrypoint audit failed: $($failed -join '; ')"
                    }
                }
                catch {
                    Add-Check "runtime-package" $target.label "fail" "MSIX desktop entrypoint audit did not return parseable JSON: $($_.Exception.Message)"
                }
            }
            else {
                Add-Check "runtime-package" $target.label "fail" "MSIX desktop entrypoint audit command failed: $($entrypointOutput | Out-String)"
            }
        }
    }
}
else {
    Add-Check "runtime-package" "MSIX desktop entrypoint audit script" "fail" "audit-msix-desktop-entrypoint.ps1 is missing."
}

if ($latestBundle) {
    Add-Check "runtime-package" "Store submission bundle" "pass" "Latest Store submission bundle: $($latestBundle.FullName)."
    $bundleVerifier = Join-Path $scriptDir "verify-store-submission-bundle.ps1"
    if (Test-Path -LiteralPath $bundleVerifier) {
        $bundleVerifyOutput = & $powerShellExecutable -NoProfile -ExecutionPolicy Bypass -File $bundleVerifier -BundleDir $latestBundle.FullName -Json 2>&1
        if ($LASTEXITCODE -eq 0) {
            $bundleVerify = ($bundleVerifyOutput | Out-String).Trim() | ConvertFrom-Json
            if ([bool]$bundleVerify.ok) {
                Add-Check "runtime-package" "Store submission bundle verification" "pass" "Latest Store submission bundle verifies with fail_count=0."
            }
            else {
                Add-Check "runtime-package" "Store submission bundle verification" "fail" "Latest Store submission bundle verifier returned ok=false."
            }
        }
        else {
            Add-Check "runtime-package" "Store submission bundle verification" "fail" "Latest Store submission bundle verifier failed: $($bundleVerifyOutput | Out-String)"
        }
    }
    else {
        Add-Check "runtime-package" "Store submission bundle verification" "fail" "verify-store-submission-bundle.ps1 is missing."
    }
}
else {
    Add-Check "runtime-package" "Store submission bundle" "fail" "Store submission bundle is missing."
}

foreach ($scriptName in @("smoke-single-machine-beta.ps1", "verify-single-machine-evidence.ps1", "record-single-machine-evidence.ps1", "smoke-multidevice-beta.ps1", "prepare-multidevice-test-kit.ps1", "run-second-pc-release-check.ps1", "prepare-final-operator-gate-packet.ps1", "verify-final-operator-gate-packet.ps1", "prepare-operator-action-pack.ps1", "verify-operator-action-pack.ps1", "complete-final-operator-gates.ps1", "show-final-release-handoff-status.ps1", "show-second-pc-return-card.ps1", "import-second-pc-return.ps1", "capture-msix-install-evidence.ps1", "collect-second-pc-handoff.ps1", "verify-msix-install-evidence.ps1", "record-msix-install-evidence.ps1", "verify-multidevice-evidence.ps1", "record-multidevice-evidence.ps1", "verify-support-mailbox-evidence.ps1", "record-support-mailbox-verification.ps1", "verify-store-release-evidence.ps1", "record-store-release-verification.ps1", "record-p2p-control-plane-evidence.ps1", "verify-p2p-control-plane-evidence.ps1", "configure-musu-pro-p2p-env.ps1", "show-musu-pro-p2p-env-status.ps1", "record-external-release-gate-recheck.ps1", "test-release-evidence-verifiers.ps1", "verify-store-submission-bundle.ps1", "audit-msix-desktop-entrypoint.ps1", "audit-frontend-polling-contract.ps1", "audit-rust-background-loop-contract.ps1", "audit-local-api-auth-contract.ps1", "audit-operator-api-security-contract.ps1", "audit-p2p-store-forward-relay-contract.ps1", "audit-secret-storage-contract.ps1", "measure-musu-idle-cpu.ps1", "measure-musu-runtime-cpu-scenarios.ps1", "verify-runtime-cpu-scenario-matrix.ps1", "audit-musu-process-ownership.ps1", "show-musu-process-attribution.ps1", "repair-packaged-local-runtime-state.ps1", "audit-musu-startup-single-instance.ps1", "audit-musu-desktop-single-instance.ps1", "write-release-candidate-manifest.ps1", "verify-store-public-metadata.ps1", "write-release-go-no-go.ps1")) {
    $scriptPath = Join-Path $scriptDir $scriptName
    if (Test-Path -LiteralPath $scriptPath) {
        Add-Check "release-smoke" $scriptName "pass" "$scriptName exists."
    }
    else {
        Add-Check "release-smoke" $scriptName "fail" "$scriptName is missing."
    }
}

$singleSmokeScript = Join-Path $scriptDir "smoke-single-machine-beta.ps1"
if (Test-Path -LiteralPath $singleSmokeScript) {
    $singleSmokeText = Get-Content -LiteralPath $singleSmokeScript -Raw
    $supportsReachableDashboard = (
        $singleSmokeText -match "Resolve-DashboardBaseUrlCandidate" -and
        $singleSmokeText -match "reachable_url" -and
        $singleSmokeText -match "dashboard_base_url_source"
    )
    $supportsBridgeOnlyPackage = (
        $singleSmokeText -match "bridge-only-packaged-runtime" -and
        $singleSmokeText -match "dashboard_required" -and
        $singleSmokeText -match "local-bridge-only"
    )
    Add-Check "release-smoke" "single-machine local runtime surface" `
        ($(if ($supportsReachableDashboard -and $supportsBridgeOnlyPackage) { "pass" } else { "fail" })) `
        ($(if ($supportsReachableDashboard -and $supportsBridgeOnlyPackage) { "single-machine smoke supports reachable dashboards and packaged bridge-only runtime evidence." } else { "single-machine smoke does not prove both reachable-dashboard and packaged bridge-only runtime contracts." }))

    $hasDevDashboardDefault = ($singleSmokeText -match 'DashboardBaseUrl\s*=\s*"http://127\.0\.0\.1:3000"')
    Add-Check "release-smoke" "single-machine smoke no dev-port default" `
        ($(if (-not $hasDevDashboardDefault) { "pass" } else { "fail" })) `
        ($(if (-not $hasDevDashboardDefault) { "single-machine smoke no longer defaults to the dev dashboard port." } else { "single-machine smoke still defaults to the dev dashboard port." }))

    $requiresPackagedRuntimeByDefault = (
        $singleSmokeText -match "Microsoft\\WindowsApps\\musu.exe" -and
        $singleSmokeText -match "AllowDeveloperRuntime" -and
        $singleSmokeText -match "Single-machine release smoke must use the packaged WindowsApps MUSU runtime"
    )
    Add-Check "release-smoke" "single-machine packaged runtime default" `
        ($(if ($requiresPackagedRuntimeByDefault) { "pass" } else { "fail" })) `
        ($(if ($requiresPackagedRuntimeByDefault) { "single-machine smoke defaults to the packaged WindowsApps runtime and gates developer runtime opt-in." } else { "single-machine smoke can still default to or silently accept developer runtime evidence." }))
}

$tauriLib = Join-Path $tauriRoot "src\lib.rs"
if (Test-Path -LiteralPath $tauriLib) {
    $tauriLibText = Get-Content -LiteralPath $tauriLib -Raw
    $devDashboardReleaseGated = (
        $tauriLibText -match "developer_dashboard_surface_enabled" -and
        $tauriLibText -match "MUSU_DESKTOP_ENABLE_DEV_DASHBOARD" -and
        $tauriLibText -match "developer dashboard is disabled in packaged MUSU Desktop"
    )
    Add-Check "desktop-shell" "packaged dev dashboard opt-in" `
        ($(if ($devDashboardReleaseGated) { "pass" } else { "fail" })) `
        ($(if ($devDashboardReleaseGated) { "packaged desktop shell keeps the developer dashboard disabled unless explicitly opted in." } else { "desktop shell can still expose the developer dashboard as a default packaged surface." }))
}
else {
    Add-Check "desktop-shell" "packaged dev dashboard opt-in" "fail" "Tauri lib.rs is missing."
}

$privacyPage = Join-Path $appRoot "src\app\privacy\page.tsx"
$supportPage = Join-Path $appRoot "src\app\support\page.tsx"
$storeMetadataDoc = Join-Path $repoRoot "docs\STORE_SUBMISSION_METADATA_2026_05_29.md"
$storeMetadataE2e = Join-Path $appRoot "e2e\store-public-metadata.spec.ts"
$playwrightCiConfig = Join-Path $appRoot "playwright.ci.config.ts"

if (Test-Path -LiteralPath $privacyPage) {
    Add-Check "store-metadata" "privacy policy route" "pass" "Public privacy route exists at /privacy."
}
else {
    Add-Check "store-metadata" "privacy policy route" "fail" "Public privacy route is missing."
}

if (Test-Path -LiteralPath $supportPage) {
    Add-Check "store-metadata" "support route" "pass" "Public support route exists at /support."
}
else {
    Add-Check "store-metadata" "support route" "fail" "Public support route is missing."
}

if (Test-Path -LiteralPath $storeMetadataDoc) {
    Add-Check "store-metadata" "Partner Center metadata doc" "pass" "Store submission metadata doc exists."
}
else {
    Add-Check "store-metadata" "Partner Center metadata doc" "fail" "Store submission metadata doc is missing."
}

if ((Test-Path -LiteralPath $storeMetadataE2e) -and (Test-Path -LiteralPath $playwrightCiConfig)) {
    Add-Check "store-metadata" "public metadata E2E smoke" "pass" "Playwright CI smoke covers /privacy and /support content."
}
else {
    Add-Check "store-metadata" "public metadata E2E smoke" "fail" "Playwright CI smoke for /privacy and /support is missing."
}

$singleEvidenceRoots = @(
    [pscustomobject]@{
        path = (Join-Path $repoRoot ("docs\evidence\single-machine\{0}" -f $repoVersion))
        filter = "*.evidence.json"
    },
    [pscustomobject]@{
        path = (Join-Path $repoRoot ".local-build\single-machine")
        filter = "*.json"
    }
)
$latestSingleEvidence = $null
foreach ($root in $singleEvidenceRoots) {
    if (Test-Path -LiteralPath $root.path) {
        $candidate = Get-ChildItem -LiteralPath $root.path -Filter $root.filter -File -ErrorAction SilentlyContinue |
            Sort-Object LastWriteTime -Descending |
            Select-Object -First 1
        if ($candidate) {
            $latestSingleEvidence = $candidate
            break
        }
    }
}

if (-not $latestSingleEvidence) {
    Add-Check "single-machine" "local smoke execution" "fail" "No single-machine evidence JSON found under docs\evidence\single-machine\$repoVersion\*.evidence.json or .local-build\single-machine\*.json."
}
else {
    $verifySingleScript = Join-Path $scriptDir "verify-single-machine-evidence.ps1"
    $verifySingleOutput = & $powerShellExecutable -NoProfile -ExecutionPolicy Bypass -File $verifySingleScript -EvidencePath $latestSingleEvidence.FullName -ExpectedVersion $repoVersion -ExpectedGitCommit $gitCommit -AllowDocumentationOnlyGitDelta -Json 2>&1
    $verifySingleExit = $LASTEXITCODE
    if ($verifySingleExit -eq 0) {
        $verifySingleResult = ($verifySingleOutput | Out-String).Trim() | ConvertFrom-Json
        Add-Check "single-machine" "local smoke execution" "pass" "Verified single-machine evidence: $($verifySingleResult.evidence_path)."
    }
    else {
        Add-Check "single-machine" "local smoke execution" "fail" "Latest single-machine evidence did not verify: $($latestSingleEvidence.FullName). $($verifySingleOutput | Out-String)"
    }
}

$multiDevicePlan = Join-Path $repoRoot "docs\MULTI_DEVICE_RELEASE_TEST_PLAN_1_15_0_RC1_2026_05_29.md"
$evidenceRoots = @(
    [pscustomobject]@{
        path = (Join-Path $repoRoot ("docs\evidence\multidevice\{0}" -f $repoVersion))
        filter = "*.evidence.json"
    },
    [pscustomobject]@{
        path = (Join-Path $repoRoot ".local-build\multi-device")
        filter = "*.json"
    }
)
$latestEvidence = $null
foreach ($root in $evidenceRoots) {
    if (Test-Path -LiteralPath $root.path) {
        $candidate = Get-ChildItem -LiteralPath $root.path -Filter $root.filter -File -ErrorAction SilentlyContinue |
            Sort-Object LastWriteTime -Descending |
            Select-Object -First 1
        if ($candidate) {
            $latestEvidence = $candidate
            break
        }
    }
}

if (-not (Test-Path -LiteralPath $multiDevicePlan)) {
    Add-Check "multi-device" "second-PC execution" "fail" "Multi-device test plan is missing."
}
elseif (-not $latestEvidence) {
    Add-Check "multi-device" "second-PC execution" "fail" "No multi-device evidence JSON found under docs\evidence\multidevice\$repoVersion\*.evidence.json or .local-build\multi-device\*.json."
}
else {
    $verifyScript = Join-Path $scriptDir "verify-multidevice-evidence.ps1"
    $verifyOutput = & $powerShellExecutable -NoProfile -ExecutionPolicy Bypass -File $verifyScript -EvidencePath $latestEvidence.FullName -ExpectedVersion $repoVersion -Json 2>&1
    $verifyExit = $LASTEXITCODE
    if ($verifyExit -eq 0) {
        $verifyResult = ($verifyOutput | Out-String).Trim() | ConvertFrom-Json
        Add-Check "multi-device" "second-PC execution" "pass" "Verified multi-device evidence: $($verifyResult.evidence_path)."
    }
    else {
        Add-Check "multi-device" "second-PC execution" "fail" "Latest multi-device evidence did not verify: $($latestEvidence.FullName). $($verifyOutput | Out-String)"
    }
}

$failCount = @($checks | Where-Object { $_.status -eq "fail" }).Count
$warnCount = @($checks | Where-Object { $_.status -eq "warn" }).Count
$runtimeFailCount = @($checks | Where-Object { $_.area -eq "runtime-package" -and $_.status -eq "fail" }).Count
$msixEntrypointFailCount = @($checks | Where-Object { $_.area -eq "runtime-package" -and $_.name -like "*desktop entrypoint*" -and $_.status -eq "fail" }).Count
$desktopFailCount = @($checks | Where-Object { $_.area -eq "desktop-shell" -and $_.status -eq "fail" }).Count
$singleMachineFailCount = @($checks | Where-Object { $_.area -eq "single-machine" -and $_.status -eq "fail" }).Count
$multiDeviceFailCount = @($checks | Where-Object { $_.area -eq "multi-device" -and $_.status -eq "fail" }).Count

$result = [pscustomobject]@{
    ok = ($failCount -eq 0)
    runtime_package_ready = ($runtimeFailCount -eq 0)
    msix_desktop_entrypoint_ready = ($msixEntrypointFailCount -eq 0)
    desktop_shell_ready = ($desktopFailCount -eq 0)
    single_machine_verified = ($singleMachineFailCount -eq 0)
    multi_device_verified = ($multiDeviceFailCount -eq 0)
    public_desktop_release_ready = ($failCount -eq 0)
    fail_count = $failCount
    warn_count = $warnCount
    checks = $checks.ToArray()
}

if ($Json) {
    $result | ConvertTo-Json -Depth 6
}
else {
    "MUSU desktop release readiness"
    "runtime_package_ready: $($result.runtime_package_ready)"
    "msix_desktop_entrypoint_ready: $($result.msix_desktop_entrypoint_ready)"
    "desktop_shell_ready: $($result.desktop_shell_ready)"
    "single_machine_verified: $($result.single_machine_verified)"
    "multi_device_verified: $($result.multi_device_verified)"
    "public_desktop_release_ready: $($result.public_desktop_release_ready)"
    ""
    $checks | Sort-Object area, name | Format-Table area, name, status, message -Wrap
}

if ($FailOnBlocking -and -not $result.ok) {
    throw "desktop release readiness has $failCount blocking check(s)"
}
