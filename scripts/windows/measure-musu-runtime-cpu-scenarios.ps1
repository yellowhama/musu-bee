[CmdletBinding()]
param(
    [string[]]$Scenario = @("startup-open", "runtime-started", "dashboard-open", "desktop-open", "post-route"),
    [int]$SampleSeconds = 60,
    [int]$CommandTimeoutSec = 90,
    [string]$MusuExe,
    [switch]$OpenDesktopApp,
    [string]$DesktopAppId = "Yellowhama.MUSU_ygcjq669as2b6!MUSU",
    [string]$DashboardUrl,
    [switch]$RunRouteProbe,
    [string]$RoutePrompt,
    [string]$RouteTarget,
    [int]$RouteProbeMaxAttempts = 3,
    [int]$RouteProbeRetryDelaySec = 3,
    [switch]$AllowFailedRouteProbe,
    [double]$MaxOneCorePercent = 5.0,
    [int]$MaxOwnedProcessCount = 16,
    [int]$MaxOwnedWebView2ProcessCount = 8,
    [double]$MaxTotalWorkingSetMb = 1024.0,
    [string]$OutputRoot,
    [switch]$FailOnHot,
    [switch]$Json
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = (Resolve-Path (Join-Path $scriptDir "..\..")).Path
$version = (Get-Content -LiteralPath (Join-Path $repoRoot "VERSION") -Raw).Trim()
$measureScript = Join-Path $scriptDir "measure-musu-idle-cpu.ps1"

if ([string]::IsNullOrWhiteSpace($MusuExe)) {
    $MusuExe = Join-Path $repoRoot "musu-rs\target\debug\musu.exe"
}
if (-not (Test-Path -LiteralPath $MusuExe)) {
    throw "MusuExe not found: $MusuExe"
}
if ($SampleSeconds -lt 3) {
    throw "SampleSeconds must be at least 3."
}
if ($RouteProbeMaxAttempts -lt 1) {
    throw "RouteProbeMaxAttempts must be at least 1."
}
if ($RouteProbeRetryDelaySec -lt 1) {
    throw "RouteProbeRetryDelaySec must be at least 1."
}

$knownScenarioNames = @("startup-open", "runtime-started", "dashboard-open", "desktop-open", "post-route")
$normalizedScenarios = New-Object System.Collections.Generic.List[string]
$extraScenarioArgs = @()
if ($null -ne $MyInvocation.UnboundArguments) {
    $extraScenarioArgs = @($MyInvocation.UnboundArguments)
}
foreach ($item in @($Scenario + $extraScenarioArgs)) {
    foreach ($token in ([string]$item -split ",")) {
        $value = $token.Trim()
        if ([string]::IsNullOrWhiteSpace($value)) {
            continue
        }
        if ($knownScenarioNames -contains $value -and -not $normalizedScenarios.Contains($value)) {
            [void]$normalizedScenarios.Add($value)
        }
    }
}
if ($normalizedScenarios.Count -eq 0) {
    throw "No valid runtime CPU scenarios were supplied."
}
$Scenario = $normalizedScenarios.ToArray()

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$machine = if ([string]::IsNullOrWhiteSpace($env:COMPUTERNAME)) { "unknown" } else { $env:COMPUTERNAME }
if ([string]::IsNullOrWhiteSpace($OutputRoot)) {
    $OutputRoot = Join-Path $repoRoot ".local-build\runtime-cpu-scenarios\$stamp-$machine"
}
New-Item -ItemType Directory -Force -Path $OutputRoot | Out-Null

function ConvertTo-ProcessArgumentString {
    param([string[]]$Items)

    (@($Items) | ForEach-Object {
        $item = [string]$_
        $escaped = $item -replace '"', '\"'
        if ($escaped -match "\s") {
            "`"$escaped`""
        }
        else {
            $escaped
        }
    }) -join " "
}

function Invoke-CapturedCommand {
    param(
        [Parameter(Mandatory = $true)][string]$FilePath,
        [Parameter(Mandatory = $true)][string[]]$Arguments,
        [Parameter(Mandatory = $true)][int]$TimeoutSec
    )

    $commandId = [guid]::NewGuid().ToString("N")
    $tempRoot = [System.IO.Path]::GetTempPath()
    $stdoutPath = Join-Path $tempRoot "musu-cpu-scenarios-$commandId.stdout.log"
    $stderrPath = Join-Path $tempRoot "musu-cpu-scenarios-$commandId.stderr.log"
    $process = $null

    try {
        $process = Start-Process `
            -FilePath $FilePath `
            -ArgumentList (ConvertTo-ProcessArgumentString -Items $Arguments) `
            -RedirectStandardOutput $stdoutPath `
            -RedirectStandardError $stderrPath `
            -WindowStyle Hidden `
            -PassThru

        if (-not $process.WaitForExit($TimeoutSec * 1000)) {
            try {
                $process.Kill()
            }
            catch {
            }
            throw "command timed out after ${TimeoutSec}s: $FilePath $($Arguments -join ' ')"
        }

        $stdoutRaw = if (Test-Path -LiteralPath $stdoutPath) { Get-Content -LiteralPath $stdoutPath -Raw } else { "" }
        $stderrRaw = if (Test-Path -LiteralPath $stderrPath) { Get-Content -LiteralPath $stderrPath -Raw } else { "" }
        $stdoutText = if ($null -eq $stdoutRaw) { "" } else { ([string]$stdoutRaw).Trim() }
        $stderrText = if ($null -eq $stderrRaw) { "" } else { ([string]$stderrRaw).Trim() }
        $process.Refresh()
        $exitCode = $process.ExitCode
        if ($null -eq $exitCode -or [string]::IsNullOrWhiteSpace([string]$exitCode)) {
            $exitCode = 0
        }

        return [pscustomobject]@{
            exit_code = [int]$exitCode
            stdout = $stdoutText
            stderr = $stderrText
        }
    }
    finally {
        if ($null -ne $process) {
            $process.Dispose()
        }
        Remove-Item -LiteralPath $stdoutPath, $stderrPath -Force -ErrorAction SilentlyContinue
    }
}

function Get-RouteProbeRetryAfterSec {
    param([string]$Text)

    if ([string]::IsNullOrWhiteSpace($Text)) {
        return $null
    }
    $match = [regex]::Match($Text, '"retry_after_s"\s*:\s*(\d+)')
    if ($match.Success) {
        $value = [int]$match.Groups[1].Value
        if ($value -gt 0) {
            return $value
        }
    }
    if ($Text -match "429 Too Many Requests" -or $Text -match "rate_limited") {
        return $RouteProbeRetryDelaySec
    }
    return $null
}

function Invoke-TextCommand {
    param(
        [Parameter(Mandatory = $true)][string]$FilePath,
        [Parameter(Mandatory = $true)][string[]]$Arguments,
        [Parameter(Mandatory = $true)][int]$TimeoutSec
    )

    $result = Invoke-CapturedCommand -FilePath $FilePath -Arguments $Arguments -TimeoutSec $TimeoutSec
    if ($result.exit_code -ne 0) {
        throw "command failed with exit code $($result.exit_code): $FilePath $($Arguments -join ' ')`n$($result.stdout)`n$($result.stderr)"
    }

    if ([string]::IsNullOrWhiteSpace($result.stdout)) {
        return $result.stderr
    }
    if (-not [string]::IsNullOrWhiteSpace($result.stderr)) {
        return "$($result.stdout)`n$($result.stderr)"
    }
    return $result.stdout
}

function Invoke-JsonCommand {
    param(
        [Parameter(Mandatory = $true)][string]$FilePath,
        [Parameter(Mandatory = $true)][string[]]$Arguments,
        [Parameter(Mandatory = $true)][int]$TimeoutSec
    )

    $result = Invoke-CapturedCommand -FilePath $FilePath -Arguments $Arguments -TimeoutSec $TimeoutSec
    if ($result.exit_code -ne 0) {
        throw "command failed with exit code $($result.exit_code): $FilePath $($Arguments -join ' ')`n$($result.stdout)`n$($result.stderr)"
    }
    if ([string]::IsNullOrWhiteSpace($result.stdout)) {
        throw "No JSON stdout returned from command: $FilePath $($Arguments -join ' ')`n$($result.stderr)"
    }

    return $result.stdout | ConvertFrom-Json
}

function Invoke-MeasureScenario {
    param(
        [Parameter(Mandatory = $true)][string]$Name
    )

    $outputPath = Join-Path $OutputRoot ("{0}-{1}.{2}.evidence.json" -f $stamp, $machine, $Name)
    $measureArgs = @(
        "-NoProfile",
        "-ExecutionPolicy", "Bypass",
        "-File", $measureScript,
        "-SampleSeconds", $SampleSeconds,
        "-Scenario", $Name,
        "-MaxOneCorePercent", $MaxOneCorePercent,
        "-MaxOwnedProcessCount", $MaxOwnedProcessCount,
        "-MaxOwnedWebView2ProcessCount", $MaxOwnedWebView2ProcessCount,
        "-MaxTotalWorkingSetMb", $MaxTotalWorkingSetMb,
        "-IncludeNode",
        "-IncludeWebView2",
        "-OutputPath", $outputPath,
        "-Json"
    )
    if ($Name -eq "desktop-open") {
        $measureArgs += "-RequireOwnedWebView2"
    }

    $measureTimeoutSec = [Math]::Max($CommandTimeoutSec, $SampleSeconds + 30)
    $evidence = Invoke-JsonCommand -FilePath "powershell" -Arguments $measureArgs -TimeoutSec $measureTimeoutSec
    if ($null -eq $evidence) {
        throw "No JSON returned while measuring scenario '$Name'."
    }

    return [pscustomobject]@{
        scenario = $Name
        ok = [bool]$evidence.ok
        evidence_path = $outputPath
        git_commit = [string]$evidence.git_commit
        git_dirty = [bool]$evidence.git_dirty
        sample_seconds = [double]$evidence.sample_seconds
        cpu_sample_count = @($evidence.samples).Count
        process_counts_by_role = $evidence.process_counts_by_role
        max_one_core_percent_by_role = $evidence.max_one_core_percent_by_role
        cpu_attribution = $evidence.cpu_attribution
        total_working_set_mb_after = [double]$evidence.total_working_set_mb_after
        total_private_memory_mb_after = [double]$evidence.total_private_memory_mb_after
        resource_budget_violations = @($evidence.resource_budget_violations)
        hot_process_count = [int]$evidence.hot_process_count
    }
}

$routeProbe = $null
$discoveredDashboardUrl = $null
$expectedRouteToken = "MUSU_CPU_SCENARIO_ROUTE_OK_$($stamp.Replace('-', '_'))"
if ([string]::IsNullOrWhiteSpace($RoutePrompt)) {
    $RoutePrompt = "Reply exactly: $expectedRouteToken"
}

function Resolve-DashboardUrlFromUpResult {
    param($UpResult)

    if ($null -eq $UpResult -or -not $UpResult.PSObject.Properties["dashboard"]) {
        return ""
    }

    $dashboard = $UpResult.dashboard
    $reachableUrl = $dashboard.PSObject.Properties["reachable_url"]
    if ($reachableUrl -and -not [string]::IsNullOrWhiteSpace([string]$reachableUrl.Value)) {
        return [string]$reachableUrl.Value
    }

    return ""
}

$scenarioResults = @()
foreach ($name in $Scenario) {
    switch ($name) {
        "startup-open" {
            $openedAt = $null
            $sampleDelaySeconds = $null
            if ($OpenDesktopApp) {
                Start-Process explorer.exe ("shell:AppsFolder\{0}" -f $DesktopAppId)
                $openedAt = Get-Date
                Start-Sleep -Seconds 2
                $sampleDelaySeconds = [Math]::Round(((Get-Date) - $openedAt).TotalSeconds, 3)
            }
            $scenarioResults += [pscustomobject]@{
                scenario = "startup-open"
                preparation = [pscustomobject]@{
                    action = if ($OpenDesktopApp) { "Start packaged desktop app" } else { "none" }
                    desktop_app_id = $DesktopAppId
                    sample_delay_seconds = $sampleDelaySeconds
                    note = "Samples immediately after packaged app activation to catch startup busy-loop regressions."
                }
                measurement = Invoke-MeasureScenario -Name $name
            }
        }
        "runtime-started" {
            $up = Invoke-JsonCommand -FilePath $MusuExe -Arguments @("up", "--json") -TimeoutSec $CommandTimeoutSec
            $resolvedDashboardUrl = Resolve-DashboardUrlFromUpResult -UpResult $up
            if (-not [string]::IsNullOrWhiteSpace($resolvedDashboardUrl)) {
                $discoveredDashboardUrl = $resolvedDashboardUrl
            }
            $scenarioResults += [pscustomobject]@{
                scenario = "runtime-started"
                preparation = [pscustomobject]@{
                    action = "musu up --json"
                    bridge = if ($up) { $up.bridge } else { $null }
                    dashboard = if ($up) { $up.dashboard } else { $null }
                }
                measurement = Invoke-MeasureScenario -Name $name
            }
        }
        "dashboard-open" {
            $dashboardOpened = $false
            $dashboardDiscoveryAction = "none"
            $dashboardUrlToOpen = $DashboardUrl
            if ([string]::IsNullOrWhiteSpace($dashboardUrlToOpen)) {
                $dashboardUrlToOpen = $discoveredDashboardUrl
            }
            if ([string]::IsNullOrWhiteSpace($dashboardUrlToOpen)) {
                $dashboardUp = Invoke-JsonCommand -FilePath $MusuExe -Arguments @("up", "--json") -TimeoutSec $CommandTimeoutSec
                $dashboardDiscoveryAction = "musu up --json"
                $dashboardUrlToOpen = Resolve-DashboardUrlFromUpResult -UpResult $dashboardUp
                if (-not [string]::IsNullOrWhiteSpace($dashboardUrlToOpen)) {
                    $discoveredDashboardUrl = $dashboardUrlToOpen
                }
            }
            if (-not [string]::IsNullOrWhiteSpace($dashboardUrlToOpen)) {
                Start-Process $dashboardUrlToOpen
                $dashboardOpened = $true
                Start-Sleep -Seconds 5
            }
            $scenarioResults += [pscustomobject]@{
                scenario = "dashboard-open"
                preparation = [pscustomobject]@{
                    action = if ($dashboardOpened) { "Start-Process DashboardUrl" } else { "none" }
                    discovery_action = $dashboardDiscoveryAction
                    dashboard_url = $dashboardUrlToOpen
                    dashboard_url_source = if (-not [string]::IsNullOrWhiteSpace($DashboardUrl)) { "argument" } elseif ($dashboardDiscoveryAction -eq "musu up --json") { "musu_up_dashboard_open" } elseif (-not [string]::IsNullOrWhiteSpace($discoveredDashboardUrl)) { "musu_up" } else { "none" }
                    note = if ($dashboardOpened) { "Browser/WebView ownership depends on the caller; evidence still only budgets MUSU-owned/repo-related processes." } else { "DashboardUrl not supplied or discovered; measured current runtime state only." }
                }
                measurement = Invoke-MeasureScenario -Name $name
            }
        }
        "desktop-open" {
            if ($OpenDesktopApp) {
                Start-Process explorer.exe ("shell:AppsFolder\{0}" -f $DesktopAppId)
                Start-Sleep -Seconds 8
            }
            $scenarioResults += [pscustomobject]@{
                scenario = "desktop-open"
                preparation = [pscustomobject]@{
                    action = if ($OpenDesktopApp) { "Start packaged desktop app" } else { "none" }
                    desktop_app_id = $DesktopAppId
                }
                measurement = Invoke-MeasureScenario -Name $name
            }
        }
        "post-route" {
            if ($RunRouteProbe) {
                $routeArgs = @("route")
                if (-not [string]::IsNullOrWhiteSpace($RouteTarget)) {
                    $routeArgs += @("--target", $RouteTarget)
                }
                $routeArgs += @("--wait", $RoutePrompt)
                $routeCommand = "musu " + (ConvertTo-ProcessArgumentString -Items $routeArgs)
                $routeAttempts = New-Object System.Collections.Generic.List[object]
                $routeResult = $null
                $routeOutput = ""
                for ($attempt = 1; $attempt -le $RouteProbeMaxAttempts; $attempt++) {
                    $attemptStartedAt = (Get-Date).ToString("o")
                    $candidateResult = Invoke-CapturedCommand -FilePath $MusuExe -Arguments $routeArgs -TimeoutSec $CommandTimeoutSec
                    $routeOutputParts = @($candidateResult.stdout, $candidateResult.stderr) | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }
                    $candidateOutput = ($routeOutputParts -join "`n").Trim()
                    $candidateOk = ($candidateResult.exit_code -eq 0 -and $candidateOutput -like "*$expectedRouteToken*")
                    $retryAfterSec = if ($candidateOk) { $null } else { Get-RouteProbeRetryAfterSec -Text $candidateOutput }
                    $routeAttempts.Add([pscustomobject]@{
                        attempt = $attempt
                        started_at = $attemptStartedAt
                        exit_code = [int]$candidateResult.exit_code
                        stdout = [string]$candidateResult.stdout
                        stderr = [string]$candidateResult.stderr
                        output = $candidateOutput
                        ok = [bool]$candidateOk
                        retry_after_s = $retryAfterSec
                    }) | Out-Null
                    $routeResult = $candidateResult
                    $routeOutput = $candidateOutput
                    if ($candidateOk -or $attempt -ge $RouteProbeMaxAttempts -or $null -eq $retryAfterSec) {
                        break
                    }
                    Start-Sleep -Seconds ([Math]::Max($RouteProbeRetryDelaySec, [int]$retryAfterSec))
                }
                $routeProbe = [pscustomobject]@{
                    prompt = $RoutePrompt
                    expected_token = $expectedRouteToken
                    target = if ([string]::IsNullOrWhiteSpace($RouteTarget)) { $null } else { $RouteTarget }
                    command = $routeCommand
                    arguments = @($routeArgs)
                    max_attempts = $RouteProbeMaxAttempts
                    attempt_count = $routeAttempts.Count
                    attempts = $routeAttempts.ToArray()
                    exit_code = [int]$routeResult.exit_code
                    stdout = [string]$routeResult.stdout
                    stderr = [string]$routeResult.stderr
                    output = $routeOutput
                    ok = ($routeResult.exit_code -eq 0 -and $routeOutput -like "*$expectedRouteToken*")
                    failure_allowed = [bool]$AllowFailedRouteProbe
                }
                if ($routeResult.exit_code -ne 0 -and -not $AllowFailedRouteProbe) {
                    throw "route probe failed with exit code $($routeResult.exit_code): $routeCommand`n$routeOutput"
                }
                if (-not [bool]$routeProbe.ok -and -not $AllowFailedRouteProbe) {
                    throw "route probe did not produce expected token '$expectedRouteToken': $routeCommand`n$routeOutput"
                }
            }
            $scenarioResults += [pscustomobject]@{
                scenario = "post-route"
                preparation = [pscustomobject]@{
                    action = if ($RunRouteProbe -and -not [string]::IsNullOrWhiteSpace($RouteTarget)) { "musu route --target --wait" } elseif ($RunRouteProbe) { "musu route --wait" } else { "none" }
                    route_probe = $routeProbe
                }
                measurement = Invoke-MeasureScenario -Name $name
            }
        }
    }
}

$failed = @($scenarioResults | Where-Object { -not [bool]$_.measurement.ok })
$matrixPath = Join-Path $OutputRoot ("{0}-{1}.runtime-cpu-scenario-matrix.json" -f $stamp, $machine)
$result = [ordered]@{
    schema = "musu.runtime_cpu_scenario_matrix.v1"
    ok = ($failed.Count -eq 0)
    version = $version
    git_commit = (& git -C $repoRoot rev-parse HEAD 2>$null | Out-String).Trim()
    git_dirty = -not [string]::IsNullOrWhiteSpace((& git -C $repoRoot status --short 2>$null | Out-String).Trim())
    started_at = $stamp
    completed_at = (Get-Date).ToString("o")
    operator_machine = $machine
    operator_user = $env:USERNAME
    sample_seconds = $SampleSeconds
    max_one_core_percent = $MaxOneCorePercent
    max_owned_process_count = $MaxOwnedProcessCount
    max_owned_webview2_process_count = $MaxOwnedWebView2ProcessCount
    max_total_working_set_mb = $MaxTotalWorkingSetMb
    requested_scenarios = @($Scenario)
    route_probe = $routeProbe
    fail_count = $failed.Count
    scenarios = @($scenarioResults)
    matrix_path = $matrixPath
}

$result | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath $matrixPath -Encoding UTF8

if ($Json) {
    $result | ConvertTo-Json -Depth 12
} else {
    [pscustomobject]$result
}

if ($FailOnHot -and -not [bool]$result.ok) {
    exit 1
}
