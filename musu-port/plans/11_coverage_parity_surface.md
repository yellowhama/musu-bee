# 11 Coverage Parity Surface

## 목표

현재 `musu-port`에 흩어져 있는 control-plane 상태를 원본 `port_manager_coverage`에 대응되는 단일 coverage snapshot으로 묶는다.

## 원본 참조 파일

- `/mnt/f/Aisaak/Projects/Musu-new/release/musu-desktop/src-tauri/src/commands/port_manager.rs`
- `/mnt/f/Aisaak/Projects/Musu-new/release/musu-desktop/src-tauri/src/port_manager.rs`
- `/mnt/f/Aisaak/Projects/Musu-new/release/musu-desktop/src-tauri/src/port_manager_l4.rs`

## 이번 단계 범위

- coverage report 타입 정의
- standalone coverage endpoint 정의
- managed route / unmanaged discovery / ignored signature / L4 runner / QUIC summary / connect status / audit / metadata report 통합
- alert level / alert messages / `all_known_endpoints_managed` 계산
- standalone 범위 밖 parity 필드의 처리 규칙 문서화

## 제외 범위

- `connect/{service}` 실제 tunnel surface
- `/audit/connect-denied` drain 복제
- `metadata_dual_path_status` 생성 런타임
- `mcp_broker` auto promote
- Tauri command layer 복제

## 구현 작업 목록

- `PortManagerCoverageReport`에 대응되는 standalone 타입을 `musu-port-core`에 정의
- coverage payload에 포함할 필드와 optional/null 처리 규칙을 확정
- 현재 구현된 표면에서 필요한 데이터를 재사용하도록 `state.rs` 집계 메서드를 설계
- `supervisor_routes`, `external_routes`, `total_managed_routes`, `managed_aliases` 계산 추가
- `ignored_signatures`, `l4_runners`, `quic_probe_summary`, `connect_status`, `metadata_report`, `audit_policy`, `audit_summary`, `audit_events`를 한 payload로 결합
- standalone에서 계산 가능한 `uncovered_endpoints` 규칙을 명시하고 최소 집합부터 구현
- `alert_level`, `alert_messages`, `all_known_endpoints_managed`를 원본과 비교 가능한 규칙으로 고정
- HTTP endpoint를 추가하고 smoke 시나리오를 정리
- 구현 후 parity 대상/비대상 필드를 문서에 남긴다

## 검증 방법

- `cargo test -p musu-port-core`
- coverage 집계 전용 unit test
- `GET /coverage` live smoke
- HTTP seed + promoted TCP/QUIC + ignored signature 조합 시나리오 smoke
- 원본 `PortManagerCoverageReport` 필드 목록과 standalone payload 비교 체크

## 보류 항목

- `metadata_dual_path_status`는 Phase 8에서 parity note로 남길지 별도 구현할지 결정 필요
- `connect denied` audit drain은 `musu-connects` 책임과 겹치므로 Phase 8에서 재평가
- known endpoint gap 평가 규칙은 standalone 범위에서 최소 집합으로 시작하고, 원본 상수 의존이 큰 부분은 차이 문서에 남길 수 있음

## 완료 기준

- `musu-port`가 단일 endpoint로 coverage snapshot을 반환한다
- 현재 구현된 control-plane 상태를 한 payload에서 읽을 수 있다
- parity 대상 필드와 intentionally omitted 필드가 문서에 명확히 남아 있다
- 다음 단계인 `08_parity_verification.md`에서 fixture/smoke 비교를 바로 시작할 수 있다

## 시작 시점 메모

- 2026-04-01 기준 Phase 7 core는 구현 완료
- 현재 coverage 관련 정보는 `/discovery`, `/l4/runners`, `/connect/status`, `/quic/probe/summary`, `/metadata/report`, `/audit/*`로 분산돼 있다
- 다음 구현은 이 분산 상태를 하나로 묶는 집계 계층부터 시작하면 된다

## 진행 결과

- 완료
- 이번 라운드에서 구현된 범위:
  - `CoverageReport` / `CoverageEndpointGap` 타입 추가
  - `GET /coverage` endpoint 추가
  - managed alias / external route / ignored signature / L4 runner / QUIC summary / connect status / audit / metadata 집계 추가
  - `alert_level`, `alert_messages`, `all_known_endpoints_managed` 계산 추가
  - managed port 계산에 promoted L4 target port도 포함되도록 보정
- parity 제외/고정 항목:
  - `metadata_dual_path_status`: standalone에서 `null`
  - `connect denied` audit drain: 미구현, Phase 8 note 대상
  - `mcp_broker` auto promote: 미구현, Phase 8 note 대상
- 검증 결과:
  - `./scripts/linux-rust-env.sh cargo test -p musu-port-core` 통과
  - `GET /coverage` live smoke 확인
  - coverage payload 핵심 필드와 `metadata_dual_path_status=null` 확인
