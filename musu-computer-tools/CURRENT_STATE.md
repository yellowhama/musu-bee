# MUSU Computer Tools Current State

## 현재 목적

`musu-computer-tools`를 AI agent의 실제 OS 실행 계층으로 유지하되, 현재 단계에서는 Windows/WSL bridge와 split-host browser boundary를 제품화 가능한 표준으로 고정한다.

## 현재 코드 상황

- Windows bridge baseline은 이미 운영 가능한 수준이다.
  - direct/helper/manual fallback
  - helper lifecycle
  - Windows action catalog
  - spawn policy alignment
- helper service install 경로도 구현돼 있다.
- split-host browser boundary 문서/스크립트도 1차로 올라와 있다.
  - `probe-browser-cdp.sh`
  - `run-browser-cdp-bootstrap.sh`
  - `launch-browser-cdp.ps1`
  - `WINDOWS_BROWSER_CDP_STANDARD.md`
  - `WINDOWS_BROWSER_ACTION_CATALOG.md`
  - `WINDOWS_BROWSER_LAUNCH_RUNBOOK.md`

## 2026-04-02 도그푸딩 확인

### helper status

- `status-helper.sh`
- 결과:
  - `state=online`
  - `install_state=startup-folder`
  - helper heartbeat 정상

### interop probe

- `probe-interop.sh`
- 결과:
  - direct exec 실패
  - helper `online`
  - recommended mode = `helper`

### browser CDP probe

- `probe-browser-cdp.sh`
- 결과:
  - bootstrap 전: `status=unreachable`
  - bootstrap 후: `status=reachable`
  - `classification=network-bound-browser`
  - `selected_base_url=http://127.0.0.1:9222`
  - Edge CDP endpoint 실제 확인

## 현재 판단

- Windows process action은 helper path가 현재 표준 운영 경로다.
- browser 작업은 process spawn 문제가 아니라 `CDP endpoint consumer` 문제로 읽어야 한다.
- live browser launch validation evidence가 확보됐다.
- 다음 핵심 cut은 browser/CDP consumer contract와 consumer-facing surface 고정이다.

## 즉시 다음 단계

1. browser/CDP consumer contract 표준화
2. consumer-facing read surface를 catalog/standard에 반영
3. 루트 표준 문서(`CURRENT_STATE`, `TODO_EXECUTION_BOARD`, `plans/README`) 유지
4. 이후 필요한 consumer만 상위 control surface와 연결
