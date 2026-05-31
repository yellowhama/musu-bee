[CmdletBinding()]
param(
    [string]$MusuExe,
    [int]$RepeatCount = 3,
    [int]$CommandTimeoutSec = 45,
    [int]$MaxMusuRuntimeProcesses = 1,
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

if ([string]::IsNullOrWhiteSpace($MusuExe)) {
    $MusuExe = Join-Path $repoRoot "musu-rs\target\debug\musu.exe"
}
if ([string]::IsNullOrWhiteSpace($OutputPath)) {
    $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
    $OutputPath = Join-Path $repoRoot ".local-build\startup-single-instance\musu-startup-single-instance-$stamp.json"
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

function Invoke-TextCommand {
    param(
        [Parameter(Mandatory = $true)][string]$FilePath,
        [Parameter(Mandatory = $true)][string[]]$Arguments,
        [Parameter(Mandatory = $true)][int]$TimeoutSec
    )

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

    $tempRoot = [System.IO.Path]::GetTempPath()
    $commandId = [guid]::NewGuid().ToString("N")
    $stdoutPath = Join-Path $tempRoot "musu-startup-$commandId.stdout.log"
    $stderrPath = Join-Path $tempRoot "musu-startup-$commandId.stderr.log"
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
        if ($exitCode -ne 0) {
            throw "command failed with exit code ${exitCode}: $FilePath $($Arguments -join ' ')`n$stdoutText`n$stderrText"
        }

        if ([string]::IsNullOrWhiteSpace($stdoutText)) {
            return $stderrText
        }
        if (-not [string]::IsNullOrWhiteSpace($stderrText)) {
            return "$stdoutText`n$stderrText"
        }
        return $stdoutText
    }
    finally {
        if ($null -ne $process) {
            $process.Dispose()
        }
        Remove-Item -LiteralPath $stdoutPath, $stderrPath -Force -ErrorAction SilentlyContinue
    }
}

function Invoke-JsonCommand {
    param(
        [Parameter(Mandatory = $true)][string]$FilePath,
        [Parameter(Mandatory = $true)][string[]]$Arguments,
        [Parameter(Mandatory = $true)][int]$TimeoutSec
    )

    $text = Invoke-TextCommand -FilePath $FilePath -Arguments $Arguments -TimeoutSec $TimeoutSec
    try {
        return $text | ConvertFrom-Json
    }
    catch {
        throw "command did not return parseable JSON: $FilePath $($Arguments -join ' ')`n$text"
    }
}

function Get-MusuRuntimeProcesses {
    @(
        Get-Process -ErrorAction SilentlyContinue |
            Where-Object { $_.ProcessName -ieq "musu" -or $_.ProcessName -ieq "musud" } |
            ForEach-Object {
                $path = $null
                $startTime = $null
                $cpuSeconds = $null
                try { $path = [string]$_.Path } catch { }
                try { $startTime = $_.StartTime.ToString("o") } catch { }
                try { $cpuSeconds = [double]$_.CPU } catch { }
                [pscustomobject]@{
                    pid = [int]$_.Id
                    process_name = [string]$_.ProcessName
                    path = $path
                    start_time = $startTime
                    cpu_seconds = $cpuSeconds
                    working_set_mb = [Math]::Round(([double]$_.WorkingSet64 / 1MB), 2)
                }
            }
    )
}

function Get-MusuHome {
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

function Read-BridgeRegistry {
    $musuHome = Get-MusuHome
    $path = Join-Path $musuHome "services\bridge.json"
    $registry = $null
    $parseError = $null
    if (Test-Path -LiteralPath $path) {
        try {
            $registry = Get-Content -LiteralPath $path -Raw | ConvertFrom-Json
        }
        catch {
            $parseError = $_.Exception.Message
        }
    }

    [pscustomobject]@{
        path = $path
        exists = Test-Path -LiteralPath $path
        parse_error = $parseError
        pid = if ($registry -and $registry.PSObject.Properties["pid"]) { [int]$registry.pid } else { $null }
        addr = if ($registry -and $registry.PSObject.Properties["addr"]) { [string]$registry.addr } else { $null }
    }
}

if ($RepeatCount -lt 2) {
    throw "RepeatCount must be at least 2."
}

$checks = New-Object System.Collections.Generic.List[object]
Add-CheckFromCondition -Checks $checks -Name "musu executable exists" -Condition (Test-Path -LiteralPath $MusuExe) -PassMessage "musu executable exists at $MusuExe" -FailMessage "musu executable missing at $MusuExe"

$beforeProcesses = @(Get-MusuRuntimeProcesses)
$beforeRegistry = Read-BridgeRegistry
$invocations = @()

for ($i = 1; $i -le $RepeatCount; $i++) {
    $startedAt = Get-Date
    $parsed = $null
    $errorText = $null
    try {
        $parsed = Invoke-JsonCommand -FilePath $MusuExe -Arguments @("up", "--json") -TimeoutSec $CommandTimeoutSec
    }
    catch {
        $errorText = $_.Exception.Message
    }
    $completedAt = Get-Date
    $registry = Read-BridgeRegistry

    $invocations += [pscustomobject]@{
        index = $i
        started_at = $startedAt.ToString("o")
        completed_at = $completedAt.ToString("o")
        duration_ms = [Math]::Round(($completedAt - $startedAt).TotalMilliseconds, 0)
        parse_ok = ($null -ne $parsed)
        error = $errorText
        ok = if ($parsed -and $parsed.PSObject.Properties["ok"]) { [bool]$parsed.ok } else { $false }
        bridge_started = if ($parsed -and $parsed.PSObject.Properties["bridge_started"]) { [bool]$parsed.bridge_started } else { $null }
        bridge_status = if ($parsed -and $parsed.PSObject.Properties["bridge"]) { [string]$parsed.bridge.status } else { $null }
        dashboard_status = if ($parsed -and $parsed.PSObject.Properties["dashboard"]) { [string]$parsed.dashboard.status } else { $null }
        bridge_pid = if ($registry.PSObject.Properties["pid"]) { $registry.pid } else { $null }
        bridge_addr = if ($registry.PSObject.Properties["addr"]) { $registry.addr } else { $null }
        registry_path = $registry.path
    }
}

$afterProcesses = @(Get-MusuRuntimeProcesses)
$afterRegistry = Read-BridgeRegistry
$observedBridgePids = @($invocations | ForEach-Object { $_.bridge_pid } | Where-Object { $null -ne $_ } | Select-Object -Unique)
$startedAfterFirst = @($invocations | Where-Object { $_.index -gt 1 -and $_.bridge_started -eq $true })
$failedInvocations = @($invocations | Where-Object { -not $_.parse_ok -or -not $_.ok -or $_.bridge_status -ne "ok" })

Add-CheckFromCondition -Checks $checks -Name "all startup invocations parsed" -Condition (@($invocations | Where-Object { -not $_.parse_ok }).Count -eq 0) -PassMessage "all startup invocations returned parseable JSON" -FailMessage "one or more startup invocations did not return parseable JSON"
Add-CheckFromCondition -Checks $checks -Name "all startup invocations ok" -Condition (@($invocations | Where-Object { -not $_.ok }).Count -eq 0) -PassMessage "all startup invocations reported ok=true" -FailMessage "one or more startup invocations reported ok=false"
Add-CheckFromCondition -Checks $checks -Name "all bridge statuses ok" -Condition (@($invocations | Where-Object { $_.bridge_status -ne "ok" }).Count -eq 0) -PassMessage "bridge status was ok on every startup invocation" -FailMessage "bridge status was not ok on one or more startup invocations"
Add-CheckFromCondition -Checks $checks -Name "stable bridge pid" -Condition (@($observedBridgePids).Count -eq 1) -PassMessage "all startup invocations reused bridge pid $($observedBridgePids -join ', ')" -FailMessage "startup invocations observed $(@($observedBridgePids).Count) bridge pid(s): $($observedBridgePids -join ', ')"
Add-CheckFromCondition -Checks $checks -Name "no repeated bridge spawn" -Condition (@($startedAfterFirst).Count -eq 0) -PassMessage "startup invocations after the first reused the running bridge" -FailMessage "$(@($startedAfterFirst).Count) startup invocation(s) after the first spawned a new bridge"
Add-CheckFromCondition -Checks $checks -Name "runtime process count" -Condition (@($afterProcesses).Count -ge 1 -and @($afterProcesses).Count -le $MaxMusuRuntimeProcesses) -PassMessage "$(@($afterProcesses).Count) MUSU runtime process(es) after repeated startup" -FailMessage "$(@($afterProcesses).Count) MUSU runtime process(es) after repeated startup; expected 1..$MaxMusuRuntimeProcesses"
Add-CheckFromCondition -Checks $checks -Name "bridge registry exists" -Condition ([bool]$afterRegistry.exists) -PassMessage "bridge registry exists at $($afterRegistry.path)" -FailMessage "bridge registry missing at $($afterRegistry.path)"
Add-CheckFromCondition -Checks $checks -Name "bridge registry parse" -Condition ([string]::IsNullOrWhiteSpace([string]$afterRegistry.parse_error)) -PassMessage "bridge registry parses" -FailMessage "bridge registry parse error: $($afterRegistry.parse_error)"

$ownershipOutput = Join-Path (Split-Path -Parent $OutputPath) (([System.IO.Path]::GetFileNameWithoutExtension($OutputPath)) + ".process-ownership.json")
$ownershipResult = $null
$ownershipError = $null
try {
    $ownershipText = & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $scriptDir "audit-musu-process-ownership.ps1") -OutputPath $ownershipOutput -FailOnProblem -Json 2>&1
    if ($LASTEXITCODE -eq 0) {
        $ownershipResult = ($ownershipText | Out-String).Trim() | ConvertFrom-Json
    }
    else {
        $ownershipError = ($ownershipText | Out-String).Trim()
    }
}
catch {
    $ownershipError = $_.Exception.Message
}
Add-CheckFromCondition -Checks $checks -Name "process ownership audit" -Condition ($null -ne $ownershipResult -and [bool]$ownershipResult.ok) -PassMessage "process ownership audit passed after repeated startup" -FailMessage "process ownership audit failed after repeated startup: $ownershipError"

$failCount = @($checks | Where-Object { $_.status -eq "fail" }).Count
$result = [pscustomobject]@{
    schema = "musu.startup_single_instance_audit.v1"
    ok = ($failCount -eq 0)
    version = $version
    git_commit = $gitCommit
    recorded_at = (Get-Date).ToString("o")
    operator_machine = $env:COMPUTERNAME
    operator_user = $env:USERNAME
    repo_root = $repoRoot
    musu_exe = $MusuExe
    repeat_count = $RepeatCount
    command_timeout_sec = $CommandTimeoutSec
    max_musu_runtime_processes = $MaxMusuRuntimeProcesses
    fail_count = $failCount
    process_counts = [pscustomobject]@{
        before_musu_runtime = @($beforeProcesses).Count
        after_musu_runtime = @($afterProcesses).Count
        observed_bridge_pid_count = @($observedBridgePids).Count
        repeated_spawn_count = @($startedAfterFirst).Count
        failed_invocation_count = @($failedInvocations).Count
    }
    bridge_registry_before = $beforeRegistry
    bridge_registry_after = $afterRegistry
    invocations = $invocations
    before_processes = $beforeProcesses
    after_processes = $afterProcesses
    process_ownership = $ownershipResult
    process_ownership_error = $ownershipError
    checks = $checks.ToArray()
    evidence_path = $OutputPath
}

$dir = Split-Path -Parent $OutputPath
if (-not [string]::IsNullOrWhiteSpace($dir)) {
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
}
$result | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $OutputPath -Encoding UTF8

if ($Json) {
    $result | ConvertTo-Json -Depth 10
}
else {
    $result
}

if ($FailOnProblem -and -not [bool]$result.ok) {
    exit 1
}
