# 08 Parity Verification

## 목표

원본 `musu-desktop` 포트 매니저와 `musu-port`의 차이를 측정하고 정리한다.

## 원본 참조 파일

- `/mnt/f/Aisaak/Projects/Musu-new/release/musu-desktop/src-tauri/src/port_manager.rs`
- `/mnt/f/Aisaak/Projects/Musu-new/release/musu-desktop/src-tauri/src/commands/port_manager.rs`
- `/mnt/f/Aisaak/Projects/Musu-new/release/musu-desktop/src-tauri/src/port_manager_l4.rs`

## 이번 단계 범위

- route parity
- HTTP/TCP smoke parity
- discovery parity
- persistence parity
- coverage payload parity

## 제외 범위

- UI pixel parity

## 구현 작업 목록

- fixture 설계
- `11_coverage_parity_surface.md` 산출물 반영
- 비교 테스트 작성
- 수동 시나리오 표준화
- 차이점 문서 정리

## 검증 방법

- 자동 테스트
- 수동 smoke
- 차이 문서 검토

## 보류 항목

- 환경 의존적인 차이는 허용 여부 판단 필요

## 완료 기준

- 현재 parity 상태를 한 문서에서 설명 가능

## 선행 조건

- `11_coverage_parity_surface.md` 기준 coverage endpoint가 먼저 구현돼 있어야 한다

## 진행 결과

- 완료
- 이번 라운드에서 구현된 범위:
  - integration test `tests/parity_verification.rs` 추가
  - route / HTTP proxy / discovery / TCP promote / persistence recovery / coverage payload parity 시나리오 자동화
  - 원본 대비 intentional diff를 `PARITY_REPORT.md`에 문서화
- 검증 결과:
  - `./scripts/linux-rust-env.sh cargo test -p musu-port-core --test parity_verification -- --nocapture` 통과
  - `./scripts/linux-rust-env.sh cargo test -p musu-port-core` 통과
  - `GET /coverage` live smoke와 parity payload 핵심 필드 확인 완료
