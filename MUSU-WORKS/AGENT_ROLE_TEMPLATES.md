# Agent Role Templates

작성일: 2026-04-01

## 목적

`MUSU-WORKS`의 회사 모델에서 agent를 단순 worker 목록이 아니라 `역할 템플릿` 기반 조직으로 고정한다.

이 문서는 `PaperClip`의 회사 control plane, `GStack`의 role-driven workflow, `OpenClaw`의 실행 runtime을 함께 반영한 canonical contract다.

## 원칙

- agent identity는 회사가 소유한다.
- 프로젝트는 agent를 새로 만들지 않고 attach 해서 사용한다.
- 역할은 프롬프트 문구가 아니라 운영 책임 단위여야 한다.
- 역할은 MCP/tool/policy/approval과 연결되어야 한다.
- 한 agent는 base role 하나와 optional secondary mode 여러 개를 가질 수 있다.

## 원본 코드 truth와 연결

현재 MUSU 원본에는 이미 다음 축이 있다.

- `agent_id` 등록과 조회
  - `/mnt/f/Aisaak/Projects/Musu-new/src/crates/musu-prime/src/api/routes/agents.rs`
- named agent proxy
  - `/mnt/f/Aisaak/Projects/Musu-new/src/crates/musu-prime/src/api/routes/proxy.rs`
- tool execution / MCP exposure
  - `/mnt/f/Aisaak/Projects/Musu-new/src/crates/musu-prime/src/api/routes/mcp.rs`
- human-in-the-loop action endpoints
  - `/mnt/f/Aisaak/Projects/Musu-new/src/crates/musu-prime/src/api/routes/actions.rs`

즉 역할 템플릿은 완전히 추상적인 개념이 아니라, 향후 `agent manifest`, `capability`, `approval`, `MCP surface`에 매핑될 수 있어야 한다.

## 레퍼런스 해석

### PaperClip에서 가져올 것

- 회사가 agent fleet를 소유한다.
- 조직도와 상하 관계를 가진다.
- 승인, 예산, 활동 로그가 role 운영과 연결된다.

### GStack에서 가져올 것

- plan / review / qa / ship 같은 specialist mode 분리
- 역할마다 다른 operating discipline
- browser QA 같은 workflow-specific capability

### OpenClaw에서 가져올 것

- 역할은 결국 실행 runtime 위에서 세션으로 살아야 한다.
- 역할은 channel/tool/session policy와 연결돼야 한다.

## 기본 역할 템플릿

### 1. `ceo`

역할:

- 회사 목표 설정
- 프로젝트 우선순위 결정
- 최종 escalation 수신

기본 capability:

- company overview read
- approvals read
- budget and activity read
- final approval request

기본 제한:

- 직접 파일 수정/코드 실행은 기본 비활성
- destructive action은 위임 우선

### 2. `engineering_manager`

역할:

- 프로젝트 배정
- 역할 분배
- execution plan 승인
- cross-agent coordination

기본 capability:

- project overview read/write
- project agent attach/detach proposal
- task routing
- review request creation

기본 제한:

- production deploy 직접 실행은 기본 비활성

### 3. `builder`

역할:

- 실제 구현
- 파일 변경
- 코드/설정 수정

기본 capability:

- workspace read/write
- MCP tool usage
- terminal execution
- patch submission

기본 제한:

- deploy / policy 변경 / hiring 불가

### 4. `reviewer`

역할:

- 코드 리뷰
- risk/regression 점검
- approval recommendation

기본 capability:

- diff read
- test result read
- audit log read
- review verdict publish

기본 제한:

- 직접 구현은 기본 비활성

### 5. `qa`

역할:

- runtime 검증
- browser / UI / MCP proof
- repro and evidence capture

기본 capability:

- viewer/browser tools
- MCP validation
- screenshot / evidence attachment
- regression matrix execution

기본 제한:

- production action 직접 실행은 기본 비활성

### 6. `shipper`

역할:

- release preparation
- artifact verification
- deploy handoff

기본 capability:

- build artifact read
- release checklist
- deployment proposal

기본 제한:

- 정책 override 불가

### 7. `policy_officer`

역할:

- approval gate
- path/tool/risk policy 관리
- exception 기록

기본 capability:

- policy center read/write
- approval decision
- audit trail annotation

기본 제한:

- 제품 구현 직접 수행 안 함

### 8. `design_partner`

역할:

- UI 정보 구조
- self-MCP friendly interaction design
- screenshot/layout 기준 정의

기본 capability:

- layout snapshot read
- problem nodes read
- design checklist write

기본 제한:

- runtime privilege action 불가

## 역할 템플릿 필드

모든 role template는 최소 아래 필드를 가져야 한다.

- `role_id`
- `display_name`
- `mission`
- `reports_to_role_id`
- `default_capabilities`
- `default_mcp_surfaces`
- `default_tool_groups`
- `default_policy_profile`
- `default_approval_scope`
- `allowed_project_modes`
- `success_metrics`

## 프로젝트 attach 시 변하는 것

프로젝트에 attach 되면 role은 아래로 구체화된다.

- project title
- assignment scope
- run objective
- workspace mount
- project-specific instructions
- temporary escalations
- session budget

즉 회사 role template는 `base operating contract`이고, 프로젝트 attach는 그 위에 `execution context`를 얹는다.

## GStack식 operating modes

각 role은 필요하면 secondary mode를 붙일 수 있다.

- `plan`
- `review`
- `qa`
- `ship`
- `investigate`
- `audit`

예:

- `builder + plan`
- `builder + investigate`
- `reviewer + audit`
- `qa + ship-readiness`

이렇게 하면 agent identity를 과하게 쪼개지 않고도 workflow 전환이 가능하다.

## MCP 관점에서 필요한 최소 read surface

- `musu_company_list_role_templates`
- `musu_company_get_role_template`
- `musu_project_list_attached_agents`
- `musu_project_get_agent_assignment`
- `musu_project_list_role_mode_runs`

## 구현 우선순위

1. role template catalog 문서화
2. mock fixture 반영
3. viewer에 roster/role 표시
4. original app backport 시 agent manifest와 연결

## 결론

MUSU의 agent는 그냥 여러 worker가 아니라:

- 회사가 소유하는 identity이고
- GStack처럼 역할 discipline을 가지며
- OpenClaw처럼 세션으로 실행되고
- 프로젝트에는 attach 되어 일하는 구조

여야 한다.
