# Phase 2 — Bridge restart wrapper (2026-05-13)

> Master plan §Phase 2. TODO D 의 settlement option 3.
>
> 목표: admin 없이 bridge 의 새 코드 reload 가능한 1 명령 wrapper.

## 배경

`musu-bridge` 가 Scheduled Task (LogonType=Interactive) 로 logon 시 자동 시작.
새 코드를 reload 하려면 process 죽이고 다시 띄워야 하는데, 현재 옵션들:

| 방법 | admin? | 동작 | 한계 |
|---|---|---|---|
| `Stop-ScheduledTask musu-bridge` | no | 0.04s 만에 exit 0 | child process 안 죽음 |
| `taskkill /F /PID <pid>` | yes | process 종료 | Interactive session 권한 |
| `Unregister + Register` | no | 다음 logon 까지 대기 | restart 즉시 안 됨 |
| `logoff/logon` | no | 모든 게 재시작 | 다른 작업까지 영향 |

Phase 3 settlement 의 option 3 = **Stop-ScheduledTask → 짧게 대기 → 살아있으면
`taskkill /F` 시도 → admin 필요하면 안내** + `Start-ScheduledTask` 로 재기동.

대부분 케이스에서:
- bridge child process 가 운 좋게 Stop-ScheduledTask 의 graceful stop 신호를
  잡고 죽는 경우 → admin 불필요로 끝
- 못 잡으면 taskkill 시도 → 같은 user session 의 process 라 `taskkill` 이
  admin 없이도 SOMETIMES 작동 (실제로 같은 logon session 일 때)
- 그것도 안 되면 사용자에게 안내

## 설계

### `scripts/restart-bridge.ps1` 신규

```powershell
# Restart the musu-bridge service without re-logging-on.
# Tries graceful Stop-ScheduledTask first, falls back to taskkill if the
# bridge child process refuses to die. Both work without admin in most
# cases; if taskkill fails the user is told to log off / log on.

[CmdletBinding()]
param(
    [int]$HealthTimeoutSec = 15,
    [int]$KillGraceSec = 3
)

$ErrorActionPreference = "Stop"

function Get-BridgePid {
    # Find the python.exe (or pythonw.exe) whose command line owns
    # `-m server` under the bridge venv. Returns $null if not running.
    $procs = Get-CimInstance Win32_Process -Filter "Name='python.exe' OR Name='pythonw.exe'"
    foreach ($p in $procs) {
        if ($p.CommandLine -match 'musu-bridge.*\\\.venv\\Scripts\\python\.exe.* -m server' -or
            $p.CommandLine -match '\\musu-bridge\\.*python\.exe.*server') {
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
    Write-Host "[restart] child process PID $pidLeft survived Stop-ScheduledTask, trying taskkill..."
    & taskkill /F /PID $pidLeft 2>&1 | Out-Host
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[restart] taskkill failed (likely needs admin)." -ForegroundColor Yellow
        Write-Host "         Two workarounds without admin:"
        Write-Host "         1. log off / log on (Scheduled Task restarts with new code)"
        Write-Host "         2. Unregister-ScheduledTask musu-bridge -Confirm:`$false; install.ps1 -Service -Start"
        exit 1
    }
    Start-Sleep -Seconds 1
}

Write-Host "[restart] starting scheduled task..."
Start-ScheduledTask -TaskName "musu-bridge"

# Poll /health until 200 or timeout.
$deadline = (Get-Date).AddSeconds($HealthTimeoutSec)
while ((Get-Date) -lt $deadline) {
    if (Probe-Health) {
        Write-Host "[restart] OK  bridge alive (/health 200)" -ForegroundColor Green
        exit 0
    }
    Start-Sleep -Milliseconds 500
}

Write-Host "[restart] X   bridge did not return /health 200 within $HealthTimeoutSec seconds" -ForegroundColor Red
exit 2
```

### `install.ps1` final 안내 한 줄

`"Start the bridge: ..."` 출력 옆에 추가:

```powershell
Write-Host "  Reload bridge after a code change:"
Write-Host "    powershell -ExecutionPolicy Bypass -File scripts\restart-bridge.ps1"
```

### README / INSTALL.md 한 줄

bridge 운영 섹션에 추가:

```
브리지 새 코드 reload (admin 불필요):
  powershell -ExecutionPolicy Bypass -File scripts\restart-bridge.ps1
```

## 검증

1. 코드 변경 시뮬레이션: `touch musu-bridge/server.py` 으로 mtime 만 갱신.
2. `restart-bridge.ps1` 실행 → exit 0 + bridge alive 확인.
3. 두 가지 path 확인:
   - graceful path: Stop-ScheduledTask 만으로 child 가 죽는 경우 (script 의 `pidLeft = $null` branch).
   - taskkill path: 일부러 long-running task 만들어 graceful 실패시키고 taskkill 작동 확인.
4. taskkill 도 실패 시 메시지 출력 + exit 1 (manual 검증).

## 위험

- `Get-BridgePid` 의 regex 가 PID 못 찾으면 graceful kill 가능 여부 판단 못 함.
  fallback: regex 추가 패턴 (e.g. `BridgeDir` 환경 변수 매칭).
- `taskkill /F` 가 admin 없이 작동 안 하는 케이스: 실제로 어떤 user session 에
  속해 있느냐에 따름. 안내 메시지가 정직하게 "권한 부족" 임을 알리도록.
- Phase 1 fix 이후로 bridge venv 안 건드렸음 → restart 후에도 같은 venv 사용해야.
  script 가 venv path 를 가정하지 않음 (Scheduled Task 가 알아서).

## Status

- [ ] scripts/restart-bridge.ps1 작성
- [ ] install.ps1 final 메시지 한 줄 추가
- [ ] README.md / INSTALL.md 한 줄 추가
- [ ] 실제로 한 번 reload 시연 → /health 200 확인
- [ ] commit
