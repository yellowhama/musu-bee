[CmdletBinding()]
param(
    [string]$MusuExe,
    [string]$OutputPath,
    [string]$OutputRoot,
    [int]$CommandTimeoutSec = 90,
    [switch]$Json
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = (Resolve-Path (Join-Path $scriptDir "..\..")).Path
$versionPath = Join-Path $repoRoot "VERSION"
$version = if (Test-Path -LiteralPath $versionPath) {
    (Get-Content -LiteralPath $versionPath -Raw).Trim()
}
else {
    "unknown"
}

if ([string]::IsNullOrWhiteSpace($OutputRoot)) {
    $OutputRoot = Join-Path $repoRoot ".local-build\second-pc-handoff"
}
if ([string]::IsNullOrWhiteSpace($OutputPath)) {
    $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
    $machine = if ([string]::IsNullOrWhiteSpace($env:COMPUTERNAME)) { "machine" } else { $env:COMPUTERNAME }
    $safeMachine = $machine -replace "[^A-Za-z0-9._-]", "_"
    $OutputPath = Join-Path $OutputRoot "$stamp-$safeMachine.handoff.json"
}

$commands = New-Object System.Collections.Generic.List[object]
$checks = New-Object System.Collections.Generic.List[object]
$warnings = New-Object System.Collections.Generic.List[string]

function Add-Check {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [ValidateSet("pass", "fail")]
        [Parameter(Mandatory = $true)][string]$Status,
        [Parameter(Mandatory = $true)][string]$Message
    )

    $checks.Add([pscustomobject]@{
        name = $Name
        status = $Status
        message = $Message
    }) | Out-Null
}

function Add-CheckFromCondition {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][bool]$Condition,
        [Parameter(Mandatory = $true)][string]$PassMessage,
        [Parameter(Mandatory = $true)][string]$FailMessage
    )

    if ($Condition) {
        Add-Check -Name $Name -Status "pass" -Message $PassMessage
    }
    else {
        Add-Check -Name $Name -Status "fail" -Message $FailMessage
    }
}

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

function Invoke-TextCommand {
    param(
        [Parameter(Mandatory = $true)][string]$FilePath,
        [Parameter(Mandatory = $true)][string[]]$Arguments
    )

    $startInfo = [System.Diagnostics.ProcessStartInfo]::new()
    $startInfo.FileName = $FilePath
    $startInfo.Arguments = ConvertTo-ProcessArgumentString -Items $Arguments
    $startInfo.RedirectStandardOutput = $true
    $startInfo.RedirectStandardError = $true
    $startInfo.UseShellExecute = $false
    $startInfo.CreateNoWindow = $true

    $process = [System.Diagnostics.Process]::Start($startInfo)
    if (-not $process.WaitForExit($CommandTimeoutSec * 1000)) {
        try {
            $process.Kill()
        }
        catch {
        }
        throw "command timed out after ${CommandTimeoutSec}s: $FilePath $($Arguments -join ' ')"
    }

    $stdout = $process.StandardOutput.ReadToEnd()
    $stderr = $process.StandardError.ReadToEnd()
    $text = @($stdout, $stderr) -join ""
    $text = $text.Trim()

    $commands.Add([pscustomobject]@{
        command = "musu $($Arguments -join ' ')"
        exit_code = $process.ExitCode
        output = $text
        completed_at = (Get-Date).ToString("o")
    }) | Out-Null

    if ($process.ExitCode -ne 0) {
        throw "musu command failed with exit code $($process.ExitCode): $($Arguments -join ' ')`n$text"
    }

    return $text
}

function Resolve-MusuExePath {
    if (-not [string]::IsNullOrWhiteSpace($MusuExe)) {
        if (-not (Test-Path -LiteralPath $MusuExe)) {
            throw "musu.exe not found at $MusuExe"
        }
        return (Resolve-Path -LiteralPath $MusuExe).Path
    }

    $repoDebugExe = Join-Path $repoRoot "musu-rs\target\debug\musu.exe"
    if (Test-Path -LiteralPath $repoDebugExe) {
        return (Resolve-Path -LiteralPath $repoDebugExe).Path
    }

    $command = Get-Command "musu.exe" -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
    if (-not $command) {
        $command = Get-Command "musu" -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
    }
    if ($command) {
        if ($command.Source) {
            return $command.Source
        }
        return $command.Path
    }

    throw "Unable to find MUSU. Install the MSIX package or pass -MusuExe."
}

function Get-IPv4Candidates {
    try {
        return @(Get-NetIPAddress -AddressFamily IPv4 -ErrorAction Stop |
            Where-Object {
                $_.IPAddress -and
                $_.IPAddress -ne "0.0.0.0" -and
                $_.IPAddress -notlike "127.*" -and
                $_.IPAddress -notlike "169.254.*"
            } |
            Sort-Object InterfaceAlias, IPAddress |
            ForEach-Object {
                [pscustomobject]@{
                    interface_alias = $_.InterfaceAlias
                    ip_address = $_.IPAddress
                    prefix_length = $_.PrefixLength
                    address_state = [string]$_.AddressState
                    prefix_origin = [string]$_.PrefixOrigin
                }
            })
    }
    catch {
        $warnings.Add("Get-NetIPAddress failed: $($_.Exception.Message)") | Out-Null
        return @()
    }
}

$startedAt = Get-Date
$resolvedMusuExe = $null
$up = $null
$doctor = $null
$statusText = $null
$bridgeLocalUrl = $null
$bridgePort = $null
$errorText = $null

try {
    $resolvedMusuExe = Resolve-MusuExePath
    Add-Check "musu executable" "pass" "resolved MUSU executable at $resolvedMusuExe"

    $upText = Invoke-TextCommand -FilePath $resolvedMusuExe -Arguments @("up", "--json")
    $up = $upText | ConvertFrom-Json
    Add-CheckFromCondition "musu up" ([bool]$up.ok) "musu up reports ok" "musu up did not report ok"

    $bridgeLocalUrl = [string]$up.bridge.local_url
    if ([string]::IsNullOrWhiteSpace($bridgeLocalUrl) -and $up.bridge.url) {
        $bridgeLocalUrl = [string]$up.bridge.url
    }
    if (-not [string]::IsNullOrWhiteSpace($bridgeLocalUrl)) {
        try {
            $bridgeUri = [uri]$bridgeLocalUrl
            $bridgePort = $bridgeUri.Port
        }
        catch {
            $warnings.Add("Unable to parse bridge local URL '$bridgeLocalUrl': $($_.Exception.Message)") | Out-Null
        }
    }
    Add-CheckFromCondition "bridge port" ($bridgePort -gt 0) "bridge port resolved as $bridgePort" "bridge port could not be resolved from musu up output"

    $doctorText = Invoke-TextCommand -FilePath $resolvedMusuExe -Arguments @("doctor", "--json")
    $doctor = $doctorText | ConvertFrom-Json
    Add-CheckFromCondition "musu doctor" ($doctor.overall -ne "fail") "musu doctor overall is not fail" "musu doctor overall failed"

    $statusText = Invoke-TextCommand -FilePath $resolvedMusuExe -Arguments @("status")
    Add-CheckFromCondition "musu status" ($statusText -like "*MUSU*") "musu status produced output" "musu status output did not look valid"
}
catch {
    $errorText = $_.Exception.Message
    Add-Check "handoff collection" "fail" $errorText
}

$ipCandidates = @(Get-IPv4Candidates)
$suggestedRemoteAddrs = @()
if ($bridgePort -gt 0) {
    $suggestedRemoteAddrs = @($ipCandidates | ForEach-Object { "{0}:{1}" -f $_.ip_address, $bridgePort })
}

Add-CheckFromCondition "IPv4 candidates" ($ipCandidates.Count -gt 0) "found $($ipCandidates.Count) non-loopback IPv4 candidate(s)" "no non-loopback IPv4 address found"
Add-CheckFromCondition "suggested remote addrs" ($suggestedRemoteAddrs.Count -gt 0) "generated $($suggestedRemoteAddrs.Count) RemoteAddr candidate(s)" "could not generate RemoteAddr candidates"

$failCount = @($checks | Where-Object { $_.status -eq "fail" }).Count
$handoff = [pscustomobject]@{
    schema = "musu.second_pc_handoff.v1"
    ok = ($failCount -eq 0)
    version = $version
    started_at = $startedAt.ToString("o")
    completed_at = (Get-Date).ToString("o")
    operator_machine = $env:COMPUTERNAME
    operator_user = $env:USERNAME
    remote_name_suggestion = $env:COMPUTERNAME
    musu_exe = $resolvedMusuExe
    bridge_local_url = $bridgeLocalUrl
    bridge_port = $bridgePort
    suggested_remote_addrs = $suggestedRemoteAddrs
    ip_candidates = $ipCandidates
    status_output = $statusText
    doctor_overall = if ($doctor) { [string]$doctor.overall } else { $null }
    up_ok = if ($up) { [bool]$up.ok } else { $false }
    commands = $commands.ToArray()
    checks = $checks.ToArray()
    warnings = $warnings.ToArray()
    error = $errorText
}

New-Item -ItemType Directory -Force -Path (Split-Path -Parent $OutputPath) | Out-Null
$handoff | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $OutputPath -Encoding UTF8

if ($Json) {
    $handoff | ConvertTo-Json -Depth 8
}
else {
    "MUSU second-PC handoff"
    "ok: $($handoff.ok)"
    "handoff_path: $((Resolve-Path -LiteralPath $OutputPath).Path)"
    "remote_name_suggestion: $($handoff.remote_name_suggestion)"
    "bridge_local_url: $($handoff.bridge_local_url)"
    "suggested_remote_addrs:"
    foreach ($addr in $suggestedRemoteAddrs) {
        "  - $addr"
    }
    ""
    "Use one candidate on the primary release machine:"
    "powershell -ExecutionPolicy Bypass -File scripts\windows\smoke-multidevice-beta.ps1 -RemoteAddr <IP:PORT> -RemoteName $($handoff.remote_name_suggestion) -RouteTarget $($handoff.remote_name_suggestion)"
}

if (-not $handoff.ok) {
    exit 1
}
