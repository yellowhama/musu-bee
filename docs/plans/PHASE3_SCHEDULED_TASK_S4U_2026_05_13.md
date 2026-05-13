# Phase 3 — Scheduled Task LogonType S4U (2026-05-13)

> Master plan [BOUNDARY_MASTER_PLAN_2026_05_13.md](./BOUNDARY_MASTER_PLAN_2026_05_13.md) §Phase 3.

## 목표

`musu-bridge` Scheduled Task 의 LogonType 을 `Interactive` 에서 `S4U` 로 전환하여, admin 권한 없이 `Stop-ScheduledTask` / `Start-ScheduledTask` 가 정상 작동하도록.

## 배경

이번 세션 중 Sprint Contract write-side (v16.C) 작업하면서 새 endpoint 를 bridge 가 reload 하도록 restart 필요했으나:

```
PS> Stop-Process -Id 14328 -Force
Stop-Process: Cannot stop process "python (14328)" because of the following error: 액세스가 거부되었습니다.
```

`-LogonType Interactive` 가 만든 task 는 elevated 권한 없이 stop 불가. 결과: 새 코드를 bridge process 가 안 받음, HTTP smoke test 못 함.

## fix

`scripts/install.ps1` line 252:

```powershell
$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive
```

→ 

```powershell
$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType S4U
```

## S4U 가 무엇이고 trade-off

- **S4U** ("Service for User") — 사용자 token 으로 도는 process. 비밀번호 저장 안 함. **interactive desktop 접근 불가** (서비스만).
- **Interactive** — 사용자가 로그온 상태일 때만 자동 시작. interactive session 의 일부.

trade-off:
- ✅ Stop/Start 가 task owner (현재 사용자) 권한으로 가능 → admin elevation 불필요
- ✅ 비밀번호 저장 안 함 (보안)
- ❌ task 가 interactive desktop session 안 보임 (Task Manager 의 "Running" 컬럼이 다르게 보일 수 있음)
- ❌ Wake-on-LAN 같이 user logon 전에 시작해야 하는 시나리오엔 부적합 (현재 use case 아님)

musu-bridge 는 HTTP server (background process) 라 S4U 가 맞음.

## 단계

1. **install.ps1 변경** — `Interactive` → `S4U`. 한 줄.
2. **기존 task unregister + 재등록** — 이미 install 된 머신 (이 머신) 에서 새 LogonType 적용. install.ps1 의 line 247 (`Unregister-ScheduledTask -TaskName "musu-bridge" -Confirm:$false -ErrorAction SilentlyContinue`) 가 이미 idempotent 라 install.ps1 다시 돌리면 자동 처리.
3. **검증** — 새 task 등록 후 `Stop-ScheduledTask -TaskName musu-bridge` 가 admin 없이 작동, `Start-ScheduledTask` 도. health 200 다시.
4. **INSTALL.md update** — Windows troubleshooting 의 v16.A.2 section 에 S4U 설명 추가, 사용자가 왜 admin 없이 됐는지.

## 위험

- **S4U 가 일부 user account 에서 실패**: Microsoft account (vs local account) 에서 S4U 가 추가 권한 요구할 수 있음. 이 머신은 보이는 username 이 `empty` — local account. 일단 가능.
- **기존 task 재등록 시 bridge 잠시 down**: ~5초 gap. 사용자 영향 minor.
- **install.ps1 다시 돌리면 fresh install 처럼 보일 수 있음**: idempotent 하지만 user 가 본 인상이 달라짐. 단순 `Unregister + Register` 만 직접 수행하는 게 더 깔끔할 수도. 일단 install.ps1 가 idempotent 라 그걸 활용.

## 검증

- [ ] install.ps1 의 LogonType S4U
- [ ] 기존 task unregister
- [ ] 새 task 등록 (S4U)
- [ ] `Get-ScheduledTask musu-bridge | Get-ScheduledTaskInfo` 가 LastTaskResult 0
- [ ] `Stop-ScheduledTask -TaskName musu-bridge` exit 0
- [ ] `Start-ScheduledTask -TaskName musu-bridge` → 5s 후 health 200
- [ ] INSTALL.md 에 reasoning 추가
- [ ] commit

## Status — DEFERRED with findings

- [x] install.ps1 fix attempted — `-LogonType S4U` 적용 시도
- [x] task 재등록 시도 — **Register-ScheduledTask 자체가 `액세스가 거부되었습니다` (Access denied)**. 
- [x] revert — install.ps1 의 LogonType Interactive 유지, 주석으로 reasoning 기록
- [x] Stop-ScheduledTask 검증 — admin 없이 명령 반환은 됨 (0.04s), 다만 bridge child process 14328 은 살아있음 (graceful stop 시도하지만 강제 kill 못 함)
- [ ] INSTALL.md update — Phase 5 closure 와 묶음
- [ ] commit — install.ps1 주석 변경, plan doc 둘 다

## 결정적 발견

**S4U LogonType 등록 자체가 admin 권한 요구**:

> `New-ScheduledTaskPrincipal -LogonType S4U` 로 만든 principal 은 task 가 사용자 token 으로 도는 걸 의미하지만, **그 token 발급 자체** 가 "Replace a process level token" privilege 가 필요. 이 privilege 는 admin 만 가짐.

이건 master plan §3 의 §위험 §3 에서 "S4U 가 일부 user account 에서 실패" 로 예측했던 것. 정확히 그 시나리오 (local non-admin user `empty`).

**Stop-ScheduledTask 는 admin 없이 작동하지만 child process kill 은 못 함**:

- `Stop-ScheduledTask -TaskName musu-bridge` exit 0, 0.04s.
- 그러나 PID 14328 (bridge process) 가 그 후로도 살아있음.
- `LastTaskResult: 267011` 가 표시 — Task Scheduler 가 stop signal 보냈으나 process 가 응답 안 함 (uvicorn 의 SIGTERM 처리가 Windows console 환경에서 안 되는 듯).

## 실 영향

이번 세션 v16.C 작업 때 새 PUT endpoint 가 bridge process 에 reload 되도록 restart 필요했음. S4U 도 안 되고 Stop-ScheduledTask 도 graceful 종료 못 한다 = **새 코드 reload 가 admin 없이는 영구적으로 못 함**.

## 대안 (v17 후보)

다음 사이클 후보:

1. **bridge SIGHUP / HTTP reload endpoint**: server.py 가 `/api/admin/reload` 또는 OS signal 받아서 self-restart. admin 불필요.
2. **install.ps1 에 `--reinstall-task` flag**: admin 없이 unregister + register 가능 (이 세션에서 확인됨). re-install 한 번이면 다음 logon 시 새 코드.
3. **Stop-ScheduledTask 후 SIGKILL fallback**: Stop-ScheduledTask 가 1초 안에 process 안 죽으면 `taskkill /F` 호출. admin 필요하면 안내.
4. **scheduled task 대신 user service (sc.exe)**: registers a real Windows service. admin 필요한 install 단계 1번, 이후 stop/start 자유롭. 적절한 솔루션이지만 install.ps1 큰 변경.

## 다음

이번 사이클: Phase 4 (BOUNDARY doc) 에서 이 발견 명시 + 사용자 가이드 ("bridge restart 는 logoff/logon 또는 reinstall"). Phase 3 자체는 close.
