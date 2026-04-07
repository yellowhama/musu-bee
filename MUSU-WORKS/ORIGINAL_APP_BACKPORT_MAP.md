# MUSU-WORKS Original App Backport Map

## 목표

`MUSU-WORKS`에서 고정한 회사/프로젝트 모델을 원본 MUSU 앱에 어디서 어떻게 넣을지 파일/모듈 단위로 정리한다.

## backport 원칙

- 기존 `project_id` 축은 유지한다
- 새 `company_id`는 상위 context로 추가한다
- approval / audit / policy는 가능한 한 기존 인프라를 재사용한다
- UI는 회사 layer를 새 navigation plane으로 추가한다

## domain / backend 후보

### 회사/프로젝트 context

- `/mnt/f/Aisaak/Projects/Musu-new/src/crates/musu-gateway/src/warden/types.rs`
- `/mnt/f/Aisaak/Projects/Musu-new/src/crates/musu-gateway/src/warden/manager.rs`

여기에는 현재 `project_id` 중심 세션과 approval 흐름이 있다. `company_id`를 optional 또는 상위 context로 주입하는 첫 후보지다.

### approval / audit

- `/mnt/f/Aisaak/Projects/Musu-new/src/crates/musu-prime/src/api/routes/actions.rs`
- `/mnt/f/Aisaak/Projects/Musu-new/src/crates/musu-gateway/src/audit/`
- `/mnt/f/Aisaak/Projects/Musu-new/src/crates/musu-gateway/src/bridge/git_dpi.rs`

회사 approval queue와 project-triggered approval을 합치려면 이 축을 재사용하는 게 맞다.

### workspace / runtime

- `/mnt/f/Aisaak/Projects/Musu-new/src/crates/musu-node-bridge/src/scout.rs`
- `/mnt/f/Aisaak/Projects/Musu-new/src/crates/musu-interceptor/src/config.rs`
- `/mnt/f/Aisaak/Projects/Musu-new/src/crates/musu-prime/src/orchestrator/prime_loop.rs`

`projects.workspace_root`와 직접 연결되는 축이다.

### agents

- `/mnt/f/Aisaak/Projects/Musu-new/src/crates/musu-prime/src/api/routes/agents.rs`
- `/mnt/f/Aisaak/Projects/Musu-new/src/crates/musu-prime/src/api/routes/proxy.rs`
- `/mnt/f/Aisaak/Projects/Musu-new/src/crates/musu-interceptor/src/runner.rs`

회사가 소유하는 agent identity와 project attachment 모델을 넣을 때 가장 중요한 축이다.

## desktop UI 후보

- `/mnt/f/Aisaak/Projects/Musu-new/release/musu-desktop/src/App.tsx`
- `/mnt/f/Aisaak/Projects/Musu-new/release/musu-desktop/src/routes/`
- `/mnt/f/Aisaak/Projects/Musu-new/release/musu-desktop/src/views/`
- `/mnt/f/Aisaak/Projects/Musu-new/release/musu-desktop/src/store/`

회사 switcher, company overview, org chart, approvals queue, project overview 화면이 추가될 자리다.

## desktop MCP 후보

- `/mnt/f/Aisaak/Projects/Musu-new/release/musu-desktop/src-tauri/src/mcp_broker/builtin.rs`
- `/mnt/f/Aisaak/Projects/Musu-new/release/musu-desktop/src-tauri/src/commands/`

`musu_company_*`, `musu_project_*` read surface를 넣을 1차 후보지다.

## recommended sequence

1. 원본 DB/상태 계층에 `company_id` context 도입
2. company/project/agent attachment read model 추가
3. desktop UI read-only overview 먼저 추가
4. MCP read surface 추가
5. approval actions 연결

## 새로 만들 것 vs 재사용할 것

### 새로 만들 것

- company entity
- company agents read model
- company approvals queue read model
- org chart projection

### 재사용할 것

- project_id 기반 실행 축
- workspace_root 축
- approval / audit 인프라
- existing agent registry/proxy

## 현재 결론

원본 앱에는 이미 실행 축이 많다. 따라서 backport의 핵심은 `회사`를 새 엔진으로 만드는 것이 아니라, 기존 `project / approval / audit / agent / workspace` 축을 회사 단위로 묶어 읽게 만드는 것이다.
