[CmdletBinding()]
param(
    [string]$ReturnZipPath,
    [string]$ExpectedVersion,
    [string]$ImportRoot,
    [switch]$RecordMsixInstall,
    [switch]$RequireReleaseGateEvidence,
    [switch]$Json
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
. (Join-Path $scriptDir "msix-common.ps1")
$repoRoot = Get-WindowsRepoRoot $MyInvocation.MyCommand.Path
$currentGitState = Get-MusuSourceGitState -RepoRoot $repoRoot
$currentGitCommit = [string]$currentGitState.commit

if ([string]::IsNullOrWhiteSpace($ExpectedVersion)) {
    $ExpectedVersion = (Get-Content -LiteralPath (Join-Path $repoRoot "VERSION") -Raw).Trim()
}
if ([string]::IsNullOrWhiteSpace($ImportRoot)) {
    $ImportRoot = Join-Path $repoRoot ".local-build\second-pc-return\imported"
}
if ([string]::IsNullOrWhiteSpace($ReturnZipPath)) {
    $returnRoot = Join-Path $repoRoot ".local-build\second-pc-return"
    $latest = Get-ChildItem -LiteralPath $returnRoot -Filter "*.zip" -File -ErrorAction SilentlyContinue |
        Sort-Object LastWriteTimeUtc -Descending |
        Select-Object -First 1
    if (-not $latest) {
        throw "Return zip path was not provided and no .local-build\second-pc-return\*.zip file exists."
    }
    $ReturnZipPath = $latest.FullName
}
if (-not (Test-Path -LiteralPath $ReturnZipPath)) {
    throw "Return zip not found: $ReturnZipPath"
}

function Resolve-LatestFile {
    param(
        [Parameter(Mandatory = $true)][string]$Root,
        [Parameter(Mandatory = $true)][string]$Filter,
        [Parameter(Mandatory = $true)][string]$Label
    )

    $file = Get-ChildItem -LiteralPath $Root -Filter $Filter -File -Recurse -ErrorAction SilentlyContinue |
        Sort-Object LastWriteTimeUtc -Descending |
        Select-Object -First 1
    if (-not $file) {
        throw "$Label file not found under $Root matching $Filter"
    }
    return $file.FullName
}

function Resolve-LatestJsonBySchema {
    param(
        [Parameter(Mandatory = $true)][string]$Root,
        [Parameter(Mandatory = $true)][string]$Schema,
        [Parameter(Mandatory = $true)][string]$Label,
        [switch]$Optional
    )

    $matches = @()
    foreach ($file in @(Get-ChildItem -LiteralPath $Root -Filter "*.json" -File -Recurse -ErrorAction SilentlyContinue)) {
        try {
            $json = Get-Content -LiteralPath $file.FullName -Raw | ConvertFrom-Json
            if ([string]$json.schema -eq $Schema) {
                $matches += $file
            }
        }
        catch {
            # Ignore non-JSON or partial files; the final chosen file is verified later.
        }
    }

    $match = $matches | Sort-Object LastWriteTimeUtc -Descending | Select-Object -First 1
    if (-not $match -and -not $Optional) {
        throw "$Label file not found under $Root with schema $Schema"
    }
    if (-not $match) {
        return $null
    }
    return $match.FullName
}

function Resolve-LatestRuntimeIdleReleaseEvidence {
    param(
        [Parameter(Mandatory = $true)][string]$Root,
        [switch]$Optional
    )

    $matches = @()
    foreach ($file in @(Get-ChildItem -LiteralPath $Root -Filter "*.json" -File -Recurse -ErrorAction SilentlyContinue)) {
        try {
            $json = Get-Content -LiteralPath $file.FullName -Raw | ConvertFrom-Json
            $normalizedPath = $file.FullName -replace "/", "\"
            if (
                [string]$json.schema -eq "musu.runtime_idle_cpu_evidence.v1" -and
                [string]$json.scenario -eq "desktop-open" -and
                [bool]$json.require_owned_webview2 -and
                $normalizedPath -like "*\.local-build\runtime-idle-cpu\*"
            ) {
                $matches += $file
            }
        }
        catch {
            # Ignore unrelated JSON files; the selected evidence is verified by go/no-go later.
        }
    }

    $match = $matches | Sort-Object LastWriteTimeUtc -Descending | Select-Object -First 1
    if (-not $match -and -not $Optional) {
        throw "release-grade runtime idle CPU evidence file not found under $Root"
    }
    if (-not $match) {
        return $null
    }
    return $match.FullName
}

function Test-ReleaseEvidenceFreshnessAllowedPath {
    param([Parameter(Mandatory = $true)][string]$Path)

    $normalizedPath = $Path.Replace("\", "/")
    if ($normalizedPath -like "docs/*" -or $normalizedPath -like "musu-bee/docs/*" -or $normalizedPath -like "*.md") {
        return $true
    }

    $serverOnlyControlPlanePaths = @(
        "musu-bee/src/app/api/v1/p2p/*",
        "musu-bee/src/app/api/v1/relay/*",
        "musu-bee/src/app/api/rooms/*",
        "musu-bee/src/lib/routeEvidence*.ts",
        "musu-bee/src/lib/p2p*.ts"
    )
    foreach ($pattern in $serverOnlyControlPlanePaths) {
        if ($normalizedPath -like $pattern) {
            return $true
        }
    }

    $testOnlyPathPatterns = @(
        "*.test.ts",
        "*.test.tsx",
        "*.spec.ts",
        "*.spec.tsx"
    )
    foreach ($pattern in $testOnlyPathPatterns) {
        if ($normalizedPath -like $pattern) {
            return $true
        }
    }

    $statusOnlyScripts = @(
        ".github/workflows/deploy-musu-bee.yml",
        "scripts/windows/audit-desktop-release-readiness.ps1",
        "scripts/windows/audit-frontend-polling-contract.ps1",
        "scripts/windows/audit-rust-background-loop-contract.ps1",
        "scripts/windows/audit-local-api-auth-contract.ps1",
        "scripts/windows/audit-operator-api-security-contract.ps1",
        "scripts/windows/audit-degraded-mode-contract.ps1",
        "scripts/windows/audit-musu-crash-recovery-contract.ps1",
        "scripts/windows/audit-musu-process-ownership.ps1",
        "scripts/windows/audit-musu-startup-single-instance.ps1",
        "scripts/windows/audit-p2p-store-forward-relay-contract.ps1",
        "scripts/windows/audit-secret-storage-contract.ps1",
        "scripts/windows/capture-msix-install-evidence.ps1",
        "scripts/windows/check-msix-legacy-conflicts.ps1",
        "scripts/windows/complete-final-operator-gates.ps1",
        "scripts/windows/configure-musu-pro-p2p-env.ps1",
        "scripts/windows/import-second-pc-return.ps1",
        "scripts/windows/measure-musu-runtime-cpu-scenarios.ps1",
        "scripts/windows/msix-common.ps1",
        "scripts/windows/prepare-final-operator-gate-packet.ps1",
        "scripts/windows/prepare-multidevice-test-kit.ps1",
        "scripts/windows/prepare-operator-action-pack.ps1",
        "scripts/windows/prepare-support-mailbox-verification-request.ps1",
        "scripts/windows/repair-packaged-local-runtime-state.ps1",
        "scripts/windows/record-route-reachability-diagnostic.ps1",
        "scripts/windows/record-msix-install-evidence.ps1",
        "scripts/windows/record-multidevice-evidence.ps1",
        "scripts/windows/record-external-release-gate-recheck.ps1",
        "scripts/windows/record-p2p-control-plane-evidence.ps1",
        "scripts/windows/record-single-machine-evidence.ps1",
        "scripts/windows/record-support-mailbox-verification.ps1",
        "scripts/windows/run-second-pc-release-check.ps1",
        "scripts/windows/test-second-pc-route-preflight.ps1",
        "scripts/windows/smoke-multidevice-beta.ps1",
        "scripts/windows/smoke-single-machine-beta.ps1",
        "scripts/windows/verify-installed-msix-package.ps1",
        "scripts/windows/verify-final-operator-gate-packet.ps1",
        "scripts/windows/verify-msix-install-evidence.ps1",
        "scripts/windows/verify-multidevice-evidence.ps1",
        "scripts/windows/verify-operator-action-pack.ps1",
        "scripts/windows/verify-p2p-control-plane-evidence.ps1",
        "scripts/windows/verify-route-reachability-diagnostic.ps1",
        "scripts/windows/verify-runtime-cpu-scenario-matrix.ps1",
        "scripts/windows/verify-single-machine-evidence.ps1",
        "scripts/windows/verify-support-mailbox-evidence.ps1",
        "scripts/windows/verify-store-submission-bundle.ps1",
        "scripts/windows/show-final-release-handoff-status.ps1",
        "scripts/windows/show-operator-handoff-card.ps1",
        "scripts/windows/write-release-go-no-go.ps1",
        "scripts/windows/write-release-candidate-manifest.ps1",
        "scripts/windows/test-release-evidence-verifiers.ps1",
        "scripts/windows/show-musu-process-attribution.ps1",
        "scripts/windows/verify-process-attribution-summary.ps1",
        "scripts/windows/show-musu-pro-p2p-env-status.ps1"
    )
    return ($statusOnlyScripts -contains $normalizedPath)
}

function Test-ReleaseEvidenceFreshnessAllowedDiff {
    param(
        [Parameter(Mandatory = $true)][string]$FromCommit,
        [Parameter(Mandatory = $true)][string]$ToCommit,
        [Parameter(Mandatory = $true)][string]$Path
    )

    $normalizedPath = $Path.Replace("\", "/")
    if ($normalizedPath -notin @(".github/workflows/test.yml", "musu-bee/package.json")) {
        return $false
    }

    $diffText = (& git -C $repoRoot diff --unified=0 $FromCommit $ToCommit -- $Path 2>$null | Out-String).Trim()
    if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($diffText)) {
        return $false
    }

    $changedLines = @(
        $diffText -split "`r?`n" |
            Where-Object { ($_ -match "^[+-]") -and ($_ -notmatch "^\+\+\+") -and ($_ -notmatch "^---") }
    )
    if ($changedLines.Count -eq 0) {
        return $true
    }

    if ($normalizedPath -eq ".github/workflows/test.yml") {
        $allowed = @(
            '^\+\s*- name: P2P control-plane tests\s*$',
            '^\+\s*run: npm run test:p2p\s*$',
            '^\+\s*$'
        )
        return (@($changedLines | Where-Object {
            $line = [string]$_
            -not (@($allowed | Where-Object { $line -match $_ }).Count -gt 0)
        }).Count -eq 0)
    }

    if ($normalizedPath -eq "musu-bee/package.json") {
        return (@($changedLines | Where-Object {
            $line = [string]$_
            $line -notmatch '^\+\s*"test:p2p":\s*"tsx --test src/lib/p2pKvEnv\.test\.ts src/app/api/v1/p2p/route-evidence/route\.test\.ts src/app/api/v1/p2p/rendezvous/route\.test\.ts src/app/api/v1/p2p/relay/lease/route\.test\.ts src/app/api/v1/p2p/relay/transport/route\.test\.ts",\s*$'
        }).Count -eq 0)
    }

    return $false
}

function Test-DocumentationOrStatusOnlyGitDelta {
    param(
        [Parameter(Mandatory = $true)][string]$FromCommit,
        [Parameter(Mandatory = $true)][string]$ToCommit
    )

    if ($FromCommit -notmatch "^[0-9a-f]{40}$" -or $ToCommit -notmatch "^[0-9a-f]{40}$") {
        return $false
    }

    $changedPathsText = (& git -C $repoRoot diff --name-only $FromCommit $ToCommit 2>$null | Out-String).Trim()
    if ($LASTEXITCODE -ne 0) {
        return $false
    }
    if ([string]::IsNullOrWhiteSpace($changedPathsText)) {
        return $true
    }

    $changedPaths = @($changedPathsText -split "`r?`n" | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
    $runtimeAffectingPaths = @($changedPaths | Where-Object {
        $path = [string]$_
        -not (Test-ReleaseEvidenceFreshnessAllowedPath -Path $path) -and
        -not (Test-ReleaseEvidenceFreshnessAllowedDiff -FromCommit $FromCommit -ToCommit $ToCommit -Path $path)
    })
    return ($runtimeAffectingPaths.Count -eq 0)
}

function New-GitFreshnessSummary {
    param(
        [Parameter(Mandatory = $true)]$Evidence,
        [Parameter(Mandatory = $true)][string]$ExpectedGitCommit,
        [Parameter(Mandatory = $true)][string]$Label
    )

    $gitCommit = if ($Evidence -and $Evidence.PSObject.Properties["git_commit"]) { [string]$Evidence.git_commit } else { "" }
    $gitCommitPresent = -not [string]::IsNullOrWhiteSpace($gitCommit)
    $gitCommitValid = ($gitCommit -match "^[0-9a-f]{40}$")
    $gitDirtyPresent = ($Evidence -and $Evidence.PSObject.Properties["git_dirty"])
    $gitDirty = if ($gitDirtyPresent) { [bool]$Evidence.git_dirty } else { $null }
    $gitCommitMatchesExpected = ($gitCommitValid -and $gitCommit -eq $ExpectedGitCommit)
    $documentationOrStatusOnlyGitDelta = $false
    if (-not $gitCommitMatchesExpected -and $gitCommitValid -and $ExpectedGitCommit -match "^[0-9a-f]{40}$") {
        $documentationOrStatusOnlyGitDelta = Test-DocumentationOrStatusOnlyGitDelta -FromCommit $gitCommit -ToCommit $ExpectedGitCommit
    }

    return [pscustomobject]@{
        label = $Label
        git_commit = if ($gitCommitPresent) { $gitCommit } else { $null }
        git_commit_present = [bool]$gitCommitPresent
        git_commit_valid = [bool]$gitCommitValid
        expected_git_commit = $ExpectedGitCommit
        git_commit_matches_expected = [bool]$gitCommitMatchesExpected
        documentation_or_status_only_git_delta = [bool]$documentationOrStatusOnlyGitDelta
        git_dirty_present = [bool]$gitDirtyPresent
        git_dirty = $gitDirty
        git_source = if ($Evidence -and $Evidence.PSObject.Properties["git_source"]) { [string]$Evidence.git_source } else { $null }
        git_metadata_path = if ($Evidence -and $Evidence.PSObject.Properties["git_metadata_path"]) { [string]$Evidence.git_metadata_path } else { $null }
        ok = [bool]($gitCommitPresent -and $gitCommitValid -and ($gitCommitMatchesExpected -or $documentationOrStatusOnlyGitDelta) -and $gitDirtyPresent -and -not [bool]$gitDirty)
    }
}

function Copy-IntoRoot {
    param(
        [Parameter(Mandatory = $true)][string]$SourcePath,
        [Parameter(Mandatory = $true)][string]$TargetRoot
    )

    New-Item -ItemType Directory -Force -Path $TargetRoot | Out-Null
    $targetPath = Join-Path $TargetRoot (Split-Path -Leaf $SourcePath)
    Copy-Item -LiteralPath $SourcePath -Destination $targetPath -Force
    return (Resolve-Path -LiteralPath $targetPath).Path
}

function Get-JsonPropertyString {
    param(
        [Parameter(Mandatory = $true)]$Object,
        [Parameter(Mandatory = $true)][string]$Name
    )

    $property = $Object.PSObject.Properties[$Name]
    if (-not $property -or $null -eq $property.Value) {
        return ""
    }
    return [string]$property.Value
}

$CpuSubroleNames = @("musu_runtime", "bridge_runtime", "desktop_shell", "node_helper", "webview2_helper", "other")

function Test-ObjectHasNamedProperties {
    param(
        $Object,
        [Parameter(Mandatory = $true)][string[]]$Names
    )

    if ($null -eq $Object) {
        return $false
    }
    foreach ($name in $Names) {
        if (-not $Object.PSObject.Properties[$name]) {
            return $false
        }
    }
    return $true
}

function Get-SubroleCount {
    param(
        $Counts,
        [Parameter(Mandatory = $true)][string]$Name
    )

    if ($null -eq $Counts -or -not $Counts.PSObject.Properties[$Name]) {
        return 0
    }
    return [int]$Counts.$Name
}

function New-CpuSubroleSummary {
    param(
        $Measurement,
        [Parameter(Mandatory = $true)][string]$Scenario,
        [switch]$RequireDesktopShell,
        [switch]$RequireWebView2Helper
    )

    $issues = New-Object System.Collections.Generic.List[string]
    $counts = if ($Measurement -and $Measurement.PSObject.Properties["process_counts_by_subrole"]) { $Measurement.process_counts_by_subrole } else { $null }
    $maxCpu = if ($Measurement -and $Measurement.PSObject.Properties["max_one_core_percent_by_subrole"]) { $Measurement.max_one_core_percent_by_subrole } else { $null }
    $memory = if ($Measurement -and $Measurement.PSObject.Properties["memory_totals_by_subrole_mb"]) { $Measurement.memory_totals_by_subrole_mb } else { $null }
    $cpuAttribution = if ($Measurement -and $Measurement.PSObject.Properties["cpu_attribution"]) { $Measurement.cpu_attribution } else { $null }
    $requiredSubroles = if ($cpuAttribution -and $cpuAttribution.PSObject.Properties["required_subroles_present"]) { $cpuAttribution.required_subroles_present } else { $null }

    if (-not (Test-ObjectHasNamedProperties -Object $counts -Names $CpuSubroleNames)) {
        $issues.Add("missing_process_counts_by_subrole") | Out-Null
    }
    if (-not (Test-ObjectHasNamedProperties -Object $maxCpu -Names $CpuSubroleNames)) {
        $issues.Add("missing_max_one_core_percent_by_subrole") | Out-Null
    }
    if (-not (Test-ObjectHasNamedProperties -Object $memory -Names $CpuSubroleNames)) {
        $issues.Add("missing_memory_totals_by_subrole_mb") | Out-Null
    }
    if ($null -eq $cpuAttribution) {
        $issues.Add("missing_cpu_attribution") | Out-Null
    }
    else {
        foreach ($field in @("sample_count_by_subrole", "total_cpu_seconds_by_subrole", "max_one_core_percent_by_subrole")) {
            if (-not $cpuAttribution.PSObject.Properties[$field] -or -not (Test-ObjectHasNamedProperties -Object $cpuAttribution.$field -Names $CpuSubroleNames)) {
                $issues.Add("missing_cpu_attribution_$field") | Out-Null
            }
        }
        if (-not $cpuAttribution.PSObject.Properties["top_processes"] -or @($cpuAttribution.top_processes).Count -eq 0) {
            $issues.Add("missing_cpu_attribution_top_processes") | Out-Null
        }
        else {
            $missingTopSubroleCount = @($cpuAttribution.top_processes | Where-Object {
                -not $_.PSObject.Properties["process_subrole"] -or ([string]$_.process_subrole) -notin $CpuSubroleNames
            }).Count
            if ($missingTopSubroleCount -gt 0) {
                $issues.Add("malformed_cpu_attribution_top_process_subrole") | Out-Null
            }
        }
    }

    if ((Get-SubroleCount -Counts $counts -Name "bridge_runtime") -lt 1) {
        $issues.Add("missing_bridge_runtime_process") | Out-Null
    }
    if ($RequireDesktopShell -and (Get-SubroleCount -Counts $counts -Name "desktop_shell") -lt 1) {
        $issues.Add("missing_desktop_shell_process") | Out-Null
    }
    if ($RequireWebView2Helper -and (Get-SubroleCount -Counts $counts -Name "webview2_helper") -lt 1) {
        $issues.Add("missing_webview2_helper_process") | Out-Null
    }

    $bridgeRequiredPresent = ($requiredSubroles -and $requiredSubroles.PSObject.Properties["bridge_runtime"] -and [bool]$requiredSubroles.bridge_runtime)
    if (-not $bridgeRequiredPresent) {
        $issues.Add("missing_required_bridge_runtime_subrole") | Out-Null
    }
    if ($RequireDesktopShell) {
        $desktopRequiredPresent = ($requiredSubroles -and $requiredSubroles.PSObject.Properties["desktop_shell"] -and [bool]$requiredSubroles.desktop_shell)
        if (-not $desktopRequiredPresent) {
            $issues.Add("missing_required_desktop_shell_subrole") | Out-Null
        }
    }
    if ($RequireWebView2Helper) {
        $webView2RequiredPresent = ($requiredSubroles -and $requiredSubroles.PSObject.Properties["webview2_helper"] -and [bool]$requiredSubroles.webview2_helper)
        if (-not $webView2RequiredPresent) {
            $issues.Add("missing_required_webview2_helper_subrole") | Out-Null
        }
    }

    return [pscustomobject]@{
        scenario = $Scenario
        ok = ($issues.Count -eq 0)
        issues = @($issues)
        process_counts_by_subrole = $counts
        max_one_core_percent_by_subrole = $maxCpu
        memory_totals_by_subrole_mb = $memory
        required_subroles_present = $requiredSubroles
    }
}

$resolvedReturnZip = (Resolve-Path -LiteralPath $ReturnZipPath).Path
$safeBaseName = [System.IO.Path]::GetFileNameWithoutExtension($resolvedReturnZip) -replace "[^A-Za-z0-9._-]", "_"
$extractRoot = Join-Path $ImportRoot $safeBaseName
if (Test-Path -LiteralPath $extractRoot) {
    $extractRoot = Join-Path $ImportRoot "$safeBaseName-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
}
New-Item -ItemType Directory -Force -Path $extractRoot | Out-Null
Expand-Archive -LiteralPath $resolvedReturnZip -DestinationPath $extractRoot -Force
$extractRoot = (Resolve-Path -LiteralPath $extractRoot).Path

$sourceMsixEvidence = Resolve-LatestJsonBySchema -Root $extractRoot -Schema "musu.msix_install_evidence.v1" -Label "MSIX install evidence"
$sourceHandoff = Resolve-LatestFile -Root $extractRoot -Filter "*.handoff.json" -Label "second-PC handoff"
$sourceMsixLegacyConflicts = Resolve-LatestJsonBySchema -Root $extractRoot -Schema "musu.msix_legacy_conflicts.v1" -Label "MSIX legacy conflict summary" -Optional
$sourceRuntimeIdleCpuEvidence = Resolve-LatestRuntimeIdleReleaseEvidence -Root $extractRoot -Optional
$sourceRuntimeCpuScenarioMatrix = Resolve-LatestJsonBySchema -Root $extractRoot -Schema "musu.runtime_cpu_scenario_matrix.v1" -Label "runtime CPU scenario matrix" -Optional
$sourceRouteReachabilityDiagnostic = Resolve-LatestJsonBySchema -Root $extractRoot -Schema "musu.route_reachability_diagnostic.v1" -Label "route reachability diagnostic" -Optional
$sourceProcessAttributionSummary = Resolve-LatestJsonBySchema -Root $extractRoot -Schema "musu.process_attribution_summary.v1" -Label "process attribution summary" -Optional
$sourceReleaseCheck = Get-ChildItem -LiteralPath $extractRoot -Filter "*.release-check.json" -File -Recurse -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTimeUtc -Descending |
    Select-Object -First 1

$canonicalMsixEvidence = Copy-IntoRoot -SourcePath $sourceMsixEvidence -TargetRoot (Join-Path $repoRoot ".local-build\msix-install")
$canonicalHandoff = Copy-IntoRoot -SourcePath $sourceHandoff -TargetRoot (Join-Path $repoRoot ".local-build\second-pc-handoff")
$canonicalMsixLegacyConflicts = if ($sourceMsixLegacyConflicts) {
    Copy-IntoRoot -SourcePath $sourceMsixLegacyConflicts -TargetRoot (Join-Path $repoRoot ".local-build\msix-legacy-conflicts")
}
else {
    $null
}
$canonicalRuntimeIdleCpuEvidence = if ($sourceRuntimeIdleCpuEvidence) {
    Copy-IntoRoot -SourcePath $sourceRuntimeIdleCpuEvidence -TargetRoot (Join-Path $repoRoot ".local-build\runtime-idle-cpu")
}
else {
    $null
}
$canonicalRuntimeCpuScenarioMatrix = if ($sourceRuntimeCpuScenarioMatrix) {
    Copy-IntoRoot -SourcePath $sourceRuntimeCpuScenarioMatrix -TargetRoot (Join-Path $repoRoot ".local-build\runtime-cpu-scenarios")
}
else {
    $null
}
$canonicalRouteReachabilityDiagnostic = if ($sourceRouteReachabilityDiagnostic) {
    Copy-IntoRoot -SourcePath $sourceRouteReachabilityDiagnostic -TargetRoot (Join-Path $repoRoot ".local-build\route-diagnostics")
}
else {
    $null
}
$canonicalProcessAttributionSummary = if ($sourceProcessAttributionSummary) {
    Copy-IntoRoot -SourcePath $sourceProcessAttributionSummary -TargetRoot (Join-Path $repoRoot ".local-build\process-attribution")
}
else {
    $null
}
$canonicalReleaseCheck = if ($sourceReleaseCheck) {
    Copy-IntoRoot -SourcePath $sourceReleaseCheck.FullName -TargetRoot (Join-Path $repoRoot ".local-build\second-pc-release-check")
}
else {
    $null
}

$handoff = Get-Content -LiteralPath $canonicalHandoff -Raw | ConvertFrom-Json
if ((Get-JsonPropertyString -Object $handoff -Name "schema") -ne "musu.second_pc_handoff.v1") {
    throw "Unexpected handoff schema in ${canonicalHandoff}: $($handoff.schema)"
}
if ((Get-JsonPropertyString -Object $handoff -Name "version") -ne $ExpectedVersion) {
    throw "Handoff version mismatch. Expected $ExpectedVersion, got $($handoff.version)."
}
if (-not [bool]$handoff.ok) {
    throw "Handoff file reports ok=false: $canonicalHandoff"
}
$handoffGitFreshness = New-GitFreshnessSummary -Evidence $handoff -ExpectedGitCommit $currentGitCommit -Label "handoff"

$releaseCheck = $null
$releaseCheckGitFreshness = $null
if ($canonicalReleaseCheck) {
    $releaseCheck = Get-Content -LiteralPath $canonicalReleaseCheck -Raw | ConvertFrom-Json
    if ((Get-JsonPropertyString -Object $releaseCheck -Name "schema") -ne "musu.second_pc_release_check.v1") {
        throw "Unexpected release-check schema in ${canonicalReleaseCheck}: $($releaseCheck.schema)"
    }
    if ((Get-JsonPropertyString -Object $releaseCheck -Name "version") -ne $ExpectedVersion) {
        throw "Release-check version mismatch. Expected $ExpectedVersion, got $($releaseCheck.version)."
    }
    if (-not [bool]$releaseCheck.ok) {
        throw "Release-check file reports ok=false: $canonicalReleaseCheck"
    }
    $releaseCheckGitFreshness = New-GitFreshnessSummary -Evidence $releaseCheck -ExpectedGitCommit $currentGitCommit -Label "release_check"
}

$verifyMsixText = (& powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $scriptDir "verify-msix-install-evidence.ps1") -EvidencePath $canonicalMsixEvidence -ExpectedVersion $ExpectedVersion -Json 2>&1 | Out-String).Trim()
if ($LASTEXITCODE -ne 0) {
    throw "MSIX install evidence from second-PC return did not verify.`n$verifyMsixText"
}
$verifyMsix = $verifyMsixText | ConvertFrom-Json
if (-not [bool]$verifyMsix.ok) {
    throw "MSIX install verifier returned ok=false for $canonicalMsixEvidence"
}

$returnCardText = (& powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $scriptDir "show-second-pc-return-card.ps1") -HandoffPath $canonicalHandoff -MsixInstallEvidencePath $canonicalMsixEvidence -Json 2>&1 | Out-String).Trim()
if ($LASTEXITCODE -ne 0) {
    throw "Unable to build second-PC return card.`n$returnCardText"
}
$returnCard = $returnCardText | ConvertFrom-Json

$routeReachabilityDiagnosticVerification = $null
$routeReachabilityDiagnosticVerificationError = $null
$runtimeIdleCpuVerification = $null
$runtimeIdleCpuVerificationError = $null
$runtimeIdleCpuVerified = $false
$runtimeCpuScenarioMatrixVerification = $null
$runtimeCpuScenarioMatrixVerificationError = $null
$runtimeCpuScenarioMatrixVerified = $false
$processAttributionVerification = $null
$processAttributionVerificationError = $null
$processAttributionVerified = $false
$routeReachabilityTarget = $null
$routeReachabilityDiagnosticVerified = $false
if ($canonicalRouteReachabilityDiagnostic) {
    try {
        $routeReachabilityDiagnosticJson = Get-Content -LiteralPath $canonicalRouteReachabilityDiagnostic -Raw | ConvertFrom-Json
        if ($routeReachabilityDiagnosticJson.PSObject.Properties["route_explain"]) {
            $routeReachabilityTarget = Get-JsonPropertyString -Object $routeReachabilityDiagnosticJson.route_explain -Name "requested_target"
        }
        $routeReachabilityVerifyArgs = @(
            "-NoProfile",
            "-ExecutionPolicy", "Bypass",
            "-File", (Join-Path $scriptDir "verify-route-reachability-diagnostic.ps1"),
            "-EvidencePath", $canonicalRouteReachabilityDiagnostic,
            "-ExpectedVersion", $ExpectedVersion,
            "-RequireNonLocalTarget",
            "-AllowSuccessfulReachability",
            "-Json"
        )
        if (-not [string]::IsNullOrWhiteSpace($routeReachabilityTarget)) {
            $routeReachabilityVerifyArgs += @("-ExpectedTarget", $routeReachabilityTarget)
        }
        $routeReachabilityVerifyOutput = & powershell @routeReachabilityVerifyArgs 2>&1
        $routeReachabilityVerifyText = ($routeReachabilityVerifyOutput | Out-String).Trim()
        if ($LASTEXITCODE -ne 0) {
            $routeReachabilityDiagnosticVerificationError = "Route reachability diagnostic did not verify.`n$routeReachabilityVerifyText"
        }
        elseif (-not [string]::IsNullOrWhiteSpace($routeReachabilityVerifyText)) {
            $routeReachabilityDiagnosticVerification = $routeReachabilityVerifyText | ConvertFrom-Json
            $routeReachabilityDiagnosticVerified = [bool]$routeReachabilityDiagnosticVerification.ok
        }
    }
    catch {
        $routeReachabilityDiagnosticVerificationError = $_.Exception.Message
    }
}

$recordMsixResult = $null
if ($RecordMsixInstall) {
    $recordText = (& powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $scriptDir "record-msix-install-evidence.ps1") -EvidencePath $canonicalMsixEvidence -Version $ExpectedVersion -Json 2>&1 | Out-String).Trim()
    if ($LASTEXITCODE -ne 0) {
        throw "Unable to record MSIX install evidence.`n$recordText"
    }
    $recordMsixResult = $recordText | ConvertFrom-Json
}

$releaseGateEvidenceIssues = New-Object System.Collections.Generic.List[string]
$runtimeIdleCpuSubroleSummary = $null
$runtimeCpuScenarioSubroleSummary = @()
$runtimeCpuSubroleContractOk = $false
$routeReachabilityDiagnosticRequired = $false
if (-not $canonicalRuntimeIdleCpuEvidence) {
    $releaseGateEvidenceIssues.Add("missing_runtime_idle_cpu_evidence") | Out-Null
}
else {
    try {
        $runtimeIdleCpuVerifyOutput = & powershell `
            -NoProfile `
            -ExecutionPolicy Bypass `
            -File (Join-Path $scriptDir "write-release-go-no-go.ps1") `
            -VerifyRuntimeIdleCpuEvidencePath $canonicalRuntimeIdleCpuEvidence `
            -Json 2>&1
        $runtimeIdleCpuVerifyText = ($runtimeIdleCpuVerifyOutput | Out-String).Trim()
        if ($LASTEXITCODE -ne 0) {
            $runtimeIdleCpuVerificationError = "Runtime idle CPU evidence did not verify.`n$runtimeIdleCpuVerifyText"
        }
        elseif (-not [string]::IsNullOrWhiteSpace($runtimeIdleCpuVerifyText)) {
            $runtimeIdleCpuVerification = $runtimeIdleCpuVerifyText | ConvertFrom-Json
            $runtimeIdleCpuVerified = [bool]$runtimeIdleCpuVerification.ok
        }

        $runtimeIdleCpuJson = Get-Content -LiteralPath $canonicalRuntimeIdleCpuEvidence -Raw | ConvertFrom-Json
        $runtimeIdleCpuSubroleSummary = New-CpuSubroleSummary -Measurement $runtimeIdleCpuJson -Scenario "desktop-open" -RequireDesktopShell -RequireWebView2Helper
        if (-not [bool]$runtimeIdleCpuSubroleSummary.ok) {
            $releaseGateEvidenceIssues.Add("runtime_idle_cpu_subrole_contract_failed:$(@($runtimeIdleCpuSubroleSummary.issues) -join ',')") | Out-Null
        }
    }
    catch {
        $releaseGateEvidenceIssues.Add("runtime_idle_cpu_subrole_contract_unreadable:$($_.Exception.Message)") | Out-Null
    }
}
if (-not $canonicalRuntimeCpuScenarioMatrix) {
    $releaseGateEvidenceIssues.Add("missing_runtime_cpu_scenario_matrix") | Out-Null
}
else {
    try {
        $runtimeCpuScenarioJson = Get-Content -LiteralPath $canonicalRuntimeCpuScenarioMatrix -Raw | ConvertFrom-Json
        $runtimeCpuScenarioVerifyArgs = @(
            "-NoProfile",
            "-ExecutionPolicy", "Bypass",
            "-File", (Join-Path $scriptDir "verify-runtime-cpu-scenario-matrix.ps1"),
            "-EvidencePath", $canonicalRuntimeCpuScenarioMatrix,
            "-ExpectedVersion", $ExpectedVersion,
            "-RequiredScenarios", "startup-open,runtime-started,dashboard-open,desktop-open,post-route",
            "-MinSampleSeconds", "60",
            "-MaxOneCorePercent", "5",
            "-RequirePostRouteProbe",
            "-Json"
        )
        $runtimeCpuRouteTarget = if ($releaseCheck -and $releaseCheck.PSObject.Properties["runtime_cpu_route_target"]) { Get-JsonPropertyString -Object $releaseCheck -Name "runtime_cpu_route_target" } else { "" }
        if (-not [string]::IsNullOrWhiteSpace($runtimeCpuRouteTarget)) {
            $runtimeCpuScenarioVerifyArgs += "-RequirePostRouteTarget"
            $runtimeCpuScenarioVerifyArgs += @("-ExpectedPostRouteTarget", $runtimeCpuRouteTarget)
            $runtimeCpuScenarioVerifyArgs += "-RejectSelfPostRouteTarget"
            $runtimeCpuScenarioVerifyArgs += "-RejectLocalPostRouteTarget"
        }
        if ($releaseCheck -and $releaseCheck.PSObject.Properties["runtime_cpu_route_probe_failure_allowed"] -and [bool]$releaseCheck.runtime_cpu_route_probe_failure_allowed) {
            $runtimeCpuScenarioVerifyArgs += "-AllowFailedPostRouteProbe"
        }
        $runtimeCpuScenarioVerifyOutput = & powershell @runtimeCpuScenarioVerifyArgs 2>&1
        $runtimeCpuScenarioVerifyText = ($runtimeCpuScenarioVerifyOutput | Out-String).Trim()
        if ($LASTEXITCODE -ne 0) {
            $runtimeCpuScenarioMatrixVerificationError = "Runtime CPU scenario matrix did not verify.`n$runtimeCpuScenarioVerifyText"
        }
        elseif (-not [string]::IsNullOrWhiteSpace($runtimeCpuScenarioVerifyText)) {
            $runtimeCpuScenarioMatrixVerification = $runtimeCpuScenarioVerifyText | ConvertFrom-Json
            $runtimeCpuScenarioMatrixVerified = [bool]$runtimeCpuScenarioMatrixVerification.ok
        }

        if (-not $runtimeCpuScenarioJson.PSObject.Properties["scenarios"] -or @($runtimeCpuScenarioJson.scenarios).Count -eq 0) {
            $releaseGateEvidenceIssues.Add("runtime_cpu_scenario_matrix_subrole_contract_missing_scenarios") | Out-Null
        }
        else {
            $runtimeCpuScenarioSubroleSummary = @($runtimeCpuScenarioJson.scenarios | ForEach-Object {
                $scenarioName = [string]$_.scenario
                $requiresDesktop = ($scenarioName -eq "startup-open" -or $scenarioName -eq "desktop-open")
                $requiresWebView2 = ($scenarioName -eq "desktop-open")
                New-CpuSubroleSummary `
                    -Measurement $_.measurement `
                    -Scenario $scenarioName `
                    -RequireDesktopShell:$requiresDesktop `
                    -RequireWebView2Helper:$requiresWebView2
            })
            foreach ($summary in @($runtimeCpuScenarioSubroleSummary | Where-Object { -not [bool]$_.ok })) {
                $releaseGateEvidenceIssues.Add("runtime_cpu_scenario_subrole_contract_failed:$($summary.scenario):$(@($summary.issues) -join ',')") | Out-Null
            }
        }
    }
    catch {
        $releaseGateEvidenceIssues.Add("runtime_cpu_scenario_subrole_contract_unreadable:$($_.Exception.Message)") | Out-Null
    }
}
if ($canonicalProcessAttributionSummary) {
    try {
        $processAttributionVerifyArgs = @(
            "-NoProfile",
            "-ExecutionPolicy", "Bypass",
            "-File", (Join-Path $scriptDir "verify-process-attribution-summary.ps1"),
            "-EvidencePath", $canonicalProcessAttributionSummary,
            "-Json"
        )
        $processAttributionVerifyOutput = & powershell @processAttributionVerifyArgs 2>&1
        $processAttributionVerifyText = ($processAttributionVerifyOutput | Out-String).Trim()
        if ($LASTEXITCODE -ne 0) {
            $processAttributionVerificationError = "Process attribution summary did not verify.`n$processAttributionVerifyText"
        }
        elseif (-not [string]::IsNullOrWhiteSpace($processAttributionVerifyText)) {
            $processAttributionVerification = $processAttributionVerifyText | ConvertFrom-Json
            $processAttributionVerified = [bool]$processAttributionVerification.ok
        }
    }
    catch {
        $processAttributionVerificationError = $_.Exception.Message
    }
}
if (-not $canonicalProcessAttributionSummary) {
    $releaseGateEvidenceIssues.Add("missing_process_attribution_summary") | Out-Null
}
if (-not $canonicalReleaseCheck) {
    $releaseGateEvidenceIssues.Add("missing_second_pc_release_check") | Out-Null
}
else {
    if (-not $releaseCheck.PSObject.Properties["runtime_idle_cpu_ok"]) {
        $releaseGateEvidenceIssues.Add("release_check_runtime_idle_cpu_ok_missing") | Out-Null
    }
    elseif (-not [bool]$releaseCheck.runtime_idle_cpu_ok) {
        $releaseGateEvidenceIssues.Add("release_check_runtime_idle_cpu_not_ok") | Out-Null
    }
    if (-not $releaseCheck.PSObject.Properties["runtime_idle_cpu_verified"]) {
        $releaseGateEvidenceIssues.Add("release_check_runtime_idle_cpu_verified_missing") | Out-Null
    }
    elseif (-not [bool]$releaseCheck.runtime_idle_cpu_verified) {
        $releaseGateEvidenceIssues.Add("release_check_runtime_idle_cpu_not_verified") | Out-Null
    }
    if (-not $releaseCheck.PSObject.Properties["runtime_cpu_scenario_matrix_verified"]) {
        $releaseGateEvidenceIssues.Add("release_check_runtime_cpu_scenario_matrix_verified_missing") | Out-Null
    }
    elseif (-not [bool]$releaseCheck.runtime_cpu_scenario_matrix_verified) {
        $releaseGateEvidenceIssues.Add("release_check_runtime_cpu_scenario_matrix_not_verified") | Out-Null
    }
    if (-not $releaseCheck.PSObject.Properties["process_attribution_ok"]) {
        $releaseGateEvidenceIssues.Add("release_check_process_attribution_ok_missing") | Out-Null
    }
    elseif (-not [bool]$releaseCheck.process_attribution_ok) {
        $releaseGateEvidenceIssues.Add("release_check_process_attribution_not_ok") | Out-Null
    }
    if (-not $releaseCheck.PSObject.Properties["process_attribution_verified"]) {
        $releaseGateEvidenceIssues.Add("release_check_process_attribution_verified_missing") | Out-Null
    }
    elseif (-not [bool]$releaseCheck.process_attribution_verified) {
        $releaseGateEvidenceIssues.Add("release_check_process_attribution_not_verified") | Out-Null
    }
    if (-not $releaseCheck.PSObject.Properties["runtime_cpu_subrole_contract_ok"]) {
        $releaseGateEvidenceIssues.Add("release_check_runtime_cpu_subrole_contract_ok_missing") | Out-Null
    }
    elseif (-not [bool]$releaseCheck.runtime_cpu_subrole_contract_ok) {
        $releaseGateEvidenceIssues.Add("release_check_runtime_cpu_subrole_contract_not_ok") | Out-Null
    }
    if (-not $releaseCheck.PSObject.Properties["return_zip_ok"]) {
        $releaseGateEvidenceIssues.Add("release_check_return_zip_ok_missing") | Out-Null
    }
    elseif (-not [bool]$releaseCheck.return_zip_ok) {
        $releaseGateEvidenceIssues.Add("release_check_return_zip_not_ok") | Out-Null
    }
    if (-not $releaseCheckGitFreshness.git_commit_present) {
        $releaseGateEvidenceIssues.Add("release_check_git_commit_missing") | Out-Null
    }
    elseif (-not $releaseCheckGitFreshness.git_commit_valid) {
        $releaseGateEvidenceIssues.Add("release_check_git_commit_invalid") | Out-Null
    }
    elseif (-not [bool]$releaseCheckGitFreshness.ok) {
        $releaseGateEvidenceIssues.Add("release_check_git_commit_not_current") | Out-Null
    }
    if (-not $releaseCheckGitFreshness.git_dirty_present) {
        $releaseGateEvidenceIssues.Add("release_check_git_dirty_missing") | Out-Null
    }
    elseif ([bool]$releaseCheckGitFreshness.git_dirty) {
        $releaseGateEvidenceIssues.Add("release_check_git_dirty_true") | Out-Null
    }
    if ($releaseCheck.PSObject.Properties["route_reachability_diagnostic_required"] -and [bool]$releaseCheck.route_reachability_diagnostic_required) {
        $routeReachabilityDiagnosticRequired = $true
        if (-not $releaseCheck.PSObject.Properties["route_reachability_diagnostic_verified"]) {
            $releaseGateEvidenceIssues.Add("release_check_route_reachability_diagnostic_verified_missing") | Out-Null
        }
        elseif (-not [bool]$releaseCheck.route_reachability_diagnostic_verified) {
            $releaseGateEvidenceIssues.Add("release_check_route_reachability_diagnostic_not_verified") | Out-Null
        }
    }
}
if (-not $handoffGitFreshness.git_commit_present) {
    $releaseGateEvidenceIssues.Add("handoff_git_commit_missing") | Out-Null
}
elseif (-not $handoffGitFreshness.git_commit_valid) {
    $releaseGateEvidenceIssues.Add("handoff_git_commit_invalid") | Out-Null
}
elseif (-not [bool]$handoffGitFreshness.ok) {
    $releaseGateEvidenceIssues.Add("handoff_git_commit_not_current") | Out-Null
}
if (-not $handoffGitFreshness.git_dirty_present) {
    $releaseGateEvidenceIssues.Add("handoff_git_dirty_missing") | Out-Null
}
elseif ([bool]$handoffGitFreshness.git_dirty) {
    $releaseGateEvidenceIssues.Add("handoff_git_dirty_true") | Out-Null
}
if ($releaseCheckGitFreshness -and $releaseCheckGitFreshness.git_commit_present -and $handoffGitFreshness.git_commit_present -and $releaseCheckGitFreshness.git_commit -ne $handoffGitFreshness.git_commit) {
    $releaseGateEvidenceIssues.Add("handoff_release_check_git_commit_mismatch") | Out-Null
}
if ($canonicalRuntimeIdleCpuEvidence) {
    if (-not $runtimeIdleCpuVerified) {
        $releaseGateEvidenceIssues.Add("runtime_idle_cpu_evidence_not_verified") | Out-Null
    }
    if ($runtimeIdleCpuVerificationError) {
        $releaseGateEvidenceIssues.Add("runtime_idle_cpu_verification_error:$runtimeIdleCpuVerificationError") | Out-Null
    }
}
if ($canonicalRuntimeCpuScenarioMatrix) {
    if (-not $runtimeCpuScenarioMatrixVerified) {
        $releaseGateEvidenceIssues.Add("runtime_cpu_scenario_matrix_evidence_not_verified") | Out-Null
    }
    if ($runtimeCpuScenarioMatrixVerificationError) {
        $releaseGateEvidenceIssues.Add("runtime_cpu_scenario_matrix_verification_error:$runtimeCpuScenarioMatrixVerificationError") | Out-Null
    }
}
if ($canonicalProcessAttributionSummary) {
    if (-not $processAttributionVerified) {
        $releaseGateEvidenceIssues.Add("process_attribution_summary_not_verified") | Out-Null
    }
    if ($processAttributionVerificationError) {
        $releaseGateEvidenceIssues.Add("process_attribution_summary_verification_error:$processAttributionVerificationError") | Out-Null
    }
}
if ($routeReachabilityDiagnosticRequired) {
    if (-not $canonicalRouteReachabilityDiagnostic) {
        $releaseGateEvidenceIssues.Add("missing_route_reachability_diagnostic") | Out-Null
    }
    elseif (-not $routeReachabilityDiagnosticVerified) {
        $releaseGateEvidenceIssues.Add("route_reachability_diagnostic_not_verified") | Out-Null
    }
    if ($routeReachabilityDiagnosticVerificationError) {
        $releaseGateEvidenceIssues.Add("route_reachability_diagnostic_verification_error:$routeReachabilityDiagnosticVerificationError") | Out-Null
    }
}
$runtimeCpuSubroleContractOk = (
    ($runtimeIdleCpuSubroleSummary -and [bool]$runtimeIdleCpuSubroleSummary.ok) -and
    ($runtimeCpuScenarioSubroleSummary.Count -gt 0 -and @($runtimeCpuScenarioSubroleSummary | Where-Object { -not [bool]$_.ok }).Count -eq 0)
)
$releaseGateEvidenceOk = ($releaseGateEvidenceIssues.Count -eq 0)

$result = [pscustomobject]@{
    schema = "musu.second_pc_return_import.v1"
    ok = (-not $RequireReleaseGateEvidence -or $releaseGateEvidenceOk)
    version = $ExpectedVersion
    imported_at = (Get-Date).ToString("o")
    return_zip_path = $resolvedReturnZip
    extract_root = $extractRoot
    msix_install_evidence_path = $canonicalMsixEvidence
    handoff_path = $canonicalHandoff
    msix_legacy_conflicts_path = $canonicalMsixLegacyConflicts
    runtime_idle_cpu_evidence_path = $canonicalRuntimeIdleCpuEvidence
    runtime_idle_cpu_verified = [bool]$runtimeIdleCpuVerified
    runtime_idle_cpu_verification = $runtimeIdleCpuVerification
    runtime_idle_cpu_verification_error = $runtimeIdleCpuVerificationError
    runtime_cpu_scenario_matrix_path = $canonicalRuntimeCpuScenarioMatrix
    runtime_cpu_scenario_matrix_verified = [bool]$runtimeCpuScenarioMatrixVerified
    runtime_cpu_scenario_matrix_verification = $runtimeCpuScenarioMatrixVerification
    runtime_cpu_scenario_matrix_verification_error = $runtimeCpuScenarioMatrixVerificationError
    runtime_idle_cpu_subrole_summary = $runtimeIdleCpuSubroleSummary
    runtime_cpu_scenario_subrole_summary = $runtimeCpuScenarioSubroleSummary
    runtime_cpu_subrole_contract_ok = [bool]$runtimeCpuSubroleContractOk
    route_reachability_diagnostic_path = $canonicalRouteReachabilityDiagnostic
    route_reachability_target = $routeReachabilityTarget
    route_reachability_diagnostic_required = [bool]$routeReachabilityDiagnosticRequired
    route_reachability_diagnostic_verified = [bool]$routeReachabilityDiagnosticVerified
    route_reachability_diagnostic_verification = $routeReachabilityDiagnosticVerification
    route_reachability_diagnostic_verification_error = $routeReachabilityDiagnosticVerificationError
    process_attribution_summary_path = $canonicalProcessAttributionSummary
    process_attribution_verified = [bool]$processAttributionVerified
    process_attribution_verification = $processAttributionVerification
    process_attribution_verification_error = $processAttributionVerificationError
    release_check_path = $canonicalReleaseCheck
    release_check_git_freshness = $releaseCheckGitFreshness
    handoff_git_freshness = $handoffGitFreshness
    remote_name = [string]$returnCard.remote_name
    remote_addr = [string]$returnCard.remote_addr
    suggested_remote_addrs = $returnCard.suggested_remote_addrs
    msix_install_verification = $verifyMsix
    msix_install_recorded = ($null -ne $recordMsixResult)
    msix_install_record = $recordMsixResult
    release_gate_evidence_required = [bool]$RequireReleaseGateEvidence
    release_gate_evidence_ok = [bool]$releaseGateEvidenceOk
    release_gate_evidence_issues = @($releaseGateEvidenceIssues)
    commands = $returnCard.commands
}

if ($Json) {
    $result | ConvertTo-Json -Depth 10
}
else {
    "MUSU second-PC return import"
    "ok: $($result.ok)"
    "return_zip: $($result.return_zip_path)"
    "msix_install_evidence: $($result.msix_install_evidence_path)"
    "handoff: $($result.handoff_path)"
    "msix_legacy_conflicts: $(if ($result.msix_legacy_conflicts_path) { $result.msix_legacy_conflicts_path } else { '<not present>' })"
    "runtime_idle_cpu_evidence: $(if ($result.runtime_idle_cpu_evidence_path) { $result.runtime_idle_cpu_evidence_path } else { '<not present>' })"
    "runtime_cpu_scenario_matrix: $(if ($result.runtime_cpu_scenario_matrix_path) { $result.runtime_cpu_scenario_matrix_path } else { '<not present>' })"
    "runtime_cpu_subrole_contract_ok: $($result.runtime_cpu_subrole_contract_ok)"
    "route_reachability_diagnostic: $(if ($result.route_reachability_diagnostic_path) { $result.route_reachability_diagnostic_path } else { '<not present>' })"
    "route_reachability_diagnostic_verified: $($result.route_reachability_diagnostic_verified)"
    if ($result.runtime_idle_cpu_subrole_summary) {
        $counts = $result.runtime_idle_cpu_subrole_summary.process_counts_by_subrole
        "runtime_idle_cpu_subroles: bridge_runtime=$(Get-SubroleCount -Counts $counts -Name 'bridge_runtime'), desktop_shell=$(Get-SubroleCount -Counts $counts -Name 'desktop_shell'), webview2_helper=$(Get-SubroleCount -Counts $counts -Name 'webview2_helper')"
    }
    foreach ($summary in @($result.runtime_cpu_scenario_subrole_summary)) {
        $counts = $summary.process_counts_by_subrole
        "runtime_cpu_scenario_subroles[$($summary.scenario)]: ok=$($summary.ok), bridge_runtime=$(Get-SubroleCount -Counts $counts -Name 'bridge_runtime'), desktop_shell=$(Get-SubroleCount -Counts $counts -Name 'desktop_shell'), webview2_helper=$(Get-SubroleCount -Counts $counts -Name 'webview2_helper')"
    }
    "process_attribution_summary: $(if ($result.process_attribution_summary_path) { $result.process_attribution_summary_path } else { '<not present>' })"
    "process_attribution_verified: $($result.process_attribution_verified)"
    "release_check: $(if ($result.release_check_path) { $result.release_check_path } else { '<not present>' })"
    "remote_name: $($result.remote_name)"
    "remote_addr: $($result.remote_addr)"
    "msix_install_recorded: $($result.msix_install_recorded)"
    ""
    "Primary repo commands"
    $result.commands.PSObject.Properties | ForEach-Object {
        "[$($_.Name)] $($_.Value)"
    }
    if ($result.release_gate_evidence_issues.Count -gt 0) {
        ""
        "release_gate_evidence_issues:"
        foreach ($issue in @($result.release_gate_evidence_issues)) {
            "  - $issue"
        }
    }
}

if ($RequireReleaseGateEvidence -and -not $releaseGateEvidenceOk) {
    exit 1
}
