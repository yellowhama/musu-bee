# Project Agent Attachment And Session Model

작성일: 2026-04-01

## 목적

회사 소속 agent가 프로젝트에 attach 되어 실제로 어떻게 실행되는지 `identity`, `attachment`, `session`, `runtime` 단위로 고정한다.

이 문서는 `OpenClaw`를 실행 runtime reference로, `GStack`을 operating mode reference로, MUSU 원본의 `agent registry/proxy/mcp/actions`를 실제 backport anchor로 본다.

## 핵심 정의

- 회사는 agent identity를 소유한다.
- 프로젝트는 agent를 attach 해서 execution context를 만든다.
- attach 된 agent는 세션을 통해 실제 작업한다.
- 세션은 ephemeral하지만 audit 가능해야 한다.

## 원본 코드 truth

현재 원본 MUSU는 이미 아래 축을 갖고 있다.

- agent manifest register/list/get/status
  - `/mnt/f/Aisaak/Projects/Musu-new/src/crates/musu-prime/src/api/routes/agents.rs`
- named reverse proxy for registered agents
  - `/mnt/f/Aisaak/Projects/Musu-new/src/crates/musu-prime/src/api/routes/proxy.rs`
- MCP tool exposure and job dispatch
  - `/mnt/f/Aisaak/Projects/Musu-new/src/crates/musu-prime/src/api/routes/mcp.rs`
- human action endpoints and audit append
  - `/mnt/f/Aisaak/Projects/Musu-new/src/crates/musu-prime/src/api/routes/actions.rs`

즉 필요한 것은 session runtime을 0에서 새로 상상하는 것이 아니라, 기존 registry/proxy/tool/action 축 위에 `company/project attachment context`를 얹는 것이다.

## 엔티티 구분

### 1. Company Agent Identity

회사에 영속적으로 속한 agent.

필드:

- `agent_id`
- `company_id`
- `base_role_id`
- `display_name`
- `manifest_ref`
- `default_policy_profile`
- `default_capability_set`
- `employment_state`

### 2. Project Attachment

특정 프로젝트에서 해당 agent를 쓰기 위한 배치 단위.

필드:

- `attachment_id`
- `project_id`
- `agent_id`
- `project_role_label`
- `assignment_scope`
- `status`
- `attached_at`
- `detached_at`
- `project_instruction_overlay`
- `workspace_mount`
- `budget_override`

### 3. Session

attach 된 agent가 실제로 한 번의 작업 흐름을 수행하는 runtime instance.

필드:

- `session_id`
- `attachment_id`
- `run_id`
- `channel`
- `runtime_state`
- `started_at`
- `ended_at`
- `workspace_root`
- `effective_policy_profile`
- `tool_trace_ref`

## attachment 상태

- `proposed`
- `active`
- `idle`
- `suspended`
- `draining`
- `detached`

기본 규칙:

- agent identity는 삭제되지 않아도 attachment는 끝날 수 있다.
- 프로젝트가 끝나면 attachment는 detach 되고 audit은 남는다.

## session 상태

- `starting`
- `running`
- `waiting_for_approval`
- `blocked`
- `completed`
- `failed`
- `terminated`

## OpenClaw식 실행 레이어를 MUSU에 끼우는 법

OpenClaw에서 직접 참고할 것은 아래다.

- gateway/control plane 분리
- session 중심 상태
- channel/tool execution
- ACP/IDE bridge

MUSU에선 이를 다음처럼 해석한다.

- `company`는 PaperClip식 control plane
- `project attachment`는 execution assignment
- `session`은 OpenClaw식 runtime loop
- `mode`는 GStack식 workflow discipline

## GStack식 mode 전환

한 attachment는 세션마다 다른 mode를 쓸 수 있다.

- `plan`
- `build`
- `review`
- `qa`
- `ship`
- `audit`

예:

- 같은 `builder` agent라도 session A는 `plan`, session B는 `build`
- 같은 `reviewer`라도 session A는 `review`, session B는 `audit`

즉 role은 stable identity, mode는 session-time behavior다.

## 채널 모델

최소 채널 타입:

- `cli`
- `ide`
- `mcp`
- `dashboard`
- `api`

해석:

- `cli`: Codex/Claude/Gemini 같은 consumer
- `ide`: ACP 또는 editor bridge
- `mcp`: MUSU self-MCP surface
- `dashboard`: 회사/프로젝트 UI에서 시작된 세션
- `api`: 자동화나 webhook

## workspace와 memory

session은 아래 mount를 가진다.

- company memory: read-mostly
- project memory: read/write
- session scratchpad: ephemeral
- workspace root: project-scoped path

즉 attachment는 "어디에서 일하는가"를 정하고, session은 "지금 무엇을 하는가"를 정한다.

## approval과 audit

attachment/session 레이어에서 최소 기록해야 하는 것:

- attachment created
- session started
- mode changed
- approval requested
- approval resolved
- destructive action attempted
- session ended

이 기록은 현재 원본 `actions.rs`의 action audit append 패턴과 자연스럽게 연결된다.

## MCP / API 표면 초안

- `musu_company_list_agents`
- `musu_project_attach_agent`
- `musu_project_detach_agent`
- `musu_project_list_attached_agents`
- `musu_project_start_agent_session`
- `musu_project_list_agent_sessions`
- `musu_project_get_agent_session`
- `musu_project_terminate_agent_session`

## persistence 연결

기존 draft schema에 아래가 중요하다.

- `company_agents`
- `project_agent_attachments`
- `project_runs`

필요하면 추가 후보:

- `project_agent_sessions`
- `project_agent_session_events`

## 구현 우선순위

1. attachment/session contract 문서화
2. mock fixture에 attached agents와 active sessions 추가
3. viewer에 project agents/session panel 추가
4. original app backport 시 registry/proxy/routes와 연결

## 결론

MUSU의 실행 모델은:

- 회사가 agent를 소유하고
- 프로젝트가 agent를 attach 하며
- 세션이 실제 실행을 담당하고
- mode가 세션의 workflow discipline을 결정하는 구조

로 가야 한다.
