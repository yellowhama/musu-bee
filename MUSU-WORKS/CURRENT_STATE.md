# MUSU-WORKS Current State

## 현재 목적

MUSU의 회사/프로젝트 모델을 구현 전에 별도 공간에서 정리하고, 원본 코드에 이미 있는 `project/workspace/policy/approval/audit/agent` 축과 연결 가능한 계약면을 만든다.

## 2026-04-01 기준 상태

- baseline 비전 문서는 있다.
- 회사 domain model 초안 문서가 추가됐다.
- persistence schema draft가 추가됐다.
- UI information architecture가 추가됐다.
- MCP surface draft가 추가됐다.
- canonical mock fixtures가 추가됐다.
- original app backport map과 final touch 초안이 추가됐다.
- PaperClip, GStack, OpenClaw 실제 소스를 `references/` 아래로 받아 두었다.
- read-only company viewer가 추가됐다.
- agent role template 문서가 추가됐다.
- project attachment / session model 문서가 추가됐다.
- NanoClaw source까지 reference set에 추가됐다.
- role/session-aware mock과 root viewer 확장이 들어갔다.
- root viewer의 HTTP/fixture proof가 확보됐다.
- original app runtime proof 초안이 추가됐다.
- backport-ready entity shortlist와 final parity checklist가 추가됐다.
- viewer visual confirmation runbook과 final closure status 문서가 추가됐다.
- company/agent/project/session memory architecture 초안이 추가됐다.
- scaffolding preset architecture 초안이 추가됐다.
- delivery-team preset mock tree가 추가됐다.
- preset generator와 `minimal`, `delivery`, `research` 3종 preset example이 추가됐다.
- indexer memory wiring 문서와 viewer smoke proof가 추가됐다.
- `musu_corp` 초기형과 `MUSU-WORKS` 정식형의 migration map이 추가됐다.

## 이미 알고 있는 것

- 회사는 AI agent 운영과 관리의 단위다.
- 프로젝트는 회사 capability를 사용해 실제 작업을 수행하는 단위다.
- 이 모델은 향후 UI, runtime, persistence, MCP surface 모두에 영향을 준다.
- 원본 코드에는 이미 `project_id`, `workspace_root`, `policy`, `approval`, `audit`, `agent_id` 축이 있다.
- 따라서 회사는 기존 실행 축 위에 올라가는 orchestration layer로 설계하는 것이 맞다.
- PaperClip은 company control plane reference다.
- GStack은 role/workflow/QA skill system reference다.
- OpenClaw는 execution runtime / session model reference다.
- 역할은 company-owned identity 위의 template로 잡고, session mode는 별도로 분리하는 것이 맞다.
- lightweight isolation/runtime topology는 NanoClaw를 참고하는 것이 맞다.
- schema와 MCP draft는 이제 session surfaces까지 반영하는 방향이 맞다.
- root viewer는 role templates와 active sessions fixture를 실제로 서빙한다.
- 원본 MUSU는 company layer를 얹을 runtime anchor를 이미 상당수 갖고 있다.
- first backport cut은 read-first entity들로 제한하는 것이 맞다.
- 남은 자동화 불가 영역은 viewer visual confirmation과 original app final evidence 정도다.
- `musu-indexer`를 memory search layer로 연결할 방향이 생겼다.
- `musu-indexer`를 preset tree와 연결하는 path / sync root 규칙이 문서화됐다.
- company/project/agent/memory를 한 번에 생성하는 preset workstream이 필요하다.
- preset contract와 preset mock tree는 이제 둘 다 생겼다.
- preset generator까지 생겨서 scaffold shape를 반복 생성할 수 있다.
- `musu_corp`는 legacy가 아니라, 정식형 설계의 독립 검증 레퍼런스다.
- `musu_corp`에서 검증된 company runtime/govnernance 기능을 `MUSU-WORKS` contract shortlist로 다시 읽는 단계가 시작됐다.
- preset generator가 `runtime/contract + queue/lane/worker/handoff/blocker/governance` 상태 파일을 seed하도록 확장됐다.
- `MUSU-WORKS` autonomous workload routing/safety contract 문서가 추가됐다.

## 즉시 다음 단계

1. runtime contract seed를 viewer read-model에 연결
2. approval / escalation / morning review / board decision consumer query를 MCP surface에 고정
3. blocker routing evidence를 root scenario (`5070 Ti + 4060 Ti + laptop`) runbook으로 증명
