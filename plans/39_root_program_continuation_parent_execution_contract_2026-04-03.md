# Plan 39: Root Program Continuation Parent Execution Contract (2026-04-03)

## Objective

`MUS-144`를 루트 parent control packet으로 유지하면서 `Wave C -> D -> E -> F`를 작은 실행 패킷으로 순차 진행하고, 각 파동의 상태/리스크/resume order를 board와 문서에 동기화한다.

## Why This Exists

- `MUS-145`(Wave A)와 `MUS-147`(Wave B)이 완료되었고, 남은 완료 경로는 `MUS-148`~`MUS-151`에 집중된다.
- parent 이슈(`MUS-144`)는 "실행 분해 + 순서 유지 + blocker 전파"를 담당해야 한다.
- control-plane restart 이후 run-hygiene debt(`issueId: null`)가 남아 있어, 작업 진행 중에도 운영 청결 상태를 병행 관리해야 한다.

## Scope

### In Scope

1. Parent issue(`MUS-144`) 기준의 실행 순서 고정
   - `MUS-148` (Wave C, CTO)
   - `MUS-149` (Wave D, Founding Engineer)
   - `MUS-150` (Wave E, Chief of Staff)
   - `MUS-151` (Wave F, QA Lead)
2. 각 파동의 entry/exit gate를 문서와 board에서 동일하게 유지
3. blocker 발생 시 parent issue comment에 unblock note와 resume order를 즉시 기록

### Out of Scope

1. 각 개별 파동의 구현 상세를 parent issue에서 대체하지 않음
2. 단일 파동 이슈의 acceptance artifact를 parent에 복제하지 않음

## Execution Contract

1. 파동 시작 조건
   - 해당 issue plan 문서가 live issue document에 등록되어 있어야 한다.
   - 직전 파동의 종료 상태가 `done` 또는 명시적 `blocked`로 기록되어 있어야 한다.
2. 파동 진행 중
   - owner는 issue comment로 진행/리스크/다음 행동을 남긴다.
   - parent(`MUS-144`)에는 파동별 요약만 남긴다.
3. 파동 종료 시
   - artifact 경로 + replay command + 잔여 리스크를 이슈에 기록한다.
   - 다음 파동 entry 여부를 parent issue comment로 확정한다.

## Acceptance

1. `MUS-144`에 파동 순서와 owner가 고정되어 있다.
2. `MUS-148`~`MUS-151`가 plan document를 갖고 있다.
3. parent issue와 `TODO_EXECUTION_BOARD.md`의 in-progress/backlog 상태가 일치한다.
4. run-hygiene debt가 남아 있다면 unblock note와 책임 패킷(`MUS-146`) 연결이 명시되어 있다.

## Handoff

- Parent owner: `CEO 2` (`5dffee24-ee3f-4b75-89c8-11608fe7e186`)
- Ops hygiene owner: `Chief of Staff` (`409405bd-9b83-4d5c-9250-3085adeb6ad0`) via `MUS-146`
- Expected next transition:
  1. `MUS-148` start
  2. `MUS-149` start
  3. `MUS-150` start
  4. `MUS-151` final acceptance
