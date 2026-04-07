# Windows Browser Launch Runbook

## 목적

Windows에서 Chrome/Edge를 CDP endpoint owner로 띄우는 bootstrap 절차를 표준화한다.

## 기본 원칙

1. browser control plane은 WSL이 담당한다.
2. Windows는 browser process와 CDP port를 소유한다.
3. 사람 browsing profile과 agent debugging profile은 분리한다.
4. launch 후에는 `probe-browser-cdp.sh`로 endpoint를 확인한다.

## 표준 launch surface

- PowerShell entrypoint:
  - `scripts/windows-bridge/launch-browser-cdp.ps1`
- WSL runner:
  - `scripts/windows-bridge/run-browser-cdp-bootstrap.sh`
- Windows launcher:
  - `scripts/windows-bridge/run-browser-cdp-bootstrap.cmd`

## 기본값

- browser:
  - `auto`
  - 우선순위는 `edge -> chrome`
- port:
  - `9222`
- bind host:
  - `127.0.0.1`
- initial URL:
  - `about:blank`
- user data dir:
  - `%LOCALAPPDATA%\MUSU\BrowserCDP\<browser>-<port>`

## 추천 실행 예

WSL helper path:

```bash
scripts/windows-bridge/run-browser-cdp-bootstrap.sh --force-helper --dry-run
scripts/windows-bridge/run-browser-cdp-bootstrap.sh --force-helper --browser edge --port 9222
scripts/windows-bridge/probe-browser-cdp.sh --host 127.0.0.1 --port 9222
```

Windows PowerShell direct:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "\\wsl.localhost\Ubuntu-22.04\home\hugh51\musu-functions\musu-computer-tools\scripts\windows-bridge\launch-browser-cdp.ps1" -Browser edge -Port 9222
```

## Dry Run

`-DryRun`은 다음만 확인한다.

- browser executable resolution
- launch arguments
- dedicated user-data-dir path
- target endpoint URL

브라우저는 실제로 띄우지 않는다.

## 운영 순서

1. `run-browser-cdp-bootstrap.sh --dry-run`
2. 실제 launch
3. `probe-browser-cdp.sh`
4. probe 성공 시 CDP consumer 연결

## 주의

- browser launch bootstrap은 process-bound bootstrap이다.
- 실제 browser control은 network-bound CDP path로 유지한다.
- remote debugging을 LAN으로 열면 별도 보안 경계가 필요하다.
