# Split-Host Browser Boundary

## 목표

browser 계열 작업을 process-bound Windows spawn에서 분리하고,
WSL에서는 "Windows 브라우저 프로세스를 띄우는 것"이 아니라
"reachable browser control endpoint에 붙는 것"을 표준 경로로 만든다.

핵심은 remote CDP를 기준으로 split-host boundary를 고정하는 것이다.

## 배경

현재 bridge는 process-bound Windows action에는 충분히 강해졌다.

- direct fast path
- helper queue reliability path
- manual recovery path
- wrapper/spawn policy + audit

하지만 browser 계열은 아직 별도 경계가 없다.

이 상태에서는 browser 작업도 전부:

- `.exe` interop 문제
- helper spawn 문제
- raw wrapper 문제

로 오해하기 쉽다.

OpenClaw 참고 결론은 명확했다.

- browser-like action은 remote CDP처럼 network boundary로 분리한다.
- WSL은 control plane이고, Windows는 resource host로 둔다.

## 현재 관찰

2026-04-02 기준 1차, 2차 슬라이스까지 반영됐다.

현재 확보된 표준 surface:

- `scripts/windows-bridge/probe-browser-cdp.sh`
- `scripts/windows-bridge/run-browser-cdp-bootstrap.sh`
- `scripts/windows-bridge/run-browser-cdp-bootstrap.cmd`
- `scripts/windows-bridge/launch-browser-cdp.ps1`
- `WINDOWS_BROWSER_CDP_STANDARD.md`
- `WINDOWS_BROWSER_ACTION_CATALOG.md`
- `BROWSER_SPLIT_HOST_INVENTORY.md`
- `WINDOWS_BROWSER_LAUNCH_RUNBOOK.md`

즉 이번 phase의 남은 초점은 "browser boundary를 처음 표준화"가 아니라
"표준화된 bootstrap/probe 위에 consumer contract와 live evidence를 쌓는 것"이다.

## 이번 단계 범위

- current browser use case inventory
- Windows-side Chrome/Edge CDP exposure 표준
- WSL-side probe/check script 구현
- browser action catalog entry 구현
- launch runbook 정리
- runbook / handoff / TODO 정렬

## 제외 범위

- 실제 browser companion service 구현
- CDP action 전체 구현
- Playwright/VNC/RDP 일반화
- Windows browser lifecycle productization

## 설계 방향

### 1. browser는 process-bound action이 아니다

분류:

- process-bound:
  - smoke
  - helper self-test
  - PowerShell/CMD task
- network-bound:
  - Chrome DevTools Protocol
  - reachable localhost/LAN browser automation endpoint

browser는 두 번째 그룹으로 고정한다.

### 2. Windows host는 browser resource owner다

Windows에서 할 일:

- Chrome/Edge launch policy 정의
- remote debugging port 표준화
- profile / user-data-dir / security guardrail 정의

WSL에서 할 일:

- endpoint reachability probe
- target discovery
- CDP consumer 연결

### 3. probe-first 진단으로 바꾼다

질문을 바꾼다.

기존:

- "Windows exe를 WSL에서 띄울 수 있나?"

목표:

- "CDP endpoint가 떠 있나?"
- "WSL에서 그 포트에 도달 가능한가?"
- "browser target이 보이나?"

### 4. helper는 browser bootstrap까지만 관여 가능하다

helper가 할 수 있는 역할:

- Windows-side launch bootstrap
- port open bootstrap
- health snapshot 수집

helper가 직접 계속 browser control plane이 되는 것은 이번 범위의 기본값이 아니다.

control plane은 가능한 한 transport endpoint 기준으로 분리한다.

## 작업 트랙

### Track 1. Inventory

정리할 것:

- 현재 repo 안의 browser-related use case
- 어떤 작업이 truly browser-bound인지
- helper queue로 둘지, network boundary로 뺄지

### Track 2. CDP Standard

정할 것:

- 기본 포트
- bind host
- launch arguments
- security note
- Windows-side startup expectations

### Track 3. WSL Probe

추가할 것:

- browser endpoint probe script
- port reachability check
- `/json/version`, `/json/list` basic probe

### Track 4. Catalog / Runbook

정리할 것:

- browser action catalog 고정
- Windows bridge standard에 browser boundary 항목 추가
- handoff에서 helper/process-bound와 browser/network-bound를 분리

### Track 5. Consumer Contract

정리할 것:

- target-list 전용 runner가 필요한지
- probe 결과를 consumer가 그대로 써도 되는지
- live browser evidence pack을 어떤 형식으로 남길지

## 완료 기준

- browser task는 process-bound bridge와 별도 분류된다.
- CDP endpoint probe 표준이 문서로 고정된다.
- Windows-side bootstrap과 dedicated profile 기준이 문서/스크립트로 고정된다.
- 다음 구현 phase에서 browser runner를 어디에 붙일지 애매하지 않다.

## 다음 구현 후보

1. `browser-cdp-target-list` 또는 consumer contract 정의
2. 실제 Windows browser launch + probe live validation
3. browser evidence pack / handoff 축약본 정리
