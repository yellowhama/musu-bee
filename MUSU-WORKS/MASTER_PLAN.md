# MUSU-WORKS Master Plan

## 목표

`MUSU-WORKS`의 목표는 MUSU의 `회사 -> 프로젝트` 운영 모델을 독립 작업공간에서 설계하고, 이후 원본 앱에 역이식 가능한 수준으로 domain contract, schema, UI 정보 구조, MCP surface를 고정하는 것이다.

## 제품 정의

### 회사

- AI agent fleet 운영 단위
- worker pool / policy / capability catalog / memory / audit ownership
- 여러 프로젝트를 품을 수 있다

### 프로젝트

- 회사 capability를 이용해 실제 작업을 수행하는 단위
- 실행 context, task history, deliverable, state, timeline이 쌓인다
- 특정 회사에 속한다

## 원본 코드 truth

현재 원본 코드에 이미 있는 것은 아래다.

- `project_id` 중심 execution / approval / audit
- `workspace_root` 중심 local runtime / block store / watcher
- `policy` / `gate` / `approval token` / `audit log`
- `agent registry` / `agent proxy` / `agent_id`

즉 새로 만들어야 하는 것은 전부가 아니라, 위 축을 묶는 `company orchestration layer`다.

## 원본 코드 근거

- project / approval / audit
  - `/mnt/f/Aisaak/Projects/Musu-new/src/crates/musu-gateway/src/warden/types.rs`
  - `/mnt/f/Aisaak/Projects/Musu-new/src/crates/musu-gateway/src/warden/manager.rs`
  - `/mnt/f/Aisaak/Projects/Musu-new/src/crates/musu-gateway/src/bridge/git_dpi.rs`
- workspace / runtime root
  - `/mnt/f/Aisaak/Projects/Musu-new/src/crates/musu-node-bridge/src/scout.rs`
  - `/mnt/f/Aisaak/Projects/Musu-new/src/crates/musu-interceptor/src/config.rs`
  - `/mnt/f/Aisaak/Projects/Musu-new/src/crates/musu-prime/src/orchestrator/prime_loop.rs`
- agent / approval / audit APIs
  - `/mnt/f/Aisaak/Projects/Musu-new/src/crates/musu-prime/src/api/routes/agents.rs`
  - `/mnt/f/Aisaak/Projects/Musu-new/src/crates/musu-prime/src/api/routes/proxy.rs`
  - `/mnt/f/Aisaak/Projects/Musu-new/src/crates/musu-prime/src/api/routes/mcp.rs`
  - `/mnt/f/Aisaak/Projects/Musu-new/src/crates/musu-prime/src/api/routes/actions.rs`

## 핵심 질문

1. 회사는 정확히 무엇을 소유하는가
2. 프로젝트는 정확히 무엇을 소유하는가
3. agent는 회사에 속하는가, 프로젝트에 attach 되는가
4. memory / policy / tools / approval은 어느 레벨에서 관리되는가
5. UI와 MCP에서는 회사와 프로젝트를 어떻게 읽고 조작하는가
6. 기존 `project_id` 중심 시스템에 회사 레이어를 어떻게 얹는가

## 실행 전략

### 1. 원본 코드 + 외부 레퍼런스 truth 수집

- MUSU 원본 코드의 `project/workspace/policy/approval/agent` 축 확인
- PaperClip source / docs 확인
- GStack source / docs 확인

### 2. 문서에서 먼저 고정

- domain model
- ownership boundary
- persistence draft
- UI information architecture
- MCP read surface

### 3. `MUSU-WORKS`에서 canonical mock 구현

- mock companies
- mock projects
- mock org chart
- mock approval queue
- mock MCP read responses

### 4. read-only viewer / proof

- mock viewer
- contract readability check
- reference-to-MUSU mapping check

### 5. 원본 앱에 선택적 backport

- existing `project_id` flow 재사용
- company id / attachment layer 추가
- UI surface 추가
- MCP surface 추가

## active and queued plans

### Active

- [plans/PLAN_20_COMPANY_RUNTIME_PRODUCTIZATION.md](/home/hugh51/musu-functions/MUSU-WORKS/plans/PLAN_20_COMPANY_RUNTIME_PRODUCTIZATION.md)
- [plans/PLAN_21_COMPANY_RUNTIME_CONTRACT_SHORTLIST.md](/home/hugh51/musu-functions/MUSU-WORKS/plans/PLAN_21_COMPANY_RUNTIME_CONTRACT_SHORTLIST.md)

### Queued

- [plans/PLAN_11_EXECUTION_AWARE_VIEWER.md](/home/hugh51/musu-functions/MUSU-WORKS/plans/PLAN_11_EXECUTION_AWARE_VIEWER.md)
- [plans/PLAN_13_ORIGINAL_APP_RUNTIME_PROOF.md](/home/hugh51/musu-functions/MUSU-WORKS/plans/PLAN_13_ORIGINAL_APP_RUNTIME_PROOF.md)
- [plans/PLAN_14_FINAL_PARITY_AND_BACKLOG.md](/home/hugh51/musu-functions/MUSU-WORKS/plans/PLAN_14_FINAL_PARITY_AND_BACKLOG.md)
- [plans/PLAN_15_COMPANY_AGENT_MEMORY_SYSTEM.md](/home/hugh51/musu-functions/MUSU-WORKS/plans/PLAN_15_COMPANY_AGENT_MEMORY_SYSTEM.md)
- [plans/PLAN_19_INDEXER_MEMORY_WIRING.md](/home/hugh51/musu-functions/MUSU-WORKS/plans/PLAN_19_INDEXER_MEMORY_WIRING.md)
- [plans/PLAN_06_ORIGINAL_APP_BACKPORT.md](/home/hugh51/musu-functions/MUSU-WORKS/plans/PLAN_06_ORIGINAL_APP_BACKPORT.md)

## completed detailed plans

- [plans/PLAN_01_COMPANY_DOMAIN_MODEL.md](/home/hugh51/musu-functions/MUSU-WORKS/plans/PLAN_01_COMPANY_DOMAIN_MODEL.md)
- [plans/PLAN_02_PERSISTENCE_SCHEMA_DRAFT.md](/home/hugh51/musu-functions/MUSU-WORKS/plans/PLAN_02_PERSISTENCE_SCHEMA_DRAFT.md)
- [plans/PLAN_03_UI_INFORMATION_ARCHITECTURE.md](/home/hugh51/musu-functions/MUSU-WORKS/plans/PLAN_03_UI_INFORMATION_ARCHITECTURE.md)
- [plans/PLAN_04_MCP_SURFACE_DRAFT.md](/home/hugh51/musu-functions/MUSU-WORKS/plans/PLAN_04_MCP_SURFACE_DRAFT.md)
- [plans/PLAN_05_CANONICAL_MOCK_IMPLEMENTATION.md](/home/hugh51/musu-functions/MUSU-WORKS/plans/PLAN_05_CANONICAL_MOCK_IMPLEMENTATION.md)
- [plans/PLAN_06_ORIGINAL_APP_BACKPORT.md](/home/hugh51/musu-functions/MUSU-WORKS/plans/PLAN_06_ORIGINAL_APP_BACKPORT.md)
- [plans/PLAN_07_READONLY_COMPANY_VIEWER.md](/home/hugh51/musu-functions/MUSU-WORKS/plans/PLAN_07_READONLY_COMPANY_VIEWER.md)
- [plans/PLAN_08_AGENT_ROLE_TEMPLATES.md](/home/hugh51/musu-functions/MUSU-WORKS/plans/PLAN_08_AGENT_ROLE_TEMPLATES.md)
- [plans/PLAN_09_PROJECT_AGENT_ATTACHMENT_AND_SESSION_MODEL.md](/home/hugh51/musu-functions/MUSU-WORKS/plans/PLAN_09_PROJECT_AGENT_ATTACHMENT_AND_SESSION_MODEL.md)
- [plans/PLAN_10_ROLE_AND_SESSION_AWARE_MOCKS.md](/home/hugh51/musu-functions/MUSU-WORKS/plans/PLAN_10_ROLE_AND_SESSION_AWARE_MOCKS.md)
- [plans/PLAN_12_SCHEMA_OPEN_QUESTION_CLOSURE.md](/home/hugh51/musu-functions/MUSU-WORKS/plans/PLAN_12_SCHEMA_OPEN_QUESTION_CLOSURE.md)
- [plans/PLAN_16_SCAFFOLDING_PRESET_CONTRACT.md](/home/hugh51/musu-functions/MUSU-WORKS/plans/PLAN_16_SCAFFOLDING_PRESET_CONTRACT.md)
- [plans/PLAN_17_SCAFFOLDING_PRESET_MOCKS.md](/home/hugh51/musu-functions/MUSU-WORKS/plans/PLAN_17_SCAFFOLDING_PRESET_MOCKS.md)
- [plans/PLAN_18_PRESET_GENERATOR_IMPLEMENTATION.md](/home/hugh51/musu-functions/MUSU-WORKS/plans/PLAN_18_PRESET_GENERATOR_IMPLEMENTATION.md)

## detailed plan rule

세부 플랜은 아래 조건을 만족해야 한다.

- 하나의 bounded objective만 다룬다
- 입력 문서와 원본 코드 근거가 명시돼 있다
- 완료 조건이 측정 가능하다
- 다음 플랜으로 자연스럽게 이어진다

## foundational docs

- [README.md](/home/hugh51/musu-functions/MUSU-WORKS/README.md)
- [VISION.md](/home/hugh51/musu-functions/MUSU-WORKS/VISION.md)
- [CURRENT_STATE.md](/home/hugh51/musu-functions/MUSU-WORKS/CURRENT_STATE.md)
- [HOW_A_COMPANY_SHOULD_BE_BUILT.md](/home/hugh51/musu-functions/MUSU-WORKS/HOW_A_COMPANY_SHOULD_BE_BUILT.md)
- [REFERENCE_INTAKE_2026-04-01.md](/home/hugh51/musu-functions/MUSU-WORKS/REFERENCE_INTAKE_2026-04-01.md)
- [PAPERCLIP_GSTACK_OPENCLAW_DEEP_DIVE_2026-04-01.md](/home/hugh51/musu-functions/MUSU-WORKS/PAPERCLIP_GSTACK_OPENCLAW_DEEP_DIVE_2026-04-01.md)
- [AGENT_ROLE_TEMPLATES.md](/home/hugh51/musu-functions/MUSU-WORKS/AGENT_ROLE_TEMPLATES.md)
- [PROJECT_AGENT_ATTACHMENT_AND_SESSION_MODEL.md](/home/hugh51/musu-functions/MUSU-WORKS/PROJECT_AGENT_ATTACHMENT_AND_SESSION_MODEL.md)
- [SCHEMA_DECISION_NOTE_2026-04-01.md](/home/hugh51/musu-functions/MUSU-WORKS/SCHEMA_DECISION_NOTE_2026-04-01.md)
- [VIEWER_PROOF_2026-04-01.md](/home/hugh51/musu-functions/MUSU-WORKS/VIEWER_PROOF_2026-04-01.md)
- [ORIGINAL_APP_RUNTIME_PROOF_2026-04-01.md](/home/hugh51/musu-functions/MUSU-WORKS/ORIGINAL_APP_RUNTIME_PROOF_2026-04-01.md)
- [BACKPORT_READY_ENTITY_SHORTLIST_2026-04-01.md](/home/hugh51/musu-functions/MUSU-WORKS/BACKPORT_READY_ENTITY_SHORTLIST_2026-04-01.md)
- [COMPANY_AGENT_MEMORY_ARCHITECTURE.md](/home/hugh51/musu-functions/MUSU-WORKS/COMPANY_AGENT_MEMORY_ARCHITECTURE.md)
- [INDEXER_MEMORY_WIRING.md](/home/hugh51/musu-functions/MUSU-WORKS/INDEXER_MEMORY_WIRING.md)
- [SCAFFOLDING_PRESET_ARCHITECTURE.md](/home/hugh51/musu-functions/MUSU-WORKS/SCAFFOLDING_PRESET_ARCHITECTURE.md)
- [PRESET_MOCKS_STATUS_2026-04-01.md](/home/hugh51/musu-functions/MUSU-WORKS/PRESET_MOCKS_STATUS_2026-04-01.md)
- [VIEWER_SMOKE_PROOF_2026-04-01.md](/home/hugh51/musu-functions/MUSU-WORKS/VIEWER_SMOKE_PROOF_2026-04-01.md)
- [MUSU_CORP_TO_MUSU_WORKS_MIGRATION_MAP.md](/home/hugh51/musu-functions/MUSU-WORKS/MUSU_CORP_TO_MUSU_WORKS_MIGRATION_MAP.md)
- [COMPANY_RUNTIME_PRODUCTIZATION_MAP.md](/home/hugh51/musu-functions/MUSU-WORKS/COMPANY_RUNTIME_PRODUCTIZATION_MAP.md)
- [COMPANY_RUNTIME_CONTRACT_SHORTLIST.md](/home/hugh51/musu-functions/MUSU-WORKS/COMPANY_RUNTIME_CONTRACT_SHORTLIST.md)
- [AUTONOMOUS_WORKLOAD_ROUTING_AND_SAFETY.md](/home/hugh51/musu-functions/MUSU-WORKS/AUTONOMOUS_WORKLOAD_ROUTING_AND_SAFETY.md)
