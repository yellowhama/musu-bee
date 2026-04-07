# 02 Route Contract Freeze

## 목표

원본 포트 매니저의 route 모델과 route merge 규칙을 고정한다.

## 원본 참조 파일

- `/mnt/f/Aisaak/Projects/Musu-new/crates/musu-supervisor/src/supervisor.rs`
- `/mnt/f/Aisaak/Projects/Musu-new/release/musu-desktop/src-tauri/src/state.rs`
- `/mnt/f/Aisaak/Projects/Musu-new/release/musu-desktop/src-tauri/src/port_manager.rs`

## 이번 단계 범위

- `ServiceRoute` 타입
- seed supervisor route source
- `extra_routes`
- merge/sort
- base URL 계산

## 제외 범위

- promote command
- persistence
- discovery

## 구현 작업 목록

- `ServiceRoute` 정의
- seed service 입력 모델 정의
- route source 구현
- `extra_routes` store 구현
- merged route collector 구현
- alias 정렬 규칙 적용
- base URL env 반영

## 검증 방법

- seed route file 입력
- `/routes` 응답 검토
- fallback bind 상황에서 base URL 검토

## 보류 항목

- 원본 supervisor registry sync 파일 출력

## 완료 기준

- route JSON 구조가 원본과 유사
- seed + extra merge가 안정적으로 동작
