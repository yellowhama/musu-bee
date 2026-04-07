# 07 QUIC Extended Policy Surface

## 목표

원본 포트 매니저의 확장 기능 중 필요한 범위를 따라간다.

## 원본 참조 파일

- `/mnt/f/Aisaak/Projects/Musu-new/release/musu-desktop/src-tauri/src/port_manager_l4.rs`
- `/mnt/f/Aisaak/Projects/Musu-new/release/musu-desktop/src-tauri/src/commands/port_manager.rs`

## 이번 단계 범위

- QUIC passthrough
- QUIC probe
- audit policy preset
- connect mode / stable readiness
- metadata export / history

## 제외 범위

- 주변 제품 기능 연동

## 구현 작업 목록

- `protocol=quic` promote 경로를 `musu-port` 상태/route 모델에 추가
- QUIC runner contract를 TCP runner와 분리해 설계
- quick probe 결과를 metrics/json 또는 별도 summary 표면으로 노출
- audit policy 타입과 기본값/정규화 규칙을 원본 기준으로 정의
- audit policy get/set/apply-preset API를 추가
- connect mode `disabled|preview|stable` 저장과 env 반영 방식을 추가
- `stable_ready` 판정 규칙을 coverage 데이터에서 계산
- metadata consistency report 계산 로직을 추가
- metadata export `json|markdown`와 export history 저장을 추가
- 각 기능 중 parity 대상과 제외 대상을 구현 후 문서에 명시

## 검증 방법

- QUIC test endpoint
- QUIC dead/live target probe smoke
- audit policy preset 변경 smoke test
- connect mode stable blocker 계산 테스트
- metadata export file 생성 및 history 확인

## 보류 항목

- metadata dual-path status는 `musu-port` standalone 범위에 남길지 별도 결정 필요
- connect denied audit drain은 Phase 8 parity 비교 후 추가 여부 결정
- full parity가 필요 없는 기능은 명시적으로 제외

## 완료 기준

- `quic`, `audit policy`, `connect mode`, `metadata export` 중 선택한 범위가 실제 코드/endpoint로 동작한다
- stable readiness blocker 규칙이 문서와 코드에서 일치한다
- 제외된 항목은 왜 제외했는지 Phase 8로 넘길 수 있게 기록된다

## 진행 결과

- 부분 완료
- 이번 라운드에서 구현된 범위:
  - audit policy get/set/preset
  - connect mode get/set/status
  - metadata report/export/history
  - metadata consistency report 계산
  - QUIC passthrough runner
  - QUIC probe summary
  - connect stable probe/history
- 이번 라운드에서 아직 남은 범위:
  - 없음
  - 후속 coverage 집계는 `11_coverage_parity_surface.md`로 분리
- 검증 결과:
  - `./scripts/linux-rust-env.sh cargo check` 통과
  - `./scripts/linux-rust-env.sh cargo test -p musu-port-core` 통과
  - `/audit/policy`, `/connect/status`, `/metadata/report`, `/metadata/export` smoke 확인
  - `/quic/probe/summary`, `/connect/stable-probe`, `/connect/stable-probe/history` smoke 확인
  - `protocol=quic` promote 후 UDP payload forward 확인
