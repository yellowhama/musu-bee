# Windows Browser Action Catalog

## 목적

Windows browser/CDP 계열 action을 process-bound Windows action catalog와 분리해서 관리한다.

## 공통 규칙

- browser action은 process-bound bridge catalog에 넣지 않는다.
- 먼저 CDP endpoint probe를 통과해야 한다.
- control plane은 WSL, resource host는 Windows다.

## Draft Catalog

### `browser-cdp-probe`

- 목적:
  - WSL에서 Windows browser CDP endpoint reachability와 target discovery를 확인
- WSL probe:
  - `scripts/windows-bridge/probe-browser-cdp.sh`
- 실행 분류:
  - `network-bound-browser`
- 출력:
  - reachable host
  - `/json/version` metadata
  - `/json/list` target summary

### `browser-cdp-bootstrap`

- 목적:
  - Windows-side Chrome/Edge CDP endpoint launch/bootstrap
- WSL runner:
  - `scripts/windows-bridge/run-browser-cdp-bootstrap.sh`
- Windows launcher:
  - `scripts/windows-bridge/run-browser-cdp-bootstrap.cmd`
- PowerShell entrypoint:
  - `scripts/windows-bridge/launch-browser-cdp.ps1`
- 실행 분류:
  - `process-bound-bootstrap`
- 상태:
  - implemented
- 출력:
  - resolved browser executable
  - dedicated profile path
  - launch arguments
  - post-launch `/json/version` probe result
- 주의:
  - launch는 process-bound지만, control plane은 계속 network-bound CDP로 유지한다.

### future `browser-cdp-target-list`

- 목적:
  - target inventory만 별도로 추출
- 현재 상태:
  - planned

---

## Consumer-Facing Read Surface Contract

### Probe Output Schema

`browser-cdp-probe` (i.e. `probe-browser-cdp.sh`) returns JSON on stdout.
Consumers MUST read this JSON and branch on `status` before taking any action.

**Top-level fields:**

| Field | Type | Notes |
|---|---|---|
| `status` | string | `"reachable"` or `"unreachable"` |
| `selected_host` | string | Present when `status=reachable`. Host that responded. |
| `selected_base_url` | string | Present when `status=reachable`. e.g. `http://127.0.0.1:9222` |
| `websocket_debugger_url` | string | Present when `status=reachable`. Browser-level WS debugger URL. |
| `browser_name` | string | Present when `status=reachable`. e.g. `"Microsoft Edge/..."` |
| `protocol_version` | string | Present when `status=reachable`. CDP protocol version string. |
| `target_count` | number | Number of open tabs/targets. |
| `targets` | array | Array of target objects (see below). |
| `recommended_next_action` | string | Human-readable next step. |
| `probe` | object | Probe metadata: port, timeout, candidate_hosts. |
| `endpoints` | array | Per-host probe results for diagnostics. |

**Target object fields** (per element in `targets`):

| Field | Type | Notes |
|---|---|---|
| `id` | string | CDP target ID |
| `type` | string | e.g. `"page"`, `"background_page"` |
| `title` | string | Tab/page title |
| `url` | string | Current page URL |
| `webSocketDebuggerUrl` | string | WS URL to attach to this specific target |

### Consumer Decision Logic

```
probe_result = run probe-browser-cdp.sh

if probe_result.status == "reachable":
    # endpoint is ready — attach directly
    use probe_result.selected_base_url  # for /json/* HTTP queries
    use probe_result.websocket_debugger_url  # for browser-level WS
    use probe_result.targets[*].webSocketDebuggerUrl  # for per-tab WS
else:
    # launch is needed — do NOT treat as spawn problem yet
    run browser-cdp-bootstrap (launch-browser-cdp.ps1 via run-browser-cdp-bootstrap.sh)
    re-run probe-browser-cdp.sh
    if still unreachable: escalate as bootstrap failure
```

### Minimum Required Fields for Downstream Consumers

A consumer MUST read at minimum:

1. `status` — to decide: connect vs launch
2. `selected_base_url` — the base HTTP endpoint for CDP
3. `websocket_debugger_url` — for browser-level automation
4. `targets[*].webSocketDebuggerUrl` — for per-tab automation

### Consumer Script

`scripts/windows-bridge/read-cdp-consumer.sh` is the reference consumer implementation.
It wraps `probe-browser-cdp.sh`, interprets the output, and prints the actionable state.

Usage:

```bash
# Print connection state: ready | launch-needed
scripts/windows-bridge/read-cdp-consumer.sh

# Print JSON with resolved endpoints
scripts/windows-bridge/read-cdp-consumer.sh --json

# Use a specific host/port
scripts/windows-bridge/read-cdp-consumer.sh --host 127.0.0.1 --port 9222
```

Exit codes:
- `0` — endpoint reachable
- `1` — endpoint unreachable (launch needed)
- `2` — usage error
