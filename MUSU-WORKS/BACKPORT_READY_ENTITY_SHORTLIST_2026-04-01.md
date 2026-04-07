# Backport Ready Entity Shortlist 2026-04-01

## 목적

원본 MUSU에 `회사` 모델을 한 번에 다 넣지 않고, 먼저 넣어도 되는 `read model / entity`를 우선순위 순으로 고정한다.

## 선정 원칙

- 기존 `project_id` 실행 코어를 흔들지 않는다.
- read-only projection부터 넣는다.
- approval/audit/agent/runtime anchor를 최대한 재사용한다.
- desktop UI와 MCP read surface에 바로 연결될 수 있어야 한다.

## Tier 1: 바로 넣어도 되는 것

### 1. `companies`

목적:

- 회사 top-level context
- company switcher와 overview header의 기반

이유:

- 기존 `project_id` 흐름과 직접 충돌하지 않는다.
- read-only projection으로 먼저 도입 가능하다.

### 2. `company_role_templates`

목적:

- GStack식 역할 템플릿 catalog
- 회사가 agent operating contract를 소유하게 함

이유:

- runtime 코어 변경 없이 viewer/MCP/UI에 읽기용으로 붙일 수 있다.

### 3. `company_project_index`

목적:

- 회사와 프로젝트를 연결하는 read model

이유:

- 현재 project 중심 구조를 유지하면서 company plane을 보여줄 수 있다.

### 4. `company_approvals_queue_read_model`

목적:

- existing action/audit 이벤트를 회사 단위 queue로 읽기

이유:

- approval 시스템 재작성 없이 queue projection으로 먼저 증명 가능하다.

## Tier 2: 다음 컷으로 넣을 것

### 5. `project_agent_attachments`

목적:

- 회사 agent identity와 프로젝트 assignment를 분리

이유:

- 기존 agent registry를 유지하면서도 canonical contract를 반영할 수 있다.

### 6. `project_agent_sessions`

목적:

- OpenClaw/NanoClaw식 session runtime read model

이유:

- live session, mode, channel, isolation을 UI/MCP에서 읽기 위해 필요하다.

### 7. `company_org_chart_projection`

목적:

- reports-to 관계를 회사 단위 조직도로 읽기

이유:

- company viewer의 핵심이지만, tier 1이 먼저 있어야 의미가 커진다.

## Tier 3: 뒤로 미뤄도 되는 것

### 8. `company_memories`

이유:

- 중요하지만 company plane read proof보다 우선순위는 낮다.

### 9. `project_policy_overrides`

이유:

- policy explainability에는 중요하지만, first read-only cut의 blocker는 아니다.

### 10. `human_principals`

이유:

- 장기적으로는 필요하지만, 초기 company plane proof와 viewer 구현에는 없어도 된다.

## 추천 구현 순서

1. `companies`
2. `company_role_templates`
3. `company_project_index`
4. `company_approvals_queue_read_model`
5. `project_agent_attachments`
6. `project_agent_sessions`
7. `company_org_chart_projection`

## 원본 코드 연결

- `companies` / `company_project_index`
  - [`warden/types.rs`](/mnt/f/Aisaak/Projects/Musu-new/src/crates/musu-gateway/src/warden/types.rs)
  - [`warden/manager.rs`](/mnt/f/Aisaak/Projects/Musu-new/src/crates/musu-gateway/src/warden/manager.rs)
- `company_approvals_queue_read_model`
  - [`actions.rs`](/mnt/f/Aisaak/Projects/Musu-new/src/crates/musu-prime/src/api/routes/actions.rs)
  - [`git_dpi.rs`](/mnt/f/Aisaak/Projects/Musu-new/src/crates/musu-gateway/src/bridge/git_dpi.rs)
- `project_agent_attachments` / `project_agent_sessions`
  - [`agents.rs`](/mnt/f/Aisaak/Projects/Musu-new/src/crates/musu-prime/src/api/routes/agents.rs)
  - [`proxy.rs`](/mnt/f/Aisaak/Projects/Musu-new/src/crates/musu-prime/src/api/routes/proxy.rs)
  - [`mcp.rs`](/mnt/f/Aisaak/Projects/Musu-new/src/crates/musu-prime/src/api/routes/mcp.rs)

## 현재 결론

원본 MUSU에 먼저 넣을 것은 `회사 엔진`이 아니라:

- company context
- role template catalog
- project index
- approval queue projection

같은 read-first entity들이다.
