# Musu Corp to MUSU-WORKS Migration Map

작성일: 2026-04-01

## 목적

`/mnt/f/Aisaak/Projects/musu_corp`는 레퍼런스를 보기 전에 만든 초기형 회사 구조다.
`MUSU-WORKS`는 PaperClip / GStack / OpenClaw / NanoClaw / 원본 MUSU 코드까지 반영한 정식형 설계다.

이 문서는 초기형에서 이미 맞게 잡힌 축과, 정식형에서 추가로 붙여야 할 축을 구분한다.

## 핵심 결론

- `musu_corp`는 버릴 대상이 아니다.
- `musu_corp`는 실제 운영 감각에서 나온 초기형 프로토타입이다.
- `MUSU-WORKS`는 그것을 회사 / 프로젝트 / 에이전트 / 세션 / 메모리 / MCP / schema 관점으로 정식화한 것이다.
- 따라서 목표는 재작성보다 `승격`이다.

## 구조 대응표

### company root

초기형:

- [/mnt/f/Aisaak/Projects/musu_corp/README.md](/mnt/f/Aisaak/Projects/musu_corp/README.md)
- [/mnt/f/Aisaak/Projects/musu_corp/docs](/mnt/f/Aisaak/Projects/musu_corp/docs)

정식형:

- [HOW_A_COMPANY_SHOULD_BE_BUILT.md](/home/hugh51/musu-functions/MUSU-WORKS/HOW_A_COMPANY_SHOULD_BE_BUILT.md)
- [PERSISTENCE_SCHEMA_DRAFT.md](/home/hugh51/musu-functions/MUSU-WORKS/PERSISTENCE_SCHEMA_DRAFT.md)
- [UI_INFORMATION_ARCHITECTURE.md](/home/hugh51/musu-functions/MUSU-WORKS/UI_INFORMATION_ARCHITECTURE.md)

해석:

- `musu_corp/docs`는 company policy, playbook, service catalog의 초기형이다.
- 정식형에서는 이를 `company-owned documents + company read model + company memory`로 분리한다.

### internal agents

초기형:

- [/mnt/f/Aisaak/Projects/musu_corp/internal-aios](/mnt/f/Aisaak/Projects/musu_corp/internal-aios)
- 예:
  - [/mnt/f/Aisaak/Projects/musu_corp/internal-aios/ceo](/mnt/f/Aisaak/Projects/musu_corp/internal-aios/ceo)
  - [/mnt/f/Aisaak/Projects/musu_corp/internal-aios/engineering](/mnt/f/Aisaak/Projects/musu_corp/internal-aios/engineering)
  - [/mnt/f/Aisaak/Projects/musu_corp/internal-aios/qa](/mnt/f/Aisaak/Projects/musu_corp/internal-aios/qa)

정식형:

- [AGENT_ROLE_TEMPLATES.md](/home/hugh51/musu-functions/MUSU-WORKS/AGENT_ROLE_TEMPLATES.md)
- [PROJECT_AGENT_ATTACHMENT_AND_SESSION_MODEL.md](/home/hugh51/musu-functions/MUSU-WORKS/PROJECT_AGENT_ATTACHMENT_AND_SESSION_MODEL.md)
- [COMPANY_AGENT_MEMORY_ARCHITECTURE.md](/home/hugh51/musu-functions/MUSU-WORKS/COMPANY_AGENT_MEMORY_ARCHITECTURE.md)

해석:

- `internal-aios/*`는 이미 company-owned agent라는 감각을 갖고 있다.
- 정식형에서는 이를 `company-owned identity + role template + project attachment + live session`으로 분리한다.

### templates

초기형:

- [/mnt/f/Aisaak/Projects/musu_corp/templates](/mnt/f/Aisaak/Projects/musu_corp/templates)
- [/mnt/f/Aisaak/Projects/musu_corp/templates/README.md](/mnt/f/Aisaak/Projects/musu_corp/templates/README.md)

정식형:

- [SCAFFOLDING_PRESET_ARCHITECTURE.md](/home/hugh51/musu-functions/MUSU-WORKS/SCAFFOLDING_PRESET_ARCHITECTURE.md)
- [presets/README.md](/home/hugh51/musu-functions/MUSU-WORKS/presets/README.md)
- [tools/generate_preset.py](/home/hugh51/musu-functions/MUSU-WORKS/tools/generate_preset.py)

해석:

- `templates/*`는 role-specific delivery template의 초기형이다.
- 정식형에서는 이것이 `preset / scaffold / role template library`로 승격된다.

### projects

초기형:

- [/mnt/f/Aisaak/Projects/musu_corp/projects/musu-new](/mnt/f/Aisaak/Projects/musu_corp/projects/musu-new)
- [/mnt/f/Aisaak/Projects/musu_corp/projects/musu-new/memory.md](/mnt/f/Aisaak/Projects/musu_corp/projects/musu-new/memory.md)

정식형:

- [PROJECT_AGENT_ATTACHMENT_AND_SESSION_MODEL.md](/home/hugh51/musu-functions/MUSU-WORKS/PROJECT_AGENT_ATTACHMENT_AND_SESSION_MODEL.md)
- [MCP_SURFACE_DRAFT.md](/home/hugh51/musu-functions/MUSU-WORKS/MCP_SURFACE_DRAFT.md)
- [presets/delivery-team-alpha/projects/desktop-mcp](/home/hugh51/musu-functions/MUSU-WORKS/presets/delivery-team-alpha/projects/desktop-mcp)

해석:

- `projects/*` 분리는 이미 맞게 잡혔다.
- 정식형에서는 프로젝트를 `execution owner`로 보고 workspace, memory, sessions, artifacts를 first-class로 둔다.

### memory

초기형:

- `memory.md`
- `context/`
- `skills/`

정식형:

- [COMPANY_AGENT_MEMORY_ARCHITECTURE.md](/home/hugh51/musu-functions/MUSU-WORKS/COMPANY_AGENT_MEMORY_ARCHITECTURE.md)
- [INDEXER_MEMORY_WIRING.md](/home/hugh51/musu-functions/MUSU-WORKS/INDEXER_MEMORY_WIRING.md)

해석:

- 초기형은 `memory.md` 하나에 많은 것을 몰아 넣는다.
- 정식형은 memory를 category별 폴더로 나눈다.
- skills는 memory와 분리된 capability plane으로 남긴다.

## 초기형에서 이미 맞게 잡힌 것

- 회사 아래 역할/부서별 agent 분리
- 프로젝트별 독립 공간
- `memory.md`를 통한 장기 기억
- `context/`와 `skills/`의 분리
- 템플릿 재사용
- 회사 문서와 프로젝트 실행 문서의 분리

## 정식형에서 추가된 것

- `company_id`
- `project_id` migration path
- role template plane
- project attachment model
- live session model
- approval queue projection
- MCP read surface
- runtime proof / viewer proof
- preset generator
- indexer memory wiring

## 승격 방식

### 1단계

`musu_corp`를 legacy reference로 유지한다.

### 2단계

각 초기형 개념을 정식형 용어로 다시 태깅한다.

- `internal-aios/*` -> `company agents`
- `templates/*` -> `role templates`
- `projects/*` -> `company projects`
- `memory.md` -> `categorized memory`

### 3단계

`memory.md`를 아래 카테고리로 분해한다.

- company memory
- agent memory
- project memory
- session memory

### 4단계

project별로 attachment / session 관점을 붙인다.

### 5단계

최종적으로 viewer / MCP / schema와 연결한다.

## 현재 결론

`musu_corp`는 낡은 구조가 아니라, `MUSU-WORKS`가 맞는 방향으로 가고 있다는 독립적인 검증 신호다.

즉:

- `musu_corp`는 intuition-driven initial form
- `MUSU-WORKS`는 reference-informed formal form

둘은 경쟁 관계가 아니라, 전자를 후자로 승격하는 관계다.
