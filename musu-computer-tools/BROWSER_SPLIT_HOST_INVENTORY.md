# Browser Split-Host Inventory

## 목적

현재 `musu-computer-tools` 안에서 browser-like action이 어디에 있는지,
그리고 무엇이 process-bound이고 무엇이 network-bound 후보인지 정리한다.

## 현재 관찰

2026-04-02 기준 현재 저장소에는 다음 상태가 확인됐다.

### 1. browser surface는 세 층으로 나뉜다

- observation:
  - `ai-chat-spy`
  - 이미 떠 있는 브라우저/외부 앱 창을 읽는 쪽
- process-bound bootstrap:
  - `scripts/windows-bridge/launch-browser-cdp.ps1`
  - `scripts/windows-bridge/run-browser-cdp-bootstrap.sh`
  - `scripts/windows-bridge/run-browser-cdp-bootstrap.cmd`
- network-bound control:
  - `scripts/windows-bridge/probe-browser-cdp.sh`
  - future CDP consumer

### 2. 기존 browser 언급은 주로 문서/관찰 도구 쪽이었다

- `README.md`
  - `ai-chat-spy`가 Web Browsers를 관찰 대상으로 언급
- 이 경로는 외부 브라우저를 "읽는" 쪽이지,
  CDP endpoint를 control plane으로 쓰는 구조는 아니다.

### 3. 현재 catalog는 process-bound와 network-bound를 분리했다

- `WINDOWS_ACTION_CATALOG.md`
  - `musu-port-smoke`
  - `musu-port-native-smoke`
  - `helper-selftest`
- `WINDOWS_BROWSER_ACTION_CATALOG.md`
  - `browser-cdp-probe`
  - `browser-cdp-bootstrap`

즉 browser-like action은 이제 별도 browser catalog에서 관리한다.

## 분류 결과

### Process-bound

- helper self-test
- PowerShell/CMD 실행
- `musu-port` smoke 계열
- browser launch bootstrap

### Network-bound browser candidate

- Chrome/Edge CDP attach
- browser target inventory
- post-launch CDP health check

## 현재 결론

1. browser는 기존 process-bound bridge catalog에 억지로 넣지 않는다.
2. browser 표준 action은 `browser-cdp-probe`와 `browser-cdp-bootstrap` 두 개로 시작한다.
3. launch는 bootstrap으로 제한하고, 실제 제어는 endpoint reachability와 target discovery 이후에만 붙인다.

## 다음 확장 후보

1. `browser-cdp-target-list` runner
2. browser consumer/CDP attach contract
3. Windows live browser launch evidence pack
