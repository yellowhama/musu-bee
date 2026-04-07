# Original App Runtime Proof 2026-04-01

## 목적

`MUSU-WORKS`에서 정의한 `company -> project -> attachment -> session` 계약면이 원본 MUSU 코드에 어느 정도 자연스럽게 얹힐 수 있는지 증거 수준으로 정리한다.

## 결론 요약

원본 MUSU는 이미 아래를 갖고 있다.

- `project_id` 중심 실행 축
- `agent registry`와 runtime instance 축
- named proxy 축
- MCP tool dispatch 축
- human-in-the-loop action / audit 축

즉 `회사`는 새 엔진이 아니라 기존 실행 축 위에 얹는 orchestration layer로 넣는 것이 맞다.

## 1. Agent Identity / Runtime Evidence

근거:

- [`agents.rs`](/mnt/f/Aisaak/Projects/Musu-new/src/crates/musu-prime/src/api/routes/agents.rs)

확인된 사실:

- `register_agent`, `list_agents`, `get_agent`, `update_agent`, `delete_agent`, `agent_status`, `start_agent`가 있다.
- agent는 이미 `agent_id`와 manifest/runtime instance로 관리된다.
- runtime instance는 `status`, `port`, `pid`, `started_at`, `health_failures`를 가진다.

해석:

- `company agent identity`는 완전 신설이 아니라 기존 `agent manifest + registry` 축에 company context를 얹는 방식이 맞다.
- `project attachment`는 agent identity와 별도 read model로 만드는 것이 자연스럽다.

## 2. Named Proxy / Attachment Evidence

근거:

- [`proxy.rs`](/mnt/f/Aisaak/Projects/Musu-new/src/crates/musu-prime/src/api/routes/proxy.rs)

확인된 사실:

- 원본 MUSU는 `agent_id -> dynamic port` reverse proxy를 이미 제공한다.
- instance가 있지만 port가 없으면 `503`
- agent가 없으면 `404`

해석:

- project-attached session은 결국 `agent_id`와 runtime instance를 통해 연결될 수 있다.
- 별도 execution surface를 새로 만드는 것보다 `attachment -> agent_id -> instance` 매핑층을 추가하는 것이 맞다.

## 3. MCP / Tool Dispatch Evidence

근거:

- [`mcp.rs`](/mnt/f/Aisaak/Projects/Musu-new/src/crates/musu-prime/src/api/routes/mcp.rs)

확인된 사실:

- 원본 MUSU는 이미 MCP JSON-RPC entrypoint를 가진다.
- builtin tool 목록과 `tools/call` dispatch가 있다.
- tool call은 `AppEvent::ToolCall`로 GUI/activity mirror를 남긴다.
- terminal tool은 safety check와 approval wait를 거친다.
- 결국 `WorkRequest`로 enqueue 된다.

해석:

- `musu_company_*`, `musu_project_*` read surface를 넣을 anchor는 이미 존재한다.
- company/project read model이 생기면 MCP layer는 별도 대형 재설계 없이 확장 가능하다.
- session-aware surface도 `tool call -> event -> work request` 패턴 위에 올릴 수 있다.

## 4. Human Action / Audit Evidence

근거:

- [`actions.rs`](/mnt/f/Aisaak/Projects/Musu-new/src/crates/musu-prime/src/api/routes/actions.rs)

확인된 사실:

- `confirm_path`, `neural_nudge`, `autopilot_diagnose` 등 human-in-the-loop endpoint가 있다.
- action 처리 중 run state 변경, event publish, audit append가 수행된다.
- `run_id`, `candidate_id`, `reason`, `hint` 같은 실행 문맥이 남는다.

해석:

- approval action surface는 이미 존재하는 audit/action 패턴을 재사용하는 것이 맞다.
- 회사 approval queue는 이 액션 레이어의 상위 orchestration context로 붙일 수 있다.

## 5. Canonical Contract 대비 매핑

### Already Present

- project-scoped execution
- agent identity and runtime instance
- runtime status
- reverse proxy to named agent
- MCP entrypoint and tool dispatch
- action/audit event trail

### Missing As First-Class Models

- `company`
- `company-owned role templates`
- `project_agent_attachments`
- `project_agent_sessions`
- `company-level approvals queue read model`
- `company/project read surfaces`

## 6. Backport Risk Assessment

### Low Risk

- company read-only overview
- role template read model
- project attachment read model
- MCP read surface for company/project/session summary

이유:

- 기존 runtime path를 거의 건드리지 않고 projection/read model을 추가하는 수준이기 때문이다.

### Medium Risk

- company approval queue와 existing action/audit alignment
- attachment/session persistence 추가
- desktop UI navigation plane에 company layer 삽입

이유:

- 데이터 모델과 UI routing에 변화가 생긴다.

### High Risk

- company context를 existing execution core에 강하게 주입
- approval/policy를 일괄 company-first로 재정의

이유:

- 현재 원본은 `project_id` 중심이 강해서 기존 흐름을 흔들 수 있다.

## 7. 추천 순서

1. company read model 추가
2. role template catalog 추가
3. project attachment read model 추가
4. session read model 추가
5. company/project MCP read surface 추가
6. desktop UI read-only company plane 추가
7. approval/action alignment 추가

## 현재 결론

원본 MUSU는 `MUSU-WORKS`의 canonical contract와 충돌하는 구조가 아니라, 이미 필요한 runtime anchor를 상당수 갖고 있다.

따라서 backport의 핵심은:

- execution core 재작성

이 아니라

- company/role/attachment/session read model과 orchestration context를 얹는 것

이다.
