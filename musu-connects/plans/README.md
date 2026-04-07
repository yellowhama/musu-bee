# Detailed Plan Rules

이 폴더는 `musu-connects` 구현 단계별 세부 플랜 문서를 쌓는 곳이다.

## 파일명 규칙

- `NN_<slug>.md`

예:

- `01_port_contract_freeze.md`
- `02_peer_identity_and_discovery.md`
- `03_advertisement_import_plane.md`
- `04_transport_and_health.md`
- `05_port_integration_execution_prep.md`
- `06_quic_transport_baseline.md`
- `07_discovery_and_route_sync_baseline.md`
- `08_port_adapter_integration.md`

## 각 문서 최소 구성

반드시 아래 항목을 포함한다.

- 목표
- 참조 문서
- 이번 단계 범위
- 제외 범위
- 구현 작업 목록
- 검증 방법
- 보류 항목
- 완료 기준

## 운영 규칙

- 코드 작성 전에 해당 단계 세부 플랜을 먼저 만든다.
- 구현 중 범위가 바뀌면 세부 플랜 문서를 먼저 갱신한다.
- 단계 완료 후 결과와 남은 차이를 문서에 짧게 남긴다.
- 다음 단계는 새 문서로 분리한다.
