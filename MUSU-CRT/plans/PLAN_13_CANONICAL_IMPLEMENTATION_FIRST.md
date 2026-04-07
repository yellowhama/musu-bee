# PLAN 13: Canonical Implementation First

## 목표

`MUSU-CRT`를 canonical 구현 공간으로 고정하고, `Musu-new`를 backport-later 대상으로 제한한다.

## 범위

- 구현 우선순위 재정렬
- master/current/todo 문서 기준 재정의
- backport policy 문서화

## 작업 목록

1. canonical workspace 원칙 문서화
2. current state에 구현 우선순위 반영
3. todo board를 `canonical first / backport later` 기준으로 재정렬

## 완료 기준

- [BACKPORT_LATER_POLICY.md](/home/hugh51/musu-functions/MUSU-CRT/BACKPORT_LATER_POLICY.md) 가 존재한다.
- `MASTER_PLAN.md`가 canonical implementation first 기준으로 정리된다.
