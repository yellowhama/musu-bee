# Plan 06. Control Surface Productization

## 목표

`musu_corp`의 control CLI / runtime status surface를 `musu-functions` 제품 capability 후보로 고정한다.

## 대상 프로젝트

- `musu_corp`
- `musu-functions` 루트

## 참조 문서

- `/home/hugh51/musu_corp/musu_corp_cli.py`
- `/home/hugh51/musu-functions/COMPANY_CAPABILITY_REPATRIATION_MAP.md`
- `/home/hugh51/musu-functions/PRODUCTIZATION_SEQUENCE.md`

## 이번 단계 범위

- control CLI의 제품 target 고정
- 루트 control surface 역할 정의

## 제외 범위

- 실제 CLI 코드 이동
- MCP wrapping

## 구현 작업 목록

1. control CLI surface를 product capability로 분류한다.
2. watchdog/supervisor/report 조회 surface를 묶어 해석한다.
3. 루트 TODO에 다음 cut로 반영한다.

## 검증 방법

- 루트 문서만 읽어도 control CLI가 회사 전용인지 제품 기능 후보인지 구분된다.

## 완료 기준

- control surface가 product repatriation cut 1로 고정된다.
