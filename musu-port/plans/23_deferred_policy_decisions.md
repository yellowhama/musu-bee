# 23 Deferred Policy Decisions

## 목표

코드 구현과 별개로 열려 있던 정책 항목을 실제 기본값과 계약으로 고정한다.

## 범위

- deeper MCP probe
- device profile validation
- device profile template priority
- `/connect/{service}` actual tunnel scope

## 현재 상태

- policy defaults와 escalation 범위를 2026-04-01 기준으로 고정 완료
- 구현까지 반영됨

## 결정 결과

- deeper MCP probe
  - 기본 순서: `health -> initialize -> tools/list`
  - profile 키: `health.mcp_probe_mode`, `health.mcp_rpc_paths`
- device profile validation
  - 기본값: `validation.on_error=warn`
  - strict 모드: `validation.on_error=fail`
- template priority
  - score 입력: `match_process_names`, `match_protocols`, `match_ports`, `priority`
- connect contract
  - `/connect/{service}`는 tunnel endpoint가 아니라 decision endpoint
  - 응답 계약: `delivery_contract=connect_url_handoff`
  - remote bridge는 `musu-connects` 책임
