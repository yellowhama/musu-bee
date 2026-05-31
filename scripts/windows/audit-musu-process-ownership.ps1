[CmdletBinding()]
param(
    [int]$MaxMusuRuntimeProcesses = 1,
    [int]$MaxOwnedNodeProcesses = 1,
    [int]$MaxOwnedWebView2Processes = 12,
    [switch]$AllowNoBridgeRegistry,
    [string]$OutputPath,
    [switch]$FailOnProblem,
    [switch]$Json
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = (Resolve-Path (Join-Path $scriptDir "..\..")).Path
$version = (Get-Content -LiteralPath (Join-Path $repoRoot "VERSION") -Raw).Trim()
$gitCommit = (& git -C $repoRoot rev-parse HEAD 2>$null | Out-String).Trim()

if ([string]::IsNullOrWhiteSpace($OutputPath)) {
    $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
    $OutputPath = Join-Path $repoRoot ".local-build\process-ownership\musu-process-ownership-$stamp.json"
}

function Add-Check {
    param(
        [System.Collections.Generic.List[object]]$Checks,
        [Parameter(Mandatory = $true)][string]$Name,
        [ValidateSet("pass", "fail")]
        [Parameter(Mandatory = $true)][string]$Status,
        [Parameter(Mandatory = $true)][string]$Message
    )

    $Checks.Add([pscustomobject]@{
        name = $Name
        status = $Status
        message = $Message
    }) | Out-Null
}

function Add-CheckFromCondition {
    param(
        [System.Collections.Generic.List[object]]$Checks,
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][bool]$Condition,
        [Parameter(Mandatory = $true)][string]$PassMessage,
        [Parameter(Mandatory = $true)][string]$FailMessage
    )

    if ($Condition) {
        Add-Check -Checks $Checks -Name $Name -Status "pass" -Message $PassMessage
    }
    else {
        Add-Check -Checks $Checks -Name $Name -Status "fail" -Message $FailMessage
    }
}

function Initialize-NativeParentLookup {
    if ($script:nativeParentLookupAvailable) {
        return
    }
    if ($env:OS -ne "Windows_NT") {
        return
    }
    if ("MusuProcessParentAudit" -as [type]) {
        $script:nativeParentLookupAvailable = $true
        return
    }

    try {
        Add-Type -TypeDefinition @"
using System;
using System.Diagnostics;
using System.Runtime.InteropServices;

public static class MusuProcessParentAudit
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
        return [MusuProcessParentAudit]::GetParentProcessId($ProcessId)
    }
    catch {
        return $null
    }
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

function Get-ProcessCpuSafe($Process) {
    try {
        if ($null -ne $Process.CPU) {
            return [double]$Process.CPU
        }
    }
    catch {
    }
    return $null
}

function Test-RepoRelated([string]$Path) {
    if ([string]::IsNullOrWhiteSpace($Path)) {
        return $false
    }
    $lower = $Path.ToLowerInvariant()
    return ($lower.Contains($repoRoot.ToLowerInvariant()) -or $lower.Contains("musu-bee") -or $lower.Contains("musu-rs"))
}

function Test-DescendantOfAnyRoot([int]$ProcessId, $RootIds, $ParentByPid) {
    $seen = New-Object 'System.Collections.Generic.HashSet[int]'
    $current = $ProcessId

    while ($ParentByPid.ContainsKey($current)) {
        if (-not $seen.Add($current)) {
            return $false
        }

        $parent = $ParentByPid[$current]
        if ($null -eq $parent -or $parent -le 0) {
            return $false
        }
        if ($RootIds.Contains([int]$parent)) {
            return $true
        }
        $current = [int]$parent
    }

    return $false
}

function Test-HttpHealth([string]$Addr) {
    if ([string]::IsNullOrWhiteSpace($Addr)) {
        return [pscustomobject]@{ ok = $false; detail = "missing addr"; status_code = $null }
    }

    try {
        $response = Invoke-WebRequest -Uri ("http://{0}/health" -f $Addr) -UseBasicParsing -TimeoutSec 3
        return [pscustomobject]@{
            ok = ($response.StatusCode -eq 200)
            detail = "HTTP $($response.StatusCode)"
            status_code = $response.StatusCode
        }
    }
    catch {
        return [pscustomobject]@{
            ok = $false
            detail = $_.Exception.Message
            status_code = $null
        }
    }
}

$script:nativeParentLookupAvailable = $false
$targetNames = New-Object 'System.Collections.Generic.HashSet[string]' ([System.StringComparer]::OrdinalIgnoreCase)
foreach ($name in @("musu", "musud", "node", "msedgewebview2")) {
    [void]$targetNames.Add($name)
}

$rawProcesses = @()
$parentByPid = @{}
foreach ($process in Get-Process -ErrorAction SilentlyContinue) {
    if (-not $targetNames.Contains($process.ProcessName)) {
        continue
    }

    $parentPid = Get-ParentProcessIdSafe ([int]$process.Id)
    if ($null -ne $parentPid) {
        $parentByPid[[int]$process.Id] = [int]$parentPid
    }

    $path = Get-ProcessPathSafe $process
    $rawProcesses += [pscustomobject]@{
        pid = [int]$process.Id
        process_name = [string]$process.ProcessName
        parent_pid = $parentPid
        path = $path
        start_time = Get-ProcessStartTimeSafe $process
        cpu_seconds = Get-ProcessCpuSafe $process
        working_set_mb = [Math]::Round(([double]$process.WorkingSet64 / 1MB), 2)
        repo_related = Test-RepoRelated $path
    }
}

$musuRoots = @($rawProcesses | Where-Object {
    $_.process_name -ieq "musu" -or $_.process_name -ieq "musud"
})
$rootIds = New-Object 'System.Collections.Generic.HashSet[int]'
foreach ($root in $musuRoots) {
    [void]$rootIds.Add([int]$root.pid)
}

$processes = @()
foreach ($process in $rawProcesses) {
    $isRoot = $rootIds.Contains([int]$process.pid)
    $isOwnedHelper = (-not $isRoot -and (Test-DescendantOfAnyRoot -ProcessId ([int]$process.pid) -RootIds $rootIds -ParentByPid $parentByPid))
    $role = if ($isRoot) {
        "musu_runtime"
    }
    elseif ($process.process_name -ieq "node") {
        "node_helper"
    }
    elseif ($process.process_name -ieq "msedgewebview2") {
        "webview2_helper"
    }
    else {
        "other"
    }

    $processes += [pscustomobject]@{
        pid = $process.pid
        process_name = $process.process_name
        role = $role
        parent_pid = $process.parent_pid
        owned_by_musu = [bool]($isRoot -or $isOwnedHelper)
        repo_related = [bool]$process.repo_related
        path = $process.path
        start_time = $process.start_time
        cpu_seconds = $process.cpu_seconds
        working_set_mb = $process.working_set_mb
    }
}

$ownedNode = @($processes | Where-Object { $_.role -eq "node_helper" -and $_.owned_by_musu })
$ownedWebView2 = @($processes | Where-Object { $_.role -eq "webview2_helper" -and $_.owned_by_musu })
$repoRelatedHelpers = @($processes | Where-Object {
    -not $_.owned_by_musu -and $_.repo_related -and ($_.role -eq "node_helper" -or $_.role -eq "webview2_helper")
})

$musuHome = if ($env:MUSU_HOME) {
    [System.IO.Path]::GetFullPath($env:MUSU_HOME)
}
elseif ($env:USERPROFILE) {
    Join-Path $env:USERPROFILE ".musu"
}
elseif ($env:HOME) {
    Join-Path $env:HOME ".musu"
}
else {
    Join-Path $repoRoot ".musu"
}
$bridgeRegistryPath = Join-Path $musuHome "services\bridge.json"
$bridgeRegistry = $null
$bridgeRegistryParseError = $null
if (Test-Path -LiteralPath $bridgeRegistryPath) {
    try {
        $bridgeRegistry = Get-Content -LiteralPath $bridgeRegistryPath -Raw | ConvertFrom-Json
    }
    catch {
        $bridgeRegistryParseError = $_.Exception.Message
    }
}

$bridgePid = if ($bridgeRegistry -and $bridgeRegistry.PSObject.Properties["pid"]) {
    [int]$bridgeRegistry.pid
}
else {
    $null
}
$bridgeAddr = if ($bridgeRegistry -and $bridgeRegistry.PSObject.Properties["addr"]) {
    [string]$bridgeRegistry.addr
}
else {
    $null
}
$bridgePidProcess = if ($null -ne $bridgePid) {
    $processes | Where-Object { $_.pid -eq $bridgePid } | Select-Object -First 1
}
else {
    $null
}
$bridgeHealth = if ($bridgeAddr) {
    Test-HttpHealth $bridgeAddr
}
else {
    [pscustomobject]@{ ok = $false; detail = "bridge addr missing"; status_code = $null }
}

$checks = New-Object System.Collections.Generic.List[object]
Add-CheckFromCondition -Checks $checks -Name "native parent lookup" -Condition ([bool]$script:nativeParentLookupAvailable) -PassMessage "native parent-process lookup is available" -FailMessage "native parent-process lookup is unavailable"
Add-CheckFromCondition -Checks $checks -Name "MUSU runtime process count" -Condition ($musuRoots.Count -ge 1 -and $musuRoots.Count -le $MaxMusuRuntimeProcesses) -PassMessage "$($musuRoots.Count) MUSU runtime process(es) running" -FailMessage "$($musuRoots.Count) MUSU runtime process(es) running; expected 1..$MaxMusuRuntimeProcesses"
Add-CheckFromCondition -Checks $checks -Name "owned Node helper count" -Condition ($ownedNode.Count -le $MaxOwnedNodeProcesses) -PassMessage "$($ownedNode.Count) owned Node helper process(es)" -FailMessage "$($ownedNode.Count) owned Node helper process(es); max $MaxOwnedNodeProcesses"
Add-CheckFromCondition -Checks $checks -Name "owned WebView2 helper count" -Condition ($ownedWebView2.Count -le $MaxOwnedWebView2Processes) -PassMessage "$($ownedWebView2.Count) owned WebView2 helper process(es)" -FailMessage "$($ownedWebView2.Count) owned WebView2 helper process(es); max $MaxOwnedWebView2Processes"
Add-CheckFromCondition -Checks $checks -Name "orphan repo helper count" -Condition ($repoRelatedHelpers.Count -eq 0) -PassMessage "no repo-related orphan Node/WebView2 helpers" -FailMessage "$($repoRelatedHelpers.Count) repo-related helper process(es) are not owned by a live MUSU root"
Add-CheckFromCondition -Checks $checks -Name "bridge registry exists" -Condition ($AllowNoBridgeRegistry -or (Test-Path -LiteralPath $bridgeRegistryPath)) -PassMessage "bridge registry exists" -FailMessage "bridge registry missing at $bridgeRegistryPath"
Add-CheckFromCondition -Checks $checks -Name "bridge registry parse" -Condition ($AllowNoBridgeRegistry -or ($null -ne $bridgeRegistry -and [string]::IsNullOrWhiteSpace($bridgeRegistryParseError))) -PassMessage "bridge registry parses" -FailMessage "bridge registry did not parse: $bridgeRegistryParseError"
Add-CheckFromCondition -Checks $checks -Name "bridge registry pid alive" -Condition ($AllowNoBridgeRegistry -or ($null -ne $bridgePidProcess)) -PassMessage "bridge registry pid is a live MUSU process" -FailMessage "bridge registry pid is missing, dead, or not a MUSU process"
Add-CheckFromCondition -Checks $checks -Name "bridge health" -Condition ($AllowNoBridgeRegistry -or [bool]$bridgeHealth.ok) -PassMessage "bridge /health is reachable at $bridgeAddr" -FailMessage "bridge /health failed at ${bridgeAddr}: $($bridgeHealth.detail)"

$failCount = @($checks | Where-Object { $_.status -eq "fail" }).Count
$result = [pscustomobject]@{
    schema = "musu.process_ownership_audit.v1"
    ok = ($failCount -eq 0)
    version = $version
    git_commit = $gitCommit
    recorded_at = (Get-Date).ToString("o")
    operator_machine = $env:COMPUTERNAME
    operator_user = $env:USERNAME
    repo_root = $repoRoot
    musu_home = $musuHome
    max_musu_runtime_processes = $MaxMusuRuntimeProcesses
    max_owned_node_processes = $MaxOwnedNodeProcesses
    max_owned_webview2_processes = $MaxOwnedWebView2Processes
    fail_count = $failCount
    process_counts = [pscustomobject]@{
        all_target_processes = @($processes).Count
        musu_runtime = @($musuRoots).Count
        owned_node = @($ownedNode).Count
        owned_webview2 = @($ownedWebView2).Count
        machine_wide_node = @($processes | Where-Object { $_.role -eq "node_helper" }).Count
        machine_wide_webview2 = @($processes | Where-Object { $_.role -eq "webview2_helper" }).Count
        orphan_repo_helpers = @($repoRelatedHelpers).Count
    }
    bridge_registry = [pscustomobject]@{
        path = $bridgeRegistryPath
        exists = Test-Path -LiteralPath $bridgeRegistryPath
        parse_error = $bridgeRegistryParseError
        pid = $bridgePid
        addr = $bridgeAddr
        pid_alive = ($null -ne $bridgePidProcess)
        health = $bridgeHealth
    }
    checks = $checks.ToArray()
    processes = @($processes | Sort-Object role, process_name, pid)
    evidence_path = $OutputPath
}

$dir = Split-Path -Parent $OutputPath
if (-not [string]::IsNullOrWhiteSpace($dir)) {
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
}
$result | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $OutputPath -Encoding UTF8

if ($Json) {
    $result | ConvertTo-Json -Depth 8
}
else {
    $result
}

if ($FailOnProblem -and -not [bool]$result.ok) {
    exit 1
}
