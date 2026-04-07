# Slice 03 Backport Timing Decision

작성일: 2026-04-02

## 대상

`Slice 3 - remote session controller`

## 현재 판단

결정: `later`

## 이유

- `MUSU-CRT` 안에서는 canonical harness proof가 이미 닫혔다.
- 하지만 원본 repo 반영은 아직 relay/auth/room orchestration 경계와 섞일 여지가 있다.
- 따라서 지금 당장은 원본에 넣기보다 `MUSU-CRT`에서 contract와 entry 범위를 고정한 뒤 다음 backport window에서 반영하는 쪽이 안전하다.

## 준비 완료된 것

- canonical plan
  - [REMOTE_SESSION_CANONICAL_PLAN.md](/home/hugh51/musu-functions/MUSU-CRT/REMOTE_SESSION_CANONICAL_PLAN.md)
- canonical proof
  - [REMOTE_SESSION_CANONICAL_PROOF_2026-04-02.md](/home/hugh51/musu-functions/MUSU-CRT/REMOTE_SESSION_CANONICAL_PROOF_2026-04-02.md)
- backport entry note
  - [FIRST_BACKPORT_SLICE_03_REMOTE_SESSION_ENTRY.md](/home/hugh51/musu-functions/MUSU-CRT/FIRST_BACKPORT_SLICE_03_REMOTE_SESSION_ENTRY.md)

## 다음 window 진입 조건

1. backport execution sequence 재확인
2. runtime refactor gate 재확인
3. relay/auth/room orchestration을 범위 밖으로 유지할 수 있는지 다시 확인
