# 04 L4 Runtime TCP First

## 목표

promoted TCP route를 별도 bind port로 연결하는 최소 L4 runtime을 구현한다.

## 원본 참조 파일

- `/mnt/f/Aisaak/Projects/Musu-new/release/musu-desktop/src-tauri/src/port_manager_l4.rs`
- `/mnt/f/Aisaak/Projects/Musu-new/release/musu-desktop/src-tauri/src/port_manager.rs`

## 이번 단계 범위

- TCP desired spec
- reconcile loop
- TCP passthrough runner
- quick probe

## 제외 범위

- QUIC
- TLS termination
- persistence

## 구현 작업 목록

- `L4RouteContract` 최소 타입 설계
- `L4Runtime` runners/status 구현
- bind/target validation
- TCP runner spawn/stop
- quick alive probe
- reconcile loop integration

## 검증 방법

- TCP echo backend
- route 추가/삭제 반복
- runner 상태 관찰

## 보류 항목

- TLS optional/required

## 완료 기준

- promoted TCP alias가 실제 bind port로 작동

## 현재 결과

- 코드 구현 완료, live forward smoke 보류
- 구현 완료:
  - `L4Runtime`
  - route -> desired spec 변환
  - 2초 reconcile loop
  - TCP passthrough runner
  - runner status snapshot
  - dead route quick probe
  - `/l4/runners` endpoint
- 남은 검증:
  - 실제 TCP echo backend를 대상으로 promote 후 bind port 접속 확인
