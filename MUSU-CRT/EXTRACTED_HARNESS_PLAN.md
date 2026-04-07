# MUSU-CRT Extracted Harness Plan

작성일: 2026-04-01

## 목적

`MUSU-CRT`에서 문서와 mock viewer 다음 단계로, 실제 추출 가능한 최소 harness 경계를 정한다.

## extraction candidates

### candidate A. signaling-only harness

포함:

- offer
- add ice
- close

장점:

- 경계가 가장 명확하다
- backend/frontend contract 확인이 쉽다

### candidate B. stream lifecycle harness

포함:

- start
- poll
- stop
- metrics / reconnect

장점:

- `StreamViewer`의 본체 경험에 더 가깝다

### candidate C. terminal/data bridge harness

포함:

- data channel send
- incoming callback
- terminal bridge mapping

장점:

- remote terminal의 핵심 bridge를 바로 분리할 수 있다

## recommended order

1. signaling-only harness
2. stream lifecycle harness
3. terminal/data bridge harness

## 현재 결론

첫 추출은 signaling-only가 가장 안전하다.
stream과 terminal은 그 다음 슬라이스로 가는 것이 맞다.
