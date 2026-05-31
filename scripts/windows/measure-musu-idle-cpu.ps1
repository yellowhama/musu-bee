[CmdletBinding()]
param(
    [int]$SampleSeconds = 15,
    [double]$MaxOneCorePercent = 5.0,
    [string[]]$ProcessName = @("musu", "MUSU", "musud"),
    [switch]$IncludeNode,
    [switch]$IncludeWebView2,
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
foreach ($name in $ProcessName) {
    if (-not [string]::IsNullOrWhiteSpace($name)) {
        [void]$names.Add($name)
    }
}
if ($IncludeNode) {
    [void]$names.Add("node")
}
if ($IncludeWebView2) {
    [void]$names.Add("msedgewebview2")
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

function Get-TargetSnapshot($Names) {
    $items = @()
    foreach ($process in Get-Process -ErrorAction SilentlyContinue) {
        if (-not $Names.Contains($process.ProcessName)) {
            continue
        }
        $items += [pscustomobject]@{
            id = [int]$process.Id
            process_name = [string]$process.ProcessName
            cpu_seconds = if ($null -ne $process.CPU) { [double]$process.CPU } else { $null }
            start_time = Get-ProcessStartTimeSafe $process
            path = Get-ProcessPathSafe $process
        }
    }
    return $items
}

$startedAt = Get-Date
$before = @(Get-TargetSnapshot $names)
Start-Sleep -Seconds $SampleSeconds
$after = @(Get-TargetSnapshot $names)
$completedAt = Get-Date
$elapsedSeconds = [Math]::Max(0.001, ($completedAt - $startedAt).TotalSeconds)
$cores = [Environment]::ProcessorCount

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
        cpu_seconds_delta = [Math]::Round($delta, 3)
        cpu_pct_one_core = [Math]::Round($oneCorePercent, 2)
        cpu_pct_total = [Math]::Round($oneCorePercent / $cores, 2)
        start_time = $current.start_time
        path = $current.path
    }
}

$hot = @($samples | Where-Object { $_.cpu_pct_one_core -gt $MaxOneCorePercent })
$targetProcessRunning = ($after.Count -gt 0)
$result = [ordered]@{
    schema = "musu.runtime_idle_cpu_evidence.v1"
    ok = ($targetProcessRunning -and $hot.Count -eq 0)
    version = $version
    started_at = $startedAt.ToString("o")
    completed_at = $completedAt.ToString("o")
    operator_machine = $env:COMPUTERNAME
    operator_user = $env:USERNAME
    sample_seconds = [Math]::Round($elapsedSeconds, 3)
    logical_processor_count = $cores
    max_one_core_percent = $MaxOneCorePercent
    process_names = @($names)
    process_count_before = $before.Count
    process_count_after = $after.Count
    target_process_running = $targetProcessRunning
    hot_process_count = $hot.Count
    samples = @($samples | Sort-Object cpu_pct_one_core -Descending)
    note = if ($after.Count -eq 0) {
        "No target MUSU processes were running during this sample."
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
