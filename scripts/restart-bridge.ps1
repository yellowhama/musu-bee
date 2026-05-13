# Restart musu-bridge without logging off / on or admin elevation.
#
# Tries Stop-ScheduledTask (always works without admin, but the python child
# may not exit), then taskkill /F as fallback (often works for processes in
# the same logon session). If both fail, prints the two known no-admin
# workarounds and exits 1.
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File scripts\restart-bridge.ps1
#   powershell -ExecutionPolicy Bypass -File scripts\restart-bridge.ps1 -HealthTimeoutSec 30

[CmdletBinding()]
param(
    [int]$HealthTimeoutSec = 15,
    [int]$KillGraceSec = 3
)

$ErrorActionPreference = "Stop"

function Get-BridgePid {
    $procs = Get-CimInstance Win32_Process -Filter "Name='python.exe' OR Name='pythonw.exe'" -ErrorAction SilentlyContinue
    foreach ($p in $procs) {
        if ($null -ne $p.CommandLine -and $p.CommandLine -match 'musu-bridge.*python\.exe.*-m\s+server') {
            return $p.ProcessId
        }
    }
    return $null
}

function Probe-Health {
    try {
        $r = Invoke-WebRequest -Uri "http://127.0.0.1:8070/health" -UseBasicParsing -TimeoutSec 2
        return $r.StatusCode -eq 200
    } catch {
        return $false
    }
}

Write-Host "[restart] stopping musu-bridge scheduled task..."
Stop-ScheduledTask -TaskName "musu-bridge" -ErrorAction SilentlyContinue
Start-Sleep -Seconds $KillGraceSec

$pidLeft = Get-BridgePid
if ($pidLeft) {
    Write-Host "[restart] child process PID $pidLeft survived, trying taskkill /F..."
    & taskkill /F /PID $pidLeft 2>&1 | Out-Host
    if ($LASTEXITCODE -ne 0) {
        Write-Host ""
        Write-Host "[restart] taskkill failed — bridge process owns a privilege level this session can't kill." -ForegroundColor Yellow
        Write-Host "          No-admin workarounds:" -ForegroundColor Yellow
        Write-Host "            1. log off / log on (the Scheduled Task picks up new code on relogin)"
        Write-Host "            2. Unregister-ScheduledTask musu-bridge -Confirm:`$false"
        Write-Host "               powershell -ExecutionPolicy Bypass -File scripts\install.ps1 -Service -Start"
        exit 1
    }
    Start-Sleep -Seconds 1
}

Write-Host "[restart] starting scheduled task..."
Start-ScheduledTask -TaskName "musu-bridge"

$deadline = (Get-Date).AddSeconds($HealthTimeoutSec)
while ((Get-Date) -lt $deadline) {
    if (Probe-Health) {
        Write-Host "[restart] OK  bridge alive (/health 200)" -ForegroundColor Green
        exit 0
    }
    Start-Sleep -Milliseconds 500
}

Write-Host "[restart] X   bridge did not return /health 200 within $HealthTimeoutSec seconds" -ForegroundColor Red
Write-Host "           Check Task Scheduler history for 'musu-bridge'."
exit 2
