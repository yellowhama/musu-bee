# 지금 이 회사는 어떻게 만들어져야 하는가

## 한 줄 정의

MUSU의 회사는 "AI agent들을 고용하고 운영 규칙을 소유하며 여러 프로젝트에 capability를 공급하는 상위 운영 단위"로 만들어져야 한다.

## 왜 회사가 먼저 필요한가

현재 MUSU 원본 코드에는 `project_id`, `workspace`, `policy`, `approval`, `audit` 축이 이미 있다.

- `project_id` 중심 세션/승인/감사 흔적:
  - `/mnt/f/Aisaak/Projects/Musu-new/src/crates/musu-gateway/src/warden/types.rs`
  - `/mnt/f/Aisaak/Projects/Musu-new/src/crates/musu-gateway/src/warden/manager.rs`
- workspace/root 개념:
  - `/mnt/f/Aisaak/Projects/Musu-new/src/crates/musu-node-bridge/src/scout.rs`
  - `/mnt/f/Aisaak/Projects/Musu-new/src/crates/musu-interceptor/src/config.rs`
  - `/mnt/f/Aisaak/Projects/Musu-new/src/crates/musu-prime/src/orchestrator/prime_loop.rs`
- policy / gate / approval 개념:
  - `/mnt/f/Aisaak/Projects/Musu-new/engines/vibecoding-helper/crates/gate/src/lib.rs`
  - `/mnt/f/Aisaak/Projects/Musu-new/src/crates/musu-gateway/src/bridge/git_dpi.rs`
  - `/mnt/f/Aisaak/Projects/Musu-new/crates/hive_link/src/mobile_api/registry.rs`

즉 MUSU는 이미 "프로젝트를 기준으로 실행을 통제하는 구조"를 많이 갖고 있다. 빠진 것은 그 프로젝트들을 묶고 운영 주체를 정의하는 `회사`다.

## PaperClip에서 가져올 핵심

`PAPERCLIP.MD` 기준으로 가져와야 하는 것은 아래다.

- 회사는 여러 개 만들 수 있어야 한다.
- 회사는 대표 agent를 가진다.
- 대표는 작업을 직접 처리하지 않고 하위 agent에게 분배할 수 있어야 한다.
- 회사는 계층형 조직도를 가진다.
- 프로젝트는 회사 아래에 있고 실제 작업 파이프라인을 가진다.
- 새 agent 고용은 승인 단계가 있어야 한다.
- 프로젝트는 로컬 폴더/레포와 연결될 수 있어야 한다.

하지만 MUSU는 PaperClip을 그대로 복제하면 안 된다. MUSU는 운영 툴이자 self-MCP 플랫폼이므로, 회사는 "에이전트 조직"일 뿐 아니라 "정책/감사/기억/도구 공급자"여야 한다.

## 회사가 소유해야 하는 것

회사는 아래를 소유해야 한다.

### 1. 조직

- 회사 id
- 이름, 설명, 미션
- 대표 agent
- manager / worker / specialist 계층
- agent hiring status
- 조직도

### 2. 운영 규칙

- approval policy
- risk policy
- path/tool policy
- escalation policy
- budget / usage limits
- auto-approve 규칙

### 3. capability catalog

- 사용 가능한 모델
- 사용 가능한 MCP servers / tools
- 사용 가능한 internal skills
- reusable playbooks
- agent role templates

### 4. 공유 기억

- 회사 공통 memory
- 운영 매뉴얼
- 팀별 standard
- audit-friendly decision log
- reusable knowledge blocks

### 5. 운영 감사

- hiring / role change log
- approval history
- project attachment history
- policy 변경 이력
- cross-project audit trail

## 프로젝트가 소유해야 하는 것

프로젝트는 아래를 소유해야 한다.

- project id
- 어떤 회사에 속하는지
- repo / folder / workspace root
- 실행 목적과 deliverable
- active task / pipeline / milestone
- project-specific memory
- project-specific overrides
- run history
- artifacts / outputs

즉 프로젝트는 "실제 일을 하는 실행 단위"여야 하고, 회사는 "그 일을 가능하게 하는 운영 단위"여야 한다.

## agent는 어디에 속해야 하는가

정답은 "기본은 회사 소속, 실행은 프로젝트 attach"다.

### 기본 규칙

- agent identity는 회사에 속한다.
- agent role, permission, budget, 기본 skill set도 회사가 준다.
- 프로젝트는 agent를 새로 소유하지 않는다.
- 프로젝트는 회사 소속 agent를 attach 해서 사용한다.

### attach 결과

프로젝트에 agent를 attach 하면 아래가 생긴다.

- project role
- assignment scope
- project-specific instructions
- project-specific memory mount
- active / idle / suspended 상태

이 구조가 좋은 이유는 하나다. 회사 수준에서 운영 표준을 유지하면서, 프로젝트에서는 필요한 만큼만 배치할 수 있다.

## approval은 어디에 있어야 하는가

approval은 회사 레벨이 기본이고, 프로젝트는 trigger를 발생시키는 쪽이 맞다.

예:

- agent 고용: 회사 approval
- 민감 tool 사용: 회사 policy + 프로젝트 context
- deploy / destructive command: 회사 approval policy + project risk level
- 새 외부 MCP 연결: 회사 approval
- repo write / infra write: 회사 policy, 프로젝트 대상

현재 원본 코드의 `warden`과 `git_dpi`는 이미 `project_id` 기반 집행이 가능하므로, 회사 레벨 policy가 프로젝트 레벨 execution에 적용되는 구조가 자연스럽다.

## memory는 어떻게 나눠야 하는가

memory는 3층으로 나눠야 한다.

### 회사 memory

- 공통 규칙
- 운영 standard
- reusable prompt / checklist
- role handbook

### 프로젝트 memory

- 요구사항
- 산출물 history
- project decisions
- local conventions

### 세션 memory

- 현재 실행 중 run context
- temporary findings
- ephemeral scratchpad

## UI는 어떻게 보여야 하는가

회사 UI는 "대시보드"가 아니라 "운영 본부"처럼 보여야 한다.

최소 화면은 아래가 필요하다.

- 회사 overview
- organization chart
- agent roster
- approvals queue
- policy center
- capability catalog
- project list

프로젝트 UI는 아래가 필요하다.

- project overview
- attached agents
- pipeline / task board
- project memory
- activity / audit stream
- artifacts / outputs

## MCP surface는 어떻게 나와야 하는가

MUSU는 self-MCP를 지향하므로, 회사/프로젝트 모델도 MCP로 읽을 수 있어야 한다.

최소 후보:

- `musu_company_list`
- `musu_company_get_overview`
- `musu_company_get_org_chart`
- `musu_company_list_agents`
- `musu_company_list_capabilities`
- `musu_company_list_approvals`
- `musu_project_list`
- `musu_project_get_overview`
- `musu_project_list_attached_agents`
- `musu_project_list_pipelines`
- `musu_project_execute_approval_action`

## persistence 초안

최소 엔티티는 아래가 맞다.

- `companies`
- `company_agents`
- `company_policies`
- `company_capabilities`
- `company_approvals`
- `projects`
- `project_agent_attachments`
- `project_pipelines`
- `project_runs`
- `project_memories`

핵심 foreign key는 단순해야 한다.

- `projects.company_id -> companies.id`
- `project_agent_attachments.project_id -> projects.id`
- `project_agent_attachments.company_agent_id -> company_agents.id`

## 구현 순서

### Phase 1. 문서/계약 고정

- 회사/프로젝트 ownership 고정
- agent attachment 모델 고정
- approval 레벨 고정
- persistence draft 고정

### Phase 2. canonical mock 구현

- `MUSU-WORKS` 안에서 mock company data 구성
- org chart / project list / approvals queue mock 생성
- MCP read surface mock 생성

### Phase 3. UI / MCP alignment

- 회사 overview UI
- project overview UI
- org chart UI
- approval queue UI
- MCP consumer read contract 정리

### Phase 4. 원본 앱과 합치기

- 기존 `project_id` 기반 시스템과 연결
- 기존 policy / audit / approval 인프라 재사용
- company layer를 상위 orchestration plane로 삽입

## 결정

지금 MUSU의 회사는 "프로젝트를 담는 폴더"가 아니라 아래로 정의해야 한다.

> 회사는 AI agent fleet, policy, approval, capability, shared memory, audit를 소유하는 운영 상위 단위다.

그리고 프로젝트는 아래로 정의해야 한다.

> 프로젝트는 회사의 capability를 받아 실제 작업을 실행하고 산출물을 만드는 실행 단위다.

이 정의로 가야 기존 MUSU 코드의 `project/workspace/policy/approval/audit` 축을 버리지 않고, 위에 자연스럽게 `회사`를 올릴 수 있다.
