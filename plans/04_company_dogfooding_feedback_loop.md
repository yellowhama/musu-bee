# Plan 04. Company Dogfooding Feedback Loop

## 목표

- `musu_corp`에서 실제 운영으로 검증된 기능을 제품 capability 관점으로 다시 읽는다.

## 대상 프로젝트

- `musu_corp`
- `musu-functions`
- `MUSU-WORKS`

## 참조 문서

- `/home/hugh51/musu_corp/MASTER_PLAN.md`
- `/home/hugh51/musu-functions/MASTER_PLAN.md`
- `/home/hugh51/musu-functions/DOGFOODING_PRODUCT_MODEL.md`

## 이번 단계 범위

- 회사 기능을 제품 capability 후보로 분류
- 회사 인스턴스 전용 로직과 제품 로직 분리

## 제외 범위

- 실제 코드 이동
- 템플릿 생성

## 구현 작업 목록

1. `musu_corp`의 주요 운영 기능을 리스트업한다.
2. 각 기능이 제품 capability인지 instance runtime인지 분리한다.
3. 루트 current state / todo에 반영한다.

## 검증 방법

- 루트 문서만 읽어도 회사-제품 관계가 헷갈리지 않아야 한다.

## 보류 항목

- 실제 repatriation cut은 다음 플랜에서 다룬다.

## 완료 기준

- 회사 도그푸딩 결과를 제품 capability로 읽는 기준이 문서로 고정된다.
