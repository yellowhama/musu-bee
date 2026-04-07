# PLAN 07: Consumer Proof Runbook

> Status: ready
> Updated: 2026-04-01 KST

## Goal

Codex CLI / Claude Code / Gemini CLI가 `MUSU-AS-MCP` harness와 원본 desktop MCP를 어떻게 소비하는지 증명 가능한 runbook으로 정리한다.

## Scope

- config snippet
- tools/list proof
- first tools/call proof
- fresh session evidence 요구사항

## Harness Base

- server: [`server.py`](/home/hugh51/musu-functions/MUSU-AS-MCP/server.py)
- endpoint: `http://127.0.0.1:8793/mcp`

## Minimal Proof Sequence

1. `health`
2. `initialize`
3. `tools/list`
4. `desktop__musu_app_get_editor_state`
5. `desktop__musu_app_get_layout_snapshot`
6. `desktop__musu_app_get_native_screenshot`

## Generic HTTP Proof Commands

### health

```bash
python3 - <<'PY'
import json, urllib.request
print(json.dumps(json.load(urllib.request.urlopen('http://127.0.0.1:8793/mcp/health')), indent=2))
PY
```

### tools/list

```bash
python3 - <<'PY'
import json, urllib.request
req = urllib.request.Request(
    'http://127.0.0.1:8793/mcp',
    data=json.dumps({'jsonrpc':'2.0','id':1,'method':'tools/list','params':{}}).encode(),
    headers={'content-type':'application/json'},
)
print(json.dumps(json.load(urllib.request.urlopen(req)), indent=2))
PY
```

### first call

```bash
python3 - <<'PY'
import json, urllib.request
req = urllib.request.Request(
    'http://127.0.0.1:8793/mcp',
    data=json.dumps({'jsonrpc':'2.0','id':2,'method':'tools/call','params':{'name':'desktop__musu_app_get_editor_state','arguments':{}}}).encode(),
    headers={'content-type':'application/json'},
)
print(json.dumps(json.load(urllib.request.urlopen(req)), indent=2))
PY
```

## Consumer-Specific Notes

### Codex CLI

- 목표: MCP endpoint 등록 후 `tools/list`에서 `desktop__musu_app_*` family 확인
- 최소 증거:
  - config snippet
  - session tools/list capture
  - first `get_editor_state` result

### Claude Code

- 목표: fresh session에서 harness MCP를 붙이고 첫 tool call proof 확보
- 최소 증거:
  - config snippet
  - tools visibility
  - first call JSON

### Gemini CLI

- 목표: same endpoint를 consumer로 읽을 수 있다는 증거 확보
- 최소 증거:
  - config snippet
  - tools/list proof
  - first call proof

## Fresh Session Evidence

아래 4개를 같이 남겨야 한다.

1. consumer config
2. fresh session tools/list output
3. first successful tools/call raw output
4. 호출 당시 endpoint/port

## Next Step

- Codex CLI / Claude Code / Gemini CLI용 실제 config snippet 파일을 별도로 추가
- harness proof와 original desktop proof를 나눠 보관

## Exit Condition

- 다음 사람이 consumer proof를 재현할 수 있다.
