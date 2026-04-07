# Device Profile Contract

## 목적

`musu-port`는 특정 사용자 PC 경로, 고정 포트, 특정 launcher를 제품 truth로 하드코딩하지 않는다.

대신 기기별 차이는 아래 조합으로 표현한다.

- `device_id`
- `device profile JSON`
- runtime translator

즉, 공유 코어는 동일하게 유지하고, 기기별 실행 방법과 경로 차이만 profile로 주입한다.

## 위치

기본 경로:

- `data/device-profiles/<device_id>.json`

env override:

- `MUSU_DEVICE_PROFILE_PATH`

reference fixture:

- [reference_device_profile.json](/home/hugh51/musu-functions/musu-port/fixtures/reference_device_profile.json)

## 필드

```json
{
  "version": "musu.device-profile.v1",
  "device_id": "desktop-main",
  "runtime_kind": "wsl",
  "filesystem_context": "linux_native",
  "launch": {
    "windows_command": "C:\\\\Tools\\\\musu-port\\\\musu-portd.exe",
    "linux_command": "/opt/musu-port/musu-portd",
    "wsl_command": "/home/hugh51/musu-functions/musu-port/target/debug/musu-portd"
  },
  "health": {
    "health_path": "/health",
    "mcp_health_path": "/mcp/health",
    "probe_timeout_ms": 250,
    "mcp_probe_mode": "health_then_deep",
    "mcp_rpc_paths": ["/mcp"]
  },
  "transport": {
    "preferred_ingress": "http",
    "supports_connect": true,
    "supports_quic": true,
    "auto_promote_mcp": false
  },
  "validation": {
    "on_error": "warn"
  },
  "path_hints": {
    "windows_root": "C:\\\\Users\\\\example\\\\musu-functions",
    "linux_root": "/home/example/musu-functions",
    "wsl_unc_root": "\\\\\\\\wsl.localhost\\\\Ubuntu-22.04\\\\home\\\\example\\\\musu-functions"
  },
  "report_roots": {
    "metadata": "/home/example/musu-functions/musu-port/data/reports/port-manager/metadata",
    "connect": "/home/example/musu-functions/musu-port/data/reports/port-manager/connect"
  },
  "guidance": {
    "translator_hints": [
      "prefer WSL path bridge when runtime_kind is wsl",
      "surface connect_url to AI agents instead of raw target port"
    ],
    "operator_notes": [
      "run Windows native shell smoke before shipping binary layout changes"
    ]
  },
  "service_templates": [
    {
      "name": "musu desktop mcp",
      "service_class": "mcp_server",
      "alias": "musu-desktop-desktop-main",
      "health_path": "/mcp/health",
      "rpc_path": "/mcp",
      "tags": ["mcp", "ai-native"],
      "agent_facing": true,
      "match_process_names": ["musu-desktop", "python3"],
      "match_protocols": ["tcp"],
      "match_ports": [8793],
      "priority": 100
    }
  ]
}
```

## 해석 규칙

- `device_id`는 canonical identity다. 경로/호스트명 대신 이 값을 중심으로 alias와 profile lookup을 한다.
- `launch`는 translator가 `.exe`, ELF, AppImage 중 어떤 바이너리를 우선 선택할지 참고하는 힌트다.
- `health`는 AI-native service probe 시 hardcoded path 대신 우선 적용되는 계약이다.
  - `mcp_probe_mode=health|health_then_deep|deep`
  - `mcp_rpc_paths`는 `initialize` / `tools/list` probe 대상 path다.
- `transport.supports_connect=false`면 `/connect/{service}`는 deny decision을 반환한다.
- `transport.auto_promote_mcp=true`면 profile/template 조건을 만족한 MCP endpoint를 background reconcile이 alias route로 자동 승격한다.
  - `service_templates`가 비어 있지 않으면 "matching template가 있는 endpoint만" auto-promote 대상이다.
  - profile-level MCP hint만으로는 classify는 가능하지만, template가 정의된 기기에서는 known service truth를 우선한다.
- `validation.on_error=fail`이면 invalid profile로 서버를 띄우지 않는다.
- `guidance.translator_hints`는 AI agent나 translator가 connect/launch/path 결정을 내릴 때 참고하는 runtime guidance다.
- `service_templates`는 기기별 known service truth다.
  - `match_process_names`, `match_protocols`, `match_ports`, `priority`를 써서 우선순위 기반으로 매칭한다.
  - `rpc_path`는 deep MCP probe 대상 path를 지정한다.

## 현재 코드 반영 범위

- `device_id` canonicalization
- profile load + summary
- `/health`에 profile loaded/match/template/guidance surface 노출
- `/health`에 validation action / warning/error count / `device_profile_valid` 노출
- MCP discovery 시 `health.mcp_health_path` 우선 사용
- `health -> initialize -> tools/list` deep MCP probe
- `service_templates` 기반 classification/alias 보정 + priority scoring
- `transport.auto_promote_mcp` 기반 MCP auto-promote
- `/connect/{service}` decision surface에 `translator_hints` 반영
- `/connect/{service}` 응답에 `delivery_contract`, `bridge_owner`, `remote_bridge_supported` 반영

## 아직 남은 것

- real MCP session semantics(SSE/streamable-http) probe 고도화
- cloud sync / remote enrollment
- `musu-connects`와 결합한 cross-device profile distribution
