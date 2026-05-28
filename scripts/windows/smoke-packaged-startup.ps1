[CmdletBinding()]
param(
    [string]$StartupExe,
    [string]$MusuHome,
    [int]$TimeoutSec = 30,
    [switch]$KeepRunning
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Write-Step([string]$Message) {
    Write-Host "==> $Message"
}

function Resolve-ExistingPath([string]$PathValue, [string]$Label) {
    if (-not (Test-Path -LiteralPath $PathValue)) {
        throw "$Label not found at $PathValue"
    }
    return (Resolve-Path -LiteralPath $PathValue).Path
}

function Stop-StaleSmokeProcess([string]$HomePath) {
    $registryPath = Join-Path $HomePath "services\bridge.json"
    if (-not (Test-Path -LiteralPath $registryPath)) {
        return
    }

    try {
        $record = Get-Content -LiteralPath $registryPath | ConvertFrom-Json
        $bridgePid = $record.pid
        if ($bridgePid) {
            $proc = Get-Process -Id $bridgePid -ErrorAction SilentlyContinue
            if ($proc) {
                Write-Step "Stopping stale smoke process PID $bridgePid"
                Stop-Process -Id $bridgePid -Force
                Start-Sleep -Milliseconds 500
            }
        }
    }
    catch {
        Write-Warning "Failed to inspect stale smoke process from ${registryPath}: $_"
    }
}

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = (Resolve-Path (Join-Path $scriptDir "..\..")).Path

if (-not $StartupExe) {
    $StartupExe = Join-Path $repoRoot "musu-rs\target\debug\musu-startup.exe"
}
if (-not $MusuHome) {
    $MusuHome = Join-Path $repoRoot ".local-build\startup-smoke"
}

$StartupExe = Resolve-ExistingPath -PathValue $StartupExe -Label "musu-startup executable"

Write-Step "Preparing smoke-test MUSU_HOME"
if (Test-Path -LiteralPath $MusuHome) {
    Stop-StaleSmokeProcess -HomePath $MusuHome
    Remove-Item -LiteralPath $MusuHome -Recurse -Force
}
New-Item -ItemType Directory -Path $MusuHome -Force | Out-Null

$stdoutLog = Join-Path $MusuHome "startup.stdout.log"
$stderrLog = Join-Path $MusuHome "startup.stderr.log"

$psi = [System.Diagnostics.ProcessStartInfo]::new()
$psi.FileName = $StartupExe
$psi.WorkingDirectory = Split-Path -Parent $StartupExe
$psi.UseShellExecute = $false
$psi.RedirectStandardOutput = $true
$psi.RedirectStandardError = $true
$psi.Environment["MUSU_HOME"] = $MusuHome
$psi.Environment["BRIDGE_HOST"] = "127.0.0.1"
$psi.Environment["BRIDGE_PORT"] = "0"
$psi.Environment["MUSU_BRIDGE_LOCALHOST_AUTH"] = "0"

$proc = [System.Diagnostics.Process]::new()
$proc.StartInfo = $psi

Write-Step "Launching packaged startup binary"
if (-not $proc.Start()) {
    throw "Failed to start $StartupExe"
}

$stdoutTask = $proc.StandardOutput.ReadToEndAsync()
$stderrTask = $proc.StandardError.ReadToEndAsync()

$registryPath = Join-Path $MusuHome "services\bridge.json"
$startupMarkerPath = Join-Path $MusuHome "services\startup-marker.json"
$bridgeEnvPath = Join-Path $MusuHome "bridge.env"
$deadline = (Get-Date).AddSeconds($TimeoutSec)
$health = $null
$addr = $null
$nodeStatus = $null

try {
    while ((Get-Date) -lt $deadline) {
        if ($proc.HasExited) {
            throw "musu-startup exited early with code $($proc.ExitCode)"
        }

        if (Test-Path -LiteralPath $registryPath) {
            $record = Get-Content -LiteralPath $registryPath | ConvertFrom-Json
            $addr = [string]$record.addr
            if ($addr) {
                $loopbackAddr = $addr `
                    -replace '^0\.0\.0\.0:', '127.0.0.1:' `
                    -replace '^\[::\]:', '127.0.0.1:' `
                    -replace '^:::', '127.0.0.1:'
                try {
                    $health = Invoke-WebRequest -Uri ("http://{0}/health" -f $loopbackAddr) -UseBasicParsing -TimeoutSec 2
                    if ($health.StatusCode -eq 200) {
                        break
                    }
                }
                catch {
                    Start-Sleep -Milliseconds 500
                    continue
                }
            }
        }

        Start-Sleep -Milliseconds 500
    }

    if (-not $health -or $health.StatusCode -ne 200) {
        throw "Packaged startup smoke did not reach healthy bridge within ${TimeoutSec}s"
    }

    if (-not (Test-Path -LiteralPath $bridgeEnvPath)) {
        throw "Packaged startup smoke did not create bridge.env"
    }
    if (-not (Test-Path -LiteralPath $startupMarkerPath)) {
        throw "Packaged startup smoke did not create services\\startup-marker.json"
    }
    $startupMarker = Get-Content -LiteralPath $startupMarkerPath | ConvertFrom-Json
    if ([string]$startupMarker.stage -ne "launching") {
        throw "Unexpected startup marker stage during running smoke: $($startupMarker.stage)"
    }
    $bridgeEnv = Get-Content -LiteralPath $bridgeEnvPath -Raw
    if ($bridgeEnv -notmatch 'MUSU_BRIDGE_TOKEN=([0-9a-fA-F]{64})') {
        throw "bridge.env does not contain a 64-hex MUSU_BRIDGE_TOKEN"
    }

    $nodeStatus = Invoke-WebRequest -Uri ("http://{0}/api/fleet/node-status" -f $addr) -UseBasicParsing -TimeoutSec 3
    if ($nodeStatus.StatusCode -ne 200) {
        throw "Packaged startup smoke could not fetch /api/fleet/node-status"
    }
    $nodeStatusJson = $nodeStatus.Content | ConvertFrom-Json
    if ([string]$nodeStatusJson.addr -ne $addr) {
        throw "Node status addr mismatch: expected $addr, got $($nodeStatusJson.addr)"
    }

    Write-Step "Packaged startup smoke passed"
    [pscustomobject]@{
        MusuHome       = $MusuHome
        StartupExe     = $StartupExe
        Pid            = $proc.Id
        BridgeAddr     = $addr
        HealthCode     = $health.StatusCode
        NodeStatusAddr = [string]$nodeStatusJson.addr
        StartupStage   = [string]$startupMarker.stage
        TokenBootstrapped = $true
    } | Format-List
}
finally {
    if ($KeepRunning) {
        Write-Step "Leaving packaged startup process running"
    }
    else {
        if (-not $proc.HasExited) {
            Write-Step "Stopping packaged startup process"
            $proc.Kill()
            $proc.WaitForExit()
        }

        $stdoutTask.Wait()
        $stderrTask.Wait()
        $stdoutTask.Result | Set-Content -LiteralPath $stdoutLog
        $stderrTask.Result | Set-Content -LiteralPath $stderrLog
    }
}
