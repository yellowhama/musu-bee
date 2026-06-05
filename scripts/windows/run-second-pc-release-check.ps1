[CmdletBinding()]
param(
    [ValidateSet("local-sideload-manual", "store-reviewed-immediate-registration")]
    [string]$StartupContract = "local-sideload-manual",
    [switch]$MachineTrust,
    [switch]$ReplaceExisting = $true,
    [string]$OutputRoot,
    [int]$CommandTimeoutSec = 90,
    [int]$RuntimeIdleCpuSampleSeconds = 60,
    [switch]$SkipRuntimeIdleCpu,
    [int]$RuntimeCpuScenarioMatrixSampleSeconds = 60,
    [ValidateSet("startup-open", "runtime-started", "dashboard-open", "desktop-open", "post-route")]
    [string[]]$RuntimeCpuScenario = @("startup-open", "runtime-started", "dashboard-open", "desktop-open", "post-route"),
    [string]$RuntimeCpuDashboardUrl,
    [switch]$RunRuntimeCpuRouteProbe = $true,
    [string]$RuntimeCpuRouteTarget,
    [string]$RuntimeCpuRoutePrompt,
    [int]$RuntimeCpuRouteWaitTimeoutSec = 180,
    [switch]$AllowFailedRuntimeCpuRouteProbe,
    [switch]$SkipRuntimeCpuScenarioMatrix,
    [switch]$FailOnRuntimeCpuScenarioMatrix,
    [switch]$NoReturnZip,
    [switch]$Json
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
. (Join-Path $scriptDir "msix-common.ps1")

$repoRoot = Get-WindowsRepoRoot $MyInvocation.MyCommand.Path
$versionPath = Join-Path $repoRoot "VERSION"
$version = if (Test-Path -LiteralPath $versionPath) {
    (Get-Content -LiteralPath $versionPath -Raw).Trim()
}
else {
    "unknown"
}

if ([string]::IsNullOrWhiteSpace($OutputRoot)) {
    $OutputRoot = Join-Path $repoRoot ".local-build\second-pc-release-check"
}

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$machine = if ([string]::IsNullOrWhiteSpace($env:COMPUTERNAME)) { "machine" } else { $env:COMPUTERNAME }
$safeMachine = $machine -replace "[^A-Za-z0-9._-]", "_"
$summaryPath = Join-Path $OutputRoot "$stamp-$safeMachine.release-check.json"
$msixEvidencePath = Join-Path $repoRoot ".local-build\msix-install\$stamp-$safeMachine.evidence.json"
$handoffPath = Join-Path $repoRoot ".local-build\second-pc-handoff\$stamp-$safeMachine.handoff.json"
$msixLegacyConflictsPath = Join-Path $repoRoot ".local-build\msix-legacy-conflicts\$stamp-$safeMachine.msix-legacy-conflicts.json"
$runtimeIdleCpuEvidencePath = Join-Path $repoRoot ".local-build\runtime-idle-cpu\$stamp-$safeMachine.desktop-open.evidence.json"
$runtimeCpuScenarioOutputRoot = Join-Path $repoRoot ".local-build\runtime-cpu-scenarios\$stamp-$safeMachine"
$processAttributionSummaryPath = Join-Path $repoRoot ".local-build\process-attribution\$stamp-$safeMachine.process-attribution-summary.json"
$runtimeCleanupReportPath = Join-Path $repoRoot ".local-build\runtime-cleanup\$stamp-$safeMachine.runtime-cleanup.json"
$returnZipPath = Join-Path $repoRoot ".local-build\second-pc-return\$stamp-$safeMachine.second-pc-return.zip"

$steps = New-Object System.Collections.Generic.List[object]
$errorText = $null
$capture = $null
$handoff = $null
$msixLegacyConflicts = $null
$msixLegacyConflictsError = $null
$runtimeIdleCpu = $null
$runtimeCpuScenarioMatrix = $null
$runtimeCpuScenarioMatrixPath = $null
$runtimeCpuScenarioMatrixError = $null
$runtimeCpuScenarioMatrixVerification = $null
$processAttributionSummary = $null
$processAttributionError = $null
$runtimeCleanup = $null
$runtimeCleanupError = $null

function Invoke-ReleaseStep {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][string]$ScriptName,
        [string[]]$Arguments = @(),
        [switch]$ParseJson
    )

    $scriptPath = Join-Path $scriptDir $ScriptName
    if (-not (Test-Path -LiteralPath $scriptPath)) {
        throw "Required script is missing: $scriptPath"
    }

    $startedAt = Get-Date
    $output = & powershell -NoProfile -ExecutionPolicy Bypass -File $scriptPath @Arguments 2>&1
    $exitCode = $LASTEXITCODE
    $raw = ($output | Out-String).Trim()
    $parsed = $null

    if ($ParseJson -and -not [string]::IsNullOrWhiteSpace($raw)) {
        try {
            $parsed = $raw | ConvertFrom-Json
        }
        catch {
            throw "$Name did not return parseable JSON.`n$raw"
        }
    }

    $steps.Add([pscustomobject]@{
        name = $Name
        script = $ScriptName
        exit_code = $exitCode
        started_at = $startedAt.ToString("o")
        completed_at = (Get-Date).ToString("o")
        output = $raw
    }) | Out-Null

    if ($exitCode -ne 0) {
        throw "$Name failed with exit code ${exitCode}.`n$raw"
    }

    return $parsed
}

function Start-MusuDesktopApp {
    $app = Get-StartApps | Where-Object {
        $_.Name -eq "MUSU" -or $_.AppID -like "Yellowhama.MUSU_*"
    } | Select-Object -First 1
    if (-not $app) {
        throw "Unable to find installed MUSU Start menu app for desktop-open CPU evidence."
    }

    Start-Process explorer.exe ("shell:AppsFolder\{0}" -f $app.AppID) | Out-Null
    Start-Sleep -Seconds 10
}

function Resolve-PackagedMusuExe {
    $windowsAppsAlias = Join-Path $env:LOCALAPPDATA "Microsoft\WindowsApps\musu.exe"
    if (Test-Path -LiteralPath $windowsAppsAlias) {
        return $windowsAppsAlias
    }

    $command = Get-Command "musu.exe" -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($command -and -not [string]::IsNullOrWhiteSpace([string]$command.Source)) {
        return [string]$command.Source
    }

    $command = Get-Command "musu" -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($command -and -not [string]::IsNullOrWhiteSpace([string]$command.Source)) {
        return [string]$command.Source
    }

    return $null
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

    $topProcessSubroles = @()
    if ($cpuAttribution -and $cpuAttribution.PSObject.Properties["top_processes"]) {
        $topProcessSubroles = @($cpuAttribution.top_processes | ForEach-Object {
            if ($_.PSObject.Properties["process_subrole"]) { [string]$_.process_subrole }
        } | Where-Object { -not [string]::IsNullOrWhiteSpace($_) } | Select-Object -Unique)
    }

    return [pscustomobject]@{
        scenario = $Scenario
        ok = ($issues.Count -eq 0)
        issues = @($issues)
        process_counts_by_subrole = $counts
        max_one_core_percent_by_subrole = $maxCpu
        memory_totals_by_subrole_mb = $memory
        required_subroles_present = $requiredSubroles
        top_process_subroles = $topProcessSubroles
    }
}

function Invoke-RuntimeCleanup {
    param(
        [Parameter(Mandatory = $true)][string]$OutputPath
    )

    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $OutputPath) | Out-Null

    $startedAt = Get-Date
    $musuExe = Resolve-PackagedMusuExe
    $stopReport = $null
    $stopRaw = $null
    $stopExitCode = $null
    $stopParseError = $null
    $runtimeError = $null
    $desktopStoppedPids = New-Object System.Collections.Generic.List[int]
    $desktopErrors = New-Object System.Collections.Generic.List[string]

    if ([string]::IsNullOrWhiteSpace($musuExe)) {
        $runtimeError = "Unable to resolve packaged MUSU CLI for cleanup."
    }
    else {
        $output = & $musuExe down --json --timeout-sec 5 --include-desktop 2>&1
        $stopExitCode = $LASTEXITCODE
        $stopRaw = ($output | Out-String).Trim()
        if (-not [string]::IsNullOrWhiteSpace($stopRaw)) {
            try {
                $stopReport = $stopRaw | ConvertFrom-Json
            }
            catch {
                $stopParseError = $_.Exception.Message
            }
        }
        if ($stopExitCode -ne 0) {
            $runtimeError = "musu down exited ${stopExitCode}."
        }
        elseif ($stopParseError) {
            $runtimeError = "musu down JSON parse failed: $stopParseError"
        }
        elseif ($stopReport -and -not [bool]$stopReport.ok) {
            $runtimeError = "musu down reported ok=false: $([string]$stopReport.error)"
        }
    }

    $desktopProcesses = @(Get-CimInstance Win32_Process -Filter "name='musu-desktop.exe'" -ErrorAction SilentlyContinue | Where-Object {
        [string]$_.CommandLine -like "*Yellowhama.MUSU*"
    })
    foreach ($process in $desktopProcesses) {
        try {
            Stop-Process -Id $process.ProcessId -Force -ErrorAction Stop
            [void]$desktopStoppedPids.Add([int]$process.ProcessId)
        }
        catch {
            [void]$desktopErrors.Add(("pid {0}: {1}" -f $process.ProcessId, $_.Exception.Message))
        }
    }
    Start-Sleep -Milliseconds 500
    $remainingDesktop = @(Get-CimInstance Win32_Process -Filter "name='musu-desktop.exe'" -ErrorAction SilentlyContinue | Where-Object {
        [string]$_.CommandLine -like "*Yellowhama.MUSU*"
    })

    $cleanup = [pscustomobject]@{
        schema = "musu.second_pc_runtime_cleanup.v1"
        ok = ([string]::IsNullOrWhiteSpace($runtimeError) -and (@($desktopErrors).Count -eq 0) -and (@($remainingDesktop).Count -eq 0))
        version = $version
        recorded_at = (Get-Date).ToString("o")
        started_at = $startedAt.ToString("o")
        operator_machine = $env:COMPUTERNAME
        operator_user = $env:USERNAME
        musu_exe = $musuExe
        stop_exit_code = $stopExitCode
        stop_raw = $stopRaw
        stop_parse_error = $stopParseError
        stop_report = $stopReport
        desktop_stopped_pids = @($desktopStoppedPids)
        desktop_cleanup_errors = @($desktopErrors)
        remaining_desktop_shell_count = @($remainingDesktop).Count
        remaining_desktop_pids = @($remainingDesktop | ForEach-Object { [int]$_.ProcessId })
        error = $runtimeError
    }
    $cleanup | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $OutputPath -Encoding UTF8
    return $cleanup
}

try {
    New-Item -ItemType Directory -Force -Path $OutputRoot | Out-Null

    Invoke-ReleaseStep `
        -Name "sideload readiness" `
        -ScriptName "check-msix-sideload-readiness.ps1" `
        -Arguments @("-StartupContract", $StartupContract) | Out-Null

    $installArgs = @("-StartupContract", $StartupContract)
    if ($ReplaceExisting) {
        $installArgs += "-ReplaceExisting"
    }
    if ($MachineTrust) {
        $installArgs += "-MachineTrust"
    }
    Invoke-ReleaseStep `
        -Name "install and verify MSIX" `
        -ScriptName "install-and-verify-msix.ps1" `
        -Arguments $installArgs | Out-Null

    try {
        $msixLegacyConflicts = Invoke-ReleaseStep `
            -Name "check MSIX legacy conflicts" `
            -ScriptName "check-msix-legacy-conflicts.ps1" `
            -Arguments @("-OutputPath", $msixLegacyConflictsPath, "-Json") `
            -ParseJson
    }
    catch {
        $msixLegacyConflictsError = $_.Exception.Message
    }

    $capture = Invoke-ReleaseStep `
        -Name "capture MSIX install evidence" `
        -ScriptName "capture-msix-install-evidence.ps1" `
        -Arguments @("-StartupContract", $StartupContract, "-EvidencePath", $msixEvidencePath, "-Json") `
        -ParseJson

    $handoff = Invoke-ReleaseStep `
        -Name "collect second-PC handoff" `
        -ScriptName "collect-second-pc-handoff.ps1" `
        -Arguments @("-OutputPath", $handoffPath, "-CommandTimeoutSec", ([string]$CommandTimeoutSec), "-Json") `
        -ParseJson

    if (-not $SkipRuntimeIdleCpu) {
        Start-MusuDesktopApp
        $runtimeIdleCpu = Invoke-ReleaseStep `
            -Name "measure desktop-open runtime idle CPU" `
            -ScriptName "measure-musu-idle-cpu.ps1" `
            -Arguments @(
                "-SampleSeconds", ([string]$RuntimeIdleCpuSampleSeconds),
                "-Scenario", "desktop-open",
                "-RequireOwnedWebView2",
                "-MaxOneCorePercent", "5",
                "-MaxOwnedProcessCount", "16",
                "-MaxOwnedWebView2ProcessCount", "8",
                "-MaxTotalWorkingSetMb", "1024",
                "-IncludeNode",
                "-IncludeWebView2",
                "-OutputPath", $runtimeIdleCpuEvidencePath,
                "-FailOnHot",
                "-Json"
            ) `
            -ParseJson
    }

    if (-not $SkipRuntimeCpuScenarioMatrix) {
        try {
            $matrixArgs = @(
                "-Scenario"
            ) + @($RuntimeCpuScenario) + @(
                "-SampleSeconds", ([string]$RuntimeCpuScenarioMatrixSampleSeconds),
                "-CommandTimeoutSec", ([string]$CommandTimeoutSec),
                "-RouteWaitTimeoutSec", ([string]$RuntimeCpuRouteWaitTimeoutSec),
                "-OutputRoot", $runtimeCpuScenarioOutputRoot,
                "-OpenDesktopApp",
                "-Json"
            )
            if (-not [string]::IsNullOrWhiteSpace($RuntimeCpuDashboardUrl)) {
                $matrixArgs += @("-DashboardUrl", $RuntimeCpuDashboardUrl)
            }
            if ($RunRuntimeCpuRouteProbe) {
                $matrixArgs += "-RunRouteProbe"
            }
            if (-not [string]::IsNullOrWhiteSpace($RuntimeCpuRouteTarget)) {
                $matrixArgs += @("-RouteTarget", $RuntimeCpuRouteTarget)
            }
            if (-not [string]::IsNullOrWhiteSpace($RuntimeCpuRoutePrompt)) {
                $matrixArgs += @("-RoutePrompt", $RuntimeCpuRoutePrompt)
            }
            if ($AllowFailedRuntimeCpuRouteProbe) {
                $matrixArgs += "-AllowFailedRouteProbe"
            }
            if ($FailOnRuntimeCpuScenarioMatrix) {
                $matrixArgs += "-FailOnHot"
            }

            $runtimeCpuScenarioMatrix = Invoke-ReleaseStep `
                -Name "measure runtime CPU scenario matrix" `
                -ScriptName "measure-musu-runtime-cpu-scenarios.ps1" `
                -Arguments $matrixArgs `
                -ParseJson
            $runtimeCpuScenarioMatrixPath = if ($runtimeCpuScenarioMatrix) { [string]$runtimeCpuScenarioMatrix.matrix_path } else { $null }

            if ($FailOnRuntimeCpuScenarioMatrix -and $runtimeCpuScenarioMatrix -and -not [bool]$runtimeCpuScenarioMatrix.ok) {
                throw "Runtime CPU scenario matrix reports ok=false: $runtimeCpuScenarioMatrixPath"
            }

            if (-not [string]::IsNullOrWhiteSpace($runtimeCpuScenarioMatrixPath) -and (Test-Path -LiteralPath $runtimeCpuScenarioMatrixPath)) {
                $verifyScript = Join-Path $scriptDir "verify-runtime-cpu-scenario-matrix.ps1"
                if (Test-Path -LiteralPath $verifyScript) {
                    $startedAt = Get-Date
                    $verifyArgs = @(
                        "-NoProfile",
                        "-ExecutionPolicy", "Bypass",
                        "-File", $verifyScript,
                        "-EvidencePath", $runtimeCpuScenarioMatrixPath,
                        "-ExpectedVersion", $version,
                        "-RequiredScenarios", ($RuntimeCpuScenario -join ",")
                    ) + @(
                        "-MinSampleSeconds", ([string]$RuntimeCpuScenarioMatrixSampleSeconds),
                        "-MaxOneCorePercent", "5",
                        "-RequirePostRouteProbe",
                        "-Json"
                    )
                    if (-not [string]::IsNullOrWhiteSpace($RuntimeCpuRouteTarget)) {
                        $verifyArgs += @("-ExpectedPostRouteTarget", $RuntimeCpuRouteTarget)
                    }
                    if ($AllowFailedRuntimeCpuRouteProbe) {
                        $verifyArgs += "-AllowFailedPostRouteProbe"
                    }
                    $verifyOutput = & powershell @verifyArgs 2>&1
                    $verifyExitCode = $LASTEXITCODE
                    $verifyRaw = ($verifyOutput | Out-String).Trim()
                    $verifyParsed = $null
                    if (-not [string]::IsNullOrWhiteSpace($verifyRaw)) {
                        try {
                            $verifyParsed = $verifyRaw | ConvertFrom-Json
                        }
                        catch {
                            $verifyParsed = [pscustomobject]@{
                                ok = $false
                                parse_error = $_.Exception.Message
                                raw = $verifyRaw
                            }
                        }
                    }
                    $steps.Add([pscustomobject]@{
                        name = "verify runtime CPU scenario matrix"
                        script = "verify-runtime-cpu-scenario-matrix.ps1"
                        exit_code = $verifyExitCode
                        started_at = $startedAt.ToString("o")
                        completed_at = (Get-Date).ToString("o")
                        output = $verifyRaw
                    }) | Out-Null
                    $runtimeCpuScenarioMatrixVerification = $verifyParsed
                    if ($FailOnRuntimeCpuScenarioMatrix -and $verifyExitCode -ne 0) {
                        throw "Runtime CPU scenario matrix verification failed with exit code ${verifyExitCode}.`n$verifyRaw"
                    }
                }
                elseif ($FailOnRuntimeCpuScenarioMatrix) {
                    throw "Runtime CPU scenario matrix verifier is missing: $verifyScript"
                }
            }
        }
        catch {
            $runtimeCpuScenarioMatrixError = $_.Exception.Message
            if ($FailOnRuntimeCpuScenarioMatrix) {
                throw
            }
        }
    }

    try {
        $processAttributionSummary = Invoke-ReleaseStep `
            -Name "summarize MUSU process attribution" `
            -ScriptName "show-musu-process-attribution.ps1" `
            -Arguments @("-OutputPath", $processAttributionSummaryPath, "-Json") `
            -ParseJson
    }
    catch {
        $processAttributionError = $_.Exception.Message
    }
}
catch {
    $errorText = $_.Exception.Message
}
finally {
    try {
        $runtimeCleanup = Invoke-RuntimeCleanup -OutputPath $runtimeCleanupReportPath
    }
    catch {
        $runtimeCleanupError = $_.Exception.Message
        try {
            New-Item -ItemType Directory -Force -Path (Split-Path -Parent $runtimeCleanupReportPath) | Out-Null
            [pscustomobject]@{
                schema = "musu.second_pc_runtime_cleanup.v1"
                ok = $false
                version = $version
                recorded_at = (Get-Date).ToString("o")
                operator_machine = $env:COMPUTERNAME
                operator_user = $env:USERNAME
                error = $runtimeCleanupError
            } | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $runtimeCleanupReportPath -Encoding UTF8
        }
        catch {
            # The summary JSON below still records runtimeCleanupError.
        }
    }
}

$runtimeCpuScenarioFiles = @()
if (-not $SkipRuntimeCpuScenarioMatrix -and (Test-Path -LiteralPath $runtimeCpuScenarioOutputRoot)) {
    $runtimeCpuScenarioFiles = @(Get-ChildItem -LiteralPath $runtimeCpuScenarioOutputRoot -File -ErrorAction SilentlyContinue | ForEach-Object { $_.FullName })
}

$returnFiles = @(
    $msixEvidencePath,
    $handoffPath,
    $msixLegacyConflictsPath,
    $(if (-not $SkipRuntimeIdleCpu) { $runtimeIdleCpuEvidencePath }),
    $runtimeCpuScenarioFiles,
    $processAttributionSummaryPath,
    $runtimeCleanupReportPath,
    $summaryPath
) | Where-Object { -not [string]::IsNullOrWhiteSpace([string]$_) }
if (-not $NoReturnZip) {
    $returnFiles = @($returnZipPath) + $returnFiles
}

$runtimeIdleCpuSubroleSummary = if ($SkipRuntimeIdleCpu -or -not $runtimeIdleCpu) {
    $null
}
else {
    New-CpuSubroleSummary -Measurement $runtimeIdleCpu -Scenario "desktop-open" -RequireDesktopShell -RequireWebView2Helper
}
$runtimeCpuScenarioSubroleSummary = @()
if (-not $SkipRuntimeCpuScenarioMatrix -and $runtimeCpuScenarioMatrix -and $runtimeCpuScenarioMatrix.PSObject.Properties["scenarios"]) {
    $runtimeCpuScenarioSubroleSummary = @($runtimeCpuScenarioMatrix.scenarios | ForEach-Object {
        $scenarioName = [string]$_.scenario
        $requiresDesktop = ($scenarioName -eq "startup-open" -or $scenarioName -eq "desktop-open")
        $requiresWebView2 = ($scenarioName -eq "desktop-open")
        New-CpuSubroleSummary `
            -Measurement $_.measurement `
            -Scenario $scenarioName `
            -RequireDesktopShell:$requiresDesktop `
            -RequireWebView2Helper:$requiresWebView2
    })
}
$runtimeCpuSubroleContractOk = (
    ($SkipRuntimeIdleCpu -or ($runtimeIdleCpuSubroleSummary -and [bool]$runtimeIdleCpuSubroleSummary.ok)) -and
    ($SkipRuntimeCpuScenarioMatrix -or ($runtimeCpuScenarioSubroleSummary.Count -gt 0 -and @($runtimeCpuScenarioSubroleSummary | Where-Object { -not [bool]$_.ok }).Count -eq 0))
)

$result = [pscustomobject]@{
    schema = "musu.second_pc_release_check.v1"
    ok = ([string]::IsNullOrWhiteSpace($errorText) -and ($runtimeCleanup -and [bool]$runtimeCleanup.ok))
    version = $version
    startup_contract = $StartupContract
    completed_at = (Get-Date).ToString("o")
    operator_machine = $env:COMPUTERNAME
    operator_user = $env:USERNAME
    msix_install_evidence_path = $msixEvidencePath
    second_pc_handoff_path = $handoffPath
    msix_legacy_conflicts_path = $msixLegacyConflictsPath
    msix_legacy_conflicts_ok = if ($msixLegacyConflicts) { [bool]$msixLegacyConflicts.ok } else { $false }
    msix_legacy_conflicts_error = $msixLegacyConflictsError
    msix_legacy_conflict_count = if ($msixLegacyConflicts) { [int]$msixLegacyConflicts.conflict_count } else { $null }
    msix_alias_shadowing_count = if ($msixLegacyConflicts) { [int]$msixLegacyConflicts.alias_shadowing_count } else { $null }
    runtime_idle_cpu_evidence_path = if ($SkipRuntimeIdleCpu) { $null } else { $runtimeIdleCpuEvidencePath }
    runtime_cpu_scenario_output_root = if ($SkipRuntimeCpuScenarioMatrix) { $null } else { $runtimeCpuScenarioOutputRoot }
    runtime_cpu_scenario_matrix_path = if ($SkipRuntimeCpuScenarioMatrix) { $null } else { $runtimeCpuScenarioMatrixPath }
    runtime_cpu_route_target = if ([string]::IsNullOrWhiteSpace($RuntimeCpuRouteTarget)) { $null } else { $RuntimeCpuRouteTarget }
    runtime_cpu_route_probe_failure_allowed = [bool]$AllowFailedRuntimeCpuRouteProbe
    runtime_cpu_scenario_matrix_ok = if ($SkipRuntimeCpuScenarioMatrix) { $null } elseif ($runtimeCpuScenarioMatrix) { [bool]$runtimeCpuScenarioMatrix.ok } else { $false }
    runtime_cpu_scenario_matrix_verified = if ($SkipRuntimeCpuScenarioMatrix) { $null } elseif ($runtimeCpuScenarioMatrixVerification) { [bool]$runtimeCpuScenarioMatrixVerification.ok } else { $false }
    runtime_cpu_scenario_matrix_verification = $runtimeCpuScenarioMatrixVerification
    runtime_cpu_scenario_matrix_error = $runtimeCpuScenarioMatrixError
    runtime_idle_cpu_subrole_summary = $runtimeIdleCpuSubroleSummary
    runtime_cpu_scenario_subrole_summary = $runtimeCpuScenarioSubroleSummary
    runtime_cpu_subrole_contract_ok = [bool]$runtimeCpuSubroleContractOk
    process_attribution_summary_path = $processAttributionSummaryPath
    process_attribution_ok = if ($processAttributionSummary) { [bool]$processAttributionSummary.ok } else { $false }
    process_attribution_error = $processAttributionError
    process_attribution_counts = if ($processAttributionSummary) { $processAttributionSummary.counts } else { $null }
    runtime_cleanup_report_path = $runtimeCleanupReportPath
    runtime_cleanup_ok = if ($runtimeCleanup) { [bool]$runtimeCleanup.ok } else { $false }
    runtime_cleanup_error = $runtimeCleanupError
    runtime_cleanup = $runtimeCleanup
    suggested_remote_addrs = if ($handoff) { $handoff.suggested_remote_addrs } else { @() }
    remote_name_suggestion = if ($handoff) { [string]$handoff.remote_name_suggestion } else { $env:COMPUTERNAME }
    capture_ok = if ($capture) { [bool]$capture.ok } else { $false }
    handoff_ok = if ($handoff) { [bool]$handoff.ok } else { $false }
    runtime_idle_cpu_ok = if ($SkipRuntimeIdleCpu) { $null } elseif ($runtimeIdleCpu) { [bool]$runtimeIdleCpu.ok } else { $false }
    return_zip_path = if ($NoReturnZip) { $null } else { $returnZipPath }
    return_zip_ok = $false
    return_zip_error = $null
    return_files = $returnFiles
    steps = $steps.ToArray()
    error = if (-not [string]::IsNullOrWhiteSpace($errorText)) { $errorText } elseif ($runtimeCleanup -and -not [bool]$runtimeCleanup.ok) { "runtime cleanup failed" } elseif ($runtimeCleanupError) { $runtimeCleanupError } else { $null }
}

New-Item -ItemType Directory -Force -Path (Split-Path -Parent $summaryPath) | Out-Null
$result | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $summaryPath -Encoding UTF8

if (-not $NoReturnZip) {
    try {
        $filesToZip = @($msixEvidencePath, $handoffPath, $msixLegacyConflictsPath, $(if (-not $SkipRuntimeIdleCpu) { $runtimeIdleCpuEvidencePath }), $runtimeCpuScenarioFiles, $processAttributionSummaryPath, $runtimeCleanupReportPath, $summaryPath) | Where-Object {
            (-not [string]::IsNullOrWhiteSpace([string]$_)) -and (Test-Path -LiteralPath $_)
        }
        if ($filesToZip.Count -eq 0) {
            throw "No return files exist yet."
        }
        New-Item -ItemType Directory -Force -Path (Split-Path -Parent $returnZipPath) | Out-Null
        Compress-Archive -LiteralPath $filesToZip -DestinationPath $returnZipPath -CompressionLevel Optimal -Force
        $result.return_zip_ok = $true
    }
    catch {
        $result.return_zip_error = $_.Exception.Message
    }
    $result | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $summaryPath -Encoding UTF8
}

if ($Json) {
    $result | ConvertTo-Json -Depth 8
}
else {
    "MUSU second-PC release check"
    "ok: $($result.ok)"
    "summary_path: $((Resolve-Path -LiteralPath $summaryPath).Path)"
    "msix_install_evidence_path: $($result.msix_install_evidence_path)"
    "second_pc_handoff_path: $($result.second_pc_handoff_path)"
    "msix_legacy_conflicts_path: $(if ($result.msix_legacy_conflicts_path) { $result.msix_legacy_conflicts_path } else { '<not captured>' })"
    "runtime_idle_cpu_evidence_path: $(if ($result.runtime_idle_cpu_evidence_path) { $result.runtime_idle_cpu_evidence_path } else { '<skipped>' })"
    "runtime_cpu_scenario_matrix_path: $(if ($result.runtime_cpu_scenario_matrix_path) { $result.runtime_cpu_scenario_matrix_path } elseif ($SkipRuntimeCpuScenarioMatrix) { '<skipped>' } else { '<not captured>' })"
    "runtime_cpu_subrole_contract_ok: $($result.runtime_cpu_subrole_contract_ok)"
    if ($result.runtime_idle_cpu_subrole_summary) {
        $counts = $result.runtime_idle_cpu_subrole_summary.process_counts_by_subrole
        "runtime_idle_cpu_subroles: bridge_runtime=$(Get-SubroleCount -Counts $counts -Name 'bridge_runtime'), desktop_shell=$(Get-SubroleCount -Counts $counts -Name 'desktop_shell'), webview2_helper=$(Get-SubroleCount -Counts $counts -Name 'webview2_helper')"
    }
    foreach ($summary in @($result.runtime_cpu_scenario_subrole_summary)) {
        $counts = $summary.process_counts_by_subrole
        "runtime_cpu_scenario_subroles[$($summary.scenario)]: ok=$($summary.ok), bridge_runtime=$(Get-SubroleCount -Counts $counts -Name 'bridge_runtime'), desktop_shell=$(Get-SubroleCount -Counts $counts -Name 'desktop_shell'), webview2_helper=$(Get-SubroleCount -Counts $counts -Name 'webview2_helper')"
        if (-not [bool]$summary.ok) {
            "runtime_cpu_scenario_subrole_issues[$($summary.scenario)]: $(@($summary.issues) -join ', ')"
        }
    }
    "process_attribution_summary_path: $(if ($result.process_attribution_summary_path) { $result.process_attribution_summary_path } else { '<not captured>' })"
    "runtime_cleanup_report_path: $(if ($result.runtime_cleanup_report_path) { $result.runtime_cleanup_report_path } else { '<not captured>' })"
    "return_zip_path: $($result.return_zip_path)"
    "remote_name_suggestion: $($result.remote_name_suggestion)"
    "suggested_remote_addrs:"
    foreach ($addr in @($result.suggested_remote_addrs)) {
        "  - $addr"
    }
    ""
    "Return these files to the primary release repo:"
    foreach ($file in @($result.return_files)) {
        "  - $file"
    }
    if ($result.return_zip_error) {
        ""
        "return_zip_error: $($result.return_zip_error)"
    }
    if ($result.process_attribution_error) {
        ""
        "process_attribution_error: $($result.process_attribution_error)"
    }
    if ($result.runtime_cleanup_error) {
        ""
        "runtime_cleanup_error: $($result.runtime_cleanup_error)"
    }
    if ($result.msix_legacy_conflicts_error) {
        ""
        "msix_legacy_conflicts_error: $($result.msix_legacy_conflicts_error)"
    }
    if (-not $result.ok) {
        ""
        "error: $($result.error)"
    }
}

if (-not $result.ok) {
    exit 1
}
