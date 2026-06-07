[CmdletBinding()]
param(
    [string]$ReturnZipPath,
    [string]$HandoffPath,
    [string]$MsixInstallEvidencePath,
    [string]$RemoteAddr,
    [string]$RemoteName,
    [string]$ExpectedRouteOutput = "MUSU_REMOTE_ROUTE_OK",
    [switch]$Json
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
. (Join-Path $scriptDir "msix-common.ps1")
$repoRoot = Get-WindowsRepoRoot $MyInvocation.MyCommand.Path
$version = (Get-Content -LiteralPath (Join-Path $repoRoot "VERSION") -Raw).Trim()
$currentGitState = Get-MusuSourceGitState -RepoRoot $repoRoot
$currentGitCommit = [string]$currentGitState.commit
$extractedReturnRoot = $null

function Resolve-LatestFile {
    param(
        [Parameter(Mandatory = $true)][string]$Root,
        [Parameter(Mandatory = $true)][string]$Filter,
        [Parameter(Mandatory = $true)][string]$Label,
        [switch]$Recurse
    )

    if (-not (Test-Path -LiteralPath $Root)) {
        throw "$Label directory not found: $Root"
    }

    $childItemSplat = @{
        LiteralPath = $Root
        Filter = $Filter
        File = $true
        ErrorAction = "SilentlyContinue"
    }
    if ($Recurse) {
        $childItemSplat["Recurse"] = $true
    }
    $file = Get-ChildItem @childItemSplat |
        Sort-Object LastWriteTimeUtc -Descending |
        Select-Object -First 1
    if (-not $file) {
        throw "$Label file not found under $Root matching $Filter"
    }
    return $file.FullName
}

function ConvertTo-RepoRelativeDisplayPath {
    param([Parameter(Mandatory = $true)][string]$Path)

    $resolved = (Resolve-Path -LiteralPath $Path).Path
    $rootWithSlash = $repoRoot.TrimEnd("\") + "\"
    if ($resolved.StartsWith($rootWithSlash, [System.StringComparison]::OrdinalIgnoreCase)) {
        return $resolved.Substring($rootWithSlash.Length)
    }
    return $resolved
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

    $testOnlyPathPatterns = @("*.test.ts", "*.test.tsx", "*.spec.ts", "*.spec.tsx")
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
        $allowed = @('^\+\s*- name: P2P control-plane tests\s*$', '^\+\s*run: npm run test:p2p\s*$', '^\+\s*$')
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

if (-not [string]::IsNullOrWhiteSpace($ReturnZipPath)) {
    if (-not (Test-Path -LiteralPath $ReturnZipPath)) {
        throw "Return zip not found: $ReturnZipPath"
    }
    $resolvedReturnZip = (Resolve-Path -LiteralPath $ReturnZipPath).Path
    $zipBase = [System.IO.Path]::GetFileNameWithoutExtension($resolvedReturnZip) -replace "[^A-Za-z0-9._-]", "_"
    $extractRoot = Join-Path $repoRoot ".local-build\second-pc-return\extracted\$zipBase"
    if (Test-Path -LiteralPath $extractRoot) {
        $extractRoot = Join-Path $repoRoot ".local-build\second-pc-return\extracted\$zipBase-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
    }
    New-Item -ItemType Directory -Force -Path $extractRoot | Out-Null
    Expand-Archive -LiteralPath $resolvedReturnZip -DestinationPath $extractRoot -Force
    $extractedReturnRoot = (Resolve-Path -LiteralPath $extractRoot).Path

    if ([string]::IsNullOrWhiteSpace($HandoffPath)) {
        $HandoffPath = Resolve-LatestFile -Root $extractedReturnRoot -Filter "*.handoff.json" -Label "second-PC handoff from return zip" -Recurse
    }
    if ([string]::IsNullOrWhiteSpace($MsixInstallEvidencePath)) {
        $MsixInstallEvidencePath = Resolve-LatestFile -Root $extractedReturnRoot -Filter "*.evidence.json" -Label "MSIX install evidence from return zip" -Recurse
    }
}

if ([string]::IsNullOrWhiteSpace($HandoffPath)) {
    $HandoffPath = Resolve-LatestFile `
        -Root (Join-Path $repoRoot ".local-build\second-pc-handoff") `
        -Filter "*.handoff.json" `
        -Label "second-PC handoff"
}
if (-not (Test-Path -LiteralPath $HandoffPath)) {
    throw "Handoff file not found: $HandoffPath"
}
$HandoffPath = (Resolve-Path -LiteralPath $HandoffPath).Path
$handoff = Get-Content -LiteralPath $HandoffPath -Raw | ConvertFrom-Json
$releaseCheckPath = $null
$releaseCheck = $null
$warnings = New-Object System.Collections.Generic.List[string]
$routeReachabilityDiagnosticRequired = $null
$routeReachabilityDiagnosticVerified = $null
$routeReachabilityTarget = $null

if ([string]$handoff.schema -ne "musu.second_pc_handoff.v1") {
    throw "Unexpected handoff schema in ${HandoffPath}: $($handoff.schema)"
}
if ([string]$handoff.version -ne $version) {
    throw "Handoff version mismatch. Expected $version, got $($handoff.version)."
}
if (-not [bool]$handoff.ok) {
    throw "Handoff file reports ok=false: $HandoffPath"
}

if ($extractedReturnRoot) {
    try {
        $releaseCheckPath = Resolve-LatestFile -Root $extractedReturnRoot -Filter "*.release-check.json" -Label "second-PC release check from return zip" -Recurse
    }
    catch {
        $warnings.Add($_.Exception.Message) | Out-Null
    }
}
if (-not [string]::IsNullOrWhiteSpace($releaseCheckPath) -and (Test-Path -LiteralPath $releaseCheckPath)) {
    $releaseCheckPath = (Resolve-Path -LiteralPath $releaseCheckPath).Path
    $releaseCheck = Get-Content -LiteralPath $releaseCheckPath -Raw | ConvertFrom-Json
    $routeReachabilityDiagnosticRequired = if ($releaseCheck.PSObject.Properties["route_reachability_diagnostic_required"]) { [bool]$releaseCheck.route_reachability_diagnostic_required } else { $null }
    $routeReachabilityDiagnosticVerified = if ($releaseCheck.PSObject.Properties["route_reachability_diagnostic_verified"] -and $null -ne $releaseCheck.route_reachability_diagnostic_verified) { [bool]$releaseCheck.route_reachability_diagnostic_verified } else { $null }
    $routeReachabilityTarget = if ($releaseCheck.PSObject.Properties["route_reachability_target"]) { [string]$releaseCheck.route_reachability_target } else { "" }
}

$handoffGitFreshness = if ($currentGitCommit -match "^[0-9a-f]{40}$") {
    New-GitFreshnessSummary -Evidence $handoff -ExpectedGitCommit $currentGitCommit -Label "handoff"
}
else {
    $warnings.Add("Current repo git commit is unavailable; second-PC handoff freshness could not be evaluated.") | Out-Null
    $null
}
$releaseCheckGitFreshness = if ($releaseCheck -and $currentGitCommit -match "^[0-9a-f]{40}$") {
    New-GitFreshnessSummary -Evidence $releaseCheck -ExpectedGitCommit $currentGitCommit -Label "release_check"
}
else {
    $null
}
if (-not $releaseCheck -and $extractedReturnRoot) {
    $warnings.Add("Returned zip does not include second-PC release-check JSON; use handoff-only route preflight for diagnosis, not release evidence.") | Out-Null
}
$routePreflightReady = [bool](
    ($handoffGitFreshness -and [bool]$handoffGitFreshness.ok) -and
    (($null -eq $releaseCheckGitFreshness) -or [bool]$releaseCheckGitFreshness.ok) -and
    (($routeReachabilityDiagnosticRequired -ne $true) -or ($routeReachabilityDiagnosticVerified -eq $true -and -not [string]::IsNullOrWhiteSpace($routeReachabilityTarget))) -and
    (-not ($handoffGitFreshness -and $releaseCheckGitFreshness) -or ([string]$handoffGitFreshness.git_commit -eq [string]$releaseCheckGitFreshness.git_commit))
)
if ($handoffGitFreshness -and -not [bool]$handoffGitFreshness.ok) {
    $warnings.Add("Second-PC handoff is stale, invalid, missing git metadata, or was captured from a dirty second-PC state.") | Out-Null
}
if ($releaseCheckGitFreshness -and -not [bool]$releaseCheckGitFreshness.ok) {
    $warnings.Add("Second-PC release-check is stale, invalid, missing git metadata, or was captured from a dirty second-PC state.") | Out-Null
}
if ($handoffGitFreshness -and $releaseCheckGitFreshness -and ([string]$handoffGitFreshness.git_commit -ne [string]$releaseCheckGitFreshness.git_commit)) {
    $warnings.Add("Second-PC handoff and release-check were captured from different source commits.") | Out-Null
}
if ($routeReachabilityDiagnosticRequired -eq $true -and [string]::IsNullOrWhiteSpace($routeReachabilityTarget)) {
    $warnings.Add("Second-PC release-check requires route reachability evidence but does not record the target.") | Out-Null
}
if ($routeReachabilityDiagnosticRequired -eq $true -and $routeReachabilityDiagnosticVerified -ne $true) {
    $warnings.Add("Second-PC release-check route reachability diagnostic is missing or failed verification.") | Out-Null
}

$candidateAddrs = @($handoff.suggested_remote_addrs | ForEach-Object { [string]$_ } | Where-Object {
    -not [string]::IsNullOrWhiteSpace($_)
})
if ($candidateAddrs.Count -eq 0) {
    throw "Handoff file does not include suggested_remote_addrs."
}

if ([string]::IsNullOrWhiteSpace($RemoteAddr)) {
    $RemoteAddr = $candidateAddrs[0]
}
if ($RemoteAddr -notmatch "^[^:]+:\d+$") {
    throw "RemoteAddr must be host:port. Got: $RemoteAddr"
}

if ([string]::IsNullOrWhiteSpace($RemoteName)) {
    $RemoteName = [string]$handoff.remote_name_suggestion
}
if ([string]::IsNullOrWhiteSpace($RemoteName)) {
    $RemoteName = "second-pc"
}

$msixEvidenceFound = $false
if ([string]::IsNullOrWhiteSpace($MsixInstallEvidencePath)) {
    $msixRoot = Join-Path $repoRoot ".local-build\msix-install"
    if (Test-Path -LiteralPath $msixRoot) {
        $candidate = Get-ChildItem -LiteralPath $msixRoot -Filter "*.evidence.json" -File -ErrorAction SilentlyContinue |
            Sort-Object LastWriteTimeUtc -Descending |
            Select-Object -First 1
        if ($candidate) {
            $MsixInstallEvidencePath = $candidate.FullName
            $msixEvidenceFound = $true
        }
    }
}
elseif (Test-Path -LiteralPath $MsixInstallEvidencePath) {
    $MsixInstallEvidencePath = (Resolve-Path -LiteralPath $MsixInstallEvidencePath).Path
    $msixEvidenceFound = $true
}

$msixEvidenceDisplay = if ($msixEvidenceFound) {
    ConvertTo-RepoRelativeDisplayPath -Path $MsixInstallEvidencePath
}
else {
    ".local-build\msix-install\<INSTALL_EVIDENCE_JSON>"
}

$multiDeviceEvidenceDisplay = ".local-build\multi-device\<EVIDENCE_JSON>"

$commands = [pscustomobject]@{
    record_msix_install = "powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\record-msix-install-evidence.ps1 -EvidencePath $msixEvidenceDisplay -Json"
    run_multidevice_smoke = "powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\smoke-multidevice-beta.ps1 -RemoteAddr $RemoteAddr -RemoteName $RemoteName -RouteTarget $RemoteName -ExpectedRouteOutput $ExpectedRouteOutput"
    record_multidevice = "powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\record-multidevice-evidence.ps1 -EvidencePath $multiDeviceEvidenceDisplay -ExpectedRouteOutput $ExpectedRouteOutput -Json"
    show_status = "powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\show-final-release-handoff-status.ps1"
}

$result = [pscustomobject]@{
    schema = "musu.second_pc_return_card.v1"
    generated_at = (Get-Date).ToString("o")
    version = $version
    return_zip_path = if ([string]::IsNullOrWhiteSpace($ReturnZipPath)) { $null } else { (Resolve-Path -LiteralPath $ReturnZipPath).Path }
    return_zip_extract_root = $extractedReturnRoot
    handoff_path = $HandoffPath
    handoff_machine = [string]$handoff.operator_machine
    release_check_path = $releaseCheckPath
    current_git_commit = if ($currentGitCommit -match "^[0-9a-f]{40}$") { $currentGitCommit } else { $null }
    handoff_git_freshness = $handoffGitFreshness
    release_check_git_freshness = $releaseCheckGitFreshness
    route_preflight_ready = [bool]$routePreflightReady
    route_reachability_diagnostic_required = $routeReachabilityDiagnosticRequired
    route_reachability_diagnostic_verified = $routeReachabilityDiagnosticVerified
    route_reachability_target = if ([string]::IsNullOrWhiteSpace($routeReachabilityTarget)) { $null } else { $routeReachabilityTarget }
    remote_name = $RemoteName
    remote_addr = $RemoteAddr
    suggested_remote_addrs = $candidateAddrs
    msix_install_evidence_path = if ($msixEvidenceFound) { $MsixInstallEvidencePath } else { $null }
    commands = $commands
    warnings = $warnings.ToArray()
}

if ($Json) {
    $result | ConvertTo-Json -Depth 8
}
else {
    "MUSU second-PC return card"
    "version: $($result.version)"
    "return_zip: $(if ($result.return_zip_path) { $result.return_zip_path } else { '<not used>' })"
    "return_zip_extract_root: $(if ($result.return_zip_extract_root) { $result.return_zip_extract_root } else { '<not used>' })"
    "handoff: $($result.handoff_path)"
    "handoff_machine: $($result.handoff_machine)"
    "release_check: $(if ($result.release_check_path) { $result.release_check_path } else { '<not found>' })"
    "route_preflight_ready: $($result.route_preflight_ready)"
    "remote_name: $($result.remote_name)"
    "remote_addr: $($result.remote_addr)"
    "msix_install_evidence: $(if ($msixEvidenceFound) { $result.msix_install_evidence_path } else { '<not found; use returned .local-build\msix-install\*.evidence.json>' })"
    if ($result.handoff_git_freshness) {
        "handoff_git_freshness_ok: $($result.handoff_git_freshness.ok)"
    }
    if ($result.release_check_git_freshness) {
        "release_check_git_freshness_ok: $($result.release_check_git_freshness.ok)"
    }
    if ($null -ne $result.route_reachability_diagnostic_required) {
        "route_reachability_diagnostic_required: $($result.route_reachability_diagnostic_required)"
    }
    if ($null -ne $result.route_reachability_diagnostic_verified) {
        "route_reachability_diagnostic_verified: $($result.route_reachability_diagnostic_verified)"
    }
    if ($result.route_reachability_target) {
        "route_reachability_target: $($result.route_reachability_target)"
    }
    ""
    "Candidate RemoteAddr values"
    $candidateAddrs | ForEach-Object { "- $_" }
    if (@($result.warnings).Count -gt 0) {
        ""
        "Warnings"
        $result.warnings | ForEach-Object { "- $_" }
    }
    ""
    "Primary repo commands"
    $result.commands.PSObject.Properties | ForEach-Object {
        "[$($_.Name)] $($_.Value)"
    }
}
