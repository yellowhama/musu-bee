# MUSU-WORKS Persistence Schema Draft

## 목표

회사, 프로젝트, agent attachment 모델을 실제 persistence 계층에 넣을 수 있는 최소 schema로 고정한다.

## 설계 원칙

- 기존 MUSU의 `project_id` 축을 버리지 않는다.
- 회사는 상위 orchestration owner다.
- 프로젝트는 실행 unit이다.
- agent identity는 회사에 속하고, 프로젝트에는 attachment로 연결된다.
- approval / audit / policy는 회사 레벨 기본값을 갖고, 프로젝트는 context와 override를 제공한다.

## 핵심 엔티티

### companies

- `id`
- `slug`
- `name`
- `mission`
- `description`
- `status`
- `primary_agent_id`
- `created_at`
- `updated_at`

### company_agents

- `id`
- `company_id`
- `agent_key`
- `display_name`
- `role_type`
- `model_provider`
- `model_name`
- `status`
- `reports_to_agent_id`
- `hiring_state`
- `default_budget_limit`
- `default_policy_profile`
- `created_at`
- `updated_at`

### company_policies

- `id`
- `company_id`
- `policy_kind`
- `policy_name`
- `policy_json`
- `is_default`
- `created_at`
- `updated_at`

### company_capabilities

- `id`
- `company_id`
- `capability_key`
- `capability_kind`
- `title`
- `config_json`
- `enabled`
- `created_at`
- `updated_at`

### company_approvals

- `id`
- `company_id`
- `project_id`
- `approval_kind`
- `request_payload_json`
- `status`
- `requested_by_agent_id`
- `approved_by_agent_id`
- `reason`
- `requested_at`
- `resolved_at`

### projects

- `id`
- `company_id`
- `project_key`
- `name`
- `description`
- `workspace_root`
- `repo_url`
- `status`
- `risk_level`
- `memory_profile`
- `created_at`
- `updated_at`

### project_agent_attachments

- `id`
- `project_id`
- `company_agent_id`
- `project_role`
- `assignment_scope`
- `instructions_json`
- `status`
- `attached_at`
- `detached_at`

### project_pipelines

- `id`
- `project_id`
- `pipeline_key`
- `name`
- `definition_json`
- `status`
- `created_at`
- `updated_at`

### project_runs

- `id`
- `project_id`
- `pipeline_id`
- `run_key`
- `trigger_kind`
- `trigger_payload_json`
- `status`
- `started_at`
- `finished_at`

### project_agent_sessions

- `id`
- `project_id`
- `project_attachment_id`
- `run_id`
- `mode`
- `channel`
- `runtime_state`
- `workspace_root`
- `effective_policy_profile`
- `isolation_profile`
- `started_at`
- `ended_at`

### project_agent_session_events

- `id`
- `session_id`
- `event_kind`
- `summary`
- `payload_json`
- `created_at`

### project_memories

- `id`
- `project_id`
- `memory_kind`
- `title`
- `content_json`
- `source`
- `created_at`
- `updated_at`

## 관계

- `companies 1:N company_agents`
- `companies 1:N company_policies`
- `companies 1:N company_capabilities`
- `companies 1:N company_approvals`
- `companies 1:N projects`
- `projects 1:N project_agent_attachments`
- `projects 1:N project_pipelines`
- `projects 1:N project_runs`
- `projects 1:N project_agent_sessions`
- `projects 1:N project_memories`
- `company_agents 1:N project_agent_attachments`
- `project_agent_attachments 1:N project_agent_sessions`
- `project_agent_sessions 1:N project_agent_session_events`
- `company_agents self-reference reports_to_agent_id`

## 핵심 foreign key

- `company_agents.company_id -> companies.id`
- `company_agents.reports_to_agent_id -> company_agents.id`
- `company_policies.company_id -> companies.id`
- `company_capabilities.company_id -> companies.id`
- `company_approvals.company_id -> companies.id`
- `company_approvals.project_id -> projects.id`
- `company_approvals.requested_by_agent_id -> company_agents.id`
- `company_approvals.approved_by_agent_id -> company_agents.id`
- `projects.company_id -> companies.id`
- `project_agent_attachments.project_id -> projects.id`
- `project_agent_attachments.company_agent_id -> company_agents.id`
- `project_pipelines.project_id -> projects.id`
- `project_runs.project_id -> projects.id`
- `project_runs.pipeline_id -> project_pipelines.id`
- `project_agent_sessions.project_id -> projects.id`
- `project_agent_sessions.project_attachment_id -> project_agent_attachments.id`
- `project_agent_session_events.session_id -> project_agent_sessions.id`
- `project_memories.project_id -> projects.id`

## ownership boundary

### 회사가 직접 소유

- agent identity
- policy baseline
- capability catalog
- approval queue
- org hierarchy

### 프로젝트가 직접 소유

- workspace root
- repo binding
- deliverable context
- pipeline
- run history
- project memory

### attachment가 소유

- project role
- assignment scope
- project-specific instructions
- active/idle/suspended 상태

### session이 소유

- current mode
- runtime state
- channel
- effective policy profile
- isolation profile
- tool trace / event stream

## 기존 MUSU 코드와의 연결

현재 원본 코드와 자연스럽게 연결되는 축은 아래다.

- `projects.id`는 현재의 `project_id`와 매핑 가능
- `projects.workspace_root`는 기존 `workspace_root` 축과 연결 가능
- `company_approvals`는 기존 approval / audit / policy 시스템의 상위 requester context가 될 수 있음
- `project_runs`는 기존 action / run / audit history와 연결 가능

## migration path

### Step 1

- 기존 `project_id`를 유지한 채 `projects` 테이블 도입

### Step 2

- `companies`와 `company_agents` 추가

### Step 3

- 기존 approval / audit event에 `company_id`를 optional context로 붙임

### Step 4

- `project_agent_attachments`로 agent assignment를 project 단위로 드러냄

### Step 5

- `project_agent_sessions`와 `project_agent_session_events`로 execution runtime을 영속화

## open questions

- 회사 memory는 `company_memories`로 별도 분리하는 것이 맞다
- 회사 policy baseline과 project override는 분리 테이블 또는 분리 kind가 맞다
- human operator는 장기적으로 별도 principal 테이블이 맞지만, 초기 단계에서는 `company_agents`와 audit actor field 병행이 가능하다
- session persistence는 필요하다

## 현재 결론

최소 schema는 이미 충분히 정해졌다. 다음은 이걸 기반으로 UI 정보 구조와 MCP read surface를 고정하면 된다.
