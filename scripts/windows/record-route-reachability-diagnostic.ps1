[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$Target,
    [string]$OutputPath,
    [string]$EvidenceDir,
    [string]$MusuExe,
    [string]$RoutePrompt,
    [int]$TcpTimeoutMs = 3000,
    [switch]$SkipRouteAttempt,
    [switch]$SkipNetworkProbe,
    [switch]$Json
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = (Resolve-Path (Join-Path $scriptDir "..\..")).Path
$version = (Get-Content -LiteralPath (Join-Path $repoRoot "VERSION") -Raw).Trim()
$stamp = [datetimeoffset]::Now.ToString("yyyyMMdd-HHmmss")
$safeTarget = ($Target -replace '[^A-Za-z0-9_.-]+', '_').Trim("_")
if ([string]::IsNullOrWhiteSpace($safeTarget)) {
    $safeTarget = "target"
}

if ([string]::IsNullOrWhiteSpace($MusuExe)) {
    $windowsAppsMusu = Join-Path $env:LOCALAPPDATA "Microsoft\WindowsApps\musu.exe"
    if (Test-Path -LiteralPath $windowsAppsMusu) {
        $MusuExe = $windowsAppsMusu
    }
    else {
        $command = Get-Command musu -ErrorAction SilentlyContinue
        if ($command) {
            $MusuExe = $command.Source
        }
        else {
            throw "Unable to locate musu.exe. Pass -MusuExe explicitly."
        }
    }
}

if ([string]::IsNullOrWhiteSpace($EvidenceDir)) {
    $EvidenceDir = Join-Path $repoRoot "docs\evidence\route-diagnostics\$version"
}
if ([string]::IsNullOrWhiteSpace($OutputPath)) {
    $computer = if ([string]::IsNullOrWhiteSpace($env:COMPUTERNAME)) { "UNKNOWN" } else { $env:COMPUTERNAME }
    $OutputPath = Join-Path $EvidenceDir "$stamp-$computer-$safeTarget.route-reachability-diagnostic.json"
}
if ([string]::IsNullOrWhiteSpace($RoutePrompt)) {
    $RoutePrompt = "MUSU_ROUTE_REACHABILITY_DIAGNOSTIC_$stamp"
}

New-Item -ItemType Directory -Force -Path (Split-Path -Parent $OutputPath) | Out-Null
$routeAttemptEvidencePath = [System.IO.Path]::ChangeExtension($OutputPath, ".route-attempt.json")

function Invoke-ProcessCapture {
    param(
        [Parameter(Mandatory = $true)][string]$FilePath,
        [Parameter(Mandatory = $true)][string[]]$Arguments,
        [int]$TimeoutSeconds = 60
    )

    $psi = [System.Diagnostics.ProcessStartInfo]::new()
    $psi.FileName = $FilePath
    foreach ($argument in $Arguments) {
        $psi.ArgumentList.Add($argument) | Out-Null
    }
    $psi.WorkingDirectory = $repoRoot
    $psi.UseShellExecute = $false
    $psi.RedirectStandardOutput = $true
    $psi.RedirectStandardError = $true
    $process = [System.Diagnostics.Process]::new()
    $process.StartInfo = $psi

    $started = $process.Start()
    if (-not $started) {
        throw "Failed to start $FilePath"
    }

    $stdoutTask = $process.StandardOutput.ReadToEndAsync()
    $stderrTask = $process.StandardError.ReadToEndAsync()
    $completed = $process.WaitForExit($TimeoutSeconds * 1000)
    if (-not $completed) {
        try {
            $process.Kill($true)
        }
        catch {
            $process.Kill()
        }
        $process.WaitForExit()
    }

    [pscustomobject]@{
        command = "$FilePath $($Arguments -join ' ')"
        arguments = $Arguments
        exit_code = if ($completed) { [int]$process.ExitCode } else { -1 }
        timed_out = -not $completed
        stdout = $stdoutTask.GetAwaiter().GetResult()
        stderr = $stderrTask.GetAwaiter().GetResult()
    }
}

function Convert-JsonOutput {
    param([object]$Capture)

    $text = ([string]$Capture.stdout).Trim()
    if ([string]::IsNullOrWhiteSpace($text)) {
        return $null
    }
    try {
        return $text | ConvertFrom-Json
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

    if (-not $Object) {
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

function Get-GitCommit {
    $commit = (& git -C $repoRoot rev-parse HEAD 2>$null | Out-String).Trim()
    if ([string]::IsNullOrWhiteSpace($commit)) {
        return $null
    }
    return $commit
}

function Get-GitDirty {
    $status = (& git -C $repoRoot status --porcelain 2>$null | Out-String).Trim()
    return (-not [string]::IsNullOrWhiteSpace($status))
}

$statusCapture = Invoke-ProcessCapture -FilePath $MusuExe -Arguments @("status", "--json") -TimeoutSeconds 30
$statusJson = Convert-JsonOutput -Capture $statusCapture

$explainCapture = Invoke-ProcessCapture -FilePath $MusuExe -Arguments @("route", "--target", $Target, "--explain", "--json", $RoutePrompt) -TimeoutSeconds 30
$explainJson = Convert-JsonOutput -Capture $explainCapture

$selectedAddr = ""
if ($explainJson -and $explainJson.PSObject.Properties["selected_candidate"] -and $explainJson.selected_candidate.PSObject.Properties["addr"]) {
    $selectedAddr = [string]$explainJson.selected_candidate.addr
}
$hostPort = Get-CandidateHostPort -CandidateAddr $selectedAddr

$networkProbe = [pscustomobject]@{
    target = $hostPort.host
    port = $hostPort.port
    tcp_test_succeeded = $null
    ping_succeeded = $null
    source_ipv4 = $null
    source_prefix_length = $null
    interface_index = $null
    neighbor_entry_present = $false
    neighbor_link_layer_address = $null
    neighbor_state_raw = $null
    neighbor_entry_is_not_route_success_proof = $true
}

if (-not $SkipNetworkProbe -and -not [string]::IsNullOrWhiteSpace($hostPort.host)) {
    if ($hostPort.port) {
        $networkProbe.tcp_test_succeeded = Test-TcpPort -HostName $hostPort.host -Port ([int]$hostPort.port) -TimeoutMs $TcpTimeoutMs
    }
    $networkProbe.ping_succeeded = Test-IcmpPing -HostName $hostPort.host -TimeoutMs 2000

    $ip = $null
    if ([System.Net.IPAddress]::TryParse($hostPort.host, [ref]$ip)) {
        $neighbor = Get-NetNeighbor -IPAddress $hostPort.host -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($neighbor) {
            $networkProbe.neighbor_entry_present = $true
            $networkProbe.neighbor_link_layer_address = [string]$neighbor.LinkLayerAddress
            $networkProbe.neighbor_state_raw = [int]$neighbor.State
            $networkProbe.interface_index = [int]$neighbor.ifIndex
            $source = Get-NetIPAddress -InterfaceIndex $neighbor.ifIndex -AddressFamily IPv4 -ErrorAction SilentlyContinue | Select-Object -First 1
            if ($source) {
                $networkProbe.source_ipv4 = [string]$source.IPAddress
                $networkProbe.source_prefix_length = [int]$source.PrefixLength
            }
        }
    }
}

$routeCapture = $null
if (-not $SkipRouteAttempt) {
    $routeCapture = Invoke-ProcessCapture -FilePath $MusuExe -Arguments @("route", "--target", $Target, "--route-evidence-path", $routeAttemptEvidencePath, $RoutePrompt) -TimeoutSeconds 90
}

$routeAttempt = $null
if (Test-Path -LiteralPath $routeAttemptEvidencePath) {
    try {
        $routeAttempt = Get-Content -LiteralPath $routeAttemptEvidencePath -Raw | ConvertFrom-Json
    }
    catch {
        $routeAttempt = $null
    }
}

$peer = $null
$fleet = Get-JsonPropertyValue -Object $statusJson -Name "fleet"
if ($fleet -and $fleet.PSObject.Properties["peers"]) {
    $peer = @($fleet.peers | Where-Object { [string]$_.name -eq $Target -or [string]$_.addr -eq $selectedAddr }) | Select-Object -First 1
}
$thisNode = Get-JsonPropertyValue -Object $fleet -Name "this_node"
$statusOk = [bool](Get-JsonPropertyValue -Object $statusJson -Name "ok")
$bridgeUrl = [string](Get-JsonPropertyValue -Object $statusJson -Name "bridge_url")
$totalNodes = Get-JsonPropertyValue -Object $fleet -Name "total_nodes"
$onlineNodes = Get-JsonPropertyValue -Object $fleet -Name "online_nodes"
$thisNodeHealthy = [bool](Get-JsonPropertyValue -Object $thisNode -Name "healthy")
$peerHealthy = [bool](Get-JsonPropertyValue -Object $peer -Name "healthy")
$routeEvidenceReady = [bool](Get-JsonPropertyValue -Object $explainJson -Name "route_evidence_ready")
$selectedCandidate = Get-JsonPropertyValue -Object $explainJson -Name "selected_candidate"
$selectedRouteKind = [string](Get-JsonPropertyValue -Object $selectedCandidate -Name "route_kind")
$routeAttemptResult = [string](Get-JsonPropertyValue -Object $routeAttempt -Name "result")
$routeAttemptIdentityVerified = [bool](Get-JsonPropertyValue -Object $routeAttempt -Name "peer_identity_verified")
$routeAttemptEncryption = [string](Get-JsonPropertyValue -Object $routeAttempt -Name "encryption")

$diagnostic = [pscustomobject]@{
    schema = "musu.route_reachability_diagnostic.v1"
    version = $version
    recorded_at_utc = [datetimeoffset]::UtcNow.ToString("o")
    recorded_at_kst = [datetimeoffset]::Now.ToOffset([timespan]::FromHours(9)).ToString("yyyy-MM-ddTHH:mm:sszzz")
    git_commit = Get-GitCommit
    git_dirty = Get-GitDirty
    operator_machine = if ([string]::IsNullOrWhiteSpace($env:COMPUTERNAME)) { "UNKNOWN" } else { $env:COMPUTERNAME }
    status = [pscustomobject]@{
        schema = Get-JsonPropertyValue -Object $statusJson -Name "schema"
        ok = $statusOk
        bridge_url = $bridgeUrl
        this_node = $thisNode
        peer = $peer
        total_nodes = if ($null -ne $totalNodes) { [int]$totalNodes } else { 0 }
        online_nodes = if ($null -ne $onlineNodes) { [int]$onlineNodes } else { 0 }
    }
    route_explain = $explainJson
    network_probe = $networkProbe
    route_attempt = $routeAttempt
    command_captures = [pscustomobject]@{
        status = $statusCapture
        route_explain = $explainCapture
        route_attempt = $routeCapture
    }
    conclusion = [pscustomobject]@{
        local_musu_desktop_runtime_healthy = [bool]($statusJson -and $statusOk -and $thisNode -and $thisNodeHealthy)
        target_peer_registered = [bool]($null -ne $peer)
        target_peer_healthy = [bool]($peer -and $peerHealthy)
        target_tcp_port_reachable = [bool]($networkProbe.tcp_test_succeeded)
        manual_lan_candidate_is_release_grade = [bool]($explainJson -and $routeEvidenceReady)
        musu_pro_relay_route_used = [bool]($explainJson -and $selectedCandidate -and $selectedRouteKind -eq "relay")
        successful_multi_device_route_proof = [bool]($routeAttempt -and $routeAttemptResult -eq "success" -and $routeAttemptIdentityVerified -and $routeAttemptEncryption -eq "quic_tls_1_3")
        release_interpretation = "Route reachability diagnostic only. Failed or HTTP bearer/manual LAN candidates do not satisfy release-grade multi-device route proof."
    }
}

$diagnostic | ConvertTo-Json -Depth 30 | Set-Content -LiteralPath $OutputPath -Encoding UTF8

if ($Json) {
    $diagnostic | ConvertTo-Json -Depth 30
}
else {
    "MUSU route reachability diagnostic"
    "output_path: $OutputPath"
    "target: $Target"
    "selected_addr: $selectedAddr"
    "tcp_test_succeeded: $($networkProbe.tcp_test_succeeded)"
    "route_attempt_result: $(if ($routeAttempt) { [string]$routeAttempt.result } else { 'missing' })"
}
