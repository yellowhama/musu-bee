# 20 MCP Service Discovery And Promotion

## 목표

`MUSU-AS-MCP` 같은 MCP endpoint를 `musu-port`가
발견하고, 분류하고, alias/promote 대상으로 다루는 기준을 고정한다.

## 배경

- 현재 `musu-port`는 unmanaged endpoint를 주로 transport/protocol 기준으로 본다.
- AI-native service는 health path와 protocol behavior가 조금 다르다.
- `/mcp/health`, `initialize`, `tools/list` 같은 힌트를 읽어
  `mcp_server` 후보를 감지할 필요가 있다.

관련 문서:

- `/home/hugh51/musu-functions/musu-port/MUSU_AS_MCP_RELATION.md`
- `/home/hugh51/musu-functions/MUSU-AS-MCP/README.md`
- `/home/hugh51/musu-functions/MUSU-AS-MCP/MASTER_PLAN.md`

## 이번 단계 범위

- MCP-like endpoint discovery heuristic 정의
- promote naming 규칙 정의
- optional auto-promote 설계

## 제외 범위

- remote MCP call proxy
- full `musu-connects` integration
- Layer B tool proxying

## 구현 작업 목록

- discovery 후보 probe 순서 정의
  - `/mcp/health`
  - `initialize`
  - `tools/list`
- alias 추천 규칙 정의
  - `mcp-<device-id>`
  - `musu-desktop-<device-id>`
- metadata/report에 MCP service tag 노출 정의
- auto-promote를 optional feature로 둘지 결정

## 검증 방법

- fixture/harness 기반 probe smoke
- classification unit test
- `cargo check`

## 완료 기준

- `musu-port`가 MCP endpoint를 “특별 취급이 필요한 AI-native service”로 인식할 기준이 문서로 고정된다
- 다음 구현 단계에서 실제 probe/promotion 코드를 붙일 수 있다

## 현재 상태

- `/mcp/health` probe heuristic이 구현됐다
- deep probe(`initialize`, `tools/list`)가 구현됐다
- probe path는 hardcoded default 전에 device profile `mcp_health_path`를 우선 본다
- JSON-RPC path는 device profile `mcp_rpc_paths`와 template `rpc_path`를 우선 본다
- alias 추천은 `device_id` 기반 `mcp-<device-id>-<process>` 또는 `musu-desktop-<device-id>` 규칙으로 간다
- optional auto-promote가 구현됐다
- `scripts/real-mcp-smoke.sh`로 실제 `MUSU-AS-MCP/server.py` 기준 smoke를 재실행 가능하게 고정했다
