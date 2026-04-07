# MUSU-WORKS Vision

## 한 줄 정의

> 회사는 AI agent 운영 단위이고, 프로젝트는 그 회사를 이용해 실제 일을 하는 실행 단위다.

## 왜 필요한가

MUSU에서 agent를 그냥 프로젝트 안의 부속물로 보면 운영, 정책, memory, approval, audit ownership이 흐려진다.

반대로 회사/프로젝트를 분리하면:

- 회사는 운영 레이어
- 프로젝트는 실행 레이어

로 명확해진다.

## 기대 구조

### 회사가 가지는 것

- capability catalog
- worker pool
- policy / approval rules
- shared memory / standard
- audit ownership

### 프로젝트가 가지는 것

- 실행 목표
- active context
- task timeline
- deliverable set
- project-specific overrides

## 최종적으로 가야 할 방향

- UI에서 회사와 프로젝트가 명확히 보인다
- MCP에서도 회사와 프로젝트를 별도 surface로 읽을 수 있다
- agent orchestration이 회사 기준으로 이해된다
- 실제 작업은 프로젝트 기준으로 추적된다
