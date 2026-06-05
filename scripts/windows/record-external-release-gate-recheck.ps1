[CmdletBinding()]
param(
    [string]$BaseUrl = "https://musu.pro",
    [string]$SecondPcHost = "192.168.1.192",
    [int]$SecondPcPort = 8949,
    [string]$Version,
    [string]$OutputRoot,
    [string]$MusuExe,
    [int]$ScriptTimeoutSeconds = 120,
    [int]$SecondPcProbeTimeoutMs = 3000,
    [switch]$FailOnNotReady,
    [switch]$FailOnReadyBlockers,
    [switch]$Json
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = (Resolve-Path (Join-Path $scriptDir "..\..")).Path

if ([string]::IsNullOrWhiteSpace($Version)) {
    $Version = (Get-Content -LiteralPath (Join-Path $repoRoot "VERSION") -Raw).Trim()
}
if ([string]::IsNullOrWhiteSpace($OutputRoot)) {
    $OutputRoot = Join-Path $repoRoot ("docs\evidence\external-gates\{0}" -f $Version)
}
if ($ScriptTimeoutSeconds -lt 1) {
    throw "ScriptTimeoutSeconds must be at least 1."
}
if ($SecondPcProbeTimeoutMs -lt 100) {
    throw "SecondPcProbeTimeoutMs must be at least 100."
}

New-Item -ItemType Directory -Force -Path $OutputRoot | Out-Null

function Get-CurrentPowerShellExecutable {
    $currentProcessPath = $null
    try {
        $currentProcessPath = [System.Diagnostics.Process]::GetCurrentProcess().MainModule.FileName
    }
    catch {
        $currentProcessPath = $null
    }

    if (-not [string]::IsNullOrWhiteSpace($currentProcessPath) -and (Test-Path -LiteralPath $currentProcessPath)) {
        return $currentProcessPath
    }

    $edition = if ($PSVersionTable.ContainsKey("PSEdition")) { [string]$PSVersionTable.PSEdition } else { "" }
    if ($edition -eq "Core") {
        return "pwsh"
    }
    return "powershell.exe"
}

function Invoke-JsonScript {
    param(
        [Parameter(Mandatory = $true)][string]$FilePath,
        [string[]]$Arguments = @(),
        [switch]$AllowFailure
    )

    $processArgs = @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $FilePath) + $Arguments

    function ConvertTo-ProcessArgument {
        param([Parameter(Mandatory = $true)][AllowEmptyString()][string]$Value)

        if ([string]::IsNullOrEmpty($Value)) {
            return '""'
        }
        if ($Value -notmatch '[\s"]') {
            return $Value
        }
        return '"' + ($Value.Replace('"', '\"')) + '"'
    }

    $watch = [Diagnostics.Stopwatch]::StartNew()
    $startInfo = New-Object System.Diagnostics.ProcessStartInfo
    $startInfo.FileName = Get-CurrentPowerShellExecutable
    $startInfo.Arguments = (($processArgs | ForEach-Object { ConvertTo-ProcessArgument -Value ([string]$_) }) -join " ")
    $startInfo.WorkingDirectory = $repoRoot
    $startInfo.UseShellExecute = $false
    $startInfo.RedirectStandardOutput = $true
    $startInfo.RedirectStandardError = $true
    $startInfo.CreateNoWindow = $true

    $process = $null
    $startError = $null
    try {
        $process = [System.Diagnostics.Process]::Start($startInfo)
    }
    catch {
        $startError = $_.Exception.Message
    }

    if (-not $process) {
        $watch.Stop()
        if (-not $AllowFailure) {
            throw "Script failed to start: $FilePath`n$startError"
        }
        return [pscustomobject]@{
            exit_code = -1
            timed_out = $false
            elapsed_ms = [int]$watch.ElapsedMilliseconds
            json = $null
            raw = $startError
            stderr = $startError
        }
    }

    $stdoutTask = $process.StandardOutput.ReadToEndAsync()
    $stderrTask = $process.StandardError.ReadToEndAsync()
    $completed = $process.WaitForExit($ScriptTimeoutSeconds * 1000)
    $timedOut = -not $completed
    if ($timedOut) {
        try {
            $process.Kill()
        }
        catch {
        }
        $process.WaitForExit()
    }
    $watch.Stop()

    $exitCode = if ($timedOut) { -1 } else { $process.ExitCode }
    try { $stdoutTask.Wait(5000) | Out-Null } catch { }
    try { $stderrTask.Wait(5000) | Out-Null } catch { }
    $text = if ($stdoutTask.IsCompleted) { ([string]$stdoutTask.Result).Trim() } else { "" }
    $stderr = if ($stderrTask.IsCompleted) { ([string]$stderrTask.Result).Trim() } else { "" }
    $rawText = @($text, $stderr) | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }
    $raw = ($rawText -join "`n").Trim()
    $parsed = $null
    if (-not [string]::IsNullOrWhiteSpace($text)) {
        try {
            $parsed = $text | ConvertFrom-Json
        }
        catch {
            if (-not $AllowFailure) {
                throw "Script did not return parseable JSON: $FilePath`n$raw"
            }
        }
    }

    if ($timedOut -and -not $AllowFailure) {
        throw "Script timed out after ${ScriptTimeoutSeconds}s: $FilePath"
    }

    if ($exitCode -ne 0 -and -not $AllowFailure) {
        throw "Script failed with exit code ${exitCode}: $FilePath`n$raw"
    }

    [pscustomobject]@{
        exit_code = $exitCode
        timed_out = [bool]$timedOut
        elapsed_ms = [int]$watch.ElapsedMilliseconds
        json = $parsed
        raw = $raw
        stderr = $stderr
    }
}

function Get-BoolProperty {
    param(
        [Parameter(Mandatory = $true)]$Object,
        [Parameter(Mandatory = $true)][string]$Name
    )

    if (-not $Object) {
        return $false
    }
    $property = $Object.PSObject.Properties[$Name]
    if (-not $property -or $null -eq $property.Value) {
        return $false
    }
    return [bool]$property.Value
}

function Get-IntProperty {
    param(
        [Parameter(Mandatory = $true)]$Object,
        [Parameter(Mandatory = $true)][string]$Name,
        [int]$Default = 0
    )

    if (-not $Object) {
        return $Default
    }
    $property = $Object.PSObject.Properties[$Name]
    if (-not $property -or $null -eq $property.Value) {
        return $Default
    }
    return [int]$property.Value
}

function Get-StringProperty {
    param(
        [Parameter(Mandatory = $true)]$Object,
        [Parameter(Mandatory = $true)][string]$Name,
        [string]$Default = ""
    )

    if (-not $Object) {
        return $Default
    }
    $property = $Object.PSObject.Properties[$Name]
    if (-not $property -or $null -eq $property.Value) {
        return $Default
    }
    return [string]$property.Value
}

function Get-ObjectProperty {
    param(
        [Parameter(Mandatory = $true)]$Object,
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

function Read-JsonFileIfPresent {
    param([Parameter(Mandatory = $true)][AllowEmptyString()][string]$Path)

    if ([string]::IsNullOrWhiteSpace($Path) -or -not (Test-Path -LiteralPath $Path)) {
        return $null
    }

    return Get-Content -LiteralPath $Path -Raw | ConvertFrom-Json
}

function ConvertTo-NetAddressString {
    param($Value)

    if ($null -eq $Value) {
        return ""
    }
    if ($Value -is [array]) {
        if ($Value.Count -eq 0) {
            return ""
        }
        return ConvertTo-NetAddressString -Value $Value[0]
    }
    if ($Value -is [System.Net.IPAddress]) {
        return $Value.ToString()
    }

    foreach ($name in @("IPAddress", "Address", "IP")) {
        $property = $Value.PSObject.Properties[$name]
        if ($property -and $null -ne $property.Value -and -not [string]::IsNullOrWhiteSpace([string]$property.Value)) {
            return [string]$property.Value
        }
    }

    return [string]$Value
}

function ConvertTo-BlockerName {
    param([Parameter(Mandatory = $true)][string]$Text)

    return ($Text.ToLowerInvariant() -replace "[^a-z0-9]+", "_" -replace "^_+", "" -replace "_+$", "")
}

function Resolve-RemoteIPAddress {
    param([Parameter(Mandatory = $true)][string]$HostName)

    $parsed = $null
    if ([System.Net.IPAddress]::TryParse($HostName, [ref]$parsed)) {
        return $parsed
    }

    $addresses = [System.Net.Dns]::GetHostAddresses($HostName)
    $selected = @($addresses | Where-Object { $_.AddressFamily -eq [System.Net.Sockets.AddressFamily]::InterNetwork } | Select-Object -First 1)
    if ($selected.Count -gt 0) {
        return $selected[0]
    }
    if ($addresses.Count -gt 0) {
        return $addresses[0]
    }
    return $null
}

function Get-SourceRouteInfo {
    param(
        [Parameter(Mandatory = $true)][System.Net.IPAddress]$RemoteAddress,
        [Parameter(Mandatory = $true)][int]$RemotePort
    )

    $socket = $null
    $sourceAddress = ""
    $interfaceAlias = ""
    $errorText = $null

    try {
        $socket = New-Object System.Net.Sockets.Socket($RemoteAddress.AddressFamily, [System.Net.Sockets.SocketType]::Dgram, [System.Net.Sockets.ProtocolType]::Udp)
        $socket.Connect($RemoteAddress, $RemotePort)
        $sourceAddress = ConvertTo-NetAddressString -Value $socket.LocalEndPoint.Address
    }
    catch {
        $errorText = $_.Exception.Message
    }
    finally {
        if ($socket) {
            $socket.Dispose()
        }
    }

    if (-not [string]::IsNullOrWhiteSpace($sourceAddress) -and (Get-Command Get-NetIPAddress -ErrorAction SilentlyContinue)) {
        try {
            $ipInfo = Get-NetIPAddress -IPAddress $sourceAddress -ErrorAction SilentlyContinue | Select-Object -First 1
            if ($ipInfo) {
                $interfaceAlias = [string]$ipInfo.InterfaceAlias
            }
        }
        catch {
        }
    }

    [pscustomobject]@{
        source_address = $sourceAddress
        interface_alias = $interfaceAlias
        error = $errorText
    }
}

function Test-BoundedReachability {
    param(
        [Parameter(Mandatory = $true)][string]$HostName,
        [Parameter(Mandatory = $true)][int]$Port,
        [Parameter(Mandatory = $true)][int]$TimeoutMs
    )

    $remoteAddress = $null
    $resolveError = $null
    try {
        $remoteAddress = Resolve-RemoteIPAddress -HostName $HostName
    }
    catch {
        $resolveError = $_.Exception.Message
    }

    $routeInfo = $null
    if ($remoteAddress) {
        $routeInfo = Get-SourceRouteInfo -RemoteAddress $remoteAddress -RemotePort $Port
    }

    $pingSucceeded = $false
    $pingElapsedMs = $null
    $pingError = $null
    if ($remoteAddress) {
        $pingWatch = [Diagnostics.Stopwatch]::StartNew()
        $ping = New-Object System.Net.NetworkInformation.Ping
        try {
            $reply = $ping.Send($remoteAddress, $TimeoutMs)
            $pingSucceeded = ($reply.Status -eq [System.Net.NetworkInformation.IPStatus]::Success)
            if ($pingSucceeded -and $reply.RoundtripTime -ge 0) {
                $pingElapsedMs = [int]$reply.RoundtripTime
            }
        }
        catch {
            $pingError = $_.Exception.Message
        }
        finally {
            $ping.Dispose()
            $pingWatch.Stop()
            if ($null -eq $pingElapsedMs) {
                $pingElapsedMs = [int]$pingWatch.ElapsedMilliseconds
            }
        }
    }

    $tcpSucceeded = $false
    $tcpElapsedMs = $null
    $tcpError = $null
    if ($remoteAddress) {
        $tcpWatch = [Diagnostics.Stopwatch]::StartNew()
        $client = New-Object System.Net.Sockets.TcpClient($remoteAddress.AddressFamily)
        try {
            $connectTask = $client.ConnectAsync($remoteAddress, $Port)
            $tcpSucceeded = $connectTask.Wait($TimeoutMs) -and $client.Connected
            if (-not $tcpSucceeded -and $connectTask.IsCompleted -and $connectTask.Exception) {
                $tcpError = $connectTask.Exception.GetBaseException().Message
            }
        }
        catch {
            $tcpError = $_.Exception.Message
        }
        finally {
            $client.Dispose()
            $tcpWatch.Stop()
            $tcpElapsedMs = [int]$tcpWatch.ElapsedMilliseconds
        }
        if (-not $tcpSucceeded -and [string]::IsNullOrWhiteSpace($tcpError)) {
            $tcpError = if ($tcpElapsedMs -ge $TimeoutMs) { "tcp_connect_timeout" } else { "tcp_connect_failed" }
        }
    }

    [pscustomobject]@{
        computer_name = $HostName
        remote_address = if ($remoteAddress) { $remoteAddress.ToString() } else { $HostName }
        remote_port = $Port
        interface_alias = if ($routeInfo) { [string]$routeInfo.interface_alias } else { "" }
        source_address = if ($routeInfo) { [string]$routeInfo.source_address } else { "" }
        ping_succeeded = [bool]$pingSucceeded
        ping_elapsed_ms = $pingElapsedMs
        tcp_test_succeeded = [bool]$tcpSucceeded
        tcp_elapsed_ms = $tcpElapsedMs
        probe_timeout_ms = $TimeoutMs
        probe_method = "bounded_ping_and_tcp"
        resolve_error = $resolveError
        route_error = if ($routeInfo) { $routeInfo.error } else { $null }
        ping_error = $pingError
        tcp_error = $tcpError
    }
}

$recordedAt = [datetimeoffset]::Now
$stamp = $recordedAt.ToString("yyyyMMdd-HHmmss")
$safeMachine = if ([string]::IsNullOrWhiteSpace($env:COMPUTERNAME)) { "machine" } else { $env:COMPUTERNAME -replace "[^A-Za-z0-9._-]", "_" }
$baseName = "$stamp-$safeMachine.external-gates"
$evidencePath = Join-Path $OutputRoot "$baseName.evidence.json"
$summaryPath = Join-Path $OutputRoot "$baseName.summary.md"

$goNoGo = Invoke-JsonScript `
    -FilePath (Join-Path $scriptDir "write-release-go-no-go.ps1") `
    -Arguments @("-PublicMetadataBaseUrl", $BaseUrl, "-ScriptTimeoutSeconds", ([string]$ScriptTimeoutSeconds), "-Json") `
    -AllowFailure

$secondPcProbeError = $null
try {
    $secondPc = Test-BoundedReachability -HostName $SecondPcHost -Port $SecondPcPort -TimeoutMs $SecondPcProbeTimeoutMs
}
catch {
    $secondPcProbeError = $_.Exception.Message
    $secondPc = $null
}

$p2pEnv = Invoke-JsonScript `
    -FilePath (Join-Path $scriptDir "show-musu-pro-p2p-env-status.ps1") `
    -Arguments @("-BaseUrl", $BaseUrl, "-Json") `
    -AllowFailure

$p2pEvidenceArgs = @("-BaseUrl", $BaseUrl, "-AllowUnverified", "-Json")
if (-not [string]::IsNullOrWhiteSpace($MusuExe)) {
    $p2pEvidenceArgs += @("-MusuExe", $MusuExe)
}

$p2pEvidence = Invoke-JsonScript `
    -FilePath (Join-Path $scriptDir "record-p2p-control-plane-evidence.ps1") `
    -Arguments $p2pEvidenceArgs `
    -AllowFailure

$releaseReady = ($goNoGo.json -and [bool]$goNoGo.json.ready_for_public_desktop_release)
$secondPcReachable = ($secondPc -and [bool]$secondPc.tcp_test_succeeded)
$p2pEnvOk = ($p2pEnv.json -and [bool]$p2pEnv.json.ok)
$p2pEvidenceOk = ($p2pEvidence.json -and [bool]$p2pEvidence.json.ok)
$publicMetadataChecked = ($goNoGo.json -and (Get-BoolProperty -Object $goNoGo.json -Name "public_metadata_checked"))
$publicMetadataOk = ($goNoGo.json -and (Get-BoolProperty -Object $goNoGo.json -Name "public_metadata_ok"))
$secondPcPingSucceeded = ($secondPc -and [bool]$secondPc.ping_succeeded)
$secondPcTcpSucceeded = ($secondPc -and [bool]$secondPc.tcp_test_succeeded)
$secondPcTcpError = if ($secondPc) { Get-StringProperty -Object $secondPc -Name "tcp_error" } else { "" }

$p2pEvidencePathFromResult = if ($p2pEvidence.json) { Get-StringProperty -Object $p2pEvidence.json -Name "evidence_path" } else { "" }
$p2pVerificationPathFromResult = if ($p2pEvidence.json) { Get-StringProperty -Object $p2pEvidence.json -Name "verification_path" } else { "" }
$p2pEvidenceDocument = Read-JsonFileIfPresent -Path $p2pEvidencePathFromResult
$p2pVerificationDocument = Read-JsonFileIfPresent -Path $p2pVerificationPathFromResult
$p2pRelayStatus = Get-ObjectProperty -Object $p2pEvidenceDocument -Name "relay_status"
$p2pRelayTransport = Get-ObjectProperty -Object $p2pEvidenceDocument -Name "relay_transport"
$p2pRelayLeases = Get-ObjectProperty -Object $p2pEvidenceDocument -Name "relay_leases"
$p2pRelayRouteEvidence = Get-ObjectProperty -Object $p2pEvidenceDocument -Name "relay_route_evidence"

$p2pRelayStatusLoggedIn = Get-BoolProperty -Object $p2pRelayStatus -Name "logged_in"
$p2pRelayTransportLoggedIn = Get-BoolProperty -Object $p2pRelayTransport -Name "logged_in"
$p2pRelayLeasesLoggedIn = Get-BoolProperty -Object $p2pRelayLeases -Name "logged_in"
$p2pRelayRouteEvidenceLoggedIn = Get-BoolProperty -Object $p2pRelayRouteEvidence -Name "logged_in"
$p2pOwnerScopeVerified = (
    (Get-BoolProperty -Object $p2pEvidence.json -Name "owner_scope_verified") -or
    (Get-BoolProperty -Object $p2pRelayTransport -Name "owner_scope_verified") -or
    (Get-BoolProperty -Object $p2pRelayLeases -Name "owner_scope_verified") -or
    (Get-BoolProperty -Object $p2pRelayRouteEvidence -Name "owner_scope_verified")
)
$p2pRelayLeaseStoreConfigured = (
    (Get-BoolProperty -Object $p2pRelayStatus -Name "relay_lease_store_configured") -or
    (Get-BoolProperty -Object $p2pRelayTransport -Name "relay_lease_store_configured") -or
    (Get-BoolProperty -Object $p2pRelayLeases -Name "relay_lease_store_configured")
)
$p2pRelayLeaseStoreBackend = Get-StringProperty -Object $p2pRelayLeases -Name "relay_lease_store_backend"
if ([string]::IsNullOrWhiteSpace($p2pRelayLeaseStoreBackend)) {
    $p2pRelayLeaseStoreBackend = Get-StringProperty -Object $p2pRelayTransport -Name "relay_lease_store_backend"
}
if ([string]::IsNullOrWhiteSpace($p2pRelayLeaseStoreBackend)) {
    $p2pRelayLeaseStoreBackend = Get-StringProperty -Object $p2pRelayStatus -Name "relay_lease_store_backend"
}
$p2pRelayLeaseStoreReleaseGrade = (
    (Get-BoolProperty -Object $p2pRelayStatus -Name "relay_lease_store_release_grade") -or
    (Get-BoolProperty -Object $p2pRelayTransport -Name "relay_lease_store_release_grade") -or
    (Get-BoolProperty -Object $p2pRelayLeases -Name "relay_lease_store_release_grade")
)
$p2pRelayTransportDescriptorWired = (
    (Get-BoolProperty -Object $p2pEvidence.json -Name "relay_transport_descriptor_wired") -or
    (Get-BoolProperty -Object $p2pRelayStatus -Name "relay_transport_descriptor_wired") -or
    (Get-BoolProperty -Object $p2pRelayTransport -Name "relay_transport_descriptor_wired")
)
$p2pRelayTransportWired = (
    (Get-BoolProperty -Object $p2pEvidence.json -Name "relay_transport_wired") -or
    (Get-BoolProperty -Object $p2pRelayStatus -Name "relay_transport_wired") -or
    (Get-BoolProperty -Object $p2pRelayTransport -Name "relay_transport_wired") -or
    (Get-BoolProperty -Object $p2pRelayLeases -Name "relay_transport_wired")
)
$p2pRelayConnectEndpointWired = (
    (Get-BoolProperty -Object $p2pEvidence.json -Name "relay_status_connect_endpoint_wired") -or
    (Get-BoolProperty -Object $p2pEvidence.json -Name "relay_transport_connect_endpoint_wired") -or
    (Get-BoolProperty -Object $p2pRelayStatus -Name "relay_connect_endpoint_wired") -or
    (Get-BoolProperty -Object $p2pRelayTransport -Name "relay_connect_endpoint_wired")
)
$p2pRelayPayloadEndpointWired = (
    (Get-BoolProperty -Object $p2pEvidence.json -Name "relay_status_payload_endpoint_wired") -or
    (Get-BoolProperty -Object $p2pEvidence.json -Name "relay_transport_payload_endpoint_wired") -or
    (Get-BoolProperty -Object $p2pRelayStatus -Name "relay_payload_endpoint_wired") -or
    (Get-BoolProperty -Object $p2pRelayTransport -Name "relay_payload_endpoint_wired")
)
$p2pRouteEvidenceCountFromVerification = Get-IntProperty -Object $p2pVerificationDocument -Name "relay_route_evidence_count" -Default 0
$p2pRouteEvidenceCountFromDocument = Get-IntProperty -Object $p2pRelayRouteEvidence -Name "count" -Default 0
$p2pRelayRouteEvidenceCount = Get-IntProperty -Object $p2pEvidence.json -Name "relay_route_evidence_count" -Default ([Math]::Max($p2pRouteEvidenceCountFromVerification, $p2pRouteEvidenceCountFromDocument))
$p2pRelayPayloadTransportProven = (
    (Get-BoolProperty -Object $p2pEvidence.json -Name "relay_payload_transport_proven") -or
    (Get-BoolProperty -Object $p2pRelayRouteEvidence -Name "relay_transport_proven")
)
$p2pPayloadProofValidCountFromVerification = Get-IntProperty -Object $p2pVerificationDocument -Name "relay_payload_delivery_proof_valid_count" -Default 0
$p2pRelayPayloadDeliveryProofValidCount = Get-IntProperty -Object $p2pEvidence.json -Name "relay_payload_delivery_proof_valid_count" -Default $p2pPayloadProofValidCountFromVerification

$goNoGoBlockers = @()
if ($goNoGo.json -and $goNoGo.json.PSObject.Properties["blockers"]) {
    $goNoGoBlockers = @(
        $goNoGo.json.blockers | ForEach-Object {
            [pscustomobject]@{
                area = [string]$_.area
                message = [string]$_.message
            }
        }
    )
}

$blockers = New-Object System.Collections.Generic.List[string]
if (-not $releaseReady) {
    [void]$blockers.Add("release_go_no_go_not_ready")
}
foreach ($blocker in $goNoGoBlockers) {
    if (-not [string]::IsNullOrWhiteSpace($blocker.area)) {
        [void]$blockers.Add(("go_no_go_{0}" -f (ConvertTo-BlockerName -Text $blocker.area)))
    }
}
if (-not $secondPcReachable) {
    [void]$blockers.Add("second_pc_unreachable")
}
if (-not $p2pEnvOk) {
    [void]$blockers.Add("p2p_env_not_ready")
}
if (-not $p2pEvidenceOk) {
    [void]$blockers.Add("p2p_control_plane_evidence_not_verified")
}
if ($p2pEvidence.json -and (-not $p2pRelayStatusLoggedIn -or -not $p2pRelayTransportLoggedIn -or -not $p2pRelayLeasesLoggedIn -or -not $p2pRelayRouteEvidenceLoggedIn)) {
    [void]$blockers.Add("p2p_runtime_not_logged_in")
}
if ($p2pEvidence.json -and -not $p2pOwnerScopeVerified) {
    [void]$blockers.Add("p2p_owner_scope_not_verified")
}
if ($p2pEvidence.json -and -not $p2pRelayLeaseStoreReleaseGrade) {
    [void]$blockers.Add("p2p_relay_lease_store_not_release_grade")
}
if ($p2pEvidence.json -and -not $p2pRelayTransportWired) {
    [void]$blockers.Add("p2p_relay_transport_not_wired")
}
if ($p2pEvidence.json -and -not $p2pRelayPayloadEndpointWired) {
    [void]$blockers.Add("p2p_relay_payload_endpoint_not_wired")
}
if ($p2pEvidence.json -and -not $p2pRelayPayloadTransportProven) {
    [void]$blockers.Add("p2p_relay_payload_transport_not_proven")
}
if ($p2pEvidence.json -and $p2pRelayPayloadDeliveryProofValidCount -le 0) {
    [void]$blockers.Add("p2p_relay_payload_delivery_proof_missing")
}

$result = [pscustomobject]@{
    schema = "musu.external_release_gate_recheck.v1"
    ok = ($blockers.Count -eq 0)
    version = $Version
    recorded_at = $recordedAt.ToString("o")
    operator_machine = $env:COMPUTERNAME
    operator_user = $env:USERNAME
    base_url = $BaseUrl
    second_pc_host = $SecondPcHost
    second_pc_port = $SecondPcPort
    second_pc_probe_timeout_ms = $SecondPcProbeTimeoutMs
    release_ready = [bool]$releaseReady
    public_metadata_checked = [bool]$publicMetadataChecked
    public_metadata_ok = [bool]$publicMetadataOk
    local_artifacts_ready = if ($goNoGo.json) { [bool]$goNoGo.json.local_artifacts_ready } else { $false }
    single_machine_verified = if ($goNoGo.json) { [bool]$goNoGo.json.single_machine_verified } else { $false }
    runtime_idle_cpu_verified = if ($goNoGo.json) { [bool]$goNoGo.json.runtime_idle_cpu_verified } else { $false }
    runtime_idle_cpu_valid_machine_count = if ($goNoGo.json) { $goNoGo.json.runtime_idle_cpu_valid_machine_count } else { $null }
    runtime_cpu_scenario_matrix_verified = if ($goNoGo.json) { [bool]$goNoGo.json.runtime_cpu_scenario_matrix_verified } else { $false }
    runtime_cpu_scenario_matrix_valid_machine_count = if ($goNoGo.json) { $goNoGo.json.runtime_cpu_scenario_matrix_valid_machine_count } else { $null }
    multi_device_verified = if ($goNoGo.json) { [bool]$goNoGo.json.multi_device_verified } else { $false }
    support_mailbox_verified = if ($goNoGo.json) { [bool]$goNoGo.json.support_mailbox_verified } else { $false }
    store_release_verified = if ($goNoGo.json) { [bool]$goNoGo.json.store_release_verified } else { $false }
    p2p_control_plane_verified = if ($goNoGo.json) { [bool]$goNoGo.json.p2p_control_plane_verified } else { $false }
    second_pc_ping_succeeded = [bool]$secondPcPingSucceeded
    second_pc_tcp_succeeded = [bool]$secondPcTcpSucceeded
    second_pc_tcp_error = $secondPcTcpError
    second_pc_reachability = $secondPc
    second_pc_probe_error = $secondPcProbeError
    p2p_env_ok = [bool]$p2pEnvOk
    p2p_env = $p2pEnv.json
    p2p_env_exit_code = $p2pEnv.exit_code
    p2p_evidence_ok = [bool]$p2pEvidenceOk
    p2p_evidence_result = $p2pEvidence.json
    p2p_evidence_exit_code = $p2pEvidence.exit_code
    p2p_evidence_path = if ($p2pEvidence.json) { [string]$p2pEvidence.json.evidence_path } else { $null }
    p2p_verification_path = if ($p2pEvidence.json) { [string]$p2pEvidence.json.verification_path } else { $null }
    p2p_evidence_musu_exe = if ($p2pEvidence.json) { [string]$p2pEvidence.json.musu_exe } else { $null }
    p2p_evidence_musu_exe_source = if ($p2pEvidence.json) { [string]$p2pEvidence.json.musu_exe_source } else { $null }
    p2p_relay_status_logged_in = [bool]$p2pRelayStatusLoggedIn
    p2p_relay_transport_logged_in = [bool]$p2pRelayTransportLoggedIn
    p2p_relay_leases_logged_in = [bool]$p2pRelayLeasesLoggedIn
    p2p_relay_route_evidence_logged_in = [bool]$p2pRelayRouteEvidenceLoggedIn
    p2p_owner_scope_verified = [bool]$p2pOwnerScopeVerified
    p2p_relay_lease_store_configured = [bool]$p2pRelayLeaseStoreConfigured
    p2p_relay_lease_store_backend = $p2pRelayLeaseStoreBackend
    p2p_relay_lease_store_release_grade = [bool]$p2pRelayLeaseStoreReleaseGrade
    p2p_relay_transport_descriptor_wired = [bool]$p2pRelayTransportDescriptorWired
    p2p_relay_transport_wired = [bool]$p2pRelayTransportWired
    p2p_relay_connect_endpoint_wired = [bool]$p2pRelayConnectEndpointWired
    p2p_relay_payload_endpoint_wired = [bool]$p2pRelayPayloadEndpointWired
    p2p_relay_route_evidence_count = [int]$p2pRelayRouteEvidenceCount
    p2p_relay_payload_transport_proven = [bool]$p2pRelayPayloadTransportProven
    p2p_relay_payload_delivery_proof_valid_count = [int]$p2pRelayPayloadDeliveryProofValidCount
    blockers = $blockers.ToArray()
    go_no_go_blockers = $goNoGoBlockers
    go_no_go = $goNoGo.json
    go_no_go_exit_code = $goNoGo.exit_code
    go_no_go_timed_out = [bool]$goNoGo.timed_out
    p2p_env_timed_out = [bool]$p2pEnv.timed_out
    p2p_evidence_timed_out = [bool]$p2pEvidence.timed_out
}

$result | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath $evidencePath -Encoding UTF8
$hash = Get-FileHash -Algorithm SHA256 -LiteralPath $evidencePath
$runtimeIdleCpuText = if ($null -ne $result.runtime_idle_cpu_valid_machine_count) { [string]$result.runtime_idle_cpu_valid_machine_count } else { "n/a" }
$runtimeCpuMatrixText = if ($null -ne $result.runtime_cpu_scenario_matrix_valid_machine_count) { [string]$result.runtime_cpu_scenario_matrix_valid_machine_count } else { "n/a" }
$secondPcTcpText = if ($result.second_pc_reachability) { [string]$result.second_pc_reachability.tcp_test_succeeded } else { "False" }
$secondPcTcpErrorText = if ([string]::IsNullOrWhiteSpace($result.second_pc_tcp_error)) { "none" } else { $result.second_pc_tcp_error }
$p2pRelayLeaseStoreBackendText = if ([string]::IsNullOrWhiteSpace($result.p2p_relay_lease_store_backend)) { "none" } else { $result.p2p_relay_lease_store_backend }
$blockerText = if ($result.blockers.Count -gt 0) { $result.blockers -join ", " } else { "none" }

$summary = @"
# MUSU External Release Gate Recheck

- Version: $Version
- Release ready: $($result.release_ready)
- Public metadata checked: $($result.public_metadata_checked)
- Public metadata ok: $($result.public_metadata_ok)
- Local artifacts ready: $($result.local_artifacts_ready)
- Single-machine verified: $($result.single_machine_verified)
- Runtime idle CPU: $runtimeIdleCpuText
- Runtime CPU matrix: $runtimeCpuMatrixText
- Second PC: ${SecondPcHost}:${SecondPcPort}
- Second PC ping succeeded: $($result.second_pc_ping_succeeded)
- Second PC TCP reachable: $secondPcTcpText
- Second PC TCP error: $secondPcTcpErrorText
- P2P env ready: $($result.p2p_env_ok)
- P2P evidence verified: $($result.p2p_evidence_ok)
- P2P evidence: $($result.p2p_evidence_path)
- P2P evidence MUSU exe: $($result.p2p_evidence_musu_exe)
- P2P evidence MUSU exe source: $($result.p2p_evidence_musu_exe_source)
- P2P relay status logged in: $($result.p2p_relay_status_logged_in)
- P2P relay transport logged in: $($result.p2p_relay_transport_logged_in)
- P2P relay leases logged in: $($result.p2p_relay_leases_logged_in)
- P2P relay route evidence logged in: $($result.p2p_relay_route_evidence_logged_in)
- P2P owner scope verified: $($result.p2p_owner_scope_verified)
- P2P relay lease store configured: $($result.p2p_relay_lease_store_configured)
- P2P relay lease store backend: $p2pRelayLeaseStoreBackendText
- P2P relay lease store release-grade: $($result.p2p_relay_lease_store_release_grade)
- P2P relay transport descriptor wired: $($result.p2p_relay_transport_descriptor_wired)
- P2P relay transport wired: $($result.p2p_relay_transport_wired)
- P2P relay connect endpoint wired: $($result.p2p_relay_connect_endpoint_wired)
- P2P relay payload endpoint wired: $($result.p2p_relay_payload_endpoint_wired)
- P2P relay route evidence count: $($result.p2p_relay_route_evidence_count)
- P2P relay payload transport proven: $($result.p2p_relay_payload_transport_proven)
- P2P relay payload delivery proof valid count: $($result.p2p_relay_payload_delivery_proof_valid_count)
- Blockers: $blockerText
- Evidence: $([System.IO.Path]::GetFileName($evidencePath))
- Evidence SHA256: $($hash.Hash.ToLowerInvariant())
- Recorded at: $($recordedAt.ToString("o"))

This record is a repeatable snapshot of the remaining external release gates:
second-PC reachability, live P2P control-plane readiness, and final go/no-go.
"@
$summary | Set-Content -LiteralPath $summaryPath -Encoding UTF8

$final = [pscustomobject]@{
    ok = [bool]$result.ok
    version = $Version
    evidence_path = (Resolve-Path -LiteralPath $evidencePath).Path
    evidence_sha256 = $hash.Hash.ToLowerInvariant()
    summary_path = (Resolve-Path -LiteralPath $summaryPath).Path
    release_ready = [bool]$result.release_ready
    public_metadata_checked = [bool]$result.public_metadata_checked
    public_metadata_ok = [bool]$result.public_metadata_ok
    local_artifacts_ready = [bool]$result.local_artifacts_ready
    single_machine_verified = [bool]$result.single_machine_verified
    runtime_idle_cpu_verified = [bool]$result.runtime_idle_cpu_verified
    runtime_cpu_scenario_matrix_verified = [bool]$result.runtime_cpu_scenario_matrix_verified
    second_pc_reachable = [bool]$secondPcReachable
    second_pc_ping_succeeded = [bool]$secondPcPingSucceeded
    second_pc_tcp_succeeded = [bool]$secondPcTcpSucceeded
    second_pc_tcp_error = $secondPcTcpError
    p2p_env_ok = [bool]$p2pEnvOk
    p2p_evidence_ok = [bool]$p2pEvidenceOk
    p2p_evidence_path = $result.p2p_evidence_path
    p2p_evidence_musu_exe = $result.p2p_evidence_musu_exe
    p2p_evidence_musu_exe_source = $result.p2p_evidence_musu_exe_source
    p2p_relay_status_logged_in = [bool]$result.p2p_relay_status_logged_in
    p2p_relay_transport_logged_in = [bool]$result.p2p_relay_transport_logged_in
    p2p_relay_leases_logged_in = [bool]$result.p2p_relay_leases_logged_in
    p2p_relay_route_evidence_logged_in = [bool]$result.p2p_relay_route_evidence_logged_in
    p2p_owner_scope_verified = [bool]$result.p2p_owner_scope_verified
    p2p_relay_lease_store_configured = [bool]$result.p2p_relay_lease_store_configured
    p2p_relay_lease_store_backend = $result.p2p_relay_lease_store_backend
    p2p_relay_lease_store_release_grade = [bool]$result.p2p_relay_lease_store_release_grade
    p2p_relay_transport_descriptor_wired = [bool]$result.p2p_relay_transport_descriptor_wired
    p2p_relay_transport_wired = [bool]$result.p2p_relay_transport_wired
    p2p_relay_connect_endpoint_wired = [bool]$result.p2p_relay_connect_endpoint_wired
    p2p_relay_payload_endpoint_wired = [bool]$result.p2p_relay_payload_endpoint_wired
    p2p_relay_route_evidence_count = [int]$result.p2p_relay_route_evidence_count
    p2p_relay_payload_transport_proven = [bool]$result.p2p_relay_payload_transport_proven
    p2p_relay_payload_delivery_proof_valid_count = [int]$result.p2p_relay_payload_delivery_proof_valid_count
    blockers = $result.blockers
}

if ($Json) {
    $final | ConvertTo-Json -Depth 6
}
else {
    $final
}

if (($FailOnNotReady -or $FailOnReadyBlockers) -and -not [bool]$final.ok) {
    exit 1
}
