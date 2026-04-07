# PaperClip vs GStack vs OpenClaw vs NanoClaw Deep Dive

작성일: 2026-04-01

## 목적

MUSU의 `회사 -> 프로젝트 -> agent` 모델을 설계할 때 `PaperClip`, `GStack`, `OpenClaw`, `NanoClaw`를 어떤 층의 레퍼런스로 써야 하는지 깊게 정리한다.

이 문서의 핵심 결론은 단순하다.

- `PaperClip`은 회사 control plane 레퍼런스다.
- `GStack`은 역할 분리와 workflow orchestration 레퍼런스다.
- `OpenClaw`는 실제 agent runtime / execution surface 레퍼런스다.
- `NanoClaw`는 작은 코드베이스와 강한 격리를 가진 execution runtime 레퍼런스다.

MUSU는 이 넷을 하나로 섞지 말고 층으로 분리해서 가져와야 한다.

## 1. 한 줄 비교

### PaperClip

> 회사를 운영하는 소프트웨어

### GStack

> 한 명의 AI를 여러 specialist workflow로 돌리는 소프트웨어

### OpenClaw

> 실제로 메시지를 받고 도구를 쓰고 행동하는 assistant runtime

### NanoClaw

> 더 작고 더 격리된 execution runtime

## 2. 실제 소스 기준 정체성

### PaperClip

PaperClip README는 자신을 이렇게 규정한다.

- "open-source orchestration for zero-human companies"
- "If OpenClaw is an employee, Paperclip is the company"

실제 구조도 그 정의와 맞다.

- React UI
- Express REST API
- PostgreSQL/Drizzle
- adapters

핵심 파일:

- [`README.md`](/home/hugh51/musu-functions/references/paperclip-github/paperclip-master/README.md)
- [`docs/start/architecture.md`](/home/hugh51/musu-functions/references/paperclip-github/paperclip-master/docs/start/architecture.md)
- [`docs/start/core-concepts.md`](/home/hugh51/musu-functions/references/paperclip-github/paperclip-master/docs/start/core-concepts.md)
- [`docs/api/companies.md`](/home/hugh51/musu-functions/references/paperclip-github/paperclip-master/docs/api/companies.md)
- [`docs/api/approvals.md`](/home/hugh51/musu-functions/references/paperclip-github/paperclip-master/docs/api/approvals.md)

### GStack

GStack README와 architecture는 정체성이 매우 분명하다.

- persistent browser
- opinionated workflow skills
- role-driven software factory

핵심 파일:

- [`README.md`](/home/hugh51/musu-functions/references/gstack-main/README.md)
- [`ARCHITECTURE.md`](/home/hugh51/musu-functions/references/gstack-main/ARCHITECTURE.md)
- [`BROWSER.md`](/home/hugh51/musu-functions/references/gstack-main/BROWSER.md)
- [`docs/skills.md`](/home/hugh51/musu-functions/references/gstack-main/docs/skills.md)

### OpenClaw

OpenClaw README와 vision은 정체성이 다르다.

- personal AI assistant
- gateway is control plane, but product is the assistant
- multi-channel inbox / tools / sessions / gateway
- ACP bridge

핵심 파일:

- [`README.md`](/home/hugh51/musu-functions/references/openclaw-github/openclaw-main/README.md)
- [`VISION.md`](/home/hugh51/musu-functions/references/openclaw-github/openclaw-main/VISION.md)
- [`docs.acp.md`](/home/hugh51/musu-functions/references/openclaw-github/openclaw-main/docs.acp.md)

### NanoClaw

NanoClaw README는 자신을 OpenClaw보다 작고 더 이해 가능한, 더 강하게 격리된 runtime으로 설명한다.

- single Node.js process
- isolated Linux containers
- per-group filesystem separation
- channels / queues / scheduler / DB

핵심 파일:

- [`README.md`](/home/hugh51/musu-functions/references/nanoclaw-github/nanoclaw-main/README.md)
- [`src/index.ts`](/home/hugh51/musu-functions/references/nanoclaw-github/nanoclaw-main/src/index.ts)
- [`src/container-runner.ts`](/home/hugh51/musu-functions/references/nanoclaw-github/nanoclaw-main/src/container-runner.ts)
- [`src/group-queue.ts`](/home/hugh51/musu-functions/references/nanoclaw-github/nanoclaw-main/src/group-queue.ts)
- [`src/db.ts`](/home/hugh51/musu-functions/references/nanoclaw-github/nanoclaw-main/src/db.ts)

## 3. 아키텍처 관점 비교

### PaperClip의 중심

PaperClip의 중심은 `company-scoped orchestration`이다.

핵심 개념:

- company
- agent
- issue
- delegation
- heartbeat
- governance

특징:

- 모든 엔티티가 회사에 속한다
- agent는 strict tree hierarchy를 가진다
- issue는 company goal과 project를 따라 trace된다
- approval과 hiring은 board governance를 거친다
- adapter는 runtime bridge다

즉 PaperClip은 "실행기"가 아니라 "조직 운영체계"다.

### GStack의 중심

GStack의 중심은 `explicit workflow mode switching`이다.

핵심 개념:

- slash-command skill
- role-specific cognitive mode
- persistent browser daemon
- review pipeline
- release hygiene

특징:

- plan / review / qa / ship 분리
- browser daemon으로 visual QA loop를 닫음
- skill template system으로 docs와 runtime을 맞춤
- company entity는 없음
- project DB나 org chart는 없음

즉 GStack은 "운영 조직의 데이터 모델"이 아니라 "개발 행위의 workflow system"이다.

### OpenClaw의 중심

OpenClaw의 중심은 `assistant runtime + gateway + channels + tools`다.

핵심 개념:

- gateway control plane
- sessions
- channels
- agent runtime
- tools
- ACP bridge

특징:

- personal / multi-channel assistant
- 실제 메시징 채널 연결
- session 및 tool execution 강함
- ACP bridge로 IDE/agent client와 연결
- 회사/프로젝트 조직 모델은 중심이 아님

즉 OpenClaw은 "직원 runtime"에 가깝다.

### NanoClaw의 중심

NanoClaw의 중심은 `small runtime + strong isolation + per-context execution`이다.

핵심 개념:

- single-process orchestrator
- channel registry
- per-group queue
- group-scoped memory
- isolated container runner
- scheduled tasks

즉 NanoClaw는 "작고 강하게 격리된 실행기" reference다.

## 4. MUSU에 끼워 넣으면 어디에 들어가나

### PaperClip -> MUSU 회사 레이어

MUSU에서 PaperClip을 참고해야 하는 부분:

- `회사` top-level unit
- company dashboard
- org chart
- approvals queue
- cost / budget / activity
- adapter model

MUSU-WORKS와의 직접 연결:

- [`HOW_A_COMPANY_SHOULD_BE_BUILT.md`](/home/hugh51/musu-functions/MUSU-WORKS/HOW_A_COMPANY_SHOULD_BE_BUILT.md)
- [`PERSISTENCE_SCHEMA_DRAFT.md`](/home/hugh51/musu-functions/MUSU-WORKS/PERSISTENCE_SCHEMA_DRAFT.md)

### GStack -> MUSU 역할 템플릿 레이어

MUSU에서 GStack을 참고해야 하는 부분:

- company agent role templates
- project attachment operating mode
- review pipeline
- QA browser workflow
- skill discipline

직접 매핑 예:

- `ceo`
- `engineering_manager`
- `reviewer`
- `qa`
- `shipper`
- `policy_officer`

### OpenClaw -> MUSU 실행 agent 레이어

MUSU에서 OpenClaw을 참고해야 하는 부분:

- sessioned agent runtime
- channel/tool/action execution
- gateway + session abstraction
- ACP bridge for IDE attachment

이건 `회사`가 아니라 `project-attached worker runtime` 참고다.

### NanoClaw -> MUSU lightweight isolation 레이어

MUSU에서 NanoClaw를 참고해야 하는 부분:

- per-project or per-session isolation
- attached agent queue separation
- lightweight runtime topology
- group/project scoped memory partitioning

## 5. 승인, 감사, 정책 관점 비교

### PaperClip

강하다.

- approvals API
- board governance
- hire request flow
- company activity / audit orientation

### GStack

약하다.

- workflow discipline은 강하지만 approval/audit domain model은 없다

### OpenClaw

중간이다.

- security defaults
- gateway controls
- session/routing/operational constraints는 강함
- 하지만 회사 governance model은 없다

### NanoClaw

낮다.

- governance model은 거의 없다
- 하지만 isolation과 execution boundary는 강하다

## 6. persistence 관점 비교

### PaperClip

가장 참고 가치가 높다.

- company-scoped entities
- agents
- approvals
- goals/projects

### GStack

persistence는 핵심이 아니다.

- skill docs
- state file
- browser daemon state
- learnings

### OpenClaw

session/runtime 중심 persistence가 중요하다.

- gateway session
- routing
- channel state
- tool state

### NanoClaw

group/session/task state는 중요하지만 company/project hierarchy persistence reference는 아니다.

## 7. UI 관점 비교

### PaperClip

UI가 control plane이다.

- dashboard
- org management
- tasks
- approvals

MUSU 회사 UI 참고도는 가장 높다.

### GStack

UI보다 workflow invocation이 중심이다.

- slash commands
- side panel
- browser visibility

MUSU 회사 UI보다 agent working mode UX 참고도가 높다.

### OpenClaw

UI는 gateway control + assistant surfaces다.

- web UI
- canvas
- apps
- sessions

MUSU에서는 project-attached assistant surfaces 참고도가 높다.

### NanoClaw

UI보다 runtime behavior와 setup flow가 중심이다.

- group-first mental model
- minimal control surface
- ops over dashboard

## 8. MCP/agent-client 관점 비교

### PaperClip

adapter 중심이다.

- codex local
- claude local
- gemini local
- http
- process

MCP라기보다 runtime adapter model 참고용이다.

### GStack

skill standard + browser daemon + codex integration이 중요하다.

직접적 시사점:

- specialist skill packs
- persistent QA/browser layer
- cross-model second opinion

### OpenClaw

ACP bridge가 중요하다.

직접적 시사점:

- editor/client attachment
- gateway session mapping
- per-session runtime continuity

### NanoClaw

직접적 MCP/ACP bridge보다 channel/runtime orchestration과 isolation 참고도가 높다.

## 9. MUSU에 대한 최종 결론

MUSU는 넷 중 하나를 고르면 안 된다.

아래처럼 층으로 합쳐야 한다.

### Layer 1. Company Control Plane

PaperClip에서 가져온다.

- company
- org chart
- approvals
- capabilities
- budgets
- activity

### Layer 2. Role Workflow Plane

GStack에서 가져온다.

- role templates
- plan/review/ship/qa mode
- browser QA loop
- skill packaging

### Layer 3. Execution Runtime Plane

OpenClaw에서 가져온다.

- sessioned agents
- runtime/tool execution
- gateway/session/client bridge

### Layer 4. Lightweight Isolation Plane

NanoClaw에서 가져온다.

- isolated container execution
- queue partitioning
- per-context memory separation
- small runtime architecture

## 10. MUSU-WORKS 다음 설계 원칙

앞으로 `MUSU-WORKS`에서 아래 원칙으로 가면 된다.

1. 회사 모델은 PaperClip처럼 설계한다.
2. 회사 소속 agent role은 GStack식 specialist template를 가진다.
3. 프로젝트에 attach 된 agent runtime은 OpenClaw식 session/runtime 개념을 참고한다.
4. runtime isolation과 queue partitioning은 NanoClaw식 단순성을 참고한다.
5. 원본 MUSU 코드의 `project_id/workspace_root/policy/approval/audit/agent_id` 축은 그대로 살린다.
6. `회사`는 새 엔진이 아니라, 기존 축 위에 올라가는 orchestration layer다.

## 11. 바로 다음에 할 일

1. company agent role template 문서 만들기
2. project agent attachment + session model 문서 만들기
3. read-only viewer에 role template와 approval governance를 반영하기
