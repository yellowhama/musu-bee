# Phase 07. OpenClaw Pattern Adoption And Windows Host Split

## 목적

OpenClaw의 Windows/WSL 운영 패턴을 참고해 `musu-computer-tools`의 다음 단계 아키텍처를 정리한다.

핵심은 "WSL에서 Windows를 무조건 직접 실행하려고 버티는 구조"에서 벗어나,

- WSL은 Linux control plane
- Windows는 Windows-owned runtime/service/resource host
- WSL/Windows 경계는 가능한 경우 network boundary로 넘기고
- direct interop는 fast path로만 유지

하는 방향으로 표준 운영 모델을 재정렬하는 것이다.

## 입력 근거

- 비교 리포트:
  - `/home/hugh51/openclaw-full/OPENCLAW_WINDOWS_USAGE_REPORT_2026-04-02.md`
- 현재 MUSU bridge 표준:
  - `WINDOWS_BRIDGE_STANDARD.md`
- 현재 bridge 실행 baseline:
  - `scripts/windows-bridge/run-windows-action.sh`
  - `scripts/windows-bridge/windows-bridge-helper.ps1`
  - `scripts/windows-bridge/helper-lifecycle.ps1`

## 핵심 관찰

### OpenClaw가 하는 것

1. Windows에서는 WSL2를 권장 런타임으로 사용한다.
2. native Windows는 CLI/Gateway/service management 중심으로 지원한다.
3. Windows service lifecycle은 `schtasks` 우선, Startup folder fallback으로 푼다.
4. `.cmd/.bat` wrapper는 직접 실행보다 entrypoint unwrapping을 선호한다.
5. split-host browser control은 remote CDP처럼 network boundary를 사용한다.
6. `cmd.exe /c`는 신뢰 기본값이 아니라 approval/policy 대상이다.

### 우리가 이미 갖고 있는 것

1. snap-confined WSL에서 direct `.exe` interop 실패를 우회하는 `winexec` fast path
2. resident helper queue fallback
3. one-shot launcher fallback
4. helper lifecycle/status/diagnostics

### 그대로 못 가져오는 것

OpenClaw처럼 "WSL2를 쓰면 충분하다"로 끝낼 수는 없다.

우리 문제는 WSL 일반론이 아니라 이 Codex snap runtime의 interop failure다.

즉:

- OpenClaw의 서비스/정책 패턴은 참고 가능
- OpenClaw의 "custom interop bridge 없음"은 그대로 복제 불가

## 설계 결정

## Decision 1. direct interop는 제품 표준이 아니라 best-effort fast path다

유지:

- `winexec.sh` / `/init` 계열 fast path

변경:

- 문서/코드/UX에서 direct를 "기본 경로"로 표현하지 않는다.
- long-running or repeated Windows action은 helper/service path를 기본값으로 승격한다.

이유:

- 현재 환경에서 direct interop는 성공할 때도 있지만 신뢰도 기준 경로가 아니다.
- OpenClaw도 Windows 안정성은 host-native/runtime-owned surfaces에 둔다.

## Decision 2. Windows-owned helper를 임시 프로세스가 아니라 로그인 지속 surface로 승격한다

목표:

- resident helper를 explorer 수동 실행물이 아니라 Windows startup-managed component로 올린다.

우선 후보:

1. Scheduled Task
2. Startup folder `.cmd` fallback

의미:

- `start-helper.cmd`를 수동 도구로만 두지 않는다.
- helper install/status/uninstall/restart를 daemon-like lifecycle로 만든다.

## Decision 3. Windows action을 두 클래스로 분리한다

### Class A. process-bound action

예:

- PowerShell script 실행
- native smoke
- helper self-test

전략:

- helper queue / Windows-owned runtime에서 실행

### Class B. network-bound action

예:

- browser/CDP
- port-forward reachable local service
- future remote control endpoints

전략:

- WSL에서 Windows process spawn 대신 reachable endpoint로 붙는다.

이 분리를 하지 않으면 모든 문제를 `.exe` interop 문제로 오판하게 된다.

## Decision 4. Windows shell wrapper policy를 강화한다

OpenClaw 패턴을 참고해 아래 원칙으로 맞춘다.

1. PowerShell 우선
2. `.cmd/.bat`는 가능하면 entrypoint unwrap
3. `cmd.exe /c` raw wrapper는 policy-guarded path
4. wrapper execution은 로그에 explicit resolution reason 남김

현재 MUSU bridge는 helper 안에서 `powershell`/`cmd` 둘 다 처리하지만,
wrapper classification과 policy surface는 아직 약하다.

## Target Architecture

### Layer 0. Direct Fast Path

- direct `.exe`
- `winexec.sh`

역할:

- 즉시 실행 가능한 경우 latency 최적화

성격:

- optional
- reliability path 아님

### Layer 1. Windows Service-Owned Helper

- resident helper
- helper lifecycle manager
- future Scheduled Task / Startup-managed install

역할:

- process-bound Windows action의 기본 실행 경로

성격:

- primary reliability path

### Layer 2. Network Boundary Actions

- browser remote CDP
- portproxy/TCP-reachable Windows services
- future websocket/http control surfaces

역할:

- WSL/Windows 경계 문제를 process spawn이 아니라 transport 문제로 분리

성격:

- split-host standard path

### Layer 3. Manual Recovery

- `.cmd` one-shot launcher
- explicit Windows-side execution

역할:

- helper unavailable / bootstrap 실패 시 recovery

성격:

- operator fallback

## 바로 구현할 항목

## Workstream A. Helper Service Install

목표:

- resident helper를 Windows login lifecycle에 묶는다.

세부 작업:

1. helper install/uninstall/status/restart surface 정의
2. Scheduled Task install path 추가
3. Access denied / timeout 시 Startup folder fallback 추가
4. helper runtime pid/heartbeat와 install state를 함께 보여주는 status 표준화

완료 기준:

- Windows에서 helper를 재부팅/로그인 뒤 자동 기동 가능
- Codex 세션이 helper를 "수동 실행 필요" 상태로 남기지 않음

## Workstream B. Windows Spawn Policy

목표:

- action runner/helper가 raw wrapper 실행보다 safer spawn decision을 하도록 만든다.

세부 작업:

1. Windows command resolution helper 추가
2. `.cmd/.bat` wrapper unwrap 가능한지 판별
3. PowerShell 우선 resolution 추가
4. `cmd.exe /c` 사용 시 explicit audit/event 남김

완료 기준:

- action 실행 로그에 direct/powershell/wrapper/helper resolution이 남음
- wrapper 때문에 생기는 quoting/approval ambiguity가 줄어듦

## Workstream C. Split-Host Browser Pattern

목표:

- browser 계열은 Windows process launch보다 remote endpoint control로 분리한다.

세부 작업:

1. current browser use case inventory
2. Windows Chrome CDP 노출 표준화
3. WSL-side probe/check script 추가
4. future browser action catalog entry 설계

완료 기준:

- browser task는 "Windows exe를 WSL에서 띄울까?" 대신
  "reachable CDP endpoint가 있나?"로 진단 가능

## 비목표

이번 phase에서 바로 하지 않는 것:

- Windows companion app 신규 개발
- UI Automation 전면 일반화
- WSL interop 문제 완전 제거
- 모든 Windows action의 network boundary화

## Acceptance Criteria

1. helper가 Windows login lifecycle에 묶여 자동 복구 가능하다.
2. process-bound action은 helper path를 기본 경로로 사용한다.
3. browser-like action은 split-host transport 표준 문서가 있다.
4. action runner가 wrapper/raw shell 사용을 분류해서 설명할 수 있다.
5. direct interop failure가 있어도 운영 표준이 흔들리지 않는다.

## 다음 산출물

- `plans/08_windows_helper_service_install.md`
- `plans/09_windows_spawn_policy_alignment.md`
- `plans/10_split_host_browser_boundary.md`

