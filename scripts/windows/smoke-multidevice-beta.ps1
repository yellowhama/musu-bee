[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$RemoteAddr,
    [string]$RemoteName = "remote-beta-node",
    [string]$MusuExe,
    [string]$ExpectedRouteOutput = "MUSU_REMOTE_ROUTE_OK",
    [string]$RouteTarget,
    [int]$DiscoverTimeoutSec = 5,
    [switch]$SkipDiscover,
    [switch]$SkipRoute
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = (Resolve-Path (Join-Path $scriptDir "..\..")).Path

if (-not $MusuExe) {
    $MusuExe = Join-Path $repoRoot "musu-rs\target\debug\musu.exe"
}

function Write-Step([string]$Message) {
    Write-Host ""
    Write-Host "==> $Message"
}

function Assert-True([bool]$Condition, [string]$Message) {
    if (-not $Condition) {
        throw $Message
    }
}

function Invoke-Musu {
    param([Parameter(Mandatory = $true)][string[]]$Arguments)
    $output = & $MusuExe @Arguments 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "musu command failed: $($Arguments -join ' ')`n$output"
    }
    return ($output | Out-String)
}

Assert-True (Test-Path -LiteralPath $MusuExe) "musu.exe not found at $MusuExe"

Write-Step "Ensure local MUSU is up"
$upText = Invoke-Musu -Arguments @("up", "--json")
$up = $upText | ConvertFrom-Json
Assert-True ([bool]$up.ok) "musu up did not report ok"
Assert-True ($up.bridge.status -eq "ok") "local bridge status was not ok"

Write-Step "Add remote peer"
Invoke-Musu -Arguments @("peer", "add", $RemoteAddr, "--name", $RemoteName) | Out-Host

Write-Step "List peers"
$peerList = Invoke-Musu -Arguments @("peer", "list")
Write-Host $peerList
Assert-True ($peerList.Contains($RemoteAddr) -or $peerList.Contains($RemoteName)) "peer list did not show the remote peer"

if (-not $SkipDiscover) {
    Write-Step "Run mDNS discovery"
    $discover = Invoke-Musu -Arguments @("discover", "--timeout", "$DiscoverTimeoutSec")
    Write-Host $discover
}

Write-Step "Check fleet status"
$status = Invoke-Musu -Arguments @("status")
Write-Host $status
Assert-True ($status.Contains("MUSU Fleet Status")) "fleet status output did not render"

$routeOutput = $null
if (-not $SkipRoute) {
    if ([string]::IsNullOrWhiteSpace($RouteTarget)) {
        $RouteTarget = $RemoteName
    }
    Write-Step "Run targeted remote route"
    $routeOutput = Invoke-Musu -Arguments @("route", "--target", $RouteTarget, "--wait", "Reply exactly: $ExpectedRouteOutput")
    Write-Host $routeOutput
    Assert-True ($routeOutput.Contains($ExpectedRouteOutput)) "route output did not contain expected text"
}

Write-Step "Multi-device beta smoke completed"
[pscustomobject]@{
    ok = $true
    remote_addr = $RemoteAddr
    remote_name = $RemoteName
    discover_checked = -not $SkipDiscover
    route_checked = -not $SkipRoute
    route_target = $RouteTarget
}
