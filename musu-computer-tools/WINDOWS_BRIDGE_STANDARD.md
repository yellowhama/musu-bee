# Windows Bridge Standard

## 목적

이 문서는 `musu-computer-tools`에서 "현재 Codex 세션이 직접 Windows 프로세스를 못 띄우는 경우"의 표준 대응을 고정한다.

## 실행 모드

### 1. direct

조건:

- direct `.exe` 호출 또는 `winexec.sh` bridge가 살아 있음

사용:

- `scripts/windows-bridge/run-musu-port-smoke.sh`

의미:

- WSL에서 바로 Windows PowerShell을 호출한다.

### 2. helper

조건:

- direct interop는 죽어 있음
- Windows helper heartbeat가 살아 있음

사용:

- Windows에서 먼저 `scripts/windows-bridge/start-helper.cmd` 실행
- 이후 WSL에서 `scripts/windows-bridge/run-musu-port-smoke.sh` 실행

의미:

- WSL은 queue file만 쓴다.
- 실제 Windows PowerShell 실행은 resident helper가 담당한다.

helper lifecycle command:

- start:
  - `scripts/windows-bridge/start-helper.cmd`
- install:
  - `scripts/windows-bridge/install-helper.cmd`
- status:
  - Windows: `scripts/windows-bridge/status-helper.cmd`
  - WSL: `scripts/windows-bridge/status-helper.sh`
- stop:
  - `scripts/windows-bridge/stop-helper.cmd`
- restart:
  - `scripts/windows-bridge/restart-helper.cmd`
- uninstall:
  - `scripts/windows-bridge/uninstall-helper.cmd`

주의:

- `*.cmd` wrapper는 Explorer 또는 `Start-Process`로 실행하는 것을 기본 경로로 본다.
- raw `cmd /C <UNC-path-to-cmd>`는 CMD의 UNC working directory 제약 때문에 실패할 수 있다.
- `stop/restart/uninstall` wrapper는 helper queue self-termination을 피하기 위해 detached launch로 동작한다.

### 3. manual

조건:

- direct interop도 죽어 있음
- helper도 아직 안 떠 있음

사용:

- Windows에서 `scripts/windows-bridge/run-musu-port-smoke.cmd` 직접 실행

의미:

- 최후 fallback이다.
- 복붙 대신 one-click launcher를 쓴다.

## 권장 순서

1. `scripts/windows-bridge/probe-interop.sh`
2. direct 가능하면 action별 WSL runner 실행
  - 예: `scripts/windows-bridge/run-musu-port-smoke.sh`
  - 예: `scripts/windows-bridge/run-musu-port-native-smoke.sh --exe-path ...`
  - 공통 runner는 direct interop 실패 시 기본 3회 재시도 후 helper/manual로 fallback
3. direct 불가 + helper offline이면 Windows에서 `scripts/windows-bridge/start-helper.cmd`
4. helper 기동 후 다시 action별 WSL runner 실행
5. helper를 못 띄우는 상황이면 action별 Windows one-shot launcher 실행

## Runtime Artifact 위치

- runtime root: `.windows-bridge/`
- queue: `.windows-bridge/queue/`
- in-flight: `.windows-bridge/processing/`
- results: `.windows-bridge/results/`
- logs: `.windows-bridge/logs/`
- helper state: `.windows-bridge/state/`

## 진단 명령

- quick mode selection:
  - `scripts/windows-bridge/probe-interop.sh`
- helper runtime status:
  - `scripts/windows-bridge/status-helper.sh`
  - `status-helper.sh`는 runtime state와 cached install state를 함께 보여준다.
- full interop evidence:
  - `scripts/windows-bridge/diagnose-interop.sh`

## Action Catalog

- catalog 문서:
  - `WINDOWS_ACTION_CATALOG.md`
- browser catalog 문서:
  - `WINDOWS_BROWSER_ACTION_CATALOG.md`
- browser/CDP standard:
  - `WINDOWS_BROWSER_CDP_STANDARD.md`
- browser inventory:
  - `BROWSER_SPLIT_HOST_INVENTORY.md`
- 현재 catalog action:
  - `musu-port-smoke`
  - `musu-port-native-smoke`
  - `helper-selftest`

failure class 기준:

- `direct_exec_ok`
  - direct `.exe` 호출이 바로 성공
- `winexec_bridge_ok`
  - direct `.exe`는 막혀 있지만 `winexec` bridge는 성공
- `wsl_interop_callback_timeout`
  - `accept4 failed 110`류 timeout
- `wsl_vsock_bind_failure`
  - `UtilBindVsockAnyPort` / `socket failed 1`
- `binfmt_or_init_visibility_failure`
  - `cannot execute: required file not found`
- `unknown_interop_failure`
  - 위 분류에 안 들어가는 나머지

## Browser Boundary

browser-like action은 process-bound Windows bridge와 분리한다.

- WSL probe:
  - `scripts/windows-bridge/probe-browser-cdp.sh`
- standard:
  - `WINDOWS_BROWSER_CDP_STANDARD.md`
- browser catalog:
  - `WINDOWS_BROWSER_ACTION_CATALOG.md`
- launch runbook:
  - `WINDOWS_BROWSER_LAUNCH_RUNBOOK.md`
- bootstrap runner:
  - `scripts/windows-bridge/run-browser-cdp-bootstrap.sh`

운영 순서:

1. browser task는 먼저 CDP endpoint reachability를 probe한다.
2. endpoint가 살아 있으면 network-bound browser action으로 처리한다.
3. endpoint가 없을 때만 Windows-side launch/bootstrap 문제로 본다.
4. bootstrap이 필요하면 runbook 또는 `run-browser-cdp-bootstrap.sh`를 사용한다.

## 현재 세션 기준 판단

현재 handoff 기준으로는 direct interop가 신뢰할 수 없다.

관측된 대표 증상:

- `/mnt/c/Windows/System32/cmd.exe: cannot execute: required file not found`
- `UtilAcceptVsock...`
- `UtilBindVsockAnyPort...`

따라서 이 저장소의 기본 추천은 아래와 같다.

- 단발 smoke: Windows one-shot launcher
- 반복 실행: Windows resident helper + WSL queue

## 2026-04-02 검증 상태

- direct Windows smoke:
  - 성공
  - `winexec.sh + powershell.exe` 경로로 실제 `musu-port` Windows native smoke 완료
- helper queue fallback:
  - 성공
  - `windows-bridge-helper.ps1`가 `cmd_file` request를 처리하고 `run-musu-port-smoke.sh --force-helper` 경로로 실제 smoke 완료
- `.cmd` launcher UX:
  - 성공
  - `start-helper.cmd` 재기동 후 helper heartbeat / queue self-test 확인
  - `run-musu-port-smoke.cmd`를 `Start-Process -Wait`로 실행해 종료 코드 `0` 확인
- action runner expansion:
  - 구현 + live 검증 완료
  - `run-windows-action.sh` direct self-test 성공
  - `windows-bridge-helper.ps1 -RunOnce -SingleRequestPath`로 named parameter forwarding 수정 검증
  - `run-musu-port-smoke.sh --force-direct` 회귀 통과
  - `run-musu-port-native-smoke.sh --force-direct --exe-path ...` 성공
  - 참고: `-RunOnce` 검증 뒤에는 heartbeat가 stale로 남을 수 있으므로 helper mode 재사용 전 `start-helper.cmd`를 다시 실행
  - 공통 runner에 direct retry/fallback 로직 추가
- helper lifecycle productization:
  - 구현 + live 검증 완료
  - `helper-lifecycle.ps1` 추가
  - `status-helper.cmd`, `stop-helper.cmd`, `restart-helper.cmd`, `status-helper.sh` 추가
  - stale heartbeat 상태에서 `restart`로 `online` 복구 확인
  - `stop` 후 `offline`, `start` 후 `online` 상태 전이 확인
- helper service install:
  - 구현 + live 검증 완료
  - `helper-lifecycle.ps1`가 `install/uninstall`과 install-state cache를 함께 관리
  - `install-helper.cmd`, `uninstall-helper.cmd` 추가
  - `schtasks` create가 access denied일 때 Startup folder fallback으로 자동 전환
  - `status-helper.sh`에서 `install_state=startup-folder` 실측 확인
  - `status-helper.cmd`를 helper queue `cmd_file` 경로로 실행해 combined status JSON 확인
  - `uninstall-helper.cmd` 실행 후 `install_state=not-installed`, `runtime_state=offline` 확인
- interop diagnostics:
  - 구현 + live 검증 완료
  - `diagnose-interop.sh` 추가
  - 현재 세션 evidence:
    - `/init` 없음
    - `/var/lib/snapd/hostfs/init` 존재
    - direct `cmd.exe` 실패
    - `winexec` bridge 성공
    - helper `online`
    - failure class `winexec_bridge_ok`
- action catalog expansion:
  - 구현 + live 검증 완료
  - `WINDOWS_ACTION_CATALOG.md` 추가
  - `run-helper-selftest.sh`, `run-helper-selftest.cmd` 추가
  - smoke 외 action을 generic runner 위에 추가
- split-host browser bootstrap:
  - 구현 + helper dry-run 검증 완료
  - `launch-browser-cdp.ps1`, `run-browser-cdp-bootstrap.sh`, `run-browser-cdp-bootstrap.cmd` 추가
  - helper queue 경유 `run-browser-cdp-bootstrap.sh --force-helper --dry-run` 성공
  - Edge executable resolution, dedicated debugging profile path, `127.0.0.1:9222` endpoint URL 확인
- sandbox 내부 direct `.exe`:
  - 여전히 실패
  - 따라서 제품 운영 기준 fallback 문서는 계속 필요

## 관련 파일

- handoff: `WINDOWS_INTEROP_HANDOFF_2026-04-01.md`
- backlog: `TODO.md`
- detailed plan: `plans/01_windows_bridge_execution_plan.md`
- expansion plan: `plans/02_windows_bridge_action_expansion.md`
- helper lifecycle plan: `plans/03_helper_lifecycle_productization.md`
- diagnostics plan: `plans/04_wsl_interop_diagnostics_and_evidence_pack.md`
- action catalog plan: `plans/05_windows_action_catalog_expansion.md`
- OpenClaw pattern adoption plan: `plans/07_openclaw_pattern_adoption_and_windows_host_split.md`
- helper service install plan: `plans/08_windows_helper_service_install.md`
- Windows spawn policy alignment plan: `plans/09_windows_spawn_policy_alignment.md`
- split-host browser boundary plan: `plans/10_split_host_browser_boundary.md`
- generic runner: `scripts/windows-bridge/run-windows-action.sh`
- helper launcher: `scripts/windows-bridge/start-helper.cmd`
- helper install: `scripts/windows-bridge/install-helper.cmd`
- helper status (Windows): `scripts/windows-bridge/status-helper.cmd`
- helper status (WSL): `scripts/windows-bridge/status-helper.sh`
- helper stop: `scripts/windows-bridge/stop-helper.cmd`
- helper restart: `scripts/windows-bridge/restart-helper.cmd`
- helper uninstall: `scripts/windows-bridge/uninstall-helper.cmd`
- interop diagnostics: `scripts/windows-bridge/diagnose-interop.sh`
- helper selftest runner: `scripts/windows-bridge/run-helper-selftest.sh`
- helper selftest launcher: `scripts/windows-bridge/run-helper-selftest.cmd`
- WSL runner: `scripts/windows-bridge/run-musu-port-smoke.sh`
