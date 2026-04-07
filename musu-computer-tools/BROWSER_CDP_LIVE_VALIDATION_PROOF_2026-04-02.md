# Browser CDP Live Validation Proof 2026-04-02

## 실행

### dry-run bootstrap

```bash
bash /home/hugh51/musu-functions/musu-computer-tools/scripts/windows-bridge/run-browser-cdp-bootstrap.sh --force-helper --dry-run
```

결과:

- helper queue 경유 성공
- browser resolution: `edge`
- endpoint target: `http://127.0.0.1:9222`

### actual bootstrap

```bash
bash /home/hugh51/musu-functions/musu-computer-tools/scripts/windows-bridge/run-browser-cdp-bootstrap.sh --force-helper --browser edge --port 9222
```

결과:

- helper queue 경유 성공
- Windows Edge launch 성공
- dedicated profile:
  - `C:\Users\empty\AppData\Local\MUSU\BrowserCDP\edge-9222`
- remote debugging:
  - `127.0.0.1:9222`

### probe after launch

```bash
bash /home/hugh51/musu-functions/musu-computer-tools/scripts/windows-bridge/probe-browser-cdp.sh
```

결과:

- `status = reachable`
- `classification = network-bound-browser`
- `selected_base_url = http://127.0.0.1:9222`
- `browser_name = Edg/146.0.3856.84`
- `protocol_version = 1.3`
- `target_count = 6`
- `about:blank` page target 확인

## evidence

- helper request result:
  - `.windows-bridge/results/wb-20260402T033434-79465-23093.json`
- helper log:
  - `.windows-bridge/logs/wb-20260402T033434-79465-23093.log`
- probe output:
  - live terminal output captured in session

## 결론

1. browser bootstrap은 helper queue 경유로 실제 동작한다.
2. browser 작업은 이제 process-bound 문제가 아니라 reachable CDP endpoint consumer 문제로 읽어야 한다.
3. split-host browser boundary의 live evidence가 확보됐다.
