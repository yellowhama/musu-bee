# Schema Decision Note 2026-04-01

## 목적

`MUSU-WORKS` persistence draft에 남아 있던 open question에 대해 현재 기준 결정을 고정한다.

## 결정 1. 회사 memory는 별도 테이블로 분리한다

결정:

- `company_memories`를 별도 테이블로 두는 방향이 맞다.

이유:

- 회사 memory와 프로젝트 memory는 ownership이 다르다.
- 회사 memory는 공통 정책, handbook, reusable knowledge를 담는다.
- 프로젝트 memory와 섞으면 scope와 retention이 흐려진다.

영향:

- `project_memories`는 유지
- `company_memories` 추가 후보를 final schema에 올린다

## 결정 2. company policy baseline과 project override는 분리한다

결정:

- 회사 baseline policy와 프로젝트 override는 같은 행을 덮어쓰는 모델보다 분리된 레벨로 관리하는 것이 맞다.

이유:

- audit과 explainability가 중요하다.
- "회사 기본값"과 "프로젝트 예외"를 분리해야 override 이유가 남는다.

권장 형태:

- `company_policies`
- `project_policy_overrides`

## 결정 3. human principal은 장기적으로 별도 엔티티가 맞다

결정:

- 장기적으로는 `human_principals` 또는 범용 `principals`가 맞다.
- 단기적으로는 `company_agents`와 audit actor field 병행으로 시작 가능하다.

이유:

- human operator와 AI agent는 생애주기와 인증 방식이 다르다.
- approval actor, policy actor, audit actor를 분리해야 나중에 권한 설계가 깨지지 않는다.

단기 처리:

- 초반 mock/viewer는 human principal을 별도 구현하지 않아도 된다.
- original app backport 직전 schema에서 분리 여부를 다시 확인한다.

## 결정 4. session persistence는 필요하다

결정:

- `project_agent_sessions`와 `project_agent_session_events`는 필요하다.

이유:

- OpenClaw/NanoClaw reference 기준으로도 runtime continuity와 event trace가 중요하다.
- attachment만으로는 현재 실행 상태, mode, channel, isolation 상태를 설명할 수 없다.
- viewer와 MCP surface도 live session 개념을 이미 요구하고 있다.

영향:

- `project_agent_sessions`
- `project_agent_session_events`

를 schema draft의 canonical 엔티티로 본다.

## 결정 5. role template는 persistence 대상이다

결정:

- role template는 문서 개념으로만 두지 않고 company-scoped persistence 후보로 본다.

권장 후보:

- `company_role_templates`

이유:

- 역할 템플릿은 정책, mode 허용 범위, approval scope를 내장한다.
- company fleet 운영 기준을 문서 바깥으로 빼야 viewer/API/MCP에서 일관되게 읽을 수 있다.

## 현재 결론

현재 schema 방향은 이렇다.

- 회사는 control plane owner
- 프로젝트는 execution owner
- attachment는 assignment owner
- session은 runtime owner
- role template는 company-scoped persistent contract

즉 다음 단계는 schema 자체를 더 추상화하는 것이 아니라, 이 결정을 mock/viewer/original app proof에 반영하는 것이다.
