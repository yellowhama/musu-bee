# Deferred Policy Backlog

## 목적

이미 코드로 닫은 정책 결정과, 아직 `musu-port` 밖에 남겨둔 항목을 분리해서 관리한다.

## 2026-04-01 기준 결정 완료

### 1. deeper MCP probe

- 기본 probe 순서:
  - `GET /mcp/health`
  - `POST initialize`
  - `POST tools/list`
- device profile에서 제어:
  - `health.mcp_probe_mode`
  - `health.mcp_rpc_paths`
- 현재 결과:
  - health path가 없어도 JSON-RPC initialize 응답이면 `mcp_server`로 분류 가능

### 2. device profile validation policy

- 기본값: `warn`
- device profile에서 제어:
  - `validation.on_error=warn|fail`
- 현재 결과:
  - `/health`에 validation action / warning count / error count / valid 노출
  - `fail` + invalid profile이면 startup 실패

### 3. device profile template priority

- 현재 template score 입력:
  - `match_process_names`
  - `match_protocols`
  - `match_ports`
  - `priority`
- 현재 결과:
  - 첫 번째 fuzzy match가 아니라 highest-score template를 선택

### 4. `/connect/{service}` actual tunnel scope

- 현재 계약:
  - `/connect/{service}`는 decision endpoint다
  - 응답에 `delivery_contract=connect_url_handoff`
  - 응답에 `bridge_owner=musu-port`
  - 응답에 `remote_bridge_supported=false`
- 의미:
  - 실제 byte stream은 반환된 `connect_url`로 직접 붙는다
  - cross-device / remote peer bridge는 `musu-connects` 책임이다

## 아직 남겨둔 항목

### 1. real MCP session semantics

- 현재는 discovery/classification 관점에서만 `initialize` / `tools/list`를 probe한다
- 남은 것:
  - SSE/streamable-http/session lifecycle 차이
  - auth-required MCP server probe policy
  - long-lived MCP capability cache

### 2. Windows/WSL product-shell validation follow-up

- Windows native shell smoke

### 3. cross-device tunnel

- local ingress decision은 `musu-port`
- remote peer bridge / cross-device byte tunnel은 `musu-connects`
