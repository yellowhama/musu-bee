# 06 Promote Ignore Persistence

## 목표

promote/ignore/audit 상태를 SQLite에 저장하고 재시작 후 복원한다.

## 원본 참조 파일

- `/mnt/f/Aisaak/Projects/Musu-new/release/musu-desktop/src-tauri/src/commands/port_manager.rs`
- `/mnt/f/Aisaak/Projects/Musu-new/release/musu-desktop/src-tauri/src/state.rs`

## 이번 단계 범위

- settings table
- promoted routes persistence
- ignore persistence
- audit persistence
- state restore

## 제외 범위

- UI
- Lighthouse write-through

## 구현 작업 목록

- SQLite 초기화
- settings get/set helper
- promoted routes serialize/deserialize
- ignored signatures serialize/deserialize
- audit event serialize/deserialize
- promote/ignore/unignore API
- stale cleanup persistence sync

## 검증 방법

- promote 후 재시작
- ignore 후 재시작
- audit record 확인

## 보류 항목

- Lighthouse 연동

## 완료 기준

- 재시작 후 상태 복원이 작동

## 현재 결과

- 코드 구현 완료, live restart smoke 보류
- 구현 완료:
  - `/promote`
  - `/ignore`
  - `/unignore`
  - `/audit/events`
  - SQLite settings schema
  - promoted / ignored / audit persistence
  - startup restore
  - stale cleanup persistence 반영
- 남은 검증:
  - 실제 재시작 후 promoted / ignored 상태 복원 smoke
