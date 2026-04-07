# Windows Browser CDP Standard

## 목적

browser-like action을 Windows process spawn 문제와 분리하고,
WSL에서는 Chrome/Edge DevTools Protocol endpoint에 붙는 것을 표준 경로로 고정한다.

## 분류

- process-bound action
  - PowerShell script
  - CMD wrapper
  - smoke / helper self-test
- network-bound browser action
  - Chrome DevTools Protocol
  - reachable browser automation endpoint

browser는 두 번째 그룹이다.

## 기본 운영 원칙

1. browser 작업은 `run-windows-action.sh` direct/helper/manual 분기 대상으로 시작하지 않는다.
2. 먼저 CDP endpoint reachability를 probe 한다.
3. probe가 성공하면 endpoint consumer를 붙인다.
4. probe가 실패하면 그 다음에만 Windows-side launch/bootstrap 문제로 본다.

## 기본 CDP 표준

- browser host owner:
  - Windows
- control plane:
  - WSL
- 기본 포트:
  - `9222`
- 기본 endpoint:
  - `/json/version`
  - `/json/list`
- 기본 bind 기대:
  - localhost only

## WSL probe

- script:
  - `scripts/windows-bridge/probe-browser-cdp.sh`

예:

```bash
scripts/windows-bridge/probe-browser-cdp.sh
scripts/windows-bridge/probe-browser-cdp.sh --host 127.0.0.1 --port 9222
scripts/windows-bridge/probe-browser-cdp.sh --host 127.0.0.1 --port 9222 --include-resolv-host
```

성공 시:

- reachable host
- browser metadata
- websocket debugger URL
- target list

실패 시:

- candidate host별 curl/http result
- next action guidance

## Windows-side launch standard

- Chrome/Edge는 dedicated debugging profile을 권장한다.
- default human browsing profile과 agent profile은 분리한다.
- `--remote-debugging-port=<PORT>`를 명시한다.
- `--remote-debugging-address=<HOST>`를 명시한다.
- 가능한 경우 `--user-data-dir=<isolated-path>`를 사용한다.
- 기본 bind는 `127.0.0.1`로 고정한다.

표준 surface:

- PowerShell entrypoint:
  - `scripts/windows-bridge/launch-browser-cdp.ps1`
- WSL bootstrap runner:
  - `scripts/windows-bridge/run-browser-cdp-bootstrap.sh`
- Windows launcher:
  - `scripts/windows-bridge/run-browser-cdp-bootstrap.cmd`
- 운영 runbook:
  - `WINDOWS_BROWSER_LAUNCH_RUNBOOK.md`

권장 순서:

1. `probe-browser-cdp.sh`
2. endpoint가 없으면 `run-browser-cdp-bootstrap.sh --dry-run`
3. launch 후 다시 `probe-browser-cdp.sh`
4. probe 성공 시 CDP consumer 연결

## 보안/운영 메모

- CDP는 local machine control surface다.
- LAN으로 노출할 때는 별도 보안 경계가 필요하다.
- 이번 표준의 기본값은 `localhost` probe다.
- 원격 노출은 이후 phase에서 별도 문서와 guardrail로 다룬다.
