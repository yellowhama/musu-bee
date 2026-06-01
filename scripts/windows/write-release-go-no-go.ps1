[CmdletBinding()]
param(
    [string]$PublicMetadataBaseUrl = "https://musu.pro",
    [int]$MinRuntimeIdleCpuSampleSeconds = 60,
    [double]$MaxRuntimeIdleCpuOneCorePercent = 5.0,
    [int]$MinRuntimeIdleCpuMachineCount = 2,
    [int]$MinRuntimeCpuScenarioMatrixMachineCount = 2,
    [int]$MinProcessOwnershipMachineCount = 1,
    [int]$MinStartupSingleInstanceMachineCount = 1,
    [int]$MinDesktopSingleInstanceMachineCount = 1,
    [string]$RequiredRuntimeIdleCpuScenario = "desktop-open",
    [string[]]$RequiredRuntimeCpuScenarioMatrixScenarios = @("runtime-started", "dashboard-open", "desktop-open", "post-route"),
    [switch]$SkipPublicMetadata,
    [switch]$FailOnNotReady,
    [switch]$Json
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = (Resolve-Path (Join-Path $scriptDir "..\..")).Path
. (Join-Path $scriptDir "release-config.ps1")
$version = (Get-Content -LiteralPath (Join-Path $repoRoot "VERSION") -Raw).Trim()
$supportEmail = Get-MusuReleaseSupportEmail -RepoRoot $repoRoot
$currentGitCommit = (& git -C $repoRoot rev-parse HEAD 2>$null | Out-String).Trim()

function Invoke-JsonScript {
    param(
        [Parameter(Mandatory = $true)][string]$FilePath,
        [string[]]$Arguments = @(),
        [switch]$AllowFailure
    )

    $output = & powershell -NoProfile -ExecutionPolicy Bypass -File $FilePath @Arguments 2>&1
    $exitCode = $LASTEXITCODE
    $text = ($output | Out-String).Trim()
    $parsed = $null
    if (-not [string]::IsNullOrWhiteSpace($text)) {
        try {
            $parsed = $text | ConvertFrom-Json
        }
        catch {
            if (-not $AllowFailure) {
                throw "Script did not return parseable JSON: $FilePath`n$text"
            }
        }
    }

    if ($exitCode -ne 0 -and -not $AllowFailure) {
        throw "Script failed with exit code ${exitCode}: $FilePath`n$text"
    }

    [pscustomobject]@{
        exit_code = $exitCode
        json = $parsed
        raw = $text
    }
}

function Add-Blocker {
    param(
        [System.Collections.Generic.List[object]]$List,
        [Parameter(Mandatory = $true)][string]$Area,
        [Parameter(Mandatory = $true)][string]$Message
    )

    $List.Add([pscustomobject]@{
        area = $Area
        message = $Message
    }) | Out-Null
}

function New-Check {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][string]$Status,
        [Parameter(Mandatory = $true)][string]$Message
    )

    [pscustomobject]@{
        name = $Name
        status = $Status
        message = $Message
    }
}

function Test-ReleaseEvidenceFreshnessAllowedPath {
    param([Parameter(Mandatory = $true)][string]$Path)

    $normalizedPath = $Path.Replace("\", "/")
    if ($normalizedPath -like "docs/*") {
        return $true
    }

    $statusOnlyScripts = @(
        ".github/workflows/deploy-musu-bee.yml",
        "scripts/windows/verify-final-operator-gate-packet.ps1",
        "scripts/windows/verify-runtime-cpu-scenario-matrix.ps1",
        "scripts/windows/verify-single-machine-evidence.ps1",
        "scripts/windows/write-release-go-no-go.ps1",
        "scripts/windows/show-musu-pro-p2p-env-status.ps1"
    )
    return ($statusOnlyScripts -contains $normalizedPath)
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
    $runtimeAffectingPaths = @($changedPaths | Where-Object { -not (Test-ReleaseEvidenceFreshnessAllowedPath -Path ([string]$_)) })
    return ($runtimeAffectingPaths.Count -eq 0)
}

function Test-RuntimeIdleCpuEvidence {
    param(
        [Parameter(Mandatory = $true)][string]$EvidencePath,
        [Parameter(Mandatory = $true)][string]$ExpectedVersion,
        [Parameter(Mandatory = $true)][string]$ExpectedGitCommit,
        [Parameter(Mandatory = $true)][int]$MinSampleSeconds,
        [Parameter(Mandatory = $true)][double]$MaxOneCorePercent
    )

    $checks = New-Object System.Collections.Generic.List[object]
    $evidence = $null
    try {
        $evidence = Get-Content -LiteralPath $EvidencePath -Raw | ConvertFrom-Json
        $checks.Add((New-Check -Name "parse" -Status "pass" -Message "runtime idle CPU evidence parses")) | Out-Null
    }
    catch {
        $checks.Add((New-Check -Name "parse" -Status "fail" -Message "runtime idle CPU evidence does not parse: $($_.Exception.Message)")) | Out-Null
    }

    if ($evidence) {
        $schema = [string]$evidence.schema
        $checks.Add((New-Check -Name "schema" -Status ($(if ($schema -eq "musu.runtime_idle_cpu_evidence.v1") { "pass" } else { "fail" })) -Message ($(if ($schema -eq "musu.runtime_idle_cpu_evidence.v1") { "schema is valid" } else { "schema is '$schema'" })))) | Out-Null

        $versionValue = [string]$evidence.version
        $checks.Add((New-Check -Name "version" -Status ($(if ($versionValue -eq $ExpectedVersion) { "pass" } else { "fail" })) -Message ($(if ($versionValue -eq $ExpectedVersion) { "version matches $ExpectedVersion" } else { "version is '$versionValue'" })))) | Out-Null

        $gitCommit = if ($evidence.PSObject.Properties["git_commit"]) { [string]$evidence.git_commit } else { "" }
        $gitCommitValid = ($gitCommit -match "^[0-9a-f]{40}$")
        $checks.Add((New-Check -Name "git commit present" -Status ($(if ($gitCommitValid) { "pass" } else { "fail" })) -Message ($(if ($gitCommitValid) { "git commit is recorded" } else { "git commit is missing or invalid" })))) | Out-Null

        $gitCommitMatchesExpected = ($gitCommit -eq $ExpectedGitCommit)
        $documentationOrStatusOnlyGitDelta = $false
        if (-not $gitCommitMatchesExpected -and $gitCommitValid -and $ExpectedGitCommit -match "^[0-9a-f]{40}$") {
            $documentationOrStatusOnlyGitDelta = Test-DocumentationOrStatusOnlyGitDelta -FromCommit $gitCommit -ToCommit $ExpectedGitCommit
        }
        $checks.Add((New-Check -Name "expected git commit" -Status ($(if ($gitCommitMatchesExpected -or $documentationOrStatusOnlyGitDelta) { "pass" } else { "fail" })) -Message ($(if ($gitCommitMatchesExpected) { "git commit matches current HEAD $ExpectedGitCommit" } elseif ($documentationOrStatusOnlyGitDelta) { "git commit differs from current HEAD $ExpectedGitCommit only by documentation/evidence/status/tooling-only commits" } else { "git commit is '$gitCommit', expected current HEAD '$ExpectedGitCommit' with no runtime-affecting changes after the evidence commit" })))) | Out-Null

        $gitDirty = ($evidence.PSObject.Properties["git_dirty"] -and [bool]$evidence.git_dirty)
        $checks.Add((New-Check -Name "git clean during sample" -Status ($(if (-not $gitDirty -and $evidence.PSObject.Properties["git_dirty"]) { "pass" } else { "fail" })) -Message ($(if (-not $gitDirty -and $evidence.PSObject.Properties["git_dirty"]) { "runtime idle sample was captured from a clean git state" } elseif ($gitDirty) { "runtime idle sample was captured from a dirty git state" } else { "git cleanliness is missing" })))) | Out-Null

        $okValue = [bool]$evidence.ok
        $checks.Add((New-Check -Name "evidence ok" -Status ($(if ($okValue) { "pass" } else { "fail" })) -Message ($(if ($okValue) { "evidence reports ok=true" } else { "evidence reports ok=false" })))) | Out-Null

        $scenario = if ($evidence.PSObject.Properties["scenario"]) { [string]$evidence.scenario } else { "" }
        $checks.Add((New-Check -Name "runtime scenario" -Status ($(if ($scenario -eq $RequiredRuntimeIdleCpuScenario) { "pass" } else { "fail" })) -Message ($(if ($scenario -eq $RequiredRuntimeIdleCpuScenario) { "runtime scenario is $scenario" } else { "runtime scenario is '$scenario', expected '$RequiredRuntimeIdleCpuScenario'" })))) | Out-Null

        $requireOwnedWebView2 = ($evidence.PSObject.Properties["require_owned_webview2"] -and [bool]$evidence.require_owned_webview2)
        $checks.Add((New-Check -Name "owned WebView2 required" -Status ($(if ($requireOwnedWebView2) { "pass" } else { "fail" })) -Message ($(if ($requireOwnedWebView2) { "desktop-open evidence requires owned WebView2" } else { "desktop-open evidence did not set -RequireOwnedWebView2" })))) | Out-Null

        $includeNode = ($evidence.PSObject.Properties["include_node"] -and [bool]$evidence.include_node)
        $checks.Add((New-Check -Name "Node.js budget included" -Status ($(if ($includeNode) { "pass" } else { "fail" })) -Message ($(if ($includeNode) { "evidence includes Node.js helper processes" } else { "evidence did not run with -IncludeNode" })))) | Out-Null

        $includeWebView2 = ($evidence.PSObject.Properties["include_webview2"] -and [bool]$evidence.include_webview2)
        $checks.Add((New-Check -Name "WebView2 budget included" -Status ($(if ($includeWebView2) { "pass" } else { "fail" })) -Message ($(if ($includeWebView2) { "evidence includes WebView2 helper processes" } else { "evidence did not run with -IncludeWebView2" })))) | Out-Null

        $helperScope = if ($evidence.PSObject.Properties["helper_process_scope"]) { [string]$evidence.helper_process_scope } else { "" }
        $helperScopeValid = $helperScope -in @("musu_process_tree_or_repo_related", "all_matching_process_names")
        $checks.Add((New-Check -Name "helper process scope" -Status ($(if ($helperScopeValid) { "pass" } else { "fail" })) -Message ($(if ($helperScopeValid) { "helper process scope is $helperScope" } else { "helper process scope is missing or invalid" })))) | Out-Null

        $includeUnrelatedHelpers = ($evidence.PSObject.Properties["include_unrelated_helpers"] -and [bool]$evidence.include_unrelated_helpers)
        $metadataTimedOut = ($evidence.PSObject.Properties["process_metadata_timed_out"] -and [bool]$evidence.process_metadata_timed_out)
        $checks.Add((New-Check -Name "process metadata timeout" -Status ($(if (-not $metadataTimedOut) { "pass" } else { "fail" })) -Message ($(if (-not $metadataTimedOut) { "process ownership metadata did not time out" } else { "process ownership metadata timed out" })))) | Out-Null

        $metadataAvailable = ($evidence.PSObject.Properties["process_metadata_available"] -and [bool]$evidence.process_metadata_available)
        $needsMetadata = (($includeNode -or $includeWebView2) -and -not $includeUnrelatedHelpers)
        $checks.Add((New-Check -Name "process ownership metadata" -Status ($(if (-not $needsMetadata -or $metadataAvailable) { "pass" } else { "fail" })) -Message ($(if (-not $needsMetadata) { "all matching helper processes were intentionally included" } elseif ($metadataAvailable) { "process ownership metadata is available" } else { "process ownership metadata is missing; helper ownership cannot be proven" })))) | Out-Null

        $operatorMachine = ""
        if ($evidence.PSObject.Properties["operator_machine"]) {
            $operatorMachine = [string]$evidence.operator_machine
        }
        $checks.Add((New-Check -Name "operator machine" -Status ($(if (-not [string]::IsNullOrWhiteSpace($operatorMachine)) { "pass" } else { "fail" })) -Message ($(if (-not [string]::IsNullOrWhiteSpace($operatorMachine)) { "operator_machine is present" } else { "operator_machine is missing" })))) | Out-Null

        $sampleSeconds = [double]$evidence.sample_seconds
        $checks.Add((New-Check -Name "sample duration" -Status ($(if ($sampleSeconds -ge $MinSampleSeconds) { "pass" } else { "fail" })) -Message ($(if ($sampleSeconds -ge $MinSampleSeconds) { "sample duration is at least ${MinSampleSeconds}s" } else { "sample duration is ${sampleSeconds}s, expected at least ${MinSampleSeconds}s" })))) | Out-Null

        $hotCount = [int]$evidence.hot_process_count
        $checks.Add((New-Check -Name "hot process count" -Status ($(if ($hotCount -eq 0) { "pass" } else { "fail" })) -Message ($(if ($hotCount -eq 0) { "no hot processes reported" } else { "$hotCount hot process(es) reported" })))) | Out-Null

        $musuProcessCountAfter = 0
        if ($evidence.PSObject.Properties["musu_process_count_after"]) {
            $musuProcessCountAfter = [int]$evidence.musu_process_count_after
        }
        elseif ($evidence.PSObject.Properties["process_count_after"]) {
            $musuProcessCountAfter = [int]$evidence.process_count_after
        }
        $checks.Add((New-Check -Name "MUSU process running" -Status ($(if ($musuProcessCountAfter -gt 0) { "pass" } else { "fail" })) -Message ($(if ($musuProcessCountAfter -gt 0) { "$musuProcessCountAfter MUSU runtime process(es) were running at the end of the sample" } else { "no MUSU runtime process was running during the sample" })))) | Out-Null

        $sampleCount = @($evidence.samples).Count
        $checks.Add((New-Check -Name "cpu samples present" -Status ($(if ($sampleCount -gt 0) { "pass" } else { "fail" })) -Message ($(if ($sampleCount -gt 0) { "$sampleCount CPU sample(s) recorded" } else { "no CPU samples were recorded" })))) | Out-Null

        $maxOwnedProcessCount = if ($evidence.PSObject.Properties["max_owned_process_count"]) { [int]$evidence.max_owned_process_count } else { 0 }
        $checks.Add((New-Check -Name "owned process count budget present" -Status ($(if ($maxOwnedProcessCount -gt 0) { "pass" } else { "fail" })) -Message ($(if ($maxOwnedProcessCount -gt 0) { "owned process count budget is $maxOwnedProcessCount" } else { "owned process count budget is missing" })))) | Out-Null

        $processCountAfter = if ($evidence.PSObject.Properties["process_count_after"]) { [int]$evidence.process_count_after } else { 0 }
        $checks.Add((New-Check -Name "owned process count budget" -Status ($(if ($maxOwnedProcessCount -gt 0 -and $processCountAfter -le $maxOwnedProcessCount) { "pass" } else { "fail" })) -Message ($(if ($maxOwnedProcessCount -gt 0 -and $processCountAfter -le $maxOwnedProcessCount) { "owned process count $processCountAfter <= $maxOwnedProcessCount" } else { "owned process count $processCountAfter exceeds or lacks budget $maxOwnedProcessCount" })))) | Out-Null

        $maxOwnedWebView2ProcessCount = if ($evidence.PSObject.Properties["max_owned_webview2_process_count"]) { [int]$evidence.max_owned_webview2_process_count } else { -1 }
        $checks.Add((New-Check -Name "WebView2 process budget present" -Status ($(if ($maxOwnedWebView2ProcessCount -ge 0) { "pass" } else { "fail" })) -Message ($(if ($maxOwnedWebView2ProcessCount -ge 0) { "WebView2 process budget is $maxOwnedWebView2ProcessCount" } else { "WebView2 process budget is missing" })))) | Out-Null

        $ownedWebView2ProcessCount = 0
        if ($evidence.PSObject.Properties["process_counts_by_role"] -and $evidence.process_counts_by_role.PSObject.Properties["webview2"]) {
            $ownedWebView2ProcessCount = [int]$evidence.process_counts_by_role.webview2
        }
        $checks.Add((New-Check -Name "WebView2 process budget" -Status ($(if ($maxOwnedWebView2ProcessCount -ge 0 -and $ownedWebView2ProcessCount -le $maxOwnedWebView2ProcessCount) { "pass" } else { "fail" })) -Message ($(if ($maxOwnedWebView2ProcessCount -ge 0 -and $ownedWebView2ProcessCount -le $maxOwnedWebView2ProcessCount) { "owned WebView2 process count $ownedWebView2ProcessCount <= $maxOwnedWebView2ProcessCount" } else { "owned WebView2 process count $ownedWebView2ProcessCount exceeds or lacks budget $maxOwnedWebView2ProcessCount" })))) | Out-Null

        $maxTotalWorkingSetMb = if ($evidence.PSObject.Properties["max_total_working_set_mb"]) { [double]$evidence.max_total_working_set_mb } else { 0.0 }
        $totalWorkingSetMbAfter = if ($evidence.PSObject.Properties["total_working_set_mb_after"]) { [double]$evidence.total_working_set_mb_after } else { 0.0 }
        $checks.Add((New-Check -Name "working set budget present" -Status ($(if ($maxTotalWorkingSetMb -gt 0.0 -and $evidence.PSObject.Properties["total_working_set_mb_after"]) { "pass" } else { "fail" })) -Message ($(if ($maxTotalWorkingSetMb -gt 0.0 -and $evidence.PSObject.Properties["total_working_set_mb_after"]) { "working set budget is ${maxTotalWorkingSetMb}MB" } else { "working set budget or total working set is missing" })))) | Out-Null
        $checks.Add((New-Check -Name "working set budget" -Status ($(if ($maxTotalWorkingSetMb -gt 0.0 -and $totalWorkingSetMbAfter -le $maxTotalWorkingSetMb) { "pass" } else { "fail" })) -Message ($(if ($maxTotalWorkingSetMb -gt 0.0 -and $totalWorkingSetMbAfter -le $maxTotalWorkingSetMb) { "total working set ${totalWorkingSetMbAfter}MB <= ${maxTotalWorkingSetMb}MB" } else { "total working set ${totalWorkingSetMbAfter}MB exceeds or lacks budget ${maxTotalWorkingSetMb}MB" })))) | Out-Null

        $privateMemoryPresent = $evidence.PSObject.Properties["total_private_memory_mb_after"]
        $checks.Add((New-Check -Name "private memory total present" -Status ($(if ($privateMemoryPresent) { "pass" } else { "fail" })) -Message ($(if ($privateMemoryPresent) { "total private memory is recorded" } else { "total private memory is missing" })))) | Out-Null

        $memoryByRolePresent = $evidence.PSObject.Properties["memory_totals_by_role_mb"]
        $checks.Add((New-Check -Name "memory by role present" -Status ($(if ($memoryByRolePresent) { "pass" } else { "fail" })) -Message ($(if ($memoryByRolePresent) { "memory totals by role are recorded" } else { "memory totals by role are missing" })))) | Out-Null

        $resourceBudgetViolations = @(
            if ($evidence.PSObject.Properties["resource_budget_violations"]) {
                @($evidence.resource_budget_violations)
            }
            else {
                "resource budget violations field missing"
            }
        )
        $checks.Add((New-Check -Name "resource budget violations" -Status ($(if ($resourceBudgetViolations.Count -eq 0) { "pass" } else { "fail" })) -Message ($(if ($resourceBudgetViolations.Count -eq 0) { "no resource budget violations reported" } else { "resource budget violation(s): $($resourceBudgetViolations -join '; ')" })))) | Out-Null

        $maxSample = 0.0
        if ($evidence.samples) {
            foreach ($sample in @($evidence.samples)) {
                $value = [double]$sample.cpu_pct_one_core
                if ($value -gt $maxSample) {
                    $maxSample = $value
                }
            }
        }
        $checks.Add((New-Check -Name "max one-core CPU" -Status ($(if ($maxSample -le $MaxOneCorePercent) { "pass" } else { "fail" })) -Message ($(if ($maxSample -le $MaxOneCorePercent) { "max one-core CPU $maxSample <= $MaxOneCorePercent" } else { "max one-core CPU $maxSample > $MaxOneCorePercent" })))) | Out-Null
    }

    $failCount = @($checks | Where-Object { $_.status -eq "fail" }).Count
    [pscustomobject]@{
        ok = ($failCount -eq 0)
        evidence_path = $EvidencePath
        fail_count = $failCount
        operator_machine = if ($evidence -and $evidence.PSObject.Properties["operator_machine"]) { [string]$evidence.operator_machine } else { $null }
        min_sample_seconds = $MinSampleSeconds
        max_one_core_percent = $MaxOneCorePercent
        checks = $checks.ToArray()
    }
}

function Test-ProcessOwnershipEvidence {
    param(
        [Parameter(Mandatory = $true)][string]$EvidencePath,
        [Parameter(Mandatory = $true)][string]$ExpectedVersion
    )

    $checks = New-Object System.Collections.Generic.List[object]
    $evidence = $null
    try {
        $evidence = Get-Content -LiteralPath $EvidencePath -Raw | ConvertFrom-Json
        $checks.Add((New-Check -Name "parse" -Status "pass" -Message "process ownership evidence parses")) | Out-Null
    }
    catch {
        $checks.Add((New-Check -Name "parse" -Status "fail" -Message "process ownership evidence does not parse: $($_.Exception.Message)")) | Out-Null
    }

    if ($evidence) {
        $schema = [string]$evidence.schema
        $checks.Add((New-Check -Name "schema" -Status ($(if ($schema -eq "musu.process_ownership_audit.v1") { "pass" } else { "fail" })) -Message ($(if ($schema -eq "musu.process_ownership_audit.v1") { "schema is valid" } else { "schema is '$schema'" })))) | Out-Null

        $versionValue = [string]$evidence.version
        $checks.Add((New-Check -Name "version" -Status ($(if ($versionValue -eq $ExpectedVersion) { "pass" } else { "fail" })) -Message ($(if ($versionValue -eq $ExpectedVersion) { "version matches $ExpectedVersion" } else { "version is '$versionValue'" })))) | Out-Null

        $okValue = [bool]$evidence.ok
        $checks.Add((New-Check -Name "evidence ok" -Status ($(if ($okValue) { "pass" } else { "fail" })) -Message ($(if ($okValue) { "evidence reports ok=true" } else { "evidence reports ok=false" })))) | Out-Null

        $operatorMachine = ""
        if ($evidence.PSObject.Properties["operator_machine"]) {
            $operatorMachine = [string]$evidence.operator_machine
        }
        $checks.Add((New-Check -Name "operator machine" -Status ($(if (-not [string]::IsNullOrWhiteSpace($operatorMachine)) { "pass" } else { "fail" })) -Message ($(if (-not [string]::IsNullOrWhiteSpace($operatorMachine)) { "operator_machine is present" } else { "operator_machine is missing" })))) | Out-Null

        $recordedAtOk = $false
        if ($evidence.PSObject.Properties["recorded_at"]) {
            try {
                [void][datetimeoffset]::Parse([string]$evidence.recorded_at)
                $recordedAtOk = $true
            }
            catch {
                $recordedAtOk = $false
            }
        }
        $checks.Add((New-Check -Name "recorded timestamp" -Status ($(if ($recordedAtOk) { "pass" } else { "fail" })) -Message ($(if ($recordedAtOk) { "recorded_at parses" } else { "recorded_at is missing or invalid" })))) | Out-Null

        $failCountValue = if ($evidence.PSObject.Properties["fail_count"]) { [int]$evidence.fail_count } else { 1 }
        $checks.Add((New-Check -Name "nested fail count" -Status ($(if ($failCountValue -eq 0) { "pass" } else { "fail" })) -Message ($(if ($failCountValue -eq 0) { "nested process ownership checks passed" } else { "nested process ownership fail_count is $failCountValue" })))) | Out-Null

        $counts = $evidence.process_counts
        $musuRuntimeCount = if ($counts -and $counts.PSObject.Properties["musu_runtime"]) { [int]$counts.musu_runtime } else { 0 }
        $checks.Add((New-Check -Name "MUSU runtime count" -Status ($(if ($musuRuntimeCount -eq 1) { "pass" } else { "fail" })) -Message ($(if ($musuRuntimeCount -eq 1) { "exactly one MUSU runtime process was observed" } else { "$musuRuntimeCount MUSU runtime processes were observed" })))) | Out-Null

        $orphanRepoHelpers = if ($counts -and $counts.PSObject.Properties["orphan_repo_helpers"]) { [int]$counts.orphan_repo_helpers } else { 1 }
        $checks.Add((New-Check -Name "orphan repo helpers" -Status ($(if ($orphanRepoHelpers -eq 0) { "pass" } else { "fail" })) -Message ($(if ($orphanRepoHelpers -eq 0) { "no repo-related orphan Node/WebView2 helpers" } else { "$orphanRepoHelpers repo-related orphan helper(s)" })))) | Out-Null

        $bridge = $evidence.bridge_registry
        $bridgePidAlive = ($bridge -and $bridge.PSObject.Properties["pid_alive"] -and [bool]$bridge.pid_alive)
        $checks.Add((New-Check -Name "bridge registry pid alive" -Status ($(if ($bridgePidAlive) { "pass" } else { "fail" })) -Message ($(if ($bridgePidAlive) { "bridge registry pid is alive" } else { "bridge registry pid is missing or dead" })))) | Out-Null

        $bridgeHealthOk = ($bridge -and $bridge.PSObject.Properties["health"] -and [bool]$bridge.health.ok)
        $checks.Add((New-Check -Name "bridge health" -Status ($(if ($bridgeHealthOk) { "pass" } else { "fail" })) -Message ($(if ($bridgeHealthOk) { "bridge /health passed" } else { "bridge /health did not pass" })))) | Out-Null
    }

    $failCount = @($checks | Where-Object { $_.status -eq "fail" }).Count
    [pscustomobject]@{
        ok = ($failCount -eq 0)
        evidence_path = $EvidencePath
        fail_count = $failCount
        operator_machine = if ($evidence -and $evidence.PSObject.Properties["operator_machine"]) { [string]$evidence.operator_machine } else { $null }
        checks = $checks.ToArray()
    }
}

function Test-StartupSingleInstanceEvidence {
    param(
        [Parameter(Mandatory = $true)][string]$EvidencePath,
        [Parameter(Mandatory = $true)][string]$ExpectedVersion
    )

    $checks = New-Object System.Collections.Generic.List[object]
    $evidence = $null
    try {
        $evidence = Get-Content -LiteralPath $EvidencePath -Raw | ConvertFrom-Json
        $checks.Add((New-Check -Name "parse" -Status "pass" -Message "startup single-instance evidence parses")) | Out-Null
    }
    catch {
        $checks.Add((New-Check -Name "parse" -Status "fail" -Message "startup single-instance evidence does not parse: $($_.Exception.Message)")) | Out-Null
    }

    if ($evidence) {
        $schema = [string]$evidence.schema
        $checks.Add((New-Check -Name "schema" -Status ($(if ($schema -eq "musu.startup_single_instance_audit.v1") { "pass" } else { "fail" })) -Message ($(if ($schema -eq "musu.startup_single_instance_audit.v1") { "schema is valid" } else { "schema is '$schema'" })))) | Out-Null

        $versionValue = [string]$evidence.version
        $checks.Add((New-Check -Name "version" -Status ($(if ($versionValue -eq $ExpectedVersion) { "pass" } else { "fail" })) -Message ($(if ($versionValue -eq $ExpectedVersion) { "version matches $ExpectedVersion" } else { "version is '$versionValue'" })))) | Out-Null

        $okValue = [bool]$evidence.ok
        $checks.Add((New-Check -Name "evidence ok" -Status ($(if ($okValue) { "pass" } else { "fail" })) -Message ($(if ($okValue) { "evidence reports ok=true" } else { "evidence reports ok=false" })))) | Out-Null

        $operatorMachine = ""
        if ($evidence.PSObject.Properties["operator_machine"]) {
            $operatorMachine = [string]$evidence.operator_machine
        }
        $checks.Add((New-Check -Name "operator machine" -Status ($(if (-not [string]::IsNullOrWhiteSpace($operatorMachine)) { "pass" } else { "fail" })) -Message ($(if (-not [string]::IsNullOrWhiteSpace($operatorMachine)) { "operator_machine is present" } else { "operator_machine is missing" })))) | Out-Null

        $repeatCount = if ($evidence.PSObject.Properties["repeat_count"]) { [int]$evidence.repeat_count } else { 0 }
        $checks.Add((New-Check -Name "repeat count" -Status ($(if ($repeatCount -ge 2) { "pass" } else { "fail" })) -Message ($(if ($repeatCount -ge 2) { "repeat_count is $repeatCount" } else { "repeat_count is $repeatCount; expected at least 2" })))) | Out-Null

        $failCountValue = if ($evidence.PSObject.Properties["fail_count"]) { [int]$evidence.fail_count } else { 1 }
        $checks.Add((New-Check -Name "nested fail count" -Status ($(if ($failCountValue -eq 0) { "pass" } else { "fail" })) -Message ($(if ($failCountValue -eq 0) { "nested startup checks passed" } else { "nested startup fail_count is $failCountValue" })))) | Out-Null

        $counts = $evidence.process_counts
        $afterRuntime = if ($counts -and $counts.PSObject.Properties["after_musu_runtime"]) { [int]$counts.after_musu_runtime } else { 0 }
        $checks.Add((New-Check -Name "runtime count after startup" -Status ($(if ($afterRuntime -eq 1) { "pass" } else { "fail" })) -Message ($(if ($afterRuntime -eq 1) { "exactly one MUSU runtime after repeated startup" } else { "$afterRuntime MUSU runtime process(es) after repeated startup" })))) | Out-Null

        $observedBridgePidCount = if ($counts -and $counts.PSObject.Properties["observed_bridge_pid_count"]) { [int]$counts.observed_bridge_pid_count } else { 0 }
        $checks.Add((New-Check -Name "stable bridge pid" -Status ($(if ($observedBridgePidCount -eq 1) { "pass" } else { "fail" })) -Message ($(if ($observedBridgePidCount -eq 1) { "one stable bridge pid observed" } else { "$observedBridgePidCount bridge pid(s) observed" })))) | Out-Null

        $repeatedSpawnCount = if ($counts -and $counts.PSObject.Properties["repeated_spawn_count"]) { [int]$counts.repeated_spawn_count } else { 1 }
        $checks.Add((New-Check -Name "no repeated spawn" -Status ($(if ($repeatedSpawnCount -eq 0) { "pass" } else { "fail" })) -Message ($(if ($repeatedSpawnCount -eq 0) { "no bridge spawn after the first startup call" } else { "$repeatedSpawnCount repeated bridge spawn(s)" })))) | Out-Null

        $failedInvocationCount = if ($counts -and $counts.PSObject.Properties["failed_invocation_count"]) { [int]$counts.failed_invocation_count } else { 1 }
        $checks.Add((New-Check -Name "startup invocation failures" -Status ($(if ($failedInvocationCount -eq 0) { "pass" } else { "fail" })) -Message ($(if ($failedInvocationCount -eq 0) { "all startup invocations passed" } else { "$failedInvocationCount startup invocation(s) failed" })))) | Out-Null

        $ownershipOk = ($evidence.PSObject.Properties["process_ownership"] -and [bool]$evidence.process_ownership.ok)
        $checks.Add((New-Check -Name "process ownership nested" -Status ($(if ($ownershipOk) { "pass" } else { "fail" })) -Message ($(if ($ownershipOk) { "nested process ownership audit passed" } else { "nested process ownership audit missing or failed" })))) | Out-Null
    }

    $failCount = @($checks | Where-Object { $_.status -eq "fail" }).Count
    [pscustomobject]@{
        ok = ($failCount -eq 0)
        evidence_path = $EvidencePath
        fail_count = $failCount
        operator_machine = if ($evidence -and $evidence.PSObject.Properties["operator_machine"]) { [string]$evidence.operator_machine } else { $null }
        checks = $checks.ToArray()
    }
}

function Test-DesktopSingleInstanceEvidence {
    param(
        [Parameter(Mandatory = $true)][string]$EvidencePath,
        [Parameter(Mandatory = $true)][string]$ExpectedVersion
    )

    $checks = New-Object System.Collections.Generic.List[object]
    $evidence = $null
    try {
        $evidence = Get-Content -LiteralPath $EvidencePath -Raw | ConvertFrom-Json
        $checks.Add((New-Check -Name "parse" -Status "pass" -Message "desktop single-instance evidence parses")) | Out-Null
    }
    catch {
        $checks.Add((New-Check -Name "parse" -Status "fail" -Message "desktop single-instance evidence does not parse: $($_.Exception.Message)")) | Out-Null
    }

    if ($evidence) {
        $schema = [string]$evidence.schema
        $checks.Add((New-Check -Name "schema" -Status ($(if ($schema -eq "musu.desktop_single_instance_audit.v1") { "pass" } else { "fail" })) -Message ($(if ($schema -eq "musu.desktop_single_instance_audit.v1") { "schema is valid" } else { "schema is '$schema'" })))) | Out-Null

        $versionValue = [string]$evidence.version
        $checks.Add((New-Check -Name "version" -Status ($(if ($versionValue -eq $ExpectedVersion) { "pass" } else { "fail" })) -Message ($(if ($versionValue -eq $ExpectedVersion) { "version matches $ExpectedVersion" } else { "version is '$versionValue'" })))) | Out-Null

        $okValue = [bool]$evidence.ok
        $checks.Add((New-Check -Name "evidence ok" -Status ($(if ($okValue) { "pass" } else { "fail" })) -Message ($(if ($okValue) { "evidence reports ok=true" } else { "evidence reports ok=false" })))) | Out-Null

        $operatorMachine = ""
        if ($evidence.PSObject.Properties["operator_machine"]) {
            $operatorMachine = [string]$evidence.operator_machine
        }
        $checks.Add((New-Check -Name "operator machine" -Status ($(if (-not [string]::IsNullOrWhiteSpace($operatorMachine)) { "pass" } else { "fail" })) -Message ($(if (-not [string]::IsNullOrWhiteSpace($operatorMachine)) { "operator_machine is present" } else { "operator_machine is missing" })))) | Out-Null

        $recordedAtOk = $false
        if ($evidence.PSObject.Properties["recorded_at"]) {
            try {
                [void][datetimeoffset]::Parse([string]$evidence.recorded_at)
                $recordedAtOk = $true
            }
            catch {
                $recordedAtOk = $false
            }
        }
        $checks.Add((New-Check -Name "recorded timestamp" -Status ($(if ($recordedAtOk) { "pass" } else { "fail" })) -Message ($(if ($recordedAtOk) { "recorded_at parses" } else { "recorded_at is missing or invalid" })))) | Out-Null

        $appUserModelId = if ($evidence.PSObject.Properties["app_user_model_id"]) { [string]$evidence.app_user_model_id } else { "" }
        $checks.Add((New-Check -Name "AppUserModelId" -Status ($(if (-not [string]::IsNullOrWhiteSpace($appUserModelId)) { "pass" } else { "fail" })) -Message ($(if (-not [string]::IsNullOrWhiteSpace($appUserModelId)) { "AppUserModelId is recorded" } else { "AppUserModelId is missing" })))) | Out-Null

        $repeatCount = if ($evidence.PSObject.Properties["repeat_count"]) { [int]$evidence.repeat_count } else { 0 }
        $checks.Add((New-Check -Name "repeat count" -Status ($(if ($repeatCount -ge 2) { "pass" } else { "fail" })) -Message ($(if ($repeatCount -ge 2) { "repeat_count is $repeatCount" } else { "repeat_count is $repeatCount; expected at least 2" })))) | Out-Null

        $failCountValue = if ($evidence.PSObject.Properties["fail_count"]) { [int]$evidence.fail_count } else { 1 }
        $checks.Add((New-Check -Name "nested fail count" -Status ($(if ($failCountValue -eq 0) { "pass" } else { "fail" })) -Message ($(if ($failCountValue -eq 0) { "nested desktop activation checks passed" } else { "nested desktop activation fail_count is $failCountValue" })))) | Out-Null

        $counts = $evidence.process_counts
        $maxDesktopProcessCount = if ($evidence.PSObject.Properties["max_desktop_process_count"]) { [int]$evidence.max_desktop_process_count } else { 1 }
        $afterDesktopShell = if ($counts -and $counts.PSObject.Properties["after_desktop_shell"]) { [int]$counts.after_desktop_shell } else { 999 }
        $checks.Add((New-Check -Name "desktop shell count after activation" -Status ($(if ($afterDesktopShell -le $maxDesktopProcessCount) { "pass" } else { "fail" })) -Message ($(if ($afterDesktopShell -le $maxDesktopProcessCount) { "desktop shell count $afterDesktopShell <= $maxDesktopProcessCount" } else { "desktop shell count $afterDesktopShell exceeds $maxDesktopProcessCount" })))) | Out-Null

        $newDesktopShell = if ($counts -and $counts.PSObject.Properties["new_desktop_shell"]) { [int]$counts.new_desktop_shell } else { 999 }
        $checks.Add((New-Check -Name "new desktop shell count" -Status ($(if ($newDesktopShell -le $maxDesktopProcessCount) { "pass" } else { "fail" })) -Message ($(if ($newDesktopShell -le $maxDesktopProcessCount) { "new desktop shell count $newDesktopShell <= $maxDesktopProcessCount" } else { "new desktop shell count $newDesktopShell exceeds $maxDesktopProcessCount" })))) | Out-Null

        $activationFailureCount = if ($counts -and $counts.PSObject.Properties["activation_failure_count"]) { [int]$counts.activation_failure_count } else { 1 }
        $checks.Add((New-Check -Name "activation failures" -Status ($(if ($activationFailureCount -eq 0) { "pass" } else { "fail" })) -Message ($(if ($activationFailureCount -eq 0) { "all desktop activation attempts succeeded" } else { "$activationFailureCount desktop activation attempt(s) failed" })))) | Out-Null
    }

    $failCount = @($checks | Where-Object { $_.status -eq "fail" }).Count
    [pscustomobject]@{
        ok = ($failCount -eq 0)
        evidence_path = $EvidencePath
        fail_count = $failCount
        operator_machine = if ($evidence -and $evidence.PSObject.Properties["operator_machine"]) { [string]$evidence.operator_machine } else { $null }
        checks = $checks.ToArray()
    }
}

$auditScript = Join-Path $scriptDir "audit-desktop-release-readiness.ps1"
$metadataScript = Join-Path $scriptDir "verify-store-public-metadata.ps1"
$manifestScript = Join-Path $scriptDir "write-release-candidate-manifest.ps1"
$supportMailboxVerifierScript = Join-Path $scriptDir "verify-support-mailbox-evidence.ps1"
$msixInstallVerifierScript = Join-Path $scriptDir "verify-msix-install-evidence.ps1"
$msixDesktopEntrypointAuditScript = Join-Path $scriptDir "audit-msix-desktop-entrypoint.ps1"
$storeReleaseVerifierScript = Join-Path $scriptDir "verify-store-release-evidence.ps1"
$runtimeCpuScenarioMatrixVerifierScript = Join-Path $scriptDir "verify-runtime-cpu-scenario-matrix.ps1"
$p2pControlPlaneVerifierScript = Join-Path $scriptDir "verify-p2p-control-plane-evidence.ps1"
$manifestPath = Join-Path $repoRoot ".local-build\release-candidates\$version\release-candidate-manifest.json"

$auditResult = Invoke-JsonScript -FilePath $auditScript -Arguments @("-Json")
$audit = $auditResult.json
$msixStoreDesktopEntrypointArtifactAuditResult = Invoke-JsonScript `
    -FilePath $msixDesktopEntrypointAuditScript `
    -Arguments @("-StartupContract", "store-reviewed-immediate-registration", "-ExpectedApplicationExecutable", "musu-desktop.exe", "-Json") `
    -AllowFailure
$msixLocalDesktopEntrypointInstalledAuditResult = Invoke-JsonScript `
    -FilePath $msixDesktopEntrypointAuditScript `
    -Arguments @("-StartupContract", "local-sideload-manual", "-ExpectedApplicationExecutable", "musu-desktop.exe", "-RequireInstalledPackage", "-Json") `
    -AllowFailure
$msixDesktopEntrypointVerified = (
    $msixStoreDesktopEntrypointArtifactAuditResult.json -and
    [bool]$msixStoreDesktopEntrypointArtifactAuditResult.json.ok -and
    $msixLocalDesktopEntrypointInstalledAuditResult.json -and
    [bool]$msixLocalDesktopEntrypointInstalledAuditResult.json.ok
)

& powershell -NoProfile -ExecutionPolicy Bypass -File $manifestScript | Out-Null
if ($LASTEXITCODE -ne 0) {
    throw "Release candidate manifest generation failed."
}
$manifest = if (Test-Path -LiteralPath $manifestPath) {
    Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
}
else {
    $null
}

$publicMetadataResult = $null
if (-not $SkipPublicMetadata) {
    $publicMetadataResult = Invoke-JsonScript `
        -FilePath $metadataScript `
        -Arguments @("-BaseUrl", $PublicMetadataBaseUrl, "-Json") `
        -AllowFailure
}

$supportMailboxVerified = $false
$supportMailboxEvidence = $null
$supportMailboxEvidenceCandidate = $null
if (-not $supportMailboxVerified) {
    $supportEvidenceRoots = @(
        [pscustomobject]@{
            path = (Join-Path $repoRoot ("docs\evidence\support-mailbox\{0}" -f $version))
            filter = "*.evidence.json"
        },
        [pscustomobject]@{
            path = (Join-Path $repoRoot ".local-build\support-mailbox")
            filter = "*.evidence.json"
        }
    )

    foreach ($root in $supportEvidenceRoots) {
        if (Test-Path -LiteralPath $root.path) {
            $candidate = Get-ChildItem -LiteralPath $root.path -Filter $root.filter -File -ErrorAction SilentlyContinue |
                Sort-Object LastWriteTime -Descending |
                Select-Object -First 1
            if ($candidate) {
                $supportMailboxEvidenceCandidate = $candidate
                break
            }
        }
    }

    if ($supportMailboxEvidenceCandidate) {
        $supportMailboxEvidenceResult = Invoke-JsonScript `
            -FilePath $supportMailboxVerifierScript `
            -Arguments @("-EvidencePath", $supportMailboxEvidenceCandidate.FullName, "-ExpectedVersion", $version, "-Json") `
            -AllowFailure
        if ($supportMailboxEvidenceResult.json -and [bool]$supportMailboxEvidenceResult.json.ok) {
            $supportMailboxVerified = $true
            $supportMailboxEvidence = $supportMailboxEvidenceResult.json
        }
        else {
            $supportMailboxEvidence = [pscustomobject]@{
                ok = $false
                evidence_path = $supportMailboxEvidenceCandidate.FullName
                raw = $supportMailboxEvidenceResult.raw
            }
        }
    }
}

$msixInstallVerified = $false
$msixInstallEvidence = $null
$msixInstallEvidenceCandidate = $null
$msixInstallEvidenceRoots = @(
    [pscustomobject]@{
        path = (Join-Path $repoRoot ("docs\evidence\msix-install\{0}" -f $version))
        filter = "*.evidence.json"
    },
    [pscustomobject]@{
        path = (Join-Path $repoRoot ".local-build\msix-install")
        filter = "*.evidence.json"
    }
)

foreach ($root in $msixInstallEvidenceRoots) {
    if (Test-Path -LiteralPath $root.path) {
        $candidate = Get-ChildItem -LiteralPath $root.path -Filter $root.filter -File -ErrorAction SilentlyContinue |
            Sort-Object LastWriteTime -Descending |
            Select-Object -First 1
        if ($candidate) {
            $msixInstallEvidenceCandidate = $candidate
            break
        }
    }
}

if ($msixInstallEvidenceCandidate) {
    $msixInstallEvidenceResult = Invoke-JsonScript `
        -FilePath $msixInstallVerifierScript `
        -Arguments @("-EvidencePath", $msixInstallEvidenceCandidate.FullName, "-ExpectedVersion", $version, "-Json") `
        -AllowFailure
    if ($msixInstallEvidenceResult.json -and [bool]$msixInstallEvidenceResult.json.ok) {
        $msixInstallVerified = $true
        $msixInstallEvidence = $msixInstallEvidenceResult.json
    }
    else {
        $msixInstallEvidence = [pscustomobject]@{
            ok = $false
            evidence_path = $msixInstallEvidenceCandidate.FullName
            raw = $msixInstallEvidenceResult.raw
        }
    }
}

$runtimeIdleCpuVerified = $false
$runtimeIdleCpuEvidence = $null
$runtimeIdleCpuEvidenceCandidates = @()
$runtimeIdleCpuEvidenceRoots = @(
    [pscustomobject]@{
        path = (Join-Path $repoRoot ("docs\evidence\runtime-idle-cpu\{0}" -f $version))
        filter = "*.json"
    },
    [pscustomobject]@{
        path = (Join-Path $repoRoot ".local-build\runtime-idle-cpu")
        filter = "*.json"
    }
)

foreach ($root in $runtimeIdleCpuEvidenceRoots) {
    if (Test-Path -LiteralPath $root.path) {
        $runtimeIdleCpuEvidenceCandidates += @(Get-ChildItem -LiteralPath $root.path -Filter $root.filter -File -ErrorAction SilentlyContinue)
    }
}

$runtimeIdleCpuEvidenceResults = @()
$runtimeIdleCpuMachines = New-Object 'System.Collections.Generic.HashSet[string]' ([System.StringComparer]::OrdinalIgnoreCase)
foreach ($candidate in @($runtimeIdleCpuEvidenceCandidates | Sort-Object LastWriteTime -Descending)) {
    $verification = Test-RuntimeIdleCpuEvidence `
        -EvidencePath $candidate.FullName `
        -ExpectedVersion $version `
        -ExpectedGitCommit $currentGitCommit `
        -MinSampleSeconds $MinRuntimeIdleCpuSampleSeconds `
        -MaxOneCorePercent $MaxRuntimeIdleCpuOneCorePercent
    $runtimeIdleCpuEvidenceResults += $verification
    if ([bool]$verification.ok -and -not [string]::IsNullOrWhiteSpace([string]$verification.operator_machine)) {
        [void]$runtimeIdleCpuMachines.Add([string]$verification.operator_machine)
    }
}

$runtimeIdleCpuVerified = ($runtimeIdleCpuMachines.Count -ge $MinRuntimeIdleCpuMachineCount)
$runtimeIdleCpuEvidence = [pscustomobject]@{
    ok = [bool]$runtimeIdleCpuVerified
    min_machine_count = $MinRuntimeIdleCpuMachineCount
    valid_machine_count = $runtimeIdleCpuMachines.Count
    valid_machines = @($runtimeIdleCpuMachines)
    candidate_count = $runtimeIdleCpuEvidenceResults.Count
    candidates = $runtimeIdleCpuEvidenceResults
}

$runtimeCpuScenarioMatrixVerified = $false
$runtimeCpuScenarioMatrixEvidence = $null
$runtimeCpuScenarioMatrixCandidates = @()
# Release gate for musu.runtime_cpu_scenario_matrix.v1 evidence.
$runtimeCpuScenarioMatrixRoots = @(
    [pscustomobject]@{
        path = (Join-Path $repoRoot ("docs\evidence\runtime-cpu-scenarios\{0}" -f $version))
        filter = "*.runtime-cpu-scenario-matrix.json"
        recurse = $false
    },
    [pscustomobject]@{
        path = (Join-Path $repoRoot ".local-build\runtime-cpu-scenarios")
        filter = "*.runtime-cpu-scenario-matrix.json"
        recurse = $true
    }
)

foreach ($root in $runtimeCpuScenarioMatrixRoots) {
    if (Test-Path -LiteralPath $root.path) {
        $runtimeCpuScenarioMatrixCandidates += @(
            Get-ChildItem -LiteralPath $root.path -Filter $root.filter -File -Recurse:([bool]$root.recurse) -ErrorAction SilentlyContinue
        )
    }
}

$runtimeCpuScenarioMatrixResults = @()
$runtimeCpuScenarioMatrixMachines = New-Object 'System.Collections.Generic.HashSet[string]' ([System.StringComparer]::OrdinalIgnoreCase)
foreach ($candidate in @($runtimeCpuScenarioMatrixCandidates | Sort-Object LastWriteTime -Descending)) {
    $matrixArgs = @(
        "-EvidencePath", $candidate.FullName,
        "-ExpectedVersion", $version,
        "-ExpectedGitCommit", $currentGitCommit,
        "-RequiredScenarios", ($RequiredRuntimeCpuScenarioMatrixScenarios -join ",")
    ) + @(
        "-MinSampleSeconds", ([string]$MinRuntimeIdleCpuSampleSeconds),
        "-MaxOneCorePercent", ([string]$MaxRuntimeIdleCpuOneCorePercent),
        "-RequirePostRouteProbe",
        "-Json"
    )
    $verification = Invoke-JsonScript `
        -FilePath $runtimeCpuScenarioMatrixVerifierScript `
        -Arguments $matrixArgs `
        -AllowFailure
    $runtimeCpuScenarioMatrixResults += if ($verification.json) {
        $verification.json
    }
    else {
        [pscustomobject]@{
            ok = $false
            evidence_path = $candidate.FullName
            raw = $verification.raw
        }
    }
    $latestMatrixResult = $runtimeCpuScenarioMatrixResults | Select-Object -Last 1
    if ([bool]$latestMatrixResult.ok -and -not [string]::IsNullOrWhiteSpace([string]$latestMatrixResult.operator_machine)) {
        [void]$runtimeCpuScenarioMatrixMachines.Add([string]$latestMatrixResult.operator_machine)
    }
}

$runtimeCpuScenarioMatrixVerified = ($runtimeCpuScenarioMatrixMachines.Count -ge $MinRuntimeCpuScenarioMatrixMachineCount)
$runtimeCpuScenarioMatrixEvidence = [pscustomobject]@{
    ok = [bool]$runtimeCpuScenarioMatrixVerified
    min_machine_count = $MinRuntimeCpuScenarioMatrixMachineCount
    valid_machine_count = $runtimeCpuScenarioMatrixMachines.Count
    valid_machines = @($runtimeCpuScenarioMatrixMachines)
    candidate_count = $runtimeCpuScenarioMatrixResults.Count
    required_scenarios = @($RequiredRuntimeCpuScenarioMatrixScenarios)
    candidates = $runtimeCpuScenarioMatrixResults
}

$processOwnershipVerified = $false
$processOwnershipEvidence = $null
$processOwnershipEvidenceCandidates = @()
$processOwnershipEvidenceRoots = @(
    [pscustomobject]@{
        path = (Join-Path $repoRoot ("docs\evidence\process-ownership\{0}" -f $version))
        filter = "*.json"
    },
    [pscustomobject]@{
        path = (Join-Path $repoRoot ".local-build\process-ownership")
        filter = "*.json"
    }
)

foreach ($root in $processOwnershipEvidenceRoots) {
    if (Test-Path -LiteralPath $root.path) {
        $processOwnershipEvidenceCandidates += @(Get-ChildItem -LiteralPath $root.path -Filter $root.filter -File -ErrorAction SilentlyContinue)
    }
}

$processOwnershipEvidenceResults = @()
$processOwnershipMachines = New-Object 'System.Collections.Generic.HashSet[string]' ([System.StringComparer]::OrdinalIgnoreCase)
foreach ($candidate in @($processOwnershipEvidenceCandidates | Sort-Object LastWriteTime -Descending)) {
    $verification = Test-ProcessOwnershipEvidence `
        -EvidencePath $candidate.FullName `
        -ExpectedVersion $version
    $processOwnershipEvidenceResults += $verification
    if ([bool]$verification.ok -and -not [string]::IsNullOrWhiteSpace([string]$verification.operator_machine)) {
        [void]$processOwnershipMachines.Add([string]$verification.operator_machine)
    }
}

$processOwnershipVerified = ($processOwnershipMachines.Count -ge $MinProcessOwnershipMachineCount)
$processOwnershipEvidence = [pscustomobject]@{
    ok = [bool]$processOwnershipVerified
    min_machine_count = $MinProcessOwnershipMachineCount
    valid_machine_count = $processOwnershipMachines.Count
    valid_machines = @($processOwnershipMachines)
    candidate_count = $processOwnershipEvidenceResults.Count
    candidates = $processOwnershipEvidenceResults
}

$startupSingleInstanceVerified = $false
$startupSingleInstanceEvidence = $null
$startupSingleInstanceEvidenceCandidates = @()
$startupSingleInstanceEvidenceRoots = @(
    [pscustomobject]@{
        path = (Join-Path $repoRoot ("docs\evidence\startup-single-instance\{0}" -f $version))
        filter = "*.json"
    },
    [pscustomobject]@{
        path = (Join-Path $repoRoot ".local-build\startup-single-instance")
        filter = "*.json"
    }
)

foreach ($root in $startupSingleInstanceEvidenceRoots) {
    if (Test-Path -LiteralPath $root.path) {
        $startupSingleInstanceEvidenceCandidates += @(
            Get-ChildItem -LiteralPath $root.path -Filter $root.filter -File -ErrorAction SilentlyContinue |
                Where-Object { $_.Name -notlike "*.process-ownership.json" }
        )
    }
}

$startupSingleInstanceEvidenceResults = @()
$startupSingleInstanceMachines = New-Object 'System.Collections.Generic.HashSet[string]' ([System.StringComparer]::OrdinalIgnoreCase)
foreach ($candidate in @($startupSingleInstanceEvidenceCandidates | Sort-Object LastWriteTime -Descending)) {
    $verification = Test-StartupSingleInstanceEvidence `
        -EvidencePath $candidate.FullName `
        -ExpectedVersion $version
    $startupSingleInstanceEvidenceResults += $verification
    if ([bool]$verification.ok -and -not [string]::IsNullOrWhiteSpace([string]$verification.operator_machine)) {
        [void]$startupSingleInstanceMachines.Add([string]$verification.operator_machine)
    }
}

$startupSingleInstanceVerified = ($startupSingleInstanceMachines.Count -ge $MinStartupSingleInstanceMachineCount)
$startupSingleInstanceEvidence = [pscustomobject]@{
    ok = [bool]$startupSingleInstanceVerified
    min_machine_count = $MinStartupSingleInstanceMachineCount
    valid_machine_count = $startupSingleInstanceMachines.Count
    valid_machines = @($startupSingleInstanceMachines)
    candidate_count = $startupSingleInstanceEvidenceResults.Count
    candidates = $startupSingleInstanceEvidenceResults
}

$desktopSingleInstanceVerified = $false
$desktopSingleInstanceEvidence = $null
$desktopSingleInstanceEvidenceCandidates = @()
$desktopSingleInstanceEvidenceRoots = @(
    [pscustomobject]@{
        path = (Join-Path $repoRoot ("docs\evidence\desktop-single-instance\{0}" -f $version))
        filter = "*.json"
    },
    [pscustomobject]@{
        path = (Join-Path $repoRoot ".local-build\desktop-single-instance")
        filter = "*.json"
    }
)

foreach ($root in $desktopSingleInstanceEvidenceRoots) {
    if (Test-Path -LiteralPath $root.path) {
        $desktopSingleInstanceEvidenceCandidates += @(
            Get-ChildItem -LiteralPath $root.path -Filter $root.filter -File -ErrorAction SilentlyContinue
        )
    }
}

$desktopSingleInstanceEvidenceResults = @()
$desktopSingleInstanceMachines = New-Object 'System.Collections.Generic.HashSet[string]' ([System.StringComparer]::OrdinalIgnoreCase)
foreach ($candidate in @($desktopSingleInstanceEvidenceCandidates | Sort-Object LastWriteTime -Descending)) {
    $verification = Test-DesktopSingleInstanceEvidence `
        -EvidencePath $candidate.FullName `
        -ExpectedVersion $version
    $desktopSingleInstanceEvidenceResults += $verification
    if ([bool]$verification.ok -and -not [string]::IsNullOrWhiteSpace([string]$verification.operator_machine)) {
        [void]$desktopSingleInstanceMachines.Add([string]$verification.operator_machine)
    }
}

$desktopSingleInstanceVerified = ($desktopSingleInstanceMachines.Count -ge $MinDesktopSingleInstanceMachineCount)
$desktopSingleInstanceEvidence = [pscustomobject]@{
    ok = [bool]$desktopSingleInstanceVerified
    min_machine_count = $MinDesktopSingleInstanceMachineCount
    valid_machine_count = $desktopSingleInstanceMachines.Count
    valid_machines = @($desktopSingleInstanceMachines)
    candidate_count = $desktopSingleInstanceEvidenceResults.Count
    candidates = $desktopSingleInstanceEvidenceResults
}

$storeReleaseVerified = $false
$storeReleaseEvidence = $null
$storeReleaseEvidenceCandidate = $null
$storeReleaseEvidenceRoots = @(
    [pscustomobject]@{
        path = (Join-Path $repoRoot ("docs\evidence\store-release\{0}" -f $version))
        filter = "*.evidence.json"
    },
    [pscustomobject]@{
        path = (Join-Path $repoRoot ".local-build\store-release")
        filter = "*.evidence.json"
    }
)

foreach ($root in $storeReleaseEvidenceRoots) {
    if (Test-Path -LiteralPath $root.path) {
        $candidate = Get-ChildItem -LiteralPath $root.path -Filter $root.filter -File -ErrorAction SilentlyContinue |
            Sort-Object LastWriteTime -Descending |
            Select-Object -First 1
        if ($candidate) {
            $storeReleaseEvidenceCandidate = $candidate
            break
        }
    }
}

if ($storeReleaseEvidenceCandidate) {
    $storeReleaseEvidenceResult = Invoke-JsonScript `
        -FilePath $storeReleaseVerifierScript `
        -Arguments @("-EvidencePath", $storeReleaseEvidenceCandidate.FullName, "-ExpectedVersion", $version, "-Json") `
        -AllowFailure
    if ($storeReleaseEvidenceResult.json -and [bool]$storeReleaseEvidenceResult.json.ok) {
        $storeReleaseVerified = $true
        $storeReleaseEvidence = $storeReleaseEvidenceResult.json
    }
    else {
        $storeReleaseEvidence = [pscustomobject]@{
            ok = $false
            evidence_path = $storeReleaseEvidenceCandidate.FullName
            raw = $storeReleaseEvidenceResult.raw
        }
    }
}

$p2pControlPlaneVerified = $false
$p2pControlPlaneEvidence = $null
$p2pControlPlaneEvidenceCandidate = $null
$p2pControlPlaneEvidenceRoots = @(
    [pscustomobject]@{
        path = (Join-Path $repoRoot ("docs\evidence\p2p-control-plane\{0}" -f $version))
        filter = "*.evidence.json"
    },
    [pscustomobject]@{
        path = (Join-Path $repoRoot ".local-build\p2p-control-plane")
        filter = "*.evidence.json"
    }
)

foreach ($root in $p2pControlPlaneEvidenceRoots) {
    if (Test-Path -LiteralPath $root.path) {
        $candidate = Get-ChildItem -LiteralPath $root.path -Filter $root.filter -File -ErrorAction SilentlyContinue |
            Sort-Object LastWriteTime -Descending |
            Select-Object -First 1
        if ($candidate) {
            $p2pControlPlaneEvidenceCandidate = $candidate
            break
        }
    }
}

if ($p2pControlPlaneEvidenceCandidate) {
    $p2pControlPlaneEvidenceResult = Invoke-JsonScript `
        -FilePath $p2pControlPlaneVerifierScript `
        -Arguments @("-EvidencePath", $p2pControlPlaneEvidenceCandidate.FullName, "-ExpectedVersion", $version, "-ExpectedBaseUrl", $PublicMetadataBaseUrl, "-Json") `
        -AllowFailure
    if ($p2pControlPlaneEvidenceResult.json -and [bool]$p2pControlPlaneEvidenceResult.json.ok) {
        $p2pControlPlaneVerified = $true
        $p2pControlPlaneEvidence = $p2pControlPlaneEvidenceResult.json
    }
    elseif ($p2pControlPlaneEvidenceResult.json) {
        $p2pControlPlaneEvidence = $p2pControlPlaneEvidenceResult.json
    }
    else {
        $p2pControlPlaneEvidence = [pscustomobject]@{
            ok = $false
            evidence_path = $p2pControlPlaneEvidenceCandidate.FullName
            raw = $p2pControlPlaneEvidenceResult.raw
        }
    }
}

$gitStatus = (& git -C $repoRoot status --short 2>$null | Out-String).Trim()
$blockers = New-Object System.Collections.Generic.List[object]
$warnings = New-Object System.Collections.Generic.List[object]

if (-not [bool]$audit.runtime_package_ready) {
    Add-Blocker -List $blockers -Area "runtime-package" -Message "Runtime package readiness is false."
}
if (-not $msixDesktopEntrypointVerified) {
    Add-Blocker -List $blockers -Area "msix-desktop-entrypoint" -Message "Store/MSIX package does not yet prove that Start-menu activation launches the Tauri desktop shell instead of the runtime CLI."
}
if (-not [bool]$audit.desktop_shell_ready) {
    Add-Blocker -List $blockers -Area "desktop-shell" -Message "Desktop shell readiness is false."
}
if (-not [bool]$audit.single_machine_verified) {
    Add-Blocker -List $blockers -Area "single-machine" -Message "Fresh single-machine smoke evidence has not been recorded."
}
if (-not $msixInstallVerified) {
    Add-Blocker -List $blockers -Area "msix-install" -Message "Clean/current Windows MSIX install evidence has not been recorded."
}
if (-not [bool]$audit.multi_device_verified) {
    Add-Blocker -List $blockers -Area "multi-device" -Message "Real second-PC multi-device evidence has not been recorded."
}
if (-not $runtimeIdleCpuVerified) {
    Add-Blocker -List $blockers -Area "runtime-idle-cpu" -Message "Runtime idle CPU evidence has not passed on at least ${MinRuntimeIdleCpuMachineCount} machine(s) for ${MinRuntimeIdleCpuSampleSeconds}s at <= ${MaxRuntimeIdleCpuOneCorePercent}% of one logical CPU in scenario '${RequiredRuntimeIdleCpuScenario}' with owned WebView2 required."
}
if (-not $runtimeCpuScenarioMatrixVerified) {
    Add-Blocker -List $blockers -Area "runtime-cpu-scenario-matrix" -Message "Runtime CPU scenario matrix evidence has not passed on at least ${MinRuntimeCpuScenarioMatrixMachineCount} machine(s) for scenarios '$($RequiredRuntimeCpuScenarioMatrixScenarios -join ', ')' with a successful post-route probe."
}
if (-not $processOwnershipVerified) {
    Add-Blocker -List $blockers -Area "process-ownership" -Message "Process ownership evidence has not passed on at least ${MinProcessOwnershipMachineCount} machine(s)."
}
if (-not $startupSingleInstanceVerified) {
    Add-Blocker -List $blockers -Area "startup-single-instance" -Message "Startup single-instance evidence has not passed on at least ${MinStartupSingleInstanceMachineCount} machine(s)."
}
if (-not $desktopSingleInstanceVerified) {
    Add-Blocker -List $blockers -Area "desktop-single-instance" -Message "Packaged desktop repeated activation evidence has not passed on at least ${MinDesktopSingleInstanceMachineCount} machine(s)."
}
if (-not $SkipPublicMetadata) {
    if (-not $publicMetadataResult.json -or -not [bool]$publicMetadataResult.json.ok) {
        Add-Blocker -List $blockers -Area "store-public-metadata" -Message "Public privacy/support metadata verification failed for $PublicMetadataBaseUrl."
    }
}
else {
    Add-Blocker -List $blockers -Area "store-public-metadata" -Message "Public privacy/support metadata verification was skipped."
}
if (-not $supportMailboxVerified) {
    Add-Blocker -List $blockers -Area "support-mailbox" -Message "$supportEmail delivery has not been operator-verified."
}
if (-not $storeReleaseVerified) {
    Add-Blocker -List $blockers -Area "store-release" -Message "Partner Center product name reservation, app submission, Microsoft certification, and restricted capability approval evidence has not been recorded."
}
if (-not $p2pControlPlaneVerified) {
    Add-Blocker -List $blockers -Area "p2p-control-plane" -Message "Live $PublicMetadataBaseUrl P2P control-plane evidence has not verified owner-scoped relay lease queries with relay_default_data_path=false."
}
if (-not [string]::IsNullOrWhiteSpace($gitStatus)) {
    Add-Blocker -List $blockers -Area "git" -Message "Working tree is dirty; commit and regenerate manifest before final handoff."
}

$manualExternalGates = @(
    "Second-PC clean/current MSIX install verification",
    "Second-PC multi-device route verification",
    "$supportEmail inbox delivery verification",
    "Partner Center product name reservation",
    "Partner Center app submission",
    "Microsoft app certification",
    "Microsoft restricted capability review"
)

$manualInternalGates = @(
    "MSIX desktop entrypoint audit for Store package activation",
    "Runtime idle CPU verification on primary Windows PC",
    "Runtime idle CPU verification on second Windows PC",
    "Runtime CPU scenario matrix verification for runtime-started/dashboard-open/desktop-open/post-route on primary and second Windows PC",
    "Process ownership audit on primary Windows PC",
    "Second-PC runtime/startup ownership verification",
    "Startup single-instance repeat audit",
    "Packaged desktop repeated activation audit",
    "musu.pro registry/rendezvous/relay-control live evidence"
)

$ready = ($blockers.Count -eq 0)
$result = [pscustomobject]@{
    schema = "musu.release_go_no_go.v1"
    generated_at = (Get-Date).ToString("o")
    version = $version
    repo_root = $repoRoot
    ready_for_public_desktop_release = $ready
    local_artifacts_ready = ([bool]$audit.runtime_package_ready -and [bool]$audit.desktop_shell_ready)
    single_machine_verified = [bool]$audit.single_machine_verified
    multi_device_verified = [bool]$audit.multi_device_verified
    public_metadata_checked = -not [bool]$SkipPublicMetadata
    public_metadata_ok = if ($SkipPublicMetadata) { $null } elseif ($publicMetadataResult.json) { [bool]$publicMetadataResult.json.ok } else { $false }
    msix_install_verified = [bool]$msixInstallVerified
    msix_install_evidence = $msixInstallEvidence
    msix_desktop_entrypoint_verified = [bool]$msixDesktopEntrypointVerified
    msix_desktop_entrypoint_audit = [pscustomobject]@{
        ok = [bool]$msixDesktopEntrypointVerified
        store_reviewed_artifact = if ($msixStoreDesktopEntrypointArtifactAuditResult.json) {
            $msixStoreDesktopEntrypointArtifactAuditResult.json
        }
        else {
            [pscustomobject]@{ ok = $false; raw = $msixStoreDesktopEntrypointArtifactAuditResult.raw }
        }
        local_sideload_installed = if ($msixLocalDesktopEntrypointInstalledAuditResult.json) {
            $msixLocalDesktopEntrypointInstalledAuditResult.json
        }
        else {
            [pscustomobject]@{ ok = $false; raw = $msixLocalDesktopEntrypointInstalledAuditResult.raw }
        }
    }
    runtime_idle_cpu_verified = [bool]$runtimeIdleCpuVerified
    required_runtime_idle_cpu_scenario = $RequiredRuntimeIdleCpuScenario
    runtime_idle_cpu_min_machine_count = $runtimeIdleCpuEvidence.min_machine_count
    runtime_idle_cpu_valid_machine_count = $runtimeIdleCpuEvidence.valid_machine_count
    runtime_idle_cpu_valid_machines = @($runtimeIdleCpuEvidence.valid_machines)
    runtime_idle_cpu_candidate_count = $runtimeIdleCpuEvidence.candidate_count
    runtime_idle_cpu_evidence = $runtimeIdleCpuEvidence
    runtime_cpu_scenario_matrix_verified = [bool]$runtimeCpuScenarioMatrixVerified
    runtime_cpu_scenario_matrix_min_machine_count = $runtimeCpuScenarioMatrixEvidence.min_machine_count
    runtime_cpu_scenario_matrix_valid_machine_count = $runtimeCpuScenarioMatrixEvidence.valid_machine_count
    runtime_cpu_scenario_matrix_valid_machines = @($runtimeCpuScenarioMatrixEvidence.valid_machines)
    runtime_cpu_scenario_matrix_candidate_count = $runtimeCpuScenarioMatrixEvidence.candidate_count
    runtime_cpu_scenario_matrix_required_scenarios = @($runtimeCpuScenarioMatrixEvidence.required_scenarios)
    runtime_cpu_scenario_matrix_evidence = $runtimeCpuScenarioMatrixEvidence
    process_ownership_verified = [bool]$processOwnershipVerified
    process_ownership_evidence = $processOwnershipEvidence
    startup_single_instance_verified = [bool]$startupSingleInstanceVerified
    startup_single_instance_evidence = $startupSingleInstanceEvidence
    desktop_single_instance_verified = [bool]$desktopSingleInstanceVerified
    desktop_single_instance_evidence = $desktopSingleInstanceEvidence
    support_mailbox_verified = [bool]$supportMailboxVerified
    support_mailbox_evidence = $supportMailboxEvidence
    store_release_verified = [bool]$storeReleaseVerified
    store_release_evidence = $storeReleaseEvidence
    p2p_control_plane_verified = [bool]$p2pControlPlaneVerified
    p2p_control_plane_evidence = $p2pControlPlaneEvidence
    blockers = $blockers.ToArray()
    warnings = $warnings.ToArray()
    manual_internal_gates = $manualInternalGates
    manual_external_gates = $manualExternalGates
    readiness_audit = $audit
    public_metadata = if ($publicMetadataResult) { $publicMetadataResult.json } else { $null }
    manifest_path = if ($manifest) { (Resolve-Path -LiteralPath $manifestPath).Path } else { $null }
    manifest_git = if ($manifest) { $manifest.git } else { $null }
}

if ($Json) {
    $result | ConvertTo-Json -Depth 8
}
else {
    "MUSU release go/no-go"
    "ready_for_public_desktop_release: $($result.ready_for_public_desktop_release)"
    "local_artifacts_ready: $($result.local_artifacts_ready)"
    "single_machine_verified: $($result.single_machine_verified)"
    "msix_install_verified: $($result.msix_install_verified)"
    "msix_desktop_entrypoint_verified: $($result.msix_desktop_entrypoint_verified)"
    "runtime_idle_cpu_verified: $($result.runtime_idle_cpu_verified)"
    "runtime_idle_cpu_valid_machines: $($result.runtime_idle_cpu_valid_machine_count)/$($result.runtime_idle_cpu_min_machine_count) [$((@($result.runtime_idle_cpu_valid_machines) -join ', '))]"
    "runtime_cpu_scenario_matrix_verified: $($result.runtime_cpu_scenario_matrix_verified)"
    "runtime_cpu_scenario_matrix_valid_machines: $($result.runtime_cpu_scenario_matrix_valid_machine_count)/$($result.runtime_cpu_scenario_matrix_min_machine_count) [$((@($result.runtime_cpu_scenario_matrix_valid_machines) -join ', '))]"
    "process_ownership_verified: $($result.process_ownership_verified)"
    "startup_single_instance_verified: $($result.startup_single_instance_verified)"
    "desktop_single_instance_verified: $($result.desktop_single_instance_verified)"
    "multi_device_verified: $($result.multi_device_verified)"
    "public_metadata_ok: $($result.public_metadata_ok)"
    "support_mailbox_verified: $($result.support_mailbox_verified)"
    "store_release_verified: $($result.store_release_verified)"
    "p2p_control_plane_verified: $($result.p2p_control_plane_verified)"
    ""
    "Blockers"
    $blockers | Format-Table area, message -Wrap
    if ($warnings.Count -gt 0) {
        ""
        "Warnings"
        $warnings | Format-Table area, message -Wrap
    }
    ""
    "Manual external gates"
    $manualExternalGates | ForEach-Object { "- $_" }
}

if ($FailOnNotReady -and -not $ready) {
    exit 1
}
