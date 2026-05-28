[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$RemoteAddr,
    [string]$RemoteName = "remote-beta-node",
    [string]$MusuExe,
    [string]$ExpectedRouteOutput = "MUSU_REMOTE_ROUTE_OK",
    [string]$RouteTarget,
    [int]$DiscoverTimeoutSec = 5,
    [string]$EvidencePath,
    [switch]$SkipDiscover,
    [switch]$SkipRoute,
    [switch]$Json
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = (Resolve-Path (Join-Path $scriptDir "..\..")).Path

function Write-Step([string]$Message) {
    if (-not $Json) {
        Write-Host ""
        Write-Host "==> $Message"
    }
}

function Assert-True([bool]$Condition, [string]$Message) {
    if (-not $Condition) {
        throw $Message
    }
}

function Resolve-MusuExePath() {
    if (-not [string]::IsNullOrWhiteSpace($MusuExe)) {
        Assert-True (Test-Path -LiteralPath $MusuExe) "musu.exe not found at $MusuExe"
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

    throw "Unable to find MUSU. Pass -MusuExe or install the package so 'musu.exe' is on PATH."
}

if ([string]::IsNullOrWhiteSpace($EvidencePath)) {
    $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
    $EvidencePath = Join-Path $repoRoot ".local-build\multi-device\musu-multidevice-smoke-$stamp.json"
}

$MusuExe = Resolve-MusuExePath
$evidence = [ordered]@{
    ok = $false
    started_at = (Get-Date).ToString("o")
    completed_at = $null
    musu_exe = $MusuExe
    remote_addr = $RemoteAddr
    remote_name = $RemoteName
    discover_checked = -not $SkipDiscover
    route_checked = -not $SkipRoute
    route_target = $null
    evidence_path = $EvidencePath
    commands = @()
    error = $null
}

function Add-CommandEvidence([string[]]$Arguments, [int]$ExitCode, [string]$Output) {
    $script:evidence.commands += [pscustomobject]@{
        command = "musu $($Arguments -join ' ')"
        exit_code = $ExitCode
        output = $Output
        completed_at = (Get-Date).ToString("o")
    }
}

function Invoke-Musu {
    param([Parameter(Mandatory = $true)][string[]]$Arguments)
    $output = & $MusuExe @Arguments 2>&1
    $exitCode = $LASTEXITCODE
    $text = ($output | Out-String).Trim()
    Add-CommandEvidence -Arguments $Arguments -ExitCode $exitCode -Output $text
    if ($exitCode -ne 0) {
        throw "musu command failed: $($Arguments -join ' ')`n$text"
    }
    return $text
}

function Invoke-MusuJson {
    param([Parameter(Mandatory = $true)][string[]]$Arguments)
    $text = Invoke-Musu -Arguments $Arguments
    try {
        return $text | ConvertFrom-Json
    }
    catch {
        throw "musu command did not return parseable JSON: $($Arguments -join ' ')`n$text"
    }
}

try {
    Write-Step "Ensure local MUSU is up"
    $up = Invoke-MusuJson -Arguments @("up", "--json")
    Assert-True ([bool]$up.ok) "musu up did not report ok"
    Assert-True ($up.bridge.status -eq "ok") "local bridge status was not ok"

    Write-Step "Run local doctor"
    $doctor = Invoke-MusuJson -Arguments @("doctor", "--json")
    Assert-True ($doctor.overall -ne "fail") "doctor overall failed"
    Assert-True ($doctor.bridge.status -eq "ok") "doctor bridge check failed"

    Write-Step "Add remote peer"
    $peerAdd = Invoke-Musu -Arguments @("peer", "add", $RemoteAddr, "--name", $RemoteName)
    if (-not $Json) {
        Write-Host $peerAdd
    }

    Write-Step "List peers"
    $peerList = Invoke-Musu -Arguments @("peer", "list")
    if (-not $Json) {
        Write-Host $peerList
    }
    Assert-True ($peerList.Contains($RemoteAddr) -or $peerList.Contains($RemoteName)) "peer list did not show the remote peer"

    if (-not $SkipDiscover) {
        Write-Step "Run mDNS discovery"
        $discover = Invoke-Musu -Arguments @("discover", "--timeout", "$DiscoverTimeoutSec")
        if (-not $Json) {
            Write-Host $discover
        }
    }

    Write-Step "Check fleet status"
    $status = Invoke-Musu -Arguments @("status")
    if (-not $Json) {
        Write-Host $status
    }
    Assert-True ($status.Contains("MUSU Fleet Status")) "fleet status output did not render"

    if (-not $SkipRoute) {
        if ([string]::IsNullOrWhiteSpace($RouteTarget)) {
            $RouteTarget = $RemoteName
        }
        $evidence.route_target = $RouteTarget

        Write-Step "Run targeted remote route"
        $routeOutput = Invoke-Musu -Arguments @("route", "--target", $RouteTarget, "--wait", "Reply exactly: $ExpectedRouteOutput")
        if (-not $Json) {
            Write-Host $routeOutput
        }
        Assert-True ($routeOutput.Contains($ExpectedRouteOutput)) "route output did not contain expected text"
    }

    $evidence.ok = $true
    Write-Step "Multi-device beta smoke completed"
}
catch {
    $evidence.error = $_.Exception.Message
    throw
}
finally {
    $evidence.completed_at = (Get-Date).ToString("o")
    $evidenceDir = Split-Path -Parent $EvidencePath
    if (-not [string]::IsNullOrWhiteSpace($evidenceDir)) {
        New-Item -ItemType Directory -Force -Path $evidenceDir | Out-Null
    }
    $evidence | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $EvidencePath -Encoding UTF8
}

$result = [pscustomobject]$evidence
if ($Json) {
    $result | ConvertTo-Json -Depth 8
}
else {
    $result
}
