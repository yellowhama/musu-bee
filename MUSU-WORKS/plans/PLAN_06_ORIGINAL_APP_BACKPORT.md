# PLAN 06: Original App Backport

## 목적

`MUSU-WORKS`에서 고정한 company/project 모델을 원본 MUSU 앱에 어떻게 넣을지 backport 경로를 정리한다.

## 입력

- `MUSU-WORKS`의 canonical docs
- 원본 MUSU code truth

## 범위

- 어디에 `company_id`를 넣을지
- 기존 `project_id` flow와 어떻게 연결할지
- approval / audit / policy를 어디서 재사용할지
- UI와 MCP backport 범위

## 완료 조건

- 원본 앱 반영 경로가 파일/모듈 단위로 보인다.
- "새로 만들 것"과 "재사용할 것"이 구분돼 있다.
