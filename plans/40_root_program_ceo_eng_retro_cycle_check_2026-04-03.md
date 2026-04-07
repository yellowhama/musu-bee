# Plan 40: Root Program CEO/ENG/Retro Cycle Check (2026-04-03)

## CEO Review (`SELECTIVE EXPANSION`)

### What To Preserve

- current wave decomposition (`C -> D -> E -> F`)는 scope discipline이 좋다.
- owner mapping이 명확하다 (`CTO`, `Founding Engineer`, `Chief of Staff`, `QA Lead`).

### Selective Expansion

- 단순 completion이 아니라 "운영 신뢰도"를 product acceptance 정의에 포함한다.
- 즉 Wave F acceptance는 기능 증명 + run-governance clarity를 함께 충족해야 한다.

### CEO Decision

1. scope는 유지한다.
2. 단, final acceptance에 run projection consistency evidence를 추가한다.

## ENG Review

### Architecture/Governance Risks

1. heartbeat projection mismatch
   - `heartbeat-runs.issueId=null` vs `contextSnapshot.issueId` mapping
   - triage 없으면 on-call/operator 해석 오류 유발
2. evidence chain fragmentation
   - wave별 artifact는 있으나 end-to-end replay narrative가 쉽게 끊길 수 있음

### Execution Constraints

1. wave 간 parallel start 금지
2. 각 wave 진입 전 plan doc + first-progress comment를 gate로 강제
3. wave 종료 시 replay command + artifact path + residual risk를 필수 기록

### Verification Contract

- Wave C 종료 시: transport evidence source가 simulated 아님을 증명
- Wave D 종료 시: health/trust/freshness UI semantics와 runtime attach lifecycle alignment 증명
- Wave E 종료 시: blocker/approval/governance runtime linkage 증명
- Wave F 종료 시: full chain replay + run-governance evidence bundle 증명

## Retro (Latest Cycle)

### What Worked

1. stale queued run을 즉시 취소해 queue hygiene를 복구했다.
2. local plans와 issue plan documents를 revision 기준으로 재정렬했다.
3. parent issue(`MUS-144`)에 resume order를 명시해 board babysitting 비용을 줄였다.

### What Hurt

1. issue linkage field가 API projection에 일관되지 않아 해석 부하가 컸다.
2. 일부 historical docs가 최신 상태처럼 읽히는 drift가 있었다.

### Process Adjustment

1. live-state 문서는 historical snapshot + timestamped addendum 구조로 유지
2. root board 업데이트 시 반드시 live-runs + heartbeat-runs를 동시에 확인
3. unblock note 없이 escalation 금지

## Action Items

1. `MUS-146`에서 run projection debt close condition을 명문화
2. `MUS-148` 시작 시 replay command/artifact target을 issue 첫 comment에 고정
3. `MUS-151` acceptance template에 run-governance section 포함
