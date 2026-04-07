# Plan 07. Company Runtime Contract Productization

## 목표

queue/lane/worker/handoff 계약을 `musu-functions` 정식 capability로 올릴 target context를 고정한다.

## 대상 프로젝트

- `musu_corp`
- `MUSU-WORKS`

## 참조 문서

- `/home/hugh51/musu_corp/runtime/schemas`
- `/home/hugh51/musu-functions/COMPANY_CAPABILITY_REPATRIATION_MAP.md`

## 이번 단계 범위

- schema ownership 정리
- `MUSU-WORKS` target 확정

## 제외 범위

- 실제 schema 이동

## 구현 작업 목록

1. queue item / lane state / worker result / handoff payload의 target owner를 정리한다.
2. `MUSU-WORKS`가 가져갈 contract 후보를 명시한다.

## 검증 방법

- 각 schema의 최종 owner가 문서에 명확히 적혀 있다.

## 완료 기준

- company runtime contract의 제품 소유 위치가 고정된다.
