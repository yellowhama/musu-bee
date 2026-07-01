[CmdletBinding()]
param(
    [string]$ExpectedNodeName,
    [int]$TimeoutSec = 45,
    [switch]$NoRestart,
    [switch]$Json
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Write-Step([string]$Message) {
    if (-not $Json) {
        Write-Host ""
        Write-Host "==> $Message"
    }
}

function Invoke-MusuJson {
    param(
        [Parameter(Mandatory = $true)][string[]]$Arguments,
        [switch]$AllowFailure
    )

    $output = & musu @Arguments 2>&1
    $exitCode = $LASTEXITCODE
    $text = ($output | Out-String).Trim()
    if ($exitCode -ne 0) {
        if ($AllowFailure) {
            return [pscustomobject]@{
                ok = $false
                exit_code = $exitCode
                raw = $text
                json = $null
            }
        }
        throw "musu $($Arguments -join ' ') failed with exit code ${exitCode}: $text"
    }

    try {
        $parsed = $text | ConvertFrom-Json
    }
    catch {
        if ($AllowFailure) {
            return [pscustomobject]@{
                ok = $false
                exit_code = $exitCode
                raw = $text
                json = $null
            }
        }
        throw "musu $($Arguments -join ' ') did not return JSON: $text"
    }

    return [pscustomobject]@{
        ok = $true
        exit_code = $exitCode
        raw = $text
        json = $parsed
    }
}

function Get-BridgeRecord {
    $registryPath = Join-Path $env:USERPROFILE ".musu\services\bridge.json"
    if (-not (Test-Path -LiteralPath $registryPath)) {
        return $null
    }
    try {
        return Get-Content -LiteralPath $registryPath | ConvertFrom-Json
    }
    catch {
        return $null
    }
}

function Stop-RegisteredBridge {
    $record = Get-BridgeRecord
    if (-not $record -or -not $record.pid) {
        return $false
    }
    $proc = Get-Process -Id ([int]$record.pid) -ErrorAction SilentlyContinue
    if (-not $proc) {
        return $false
    }
    Write-Step "Stopping registered bridge PID $($record.pid)"
    Stop-Process -Id ([int]$record.pid) -Force
    Start-Sleep -Seconds 2
    return $true
}

function Start-PackagedBridge {
    $alias = Join-Path $env:LOCALAPPDATA "Microsoft\WindowsApps\musu.exe"
    if (-not (Test-Path -LiteralPath $alias)) {
        $command = Get-Command musu -ErrorAction SilentlyContinue
        if (-not $command) {
            throw "musu execution alias was not found."
        }
        $alias = $command.Source
    }

    Write-Step "Starting packaged bridge"
    $proc = Start-Process -FilePath $alias -ArgumentList "bridge" -WindowStyle Hidden -PassThru
    return $proc
}

function Wait-DoctorBridgeOk {
    param([int]$DeadlineSec)

    $deadline = (Get-Date).AddSeconds($DeadlineSec)
    $last = $null
    while ((Get-Date) -lt $deadline) {
        $doctor = Invoke-MusuJson -Arguments @("doctor", "--json") -AllowFailure
        $last = $doctor
        if ($doctor.ok -and $doctor.json.bridge -and [string]$doctor.json.bridge.status -eq "ok") {
            return $doctor.json
        }
        Start-Sleep -Seconds 2
    }

    if ($last -and $last.raw) {
        throw "Bridge did not become healthy within ${DeadlineSec}s. Last output: $($last.raw)"
    }
    throw "Bridge did not become healthy within ${DeadlineSec}s."
}

function Assert-AdvertisedUrlUsable {
    param([Parameter(Mandatory = $true)]$Doctor)

    $bridge = $Doctor.bridge
    if (-not $bridge) {
        throw "doctor output did not include bridge status."
    }
    if ([string]$bridge.advertised_public_url_valid -ne "True" -and $bridge.advertised_public_url_valid -ne $true) {
        throw "Advertised public URL is invalid: $($bridge.advertised_public_url)"
    }
    if ([string]$bridge.advertised_public_url_remote_usable -ne "True" -and $bridge.advertised_public_url_remote_usable -ne $true) {
        throw "Advertised public URL is not usable by other PCs: $($bridge.advertised_public_url) $($bridge.advertised_public_url_warning)"
    }
    if ([string]$bridge.service_registry_bind_addr -notmatch '^0\.0\.0\.0:|\[::\]:|^:::' ) {
        throw "Bridge is not listening on a LAN-capable bind address: $($bridge.service_registry_bind_addr)"
    }
}

function Find-ThisNode {
    param([Parameter(Mandatory = $true)]$Nodes)

    $thisNode = @($Nodes.nodes | Where-Object { $_.is_this_pc -eq $true }) | Select-Object -First 1
    if ($ExpectedNodeName) {
        $named = @($Nodes.nodes | Where-Object { $_.node_name -eq $ExpectedNodeName }) | Select-Object -First 1
        if ($named) {
            $thisNode = $named
        }
    }
    return $thisNode
}

Write-Step "Checking MUSU package identity"
$packageStatus = Invoke-MusuJson -Arguments @("package-status")
if ([string]$packageStatus.json.distribution -ne "store-msix") {
    throw "Expected store-msix distribution, got '$($packageStatus.json.distribution)'."
}
if (-not $packageStatus.json.has_package_identity) {
    throw "MUSU is not running with package identity."
}

$stoppedBridge = $false
$startedPid = $null
if (-not $NoRestart) {
    $stoppedBridge = Stop-RegisteredBridge
    $started = Start-PackagedBridge
    $startedPid = $started.Id
}

Write-Step "Waiting for local bridge"
$doctor = Wait-DoctorBridgeOk -DeadlineSec $TimeoutSec
Assert-AdvertisedUrlUsable -Doctor $doctor

Write-Step "Checking cloud node registration"
$nodesResult = Invoke-MusuJson -Arguments @("nodes", "--json")
$thisNode = Find-ThisNode -Nodes $nodesResult.json
if (-not $thisNode) {
    throw "Could not find this PC in musu nodes output."
}
if ($ExpectedNodeName -and [string]$thisNode.node_name -ne $ExpectedNodeName) {
    throw "Expected node '$ExpectedNodeName', got '$($thisNode.node_name)'."
}
if ($thisNode.public_url_remote_usable -ne $true) {
    throw "This node is still registered with an unusable public_url: $($thisNode.public_url) $($thisNode.public_url_warning)"
}

$statusResult = Invoke-MusuJson -Arguments @("status", "--json") -AllowFailure

$evidence = [pscustomobject]@{
    schema = "musu.fleet_node_public_url_repair.v1"
    generated_at = (Get-Date).ToUniversalTime().ToString("o")
    node_name = [string]$thisNode.node_name
    package_full_name = [string]$packageStatus.json.package_full_name
    restarted_bridge = (-not $NoRestart)
    stopped_registered_bridge = $stoppedBridge
    started_bridge_pid = $startedPid
    bridge_pid = $doctor.bridge.service_registry_pid
    service_registry_bind_addr = [string]$doctor.bridge.service_registry_bind_addr
    advertised_public_url = [string]$doctor.bridge.advertised_public_url
    advertised_public_url_remote_usable = [bool]$doctor.bridge.advertised_public_url_remote_usable
    cloud_public_url = [string]$thisNode.public_url
    cloud_public_url_remote_usable = [bool]$thisNode.public_url_remote_usable
    fleet_status_ok = [bool]$statusResult.ok
    fleet_online_nodes = $(if ($statusResult.ok) { $statusResult.json.fleet.online_nodes } else { $null })
    fleet_total_nodes = $(if ($statusResult.ok) { $statusResult.json.fleet.total_nodes } else { $null })
}

if ($Json) {
    $evidence | ConvertTo-Json -Depth 8
}
else {
    Write-Step "Fleet node public URL repair evidence"
    $evidence | Format-List
}
