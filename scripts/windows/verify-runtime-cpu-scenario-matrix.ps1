[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$EvidencePath,
    [string]$ExpectedVersion,
    [string]$ExpectedGitCommit,
    [string[]]$RequiredScenarios = @("runtime-started", "dashboard-open", "desktop-open", "post-route"),
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

    $scenarioEntries = @(Get-JsonPropertyValue -Object $matrix -Name "scenarios" -DefaultValue @())
    foreach ($required in $RequiredScenarios) {
        $matches = @($scenarioEntries | Where-Object { (Get-JsonPropertyString -Object $_ -Name "scenario") -eq $required })
        Add-CheckFromCondition "scenario present: $required" ($matches.Count -gt 0) "scenario '$required' is present" "scenario '$required' is missing"
        if ($matches.Count -eq 0) {
            continue
        }

        $entry = $matches | Select-Object -First 1
        [void]$validScenarioNames.Add($required)
        if ($required -eq "dashboard-open") {
            $preparation = Get-JsonPropertyValue -Object $entry -Name "preparation"
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
        $violations = @()
        if ($measurement.PSObject.Properties["resource_budget_violations"] -and $null -ne $measurement.resource_budget_violations) {
            $violations = @($measurement.resource_budget_violations)
        }
        Add-CheckFromCondition "resource budget: $required" ($violations.Count -eq 0) "scenario '$required' has no resource budget violations" "scenario '$required' has resource budget violations: $($violations -join ', ')"

        if ($required -eq "desktop-open") {
            $webView2Count = 0
            if ($measurement.PSObject.Properties["process_counts_by_role"] -and $measurement.process_counts_by_role.PSObject.Properties["webview2"]) {
                $webView2Count = [int]$measurement.process_counts_by_role.webview2
            }
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
