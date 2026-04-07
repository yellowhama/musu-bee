# MUSU Computer Tools Master Plan

## 목표

`musu-computer-tools`는 AI agent가 Windows/WSL/Linux 경계를 넘나들며 실제 호스트를 다루기 위한 실행 계층이다.

이 마스터 플랜은 현재 완료된 Windows bridge baseline 위에 다음 제품화 단계를 고정한다.

핵심 목표:

- `musu-port`와 `musu-computer-tools` 사이의 Windows action bridge를 재현 가능한 표준 계약으로 고정한다.
- direct interop가 흔들리는 환경에서도 helper/manual fallback으로 반복 실행 가능하게 만든다.
- 문서, backlog, validation, index를 사람 기억이 아니라 phase 문서 기준으로 운영한다.
- 각 phase 시작 전에 세부 플랜 문서를 먼저 만들고, 구현은 그 문서를 기준으로 진행한다.

## 이 문서의 범위

이 문서는 `musu-port/MASTER_PLAN.md`를 대체하지 않는다.

- `musu-port/MASTER_PLAN.md`
  - standalone port manager parity와 bilingual runtime core의 장기 로드맵
- `musu-computer-tools/MASTER_PLAN.md`
  - Windows bridge 운영/확장/productization의 현재 실행 로드맵

즉, `musu-port`가 bridge의 소비자라면 `musu-computer-tools`는 bridge의 운영면과 실행면을 담당한다.

## 현재 상태 스냅샷

2026-04-02 기준:

- Windows bridge baseline 구현 완료
  - `probe-interop.sh`
  - `enqueue-powershell.sh`
  - `windows-bridge-helper.ps1`
  - `run-windows-action.sh`
  - `run-musu-port-smoke.sh`
  - `run-musu-port-native-smoke.sh`
- direct/helper/manual 3모드 검증 완료
  - direct smoke 성공
  - helper fallback smoke 성공
  - `.cmd` launcher UX 확인 완료
- `musu-port`의 Windows discovery/runtime bootstrap도 baseline 구현 완료
  - executable contract
  - Windows discovery provider
  - Windows native smoke harness
- 현재 코드 재검증 결과
  - `musu-computer-tools/scripts/windows-bridge/*.sh` 문법 확인 통과
  - `musu-port`: `./scripts/linux-rust-env.sh cargo check` 통과
  - `musu-port`: `./scripts/linux-rust-env.sh cargo test -p musu-port-core` 통과
  - current test baseline:
    - `45` unit tests
    - `6` parity integration tests
- Gate 0 baseline recovery 완료
  - `mcp_candidates_can_auto_promote_from_device_profile_policy` 회귀 복구
  - auto-promote policy 고정:
    - `service_templates`가 비어 있지 않으면 matching template가 있는 endpoint만 auto-promote

따라서 다음 phase의 0순위는 baseline recovery가 아니라 helper lifecycle productization이다.

## 운영 원칙

### 1. direct는 fast path, helper/manual은 reliability path

- direct interop가 살아 있으면 가장 빠른 경로로 사용한다.
- snap WSL interop는 `accept4 failed 110`, `socket failed 1`, `/init` visibility 이슈로 흔들릴 수 있다.
- 따라서 helper/manual fallback은 예외 처리가 아니라 표준 운영 경로다.

### 2. phase 문서가 코드보다 먼저다

- phase 시작 전 `plans/NN_<slug>.md`를 먼저 만든다.
- phase 종료 후 TODO, runbook, handoff, validation 문서를 함께 정리한다.

### 3. green baseline이 열려 있어야 다음 phase로 간다

- `cargo check`, 핵심 test suite, bridge smoke가 다시 green이 되기 전에는 확장 작업을 열지 않는다.
- 검증 결과는 문서에 남기고, 실패는 backlog로 승격한다.

## 현재 범위의 비목표

이번 마스터 플랜에서 바로 하지 않을 것:

- `musu-connects`의 remote bridge / cross-device tunnel 구현
- Tauri UI automation
- Windows UI automation 일반화
- 새로운 대형 기능 트리 이식

지금은 "bridge를 운영 가능한 제품 면으로 고정"하는 범위만 다룬다.

## Phase Ordering

## Gate 0. `musu-port` Baseline Recovery

목적:

- 현재 깨진 parity regression 1건을 정리하고 test baseline을 다시 green으로 만든다.

출력물:

- `musu-port/plans/25_mcp_auto_promote_baseline_recovery.md`
- policy decision
  - auto-promote가 matching template를 반드시 요구하는지
  - profile-level MCP hint만으로도 promote 가능한지
- 수정된 test/implementation/문서

완료 기준:

- `./scripts/linux-rust-env.sh cargo check` 통과
- `./scripts/linux-rust-env.sh cargo test -p musu-port-core` 통과
- regression root cause와 policy가 문서에 남아 있음

## Phase 03. Helper Lifecycle Productization

목적:

- resident helper를 사람이 기억으로 관리하지 않도록 `status/start/stop/restart` 운영면을 제품화한다.

예상 작업:

- helper status script
- stale heartbeat 정리
- one-shot helper와 resident helper 구분 surface
- helper self-test를 운영 커맨드로 승격

완료 기준:

- helper 상태를 WSL/Windows 양쪽에서 빠르게 확인 가능
- stale heartbeat 때문에 helper mode 판단이 틀어지지 않음
- runbook이 helper lifecycle까지 포함

현재 상태:

- 완료
- 추가된 surface:
  - `helper-lifecycle.ps1`
  - `status-helper.cmd`
  - `stop-helper.cmd`
  - `restart-helper.cmd`
  - `status-helper.sh`
- 검증:
  - WSL status에서 `stale -> offline -> online` 상태 전이 확인
  - Windows lifecycle action `status/restart/stop/start` 실기동 확인

## Phase 04. WSL Interop Diagnostics And Evidence Pack

목적:

- WSL interop flake를 재현/분류/기록하는 진단 계층을 만든다.

예상 작업:

- diagnostic script
- WSL version / runtime / launcher / env snapshot 수집
- error signature 분류
  - `accept4 failed 110`
  - `UtilBindVsockAnyPort ... socket failed 1`
  - `cannot execute: required file not found`
- reproducible matrix 문서

완료 기준:

- direct 실패 시 원인 분류 근거를 자동으로 남길 수 있음
- handoff 없이도 현재 interop 상태를 다시 설명 가능

현재 상태:

- 완료
- 추가된 surface:
  - `plans/04_wsl_interop_diagnostics_and_evidence_pack.md`
  - `scripts/windows-bridge/diagnose-interop.sh`
- 현재 세션 evidence:
  - `/init`는 보이지 않음
  - `/var/lib/snapd/hostfs/init`는 존재
  - direct `cmd.exe`는 실패
  - `winexec` bridge는 성공
  - helper는 `online`
  - failure class는 `winexec_bridge_ok`

## Phase 05. Windows Action Catalog Expansion

목적:

- 현재 smoke 중심 bridge를 reusable action catalog로 확장한다.

예상 작업:

- request kind catalog 재정리
- reusable PowerShell/CMD wrapper pattern 고정
- `musu-port` 외 Windows action 후보 선별
- action별 validation contract 추가

완료 기준:

- smoke/native smoke 외 1개 이상 Windows action이 같은 runner 계약 위에 올라감
- 새 action 추가 시 복붙이 아니라 템플릿 방식으로 확장 가능

현재 상태:

- 완료
- 추가된 surface:
  - `plans/05_windows_action_catalog_expansion.md`
  - `WINDOWS_ACTION_CATALOG.md`
  - `run-helper-selftest.sh`
  - `run-helper-selftest.cmd`
- catalog에 `musu-port-smoke`, `musu-port-native-smoke`, `helper-selftest`를 고정
- smoke 외 action이 generic runner 위에 실제로 1개 추가됨

## Phase 06. Spec / Index Sync Automation

목적:

- 스펙 문서, 코드 인덱스, 문서 인덱스를 한 번에 정렬하는 루틴을 만든다.

예상 작업:

- index refresh script
- docs/code ignore pattern 고정
- spec sync checklist

완료 기준:

- phase 종료 시 manual indexing이 아니라 script/runbook으로 동기화 가능
- stale index 때문에 context가 어긋나는 일이 줄어듦

현재 상태:

- 완료
- 추가된 surface:
  - `plans/06_spec_doc_code_sync_automation.md`
  - `scripts/generate-sync-manifest.sh`
  - `INDEX_SYNC_RUNBOOK.md`
  - `INDEX_SYNC_STATUS.md`
- 최신 sync:
  - manifest 재생성 완료
  - `jcodemunch` code index sync 완료
  - `jdocmunch` doc index sync 완료
  - browser/CDP phase 문서를 포함하도록 key spec manifest 확장

## Phase 07. OpenClaw Pattern Adoption And Windows Host Split

목적:

- OpenClaw의 Windows/WSL 운영 패턴을 참고해 `musu-computer-tools`의 다음 단계 아키텍처를 재정렬한다.
- direct interop 의존을 낮추고, Windows-owned helper/service와 split-host network boundary를 제품 표준 경로로 올린다.

예상 작업:

- helper를 Windows login/service lifecycle에 묶는 설치 모델 설계
- Windows shell/wrapper spawn policy 정렬
- browser 계열 split-host action을 network boundary 기반으로 분리

완료 기준:

- helper가 수동 프로세스가 아니라 startup-managed runtime으로 승격됨
- process-bound action과 network-bound action의 실행 표준이 분리됨
- wrapper/raw shell 사용에 대한 policy/logging 기준이 문서와 코드에 반영됨

상세 플랜:

- `plans/07_openclaw_pattern_adoption_and_windows_host_split.md`

현재 상태:

- 부분 완료
- helper service install은 Phase 08에서 구현 완료
- Windows spawn/wrapper policy alignment는 Phase 09에서 구현 완료
- 남은 항목은 split-host browser/network-bound action 분리

## Phase 08. Helper Service Install

목적:

- resident helper를 Windows login-managed runtime으로 설치/제거 가능한 표준 surface로 올린다.
- runtime state와 install state를 함께 보여서 operator 판단 비용을 줄인다.

예상 작업:

- `helper-lifecycle.ps1`에 `install/uninstall/status` 확장
- Scheduled Task 우선, Startup folder fallback
- WSL status에서 cached install state 노출
- Windows wrapper `install/uninstall` 추가

완료 기준:

- helper install/uninstall path가 실제로 동작한다.
- `status-helper.sh`가 `runtime_state + install_state`를 함께 보여준다.
- `schtasks` denied 상황에서 Startup folder fallback이 남는다.

현재 상태:

- 완료
- 추가된 surface:
  - `scripts/windows-bridge/helper-lifecycle.ps1`
  - `scripts/windows-bridge/install-helper.cmd`
  - `scripts/windows-bridge/uninstall-helper.cmd`
  - `scripts/windows-bridge/status-helper.sh` install-state 확장
- 검증:
  - `schtasks` create access denied 시 `startup-folder` fallback 확인
  - `status-helper.cmd` queue `cmd_file` 경로 성공
  - `uninstall-helper.cmd` 이후 `offline + not-installed` 확인
  - queue self-termination을 피하기 위해 `stop/restart/uninstall` wrapper를 detached launch로 전환

## Phase 09. Windows Spawn Policy Alignment

목적:

- direct/helper/manual resolution이 wrapper type과 policy reason을 명시적으로 남기게 만든다.

예상 작업:

- direct preflight policy
- helper kind/entrypoint match 검증
- action audit JSONL
- helper result metadata 확장

완료 기준:

- direct에 wrapper를 넣으면 local preflight에서 즉시 거부된다.
- helper/manual 선택 이유가 audit에 남는다.
- helper result가 resolution metadata를 포함한다.

현재 상태:

- 완료
- 추가된 surface:
  - `plans/09_windows_spawn_policy_alignment.md`
  - `scripts/windows-bridge/run-windows-action.sh` preflight/audit 확장
  - `scripts/windows-bridge/enqueue-powershell.sh` metadata 확장
  - `scripts/windows-bridge/windows-bridge-helper.ps1` result metadata 확장
  - `scripts/windows-bridge/lib.sh` entrypoint classification helper

## Phase 10. Split-Host Browser Boundary

목적:

- browser-like action을 process-bound Windows bridge와 분리하고 network-bound standard path로 옮긴다.

예상 작업:

- browser use case inventory
- Windows-side CDP exposure standard
- WSL-side probe/check script
- browser action catalog draft

완료 기준:

- browser task는 "Windows exe spawn"이 아니라 "reachable CDP endpoint" 기준으로 진단된다.
- 다음 구현 phase에서 browser runner 위치가 명확하다.

현재 상태:

- 진행 중
- 완료된 항목:
  - `plans/10_split_host_browser_boundary.md`
  - `scripts/windows-bridge/probe-browser-cdp.sh`
  - `scripts/windows-bridge/run-browser-cdp-bootstrap.sh`
  - `scripts/windows-bridge/run-browser-cdp-bootstrap.cmd`
  - `scripts/windows-bridge/launch-browser-cdp.ps1`
  - `WINDOWS_BROWSER_CDP_STANDARD.md`
  - `WINDOWS_BROWSER_ACTION_CATALOG.md`
  - `BROWSER_SPLIT_HOST_INVENTORY.md`
  - `WINDOWS_BROWSER_LAUNCH_RUNBOOK.md`
- 현재 고정된 운영 흐름:
  - probe-first로 CDP endpoint reachability를 진단
  - launch가 필요하면 Windows-side bootstrap으로 dedicated debugging profile을 띄움
  - browser control plane은 계속 network-bound CDP로 유지
- 남은 항목:
  - browser/CDP consumer contract 표준화
  - 실제 Windows live browser launch + probe validation

## 문서 운영 규칙

- 마스터 플랜 변경 시 함께 갱신할 문서:
  - `TODO.md`
  - `WINDOWS_BRIDGE_STANDARD.md`
  - `WINDOWS_INTEROP_HANDOFF_2026-04-01.md`
  - `musu-port/MASTER_PLAN.md`
  - phase별 detailed plan
- 새 phase를 시작할 때는 해당 저장소 TODO에 unchecked backlog를 먼저 연다.

## 바로 다음 액션

1. Phase 06의 spec/doc/code sync 루틴을 실제 운영 기준으로 닫는다.
2. Phase 10 기준으로 browser/CDP consumer contract를 연다.
3. Windows live browser launch validation을 추가한다.

## active

- Phase 10. Split-Host Browser Boundary
- Phase 11. Browser CDP Consumer Contract
- Phase 12. Live Browser Launch Validation
