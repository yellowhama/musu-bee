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

$script:processMetadataTimedOut = $false
$script:processMetadataAvailable = $false
$script:nativeParentLookupAvailable = $false

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
$rootProcessIds = New-Object 'System.Collections.Generic.HashSet[int]'
foreach ($process in @($beforeRaw.items + $afterRaw.items)) {
    if ($musuNames.Contains($process.process_name)) {
        [void]$rootProcessIds.Add([int]$process.id)
    }
}

$before = @(Add-ProcessOwnership -Items $beforeRaw.items -MetadataMap $metadataMap -RootProcessIds $rootProcessIds)
$after = @(Add-ProcessOwnership -Items $afterRaw.items -MetadataMap $metadataMap -RootProcessIds $rootProcessIds)

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
    $samples += [pscustomobject]@{
        id = $current.id
        process_name = $current.process_name
        process_role = if ($musuNames.Contains($current.process_name)) {
            "musu"
        } elseif ($current.process_name -ieq "msedgewebview2") {
            "webview2"
        } elseif ($current.process_name -ieq "node") {
            "node"
        } else {
            "other"
        }
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
$processCountsByRole = [ordered]@{
    musu = 0
    node = 0
    webview2 = 0
    other = 0
}
foreach ($current in $after) {
    if ($musuNames.Contains($current.process_name)) {
        $processCountsByRole.musu += 1
    } elseif ($current.process_name -ieq "node") {
        $processCountsByRole.node += 1
    } elseif ($current.process_name -ieq "msedgewebview2") {
        $processCountsByRole.webview2 += 1
    } else {
        $processCountsByRole.other += 1
    }
}
$memoryTotalsByRoleMb = [ordered]@{
    musu = [ordered]@{ working_set_mb = 0.0; private_memory_mb = 0.0 }
    node = [ordered]@{ working_set_mb = 0.0; private_memory_mb = 0.0 }
    webview2 = [ordered]@{ working_set_mb = 0.0; private_memory_mb = 0.0 }
    other = [ordered]@{ working_set_mb = 0.0; private_memory_mb = 0.0 }
}
foreach ($current in $after) {
    $role = if ($musuNames.Contains($current.process_name)) {
        "musu"
    } elseif ($current.process_name -ieq "node") {
        "node"
    } elseif ($current.process_name -ieq "msedgewebview2") {
        "webview2"
    } else {
        "other"
    }
    $memoryTotalsByRoleMb[$role].working_set_mb = [Math]::Round(([double]$memoryTotalsByRoleMb[$role].working_set_mb + [double]$current.working_set_mb), 2)
    $memoryTotalsByRoleMb[$role].private_memory_mb = [Math]::Round(([double]$memoryTotalsByRoleMb[$role].private_memory_mb + [double]$current.private_memory_mb), 2)
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
foreach ($sample in $samples) {
    $role = [string]$sample.process_role
    $value = [double]$sample.cpu_pct_one_core
    if ($maxOneCorePercentByRole.Contains($role) -and $value -gt [double]$maxOneCorePercentByRole[$role]) {
        $maxOneCorePercentByRole[$role] = $value
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
    process_count_before = $before.Count
    process_count_after = $after.Count
    musu_process_count_after = $musuProcessCountAfter
    target_process_running = $targetProcessRunning
    process_counts_by_role = $processCountsByRole
    total_working_set_mb_after = $totalWorkingSetMbAfter
    total_private_memory_mb_after = $totalPrivateMemoryMbAfter
    memory_totals_by_role_mb = $memoryTotalsByRoleMb
    resource_budget_violations = @($resourceBudgetViolations)
    max_one_core_percent_by_role = $maxOneCorePercentByRole
    hot_process_count = $hot.Count
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
