[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$EvidencePath,
    [string]$ExpectedVersion,
    [string]$ExpectedGitCommit,
    [string[]]$RequiredScenarios = @("startup-open", "runtime-started", "dashboard-open", "desktop-open", "post-route"),
    [int]$MinSampleSeconds = 60,
    [double]$MaxOneCorePercent = 5.0,
    [switch]$RequirePostRouteProbe = $true,
    [switch]$RequirePostRouteTarget,
    [string]$ExpectedPostRouteTarget,
    [switch]$RejectSelfPostRouteTarget,
    [switch]$RejectLocalPostRouteTarget,
    [switch]$AllowFailedPostRouteProbe,
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
$CpuAttributionRoleNames = @("musu", "node", "webview2", "other")
$CpuAttributionSubroleNames = @("musu_runtime", "bridge_runtime", "desktop_shell", "node_helper", "webview2_helper", "other")

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

function Test-RouteProbeArgumentsBindTarget {
    param(
        $Arguments,
        [AllowEmptyString()][string]$Target
    )

    if ([string]::IsNullOrWhiteSpace($Target) -or $null -eq $Arguments) {
        return $false
    }

    $argumentList = @($Arguments | ForEach-Object { [string]$_ })
    for ($index = 0; $index -lt $argumentList.Count; $index++) {
        $argument = [string]$argumentList[$index]
        if ($argument -eq "--target" -and ($index + 1) -lt $argumentList.Count -and ([string]$argumentList[$index + 1]) -eq $Target) {
            return $true
        }
        if ($argument -eq "--target=$Target") {
            return $true
        }
    }

    return $false
}

function Test-RouteProbeArgumentsBindWaitToken {
    param(
        $Arguments,
        [AllowEmptyString()][string]$ExpectedToken
    )

    if ([string]::IsNullOrWhiteSpace($ExpectedToken) -or $null -eq $Arguments) {
        return $false
    }

    $argumentList = @($Arguments | ForEach-Object { [string]$_ })
    for ($index = 0; $index -lt $argumentList.Count; $index++) {
        $argument = [string]$argumentList[$index]
        if ($argument -eq "--wait" -and ($index + 1) -lt $argumentList.Count -and ([string]$argumentList[$index + 1]).Contains($ExpectedToken)) {
            return $true
        }
        if ($argument.StartsWith("--wait=") -and $argument.Contains($ExpectedToken)) {
            return $true
        }
    }

    return $false
}

function Get-RouteTargetHost {
    param([AllowEmptyString()][string]$Target)

    $value = $Target.Trim()
    if ([string]::IsNullOrWhiteSpace($value)) {
        return ""
    }

    $uri = $null
    if ([System.Uri]::TryCreate($value, [System.UriKind]::Absolute, [ref]$uri) -and -not [string]::IsNullOrWhiteSpace($uri.Host)) {
        return $uri.Host.Trim().TrimEnd(".")
    }

    if ($value.StartsWith("[") -and $value.Contains("]")) {
        return $value.Substring(1, $value.IndexOf("]") - 1).Trim().TrimEnd(".")
    }

    $colonCount = ([regex]::Matches($value, ":")).Count
    if ($colonCount -eq 1) {
        return ($value -split ":", 2)[0].Trim().TrimEnd(".")
    }

    return $value.Trim().TrimEnd(".")
}

function Test-RouteTargetIsLocal {
    param([AllowEmptyString()][string]$Target)

    $hostName = (Get-RouteTargetHost -Target $Target).ToLowerInvariant()
    if ([string]::IsNullOrWhiteSpace($hostName)) {
        return $true
    }

    if ($hostName -in @("localhost", "localhost.localdomain", "::1", "0:0:0:0:0:0:0:1", "0.0.0.0", "host.docker.internal")) {
        return $true
    }

    if ($hostName -like "*.localhost") {
        return $true
    }

    if ($hostName -eq "127.0.0.1" -or $hostName.StartsWith("127.")) {
        return $true
    }

    return $false
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
        "scripts/windows/repair-packaged-local-runtime-state.ps1",
        "scripts/windows/record-route-reachability-diagnostic.ps1",
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
        "scripts/windows/verify-route-reachability-diagnostic.ps1",
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

function Get-SubroleMaxCpu {
    param(
        [Parameter(Mandatory = $true)]$Measurement,
        [Parameter(Mandatory = $true)][string]$Subrole
    )

    if ($Measurement.PSObject.Properties["max_one_core_percent_by_subrole"] -and
        $Measurement.max_one_core_percent_by_subrole.PSObject.Properties[$Subrole]) {
        return [double]$Measurement.max_one_core_percent_by_subrole.$Subrole
    }
    return 0.0
}

function Test-ObjectHasRoleProperties {
    param(
        $Object,
        [string[]]$Roles = $CpuAttributionRoleNames
    )

    if ($null -eq $Object) {
        return $false
    }

    foreach ($role in $Roles) {
        if (-not $Object.PSObject.Properties[$role]) {
            return $false
        }
    }
    return $true
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

    $musuExe = Get-JsonPropertyString -Object $matrix -Name "musu_exe"
    $musuExeLower = $musuExe.ToLowerInvariant()
    $musuExeReleaseIdentity = (
        $matrix.PSObject.Properties["musu_exe_release_identity"] -and
        [bool]$matrix.musu_exe_release_identity -and
        (
            $musuExeLower.Contains("\microsoft\windowsapps\musu.exe") -or
            $musuExeLower.Contains("\windowsapps\yellowhama.musu_") -or
            $musuExeLower.Contains("\program files\windowsapps\yellowhama.musu_")
        )
    )
    Add-CheckFromCondition `
        "MUSU executable release identity" `
        $musuExeReleaseIdentity `
        "matrix used the packaged WindowsApps MUSU command" `
        "matrix did not prove packaged WindowsApps MUSU command identity; musu_exe='$musuExe'"

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
            $dashboardDiscoveryAction = if ($null -ne $preparation) { Get-JsonPropertyString -Object $preparation -Name "discovery_action" } else { "" }
            $dashboardUrlSource = if ($null -ne $preparation) { Get-JsonPropertyString -Object $preparation -Name "dashboard_url_source" } else { "" }
            $dashboardOpened = ($preparationAction -eq "Start-Process DashboardUrl" -and -not [string]::IsNullOrWhiteSpace($dashboardUrl))
            $dashboardAbsentInPackagedRuntime = (
                -not $dashboardOpened -and
                $musuExeReleaseIdentity -and
                $preparationAction -eq "none" -and
                [string]::IsNullOrWhiteSpace($dashboardUrl) -and
                (
                    $dashboardDiscoveryAction -eq "musu up --json" -or
                    $dashboardUrlSource -eq "musu_up_dashboard_open" -or
                    $dashboardUrlSource -eq "musu_up"
                )
            )
            Add-CheckFromCondition `
                "dashboard opened or absent in packaged runtime" `
                ($dashboardOpened -or $dashboardAbsentInPackagedRuntime) `
                ($(if ($dashboardOpened) { "dashboard-open launched a dashboard URL" } else { "dashboard-open measured packaged runtime state because no dashboard URL was exposed" })) `
                "dashboard-open neither launched a dashboard URL nor proved packaged runtime dashboard absence"
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

        $processMetadataAvailable = ($measurement.PSObject.Properties["process_metadata_available"] -and [bool]$measurement.process_metadata_available)
        Add-CheckFromCondition "process metadata available: $required" $processMetadataAvailable "scenario '$required' captured process metadata for PID/parent/path attribution" "scenario '$required' did not capture process metadata for PID/parent/path attribution"

        $processMetadataTimedOut = if ($measurement.PSObject.Properties["process_metadata_timed_out"]) { [bool]$measurement.process_metadata_timed_out } else { $true }
        Add-CheckFromCondition "process metadata timeout: $required" (-not $processMetadataTimedOut) "scenario '$required' process metadata lookup did not time out" "scenario '$required' process metadata lookup timed out or was not recorded"

        $helperProcessScope = Get-JsonPropertyString -Object $measurement -Name "helper_process_scope"
        Add-CheckFromCondition "helper process scope: $required" ($helperProcessScope -eq "musu_process_tree_or_repo_related") "scenario '$required' helper scope is limited to MUSU process tree or repo-related helpers" "scenario '$required' helper scope is '$helperProcessScope'"

        $cpuAttribution = Get-JsonPropertyValue -Object $measurement -Name "cpu_attribution"
        $cpuAttributionPresent = ($null -ne $cpuAttribution)
        Add-CheckFromCondition "CPU attribution present: $required" $cpuAttributionPresent "scenario '$required' records PID/role CPU attribution" "scenario '$required' lacks cpu_attribution"
        if ($cpuAttributionPresent) {
            $attributionSchema = Get-JsonPropertyString -Object $cpuAttribution -Name "schema"
            Add-CheckFromCondition "CPU attribution schema: $required" ($attributionSchema -eq "musu.runtime_idle_cpu_attribution.v1") "scenario '$required' CPU attribution schema is valid" "scenario '$required' CPU attribution schema is '$attributionSchema'"

            $attributionScope = Get-JsonPropertyString -Object $cpuAttribution -Name "attribution_scope"
            Add-CheckFromCondition "CPU attribution scope: $required" ($attributionScope -eq "musu_process_tree_or_repo_related") "scenario '$required' CPU attribution excludes unrelated helper processes" "scenario '$required' CPU attribution scope is '$attributionScope'"

            $cpuSampleCount = if ($measurement.PSObject.Properties["cpu_sample_count"]) { [int]$measurement.cpu_sample_count } else { -1 }
            $attributionSampleCount = if ($cpuAttribution.PSObject.Properties["sample_count"]) { [int]$cpuAttribution.sample_count } else { -1 }
            Add-CheckFromCondition "CPU attribution sample count: $required" ($cpuSampleCount -gt 0 -and $attributionSampleCount -eq $cpuSampleCount) "scenario '$required' CPU attribution sample count matches measurement" "scenario '$required' CPU attribution sample count $attributionSampleCount does not match measurement sample count $cpuSampleCount"

            $sampleCountByRolePresent = (
                $cpuAttribution.PSObject.Properties["sample_count_by_role"] -and
                (Test-ObjectHasRoleProperties -Object $cpuAttribution.sample_count_by_role)
            )
            Add-CheckFromCondition "CPU attribution role counts: $required" ([bool]$sampleCountByRolePresent) "scenario '$required' CPU attribution records MUSU/node/WebView2/other role sample counts" "scenario '$required' CPU attribution lacks MUSU/node/WebView2/other role sample counts"

            $sampleCountBySubrolePresent = (
                $cpuAttribution.PSObject.Properties["sample_count_by_subrole"] -and
                (Test-ObjectHasRoleProperties -Object $cpuAttribution.sample_count_by_subrole -Roles $CpuAttributionSubroleNames)
            )
            Add-CheckFromCondition "CPU attribution subrole counts: $required" ([bool]$sampleCountBySubrolePresent) "scenario '$required' CPU attribution records bridge/runtime/desktop/helper subrole sample counts" "scenario '$required' CPU attribution lacks bridge/runtime/desktop/helper subrole sample counts"

            $totalCpuByRolePresent = (
                $cpuAttribution.PSObject.Properties["total_cpu_seconds_by_role"] -and
                (Test-ObjectHasRoleProperties -Object $cpuAttribution.total_cpu_seconds_by_role)
            )
            Add-CheckFromCondition "CPU attribution totals by role: $required" ([bool]$totalCpuByRolePresent) "scenario '$required' CPU attribution records MUSU/node/WebView2/other CPU totals by role" "scenario '$required' CPU attribution lacks MUSU/node/WebView2/other CPU totals by role"

            $totalCpuBySubrolePresent = (
                $cpuAttribution.PSObject.Properties["total_cpu_seconds_by_subrole"] -and
                (Test-ObjectHasRoleProperties -Object $cpuAttribution.total_cpu_seconds_by_subrole -Roles $CpuAttributionSubroleNames)
            )
            Add-CheckFromCondition "CPU attribution totals by subrole: $required" ([bool]$totalCpuBySubrolePresent) "scenario '$required' CPU attribution records bridge/runtime/desktop/helper CPU totals by subrole" "scenario '$required' CPU attribution lacks bridge/runtime/desktop/helper CPU totals by subrole"

            $maxCpuByRolePresent = (
                $cpuAttribution.PSObject.Properties["max_one_core_percent_by_role"] -and
                (Test-ObjectHasRoleProperties -Object $cpuAttribution.max_one_core_percent_by_role)
            )
            Add-CheckFromCondition "CPU attribution max by role: $required" ([bool]$maxCpuByRolePresent) "scenario '$required' CPU attribution records MUSU/node/WebView2/other max CPU by role" "scenario '$required' CPU attribution lacks MUSU/node/WebView2/other max CPU by role"

            $maxCpuBySubrolePresent = (
                $cpuAttribution.PSObject.Properties["max_one_core_percent_by_subrole"] -and
                (Test-ObjectHasRoleProperties -Object $cpuAttribution.max_one_core_percent_by_subrole -Roles $CpuAttributionSubroleNames)
            )
            Add-CheckFromCondition "CPU attribution max by subrole: $required" ([bool]$maxCpuBySubrolePresent) "scenario '$required' CPU attribution records bridge/runtime/desktop/helper max CPU by subrole" "scenario '$required' CPU attribution lacks bridge/runtime/desktop/helper max CPU by subrole"

            $requiredRoles = Get-JsonPropertyValue -Object $cpuAttribution -Name "required_roles_present"
            $musuRolePresent = ($requiredRoles -and $requiredRoles.PSObject.Properties["musu"] -and [bool]$requiredRoles.musu)
            Add-CheckFromCondition "CPU attribution MUSU role: $required" ([bool]$musuRolePresent) "scenario '$required' CPU attribution includes MUSU role" "scenario '$required' CPU attribution is missing MUSU role"
            if ($required -eq "desktop-open") {
                $webView2RolePresent = ($requiredRoles -and $requiredRoles.PSObject.Properties["webview2"] -and [bool]$requiredRoles.webview2)
                Add-CheckFromCondition "CPU attribution WebView2 role: $required" ([bool]$webView2RolePresent) "desktop-open CPU attribution includes owned WebView2 role" "desktop-open CPU attribution is missing owned WebView2 role"
            }

            $requiredSubroles = Get-JsonPropertyValue -Object $cpuAttribution -Name "required_subroles_present"
            $bridgeRuntimePresent = ($requiredSubroles -and $requiredSubroles.PSObject.Properties["bridge_runtime"] -and [bool]$requiredSubroles.bridge_runtime)
            Add-CheckFromCondition "CPU attribution bridge subrole: $required" ([bool]$bridgeRuntimePresent) "scenario '$required' CPU attribution identifies the bridge runtime PID separately" "scenario '$required' CPU attribution does not identify the bridge runtime PID separately"
            if ($required -eq "startup-open" -or $required -eq "desktop-open") {
                $desktopShellPresent = ($requiredSubroles -and $requiredSubroles.PSObject.Properties["desktop_shell"] -and [bool]$requiredSubroles.desktop_shell)
                Add-CheckFromCondition "CPU attribution desktop subrole: $required" ([bool]$desktopShellPresent) "scenario '$required' CPU attribution identifies the desktop shell separately" "scenario '$required' CPU attribution does not identify the desktop shell separately"
            }

            $topProcesses = @(
                if ($cpuAttribution.PSObject.Properties["top_processes"]) {
                    @($cpuAttribution.top_processes)
                }
            )
            Add-CheckFromCondition "CPU attribution top processes: $required" ($topProcesses.Count -gt 0) "scenario '$required' records top CPU processes" "scenario '$required' CPU attribution top_processes is empty"
            $badTopProcessRows = @(
                foreach ($row in $topProcesses) {
                    $rowId = if ($row.PSObject.Properties["id"]) { [int]$row.id } else { 0 }
                    $rowName = if ($row.PSObject.Properties["process_name"]) { [string]$row.process_name } else { "" }
                    $rowRole = if ($row.PSObject.Properties["process_role"]) { [string]$row.process_role } else { "" }
                    $rowSubrole = if ($row.PSObject.Properties["process_subrole"]) { [string]$row.process_subrole } else { "" }
                    $hasCpuDelta = $row.PSObject.Properties["cpu_seconds_delta"]
                    $hasCpuPct = $row.PSObject.Properties["cpu_pct_one_core"]
                    if ($rowId -le 0 -or [string]::IsNullOrWhiteSpace($rowName) -or ($rowRole -notin @("musu", "node", "webview2", "other")) -or ($rowSubrole -notin $CpuAttributionSubroleNames) -or -not $hasCpuDelta -or -not $hasCpuPct) {
                        $row
                    }
                }
            )
            Add-CheckFromCondition "CPU attribution top process fields: $required" ($topProcesses.Count -gt 0 -and $badTopProcessRows.Count -eq 0) "scenario '$required' top CPU process rows include PID, role, subrole, and CPU fields" "scenario '$required' has $($badTopProcessRows.Count) malformed top CPU process row(s)"
        }

        $measurementMaxCpuByRole = Get-JsonPropertyValue -Object $measurement -Name "max_one_core_percent_by_role"
        $measurementMaxCpuByRolePresent = Test-ObjectHasRoleProperties -Object $measurementMaxCpuByRole
        Add-CheckFromCondition "measurement CPU roles present: $required" $measurementMaxCpuByRolePresent "scenario '$required' records MUSU/node/WebView2/other max CPU fields" "scenario '$required' lacks MUSU/node/WebView2/other max CPU fields"

        $measurementMaxCpuBySubrole = Get-JsonPropertyValue -Object $measurement -Name "max_one_core_percent_by_subrole"
        $measurementMaxCpuBySubrolePresent = Test-ObjectHasRoleProperties -Object $measurementMaxCpuBySubrole -Roles $CpuAttributionSubroleNames
        Add-CheckFromCondition "measurement CPU subroles present: $required" $measurementMaxCpuBySubrolePresent "scenario '$required' records bridge/runtime/desktop/helper max CPU fields" "scenario '$required' lacks bridge/runtime/desktop/helper max CPU fields"

        foreach ($role in $CpuAttributionRoleNames) {
            $roleCpu = Get-RoleMaxCpu -Measurement $measurement -Role $role
            Add-CheckFromCondition "role CPU $required/$role" ($roleCpu -le $MaxOneCorePercent) "scenario '$required' role '$role' CPU ${roleCpu}% <= ${MaxOneCorePercent}%" "scenario '$required' role '$role' CPU ${roleCpu}% exceeds ${MaxOneCorePercent}%"
        }
        foreach ($subrole in $CpuAttributionSubroleNames) {
            $subroleCpu = Get-SubroleMaxCpu -Measurement $measurement -Subrole $subrole
            Add-CheckFromCondition "subrole CPU $required/$subrole" ($subroleCpu -le $MaxOneCorePercent) "scenario '$required' subrole '$subrole' CPU ${subroleCpu}% <= ${MaxOneCorePercent}%" "scenario '$required' subrole '$subrole' CPU ${subroleCpu}% exceeds ${MaxOneCorePercent}%"
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
        $processCountsBySubrole = Get-JsonPropertyValue -Object $measurement -Name "process_counts_by_subrole"
        $processCountsBySubrolePresent = ($null -ne $processCountsBySubrole)
        Add-CheckFromCondition "process subrole counts present: $required" $processCountsBySubrolePresent "scenario '$required' records process counts by bridge/runtime/desktop/helper subrole" "scenario '$required' lacks process_counts_by_subrole"
        $ownedProcessCount = 0
        $webView2Count = 0
        if ($processCountsPresent) {
            foreach ($role in $CpuAttributionRoleNames) {
                if ($processCounts.PSObject.Properties[$role]) {
                    $ownedProcessCount += [int]$processCounts.$role
                }
            }
            if ($processCounts.PSObject.Properties["webview2"]) {
                $webView2Count = [int]$processCounts.webview2
            }
        }
        $processCountRolesPresent = ($processCountsPresent -and (Test-ObjectHasRoleProperties -Object $processCounts))
        Add-CheckFromCondition "process count roles present: $required" $processCountRolesPresent "scenario '$required' records MUSU/node/WebView2/other process count fields" "scenario '$required' lacks MUSU/node/WebView2/other process count fields"
        $processCountSubrolesPresent = ($processCountsBySubrolePresent -and (Test-ObjectHasRoleProperties -Object $processCountsBySubrole -Roles $CpuAttributionSubroleNames))
        Add-CheckFromCondition "process count subroles present: $required" $processCountSubrolesPresent "scenario '$required' records bridge/runtime/desktop/helper process count fields" "scenario '$required' lacks bridge/runtime/desktop/helper process count fields"
        $bridgeRuntimeCount = if ($processCountSubrolesPresent -and $processCountsBySubrole.PSObject.Properties["bridge_runtime"]) { [int]$processCountsBySubrole.bridge_runtime } else { 0 }
        Add-CheckFromCondition "bridge runtime process count: $required" ($bridgeRuntimeCount -ge 1) "scenario '$required' records at least one bridge runtime process" "scenario '$required' does not record a bridge runtime process"
        if ($required -eq "startup-open" -or $required -eq "desktop-open") {
            $desktopShellCount = if ($processCountSubrolesPresent -and $processCountsBySubrole.PSObject.Properties["desktop_shell"]) { [int]$processCountsBySubrole.desktop_shell } else { 0 }
            Add-CheckFromCondition "desktop shell process count: $required" ($desktopShellCount -ge 1) "scenario '$required' records a desktop shell process separately" "scenario '$required' does not record a desktop shell process separately"
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
        $routeProbePresent = ($null -ne $routeProbe)
        Add-CheckFromCondition "post-route route probe present" $routeProbePresent "post-route matrix includes a route probe" "post-route matrix lacks a route probe"
        if ($routeProbePresent) {
            $routeProbeOk = ($routeProbe.PSObject.Properties["ok"] -and [bool]$routeProbe.ok)
            $routeProbeHasExitCode = ($routeProbe.PSObject.Properties["exit_code"] -and $null -ne $routeProbe.exit_code)
            [int]$routeProbeExitCode = 0
            $routeProbeHasNumericExitCode = if ($routeProbeHasExitCode) { [int]::TryParse(([string]$routeProbe.exit_code), [ref]$routeProbeExitCode) } else { $false }
            $routeProbeHasNonZeroExitCode = ($routeProbeHasNumericExitCode -and $routeProbeExitCode -ne 0)
            $routeProbeFailureAllowed = ($routeProbe.PSObject.Properties["failure_allowed"] -and [bool]$routeProbe.failure_allowed)
            $routeExpectedToken = Get-JsonPropertyString -Object $routeProbe -Name "expected_token"
            $routeCommand = Get-JsonPropertyString -Object $routeProbe -Name "command"
            $routeArguments = Get-JsonPropertyValue -Object $routeProbe -Name "arguments"
            $routeOutput = Get-JsonPropertyString -Object $routeProbe -Name "output"
            $routeProbeAccepted = if ($AllowFailedPostRouteProbe) {
                ($routeProbeOk -or ($routeProbeHasNonZeroExitCode -and $routeProbeFailureAllowed))
            }
            else {
                $routeProbeOk
            }
            Add-CheckFromCondition `
                "post-route route probe" `
                $routeProbeAccepted `
                ($(if ($AllowFailedPostRouteProbe) { "post-route matrix includes a successful route probe or an explicitly allowed failed route attempt" } else { "post-route matrix includes a successful route probe" })) `
                ($(if ($AllowFailedPostRouteProbe) { "post-route matrix lacks a successful route probe or explicitly allowed failed route attempt" } else { "post-route matrix lacks a successful route probe" }))

            if ($AllowFailedPostRouteProbe -and $routeProbeFailureAllowed -and -not $routeProbeOk) {
                Add-CheckFromCondition `
                    "post-route failed route probe exit code" `
                    $routeProbeHasNonZeroExitCode `
                    "post-route failed route probe records a numeric non-zero exit code" `
                    "post-route failed route probe must record a numeric non-zero exit code"
            }

            Add-CheckFromCondition `
                "post-route expected token present" `
                (-not [string]::IsNullOrWhiteSpace($routeExpectedToken)) `
                "post-route route probe records an expected token" `
                "post-route route probe lacks expected_token"
            Add-CheckFromCondition `
                "post-route route command binds wait token" `
                (-not [string]::IsNullOrWhiteSpace($routeExpectedToken) -and $routeCommand.Contains("--wait") -and $routeCommand.Contains($routeExpectedToken)) `
                "post-route route command records the wait prompt token" `
                "post-route route command does not bind expected token '$routeExpectedToken'"
            Add-CheckFromCondition `
                "post-route route arguments bind wait token" `
                (Test-RouteProbeArgumentsBindWaitToken -Arguments $routeArguments -ExpectedToken $routeExpectedToken) `
                "post-route route arguments record --wait with the expected token" `
                "post-route route arguments do not bind --wait to expected token '$routeExpectedToken'"
            if ($routeProbeOk) {
                Add-CheckFromCondition `
                    "post-route successful output contains expected token" `
                    (-not [string]::IsNullOrWhiteSpace($routeExpectedToken) -and $routeOutput.Contains($routeExpectedToken)) `
                    "post-route successful route output contains the expected token" `
                    "post-route successful route output does not contain expected token '$routeExpectedToken'"
            }

            $routeTarget = Get-JsonPropertyString -Object $routeProbe -Name "target"
            if ($RequirePostRouteTarget) {
                Add-CheckFromCondition `
                    "post-route route target present" `
                    (-not [string]::IsNullOrWhiteSpace($routeTarget)) `
                    "post-route route target is present" `
                    "post-route route target is missing"
                Add-CheckFromCondition `
                    "post-route route command binds target" `
                    (-not [string]::IsNullOrWhiteSpace($routeTarget) -and $routeCommand.Contains("--target") -and $routeCommand.Contains($routeTarget)) `
                    "post-route route command records the target route attempt" `
                    "post-route route command does not bind target '$routeTarget'"
                $routeArgumentsBindTarget = if ([string]::IsNullOrWhiteSpace($routeTarget)) {
                    $false
                }
                else {
                    Test-RouteProbeArgumentsBindTarget -Arguments $routeArguments -Target $routeTarget
                }
                Add-CheckFromCondition `
                    "post-route route arguments bind target" `
                    $routeArgumentsBindTarget `
                    "post-route route arguments record --target $routeTarget" `
                    "post-route route arguments do not bind --target $routeTarget"
            }
            if (-not [string]::IsNullOrWhiteSpace($ExpectedPostRouteTarget)) {
                Add-CheckFromCondition `
                    "post-route route target" `
                    ($routeTarget -eq $ExpectedPostRouteTarget) `
                    "post-route route target matches $ExpectedPostRouteTarget" `
                    "post-route route target is '$routeTarget', expected '$ExpectedPostRouteTarget'"
            }
            if ($RejectSelfPostRouteTarget) {
                Add-CheckFromCondition `
                    "post-route route target not self" `
                    (-not [string]::IsNullOrWhiteSpace($routeTarget) -and -not ($routeTarget -eq $operatorMachine)) `
                    "post-route route target is not the operator machine" `
                    "post-route route target '$routeTarget' must not match operator_machine '$operatorMachine'"
            }
            if ($RejectLocalPostRouteTarget) {
                Add-CheckFromCondition `
                    "post-route route target not local" `
                    (-not (Test-RouteTargetIsLocal -Target $routeTarget)) `
                    "post-route route target is not localhost or loopback" `
                    "post-route route target '$routeTarget' must not be localhost, loopback, or a local-only alias for second-PC route-attempt evidence"
            }
        }
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
    require_post_route_target = [bool]$RequirePostRouteTarget
    expected_post_route_target = if ([string]::IsNullOrWhiteSpace($ExpectedPostRouteTarget)) { $null } else { $ExpectedPostRouteTarget }
    reject_self_post_route_target = [bool]$RejectSelfPostRouteTarget
    reject_local_post_route_target = [bool]$RejectLocalPostRouteTarget
    allow_failed_post_route_probe = [bool]$AllowFailedPostRouteProbe
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
