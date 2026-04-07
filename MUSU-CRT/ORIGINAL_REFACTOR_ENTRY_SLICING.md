# MUSU-CRT Original Refactor Entry Slicing

작성일: 2026-04-01

## 목적

원본 MUSU에서 `MUSU-CRT` 관점으로 refactor/backport를 시작할 때, 어떤 순서로 진입해야 가장 안전한지 고정한다.

## 핵심 원칙

- viewer부터 뜯지 않는다.
- signaling부터 분리한다.
- stream lifecycle은 그 다음이다.
- terminal/data bridge는 마지막에 분리한다.

## recommended order

### 1. signaling entry cut

대상:

- [/mnt/f/Aisaak/Projects/Musu-new/release/musu-desktop/src/lib/tauri.ts](/mnt/f/Aisaak/Projects/Musu-new/release/musu-desktop/src/lib/tauri.ts)
- [/mnt/f/Aisaak/Projects/Musu-new/release/musu-desktop/src-tauri/src/commands/webrtc.rs](/mnt/f/Aisaak/Projects/Musu-new/release/musu-desktop/src-tauri/src/commands/webrtc.rs)

목표:

- frontend wrapper interface 추출
- backend signaling adapter boundary 추출
- `offer / addIce / close`를 viewer와 독립시키기

### 2. stream lifecycle cut

대상:

- [/mnt/f/Aisaak/Projects/Musu-new/release/musu-desktop/src/hooks/useRealtimeStream.ts](/mnt/f/Aisaak/Projects/Musu-new/release/musu-desktop/src/hooks/useRealtimeStream.ts)

목표:

- start/poll/stop adapter
- reconnect policy
- metrics collector

### 3. terminal/data bridge cut

대상:

- [/mnt/f/Aisaak/Projects/Musu-new/release/musu-desktop/src-tauri/src/commands/webrtc.rs](/mnt/f/Aisaak/Projects/Musu-new/release/musu-desktop/src-tauri/src/commands/webrtc.rs)
- [/mnt/f/Aisaak/Projects/Musu-new/release/musu-desktop/src/components/lighthouse/LiveView.tsx](/mnt/f/Aisaak/Projects/Musu-new/release/musu-desktop/src/components/lighthouse/LiveView.tsx)

목표:

- data channel bridge ownership 분리
- terminal session mapping boundary 추출

## why signaling first

- 원본 command surface가 이미 비교적 잘려 있다.
- UI coupling이 가장 낮다.
- mock extracted candidate가 이미 있다.
- stream보다 side effect surface가 좁다.

## immediate cut list

실제로 첫 refactor에서 건드릴 후보:

1. `tauri.ts`의 `webrtcOffer/webrtcAddIce/webrtcClose`를 별도 adapter module로 이동
2. `webrtc.rs`의 command 함수에서 runtime bridge/answer creation을 분리
3. viewer는 새 adapter interface만 호출하게 유지

## 현재 결론

첫 실제 추출은 signaling-only가 맞다.
이걸 먼저 끝낸 뒤 stream lifecycle을 분리해야 viewer와 backend 양쪽 coupling을 동시에 줄일 수 있다.
