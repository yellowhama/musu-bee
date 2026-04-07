# Windows Interop Handoff (2026-04-01)

## 목적

이 문서는 `musu-computer-tools` 기준으로 현재 세션의 Windows/WSL interop 상태, 왜 Codex가 직접 Windows 프로세스를 못 띄우는지, 그리고 다음 세션에서 이어서 해야 할 일을 짧게 넘기기 위한 handoff 메모다.

## 현재 상태

- `musu-port`의 Linux/WSL 쪽 구현과 검증은 사실상 완료 상태다.
- real MCP smoke도 완료됐다.
  - script: `/home/hugh51/musu-functions/musu-port/scripts/real-mcp-smoke.sh`
- Windows native smoke는 자동 launcher까지 만들어 둔 상태다.
  - `/home/hugh51/musu-functions/musu-port/scripts/windows-native-smoke.ps1`
  - `/home/hugh51/musu-functions/musu-port/scripts/run-windows-smoke.ps1`
  - `/home/hugh51/musu-functions/musu-port/scripts/run-windows-smoke.cmd`
- 2026-04-02 기준 direct Windows smoke와 helper fallback smoke까지 둘 다 성공했다.

## 2026-04-02 최종 검증 결과

- direct Windows smoke:
  - 성공
  - `winexec.sh + powershell.exe` 경로로 `run-musu-port-smoke.ps1` / `run-windows-smoke.ps1` / `windows-native-smoke.ps1` 전체 실행 확인
- helper fallback smoke:
  - 성공
  - `windows-bridge-helper.ps1` + queue/result contract + `run-musu-port-smoke.sh --force-helper` 경로 확인
- `.cmd` launcher UX:
  - 성공
  - `start-helper.cmd`는 새 heartbeat PID 갱신과 helper self-test 성공으로 확인
  - `run-musu-port-smoke.cmd`는 `Start-Process -Wait` 종료 코드 `0`으로 확인
- action runner expansion:
  - 성공
  - `run-windows-action.sh` direct self-test 성공
  - `windows-bridge-helper.ps1 -RunOnce -SingleRequestPath`로 `powershell_file` named parameter forwarding 수정 검증
  - `run-musu-port-smoke.sh --force-direct` 회귀 통과
  - `run-musu-port-native-smoke.sh --force-direct --exe-path ...` 성공
  - 참고: one-shot helper 검증은 resident helper를 유지하지 않으므로 helper mode가 필요하면 `start-helper.cmd`를 다시 실행
  - 공통 runner는 direct interop flaky 상황에서 기본 3회 재시도 후 helper/manual fallback
- helper lifecycle productization:
  - 성공
  - `helper-lifecycle.ps1` + `start/status/stop/restart` wrapper 추가
  - WSL `status-helper.sh` 추가
  - stale heartbeat 상태를 `status`로 감지하고 `restart`로 `online` 복구 확인
  - `stop` 후 `offline`, `start` 후 `online` 검증
  - `status-helper.cmd`는 `Start-Process` 경로로 종료 코드 `0` 확인
  - 참고: raw `cmd /C <UNC-path-to-cmd>`는 CMD의 UNC working directory 제약으로 실패 가능
- interop diagnostics:
  - 성공
  - `diagnose-interop.sh` 추가
  - 현재 세션 evidence:
    - `/init` 없음
    - `/var/lib/snapd/hostfs/init` 존재
    - direct `cmd.exe` 실패
    - `winexec` bridge 성공
    - helper `online`
    - failure class `winexec_bridge_ok`
- action catalog expansion:
  - 성공
  - `WINDOWS_ACTION_CATALOG.md` 추가
  - `run-helper-selftest.sh`, `run-helper-selftest.cmd` 추가
  - smoke 외 action을 generic runner 위에 추가
- helper service install:
  - 성공
  - `helper-lifecycle.ps1`가 `install/uninstall/status`와 install-state cache를 같이 관리
  - `schtasks` create는 current user 환경에서 `access denied`였고, Startup folder fallback으로 자동 전환됨
  - `status-helper.sh`에서 `install_state=startup-folder` + `runtime_state=online` 확인
  - `status-helper.cmd`는 helper queue `cmd_file` 경로에서 종료 코드 `0` 확인
  - `uninstall-helper.cmd` 실행 뒤 `install_state=not-installed`, `runtime_state=offline` 확인
  - `stop/restart/uninstall` wrapper는 helper queue self-termination을 피하기 위해 detached launch로 전환
  - 최종 복구:
    - Windows PowerShell에서 `helper-lifecycle.ps1 -Action install` 수동 실행
    - 현재 상태는 다시 `install_state=startup-folder`, `runtime_state=online`
    - `run-helper-selftest.sh --force-helper` 재통과
- Windows spawn policy alignment:
  - 구현
  - `run-windows-action.sh`가 direct/helper/manual resolution을 audit JSONL에 남김
  - direct는 `.ps1`만 허용하고 `.cmd/.bat` direct 시도는 local preflight에서 거부
  - helper request/result에 `execution_surface`, `resolution_reason`, `entrypoint_type` metadata 추가
- split-host browser boundary:
  - 2차 구현
  - `probe-browser-cdp.sh` 추가
  - `run-browser-cdp-bootstrap.sh`, `run-browser-cdp-bootstrap.cmd`, `launch-browser-cdp.ps1` 추가
  - `WINDOWS_BROWSER_CDP_STANDARD.md`, `WINDOWS_BROWSER_ACTION_CATALOG.md`, `BROWSER_SPLIT_HOST_INVENTORY.md` 추가
  - `WINDOWS_BROWSER_LAUNCH_RUNBOOK.md` 추가
  - browser task를 process-bound bridge가 아니라 CDP endpoint probe-first 흐름으로 분리
  - probe 검증:
    - `127.0.0.1:9222` unreachable 케이스 확인
    - mock CDP `127.0.0.1:29222` reachable 케이스 확인
  - bootstrap dry-run 검증:
    - helper queue 경유 `run-browser-cdp-bootstrap.sh --force-helper --dry-run` 성공
    - browser executable resolution / dedicated profile path / endpoint URL JSON 확인
- Linux verification:
  - `./scripts/linux-rust-env.sh cargo check` 재통과
  - `./scripts/linux-rust-env.sh cargo test -p musu-port-core discovery::windows` 재통과

핵심적으로 닫힌 항목:

- DevShell install root 계산 버그 수정
- `seed-services.json` 배열 직렬화 버그 수정
- PowerShell 5.1 `Process.Kill($true)` 호환성 수정
- Windows discovery provider를 PID별 `tasklist` 호출에서 batch `tasklist` 1회 조회로 최적화
- smoke harness timeout / step logging 보강
- Windows helper queue를 `cmd_file`까지 확장하고 large output deadlock 제거

## 후속 구현 산출물 (2026-04-02)

이 handoff 이후 `musu-computer-tools` 쪽에 추가된 후속 artefact:

- backlog:
  - `TODO.md`
- detailed plan:
  - `plans/01_windows_bridge_execution_plan.md`
- action expansion plan:
  - `plans/02_windows_bridge_action_expansion.md`
- helper lifecycle plan:
  - `plans/03_helper_lifecycle_productization.md`
- diagnostics plan:
  - `plans/04_wsl_interop_diagnostics_and_evidence_pack.md`
- action catalog plan:
  - `plans/05_windows_action_catalog_expansion.md`
- OpenClaw pattern adoption plan:
  - `plans/07_openclaw_pattern_adoption_and_windows_host_split.md`
- helper service install plan:
  - `plans/08_windows_helper_service_install.md`
- Windows spawn policy alignment plan:
  - `plans/09_windows_spawn_policy_alignment.md`
- split-host browser boundary plan:
  - `plans/10_split_host_browser_boundary.md`
- browser CDP standard:
  - `WINDOWS_BROWSER_CDP_STANDARD.md`
- browser action catalog:
  - `WINDOWS_BROWSER_ACTION_CATALOG.md`
- browser inventory:
  - `BROWSER_SPLIT_HOST_INVENTORY.md`
- browser launch runbook:
  - `WINDOWS_BROWSER_LAUNCH_RUNBOOK.md`
- standard runbook:
  - `WINDOWS_BRIDGE_STANDARD.md`
- action catalog:
  - `WINDOWS_ACTION_CATALOG.md`
- generic WSL runner:
  - `scripts/windows-bridge/run-windows-action.sh`
- browser bootstrap runner:
  - `scripts/windows-bridge/run-browser-cdp-bootstrap.sh`
- browser bootstrap launcher:
  - `scripts/windows-bridge/run-browser-cdp-bootstrap.cmd`
- browser bootstrap PowerShell:
  - `scripts/windows-bridge/launch-browser-cdp.ps1`
- WSL runner:
  - `scripts/windows-bridge/run-musu-port-smoke.sh`
- WSL native smoke runner:
  - `scripts/windows-bridge/run-musu-port-native-smoke.sh`
- Windows helper launcher:
  - `scripts/windows-bridge/start-helper.cmd`
- Windows helper install:
  - `scripts/windows-bridge/install-helper.cmd`
- Windows helper status:
  - `scripts/windows-bridge/status-helper.cmd`
- Windows helper stop:
  - `scripts/windows-bridge/stop-helper.cmd`
- Windows helper restart:
  - `scripts/windows-bridge/restart-helper.cmd`
- Windows helper uninstall:
  - `scripts/windows-bridge/uninstall-helper.cmd`
- WSL helper status:
  - `scripts/windows-bridge/status-helper.sh`
- WSL interop diagnostics:
  - `scripts/windows-bridge/diagnose-interop.sh`
- WSL helper selftest:
  - `scripts/windows-bridge/run-helper-selftest.sh`
- Windows helper selftest:
  - `scripts/windows-bridge/run-helper-selftest.cmd`
- Windows one-shot launcher:
  - `scripts/windows-bridge/run-musu-port-smoke.cmd`
- Windows native smoke launcher:
  - `scripts/windows-bridge/run-musu-port-native-smoke.cmd`

## 현재 세션 제약

지금 세션에서 Codex가 직접 Windows 프로세스를 띄우는 것은 막혀 있다.

관측된 증상:

- `WSL` interop callback timeout:
  - `UtilAcceptVsock:271: accept4 failed 110`
- direct Windows binary call 실패:
  - `/mnt/c/Windows/System32/cmd.exe: cannot execute: required file not found`

즉, 이 세션의 Codex는 `WSL 안의 snap 세션`에서 돌고 있고, 이 경계에서 Windows interop handshake가 정상적으로 연결되지 않는다.

정리:

- 일반 사용자의 Windows PowerShell / Developer PowerShell에서는 가능할 수 있다.
- 지금 Codex 세션에서는 안 된다.
- 그래서 사람이 직접 긴 명령을 복붙하게 만들지 않도록, Windows 쪽 원클릭 launcher를 따로 만든 상태다.

## 왜 느리거나 불안정한가

핵심 원인은 `musu-port`가 느린 게 아니라 `WSL <-> Windows interop 경계`다.

- `.exe` 실행은 단순 파일 실행이 아니라 interop session leader / socket / callback 경로를 거친다.
- 현재 세션에서는 이 callback이 timeout 나면서 실패한다.
- 추가로 cross-OS filesystem 경계(`\\wsl.localhost`, `/mnt/c`)는 빌드와 프로세스 spawn 모두에서 비용이 크다.
- 따라서 AI-native tooling은 "공유 코어 + Windows native bridge + WSL native bridge" 구조가 맞고, 한 세션이 모든 OS 프로세스를 직접 띄우는 구조는 불안정하다.

## 이미 만들어 둔 우회/자동화

### 1. `musu-port` Windows smoke launcher

- PowerShell:
  - `/home/hugh51/musu-functions/musu-port/scripts/run-windows-smoke.ps1`
- CMD wrapper:
  - `/home/hugh51/musu-functions/musu-port/scripts/run-windows-smoke.cmd`

이 launcher가 하는 일:

- Visual Studio DevShell 진입
- Windows용 `cargo build -p musu-portd`
- Windows native smoke 실행

### 2. `musu-port` real MCP smoke

- `/home/hugh51/musu-functions/musu-port/scripts/real-mcp-smoke.sh`

이건 이미 WSL 쪽에서 통과했다.

## 현재 남은 문제

구현/검증 기준 핵심 blocker는 닫혔다.

bridge 확장도 첫 슬라이스는 완료됐다:

- generic action runner로 공통 분기 로직을 고정
- `musu-port` Windows native smoke까지 같은 bridge 패턴으로 실행 가능

남은 건 더 넓은 제품 확장뿐이다:

- interop diagnostic/evidence pack 추가
- 필요하면 helper queue protocol을 다른 Windows action에도 계속 확대

## 다음 세션 TODO

### Priority 1. spec/index sync

- spec/doc/code sync 루틴 스크립트화
- ignore pattern/runbook 정리

### Priority 2. bridge 확장

- `musu-port` 외 다른 Windows action도 같은 queue/result contract로 옮길지 판단
- 필요하면 helper request kind를 더 일반화

## 추천 다음 액션

다음 세션 시작 시 가장 먼저 할 일:

1. 이 문서와 `WINDOWS_BRIDGE_STANDARD.md` 기준으로 현재 bridge 구조 재확인
2. spec/doc/code sync 루틴을 먼저 고정
3. 그 다음 다른 Windows tool에도 같은 helper queue 패턴을 적용할지 결정

## 관련 경로

- `musu-port` README:
  - `/home/hugh51/musu-functions/musu-port/README.md`
- `musu-port` validation:
  - `/home/hugh51/musu-functions/musu-port/MANUAL_VALIDATION_CHECKLIST.md`
- `musu-port` TODO:
  - `/home/hugh51/musu-functions/musu-port/TODO.md`
- `musu-port` phase handoff:
  - `/home/hugh51/musu-functions/musu-port/plans/24_validation_automation_and_windows_bridge_handoff.md`
