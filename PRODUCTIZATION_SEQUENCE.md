# Productization Sequence

## 목적

`musu_corp`에서 검증된 기능을 어떤 순서로 `musu-functions` 제품 capability로 승격할지 고정한다.

## sequence

### Cut 1. Product Control Surface

- 대상:
  - control CLI
  - queue / lane / report read surface
  - watchdog / supervisor status surface
- target:
  - root product control layer
- 이유:
  - 이후 모든 운영 기능이 이 표면을 타야 한다.

### Cut 2. Company Runtime Contracts

- 대상:
  - queue item schema
  - lane state schema
  - worker result schema
  - handoff payload schema
- target:
  - `MUSU-WORKS`
- 이유:
  - 회사/프로젝트/에이전트 runtime의 정식 계약이기 때문

### Cut 3. Governance And Review

- 대상:
  - approval
  - escalation
  - morning review
  - board decision
- target:
  - `MUSU-WORKS`
- 이유:
  - company ops의 핵심 governance surface

### Cut 4. Workforce Routing

- 대상:
  - Codex / BitNet assignment
  - low-cost worker profile
  - persistent BitNet employee service
- target:
  - root runtime capability
- 이유:
  - 여러 context에서 공통으로 쓰는 worker plane

### Cut 5. Product Integration

- 대상:
  - `musu-port`, `musu-connects`, `MUSU-AS-MCP`, `MUSU-CRT`와의 연결
- 이유:
  - 회사 기능이 제품 기능으로 실제 흡수되는 단계

## stop rule

- 지금은 sequence만 고정한다.
- 실제 코드 환원은 각 cut마다 별도 모듈 플랜 문서로 진행한다.
