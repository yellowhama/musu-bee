# MUSU-WORKS MCP Surface Draft

## 목표

회사와 프로젝트 모델을 외부 consumer와 self-MCP가 읽고 조작할 수 있는 최소 surface로 고정한다.

## naming 원칙

- prefix는 `musu_company_*`, `musu_project_*`
- read와 action을 섞지 않는다
- giant payload보다 bounded payload를 우선한다
- 회사와 프로젝트의 ownership boundary를 surface 이름에서 드러낸다

## company read surface

### `musu_company_list`

반환:

- company id
- slug
- name
- status
- active project count
- active agent count

### `musu_company_get_overview`

입력:

- `company_id`

반환:

- overview header
- org health summary
- approvals summary
- project summary
- capability summary

### `musu_company_get_org_chart`

입력:

- `company_id`
- `root_agent_id?`
- `max_depth?`

반환:

- org tree nodes
- reporting lines
- pending hires

### `musu_company_list_agents`

입력:

- `company_id`
- `status?`
- `role_type?`

반환:

- agent list
- role
- status
- attached project count
- reports_to

### `musu_company_list_role_templates`

입력:

- `company_id`

반환:

- role template list
- policy profile
- approval scope
- allowed modes

### `musu_company_list_capabilities`

입력:

- `company_id`
- `kind?`

반환:

- models
- tool packs
- MCP servers
- playbooks

### `musu_company_list_approvals`

입력:

- `company_id`
- `status?`
- `approval_kind?`

반환:

- pending items
- requester
- target project
- risk label

## project read surface

### `musu_project_list`

입력:

- `company_id?`
- `status?`

반환:

- project id
- name
- company
- workspace root
- status
- risk level

### `musu_project_get_overview`

입력:

- `project_id`

반환:

- header
- pipeline summary
- attached agents summary
- approval blockers
- latest outputs

### `musu_project_list_attached_agents`

입력:

- `project_id`

반환:

- agent id
- display name
- project role
- current status
- assignment scope

### `musu_project_list_agent_sessions`

입력:

- `project_id`
- `state?`
- `mode?`

반환:

- session id
- attachment id
- mode
- channel
- runtime state
- isolation profile

### `musu_project_get_agent_session`

입력:

- `project_id`
- `session_id`

반환:

- session header
- event summary
- tool trace refs
- approval wait state

### `musu_project_list_pipelines`

입력:

- `project_id`

반환:

- pipeline id
- stage list
- current stage
- blocked stage
- latest run

### `musu_project_list_outputs`

입력:

- `project_id`

반환:

- artifact list
- latest summaries
- output types

### `musu_project_get_memory_summary`

입력:

- `project_id`

반환:

- key decisions
- active constraints
- recent notes

## action surface

### `musu_project_execute_approval_action`

입력:

- `approval_id`
- `decision`
- `actor_id`
- `reason?`

반환:

- approval status
- affected project
- resulting action summary

### `musu_project_start_agent_session`

입력:

- `project_id`
- `attachment_id`
- `mode`
- `channel`

반환:

- session id
- runtime state
- effective policy profile

### `musu_company_request_hire`

입력:

- `company_id`
- `role_type`
- `reports_to_agent_id?`
- `reason`

반환:

- approval request id
- pending hire record

## payload design 원칙

- overview payload는 summary 중심
- org chart는 bounded tree
- approvals는 queue-friendly flat list
- project outputs는 giant blob가 아니라 typed item list
- memory는 full text dump가 아니라 summary + references
- session surfaces는 queue-friendly flat list + one detail read surface로 나눈다

## 현재 결론

초기 surface는 read-heavy로 두고, action은 approval과 hiring처럼 운영상 중요한 것만 최소로 연다.
