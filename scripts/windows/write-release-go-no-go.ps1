[CmdletBinding()]
param(
    [string]$PublicMetadataBaseUrl = "https://musu.pro",
    [int]$MinRuntimeIdleCpuSampleSeconds = 60,
    [double]$MaxRuntimeIdleCpuOneCorePercent = 5.0,
    [int]$MinRuntimeIdleCpuMachineCount = 2,
    [int]$MinRuntimeCpuScenarioMatrixMachineCount = 2,
    [int]$MinRuntimeCpuSecondPcRouteAttemptMachineCount = 1,
    [int]$MinProcessOwnershipMachineCount = 1,
    [int]$MinStartupSingleInstanceMachineCount = 1,
    [int]$MinDesktopSingleInstanceMachineCount = 1,
    [string]$RequiredRuntimeIdleCpuScenario = "desktop-open",
    [string[]]$RequiredRuntimeCpuScenarioMatrixScenarios = @("startup-open", "runtime-started", "dashboard-open", "desktop-open", "post-route"),
    [int]$ScriptTimeoutSeconds = 120,
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

if ($ScriptTimeoutSeconds -lt 1) {
    throw "ScriptTimeoutSeconds must be at least 1."
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

function Invoke-JsonScript {
    param(
        [Parameter(Mandatory = $true)][string]$FilePath,
        [string[]]$Arguments = @(),
        [switch]$AllowFailure
    )

    $processArgs = @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $FilePath) + $Arguments

    function ConvertTo-ProcessArgument {
        param([Parameter(Mandatory = $true)][AllowEmptyString()][string]$Value)

        if ([string]::IsNullOrEmpty($Value)) {
            return '""'
        }
        if ($Value -notmatch '[\s"]') {
            return $Value
        }
        return '"' + ($Value.Replace('"', '\"')) + '"'
    }

    $watch = [Diagnostics.Stopwatch]::StartNew()
    $startInfo = New-Object System.Diagnostics.ProcessStartInfo
    $startInfo.FileName = Get-CurrentPowerShellExecutable
    $startInfo.Arguments = (($processArgs | ForEach-Object { ConvertTo-ProcessArgument -Value ([string]$_) }) -join " ")
    $startInfo.WorkingDirectory = $repoRoot
    $startInfo.UseShellExecute = $false
    $startInfo.RedirectStandardOutput = $true
    $startInfo.RedirectStandardError = $true
    $startInfo.CreateNoWindow = $true

    $process = $null
    $startError = $null
    try {
        $process = [System.Diagnostics.Process]::Start($startInfo)
    }
    catch {
        $startError = $_.Exception.Message
    }

    if (-not $process) {
        $watch.Stop()
        if (-not $AllowFailure) {
            throw "Script failed to start: $FilePath`n$startError"
        }
        return [pscustomobject]@{
            exit_code = -1
            timed_out = $false
            elapsed_ms = [int]$watch.ElapsedMilliseconds
            json = $null
            raw = $startError
            stderr = $startError
        }
    }

    $stdoutTask = $process.StandardOutput.ReadToEndAsync()
    $stderrTask = $process.StandardError.ReadToEndAsync()
    $completed = $process.WaitForExit($ScriptTimeoutSeconds * 1000)
    $timedOut = -not $completed
    if ($timedOut) {
        try {
            $process.Kill()
        }
        catch {
        }
        $process.WaitForExit()
    }
    $watch.Stop()

    $exitCode = if ($timedOut) { -1 } else { $process.ExitCode }
    try { $stdoutTask.Wait(5000) | Out-Null } catch { }
    try { $stderrTask.Wait(5000) | Out-Null } catch { }
    $text = if ($stdoutTask.IsCompleted) { ([string]$stdoutTask.Result).Trim() } else { "" }
    $stderr = if ($stderrTask.IsCompleted) { ([string]$stderrTask.Result).Trim() } else { "" }
    $rawText = @($text, $stderr) | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }
    $raw = ($rawText -join "`n").Trim()
    $parsed = $null
    if (-not [string]::IsNullOrWhiteSpace($text)) {
        try {
            $parsed = $text | ConvertFrom-Json
        }
        catch {
            if (-not $AllowFailure) {
                throw "Script did not return parseable JSON: $FilePath`n$raw"
            }
        }
    }

    if ($timedOut -and -not $AllowFailure) {
        throw "Script timed out after ${ScriptTimeoutSeconds}s: $FilePath"
    }

    if ($exitCode -ne 0 -and -not $AllowFailure) {
        throw "Script failed with exit code ${exitCode}: $FilePath`n$raw"
    }

    [pscustomobject]@{
        exit_code = $exitCode
        timed_out = [bool]$timedOut
        elapsed_ms = [int]$watch.ElapsedMilliseconds
        json = $parsed
        raw = $raw
        stderr = $stderr
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

function Test-ObjectHasPropertyNames {
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

function Test-AuditCheckPassed {
    param(
        $Audit,
        [Parameter(Mandatory = $true)][string]$Scope,
        [Parameter(Mandatory = $true)][string]$Name
    )

    if (-not $Audit -or -not $Audit.PSObject.Properties["checks"] -or $null -eq $Audit.checks) {
        return $false
    }

    return @($Audit.checks | Where-Object {
            [string]$_.scope -eq $Scope -and
            [string]$_.name -eq $Name -and
            [string]$_.status -eq "pass"
        }).Count -gt 0
}

function New-IdleBusyLoopCandidateStatus {
    param(
        [Parameter(Mandatory = $true)][string]$Candidate,
        [Parameter(Mandatory = $true)][string]$AuditName,
        $Audit,
        [Parameter(Mandatory = $true)][object[]]$RequiredChecks,
        [Parameter(Mandatory = $true)][string]$Evidence
    )

    $checkResults = @($RequiredChecks | ForEach-Object {
            $passed = Test-AuditCheckPassed -Audit $Audit -Scope ([string]$_.scope) -Name ([string]$_.name)
            [pscustomobject]@{
                scope = [string]$_.scope
                name = [string]$_.name
                passed = [bool]$passed
            }
        })

    [pscustomobject]@{
        candidate = $Candidate
        verified = @($checkResults | Where-Object { -not [bool]$_.passed }).Count -eq 0
        audit = $AuditName
        evidence = $Evidence
        checks = $checkResults
    }
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
        "scripts/windows/repair-packaged-local-runtime-state.ps1",
        "scripts/windows/record-msix-install-evidence.ps1",
        "scripts/windows/record-multidevice-evidence.ps1",
        "scripts/windows/record-external-release-gate-recheck.ps1",
        "scripts/windows/record-p2p-control-plane-evidence.ps1",
        "scripts/windows/record-single-machine-evidence.ps1",
        "scripts/windows/run-second-pc-release-check.ps1",
        "scripts/windows/smoke-multidevice-beta.ps1",
        "scripts/windows/smoke-single-machine-beta.ps1",
        "scripts/windows/verify-installed-msix-package.ps1",
        "scripts/windows/verify-final-operator-gate-packet.ps1",
        "scripts/windows/verify-msix-install-evidence.ps1",
        "scripts/windows/verify-multidevice-evidence.ps1",
        "scripts/windows/verify-operator-action-pack.ps1",
        "scripts/windows/verify-p2p-control-plane-evidence.ps1",
        "scripts/windows/verify-runtime-cpu-scenario-matrix.ps1",
        "scripts/windows/verify-single-machine-evidence.ps1",
        "scripts/windows/verify-store-submission-bundle.ps1",
        "scripts/windows/show-final-release-handoff-status.ps1",
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

function Select-LatestEvidenceCandidatesByMachine {
    param(
        [object[]]$Candidates = @(),
        [int]$MaxPerMachine = 3,
        [int]$MaxUnknown = 6
    )

    $selected = New-Object System.Collections.Generic.List[object]
    $byMachine = @{}
    $unknownCount = 0

    foreach ($candidate in @($Candidates | Sort-Object LastWriteTime -Descending)) {
        $machine = $null
        try {
            $candidateJson = Get-Content -LiteralPath $candidate.FullName -Raw | ConvertFrom-Json
            $machine = [string]$candidateJson.operator_machine
            if ([string]::IsNullOrWhiteSpace($machine) -and $candidateJson.measurement) {
                $machine = [string]$candidateJson.measurement.operator_machine
            }
        }
        catch {
            $machine = $null
        }

        if ([string]::IsNullOrWhiteSpace($machine)) {
            if ($unknownCount -lt $MaxUnknown) {
                $selected.Add($candidate) | Out-Null
                $unknownCount += 1
            }
            continue
        }

        if (-not $byMachine.ContainsKey($machine)) {
            $byMachine[$machine] = 0
        }
        if ([int]$byMachine[$machine] -lt $MaxPerMachine) {
            $selected.Add($candidate) | Out-Null
            $byMachine[$machine] = [int]$byMachine[$machine] + 1
        }
    }

    @($selected.ToArray() | Sort-Object LastWriteTime -Descending)
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
    $cpuAttributionRoleNames = @("musu", "node", "webview2", "other")
    $cpuAttributionSubroleNames = @("musu_runtime", "bridge_runtime", "desktop_shell", "node_helper", "webview2_helper", "other")
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

        $memoryBySubrolePresent = $evidence.PSObject.Properties["memory_totals_by_subrole_mb"]
        $checks.Add((New-Check -Name "memory by subrole present" -Status ($(if ($memoryBySubrolePresent) { "pass" } else { "fail" })) -Message ($(if ($memoryBySubrolePresent) { "memory totals by bridge/runtime/desktop/helper subrole are recorded" } else { "memory totals by subrole are missing" })))) | Out-Null

        $processCountsByRole = if ($evidence.PSObject.Properties["process_counts_by_role"]) { $evidence.process_counts_by_role } else { $null }
        $processCountsByRolePresent = Test-ObjectHasPropertyNames -Object $processCountsByRole -Names $cpuAttributionRoleNames
        $checks.Add((New-Check -Name "process counts by role present" -Status ($(if ($processCountsByRolePresent) { "pass" } else { "fail" })) -Message ($(if ($processCountsByRolePresent) { "process counts by MUSU/node/WebView2/other role are recorded" } else { "process counts by role are missing MUSU/node/WebView2/other fields" })))) | Out-Null

        $processCountsBySubrole = if ($evidence.PSObject.Properties["process_counts_by_subrole"]) { $evidence.process_counts_by_subrole } else { $null }
        $processCountsBySubrolePresent = Test-ObjectHasPropertyNames -Object $processCountsBySubrole -Names $cpuAttributionSubroleNames
        $checks.Add((New-Check -Name "process counts by subrole present" -Status ($(if ($processCountsBySubrolePresent) { "pass" } else { "fail" })) -Message ($(if ($processCountsBySubrolePresent) { "process counts by bridge/runtime/desktop/helper subrole are recorded" } else { "process counts by subrole are missing or incomplete" })))) | Out-Null

        $bridgeRuntimeProcessCount = if ($processCountsBySubrolePresent -and $processCountsBySubrole.PSObject.Properties["bridge_runtime"]) { [int]$processCountsBySubrole.bridge_runtime } else { 0 }
        $checks.Add((New-Check -Name "bridge runtime process separated" -Status ($(if ($bridgeRuntimeProcessCount -ge 1) { "pass" } else { "fail" })) -Message ($(if ($bridgeRuntimeProcessCount -ge 1) { "bridge runtime process is separated from generic MUSU role" } else { "bridge runtime process was not separated in process_counts_by_subrole" })))) | Out-Null

        $desktopShellProcessCount = if ($processCountsBySubrolePresent -and $processCountsBySubrole.PSObject.Properties["desktop_shell"]) { [int]$processCountsBySubrole.desktop_shell } else { 0 }
        $checks.Add((New-Check -Name "desktop shell process separated" -Status ($(if ($desktopShellProcessCount -ge 1) { "pass" } else { "fail" })) -Message ($(if ($desktopShellProcessCount -ge 1) { "desktop shell process is separated from bridge/runtime" } else { "desktop shell process was not separated in process_counts_by_subrole" })))) | Out-Null

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

        $cpuAttribution = if ($evidence.PSObject.Properties["cpu_attribution"]) { $evidence.cpu_attribution } else { $null }
        $cpuAttributionPresent = ($null -ne $cpuAttribution)
        $checks.Add((New-Check -Name "CPU attribution present" -Status ($(if ($cpuAttributionPresent) { "pass" } else { "fail" })) -Message ($(if ($cpuAttributionPresent) { "runtime idle evidence includes PID/role CPU attribution summary" } else { "runtime idle evidence is missing cpu_attribution" })))) | Out-Null
        if ($cpuAttributionPresent) {
            $attributionSchema = if ($cpuAttribution.PSObject.Properties["schema"]) { [string]$cpuAttribution.schema } else { "" }
            $checks.Add((New-Check -Name "CPU attribution schema" -Status ($(if ($attributionSchema -eq "musu.runtime_idle_cpu_attribution.v1") { "pass" } else { "fail" })) -Message ($(if ($attributionSchema -eq "musu.runtime_idle_cpu_attribution.v1") { "CPU attribution schema is valid" } else { "CPU attribution schema is '$attributionSchema'" })))) | Out-Null

            $attributionSampleCount = if ($cpuAttribution.PSObject.Properties["sample_count"]) { [int]$cpuAttribution.sample_count } else { -1 }
            $checks.Add((New-Check -Name "CPU attribution sample count" -Status ($(if ($attributionSampleCount -eq $sampleCount -and $attributionSampleCount -gt 0) { "pass" } else { "fail" })) -Message ($(if ($attributionSampleCount -eq $sampleCount -and $attributionSampleCount -gt 0) { "CPU attribution sample count matches samples" } else { "CPU attribution sample count $attributionSampleCount does not match samples $sampleCount" })))) | Out-Null

            $sampleCountByRole = if ($cpuAttribution.PSObject.Properties["sample_count_by_role"]) { $cpuAttribution.sample_count_by_role } else { $null }
            $sampleCountByRolePresent = Test-ObjectHasPropertyNames -Object $sampleCountByRole -Names $cpuAttributionRoleNames
            $checks.Add((New-Check -Name "CPU attribution role counts" -Status ($(if ($sampleCountByRolePresent) { "pass" } else { "fail" })) -Message ($(if ($sampleCountByRolePresent) { "CPU attribution records MUSU/node/WebView2/other sample counts by role" } else { "CPU attribution is missing MUSU/node/WebView2/other role sample counts" })))) | Out-Null

            $sampleCountBySubrole = if ($cpuAttribution.PSObject.Properties["sample_count_by_subrole"]) { $cpuAttribution.sample_count_by_subrole } else { $null }
            $sampleCountBySubrolePresent = Test-ObjectHasPropertyNames -Object $sampleCountBySubrole -Names $cpuAttributionSubroleNames
            $checks.Add((New-Check -Name "CPU attribution subrole counts" -Status ($(if ($sampleCountBySubrolePresent) { "pass" } else { "fail" })) -Message ($(if ($sampleCountBySubrolePresent) { "CPU attribution records sample counts by bridge/runtime/desktop/helper subrole" } else { "CPU attribution is missing subrole sample counts" })))) | Out-Null

            $totalCpuByRole = if ($cpuAttribution.PSObject.Properties["total_cpu_seconds_by_role"]) { $cpuAttribution.total_cpu_seconds_by_role } else { $null }
            $totalCpuByRolePresent = Test-ObjectHasPropertyNames -Object $totalCpuByRole -Names $cpuAttributionRoleNames
            $checks.Add((New-Check -Name "CPU attribution totals by role" -Status ($(if ($totalCpuByRolePresent) { "pass" } else { "fail" })) -Message ($(if ($totalCpuByRolePresent) { "CPU attribution records MUSU/node/WebView2/other CPU totals by role" } else { "CPU attribution is missing MUSU/node/WebView2/other CPU totals by role" })))) | Out-Null

            $totalCpuBySubrole = if ($cpuAttribution.PSObject.Properties["total_cpu_seconds_by_subrole"]) { $cpuAttribution.total_cpu_seconds_by_subrole } else { $null }
            $totalCpuBySubrolePresent = Test-ObjectHasPropertyNames -Object $totalCpuBySubrole -Names $cpuAttributionSubroleNames
            $checks.Add((New-Check -Name "CPU attribution totals by subrole" -Status ($(if ($totalCpuBySubrolePresent) { "pass" } else { "fail" })) -Message ($(if ($totalCpuBySubrolePresent) { "CPU attribution records total CPU seconds by bridge/runtime/desktop/helper subrole" } else { "CPU attribution is missing CPU totals by subrole" })))) | Out-Null

            $maxCpuByRole = if ($cpuAttribution.PSObject.Properties["max_one_core_percent_by_role"]) { $cpuAttribution.max_one_core_percent_by_role } else { $null }
            $maxCpuByRolePresent = Test-ObjectHasPropertyNames -Object $maxCpuByRole -Names $cpuAttributionRoleNames
            $checks.Add((New-Check -Name "CPU attribution max by role" -Status ($(if ($maxCpuByRolePresent) { "pass" } else { "fail" })) -Message ($(if ($maxCpuByRolePresent) { "CPU attribution records MUSU/node/WebView2/other max one-core CPU by role" } else { "CPU attribution is missing MUSU/node/WebView2/other max CPU by role" })))) | Out-Null

            $maxCpuBySubrole = if ($cpuAttribution.PSObject.Properties["max_one_core_percent_by_subrole"]) { $cpuAttribution.max_one_core_percent_by_subrole } else { $null }
            $maxCpuBySubrolePresent = Test-ObjectHasPropertyNames -Object $maxCpuBySubrole -Names $cpuAttributionSubroleNames
            $checks.Add((New-Check -Name "CPU attribution max by subrole" -Status ($(if ($maxCpuBySubrolePresent) { "pass" } else { "fail" })) -Message ($(if ($maxCpuBySubrolePresent) { "CPU attribution records max one-core CPU by bridge/runtime/desktop/helper subrole" } else { "CPU attribution is missing max CPU by subrole" })))) | Out-Null

            $requiredRoles = if ($cpuAttribution.PSObject.Properties["required_roles_present"]) { $cpuAttribution.required_roles_present } else { $null }
            $musuRolePresent = ($requiredRoles -and $requiredRoles.PSObject.Properties["musu"] -and [bool]$requiredRoles.musu)
            $checks.Add((New-Check -Name "CPU attribution MUSU role" -Status ($(if ($musuRolePresent) { "pass" } else { "fail" })) -Message ($(if ($musuRolePresent) { "CPU attribution includes MUSU process role" } else { "CPU attribution is missing MUSU process role" })))) | Out-Null
            $webView2RoleRequiredAndPresent = (-not $requireOwnedWebView2 -or ($requiredRoles -and $requiredRoles.PSObject.Properties["webview2"] -and [bool]$requiredRoles.webview2))
            $checks.Add((New-Check -Name "CPU attribution WebView2 role" -Status ($(if ($webView2RoleRequiredAndPresent) { "pass" } else { "fail" })) -Message ($(if ($webView2RoleRequiredAndPresent) { "CPU attribution includes required owned WebView2 role" } else { "CPU attribution is missing required owned WebView2 role" })))) | Out-Null

            $requiredSubroles = if ($cpuAttribution.PSObject.Properties["required_subroles_present"]) { $cpuAttribution.required_subroles_present } else { $null }
            $bridgeRuntimeSubrolePresent = ($requiredSubroles -and $requiredSubroles.PSObject.Properties["bridge_runtime"] -and [bool]$requiredSubroles.bridge_runtime)
            $checks.Add((New-Check -Name "CPU attribution bridge subrole" -Status ($(if ($bridgeRuntimeSubrolePresent) { "pass" } else { "fail" })) -Message ($(if ($bridgeRuntimeSubrolePresent) { "CPU attribution includes bridge runtime subrole" } else { "CPU attribution is missing bridge runtime subrole" })))) | Out-Null
            $desktopShellSubrolePresent = ($requiredSubroles -and $requiredSubroles.PSObject.Properties["desktop_shell"] -and [bool]$requiredSubroles.desktop_shell)
            $checks.Add((New-Check -Name "CPU attribution desktop shell subrole" -Status ($(if ($desktopShellSubrolePresent) { "pass" } else { "fail" })) -Message ($(if ($desktopShellSubrolePresent) { "CPU attribution includes desktop shell subrole" } else { "CPU attribution is missing desktop shell subrole" })))) | Out-Null

            $topProcesses = @(
                if ($cpuAttribution.PSObject.Properties["top_processes"]) {
                    @($cpuAttribution.top_processes)
                }
            )
            $topProcessesPresent = ($topProcesses.Count -gt 0)
            $checks.Add((New-Check -Name "CPU attribution top processes" -Status ($(if ($topProcessesPresent) { "pass" } else { "fail" })) -Message ($(if ($topProcessesPresent) { "$($topProcesses.Count) top CPU process attribution row(s) recorded" } else { "CPU attribution top_processes is empty" })))) | Out-Null

            $badTopProcessRows = @(
                foreach ($row in $topProcesses) {
                    $rowId = if ($row.PSObject.Properties["id"]) { [int]$row.id } else { 0 }
                    $rowName = if ($row.PSObject.Properties["process_name"]) { [string]$row.process_name } else { "" }
                    $rowRole = if ($row.PSObject.Properties["process_role"]) { [string]$row.process_role } else { "" }
                    $rowSubrole = if ($row.PSObject.Properties["process_subrole"]) { [string]$row.process_subrole } else { "" }
                    $hasCpuDelta = $row.PSObject.Properties["cpu_seconds_delta"]
                    $hasCpuPct = $row.PSObject.Properties["cpu_pct_one_core"]
                    if ($rowId -le 0 -or [string]::IsNullOrWhiteSpace($rowName) -or ($rowRole -notin @("musu", "node", "webview2", "other")) -or ($rowSubrole -notin $cpuAttributionSubroleNames) -or -not $hasCpuDelta -or -not $hasCpuPct) {
                        $row
                    }
                }
            )
            $checks.Add((New-Check -Name "CPU attribution top process fields" -Status ($(if ($badTopProcessRows.Count -eq 0 -and $topProcessesPresent) { "pass" } else { "fail" })) -Message ($(if ($badTopProcessRows.Count -eq 0 -and $topProcessesPresent) { "top CPU process rows include PID, role, subrole, and CPU delta fields" } else { "$($badTopProcessRows.Count) top CPU process row(s) are missing required attribution fields" })))) | Out-Null
        }
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

        $nonPackagedRuntime = if ($counts -and $counts.PSObject.Properties["non_packaged_runtime"]) { [int]$counts.non_packaged_runtime } else { 1 }
        $checks.Add((New-Check -Name "packaged runtime identity" -Status ($(if ($nonPackagedRuntime -eq 0) { "pass" } else { "fail" })) -Message ($(if ($nonPackagedRuntime -eq 0) { "all MUSU runtime processes were packaged WindowsApps runtime(s)" } else { "$nonPackagedRuntime MUSU runtime process(es) were not packaged WindowsApps runtime(s)" })))) | Out-Null

        $nonPackagedDesktop = if ($counts -and $counts.PSObject.Properties["non_packaged_desktop_shell"]) { [int]$counts.non_packaged_desktop_shell } else { 1 }
        $checks.Add((New-Check -Name "packaged desktop shell identity" -Status ($(if ($nonPackagedDesktop -eq 0) { "pass" } else { "fail" })) -Message ($(if ($nonPackagedDesktop -eq 0) { "desktop shell processes were packaged WindowsApps runtime(s) or absent" } else { "$nonPackagedDesktop MUSU desktop shell process(es) were not packaged WindowsApps runtime(s)" })))) | Out-Null

        $bridge = $evidence.bridge_registry
        $bridgePidAlive = ($bridge -and $bridge.PSObject.Properties["pid_alive"] -and [bool]$bridge.pid_alive)
        $checks.Add((New-Check -Name "bridge registry pid alive" -Status ($(if ($bridgePidAlive) { "pass" } else { "fail" })) -Message ($(if ($bridgePidAlive) { "bridge registry pid is alive" } else { "bridge registry pid is missing or dead" })))) | Out-Null

        $bridgeHealthOk = ($bridge -and $bridge.PSObject.Properties["health"] -and [bool]$bridge.health.ok)
        $checks.Add((New-Check -Name "bridge health" -Status ($(if ($bridgeHealthOk) { "pass" } else { "fail" })) -Message ($(if ($bridgeHealthOk) { "bridge /health passed" } else { "bridge /health did not pass" })))) | Out-Null

        $identity = if ($evidence.PSObject.Properties["packaged_runtime_identity"]) { $evidence.packaged_runtime_identity } else { $null }
        $bridgePackagedRuntime = ($identity -and $identity.PSObject.Properties["bridge_pid_packaged_runtime"] -and [bool]$identity.bridge_pid_packaged_runtime)
        $checks.Add((New-Check -Name "bridge packaged runtime identity" -Status ($(if ($bridgePackagedRuntime) { "pass" } else { "fail" })) -Message ($(if ($bridgePackagedRuntime) { "bridge registry PID belongs to the packaged WindowsApps runtime" } else { "bridge registry PID is not proven to belong to the packaged WindowsApps runtime" })))) | Out-Null

        $dashboardRepoRelated = if ($identity -and $identity.PSObject.Properties["dashboard_pid_repo_related"]) { [bool]$identity.dashboard_pid_repo_related } else { $true }
        $checks.Add((New-Check -Name "dashboard server identity" -Status ($(if (-not $dashboardRepoRelated) { "pass" } else { "fail" })) -Message ($(if (-not $dashboardRepoRelated) { "dashboard listener is absent or not repo/workspace-backed" } else { "dashboard listener is repo/workspace-backed or identity evidence is missing" })))) | Out-Null
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

        $musuExe = if ($evidence.PSObject.Properties["musu_exe"]) { [string]$evidence.musu_exe } else { "" }
        $musuExeLower = $musuExe.ToLowerInvariant()
        $startupUsesPackagedCommand = (
            $musuExeLower.Contains("\microsoft\windowsapps\musu.exe") -or
            $musuExeLower.Contains("\windowsapps\yellowhama.musu_") -or
            $musuExeLower.Contains("\program files\windowsapps\yellowhama.musu_")
        )
        $checks.Add((New-Check -Name "startup executable release identity" -Status ($(if ($startupUsesPackagedCommand) { "pass" } else { "fail" })) -Message ($(if ($startupUsesPackagedCommand) { "startup evidence used the packaged WindowsApps MUSU command" } else { "startup evidence used a non-packaged MUSU command: '$musuExe'" })))) | Out-Null

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

        $ownership = if ($evidence.PSObject.Properties["process_ownership"]) { $evidence.process_ownership } else { $null }
        $ownershipOk = ($ownership -and $ownership.PSObject.Properties["ok"] -and [bool]$ownership.ok)
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
$frontendPollingAuditScript = Join-Path $scriptDir "audit-frontend-polling-contract.ps1"
$rustBackgroundLoopAuditScript = Join-Path $scriptDir "audit-rust-background-loop-contract.ps1"
$localApiAuthAuditScript = Join-Path $scriptDir "audit-local-api-auth-contract.ps1"
$operatorApiSecurityAuditScript = Join-Path $scriptDir "audit-operator-api-security-contract.ps1"
$degradedModeAuditScript = Join-Path $scriptDir "audit-degraded-mode-contract.ps1"
$p2pStoreForwardRelayAuditScript = Join-Path $scriptDir "audit-p2p-store-forward-relay-contract.ps1"
$secretStorageAuditScript = Join-Path $scriptDir "audit-secret-storage-contract.ps1"
$metadataScript = Join-Path $scriptDir "verify-store-public-metadata.ps1"
$manifestScript = Join-Path $scriptDir "write-release-candidate-manifest.ps1"
$supportMailboxVerifierScript = Join-Path $scriptDir "verify-support-mailbox-evidence.ps1"
$msixInstallVerifierScript = Join-Path $scriptDir "verify-msix-install-evidence.ps1"
$msixDesktopEntrypointAuditScript = Join-Path $scriptDir "audit-msix-desktop-entrypoint.ps1"
$msixLegacyConflictsScript = Join-Path $scriptDir "check-msix-legacy-conflicts.ps1"
$storeReleaseVerifierScript = Join-Path $scriptDir "verify-store-release-evidence.ps1"
$runtimeCpuScenarioMatrixVerifierScript = Join-Path $scriptDir "verify-runtime-cpu-scenario-matrix.ps1"
$p2pControlPlaneVerifierScript = Join-Path $scriptDir "verify-p2p-control-plane-evidence.ps1"
$manifestPath = Join-Path $repoRoot ".local-build\release-candidates\$version\release-candidate-manifest.json"

$auditResult = Invoke-JsonScript -FilePath $auditScript -Arguments @("-Json")
$audit = $auditResult.json
$frontendPollingAuditResult = Invoke-JsonScript -FilePath $frontendPollingAuditScript -Arguments @("-Json") -AllowFailure
$frontendPollingContractVerified = ($frontendPollingAuditResult.json -and [bool]$frontendPollingAuditResult.json.ok)
$rustBackgroundLoopAuditResult = Invoke-JsonScript -FilePath $rustBackgroundLoopAuditScript -Arguments @("-Json") -AllowFailure
$rustBackgroundLoopContractVerified = ($rustBackgroundLoopAuditResult.json -and [bool]$rustBackgroundLoopAuditResult.json.ok)
$localApiAuthAuditResult = Invoke-JsonScript -FilePath $localApiAuthAuditScript -Arguments @("-Json") -AllowFailure
$localApiAuthContractVerified = ($localApiAuthAuditResult.json -and [bool]$localApiAuthAuditResult.json.ok)
$operatorApiSecurityAuditResult = Invoke-JsonScript -FilePath $operatorApiSecurityAuditScript -Arguments @("-Json") -AllowFailure
$operatorApiSecurityContractVerified = ($operatorApiSecurityAuditResult.json -and [bool]$operatorApiSecurityAuditResult.json.ok)
$degradedModeAuditResult = Invoke-JsonScript -FilePath $degradedModeAuditScript -Arguments @("-Json") -AllowFailure
$degradedModeContractVerified = ($degradedModeAuditResult.json -and [bool]$degradedModeAuditResult.json.ok)
$p2pStoreForwardRelayAuditResult = Invoke-JsonScript -FilePath $p2pStoreForwardRelayAuditScript -Arguments @("-Json") -AllowFailure
$p2pStoreForwardRelayContractVerified = ($p2pStoreForwardRelayAuditResult.json -and [bool]$p2pStoreForwardRelayAuditResult.json.ok)
$secretStorageAuditResult = Invoke-JsonScript -FilePath $secretStorageAuditScript -Arguments @("-Json") -AllowFailure
$secretStorageContractVerified = ($secretStorageAuditResult.json -and [bool]$secretStorageAuditResult.json.ok)
$msixStoreDesktopEntrypointArtifactAuditResult = Invoke-JsonScript `
    -FilePath $msixDesktopEntrypointAuditScript `
    -Arguments @("-StartupContract", "store-reviewed-immediate-registration", "-ExpectedApplicationExecutable", "musu-desktop.exe", "-Json") `
    -AllowFailure
$msixLocalDesktopEntrypointInstalledAuditResult = Invoke-JsonScript `
    -FilePath $msixDesktopEntrypointAuditScript `
    -Arguments @("-StartupContract", "local-sideload-manual", "-ExpectedApplicationExecutable", "musu-desktop.exe", "-RequireInstalledPackage", "-Json") `
    -AllowFailure
$msixLegacyConflictsResult = Invoke-JsonScript `
    -FilePath $msixLegacyConflictsScript `
    -Arguments @("-Json") `
    -AllowFailure
$msixCurrentLegacyConflictsOk = ($msixLegacyConflictsResult.json -and [bool]$msixLegacyConflictsResult.json.ok)
$msixDesktopEntrypointVerified = (
    $msixStoreDesktopEntrypointArtifactAuditResult.json -and
    [bool]$msixStoreDesktopEntrypointArtifactAuditResult.json.ok -and
    $msixLocalDesktopEntrypointInstalledAuditResult.json -and
    [bool]$msixLocalDesktopEntrypointInstalledAuditResult.json.ok
)

$manifestResult = Invoke-JsonScript -FilePath $manifestScript -AllowFailure
if ($manifestResult.timed_out) {
    throw "Release candidate manifest generation timed out after ${ScriptTimeoutSeconds}s."
}
if ($manifestResult.exit_code -ne 0) {
    throw "Release candidate manifest generation failed.`n$($manifestResult.raw)"
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
$msixInstallEvidenceCandidates = @()
$msixInstallEvidenceResults = @()
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
        $msixInstallEvidenceCandidates += @(Get-ChildItem -LiteralPath $root.path -Filter $root.filter -File -ErrorAction SilentlyContinue)
    }
}

$msixInstallSelectedCandidates = Select-LatestEvidenceCandidatesByMachine -Candidates $msixInstallEvidenceCandidates -MaxPerMachine 6 -MaxUnknown 6
foreach ($candidate in @($msixInstallSelectedCandidates | Sort-Object LastWriteTime -Descending)) {
    $msixInstallEvidenceResult = Invoke-JsonScript `
        -FilePath $msixInstallVerifierScript `
        -Arguments @("-EvidencePath", $candidate.FullName, "-ExpectedVersion", $version, "-Json") `
        -AllowFailure
    if ($msixInstallEvidenceResult.json) {
        $msixInstallEvidenceResults += $msixInstallEvidenceResult.json
    }
    else {
        $msixInstallEvidenceResults += [pscustomobject]@{
            ok = $false
            evidence_path = $candidate.FullName
            raw = $msixInstallEvidenceResult.raw
        }
    }
    if ($msixInstallEvidenceResult.json -and [bool]$msixInstallEvidenceResult.json.ok) {
        $msixInstallVerified = $true
        $msixInstallEvidence = $msixInstallEvidenceResult.json
        break
    }
}

if (-not $msixInstallVerified) {
    if ($msixInstallEvidenceResults.Count -gt 0) {
        $msixInstallEvidence = [pscustomobject]@{
            ok = $false
            candidate_count = $msixInstallEvidenceResults.Count
            available_candidate_count = @($msixInstallEvidenceCandidates).Count
            candidate_selection = "latest-per-machine-up-to-6"
            candidates = $msixInstallEvidenceResults
        }
    }
    elseif (@($msixInstallEvidenceCandidates).Count -gt 0) {
        $msixInstallEvidence = [pscustomobject]@{
            ok = $false
            candidate_count = 0
            available_candidate_count = @($msixInstallEvidenceCandidates).Count
            candidate_selection = "latest-per-machine-up-to-6"
            candidates = @()
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
$runtimeIdleCpuSelectedCandidates = Select-LatestEvidenceCandidatesByMachine -Candidates $runtimeIdleCpuEvidenceCandidates -MaxPerMachine 3 -MaxUnknown 6
foreach ($candidate in @($runtimeIdleCpuSelectedCandidates | Sort-Object LastWriteTime -Descending)) {
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
    available_candidate_count = @($runtimeIdleCpuEvidenceCandidates).Count
    candidate_selection = "latest-per-machine"
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
$runtimeCpuScenarioMatrixSelectedCandidates = Select-LatestEvidenceCandidatesByMachine -Candidates $runtimeCpuScenarioMatrixCandidates -MaxPerMachine 12 -MaxUnknown 12
foreach ($candidate in @($runtimeCpuScenarioMatrixSelectedCandidates | Sort-Object LastWriteTime -Descending)) {
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
    available_candidate_count = @($runtimeCpuScenarioMatrixCandidates).Count
    candidate_selection = "latest-per-machine-up-to-12"
    required_scenarios = @($RequiredRuntimeCpuScenarioMatrixScenarios)
    candidates = $runtimeCpuScenarioMatrixResults
}

$runtimeCpuSecondPcRouteAttemptVerified = $false
$runtimeCpuSecondPcRouteAttemptResults = @()
$runtimeCpuSecondPcRouteAttemptMachines = New-Object 'System.Collections.Generic.HashSet[string]' ([System.StringComparer]::OrdinalIgnoreCase)
$runtimeCpuSecondPcRouteAttemptRequiredScenarios = @("post-route")
foreach ($candidate in @($runtimeCpuScenarioMatrixSelectedCandidates | Sort-Object LastWriteTime -Descending)) {
    $targetAttemptArgs = @(
        "-EvidencePath", $candidate.FullName,
        "-ExpectedVersion", $version,
        "-ExpectedGitCommit", $currentGitCommit,
        "-RequiredScenarios", ($runtimeCpuSecondPcRouteAttemptRequiredScenarios -join ",")
    ) + @(
        "-MinSampleSeconds", ([string]$MinRuntimeIdleCpuSampleSeconds),
        "-MaxOneCorePercent", ([string]$MaxRuntimeIdleCpuOneCorePercent),
        "-RequirePostRouteProbe",
        "-RequirePostRouteTarget",
        "-AllowFailedPostRouteProbe",
        "-Json"
    )
    $verification = Invoke-JsonScript `
        -FilePath $runtimeCpuScenarioMatrixVerifierScript `
        -Arguments $targetAttemptArgs `
        -AllowFailure
    $runtimeCpuSecondPcRouteAttemptResults += if ($verification.json) {
        $verification.json
    }
    else {
        [pscustomobject]@{
            ok = $false
            evidence_path = $candidate.FullName
            raw = $verification.raw
        }
    }
    $latestTargetAttemptResult = $runtimeCpuSecondPcRouteAttemptResults | Select-Object -Last 1
    if ([bool]$latestTargetAttemptResult.ok -and -not [string]::IsNullOrWhiteSpace([string]$latestTargetAttemptResult.operator_machine)) {
        [void]$runtimeCpuSecondPcRouteAttemptMachines.Add([string]$latestTargetAttemptResult.operator_machine)
    }
}

$runtimeCpuSecondPcRouteAttemptVerified = ($runtimeCpuSecondPcRouteAttemptMachines.Count -ge $MinRuntimeCpuSecondPcRouteAttemptMachineCount)
$runtimeCpuSecondPcRouteAttemptEvidence = [pscustomobject]@{
    ok = [bool]$runtimeCpuSecondPcRouteAttemptVerified
    min_machine_count = $MinRuntimeCpuSecondPcRouteAttemptMachineCount
    valid_machine_count = $runtimeCpuSecondPcRouteAttemptMachines.Count
    valid_machines = @($runtimeCpuSecondPcRouteAttemptMachines)
    candidate_count = $runtimeCpuSecondPcRouteAttemptResults.Count
    available_candidate_count = @($runtimeCpuScenarioMatrixCandidates).Count
    candidate_selection = "latest-per-machine-up-to-12"
    required_scenarios = @($runtimeCpuSecondPcRouteAttemptRequiredScenarios)
    route_probe = "post-route target route attempt, success or explicitly allowed failure"
    candidates = $runtimeCpuSecondPcRouteAttemptResults
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
$processOwnershipSelectedCandidates = Select-LatestEvidenceCandidatesByMachine -Candidates $processOwnershipEvidenceCandidates -MaxPerMachine 3 -MaxUnknown 6
foreach ($candidate in @($processOwnershipSelectedCandidates | Sort-Object LastWriteTime -Descending)) {
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
    available_candidate_count = @($processOwnershipEvidenceCandidates).Count
    candidate_selection = "latest-per-machine"
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
$startupSingleInstanceSelectedCandidates = Select-LatestEvidenceCandidatesByMachine -Candidates $startupSingleInstanceEvidenceCandidates -MaxPerMachine 3 -MaxUnknown 6
foreach ($candidate in @($startupSingleInstanceSelectedCandidates | Sort-Object LastWriteTime -Descending)) {
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
    available_candidate_count = @($startupSingleInstanceEvidenceCandidates).Count
    candidate_selection = "latest-per-machine"
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
$desktopSingleInstanceSelectedCandidates = Select-LatestEvidenceCandidatesByMachine -Candidates $desktopSingleInstanceEvidenceCandidates -MaxPerMachine 3 -MaxUnknown 6
foreach ($candidate in @($desktopSingleInstanceSelectedCandidates | Sort-Object LastWriteTime -Descending)) {
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
    available_candidate_count = @($desktopSingleInstanceEvidenceCandidates).Count
    candidate_selection = "latest-per-machine"
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

$p2pRelayTransportWired = $false
$p2pRelayRouteEvidenceOk = $false
$p2pRelayRouteEvidenceCount = -1
$p2pRelayRouteTransportProofValidCount = 0
$p2pRelayPayloadTransportProven = $false
$p2pRelayPayloadDeliveryProofValidCount = 0
$p2pRelayLeaseStoreReleaseGrade = $false
$p2pRelayStatusTransportPreflightOk = $false
$p2pRelayStatusTransportDescriptorWired = $false
$p2pRelayStatusPayloadEndpointWired = $false
$p2pRelayTransportPayloadEndpointWired = $false
$p2pOwnerScopeVerified = $false
if ($p2pControlPlaneEvidence) {
    if ($p2pControlPlaneEvidence.PSObject.Properties["relay_transport_wired"]) {
        $p2pRelayTransportWired = [bool]$p2pControlPlaneEvidence.relay_transport_wired
    }
    if ($p2pControlPlaneEvidence.PSObject.Properties["relay_status_transport_preflight_ok"]) {
        $p2pRelayStatusTransportPreflightOk = [bool]$p2pControlPlaneEvidence.relay_status_transport_preflight_ok
    }
    if ($p2pControlPlaneEvidence.PSObject.Properties["relay_status_transport_descriptor_wired"]) {
        $p2pRelayStatusTransportDescriptorWired = [bool]$p2pControlPlaneEvidence.relay_status_transport_descriptor_wired
    }
    if ($p2pControlPlaneEvidence.PSObject.Properties["relay_status_payload_endpoint_wired"]) {
        $p2pRelayStatusPayloadEndpointWired = [bool]$p2pControlPlaneEvidence.relay_status_payload_endpoint_wired
    }
    if ($p2pControlPlaneEvidence.PSObject.Properties["relay_transport_payload_endpoint_wired"]) {
        $p2pRelayTransportPayloadEndpointWired = [bool]$p2pControlPlaneEvidence.relay_transport_payload_endpoint_wired
    }
    if ($p2pControlPlaneEvidence.PSObject.Properties["relay_route_evidence_ok"]) {
        $p2pRelayRouteEvidenceOk = [bool]$p2pControlPlaneEvidence.relay_route_evidence_ok
    }
    if ($p2pControlPlaneEvidence.PSObject.Properties["relay_route_evidence_count"]) {
        $p2pRelayRouteEvidenceCount = [int]$p2pControlPlaneEvidence.relay_route_evidence_count
    }
    if ($p2pControlPlaneEvidence.PSObject.Properties["relay_route_transport_proof_valid_count"]) {
        $p2pRelayRouteTransportProofValidCount = [int]$p2pControlPlaneEvidence.relay_route_transport_proof_valid_count
    }
    if ($p2pControlPlaneEvidence.PSObject.Properties["relay_payload_transport_proven"]) {
        $p2pRelayPayloadTransportProven = [bool]$p2pControlPlaneEvidence.relay_payload_transport_proven
    }
    if ($p2pControlPlaneEvidence.PSObject.Properties["relay_payload_delivery_proof_valid_count"]) {
        $p2pRelayPayloadDeliveryProofValidCount = [int]$p2pControlPlaneEvidence.relay_payload_delivery_proof_valid_count
    }
    if ($p2pControlPlaneEvidence.PSObject.Properties["relay_lease_store_release_grade"]) {
        $p2pRelayLeaseStoreReleaseGrade = [bool]$p2pControlPlaneEvidence.relay_lease_store_release_grade
    }
    if ($p2pControlPlaneEvidence.PSObject.Properties["owner_scope_verified"]) {
        $p2pOwnerScopeVerified = [bool]$p2pControlPlaneEvidence.owner_scope_verified
    }
}

$idleBusyLoopCandidateStatuses = @(
    New-IdleBusyLoopCandidateStatus `
        -Candidate "clipboard polling" `
        -AuditName "rust-background-loop" `
        -Audit $rustBackgroundLoopAuditResult.json `
        -RequiredChecks @(
            [pscustomobject]@{ scope = "clipboard"; name = "clipboard opt-in env gate" },
            [pscustomobject]@{ scope = "clipboard"; name = "clipboard monitor sleep" }
        ) `
        -Evidence "Clipboard sync is off by default and, when explicitly enabled, sleeps between polls."
    New-IdleBusyLoopCandidateStatus `
        -Candidate "mDNS discovery" `
        -AuditName "rust-background-loop" `
        -Audit $rustBackgroundLoopAuditResult.json `
        -RequiredChecks @(
            [pscustomobject]@{ scope = "mdns"; name = "mDNS opt-in env gate" },
            [pscustomobject]@{ scope = "mdns"; name = "IPv6 separate opt-in" },
            [pscustomobject]@{ scope = "mdns"; name = "Tailscale separate opt-in" },
            [pscustomobject]@{ scope = "mdns"; name = "virtual interfaces separate opt-in" },
            [pscustomobject]@{ scope = "mdns"; name = "browse bounded by deadline" },
            [pscustomobject]@{ scope = "mdns"; name = "recv timeout bounded" },
            [pscustomobject]@{ scope = "mdns"; name = "disconnect breaks browse" }
        ) `
        -Evidence "mDNS is opt-in, noisy interface classes are separately gated, and explicit discovery is bounded."
    New-IdleBusyLoopCandidateStatus `
        -Candidate "health check retry loop" `
        -AuditName "rust-background-loop" `
        -Audit $rustBackgroundLoopAuditResult.json `
        -RequiredChecks @(
            [pscustomobject]@{ scope = "auto-update"; name = "health poll initial backoff" },
            [pscustomobject]@{ scope = "auto-update"; name = "health poll max backoff" },
            [pscustomobject]@{ scope = "auto-update"; name = "health poll sleep" }
        ) `
        -Evidence "Auto-update health polling has bounded initial delay, max backoff, and sleeps between checks."
    New-IdleBusyLoopCandidateStatus `
        -Candidate "bridge readiness wait loop" `
        -AuditName "rust-background-loop" `
        -Audit $rustBackgroundLoopAuditResult.json `
        -RequiredChecks @(
            [pscustomobject]@{ scope = "cli-bridge-health"; name = "bridge health poll initial backoff" },
            [pscustomobject]@{ scope = "cli-bridge-health"; name = "bridge health poll max backoff" },
            [pscustomobject]@{ scope = "cli-bridge-health"; name = "bridge readiness deadline" },
            [pscustomobject]@{ scope = "cli-bridge-health"; name = "bridge readiness backoff sleep" }
        ) `
        -Evidence "CLI bridge readiness waits are bounded by caller timeout and sleep with capped backoff between health checks."
    New-IdleBusyLoopCandidateStatus `
        -Candidate "frontend interval/refetch" `
        -AuditName "frontend-polling" `
        -Audit $frontendPollingAuditResult.json `
        -RequiredChecks @(
            [pscustomobject]@{ scope = "source"; name = "no direct setInterval in non-test frontend source" },
            [pscustomobject]@{ scope = "source"; name = "visibilitychange owned only by shared poller" },
            [pscustomobject]@{ scope = "poller"; name = "minimum interval clamp" },
            [pscustomobject]@{ scope = "poller"; name = "cleanup aborts task" },
            [pscustomobject]@{ scope = "poller"; name = "no interval timer in shared poller" }
        ) `
        -Evidence "Frontend polling uses shared one-shot low-duty polling with abort cleanup; direct intervals are banned."
    New-IdleBusyLoopCandidateStatus `
        -Candidate "relay payload target poller" `
        -AuditName "rust-background-loop" `
        -Audit $rustBackgroundLoopAuditResult.json `
        -RequiredChecks @(
            [pscustomobject]@{ scope = "relay-payload-poller"; name = "relay payload poller opt-in env gate" },
            [pscustomobject]@{ scope = "relay-payload-poller"; name = "poller default low duty interval" },
            [pscustomobject]@{ scope = "relay-payload-poller"; name = "poller minimum interval" },
            [pscustomobject]@{ scope = "relay-payload-poller"; name = "poller empty backoff cap" },
            [pscustomobject]@{ scope = "relay-payload-poller"; name = "poller hard backoff ceiling" },
            [pscustomobject]@{ scope = "relay-payload-poller"; name = "poller cancellation-aware sleep" }
        ) `
        -Evidence "Target-side relay polling is opt-in and uses bounded interval/backoff/cancellation."
    New-IdleBusyLoopCandidateStatus `
        -Candidate "cloud heartbeat" `
        -AuditName "rust-background-loop" `
        -Audit $rustBackgroundLoopAuditResult.json `
        -RequiredChecks @(
            [pscustomobject]@{ scope = "cloud-heartbeat"; name = "heartbeat default" },
            [pscustomobject]@{ scope = "cloud-heartbeat"; name = "heartbeat minimum floor" },
            [pscustomobject]@{ scope = "cloud-heartbeat"; name = "failure backoff exponent" },
            [pscustomobject]@{ scope = "cloud-heartbeat"; name = "failure backoff sleep" }
        ) `
        -Evidence "Cloud heartbeat defaults to low-duty cadence and sleeps with failure backoff."
    New-IdleBusyLoopCandidateStatus `
        -Candidate "log/telemetry flush loop" `
        -AuditName "rust-background-loop" `
        -Audit $rustBackgroundLoopAuditResult.json `
        -RequiredChecks @(
            [pscustomobject]@{ scope = "source"; name = "new rust loops must be audited" },
            [pscustomobject]@{ scope = "logging-telemetry"; name = "no background telemetry flush worker primitives" }
        ) `
        -Evidence "Rust source has no unaudited loop constructs and no background telemetry/log flush worker primitives."
)
$idleBusyLoopCandidateContractVerified = @($idleBusyLoopCandidateStatuses | Where-Object { -not [bool]$_.verified }).Count -eq 0

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
if (-not $msixCurrentLegacyConflictsOk) {
    $aliasShadowedBy = if ($msixLegacyConflictsResult.json -and $msixLegacyConflictsResult.json.PSObject.Properties["alias_shadowing"]) {
        (@($msixLegacyConflictsResult.json.alias_shadowing) | Where-Object { -not [string]::IsNullOrWhiteSpace([string]$_) }) -join "; "
    }
    else {
        ""
    }
    $aliasRemediation = if ($msixLegacyConflictsResult.json -and $msixLegacyConflictsResult.json.PSObject.Properties["alias_remediation"]) {
        [string]$msixLegacyConflictsResult.json.alias_remediation
    }
    else {
        "Run scripts/windows/check-msix-legacy-conflicts.ps1 and clear active startup helpers, scheduled tasks, legacy bins, or PATH alias shadowing before release."
    }
    Add-Blocker -List $blockers -Area "msix-current-legacy-conflicts" -Message "Current Windows install state has legacy startup, bin, scheduled-task, or PATH alias conflicts. Shadowing: '$aliasShadowedBy'. $aliasRemediation"
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
if (-not $runtimeCpuSecondPcRouteAttemptVerified) {
    Add-Blocker -List $blockers -Area "runtime-cpu-second-pc-route-attempt" -Message "Runtime CPU matrix evidence has not recorded a post-route CPU sample after a targeted second-PC route attempt on at least ${MinRuntimeCpuSecondPcRouteAttemptMachineCount} machine(s). Run measure-musu-runtime-cpu-scenarios.ps1 with -RunRouteProbe -RouteTarget <PEER_NAME> -AllowFailedRouteProbe."
}
if (-not $frontendPollingContractVerified) {
    Add-Blocker -List $blockers -Area "frontend-polling" -Message "Frontend polling contract audit (musu.frontend_polling_contract.v1) failed; dashboard/refetch/SSE loops are not proven to use cancellable low-duty polling and bounded reconnect."
}
if (-not $rustBackgroundLoopContractVerified) {
    Add-Blocker -List $blockers -Area "rust-background-loops" -Message "Rust background loop contract audit (musu.rust_background_loop_contract.v1) failed; bridge/planner/mDNS/clipboard/sync/auto-update loops are not proven to be opt-in, low-duty, timeout-bound, or allowlisted."
}
if (-not $idleBusyLoopCandidateContractVerified) {
    Add-Blocker -List $blockers -Area "idle-busy-loop-candidates" -Message "Idle busy-loop candidate contract summary failed; clipboard, mDNS, health check retry, bridge readiness wait, frontend polling, relay target polling, cloud heartbeat, and log/telemetry flush loops are not all proven gated, low-duty, bounded, cancellable, or absent."
}
if (-not $localApiAuthContractVerified) {
    Add-Blocker -List $blockers -Area "local-api-auth" -Message "Local API auth contract audit (musu.local_api_auth_contract.v1) failed; localhost bridge requests are not proven to require bearer auth by default with only an explicit trusted local bypass."
}
if (-not $operatorApiSecurityContractVerified) {
    Add-Blocker -List $blockers -Area "operator-api-security" -Message "Operator API security contract audit (musu.operator_api_security_contract.v1) failed; web-driven local control routes are not proven to require authenticated operators, command allowlists, explicit process-kill enablement, and audit logging."
}
if (-not $degradedModeContractVerified) {
    Add-Blocker -List $blockers -Area "degraded-mode" -Message "Degraded mode contract audit (musu.degraded_mode_contract.v1) failed; agents, device-status, nodes mesh, and COS synthesis surfaces are not proven to expose unavailable/stale/fallback state instead of presenting fabricated healthy state."
}
if (-not $p2pStoreForwardRelayContractVerified) {
    Add-Blocker -List $blockers -Area "p2p-store-forward-relay" -Message "P2P store-forward relay contract audit (musu.p2p_store_forward_relay_contract.v1) failed; queue fallback is not proven owner-scoped, lease-bound, non-default, non-release-grade, and separated from release tunnel transport."
}
if (-not $secretStorageContractVerified) {
    Add-Blocker -List $blockers -Area "secret-storage" -Message "Secret storage contract audit (musu.secret_storage_contract.v1) failed; bridge/account tokens, P2P secret helpers, evidence redaction, or production backup docs are not proven safe."
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
    Add-Blocker -List $blockers -Area "p2p-control-plane" -Message "Live $PublicMetadataBaseUrl P2P control-plane evidence has not verified owner-scoped release-grade relay lease storage, relay_default_data_path=false, relay status/transport descriptor and payload endpoint wired=true, and owner-scoped release-grade relay route evidence with relay_payload_transport_proven=true, count > 0, relay_route_transport_proof_valid_count > 0, and relay_payload_delivery_proof present."
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
    "Runtime CPU scenario matrix verification for startup-open/runtime-started/dashboard-open/desktop-open/post-route on primary and second Windows PC",
    "Current MSIX legacy conflict live check for startup helpers, scheduled tasks, legacy bins, and PATH alias shadowing",
    "Frontend polling contract audit for cancellable low-duty dashboard/refetch/SSE loops",
    "Rust background loop contract audit for opt-in mDNS/clipboard/planner and bounded bridge/sync/update loops",
    "Idle busy-loop candidate summary for clipboard, mDNS, health check retry, bridge readiness wait, frontend polling, relay target polling, cloud heartbeat, and log/telemetry flush loops",
    "Local API auth contract audit for default bearer-token enforcement on localhost bridge requests",
    "Operator API security contract audit for authenticated, allowlisted, audit-logged web-driven local control routes",
    "Degraded mode contract audit for explicit unavailable/stale/fallback state on agents, device-status, nodes mesh, and COS synthesis surfaces",
    "P2P store-forward relay contract audit for lease-bound non-default queue fallback and release tunnel separation",
    "Secret storage contract audit for token-file ACLs, raw-token redaction, and secret-safe operator docs",
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
    msix_current_legacy_conflicts_ok = [bool]$msixCurrentLegacyConflictsOk
    msix_current_legacy_conflicts = if ($msixLegacyConflictsResult.json) {
        $msixLegacyConflictsResult.json
    }
    else {
        [pscustomobject]@{ ok = $false; raw = $msixLegacyConflictsResult.raw }
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
    runtime_cpu_second_pc_route_attempt_verified = [bool]$runtimeCpuSecondPcRouteAttemptVerified
    runtime_cpu_second_pc_route_attempt_min_machine_count = $runtimeCpuSecondPcRouteAttemptEvidence.min_machine_count
    runtime_cpu_second_pc_route_attempt_valid_machine_count = $runtimeCpuSecondPcRouteAttemptEvidence.valid_machine_count
    runtime_cpu_second_pc_route_attempt_valid_machines = @($runtimeCpuSecondPcRouteAttemptEvidence.valid_machines)
    runtime_cpu_second_pc_route_attempt_candidate_count = $runtimeCpuSecondPcRouteAttemptEvidence.candidate_count
    runtime_cpu_second_pc_route_attempt_evidence = $runtimeCpuSecondPcRouteAttemptEvidence
    frontend_polling_contract_verified = [bool]$frontendPollingContractVerified
    frontend_polling_contract_audit = if ($frontendPollingAuditResult.json) {
        $frontendPollingAuditResult.json
    }
    else {
        [pscustomobject]@{
            ok = $false
            exit_code = $frontendPollingAuditResult.exit_code
            timed_out = $frontendPollingAuditResult.timed_out
            raw = $frontendPollingAuditResult.raw
        }
    }
    rust_background_loop_contract_verified = [bool]$rustBackgroundLoopContractVerified
    rust_background_loop_contract_audit = if ($rustBackgroundLoopAuditResult.json) {
        $rustBackgroundLoopAuditResult.json
    }
    else {
        [pscustomobject]@{
            ok = $false
            exit_code = $rustBackgroundLoopAuditResult.exit_code
            timed_out = $rustBackgroundLoopAuditResult.timed_out
            raw = $rustBackgroundLoopAuditResult.raw
        }
    }
    idle_busy_loop_candidate_contract_verified = [bool]$idleBusyLoopCandidateContractVerified
    idle_busy_loop_candidate_status = @($idleBusyLoopCandidateStatuses)
    local_api_auth_contract_verified = [bool]$localApiAuthContractVerified
    local_api_auth_contract_audit = if ($localApiAuthAuditResult.json) {
        $localApiAuthAuditResult.json
    }
    else {
        [pscustomobject]@{
            ok = $false
            exit_code = $localApiAuthAuditResult.exit_code
            timed_out = $localApiAuthAuditResult.timed_out
            raw = $localApiAuthAuditResult.raw
        }
    }
    operator_api_security_contract_verified = [bool]$operatorApiSecurityContractVerified
    operator_api_security_contract_audit = if ($operatorApiSecurityAuditResult.json) {
        $operatorApiSecurityAuditResult.json
    }
    else {
        [pscustomobject]@{
            ok = $false
            exit_code = $operatorApiSecurityAuditResult.exit_code
            timed_out = $operatorApiSecurityAuditResult.timed_out
            raw = $operatorApiSecurityAuditResult.raw
        }
    }
    degraded_mode_contract_verified = [bool]$degradedModeContractVerified
    degraded_mode_contract_audit = if ($degradedModeAuditResult.json) {
        $degradedModeAuditResult.json
    }
    else {
        [pscustomobject]@{
            ok = $false
            exit_code = $degradedModeAuditResult.exit_code
            timed_out = $degradedModeAuditResult.timed_out
            raw = $degradedModeAuditResult.raw
        }
    }
    p2p_store_forward_relay_contract_verified = [bool]$p2pStoreForwardRelayContractVerified
    p2p_store_forward_relay_contract_audit = if ($p2pStoreForwardRelayAuditResult.json) {
        $p2pStoreForwardRelayAuditResult.json
    }
    else {
        [pscustomobject]@{
            ok = $false
            exit_code = $p2pStoreForwardRelayAuditResult.exit_code
            timed_out = $p2pStoreForwardRelayAuditResult.timed_out
            raw = $p2pStoreForwardRelayAuditResult.raw
        }
    }
    secret_storage_contract_verified = [bool]$secretStorageContractVerified
    secret_storage_contract_audit = if ($secretStorageAuditResult.json) {
        $secretStorageAuditResult.json
    }
    else {
        [pscustomobject]@{
            ok = $false
            exit_code = $secretStorageAuditResult.exit_code
            timed_out = $secretStorageAuditResult.timed_out
            raw = $secretStorageAuditResult.raw
        }
    }
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
    p2p_owner_scope_verified = [bool]$p2pOwnerScopeVerified
    p2p_relay_lease_store_release_grade = [bool]$p2pRelayLeaseStoreReleaseGrade
    p2p_relay_transport_wired = [bool]$p2pRelayTransportWired
    p2p_relay_status_transport_preflight_ok = [bool]$p2pRelayStatusTransportPreflightOk
    p2p_relay_status_transport_descriptor_wired = [bool]$p2pRelayStatusTransportDescriptorWired
    p2p_relay_status_payload_endpoint_wired = [bool]$p2pRelayStatusPayloadEndpointWired
    p2p_relay_transport_payload_endpoint_wired = [bool]$p2pRelayTransportPayloadEndpointWired
    p2p_relay_route_evidence_ok = [bool]$p2pRelayRouteEvidenceOk
    p2p_relay_route_evidence_count = [int]$p2pRelayRouteEvidenceCount
    p2p_relay_route_transport_proof_valid_count = [int]$p2pRelayRouteTransportProofValidCount
    p2p_relay_payload_transport_proven = [bool]$p2pRelayPayloadTransportProven
    p2p_relay_payload_delivery_proof_valid_count = [int]$p2pRelayPayloadDeliveryProofValidCount
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
    "runtime_cpu_second_pc_route_attempt_verified: $($result.runtime_cpu_second_pc_route_attempt_verified)"
    "runtime_cpu_second_pc_route_attempt_valid_machines: $($result.runtime_cpu_second_pc_route_attempt_valid_machine_count)/$($result.runtime_cpu_second_pc_route_attempt_min_machine_count) [$((@($result.runtime_cpu_second_pc_route_attempt_valid_machines) -join ', '))]"
    "frontend_polling_contract_verified: $($result.frontend_polling_contract_verified)"
    "rust_background_loop_contract_verified: $($result.rust_background_loop_contract_verified)"
    "idle_busy_loop_candidate_contract_verified: $($result.idle_busy_loop_candidate_contract_verified)"
    "local_api_auth_contract_verified: $($result.local_api_auth_contract_verified)"
    "operator_api_security_contract_verified: $($result.operator_api_security_contract_verified)"
    "degraded_mode_contract_verified: $($result.degraded_mode_contract_verified)"
    "p2p_store_forward_relay_contract_verified: $($result.p2p_store_forward_relay_contract_verified)"
    "secret_storage_contract_verified: $($result.secret_storage_contract_verified)"
    "process_ownership_verified: $($result.process_ownership_verified)"
    "startup_single_instance_verified: $($result.startup_single_instance_verified)"
    "desktop_single_instance_verified: $($result.desktop_single_instance_verified)"
    "multi_device_verified: $($result.multi_device_verified)"
    "public_metadata_ok: $($result.public_metadata_ok)"
    "support_mailbox_verified: $($result.support_mailbox_verified)"
    "store_release_verified: $($result.store_release_verified)"
    "p2p_control_plane_verified: $($result.p2p_control_plane_verified)"
    "p2p_owner_scope_verified: $($result.p2p_owner_scope_verified)"
    "p2p_relay_lease_store_release_grade: $($result.p2p_relay_lease_store_release_grade)"
    "p2p_relay_transport_wired: $($result.p2p_relay_transport_wired)"
    "p2p_relay_status_transport_preflight_ok: $($result.p2p_relay_status_transport_preflight_ok)"
    "p2p_relay_status_transport_descriptor_wired: $($result.p2p_relay_status_transport_descriptor_wired)"
    "p2p_relay_status_payload_endpoint_wired: $($result.p2p_relay_status_payload_endpoint_wired)"
    "p2p_relay_transport_payload_endpoint_wired: $($result.p2p_relay_transport_payload_endpoint_wired)"
    "p2p_relay_route_evidence_ok: $($result.p2p_relay_route_evidence_ok)"
    "p2p_relay_route_evidence_count: $($result.p2p_relay_route_evidence_count)"
    "p2p_relay_route_transport_proof_valid_count: $($result.p2p_relay_route_transport_proof_valid_count)"
    "p2p_relay_payload_transport_proven: $($result.p2p_relay_payload_transport_proven)"
    "p2p_relay_payload_delivery_proof_valid_count: $($result.p2p_relay_payload_delivery_proof_valid_count)"
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
