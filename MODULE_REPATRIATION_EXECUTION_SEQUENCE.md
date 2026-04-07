# Module Repatriation Execution Sequence

## 목적

`musu_corp`에서 검증된 회사 기능을 `musu-functions` 각 bounded context로 실제로 내려보내는 순서를 고정한다.

이 문서는 루트 ownership 문서를 구현 가능한 모듈 작업 순서로 바꾸는 역할을 한다.

## 실행 순서

### Step 1. Root control surface shortlist

- 대상:
  - control CLI read surfaces
  - queue / lane / report status read surfaces
  - supervisor / watchdog 상태 read surface
- 산출물:
  - 루트 control layer shortlist
  - product control command family draft
- owner:
  - `musu-functions` 루트 product control layer

### Step 2. `MUSU-WORKS` runtime contract shortlist

- 대상:
  - queue item
  - lane state
  - worker result
  - handoff payload
  - approval / escalation / morning review / board decision
- 산출물:
  - `MUSU-WORKS` canonical company runtime contract shortlist
  - company ops ownership boundary clarification
- owner:
  - `MUSU-WORKS`

### Step 3. Root workforce/runtime shortlist

- 대상:
  - Codex / BitNet routing policy
  - low-cost worker service
  - runtime supervisor/watchdog integration boundary
- 산출물:
  - root runtime capability shortlist
  - worker plane ownership note
- owner:
  - `musu-functions` 루트 runtime capability

### Step 4. Consumer surface positioning

- 대상:
  - `MUSU-AS-MCP`
  - `MUSU-CRT`
  - 이후 `musu-port`, `musu-connects`
- 산출물:
  - 각 모듈이 read/consumer로 붙는 범위
  - owner 모듈과 consumer 모듈의 책임 분리
- owner:
  - 루트 plan alignment

### Step 5. Module backlog splice

- 대상:
  - 각 bounded context의 `MASTER_PLAN.md`
  - 각 bounded context의 `TODO_EXECUTION_BOARD.md`
- 산출물:
  - repatriation priority가 포함된 모듈별 active/queued backlog
- owner:
  - 루트 + 각 bounded context

## immediate focus

지금 immediate focus는 아래 두 개다.

1. `MUSU-WORKS`에서 company runtime contract shortlist를 더 구체화한다.
2. 루트에서 control surface / runtime capability shortlist를 다음 구현 backlog 형태로 정리한다.

## 완료 기준

- 루트 ownership 문서가 모듈 실행 순서로 변환돼 있다.
- `MUSU-WORKS`와 루트 runtime/control layer의 active todo가 productization 기준으로 정렬돼 있다.
- 이후 각 bounded context가 “무엇을 받을지”가 아니라 “언제 어떤 cut으로 받을지”까지 읽을 수 있다.
