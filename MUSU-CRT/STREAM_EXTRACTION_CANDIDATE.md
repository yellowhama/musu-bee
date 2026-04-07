# MUSU-CRT Stream Extraction Candidate

작성일: 2026-04-01

## 목적

`useRealtimeStream`를 이후 실제로 분리할 때 어떤 단위로 자를지 미리 정리한다.

## source anchor

- [/mnt/f/Aisaak/Projects/Musu-new/release/musu-desktop/src/hooks/useRealtimeStream.ts](/mnt/f/Aisaak/Projects/Musu-new/release/musu-desktop/src/hooks/useRealtimeStream.ts)

## extraction units

### A. stream adapter

책임:

- `startRealtimeStream`
- `getRealtimeFrame`
- `stopRealtimeStream`
- `updateRealtimeStream`

형태:

- tauri invoke wrapper 집합

### B. frame parser

책임:

- raw frame buffer parse
- metadata json length decode
- payload extraction
- clipboard/gui 분기

### C. metrics collector

책임:

- fps 계산
- frame size KB
- total MB
- reconnect count

### D. reconnect policy

책임:

- max reconnect
- exponential backoff
- retry state

## recommended split

1. `stream adapter`
2. `metrics collector`
3. `reconnect policy`
4. 마지막에 hook shell만 남기기

## why not first

- `useRealtimeStream`는 state와 side effect가 많다.
- UI, capture, metrics, reconnect가 같이 묶여 있다.
- signaling보다 추출 리스크가 더 크다.

## current conclusion

stream lifecycle은 signaling 추출이 끝난 다음, adapter + metrics + reconnect policy로 잘라 들어가는 것이 가장 안전하다.
