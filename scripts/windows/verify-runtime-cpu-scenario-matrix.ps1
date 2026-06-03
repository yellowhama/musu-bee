[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$EvidencePath,
    [string]$ExpectedVersion,
    [string]$ExpectedGitCommit,
    [string[]]$RequiredScenarios = @("startup-open", "runtime-started", "dashboard-open", "desktop-open", "post-route"),
    [int]$MinSampleSeconds = 60,
    [double]$MaxOneCorePercent = 5.0,
    [switch]$RequirePostRouteProbe = $true,
    [switch]$Json
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = (Resolve-Path (Join-Path $scriptDir "..\..")).Path
if ([string]::IsNullOrWhiteSpace($ExpectedVersion)) {
    $ExpectedVersion = (Get-Content -LiteralPath (Join-Path $repoRoot "VERSION") -Raw).Trim()
}
$RequiredScenarios = @(
    $RequiredScenarios | ForEach-Object {
        ([string]$_) -split "," | ForEach-Object { $_.Trim() } | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }
    }
)

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

function Add-CheckFromCondition {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][bool]$Condition,
        [Parameter(Mandatory = $true)][string]$PassMessage,
        [Parameter(Mandatory = $true)][string]$FailMessage
    )

    $script:checks.Add((New-Check -Name $Name -Status ($(if ($Condition) { "pass" } else { "fail" })) -Message ($(if ($Condition) { $PassMessage } else { $FailMessage })))) | Out-Null
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

function Get-JsonPropertyValue {
    param(
        [Parameter(Mandatory = $true)]$Object,
        [Parameter(Mandatory = $true)][string]$Name,
        $DefaultValue = $null
    )

    $property = $Object.PSObject.Properties[$Name]
    if (-not $property) {
        return $DefaultValue
    }
    return $property.Value
}

function Test-ReleaseEvidenceFreshnessAllowedPath {
    param([Parameter(Mandatory = $true)][string]$Path)

    $normalizedPath = $Path.Replace("\", "/")
    if ($normalizedPath -like "docs/*") {
        return $true
    }

    $statusOnlyScripts = @(
        ".github/workflows/deploy-musu-bee.yml",
        "scripts/windows/audit-desktop-release-readiness.ps1",
        "scripts/windows/audit-frontend-polling-contract.ps1",
        "scripts/windows/audit-local-api-auth-contract.ps1",
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
        "scripts/windows/record-msix-install-evidence.ps1",
        "scripts/windows/record-external-release-gate-recheck.ps1",
        "scripts/windows/record-p2p-control-plane-evidence.ps1",
        "scripts/windows/run-second-pc-release-check.ps1",
        "scripts/windows/verify-installed-msix-package.ps1",
        "scripts/windows/verify-final-operator-gate-packet.ps1",
        "scripts/windows/verify-msix-install-evidence.ps1",
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
            $line -notmatch '^\+\s*"test:p2p":\s*"tsx --test src/app/api/v1/p2p/route-evidence/route\.test\.ts src/app/api/v1/p2p/rendezvous/route\.test\.ts src/app/api/v1/p2p/relay/lease/route\.test\.ts",\s*$'
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

function Get-RoleMaxCpu {
    param(
        [Parameter(Mandatory = $true)]$Measurement,
        [Parameter(Mandatory = $true)][string]$Role
    )

    if ($Measurement.PSObject.Properties["max_one_core_percent_by_role"] -and
        $Measurement.max_one_core_percent_by_role.PSObject.Properties[$Role]) {
        return [double]$Measurement.max_one_core_percent_by_role.$Role
    }
    return 0.0
}

$checks = New-Object System.Collections.Generic.List[object]
$matrix = $null
$resolvedEvidencePath = $EvidencePath
try {
    $resolvedEvidencePath = (Resolve-Path -LiteralPath $EvidencePath).Path
    $matrix = Get-Content -LiteralPath $resolvedEvidencePath -Raw | ConvertFrom-Json
    Add-CheckFromCondition "parse" $true "runtime CPU scenario matrix parses" "runtime CPU scenario matrix does not parse"
}
catch {
    Add-CheckFromCondition "parse" $false "runtime CPU scenario matrix parses" "runtime CPU scenario matrix does not parse: $($_.Exception.Message)"
}

$operatorMachine = ""
$validScenarioNames = New-Object 'System.Collections.Generic.HashSet[string]' ([System.StringComparer]::OrdinalIgnoreCase)
if ($matrix) {
    $schema = Get-JsonPropertyString -Object $matrix -Name "schema"
    Add-CheckFromCondition "schema" ($schema -eq "musu.runtime_cpu_scenario_matrix.v1") "schema is valid" "schema is '$schema'"

    $version = Get-JsonPropertyString -Object $matrix -Name "version"
    Add-CheckFromCondition "version" ($version -eq $ExpectedVersion) "version matches $ExpectedVersion" "version is '$version'"

    $ok = ($matrix.PSObject.Properties["ok"] -and [bool]$matrix.ok)
    Add-CheckFromCondition "matrix ok" $ok "matrix reports ok=true" "matrix reports ok=false"

    $gitCommit = Get-JsonPropertyString -Object $matrix -Name "git_commit"
    $gitCommitValid = ($gitCommit -match "^[0-9a-f]{40}$")
    Add-CheckFromCondition "git commit present" $gitCommitValid "git commit is recorded" "git commit is missing or invalid"
    if (-not [string]::IsNullOrWhiteSpace($ExpectedGitCommit)) {
        $gitCommitMatchesExpected = ($gitCommit -eq $ExpectedGitCommit)
        $documentationOrStatusOnlyGitDelta = $false
        if (-not $gitCommitMatchesExpected -and $gitCommitValid -and $ExpectedGitCommit -match "^[0-9a-f]{40}$") {
            $documentationOrStatusOnlyGitDelta = Test-DocumentationOrStatusOnlyGitDelta -FromCommit $gitCommit -ToCommit $ExpectedGitCommit
        }
        Add-CheckFromCondition `
            "expected git commit" `
            ($gitCommitMatchesExpected -or $documentationOrStatusOnlyGitDelta) `
            ($(if ($gitCommitMatchesExpected) { "git commit matches current HEAD $ExpectedGitCommit" } else { "git commit differs only by documentation/evidence/status/tooling-only commits" })) `
            "git commit is '$gitCommit', expected '$ExpectedGitCommit' with no runtime-affecting changes after matrix evidence"
    }

    $gitDirtyPresent = $matrix.PSObject.Properties["git_dirty"]
    $gitDirty = ($gitDirtyPresent -and [bool]$matrix.git_dirty)
    Add-CheckFromCondition "git clean during matrix" ($gitDirtyPresent -and -not $gitDirty) "matrix was captured from clean git state" "matrix was captured dirty or git_dirty is missing"

    $operatorMachine = Get-JsonPropertyString -Object $matrix -Name "operator_machine"
    Add-CheckFromCondition "operator machine" (-not [string]::IsNullOrWhiteSpace($operatorMachine)) "operator_machine is present" "operator_machine is missing"

    $sampleSeconds = if ($matrix.PSObject.Properties["sample_seconds"]) { [double]$matrix.sample_seconds } else { 0.0 }
    Add-CheckFromCondition "sample duration" ($sampleSeconds -ge $MinSampleSeconds) "sample duration is at least ${MinSampleSeconds}s" "sample duration is ${sampleSeconds}s, expected at least ${MinSampleSeconds}s"

    $budget = if ($matrix.PSObject.Properties["max_one_core_percent"]) { [double]$matrix.max_one_core_percent } else { 0.0 }
    Add-CheckFromCondition "cpu budget" ($budget -gt 0 -and $budget -le $MaxOneCorePercent) "matrix CPU budget is <= ${MaxOneCorePercent}% of one logical core" "matrix CPU budget is '$budget', expected <= ${MaxOneCorePercent}"

    $maxOwnedProcessCount = if ($matrix.PSObject.Properties["max_owned_process_count"]) { [int]$matrix.max_owned_process_count } else { 0 }
    Add-CheckFromCondition "owned process budget present" ($maxOwnedProcessCount -gt 0) "owned process budget is $maxOwnedProcessCount" "owned process budget is missing"

    $maxOwnedWebView2ProcessCount = if ($matrix.PSObject.Properties["max_owned_webview2_process_count"]) { [int]$matrix.max_owned_webview2_process_count } else { -1 }
    Add-CheckFromCondition "WebView2 budget present" ($maxOwnedWebView2ProcessCount -ge 0) "WebView2 process budget is $maxOwnedWebView2ProcessCount" "WebView2 process budget is missing"

    $maxTotalWorkingSetMb = if ($matrix.PSObject.Properties["max_total_working_set_mb"]) { [double]$matrix.max_total_working_set_mb } else { 0.0 }
    Add-CheckFromCondition "working set budget present" ($maxTotalWorkingSetMb -gt 0.0) "working set budget is ${maxTotalWorkingSetMb}MB" "working set budget is missing"

    $scenarioEntries = @(Get-JsonPropertyValue -Object $matrix -Name "scenarios" -DefaultValue @())
    foreach ($required in $RequiredScenarios) {
        $matches = @($scenarioEntries | Where-Object { (Get-JsonPropertyString -Object $_ -Name "scenario") -eq $required })
        Add-CheckFromCondition "scenario present: $required" ($matches.Count -gt 0) "scenario '$required' is present" "scenario '$required' is missing"
        if ($matches.Count -eq 0) {
            continue
        }

        $entry = $matches | Select-Object -First 1
        [void]$validScenarioNames.Add($required)
        $preparation = Get-JsonPropertyValue -Object $entry -Name "preparation"
        if ($required -eq "startup-open") {
            $preparationAction = if ($null -ne $preparation) { Get-JsonPropertyString -Object $preparation -Name "action" } else { "" }
            $desktopAppId = if ($null -ne $preparation) { Get-JsonPropertyString -Object $preparation -Name "desktop_app_id" } else { "" }
            $sampleDelaySeconds = if ($null -ne $preparation -and $preparation.PSObject.Properties["sample_delay_seconds"] -and $null -ne $preparation.sample_delay_seconds) { [double]$preparation.sample_delay_seconds } else { -1.0 }
            Add-CheckFromCondition "startup app opened" ($preparationAction -eq "Start packaged desktop app" -and -not [string]::IsNullOrWhiteSpace($desktopAppId)) "startup-open launched the packaged desktop app" "startup-open did not launch the packaged desktop app"
            Add-CheckFromCondition "startup sample delay" ($sampleDelaySeconds -ge 0.0 -and $sampleDelaySeconds -le 3.0) "startup-open sample delay ${sampleDelaySeconds}s <= 3s" "startup-open sample delay is ${sampleDelaySeconds}s, expected <= 3s"
        }
        if ($required -eq "dashboard-open") {
            $preparationAction = if ($null -ne $preparation) { Get-JsonPropertyString -Object $preparation -Name "action" } else { "" }
            $dashboardUrl = if ($null -ne $preparation) { Get-JsonPropertyString -Object $preparation -Name "dashboard_url" } else { "" }
            Add-CheckFromCondition "dashboard opened" ($preparationAction -eq "Start-Process DashboardUrl" -and -not [string]::IsNullOrWhiteSpace($dashboardUrl)) "dashboard-open launched a dashboard URL" "dashboard-open did not launch a dashboard URL"
        }
        $measurement = Get-JsonPropertyValue -Object $entry -Name "measurement"
        Add-CheckFromCondition "measurement present: $required" ($null -ne $measurement) "scenario '$required' has measurement" "scenario '$required' lacks measurement"
        if ($null -eq $measurement) {
            continue
        }

        $measurementOk = ($measurement.PSObject.Properties["ok"] -and [bool]$measurement.ok)
        Add-CheckFromCondition "measurement ok: $required" $measurementOk "scenario '$required' reports ok=true" "scenario '$required' reports ok=false"
        $measurementDirty = ($measurement.PSObject.Properties["git_dirty"] -and [bool]$measurement.git_dirty)
        Add-CheckFromCondition "measurement clean git: $required" ($measurement.PSObject.Properties["git_dirty"] -and -not $measurementDirty) "scenario '$required' measured clean git" "scenario '$required' measured dirty git or lacks git_dirty"
        $measurementSampleSeconds = if ($measurement.PSObject.Properties["sample_seconds"]) { [double]$measurement.sample_seconds } else { 0.0 }
        Add-CheckFromCondition "measurement duration: $required" ($measurementSampleSeconds -ge $MinSampleSeconds) "scenario '$required' sample duration is at least ${MinSampleSeconds}s" "scenario '$required' sample duration is ${measurementSampleSeconds}s"

        foreach ($role in @("musu", "node", "webview2", "other")) {
            $roleCpu = Get-RoleMaxCpu -Measurement $measurement -Role $role
            Add-CheckFromCondition "role CPU $required/$role" ($roleCpu -le $MaxOneCorePercent) "scenario '$required' role '$role' CPU ${roleCpu}% <= ${MaxOneCorePercent}%" "scenario '$required' role '$role' CPU ${roleCpu}% exceeds ${MaxOneCorePercent}%"
        }

        $hotProcessCount = if ($measurement.PSObject.Properties["hot_process_count"]) { [int]$measurement.hot_process_count } else { -1 }
        Add-CheckFromCondition "hot process count: $required" ($hotProcessCount -eq 0) "scenario '$required' has no hot processes" "scenario '$required' hot_process_count is $hotProcessCount"
        $resourceBudgetViolationsPresent = $measurement.PSObject.Properties["resource_budget_violations"]
        Add-CheckFromCondition "resource budget field: $required" ([bool]$resourceBudgetViolationsPresent) "scenario '$required' records resource budget violations field" "scenario '$required' is missing resource_budget_violations"
        $violations = @()
        if ($resourceBudgetViolationsPresent -and $null -ne $measurement.resource_budget_violations) {
            $violations = @($measurement.resource_budget_violations)
        }
        Add-CheckFromCondition "resource budget: $required" ($violations.Count -eq 0) "scenario '$required' has no resource budget violations" "scenario '$required' has resource budget violations: $($violations -join ', ')"

        $processCounts = Get-JsonPropertyValue -Object $measurement -Name "process_counts_by_role"
        $processCountsPresent = ($null -ne $processCounts)
        Add-CheckFromCondition "process counts present: $required" $processCountsPresent "scenario '$required' records process counts by role" "scenario '$required' lacks process_counts_by_role"
        $ownedProcessCount = 0
        $webView2Count = 0
        if ($processCountsPresent) {
            foreach ($role in @("musu", "node", "webview2", "other")) {
                if ($processCounts.PSObject.Properties[$role]) {
                    $ownedProcessCount += [int]$processCounts.$role
                }
            }
            if ($processCounts.PSObject.Properties["webview2"]) {
                $webView2Count = [int]$processCounts.webview2
            }
        }
        Add-CheckFromCondition "owned process budget: $required" ($processCountsPresent -and $maxOwnedProcessCount -gt 0 -and $ownedProcessCount -le $maxOwnedProcessCount) "scenario '$required' owned process count $ownedProcessCount <= $maxOwnedProcessCount" "scenario '$required' owned process count $ownedProcessCount exceeds or lacks budget $maxOwnedProcessCount"
        Add-CheckFromCondition "WebView2 process budget: $required" ($processCountsPresent -and $maxOwnedWebView2ProcessCount -ge 0 -and $webView2Count -le $maxOwnedWebView2ProcessCount) "scenario '$required' WebView2 process count $webView2Count <= $maxOwnedWebView2ProcessCount" "scenario '$required' WebView2 process count $webView2Count exceeds or lacks budget $maxOwnedWebView2ProcessCount"

        $workingSetPresent = $measurement.PSObject.Properties["total_working_set_mb_after"]
        $totalWorkingSetMb = if ($workingSetPresent) { [double]$measurement.total_working_set_mb_after } else { 0.0 }
        Add-CheckFromCondition "working set present: $required" ([bool]$workingSetPresent) "scenario '$required' records total working set" "scenario '$required' lacks total_working_set_mb_after"
        Add-CheckFromCondition "working set budget: $required" ($workingSetPresent -and $maxTotalWorkingSetMb -gt 0.0 -and $totalWorkingSetMb -le $maxTotalWorkingSetMb) "scenario '$required' working set ${totalWorkingSetMb}MB <= ${maxTotalWorkingSetMb}MB" "scenario '$required' working set ${totalWorkingSetMb}MB exceeds or lacks budget ${maxTotalWorkingSetMb}MB"

        $privateMemoryPresent = $measurement.PSObject.Properties["total_private_memory_mb_after"]
        Add-CheckFromCondition "private memory present: $required" ([bool]$privateMemoryPresent) "scenario '$required' records total private memory" "scenario '$required' lacks total_private_memory_mb_after"

        if ($required -eq "desktop-open") {
            Add-CheckFromCondition "desktop owned WebView2" ($webView2Count -gt 0) "desktop-open has owned WebView2 processes" "desktop-open lacks owned WebView2 processes"
        }
    }

    if ($RequirePostRouteProbe -and ($RequiredScenarios -contains "post-route")) {
        $routeProbe = Get-JsonPropertyValue -Object $matrix -Name "route_probe"
        $routeProbeOk = ($null -ne $routeProbe -and $routeProbe.PSObject.Properties["ok"] -and [bool]$routeProbe.ok)
        Add-CheckFromCondition "post-route route probe" $routeProbeOk "post-route matrix includes a successful route probe" "post-route matrix lacks a successful route probe"
    }
}

$failCount = @($checks | Where-Object { $_.status -ne "pass" }).Count
$result = [pscustomobject]@{
    ok = ($failCount -eq 0)
    evidence_path = $resolvedEvidencePath
    fail_count = $failCount
    version = if ($matrix) { Get-JsonPropertyString -Object $matrix -Name "version" } else { "" }
    git_commit = if ($matrix) { Get-JsonPropertyString -Object $matrix -Name "git_commit" } else { "" }
    operator_machine = $operatorMachine
    required_scenarios = @($RequiredScenarios)
    present_required_scenarios = @($validScenarioNames)
    require_post_route_probe = [bool]$RequirePostRouteProbe
    checks = $checks.ToArray()
}

if ($Json) {
    $result | ConvertTo-Json -Depth 8
}
else {
    $result
}

if (-not [bool]$result.ok) {
    exit 1
}
