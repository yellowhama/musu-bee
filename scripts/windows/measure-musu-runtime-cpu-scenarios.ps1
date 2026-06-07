[CmdletBinding()]
param(
    [string[]]$Scenario = @("startup-open", "runtime-started", "dashboard-open", "desktop-open", "post-route"),
    [int]$SampleSeconds = 60,
    [int]$CommandTimeoutSec = 90,
    [int]$RouteWaitTimeoutSec = 180,
    [string]$MusuExe,
    [switch]$AllowDeveloperRuntime,
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

function Get-DefaultMusuExe {
    $windowsAppsAlias = if ($env:LOCALAPPDATA) {
        Join-Path $env:LOCALAPPDATA "Microsoft\WindowsApps\musu.exe"
    }
    else {
        $null
    }

    if (-not [string]::IsNullOrWhiteSpace($windowsAppsAlias) -and (Test-Path -LiteralPath $windowsAppsAlias)) {
        return $windowsAppsAlias
    }

    return (Join-Path $repoRoot "musu-rs\target\debug\musu.exe")
}

function Test-PackagedMusuCommandPath([string]$Path) {
    if ([string]::IsNullOrWhiteSpace($Path)) {
        return $false
    }
    $lower = $Path.ToLowerInvariant()
    return (
        $lower.Contains("\microsoft\windowsapps\musu.exe") -or
        $lower.Contains("\windowsapps\yellowhama.musu_") -or
        $lower.Contains("\program files\windowsapps\yellowhama.musu_")
    )
}

function ConvertTo-FullPath {
    param([Parameter(Mandatory = $true)][string]$Path)

    if ([System.IO.Path]::IsPathRooted($Path)) {
        return [System.IO.Path]::GetFullPath($Path)
    }

    return [System.IO.Path]::GetFullPath((Join-Path (Get-Location).Path $Path))
}

function Test-PathWithinDirectory {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][string]$Directory
    )

    $fullPath = [System.IO.Path]::GetFullPath($Path).TrimEnd("\", "/")
    $fullDirectory = [System.IO.Path]::GetFullPath($Directory).TrimEnd("\", "/")
    if ($fullPath.Equals($fullDirectory, [System.StringComparison]::OrdinalIgnoreCase)) {
        return $true
    }

    $prefix = $fullDirectory + [System.IO.Path]::DirectorySeparatorChar
    return $fullPath.StartsWith($prefix, [System.StringComparison]::OrdinalIgnoreCase)
}

function Test-GitIgnoredPath {
    param([Parameter(Mandatory = $true)][string]$Path)

    $fullPath = ConvertTo-FullPath -Path $Path
    $gitOutput = & git -C $repoRoot check-ignore -q -- $fullPath 2>$null
    $ignored = ($LASTEXITCODE -eq 0)
    $null = $gitOutput
    return $ignored
}

if ([string]::IsNullOrWhiteSpace($MusuExe)) {
    $MusuExe = Get-DefaultMusuExe
}
if (-not (Test-Path -LiteralPath $MusuExe)) {
    throw "MusuExe not found: $MusuExe"
}
if (-not $AllowDeveloperRuntime -and -not (Test-PackagedMusuCommandPath $MusuExe)) {
    throw "Runtime CPU scenario matrix must use the packaged WindowsApps MUSU command for release evidence. Got: $MusuExe. Pass -AllowDeveloperRuntime only for diagnostic developer runs."
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
if ($RouteWaitTimeoutSec -lt 1 -or $RouteWaitTimeoutSec -gt 3600) {
    throw "RouteWaitTimeoutSec must be between 1 and 3600."
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
$outputRootFullPath = ConvertTo-FullPath -Path $OutputRoot
$outputRootWithinRepo = Test-PathWithinDirectory -Path $outputRootFullPath -Directory $repoRoot
$outputRootGitIgnored = if ($outputRootWithinRepo) { Test-GitIgnoredPath -Path $outputRootFullPath } else { $false }
if ($outputRootWithinRepo -and -not $outputRootGitIgnored) {
    throw "Runtime CPU scenario matrix OutputRoot is inside the repository but is not git-ignored: $outputRootFullPath. Capture release evidence in the default .local-build output root first, verify it, then copy verified matrix and verification JSON into docs/evidence."
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

function ConvertFrom-JsonText {
    param([AllowEmptyString()][string]$Text)

    if ([string]::IsNullOrWhiteSpace($Text)) {
        return $null
    }

    try {
        return ($Text | ConvertFrom-Json)
    }
    catch {
        return $null
    }
}

function Get-JsonPropertyValue {
    param(
        $Object,
        [Parameter(Mandatory = $true)][string]$Name
    )

    if ($null -eq $Object) {
        return $null
    }
    $property = $Object.PSObject.Properties[$Name]
    if (-not $property) {
        return $null
    }
    return $property.Value
}

function Get-CandidateHostPort {
    param([AllowEmptyString()][string]$CandidateAddr)

    $result = [pscustomobject]@{
        host = ""
        port = $null
    }
    if ([string]::IsNullOrWhiteSpace($CandidateAddr)) {
        return $result
    }

    $withoutScheme = $CandidateAddr.Trim() -replace '^[a-z][a-z0-9+.-]*://', ''
    $authority = (($withoutScheme -split '/', 2)[0]).Trim()
    if ([string]::IsNullOrWhiteSpace($authority)) {
        return $result
    }

    if ($authority.StartsWith("[")) {
        $end = $authority.IndexOf("]")
        if ($end -gt 1) {
            $result.host = $authority.Substring(1, $end - 1)
            $after = $authority.Substring($end + 1)
            if ($after.StartsWith(":")) {
                $portValue = 0
                if ([int]::TryParse($after.Substring(1), [ref]$portValue)) {
                    $result.port = $portValue
                }
            }
        }
        return $result
    }

    $colonMatches = [regex]::Matches($authority, ":")
    if ($colonMatches.Count -eq 1) {
        $parts = $authority -split ":", 2
        $result.host = $parts[0].Trim()
        $portValue = 0
        if ([int]::TryParse($parts[1], [ref]$portValue)) {
            $result.port = $portValue
        }
        return $result
    }

    $result.host = $authority.Trim()
    return $result
}

function Test-TcpPort {
    param(
        [Parameter(Mandatory = $true)][string]$HostName,
        [Parameter(Mandatory = $true)][int]$Port,
        [Parameter(Mandatory = $true)][int]$TimeoutMs
    )

    $client = [System.Net.Sockets.TcpClient]::new()
    try {
        $async = $client.BeginConnect($HostName, $Port, $null, $null)
        $connected = $async.AsyncWaitHandle.WaitOne($TimeoutMs)
        if (-not $connected) {
            return $false
        }
        $client.EndConnect($async)
        return $client.Connected
    }
    catch {
        return $false
    }
    finally {
        $client.Close()
    }
}

function Test-IcmpPing {
    param(
        [Parameter(Mandatory = $true)][string]$HostName,
        [int]$TimeoutMs = 2000
    )

    try {
        $ping = [System.Net.NetworkInformation.Ping]::new()
        try {
            $reply = $ping.Send($HostName, $TimeoutMs)
            return ($reply.Status -eq [System.Net.NetworkInformation.IPStatus]::Success)
        }
        finally {
            $ping.Dispose()
        }
    }
    catch {
        return $false
    }
}

function Get-DoctorBackgroundSnapshot {
    $expectedBackgroundFieldNames = @(
        "mdns_enabled",
        "clipboard_sync_enabled",
        "cloud_registration_enabled",
        "cloud_heartbeat_interval_sec",
        "cloud_heartbeat_floor_sec",
        "relay_payload_poller_enabled",
        "relay_payload_poller_interval_sec",
        "relay_payload_poller_interval_floor_sec",
        "planner_enabled",
        "planner_interval_sec",
        "planner_interval_floor_sec",
        "planner_command_timeout_sec",
        "planner_command_timeout_floor_sec",
        "planner_command_timeout_ceiling_sec",
        "auto_update_supervise_enabled",
        "auto_update_check_interval_minutes",
        "auto_update_check_interval_floor_minutes",
        "auto_update_health_poll_initial_ms",
        "auto_update_health_poll_max_ms",
        "bridge_health_poll_initial_ms",
        "bridge_health_poll_max_ms",
        "runtime_loop_candidates",
        "active_runtime_loop_candidate_count",
        "active_runtime_loop_candidate_keys"
    )
    $expectedRuntimeLoopCandidateKeys = @(
        "mdns_discovery",
        "clipboard_polling",
        "cloud_heartbeat",
        "file_sync_watch",
        "relay_target_polling",
        "autonomous_planner",
        "health_check_retry",
        "auto_update_supervisor",
        "bridge_readiness_wait"
    )
    $doctor = Invoke-JsonCommand -FilePath $MusuExe -Arguments @("doctor", "--json") -TimeoutSec $CommandTimeoutSec
    $background = $doctor.background
    $account = $doctor.account
    $bridge = $doctor.bridge
    $dashboard = $doctor.dashboard
    $rawBackgroundMissingFieldNames = if ($background) {
        @($expectedBackgroundFieldNames | Where-Object { -not $background.PSObject.Properties[$_] })
    }
    else {
        @($expectedBackgroundFieldNames)
    }
    $runtimeLoopCandidates = @()
    if ($background -and $background.PSObject.Properties["runtime_loop_candidates"] -and $null -ne $background.runtime_loop_candidates) {
        $runtimeLoopCandidates = @(
            $background.runtime_loop_candidates | ForEach-Object {
                [pscustomobject]@{
                    key = if ($_.PSObject.Properties["key"]) { [string]$_.key } else { "" }
                    label = if ($_.PSObject.Properties["label"]) { [string]$_.label } else { "" }
                    active = if ($_.PSObject.Properties["active"]) { [bool]$_.active } else { $false }
                    activation_mode = if ($_.PSObject.Properties["activation_mode"]) { [string]$_.activation_mode } else { "" }
                    note = if ($_.PSObject.Properties["note"]) { [string]$_.note } else { "" }
                }
            }
        )
    }
    $activeRuntimeLoopCandidateKeys = @(
        $runtimeLoopCandidates |
            Where-Object { $_.active } |
            ForEach-Object { [string]$_.key }
    )
    $activeRuntimeLoopCandidateCount = @($activeRuntimeLoopCandidateKeys).Count
    $runtimeLoopCandidateKeys = @(
        $runtimeLoopCandidates |
            ForEach-Object { [string]$_.key } |
            Where-Object { -not [string]::IsNullOrWhiteSpace($_) }
    )
    $missingRuntimeLoopCandidateKeys = @(
        $expectedRuntimeLoopCandidateKeys | Where-Object { $_ -notin $runtimeLoopCandidateKeys }
    )
    $backgroundFieldFallbackUsed = (@($rawBackgroundMissingFieldNames).Count -gt 0)
    $runtimeLoopCandidateFallbackUsed = (
        @($missingRuntimeLoopCandidateKeys).Count -gt 0 -or
        @($runtimeLoopCandidates).Count -ne @($expectedRuntimeLoopCandidateKeys).Count
    )
    $doctorSchemaComplete = (-not $backgroundFieldFallbackUsed -and -not $runtimeLoopCandidateFallbackUsed)

    return [pscustomobject]@{
        schema = "musu.runtime_cpu_background_snapshot.v1"
        command = "musu doctor --json"
        captured_at = (Get-Date).ToString("o")
        overall = if ($doctor.PSObject.Properties["overall"]) { [string]$doctor.overall } else { "" }
        distribution = if ($doctor.PSObject.Properties["distribution"]) { [string]$doctor.distribution } else { "" }
        doctor_schema_complete = $doctorSchemaComplete
        background_field_fallback_used = $backgroundFieldFallbackUsed
        runtime_loop_candidate_fallback_used = $runtimeLoopCandidateFallbackUsed
        expected_runtime_loop_candidate_keys = $expectedRuntimeLoopCandidateKeys
        missing_background_fields = $rawBackgroundMissingFieldNames
        missing_runtime_loop_candidate_keys = $missingRuntimeLoopCandidateKeys
        account_logged_in = if ($account -and $account.PSObject.Properties["logged_in"]) { [bool]$account.logged_in } else { $false }
        bridge_service_registry_pid = if ($bridge -and $bridge.PSObject.Properties["service_registry_pid"]) { $bridge.service_registry_pid } else { $null }
        bridge_health_http_status = if ($bridge -and $bridge.PSObject.Properties["health_http_status"]) { $bridge.health_http_status } else { $null }
        dashboard_reachable_url = if ($dashboard -and $dashboard.PSObject.Properties["reachable_url"] -and $null -ne $dashboard.reachable_url) { [string]$dashboard.reachable_url } else { "" }
        background = [pscustomobject]@{
            status = if ($background -and $background.PSObject.Properties["status"]) { [string]$background.status } else { "" }
            mdns_enabled = if ($background -and $background.mdns) { [bool]$background.mdns.enabled } else { $false }
            mdns_ipv6_enabled = if ($background -and $background.mdns_ipv6) { [bool]$background.mdns_ipv6.enabled } else { $false }
            mdns_tailscale_enabled = if ($background -and $background.mdns_tailscale) { [bool]$background.mdns_tailscale.enabled } else { $false }
            mdns_virtual_interfaces_enabled = if ($background -and $background.mdns_virtual_interfaces) { [bool]$background.mdns_virtual_interfaces.enabled } else { $false }
            clipboard_sync_enabled = if ($background -and $background.clipboard_sync) { [bool]$background.clipboard_sync.enabled } else { $false }
            cloud_registration_enabled = if ($background -and $background.cloud_registration) { [bool]$background.cloud_registration.enabled } else { $false }
            cloud_heartbeat_interval_sec = if ($background -and $background.PSObject.Properties["cloud_heartbeat_interval_sec"]) { [uint64]$background.cloud_heartbeat_interval_sec } else { 0 }
            cloud_heartbeat_floor_sec = if ($background -and $background.PSObject.Properties["cloud_heartbeat_floor_sec"]) { [uint64]$background.cloud_heartbeat_floor_sec } else { 0 }
            file_sync_enabled = if ($background -and $background.file_sync) { [bool]$background.file_sync.enabled } else { $false }
            file_serve_root_count = if ($background -and $background.PSObject.Properties["file_serve_root_count"]) { [int]$background.file_serve_root_count } else { 0 }
            file_serve_writable = if ($background -and $background.PSObject.Properties["file_serve_writable"]) { [bool]$background.file_serve_writable } else { $false }
            relay_payload_poller_enabled = if ($background -and $background.relay_payload_poller) { [bool]$background.relay_payload_poller.enabled } else { $false }
            relay_payload_poller_interval_sec = if ($background -and $background.PSObject.Properties["relay_payload_poller_interval_sec"]) { [uint64]$background.relay_payload_poller_interval_sec } else { 0 }
            relay_payload_poller_interval_floor_sec = if ($background -and $background.PSObject.Properties["relay_payload_poller_interval_floor_sec"]) { [uint64]$background.relay_payload_poller_interval_floor_sec } else { 0 }
            relay_payload_poller_empty_backoff_max_sec = if ($background -and $background.PSObject.Properties["relay_payload_poller_empty_backoff_max_sec"]) { [uint64]$background.relay_payload_poller_empty_backoff_max_sec } else { 0 }
            relay_payload_poller_empty_backoff_ceiling_sec = if ($background -and $background.PSObject.Properties["relay_payload_poller_empty_backoff_ceiling_sec"]) { [uint64]$background.relay_payload_poller_empty_backoff_ceiling_sec } else { 0 }
            relay_payload_poller_limit = if ($background -and $background.PSObject.Properties["relay_payload_poller_limit"]) { [uint32]$background.relay_payload_poller_limit } else { 0 }
            planner_enabled = if ($background -and $background.planner) { [bool]$background.planner.enabled } else { $false }
            planner_interval_sec = if ($background -and $background.PSObject.Properties["planner_interval_sec"]) { [uint64]$background.planner_interval_sec } else { 0 }
            planner_interval_floor_sec = if ($background -and $background.PSObject.Properties["planner_interval_floor_sec"]) { [uint64]$background.planner_interval_floor_sec } else { 0 }
            planner_command_timeout_sec = if ($background -and $background.PSObject.Properties["planner_command_timeout_sec"]) { [uint64]$background.planner_command_timeout_sec } else { 0 }
            planner_command_timeout_floor_sec = if ($background -and $background.PSObject.Properties["planner_command_timeout_floor_sec"]) { [uint64]$background.planner_command_timeout_floor_sec } else { 0 }
            planner_command_timeout_ceiling_sec = if ($background -and $background.PSObject.Properties["planner_command_timeout_ceiling_sec"]) { [uint64]$background.planner_command_timeout_ceiling_sec } else { 0 }
            auto_update_supervise_enabled = if ($background -and $background.PSObject.Properties["auto_update_supervise"] -and $background.auto_update_supervise) { [bool]$background.auto_update_supervise.enabled } else { $false }
            auto_update_check_interval_minutes = if ($background -and $background.PSObject.Properties["auto_update_check_interval_minutes"]) { [uint64]$background.auto_update_check_interval_minutes } else { 60 }
            auto_update_check_interval_floor_minutes = if ($background -and $background.PSObject.Properties["auto_update_check_interval_floor_minutes"]) { [uint64]$background.auto_update_check_interval_floor_minutes } else { 5 }
            auto_update_health_poll_initial_ms = if ($background -and $background.PSObject.Properties["auto_update_health_poll_initial_ms"]) { [uint64]$background.auto_update_health_poll_initial_ms } else { 250 }
            auto_update_health_poll_max_ms = if ($background -and $background.PSObject.Properties["auto_update_health_poll_max_ms"]) { [uint64]$background.auto_update_health_poll_max_ms } else { 2000 }
            bridge_health_poll_initial_ms = if ($background -and $background.PSObject.Properties["bridge_health_poll_initial_ms"]) { [uint64]$background.bridge_health_poll_initial_ms } else { 250 }
            bridge_health_poll_max_ms = if ($background -and $background.PSObject.Properties["bridge_health_poll_max_ms"]) { [uint64]$background.bridge_health_poll_max_ms } else { 2000 }
            runtime_loop_candidates = $runtimeLoopCandidates
            active_runtime_loop_candidate_count = $activeRuntimeLoopCandidateCount
            active_runtime_loop_candidate_keys = $activeRuntimeLoopCandidateKeys
        }
    }
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
        process_metadata_available = if ($evidence.PSObject.Properties["process_metadata_available"]) { [bool]$evidence.process_metadata_available } else { $false }
        process_metadata_timed_out = if ($evidence.PSObject.Properties["process_metadata_timed_out"]) { [bool]$evidence.process_metadata_timed_out } else { $true }
        helper_process_scope = if ($evidence.PSObject.Properties["helper_process_scope"]) { [string]$evidence.helper_process_scope } else { "" }
        process_counts_by_role = $evidence.process_counts_by_role
        process_counts_by_subrole = $evidence.process_counts_by_subrole
        max_one_core_percent_by_role = $evidence.max_one_core_percent_by_role
        max_one_core_percent_by_subrole = $evidence.max_one_core_percent_by_subrole
        bridge_registry = $evidence.bridge_registry
        cpu_attribution = $evidence.cpu_attribution
        total_working_set_mb_after = [double]$evidence.total_working_set_mb_after
        total_private_memory_mb_after = [double]$evidence.total_private_memory_mb_after
        memory_totals_by_subrole_mb = $evidence.memory_totals_by_subrole_mb
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
elseif ($RoutePrompt.Contains("{TOKEN}")) {
    $RoutePrompt = $RoutePrompt.Replace("{TOKEN}", $expectedRouteToken)
}
elseif (-not $AllowFailedRouteProbe -and -not $RoutePrompt.Contains($expectedRouteToken)) {
    throw "RoutePrompt must include expected token '$expectedRouteToken' or the literal {TOKEN} placeholder unless -AllowFailedRouteProbe is set."
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
                $routeExplainArgs = @("route")
                if (-not [string]::IsNullOrWhiteSpace($RouteTarget)) {
                    $routeExplainArgs += @("--target", $RouteTarget)
                }
                $routeExplainArgs += @("--explain", "--json", $RoutePrompt)
                $routeExplainCommand = "musu " + (ConvertTo-ProcessArgumentString -Items $routeExplainArgs)
                $routeExplainCapture = Invoke-CapturedCommand -FilePath $MusuExe -Arguments $routeExplainArgs -TimeoutSec $CommandTimeoutSec
                $routeExplainOutput = @($routeExplainCapture.stdout, $routeExplainCapture.stderr) | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }
                $routeExplainJson = ConvertFrom-JsonText -Text ([string]$routeExplainCapture.stdout)
                $routeSelectedCandidate = Get-JsonPropertyValue -Object $routeExplainJson -Name "selected_candidate"
                $routeSelectedCandidateAddr = if ($null -ne $routeSelectedCandidate) { [string](Get-JsonPropertyValue -Object $routeSelectedCandidate -Name "addr") } else { "" }
                $routeSelectedCandidateHostPort = Get-CandidateHostPort -CandidateAddr $routeSelectedCandidateAddr
                $routeNetworkProbe = [pscustomobject]@{
                    target = $routeSelectedCandidateHostPort.host
                    port = $routeSelectedCandidateHostPort.port
                    tcp_test_succeeded = $null
                    ping_succeeded = $null
                }
                if (-not [string]::IsNullOrWhiteSpace($routeSelectedCandidateHostPort.host)) {
                    if ($null -ne $routeSelectedCandidateHostPort.port) {
                        $routeNetworkProbe.tcp_test_succeeded = Test-TcpPort -HostName $routeSelectedCandidateHostPort.host -Port ([int]$routeSelectedCandidateHostPort.port) -TimeoutMs 3000
                    }
                    $routeNetworkProbe.ping_succeeded = Test-IcmpPing -HostName $routeSelectedCandidateHostPort.host -TimeoutMs 2000
                }

                $routeEvidencePath = Join-Path $OutputRoot ("{0}-{1}.post-route.route-evidence.json" -f $stamp, $machine)
                $routeArgs = @("route")
                if (-not [string]::IsNullOrWhiteSpace($RouteTarget)) {
                    $routeArgs += @("--target", $RouteTarget)
                }
                $routeArgs += @("--route-evidence-path", $routeEvidencePath, "--wait-timeout-sec", ([string]$RouteWaitTimeoutSec), "--wait", $RoutePrompt)
                $routeCommand = "musu " + (ConvertTo-ProcessArgumentString -Items $routeArgs)
                $routeProbeCommandTimeoutSec = [Math]::Max($CommandTimeoutSec, $RouteWaitTimeoutSec + 30)
                $routeAttempts = New-Object System.Collections.Generic.List[object]
                $routeResult = $null
                $routeOutput = ""
                for ($attempt = 1; $attempt -le $RouteProbeMaxAttempts; $attempt++) {
                    $attemptStartedAt = (Get-Date).ToString("o")
                    $candidateResult = Invoke-CapturedCommand -FilePath $MusuExe -Arguments $routeArgs -TimeoutSec $routeProbeCommandTimeoutSec
                    $routeOutputParts = @($candidateResult.stdout, $candidateResult.stderr) | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }
                    $candidateOutput = ($routeOutputParts -join "`n").Trim()
                    $candidateOk = ($candidateResult.exit_code -eq 0 -and $candidateOutput -like "*$expectedRouteToken*")
                    $effectiveRouteExitCode = [int]$candidateResult.exit_code
                    if (-not $candidateOk -and $effectiveRouteExitCode -eq 0) {
                        $effectiveRouteExitCode = 1
                    }
                    $retryAfterSec = if ($candidateOk) { $null } else { Get-RouteProbeRetryAfterSec -Text $candidateOutput }
                    $routeAttempts.Add([pscustomobject]@{
                        attempt = $attempt
                        started_at = $attemptStartedAt
                        exit_code = $effectiveRouteExitCode
                        raw_exit_code = [int]$candidateResult.exit_code
                        stdout = [string]$candidateResult.stdout
                        stderr = [string]$candidateResult.stderr
                        output = $candidateOutput
                        ok = [bool]$candidateOk
                        retry_after_s = $retryAfterSec
                        timeout_sec = $routeProbeCommandTimeoutSec
                    }) | Out-Null
                    $routeResult = [pscustomobject]@{
                        exit_code = $effectiveRouteExitCode
                        raw_exit_code = [int]$candidateResult.exit_code
                        stdout = [string]$candidateResult.stdout
                        stderr = [string]$candidateResult.stderr
                    }
                    $routeOutput = $candidateOutput
                    if ($candidateOk -or $attempt -ge $RouteProbeMaxAttempts -or $null -eq $retryAfterSec) {
                        break
                    }
                    Start-Sleep -Seconds ([Math]::Max($RouteProbeRetryDelaySec, [int]$retryAfterSec))
                }
                $routeAttemptEvidence = $null
                if (Test-Path -LiteralPath $routeEvidencePath) {
                    $routeAttemptEvidence = ConvertFrom-JsonText -Text (Get-Content -LiteralPath $routeEvidencePath -Raw)
                }
                $routeProbe = [pscustomobject]@{
                    prompt = $RoutePrompt
                    expected_token = $expectedRouteToken
                    target = if ([string]::IsNullOrWhiteSpace($RouteTarget)) { $null } else { $RouteTarget }
                    route_explain_command = $routeExplainCommand
                    route_explain_exit_code = [int]$routeExplainCapture.exit_code
                    route_explain_stdout = [string]$routeExplainCapture.stdout
                    route_explain_stderr = [string]$routeExplainCapture.stderr
                    route_explain_output = (($routeExplainOutput -join "`n").Trim())
                    route_explain = $routeExplainJson
                    command = $routeCommand
                    arguments = @($routeArgs)
                    network_probe = $routeNetworkProbe
                    route_evidence_path = $routeEvidencePath
                    route_attempt_evidence = $routeAttemptEvidence
                    wait_timeout_sec = $RouteWaitTimeoutSec
                    command_timeout_sec = $routeProbeCommandTimeoutSec
                    max_attempts = $RouteProbeMaxAttempts
                    attempt_count = $routeAttempts.Count
                    attempts = $routeAttempts.ToArray()
                    exit_code = [int]$routeResult.exit_code
                    raw_exit_code = [int]$routeResult.raw_exit_code
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
$doctorBackgroundSnapshot = Get-DoctorBackgroundSnapshot
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
    musu_exe = $MusuExe
    allow_developer_runtime = [bool]$AllowDeveloperRuntime
    musu_exe_release_identity = [bool](Test-PackagedMusuCommandPath $MusuExe)
    sample_seconds = $SampleSeconds
    max_one_core_percent = $MaxOneCorePercent
    max_owned_process_count = $MaxOwnedProcessCount
    max_owned_webview2_process_count = $MaxOwnedWebView2ProcessCount
    max_total_working_set_mb = $MaxTotalWorkingSetMb
    requested_scenarios = @($Scenario)
    output_root = $outputRootFullPath
    output_root_within_repo = [bool]$outputRootWithinRepo
    output_root_git_ignored = [bool]$outputRootGitIgnored
    doctor_background_snapshot = $doctorBackgroundSnapshot
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
