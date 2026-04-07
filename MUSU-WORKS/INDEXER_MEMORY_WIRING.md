# MUSU-WORKS Indexer Memory Wiring

작성일: 2026-04-01

## 목적

`musu-indexer`를 `회사 -> 에이전트 -> 프로젝트 -> 세션` 메모리 구조와 연결해, 장기 기억을 검색 가능한 memory plane으로 만든다.

## 기준

- 회사는 상위 memory owner다.
- agent는 역할 기반 장기 기억 owner다.
- project는 실행 문맥 owner다.
- session은 임시 trace owner다.
- indexer는 이 filesystem memory를 FTS5 검색 면으로 projection 한다.

## sync roots

preset root 기준 기본 sync 대상은 아래다.

- `memory/`
- `agents/`
- `projects/`

추가 허용:

- `policies/`
- `approvals/`

## category mapping

### company memory

- `memory/policy/`
- `memory/playbook/`
- `memory/decisions/`
- `memory/audit_lessons/`

### agent memory

- `agents/<agent_id>/identity/`
- `agents/<agent_id>/skills/`
- `agents/<agent_id>/work_patterns/`
- `agents/<agent_id>/failure_patterns/`
- `agents/<agent_id>/improvement_notes/`

### project memory

- `projects/<project_id>/memory/requirements/`
- `projects/<project_id>/memory/decisions/`
- `projects/<project_id>/memory/outputs/`
- `projects/<project_id>/memory/issues/`
- `projects/<project_id>/memory/runbooks/`

### session memory

- `projects/<project_id>/sessions/`

## search boundary

### company-scoped search

목적:

- company policy
- shared playbook
- org decision history
- agent skill references

권장 루트:

- `memory/`
- `agents/`
- `policies/`
- `approvals/`

### project-scoped search

목적:

- current requirement
- local decisions
- outputs
- bugs
- active sessions

권장 루트:

- `projects/<project_id>/memory/`
- `projects/<project_id>/sessions/`
- `projects/<project_id>/artifacts/`

## logging rule

`log_action`은 아래 이벤트에 사용한다.

- 중요한 approval decision
- policy update
- major delivery milestone
- repeated failure pattern 발견
- improvement note 승격

## preset example

example preset:

- [presets/minimal-company-alpha](/home/hugh51/musu-functions/MUSU-WORKS/presets/minimal-company-alpha)
- [presets/delivery-team-alpha](/home/hugh51/musu-functions/MUSU-WORKS/presets/delivery-team-alpha)
- [presets/research-rd-alpha](/home/hugh51/musu-functions/MUSU-WORKS/presets/research-rd-alpha)

각 preset의 `indexer.json`은 최소 아래를 가진다.

- `workspace_root`
- `index_db`
- `sync_paths`
- `category_strategy`

## recommended run flow

1. preset root에서 `sync_workspace`
2. company memory 기준 broad search
3. project memory 기준 focused search
4. milestone나 lesson을 `log_action`으로 기록
5. 반복 패턴을 agent 또는 company memory에 승격

## 현재 결론

`musu-indexer`는 코드 검색기만이 아니라, 회사/프로젝트/에이전트 메모리를 장기적으로 축적하고 회수하는 memory plane으로 써야 한다.
