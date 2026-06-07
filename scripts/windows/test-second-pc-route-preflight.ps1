[CmdletBinding()]
param(
    [string]$ReturnZipPath,
    [string]$HandoffPath,
    [string]$RemoteAddr,
    [string]$RemoteName,
    [string]$RouteTarget,
    [string]$MusuExe,
    [string]$OutputPath,
    [string]$OutputRoot,
    [int]$CommandTimeoutSec = 90,
    [switch]$SkipPeerAdd,
    [switch]$SkipRouteExplain,
    [switch]$Json
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = (Resolve-Path (Join-Path $scriptDir "..\..")).Path
$version = (Get-Content -LiteralPath (Join-Path $repoRoot "VERSION") -Raw).Trim()

if ([string]::IsNullOrWhiteSpace($OutputRoot)) {
    $OutputRoot = Join-Path $repoRoot ".local-build\second-pc-route-preflight"
}
if ([string]::IsNullOrWhiteSpace($OutputPath)) {
    $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
    $machine = if ([string]::IsNullOrWhiteSpace($env:COMPUTERNAME)) { "machine" } else { $env:COMPUTERNAME }
    $safeMachine = $machine -replace "[^A-Za-z0-9._-]", "_"
    $OutputPath = Join-Path $OutputRoot "$stamp-$safeMachine.second-pc-route-preflight.json"
}

$checks = New-Object System.Collections.Generic.List[object]
$commands = New-Object System.Collections.Generic.List[object]
$warnings = New-Object System.Collections.Generic.List[string]
$extractRoot = $null
$errorText = $null

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

function Resolve-LatestFile {
    param(
        [Parameter(Mandatory = $true)][string]$Root,
        [Parameter(Mandatory = $true)][string]$Filter,
        [Parameter(Mandatory = $true)][string]$Label,
        [switch]$Recurse
    )

    if (-not (Test-Path -LiteralPath $Root)) {
        throw "$Label directory not found: $Root"
    }

    $splat = @{
        LiteralPath = $Root
        Filter = $Filter
        File = $true
        ErrorAction = "SilentlyContinue"
    }
    if ($Recurse) {
        $splat["Recurse"] = $true
    }
    $file = Get-ChildItem @splat | Sort-Object LastWriteTimeUtc -Descending | Select-Object -First 1
    if (-not $file) {
        throw "$Label file not found under $Root matching $Filter"
    }
    return $file.FullName
}

function Resolve-MusuExePath {
    if (-not [string]::IsNullOrWhiteSpace($MusuExe)) {
        if (-not (Test-Path -LiteralPath $MusuExe)) {
            throw "musu.exe not found at $MusuExe"
        }
        return (Resolve-Path -LiteralPath $MusuExe).Path
    }

    $windowsAppsAlias = if ($env:LOCALAPPDATA) {
        Join-Path $env:LOCALAPPDATA "Microsoft\WindowsApps\musu.exe"
    }
    else {
        $null
    }
    if (-not [string]::IsNullOrWhiteSpace($windowsAppsAlias) -and (Test-Path -LiteralPath $windowsAppsAlias)) {
        return $windowsAppsAlias
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

    $repoDebugExe = Join-Path $repoRoot "musu-rs\target\debug\musu.exe"
    if (Test-Path -LiteralPath $repoDebugExe) {
        return (Resolve-Path -LiteralPath $repoDebugExe).Path
    }

    throw "Unable to find MUSU. Install the MSIX package or pass -MusuExe."
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

function Invoke-MusuCommand {
    param(
        [Parameter(Mandatory = $true)][string]$FilePath,
        [Parameter(Mandatory = $true)][string[]]$Arguments
    )

    $commandId = [guid]::NewGuid().ToString("N")
    $tempRoot = [System.IO.Path]::GetTempPath()
    $stdoutPath = Join-Path $tempRoot "musu-second-pc-preflight-$commandId.stdout.log"
    $stderrPath = Join-Path $tempRoot "musu-second-pc-preflight-$commandId.stderr.log"
    $exitPath = Join-Path $tempRoot "musu-second-pc-preflight-$commandId.exit.txt"
    $job = $null
    $timedOut = $false

    try {
        $job = Start-Job -ScriptBlock {
            param(
                [string]$CommandPath,
                [string[]]$CommandArguments,
                [string]$StdoutPath,
                [string]$StderrPath,
                [string]$ExitPath
            )

            & $CommandPath @CommandArguments > $StdoutPath 2> $StderrPath
            $code = if ($null -eq $LASTEXITCODE) { 0 } else { $LASTEXITCODE }
            Set-Content -LiteralPath $ExitPath -Value ([string]$code)
        } -ArgumentList $FilePath, $Arguments, $stdoutPath, $stderrPath, $exitPath

        if (-not (Wait-Job -Job $job -Timeout $CommandTimeoutSec)) {
            $timedOut = $true
            Stop-Job -Job $job -ErrorAction SilentlyContinue
        }
        else {
            Receive-Job -Job $job -ErrorAction SilentlyContinue | Out-Null
        }

        $stdout = if (Test-Path -LiteralPath $stdoutPath) { Get-Content -LiteralPath $stdoutPath -Raw } else { "" }
        $stderr = if (Test-Path -LiteralPath $stderrPath) { Get-Content -LiteralPath $stderrPath -Raw } else { "" }
        $text = (@($stdout, $stderr) -join "").Trim()
        $exitCode = 124
        if (-not $timedOut -and (Test-Path -LiteralPath $exitPath)) {
            $exitCodeText = (Get-Content -LiteralPath $exitPath -Raw).Trim()
            if (-not [int]::TryParse($exitCodeText, [ref]$exitCode)) {
                $exitCode = 1
            }
        }

        $record = [pscustomobject]@{
            command = "musu $($Arguments -join ' ')"
            executable = $FilePath
            exit_code = $exitCode
            timed_out = $timedOut
            output = $text
            completed_at = (Get-Date).ToString("o")
        }
        $commands.Add($record) | Out-Null
        return $record
    }
    finally {
        if ($null -ne $job) {
            Remove-Job -Job $job -Force -ErrorAction SilentlyContinue
        }
        Remove-Item -LiteralPath $stdoutPath, $stderrPath, $exitPath -Force -ErrorAction SilentlyContinue
    }
}

function Convert-CommandOutputJson {
    param($Command)

    if (-not $Command -or [string]::IsNullOrWhiteSpace([string]$Command.output)) {
        return $null
    }
    try {
        return ([string]$Command.output) | ConvertFrom-Json
    }
    catch {
        return $null
    }
}

function Get-CandidateHost {
    param([string]$CandidateAddr)

    if ([string]::IsNullOrWhiteSpace($CandidateAddr)) {
        return ""
    }

    $value = $CandidateAddr.Trim() -replace '^[a-z][a-z0-9+.-]*://', ''
    $authority = (($value -split '/', 2)[0]).Trim()
    if ($authority.StartsWith("[")) {
        $end = $authority.IndexOf("]")
        if ($end -gt 1) {
            return $authority.Substring(1, $end - 1).Trim()
        }
        return ""
    }
    if ($authority -match "^([^:]+):\d+$") {
        return $Matches[1].Trim()
    }
    return $authority
}

function Get-LocalAddressSet {
    $values = New-Object System.Collections.Generic.HashSet[string]([System.StringComparer]::OrdinalIgnoreCase)
    foreach ($value in @($env:COMPUTERNAME, "localhost", "127.0.0.1", "::1")) {
        if (-not [string]::IsNullOrWhiteSpace($value)) {
            [void]$values.Add($value)
        }
    }
    try {
        foreach ($ip in @(Get-NetIPAddress -ErrorAction Stop | Where-Object { $_.IPAddress })) {
            [void]$values.Add([string]$ip.IPAddress)
        }
    }
    catch {
        $warnings.Add("Get-NetIPAddress failed while checking local addresses: $($_.Exception.Message)") | Out-Null
    }
    return $values
}

$startedAt = Get-Date
$resolvedMusuExe = $null
$handoff = $null
$routeExplain = $null
$up = $null
$doctor = $null

try {
    if (-not [string]::IsNullOrWhiteSpace($ReturnZipPath)) {
        if (-not (Test-Path -LiteralPath $ReturnZipPath)) {
            throw "Return zip not found: $ReturnZipPath"
        }
        $resolvedReturnZip = (Resolve-Path -LiteralPath $ReturnZipPath).Path
        $zipBase = [System.IO.Path]::GetFileNameWithoutExtension($resolvedReturnZip) -replace "[^A-Za-z0-9._-]", "_"
        $extractRoot = Join-Path $OutputRoot "extracted\$zipBase-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
        New-Item -ItemType Directory -Force -Path $extractRoot | Out-Null
        Expand-Archive -LiteralPath $resolvedReturnZip -DestinationPath $extractRoot -Force
        if ([string]::IsNullOrWhiteSpace($HandoffPath)) {
            $HandoffPath = Resolve-LatestFile -Root $extractRoot -Filter "*.handoff.json" -Label "second-PC handoff from return zip" -Recurse
        }
    }

    if ([string]::IsNullOrWhiteSpace($HandoffPath)) {
        $HandoffPath = Resolve-LatestFile -Root (Join-Path $repoRoot ".local-build\second-pc-handoff") -Filter "*.handoff.json" -Label "second-PC handoff"
    }
    if (-not (Test-Path -LiteralPath $HandoffPath)) {
        throw "Handoff file not found: $HandoffPath"
    }
    $HandoffPath = (Resolve-Path -LiteralPath $HandoffPath).Path
    $handoff = Get-Content -LiteralPath $HandoffPath -Raw | ConvertFrom-Json

    Add-CheckFromCondition "handoff schema" ([string]$handoff.schema -eq "musu.second_pc_handoff.v1") "handoff schema is valid" "handoff schema is not musu.second_pc_handoff.v1"
    Add-CheckFromCondition "handoff version" ([string]$handoff.version -eq $version) "handoff version matches $version" "handoff version does not match $version"
    Add-CheckFromCondition "handoff ok" ([bool]$handoff.ok) "handoff reports ok=true" "handoff reports ok=false"

    $candidateAddrs = @($handoff.suggested_remote_addrs | ForEach-Object { [string]$_ } | Where-Object {
        -not [string]::IsNullOrWhiteSpace($_)
    })
    Add-CheckFromCondition "suggested remote addrs" ($candidateAddrs.Count -gt 0) "handoff includes suggested_remote_addrs" "handoff does not include suggested_remote_addrs"

    if ([string]::IsNullOrWhiteSpace($RemoteAddr) -and $candidateAddrs.Count -gt 0) {
        $RemoteAddr = $candidateAddrs[0]
    }
    if ([string]::IsNullOrWhiteSpace($RemoteName)) {
        $RemoteName = [string]$handoff.remote_name_suggestion
    }
    if ([string]::IsNullOrWhiteSpace($RemoteName)) {
        $RemoteName = [string]$handoff.operator_machine
    }
    if ([string]::IsNullOrWhiteSpace($RemoteName)) {
        $RemoteName = "second-pc"
    }
    if ([string]::IsNullOrWhiteSpace($RouteTarget)) {
        $RouteTarget = $RemoteName
    }

    $remoteHost = Get-CandidateHost -CandidateAddr $RemoteAddr
    $localValues = Get-LocalAddressSet
    Add-CheckFromCondition "remote addr" (-not [string]::IsNullOrWhiteSpace($RemoteAddr) -and ($RemoteAddr -match "^\[[^\]]+\]:\d+$" -or $RemoteAddr -match "^[^:]+:\d+$")) "remote addr is host:port" "remote addr must be host:port"
    Add-CheckFromCondition "remote name" (-not [string]::IsNullOrWhiteSpace($RemoteName)) "remote name is present" "remote name is missing"
    Add-CheckFromCondition "route target" (-not [string]::IsNullOrWhiteSpace($RouteTarget)) "route target is present" "route target is missing"
    Add-CheckFromCondition "route target not self" (-not $localValues.Contains($RouteTarget)) "route target is not this machine" "route target '$RouteTarget' is this machine"
    Add-CheckFromCondition "remote addr not local" (-not $localValues.Contains($remoteHost)) "remote addr host is not local" "remote addr host '$remoteHost' is local"

    $resolvedMusuExe = Resolve-MusuExePath
    Add-Check "musu executable" "pass" "resolved MUSU executable at $resolvedMusuExe"

    $upCommand = Invoke-MusuCommand -FilePath $resolvedMusuExe -Arguments @("up", "--json")
    Add-CheckFromCondition "musu up exit" ([int]$upCommand.exit_code -eq 0) "musu up exited 0" "musu up exit code was $($upCommand.exit_code)"
    $up = Convert-CommandOutputJson -Command $upCommand
    Add-CheckFromCondition "musu up json" ($null -ne $up) "musu up output parses as JSON" "musu up output is not parseable JSON"
    if ($up) {
        Add-CheckFromCondition "musu up ok" ([bool]$up.ok) "musu up reports ok=true" "musu up did not report ok=true"
        Add-CheckFromCondition "bridge ok" ([string]$up.bridge.status -eq "ok") "bridge status is ok" "bridge status is not ok"
    }

    $doctorCommand = Invoke-MusuCommand -FilePath $resolvedMusuExe -Arguments @("doctor", "--json")
    Add-CheckFromCondition "musu doctor exit" ([int]$doctorCommand.exit_code -eq 0) "musu doctor exited 0" "musu doctor exit code was $($doctorCommand.exit_code)"
    $doctor = Convert-CommandOutputJson -Command $doctorCommand
    Add-CheckFromCondition "musu doctor json" ($null -ne $doctor) "musu doctor output parses as JSON" "musu doctor output is not parseable JSON"
    if ($doctor) {
        Add-CheckFromCondition "musu doctor overall" ([string]$doctor.overall -ne "fail") "musu doctor overall is not fail" "musu doctor overall is fail"
    }

    $peerAddCommand = $null
    if (-not $SkipPeerAdd) {
        $peerAddCommand = Invoke-MusuCommand -FilePath $resolvedMusuExe -Arguments @("peer", "add", $RemoteAddr, "--name", $RemoteName)
    }

    $peerListCommand = Invoke-MusuCommand -FilePath $resolvedMusuExe -Arguments @("peer", "list")
    Add-CheckFromCondition "musu peer list exit" ([int]$peerListCommand.exit_code -eq 0) "musu peer list exited 0" "musu peer list exit code was $($peerListCommand.exit_code)"
    $peerListText = [string]$peerListCommand.output
    $peerListed = ($peerListText.Contains($RemoteAddr) -or $peerListText.Contains($RemoteName) -or $peerListText.Contains($RouteTarget))
    if ($peerAddCommand) {
        Add-CheckFromCondition "musu peer add or already listed" (([int]$peerAddCommand.exit_code -eq 0) -or $peerListed) "peer add exited 0 or peer is already listed" "peer add failed and peer is not listed"
    }
    Add-CheckFromCondition "target peer listed" $peerListed "peer list contains remote addr/name/target" "peer list does not contain remote addr '$RemoteAddr', name '$RemoteName', or target '$RouteTarget'"

    if (-not $SkipRouteExplain) {
        $routeExplainCommand = Invoke-MusuCommand -FilePath $resolvedMusuExe -Arguments @("route", "Explain second-PC route preflight for $RouteTarget", "--target", $RouteTarget, "--explain", "--json")
        Add-CheckFromCondition "route explain exit" ([int]$routeExplainCommand.exit_code -eq 0) "route explain exited 0" "route explain exit code was $($routeExplainCommand.exit_code)"
        $routeExplain = Convert-CommandOutputJson -Command $routeExplainCommand
        Add-CheckFromCondition "route explain json" ($null -ne $routeExplain) "route explain output parses as JSON" "route explain output is not parseable JSON"
        if ($routeExplain) {
            Add-CheckFromCondition "route explain schema" ([string]$routeExplain.schema -eq "musu.route_explain.v1") "route explain schema is valid" "route explain schema is not musu.route_explain.v1"
        }
    }
}
catch {
    $errorText = $_.Exception.Message
    Add-Check "preflight exception" "fail" $errorText
}

$failCount = @($checks | Where-Object { $_.status -eq "fail" }).Count
$measureCommand = "powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\measure-musu-runtime-cpu-scenarios.ps1 -Scenario startup-open,runtime-started,dashboard-open,desktop-open,post-route -SampleSeconds 60 -OpenDesktopApp -RunRouteProbe -RouteTarget $RouteTarget -AllowFailedRouteProbe -Json"
$smokeCommand = "powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\smoke-multidevice-beta.ps1 -RemoteAddr $RemoteAddr -RemoteName $RemoteName -RouteTarget $RouteTarget"
$reachabilityCommand = "powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\record-route-reachability-diagnostic.ps1 -Target $RouteTarget -EvidenceDir .local-build\route-diagnostics -Json"

$result = [pscustomobject]@{
    schema = "musu.second_pc_route_preflight.v1"
    ok = ($failCount -eq 0)
    version = $version
    started_at = $startedAt.ToString("o")
    completed_at = (Get-Date).ToString("o")
    operator_machine = $env:COMPUTERNAME
    operator_user = $env:USERNAME
    musu_exe = $resolvedMusuExe
    return_zip_path = if ([string]::IsNullOrWhiteSpace($ReturnZipPath)) { $null } else { (Resolve-Path -LiteralPath $ReturnZipPath -ErrorAction SilentlyContinue).Path }
    return_zip_extract_root = $extractRoot
    handoff_path = $HandoffPath
    handoff_machine = if ($handoff) { [string]$handoff.operator_machine } else { $null }
    remote_addr = $RemoteAddr
    remote_name = $RemoteName
    route_target = $RouteTarget
    candidate_remote_addrs = if ($handoff) { @($handoff.suggested_remote_addrs) } else { @() }
    route_explain = $routeExplain
    commands = $commands.ToArray()
    next_commands = [pscustomobject]@{
        measure_target_route_cpu = $measureCommand
        smoke_multidevice = $smokeCommand
        record_route_reachability = $reachabilityCommand
    }
    checks = $checks.ToArray()
    warnings = $warnings.ToArray()
    error = $errorText
    evidence_path = $OutputPath
}

New-Item -ItemType Directory -Force -Path (Split-Path -Parent $OutputPath) | Out-Null
$result | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath $OutputPath -Encoding UTF8

if ($Json) {
    $result | ConvertTo-Json -Depth 12
}
else {
    "MUSU second-PC route preflight"
    "ok: $($result.ok)"
    "evidence_path: $((Resolve-Path -LiteralPath $OutputPath).Path)"
    "handoff: $($result.handoff_path)"
    "handoff_machine: $($result.handoff_machine)"
    "remote_name: $($result.remote_name)"
    "remote_addr: $($result.remote_addr)"
    "route_target: $($result.route_target)"
    ""
    "Next commands"
    "measure_target_route_cpu: $($result.next_commands.measure_target_route_cpu)"
    "smoke_multidevice: $($result.next_commands.smoke_multidevice)"
    "record_route_reachability: $($result.next_commands.record_route_reachability)"
}

if (-not $result.ok) {
    exit 1
}
