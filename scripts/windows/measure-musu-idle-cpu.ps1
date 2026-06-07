[CmdletBinding()]
param(
    [int]$SampleSeconds = 15,
    [double]$MaxOneCorePercent = 5.0,
    [string[]]$ProcessName = @("musu", "MUSU", "musud", "musu-desktop"),
    [switch]$IncludeNode,
    [switch]$IncludeWebView2,
    [switch]$IncludeUnrelatedHelpers,
    [ValidateSet("bridge-only", "runtime-started", "dashboard-open", "startup-open", "desktop-open", "post-route", "diagnostic")]
    [string]$Scenario = "bridge-only",
    [switch]$RequireOwnedWebView2,
    [int]$MaxOwnedProcessCount = 16,
    [int]$MaxOwnedWebView2ProcessCount = 8,
    [double]$MaxTotalWorkingSetMb = 1024.0,
    [string]$OutputPath,
    [switch]$FailOnHot,
    [switch]$Json
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = (Resolve-Path (Join-Path $scriptDir "..\..")).Path
$version = (Get-Content -LiteralPath (Join-Path $repoRoot "VERSION") -Raw).Trim()

if ($SampleSeconds -lt 3) {
    throw "SampleSeconds must be at least 3."
}

if ([string]::IsNullOrWhiteSpace($OutputPath)) {
    $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
    $OutputPath = Join-Path $repoRoot ".local-build\runtime-idle-cpu\musu-idle-cpu-$stamp.json"
}

$names = New-Object 'System.Collections.Generic.HashSet[string]' ([System.StringComparer]::OrdinalIgnoreCase)
$musuNames = New-Object 'System.Collections.Generic.HashSet[string]' ([System.StringComparer]::OrdinalIgnoreCase)
foreach ($name in $ProcessName) {
    if (-not [string]::IsNullOrWhiteSpace($name)) {
        [void]$names.Add($name)
        [void]$musuNames.Add($name)
    }
}
if ($IncludeNode) {
    [void]$names.Add("node")
}
if ($IncludeWebView2) {
    [void]$names.Add("msedgewebview2")
}

$CpuRoleNames = @("musu", "node", "webview2", "other")
$CpuSubroleNames = @("musu_runtime", "bridge_runtime", "desktop_shell", "node_helper", "webview2_helper", "other")

$script:processMetadataTimedOut = $false
$script:processMetadataAvailable = $false
$script:nativeParentLookupAvailable = $false

function Get-DoctorCliPath {
    $windowsAppsAlias = if ($env:LOCALAPPDATA) {
        Join-Path $env:LOCALAPPDATA "Microsoft\WindowsApps\musu.exe"
    }
    else {
        $null
    }
    if (-not [string]::IsNullOrWhiteSpace($windowsAppsAlias) -and (Test-Path -LiteralPath $windowsAppsAlias)) {
        return $windowsAppsAlias
    }

    $command = Get-Command musu.exe -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($command -and -not [string]::IsNullOrWhiteSpace([string]$command.Source)) {
        return [string]$command.Source
    }

    return $null
}

function Get-DoctorBackgroundSnapshot {
    $expectedBackgroundFieldNames = @(
        "status",
        "mdns",
        "mdns_ipv6",
        "mdns_tailscale",
        "mdns_virtual_interfaces",
        "clipboard_sync",
        "cloud_registration",
        "cloud_heartbeat_interval_sec",
        "cloud_heartbeat_floor_sec",
        "file_sync",
        "file_serve_root_count",
        "file_serve_writable",
        "relay_payload_poller",
        "relay_payload_poller_interval_sec",
        "relay_payload_poller_interval_floor_sec",
        "relay_payload_poller_empty_backoff_max_sec",
        "relay_payload_poller_empty_backoff_ceiling_sec",
        "relay_payload_poller_limit",
        "planner",
        "planner_interval_sec",
        "planner_interval_floor_sec",
        "planner_command_timeout_sec",
        "planner_command_timeout_floor_sec",
        "planner_command_timeout_ceiling_sec",
        "auto_update_supervise",
        "auto_update_check_interval_minutes",
        "auto_update_check_interval_floor_minutes",
        "auto_update_health_poll_initial_ms",
        "auto_update_health_poll_max_ms",
        "bridge_health_poll_initial_ms",
        "bridge_health_poll_max_ms",
        "runtime_loop_candidates",
        "active_runtime_loop_candidate_count",
        "active_runtime_loop_candidate_keys",
        "note"
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
    $doctorCliPath = Get-DoctorCliPath
    if ([string]::IsNullOrWhiteSpace($doctorCliPath)) {
        return [pscustomobject]@{
            schema = "musu.runtime_cpu_background_snapshot.v1"
            command = ""
            captured_at = (Get-Date).ToString("o")
            error = "musu doctor CLI not found"
        }
    }

    try {
        $raw = & $doctorCliPath doctor --json 2>$null
        if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace([string]$raw)) {
            throw "musu doctor --json failed"
        }
        $doctor = $raw | ConvertFrom-Json
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
            command_path = $doctorCliPath
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
    catch {
        return [pscustomobject]@{
            schema = "musu.runtime_cpu_background_snapshot.v1"
            command = "musu doctor --json"
            command_path = $doctorCliPath
            captured_at = (Get-Date).ToString("o")
            error = $_.Exception.Message
        }
    }
}

function ConvertTo-ExeName([string]$Name) {
    if ($Name.EndsWith(".exe", [System.StringComparison]::OrdinalIgnoreCase)) {
        return $Name
    }
    return "$Name.exe"
}

function Get-Sha256Hex([string]$Text) {
    if ([string]::IsNullOrEmpty($Text)) {
        return $null
    }
    $sha = [System.Security.Cryptography.SHA256]::Create()
    try {
        $bytes = [System.Text.Encoding]::UTF8.GetBytes($Text)
        $hash = $sha.ComputeHash($bytes)
        return (($hash | ForEach-Object { $_.ToString("x2") }) -join "")
    }
    finally {
        $sha.Dispose()
    }
}

function ConvertTo-CommandLineHint([string]$CommandLine) {
    if ([string]::IsNullOrWhiteSpace($CommandLine)) {
        return $null
    }

    $value = $CommandLine
    $value = $value -replace "(?i)(MUSU_[A-Z0-9_]*(TOKEN|SECRET|KEY|PASSWORD)=)[^\s]+", '$1<redacted>'
    $value = $value -replace "(?i)(--?(token|secret|key|password)\s+)[^\s]+", '$1<redacted>'
    $value = $value -replace "(?i)((token|secret|key|password)=)[^&\s]+", '$1<redacted>'
    if ($value.Length -gt 260) {
        return $value.Substring(0, 260) + "..."
    }
    return $value
}

function Initialize-NativeParentLookup {
    if ($script:nativeParentLookupAvailable) {
        return
    }
    if ($env:OS -ne "Windows_NT") {
        return
    }
    if ("MusuProcessParent" -as [type]) {
        $script:nativeParentLookupAvailable = $true
        return
    }

    try {
        Add-Type -TypeDefinition @"
using System;
using System.Diagnostics;
using System.Runtime.InteropServices;

public static class MusuProcessParent
{
    [StructLayout(LayoutKind.Sequential)]
    private struct PROCESS_BASIC_INFORMATION
    {
        public IntPtr Reserved1;
        public IntPtr PebBaseAddress;
        public IntPtr Reserved2_0;
        public IntPtr Reserved2_1;
        public IntPtr UniqueProcessId;
        public IntPtr InheritedFromUniqueProcessId;
    }

    [DllImport("ntdll.dll")]
    private static extern int NtQueryInformationProcess(
        IntPtr processHandle,
        int processInformationClass,
        ref PROCESS_BASIC_INFORMATION processInformation,
        int processInformationLength,
        out int returnLength);

    public static int GetParentProcessId(int processId)
    {
        using (var process = Process.GetProcessById(processId))
        {
            var info = new PROCESS_BASIC_INFORMATION();
            int returnLength;
            int status = NtQueryInformationProcess(
                process.Handle,
                0,
                ref info,
                Marshal.SizeOf(typeof(PROCESS_BASIC_INFORMATION)),
                out returnLength);
            if (status != 0)
            {
                throw new InvalidOperationException("NtQueryInformationProcess failed: " + status);
            }
            return info.InheritedFromUniqueProcessId.ToInt32();
        }
    }
}
"@ -ErrorAction Stop
        $script:nativeParentLookupAvailable = $true
    }
    catch {
        $script:nativeParentLookupAvailable = $false
    }
}

function Get-ParentProcessIdSafe([int]$ProcessId) {
    Initialize-NativeParentLookup
    if (-not $script:nativeParentLookupAvailable) {
        return $null
    }

    try {
        return [MusuProcessParent]::GetParentProcessId($ProcessId)
    }
    catch {
        return $null
    }
}

function Get-ProcessMetadataMap($Names) {
    $map = @{}
    foreach ($process in Get-Process -ErrorAction SilentlyContinue) {
        if (-not $Names.Contains($process.ProcessName)) {
            continue
        }

        $parentProcessId = Get-ParentProcessIdSafe ([int]$process.Id)
        if ($null -ne $parentProcessId) {
            $script:processMetadataAvailable = $true
        }
        $map[[int]$process.Id] = [pscustomobject]@{
            parent_process_id = $parentProcessId
            executable_path = Get-ProcessPathSafe $process
            command_line = $null
        }
    }

    try {
        $exeNames = New-Object 'System.Collections.Generic.HashSet[string]' ([System.StringComparer]::OrdinalIgnoreCase)
        foreach ($name in $Names) {
            [void]$exeNames.Add((ConvertTo-ExeName ([string]$name)))
        }

        $cimProcesses = Get-CimInstance Win32_Process -ErrorAction Stop |
            Where-Object { $exeNames.Contains([string]$_.Name) }
        foreach ($process in $cimProcesses) {
            $processId = [int]$process.ProcessId
            if (-not $map.ContainsKey($processId)) {
                continue
            }

            if ($null -eq $map[$processId].parent_process_id -and $null -ne $process.ParentProcessId) {
                $map[$processId].parent_process_id = [int]$process.ParentProcessId
            }
            if ([string]::IsNullOrWhiteSpace([string]$map[$processId].executable_path) -and
                -not [string]::IsNullOrWhiteSpace([string]$process.ExecutablePath)) {
                $map[$processId].executable_path = [string]$process.ExecutablePath
            }
            if (-not [string]::IsNullOrWhiteSpace([string]$process.CommandLine)) {
                $map[$processId].command_line = [string]$process.CommandLine
            }
            $script:processMetadataAvailable = $true
        }
    }
    catch {
        $script:processMetadataTimedOut = $true
    }

    return $map
}

function Test-RepoRelatedProcess($Meta, [string]$RepoRoot, [string]$ProcessPath) {
    $needle = $RepoRoot.ToLowerInvariant()
    $values = @($ProcessPath)
    if ($null -ne $Meta) {
        $values += @($Meta.executable_path, $Meta.command_line)
    }
    foreach ($value in $values) {
        if ([string]::IsNullOrWhiteSpace($value)) {
            continue
        }
        $lower = ([string]$value).ToLowerInvariant()
        if ($lower.Contains($needle) -or $lower.Contains("musu-bee") -or $lower.Contains("musu-rs")) {
            return $true
        }
    }
    return $false
}

function Test-DescendantProcess([int]$ProcessId, $RootProcessIds, $MetadataMap) {
    $seen = New-Object 'System.Collections.Generic.HashSet[int]'
    $current = $ProcessId

    while ($MetadataMap.ContainsKey($current)) {
        if (-not $seen.Add($current)) {
            return $false
        }

        $parent = $MetadataMap[$current].parent_process_id
        if ($null -eq $parent -or $parent -le 0) {
            return $false
        }
        if ($RootProcessIds.Contains([int]$parent)) {
            return $true
        }
        $current = [int]$parent
    }

    return $false
}

function Get-ProcessPathSafe($Process) {
    try {
        return [string]$Process.Path
    }
    catch {
        return $null
    }
}

function Get-ProcessStartTimeSafe($Process) {
    try {
        return $Process.StartTime.ToString("o")
    }
    catch {
        return $null
    }
}

function Get-MusuHomePath {
    if ($env:MUSU_HOME) {
        return [System.IO.Path]::GetFullPath($env:MUSU_HOME)
    }
    if ($env:USERPROFILE) {
        return (Join-Path $env:USERPROFILE ".musu")
    }
    if ($env:HOME) {
        return (Join-Path $env:HOME ".musu")
    }
    return (Join-Path $repoRoot ".musu")
}

function Get-BridgeRegistrySnapshot {
    $musuHome = Get-MusuHomePath
    $path = Join-Path $musuHome "services\bridge.json"
    $bridgeProcessId = $null
    $addr = $null
    $transport = $null
    $startedAt = $null
    $parseError = $null
    $exists = Test-Path -LiteralPath $path

    if ($exists) {
        try {
            $registry = Get-Content -LiteralPath $path -Raw | ConvertFrom-Json
            if ($registry.PSObject.Properties["pid"] -and $null -ne $registry.pid) {
                $bridgeProcessId = [int]$registry.pid
            }
            if ($registry.PSObject.Properties["addr"]) {
                $addr = [string]$registry.addr
            }
            if ($registry.PSObject.Properties["transport"]) {
                $transport = [string]$registry.transport
            }
            if ($registry.PSObject.Properties["started_at"]) {
                $startedAt = $registry.started_at
            }
        }
        catch {
            $parseError = $_.Exception.Message
        }
    }

    [pscustomobject]@{
        path = $path
        exists = [bool]$exists
        parse_error = $parseError
        pid = $bridgeProcessId
        addr = $addr
        transport = $transport
        started_at = $startedAt
        captured_at = (Get-Date).ToString("o")
    }
}

function New-ProcessBucketMap {
    param([Parameter(Mandatory = $true)][string[]]$BucketNames)

    $map = [ordered]@{}
    foreach ($bucket in $BucketNames) {
        $map[$bucket] = 0
    }
    return $map
}

function New-MemoryBucketMap {
    param([Parameter(Mandatory = $true)][string[]]$BucketNames)

    $map = [ordered]@{}
    foreach ($bucket in $BucketNames) {
        $map[$bucket] = [ordered]@{ working_set_mb = 0.0; private_memory_mb = 0.0 }
    }
    return $map
}

function Get-CoarseProcessRole {
    param([Parameter(Mandatory = $true)][string]$ProcessName)

    if ($musuNames.Contains($ProcessName)) {
        return "musu"
    }
    if ($ProcessName -ieq "msedgewebview2") {
        return "webview2"
    }
    if ($ProcessName -ieq "node") {
        return "node"
    }
    return "other"
}

function Get-ProcessSubrole {
    param(
        [Parameter(Mandatory = $true)][int]$ProcessId,
        [Parameter(Mandatory = $true)][string]$ProcessName,
        $BridgePid
    )

    if ($ProcessName -ieq "musu-desktop") {
        return "desktop_shell"
    }
    if ($null -ne $BridgePid -and $musuNames.Contains($ProcessName) -and $ProcessId -eq [int]$BridgePid) {
        return "bridge_runtime"
    }
    if ($musuNames.Contains($ProcessName)) {
        return "musu_runtime"
    }
    if ($ProcessName -ieq "node") {
        return "node_helper"
    }
    if ($ProcessName -ieq "msedgewebview2") {
        return "webview2_helper"
    }
    return "other"
}

function Get-RawProcessSnapshot($Names) {
    $items = @()
    foreach ($process in Get-Process -ErrorAction SilentlyContinue) {
        if (-not $Names.Contains($process.ProcessName)) {
            continue
        }

        $items += [pscustomobject]@{
            id = [int]$process.Id
            process_name = [string]$process.ProcessName
            cpu_seconds = if ($null -ne $process.CPU) { [double]$process.CPU } else { $null }
            working_set_mb = [Math]::Round(([double]$process.WorkingSet64 / 1MB), 2)
            private_memory_mb = [Math]::Round(([double]$process.PrivateMemorySize64 / 1MB), 2)
            start_time = Get-ProcessStartTimeSafe $process
            path = Get-ProcessPathSafe $process
        }
    }
    return [pscustomobject]@{
        captured_at = Get-Date
        items = $items
    }
}

function Add-ProcessOwnership {
    param(
        [object[]]$Items,
        $MetadataMap,
        $RootProcessIds
    )

    $owned = @()
    foreach ($item in $Items) {
        $meta = if ($MetadataMap.ContainsKey([int]$item.id)) { $MetadataMap[[int]$item.id] } else { $null }
        $isMusu = $musuNames.Contains($item.process_name)
        $isNode = ($item.process_name -ieq "node")
        $isWebView2 = ($item.process_name -ieq "msedgewebview2")
        $isDescendant = Test-DescendantProcess -ProcessId ([int]$item.id) -RootProcessIds $RootProcessIds -MetadataMap $MetadataMap
        $isRepoRelated = Test-RepoRelatedProcess -Meta $meta -RepoRoot $repoRoot -ProcessPath $item.path
        $include = $isMusu
        $classificationReason = if ($isMusu) { "musu_process_name" } else { $null }

        if (-not $include -and $IncludeNode -and $isNode) {
            if ($IncludeUnrelatedHelpers) {
                $include = $true
                $classificationReason = "all_node_processes"
            }
            elseif ($isDescendant) {
                $include = $true
                $classificationReason = "musu_descendant"
            }
            elseif ($isRepoRelated) {
                $include = $true
                $classificationReason = "repo_related_node"
            }
        }

        if (-not $include -and $IncludeWebView2 -and $isWebView2) {
            if ($IncludeUnrelatedHelpers) {
                $include = $true
                $classificationReason = "all_webview2_processes"
            }
            elseif ($isDescendant) {
                $include = $true
                $classificationReason = "musu_descendant"
            }
        }

        if (-not $include) {
            continue
        }

        $owned += [pscustomobject]@{
            id = $item.id
            process_name = $item.process_name
            cpu_seconds = $item.cpu_seconds
            working_set_mb = $item.working_set_mb
            private_memory_mb = $item.private_memory_mb
            start_time = $item.start_time
            path = $item.path
            parent_process_id = if ($meta) { $meta.parent_process_id } else { $null }
            is_descendant_of_musu = [bool]$isDescendant
            is_repo_related = [bool]$isRepoRelated
            classification_reason = $classificationReason
            command_line_present = [bool]($meta -and -not [string]::IsNullOrWhiteSpace($meta.command_line))
            command_line_sha256 = if ($meta) { Get-Sha256Hex $meta.command_line } else { $null }
            command_line_hint = if ($meta) { ConvertTo-CommandLineHint $meta.command_line } else { $null }
        }
    }
    return $owned
}

function Get-RawMatchingProcessSummary {
    param(
        [object[]]$BeforeItems,
        [object[]]$AfterItems,
        $MetadataMap,
        $RootProcessIds,
        [int]$BridgePid,
        [double]$ElapsedSeconds,
        [int]$TopProcessCount
    )

    $beforeById = @{}
    foreach ($item in $BeforeItems) {
        $beforeById[[int]$item.id] = $item
    }

    $countsByBucket = [ordered]@{
        musu = [ordered]@{
            machine_wide = 0
        }
        node = [ordered]@{
            machine_wide = 0
            owned_by_musu_process_tree = 0
            repo_related_unowned = 0
            unowned_other = 0
        }
        webview2 = [ordered]@{
            machine_wide = 0
            owned_by_musu_process_tree = 0
            unowned_other = 0
        }
        other = [ordered]@{
            machine_wide = 0
        }
    }

    $samples = @()
    foreach ($current in $AfterItems) {
        $processName = [string]$current.process_name
        $role = Get-CoarseProcessRole -ProcessName $processName
        $meta = if ($MetadataMap.ContainsKey([int]$current.id)) { $MetadataMap[[int]$current.id] } else { $null }
        $isDescendant = Test-DescendantProcess -ProcessId ([int]$current.id) -RootProcessIds $RootProcessIds -MetadataMap $MetadataMap
        $isRepoRelated = Test-RepoRelatedProcess -Meta $meta -RepoRoot $repoRoot -ProcessPath $current.path
        $ownershipBucket = "machine_wide"

        $countsByBucket[$role].machine_wide = [int]$countsByBucket[$role].machine_wide + 1
        switch ($role) {
            "musu" {
                $ownershipBucket = "owned_by_musu_process_tree"
            }
            "node" {
                if ($isDescendant) {
                    $countsByBucket.node.owned_by_musu_process_tree = [int]$countsByBucket.node.owned_by_musu_process_tree + 1
                    $ownershipBucket = "owned_by_musu_process_tree"
                }
                elseif ($isRepoRelated) {
                    $countsByBucket.node.repo_related_unowned = [int]$countsByBucket.node.repo_related_unowned + 1
                    $ownershipBucket = "repo_related_unowned"
                }
                else {
                    $countsByBucket.node.unowned_other = [int]$countsByBucket.node.unowned_other + 1
                    $ownershipBucket = "unowned_other"
                }
            }
            "webview2" {
                if ($isDescendant) {
                    $countsByBucket.webview2.owned_by_musu_process_tree = [int]$countsByBucket.webview2.owned_by_musu_process_tree + 1
                    $ownershipBucket = "owned_by_musu_process_tree"
                }
                else {
                    $countsByBucket.webview2.unowned_other = [int]$countsByBucket.webview2.unowned_other + 1
                    $ownershipBucket = "unowned_other"
                }
            }
        }

        $previous = if ($beforeById.ContainsKey([int]$current.id)) { $beforeById[[int]$current.id] } else { $null }
        if ($null -eq $previous -or $null -eq $previous.cpu_seconds -or $null -eq $current.cpu_seconds) {
            continue
        }

        $delta = [double]$current.cpu_seconds - [double]$previous.cpu_seconds
        if ($delta -lt 0) {
            continue
        }

        $oneCorePercent = ($delta / $ElapsedSeconds) * 100.0
        $samples += [pscustomobject]@{
            id = [int]$current.id
            process_name = $processName
            process_role = $role
            process_subrole = Get-ProcessSubrole -ProcessId ([int]$current.id) -ProcessName $processName -BridgePid $BridgePid
            bridge_registry_pid_match = ($null -ne $BridgePid -and [int]$current.id -eq [int]$BridgePid)
            ownership_bucket = $ownershipBucket
            is_descendant_of_musu = [bool]$isDescendant
            is_repo_related = [bool]$isRepoRelated
            cpu_seconds_delta = [Math]::Round($delta, 3)
            cpu_pct_one_core = [Math]::Round($oneCorePercent, 2)
            working_set_mb = $current.working_set_mb
            private_memory_mb = $current.private_memory_mb
            parent_process_id = if ($meta) { $meta.parent_process_id } else { $null }
            path = $current.path
            command_line_hint = if ($meta) { ConvertTo-CommandLineHint $meta.command_line } else { $null }
        }
    }

    [pscustomobject]@{
        counts_by_bucket = $countsByBucket
        musu = $countsByBucket.musu
        node = $countsByBucket.node
        webview2 = $countsByBucket.webview2
        other = $countsByBucket.other
        top_processes = @(
            $samples |
                Sort-Object cpu_pct_one_core -Descending |
                Select-Object -First $TopProcessCount
        )
    }
}

$beforeRaw = Get-RawProcessSnapshot $names
Start-Sleep -Seconds $SampleSeconds
$afterRaw = Get-RawProcessSnapshot $names
$startedAt = $beforeRaw.captured_at
$completedAt = $afterRaw.captured_at
$elapsedSeconds = [Math]::Max(0.001, ($completedAt - $startedAt).TotalSeconds)
$cores = [Environment]::ProcessorCount
$gitCommit = (& git -C $repoRoot rev-parse HEAD 2>$null | Out-String).Trim()
$gitStatus = (& git -C $repoRoot status --short 2>$null | Out-String).Trim()

$metadataMap = Get-ProcessMetadataMap $names
$bridgeRegistry = Get-BridgeRegistrySnapshot
$bridgePid = $bridgeRegistry.pid
$rootProcessIds = New-Object 'System.Collections.Generic.HashSet[int]'
foreach ($process in @($beforeRaw.items + $afterRaw.items)) {
    if ($musuNames.Contains($process.process_name)) {
        [void]$rootProcessIds.Add([int]$process.id)
    }
}

$before = @(Add-ProcessOwnership -Items $beforeRaw.items -MetadataMap $metadataMap -RootProcessIds $rootProcessIds)
$after = @(Add-ProcessOwnership -Items $afterRaw.items -MetadataMap $metadataMap -RootProcessIds $rootProcessIds)
$rawMatchingSummary = Get-RawMatchingProcessSummary `
    -BeforeItems $beforeRaw.items `
    -AfterItems $afterRaw.items `
    -MetadataMap $metadataMap `
    -RootProcessIds $rootProcessIds `
    -BridgePid $bridgePid `
    -ElapsedSeconds $elapsedSeconds `
    -TopProcessCount 12

$samples = @()
foreach ($current in $after) {
    $previous = $before | Where-Object { $_.id -eq $current.id } | Select-Object -First 1
    if ($null -eq $previous -or $null -eq $previous.cpu_seconds -or $null -eq $current.cpu_seconds) {
        continue
    }

    $delta = [double]$current.cpu_seconds - [double]$previous.cpu_seconds
    if ($delta -lt 0) {
        continue
    }

    $oneCorePercent = ($delta / $elapsedSeconds) * 100.0
    $processRole = Get-CoarseProcessRole -ProcessName ([string]$current.process_name)
    $processSubrole = Get-ProcessSubrole -ProcessId ([int]$current.id) -ProcessName ([string]$current.process_name) -BridgePid $bridgePid
    $samples += [pscustomobject]@{
        id = $current.id
        process_name = $current.process_name
        process_role = $processRole
        process_subrole = $processSubrole
        bridge_registry_pid_match = ($null -ne $bridgePid -and [int]$current.id -eq [int]$bridgePid)
        cpu_seconds_delta = [Math]::Round($delta, 3)
        cpu_pct_one_core = [Math]::Round($oneCorePercent, 2)
        cpu_pct_total = [Math]::Round($oneCorePercent / $cores, 2)
        working_set_mb = $current.working_set_mb
        private_memory_mb = $current.private_memory_mb
        start_time = $current.start_time
        path = $current.path
        parent_process_id = $current.parent_process_id
        is_descendant_of_musu = $current.is_descendant_of_musu
        is_repo_related = $current.is_repo_related
        classification_reason = $current.classification_reason
        command_line_present = $current.command_line_present
        command_line_sha256 = $current.command_line_sha256
        command_line_hint = $current.command_line_hint
    }
}

$hot = @($samples | Where-Object { $_.cpu_pct_one_core -gt $MaxOneCorePercent })
$musuProcessCountAfter = @($after | Where-Object { $musuNames.Contains($_.process_name) }).Count
$targetProcessRunning = ($after.Count -gt 0)
$processCountsByRole = New-ProcessBucketMap -BucketNames $CpuRoleNames
$processCountsBySubrole = New-ProcessBucketMap -BucketNames $CpuSubroleNames
foreach ($current in $after) {
    $role = Get-CoarseProcessRole -ProcessName ([string]$current.process_name)
    $subrole = Get-ProcessSubrole -ProcessId ([int]$current.id) -ProcessName ([string]$current.process_name) -BridgePid $bridgePid
    $processCountsByRole[$role] = [int]$processCountsByRole[$role] + 1
    $processCountsBySubrole[$subrole] = [int]$processCountsBySubrole[$subrole] + 1
}
$memoryTotalsByRoleMb = New-MemoryBucketMap -BucketNames $CpuRoleNames
$memoryTotalsBySubroleMb = New-MemoryBucketMap -BucketNames $CpuSubroleNames
foreach ($current in $after) {
    $role = Get-CoarseProcessRole -ProcessName ([string]$current.process_name)
    $subrole = Get-ProcessSubrole -ProcessId ([int]$current.id) -ProcessName ([string]$current.process_name) -BridgePid $bridgePid
    $memoryTotalsByRoleMb[$role].working_set_mb = [Math]::Round(([double]$memoryTotalsByRoleMb[$role].working_set_mb + [double]$current.working_set_mb), 2)
    $memoryTotalsByRoleMb[$role].private_memory_mb = [Math]::Round(([double]$memoryTotalsByRoleMb[$role].private_memory_mb + [double]$current.private_memory_mb), 2)
    $memoryTotalsBySubroleMb[$subrole].working_set_mb = [Math]::Round(([double]$memoryTotalsBySubroleMb[$subrole].working_set_mb + [double]$current.working_set_mb), 2)
    $memoryTotalsBySubroleMb[$subrole].private_memory_mb = [Math]::Round(([double]$memoryTotalsBySubroleMb[$subrole].private_memory_mb + [double]$current.private_memory_mb), 2)
}
$totalWorkingSetMbAfter = 0.0
$totalPrivateMemoryMbAfter = 0.0
foreach ($current in $after) {
    $totalWorkingSetMbAfter += [double]$current.working_set_mb
    $totalPrivateMemoryMbAfter += [double]$current.private_memory_mb
}
$totalWorkingSetMbAfter = [Math]::Round($totalWorkingSetMbAfter, 2)
$totalPrivateMemoryMbAfter = [Math]::Round($totalPrivateMemoryMbAfter, 2)
$resourceBudgetViolations = @()
if ($after.Count -gt $MaxOwnedProcessCount) {
    $resourceBudgetViolations += "owned_process_count $($after.Count) > $MaxOwnedProcessCount"
}
if ($processCountsByRole.webview2 -gt $MaxOwnedWebView2ProcessCount) {
    $resourceBudgetViolations += "owned_webview2_process_count $($processCountsByRole.webview2) > $MaxOwnedWebView2ProcessCount"
}
if ($RequireOwnedWebView2 -and $processCountsByRole.webview2 -lt 1) {
    $resourceBudgetViolations += "owned_webview2_process_count $($processCountsByRole.webview2) < 1 while RequireOwnedWebView2 is set"
}
if ($totalWorkingSetMbAfter -gt $MaxTotalWorkingSetMb) {
    $resourceBudgetViolations += "total_working_set_mb $totalWorkingSetMbAfter > $MaxTotalWorkingSetMb"
}
$maxOneCorePercentByRole = [ordered]@{
    musu = 0.0
    node = 0.0
    webview2 = 0.0
    other = 0.0
}
$maxOneCorePercentBySubrole = [ordered]@{
    musu_runtime = 0.0
    bridge_runtime = 0.0
    desktop_shell = 0.0
    node_helper = 0.0
    webview2_helper = 0.0
    other = 0.0
}
foreach ($sample in $samples) {
    $role = [string]$sample.process_role
    $subrole = [string]$sample.process_subrole
    $value = [double]$sample.cpu_pct_one_core
    if ($maxOneCorePercentByRole.Contains($role) -and $value -gt [double]$maxOneCorePercentByRole[$role]) {
        $maxOneCorePercentByRole[$role] = $value
    }
    if ($maxOneCorePercentBySubrole.Contains($subrole) -and $value -gt [double]$maxOneCorePercentBySubrole[$subrole]) {
        $maxOneCorePercentBySubrole[$subrole] = $value
    }
}
$sampleCountByRole = New-ProcessBucketMap -BucketNames $CpuRoleNames
$sampleCountBySubrole = New-ProcessBucketMap -BucketNames $CpuSubroleNames
$totalCpuSecondsByRole = [ordered]@{ musu = 0.0; node = 0.0; webview2 = 0.0; other = 0.0 }
$totalCpuSecondsBySubrole = [ordered]@{ musu_runtime = 0.0; bridge_runtime = 0.0; desktop_shell = 0.0; node_helper = 0.0; webview2_helper = 0.0; other = 0.0 }
foreach ($sample in $samples) {
    $role = [string]$sample.process_role
    if (-not $sampleCountByRole.Contains($role)) {
        $role = "other"
    }
    $subrole = [string]$sample.process_subrole
    if (-not $sampleCountBySubrole.Contains($subrole)) {
        $subrole = "other"
    }
    $sampleCountByRole[$role] = [int]$sampleCountByRole[$role] + 1
    $totalCpuSecondsByRole[$role] = [Math]::Round(([double]$totalCpuSecondsByRole[$role] + [double]$sample.cpu_seconds_delta), 3)
    $sampleCountBySubrole[$subrole] = [int]$sampleCountBySubrole[$subrole] + 1
    $totalCpuSecondsBySubrole[$subrole] = [Math]::Round(([double]$totalCpuSecondsBySubrole[$subrole] + [double]$sample.cpu_seconds_delta), 3)
}
$rolesObserved = @(
    $sampleCountByRole.Keys |
        Where-Object { [int]$sampleCountByRole[$_] -gt 0 }
)
$subrolesObserved = @(
    $sampleCountBySubrole.Keys |
        Where-Object { [int]$sampleCountBySubrole[$_] -gt 0 }
)
$topCpuProcesses = @(
    $samples |
        Sort-Object cpu_pct_one_core -Descending |
        Select-Object -First 10 |
        ForEach-Object {
            [pscustomobject]@{
                id = $_.id
                process_name = $_.process_name
                process_role = $_.process_role
                process_subrole = $_.process_subrole
                bridge_registry_pid_match = $_.bridge_registry_pid_match
                cpu_seconds_delta = $_.cpu_seconds_delta
                cpu_pct_one_core = $_.cpu_pct_one_core
                working_set_mb = $_.working_set_mb
                parent_process_id = $_.parent_process_id
                is_descendant_of_musu = $_.is_descendant_of_musu
                is_repo_related = $_.is_repo_related
                classification_reason = $_.classification_reason
                command_line_present = $_.command_line_present
                command_line_sha256 = $_.command_line_sha256
                command_line_hint = $_.command_line_hint
            }
        }
)
$cpuAttribution = [ordered]@{
    schema = "musu.runtime_idle_cpu_attribution.v1"
    attribution_scope = if ($IncludeUnrelatedHelpers) {
        "all_matching_process_names"
    } else {
        "musu_process_tree_or_repo_related"
    }
    sample_count = @($samples).Count
    roles_observed = @($rolesObserved)
    subroles_observed = @($subrolesObserved)
    sample_count_by_role = $sampleCountByRole
    sample_count_by_subrole = $sampleCountBySubrole
    total_cpu_seconds_by_role = $totalCpuSecondsByRole
    total_cpu_seconds_by_subrole = $totalCpuSecondsBySubrole
    max_one_core_percent_by_role = $maxOneCorePercentByRole
    max_one_core_percent_by_subrole = $maxOneCorePercentBySubrole
    top_processes = @($topCpuProcesses)
    required_roles_present = [ordered]@{
        musu = ([int]$sampleCountByRole.musu -gt 0)
        webview2 = if ($RequireOwnedWebView2) { [int]$sampleCountByRole.webview2 -gt 0 } else { $true }
    }
    required_subroles_present = [ordered]@{
        bridge_runtime = if ($bridgeRegistry.exists -and $null -ne $bridgePid) { [int]$sampleCountBySubrole.bridge_runtime -gt 0 } else { $true }
        desktop_shell = if ($Scenario -eq "desktop-open" -or $Scenario -eq "startup-open") { [int]$processCountsBySubrole.desktop_shell -gt 0 } else { $true }
        webview2_helper = if ($RequireOwnedWebView2) { [int]$sampleCountBySubrole.webview2_helper -gt 0 } else { $true }
    }
}
$result = [ordered]@{
    schema = "musu.runtime_idle_cpu_evidence.v1"
    ok = ($musuProcessCountAfter -gt 0 -and $hot.Count -eq 0 -and $resourceBudgetViolations.Count -eq 0)
    version = $version
    git_commit = $gitCommit
    git_dirty = -not [string]::IsNullOrWhiteSpace($gitStatus)
    git_status_short = $gitStatus
    started_at = $startedAt.ToString("o")
    completed_at = $completedAt.ToString("o")
    operator_machine = $env:COMPUTERNAME
    operator_user = $env:USERNAME
    scenario = $Scenario
    require_owned_webview2 = [bool]$RequireOwnedWebView2
    sample_seconds = [Math]::Round($elapsedSeconds, 3)
    logical_processor_count = $cores
    max_one_core_percent = $MaxOneCorePercent
    max_owned_process_count = $MaxOwnedProcessCount
    max_owned_webview2_process_count = $MaxOwnedWebView2ProcessCount
    max_total_working_set_mb = $MaxTotalWorkingSetMb
    process_names = @($names)
    musu_process_names = @($musuNames)
    include_node = [bool]$IncludeNode
    include_webview2 = [bool]$IncludeWebView2
    include_unrelated_helpers = [bool]$IncludeUnrelatedHelpers
    helper_process_scope = if ($IncludeUnrelatedHelpers) {
        "all_matching_process_names"
    } else {
        "musu_process_tree_or_repo_related"
    }
    process_metadata_available = [bool]$script:processMetadataAvailable
    process_metadata_timed_out = [bool]$script:processMetadataTimedOut
    bridge_registry = $bridgeRegistry
    process_count_before = $before.Count
    process_count_after = $after.Count
    musu_process_count_after = $musuProcessCountAfter
    matching_process_inventory = $rawMatchingSummary
    target_process_running = $targetProcessRunning
    process_counts_by_role = $processCountsByRole
    process_counts_by_subrole = $processCountsBySubrole
    total_working_set_mb_after = $totalWorkingSetMbAfter
    total_private_memory_mb_after = $totalPrivateMemoryMbAfter
    memory_totals_by_role_mb = $memoryTotalsByRoleMb
    memory_totals_by_subrole_mb = $memoryTotalsBySubroleMb
    resource_budget_violations = @($resourceBudgetViolations)
    max_one_core_percent_by_role = $maxOneCorePercentByRole
    max_one_core_percent_by_subrole = $maxOneCorePercentBySubrole
    hot_process_count = $hot.Count
    doctor_background_snapshot = Get-DoctorBackgroundSnapshot
    cpu_attribution = $cpuAttribution
    samples = @($samples | Sort-Object cpu_pct_one_core -Descending)
    note = if ($after.Count -eq 0) {
        "No target MUSU processes were running during this sample."
    } elseif ($musuProcessCountAfter -eq 0) {
        "Only helper processes matched; no MUSU runtime process was running during this sample."
    } else {
        "cpu_pct_one_core is normalized so one fully busy logical processor is 100."
    }
    evidence_path = $OutputPath
}

$dir = Split-Path -Parent $OutputPath
if (-not [string]::IsNullOrWhiteSpace($dir)) {
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
}
$result | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $OutputPath -Encoding UTF8

if ($Json) {
    $result | ConvertTo-Json -Depth 8
} else {
    [pscustomobject]$result
}

if ($FailOnHot -and -not [bool]$result.ok) {
    exit 1
}
