# Backport Execution Sequence

작성일: 2026-04-02

## 목적

`MUSU-CRT` canonical 결과를 원본 repo에 적용할 때의 실행 순서를 한 장으로 고정한다.

## 단계

### Step 1

`Slice 1 - signaling thin slice`

기준 문서:

- [FIRST_BACKPORT_SLICE_SIGNALING_ENTRY.md](/home/hugh51/musu-functions/MUSU-CRT/FIRST_BACKPORT_SLICE_SIGNALING_ENTRY.md)
- [BACKPORT_SLICE_STRATEGY.md](/home/hugh51/musu-functions/MUSU-CRT/BACKPORT_SLICE_STRATEGY.md)

### Step 2

`Slice 2 - local stream split`

기준 문서:

- [STREAM_PATH_SPLIT_MAP.md](/home/hugh51/musu-functions/MUSU-CRT/STREAM_PATH_SPLIT_MAP.md)
- [BACKPORT_SLICE_STRATEGY.md](/home/hugh51/musu-functions/MUSU-CRT/BACKPORT_SLICE_STRATEGY.md)
- [SLICE_02_LOCAL_STREAM_SMOKE_RUNBOOK_2026-04-02.md](/home/hugh51/musu-functions/MUSU-CRT/SLICE_02_LOCAL_STREAM_SMOKE_RUNBOOK_2026-04-02.md)

### Step 3

`Slice 3 - remote session controller`

기준 문서:

- [RUNTIME_REFACTOR_GATE.md](/home/hugh51/musu-functions/MUSU-CRT/RUNTIME_REFACTOR_GATE.md)
- [BACKPORT_SLICE_STRATEGY.md](/home/hugh51/musu-functions/MUSU-CRT/BACKPORT_SLICE_STRATEGY.md)
- [FIRST_BACKPORT_SLICE_03_REMOTE_SESSION_ENTRY.md](/home/hugh51/musu-functions/MUSU-CRT/FIRST_BACKPORT_SLICE_03_REMOTE_SESSION_ENTRY.md)

## 운영 원칙

- 한 번에 한 slice만 반영한다
- slice마다 build / test / runtime smoke를 다시 확보한다
- 다음 slice는 이전 slice가 닫힌 뒤에만 시작한다

## 현재 상태

- Step 1: applied + proven
- Step 2: applied candidate / build proven / smoke pending
- Step 3: queued
