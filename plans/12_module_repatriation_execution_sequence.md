# 12. Module Repatriation Execution Sequence

## 목표

루트 ownership/productization 문서를 각 bounded context가 실제로 받을 실행 순서로 변환한다.

## 대상 프로젝트

- `musu-functions` 루트
- `MUSU-WORKS`
- `MUSU-AS-MCP`
- 이후 `musu-port`, `musu-connects`, `MUSU-CRT`

## 참조 문서

- `COMPANY_CAPABILITY_REPATRIATION_MAP.md`
- `PRODUCTIZATION_SEQUENCE.md`
- `ROOT_PRODUCT_CONTROL_LAYER_MODEL.md`
- `ROOT_RUNTIME_CAPABILITY_MODEL.md`
- `MUSU-WORKS/COMPANY_RUNTIME_PRODUCTIZATION_MAP.md`

## 이번 단계 범위

- 루트 ownership을 모듈 실행 순서로 재정리
- 모듈별 immediate productization cut을 나열
- active/queued todo 재정렬 기준 마련

## 제외 범위

- 실제 코드 이동
- 모듈 내부 구현 상세
- 원본 모노리스 backport

## 구현 작업 목록

1. 루트 execution sequence 문서 작성
2. `MUSU-WORKS` contract shortlist 문서 추가
3. 루트 `MASTER_PLAN.md`, `CURRENT_STATE.md`, `TODO_EXECUTION_BOARD.md`를 execution sequence 기준으로 갱신
4. `MUSU-WORKS` `MASTER_PLAN.md`, `CURRENT_STATE.md`, `TODO_EXECUTION_BOARD.md`를 company runtime productization 기준으로 재정렬

## 검증 방법

- 루트 문서만 읽어도 다음 active cut이 보인다
- `MUSU-WORKS`가 예전 viewer closure보다 productization active로 읽힌다
- queued 항목이 ownership/productization 순서에 맞는다

## 보류 항목

- `MUSU-AS-MCP` consumer surface의 세부 read model
- `musu-port`, `musu-connects`와의 최종 통합 순서

## 완료 기준

- 루트와 `MUSU-WORKS`의 active/queued가 productization 기준으로 정렬된다
- 모듈별 next cut이 문서로 명시된다
