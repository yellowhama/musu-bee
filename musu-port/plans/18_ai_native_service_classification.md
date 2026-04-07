# 18 AI Native Service Classification

## 목표

`musu-port`가 일반 HTTP/TCP 서비스와
AI-native service, 특히 MCP server surface를 구분할 수 있도록
service classification 계약을 추가한다.

## 배경

- `MUSU-AS-MCP`는 `musu-port`가 관리해야 할 대표적인 AI-native service다.
- 현재 `musu-port`는 protocol 중심으로만 route와 discovery를 다루고 있다.
- 하지만 장기 제품 계약은 `raw port -> managed ingress -> AI-native service identity`다.

관련 문서:

- `/home/hugh51/musu-functions/musu-port/MUSU_AS_MCP_RELATION.md`
- `/home/hugh51/musu-functions/musu-port/WINDOWS_WSL_ADAPTER_MATRIX.md`
- `/home/hugh51/musu-functions/MUSU-AS-MCP/MASTER_PLAN.md`

## 이번 단계 범위

- `service_class` 또는 동등한 metadata 분류 도입
- 최소 분류군 정의:
  - `generic_http`
  - `tcp_ingress`
  - `quic_ingress`
  - `mcp_server`
  - `agent_facing`
- health/report surface에 classification 노출

## 제외 범위

- full MCP protocol validation
- remote advertisement/import
- auto-promote

## 구현 작업 목록

- route/discovery/report 중 어디에 classification을 둘지 계약 고정
- MCP-like endpoint 식별 힌트 정의
- `/health`, `/coverage`, metadata/report에 classification 반영 위치 결정
- backward compatibility 영향 정리

## 검증 방법

- schema/unit test
- `cargo check`
- 필요 시 local fixture로 classification smoke

## 완료 기준

- `musu-port`가 MCP endpoint를 일반 HTTP 서비스와 별도 class로 다룰 수 있다
- classification이 문서와 code surface 양쪽에서 설명 가능하다

## 현재 상태

- `ServiceRoute` / `DiscoveredEndpoint`에 `service_class` / `agent_facing`가 들어갔다
- `/coverage`와 metadata report에 classification 집계가 반영됐다
- integration test로 MCP-like endpoint 분류 baseline을 검증했다
