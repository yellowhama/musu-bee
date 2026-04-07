# MUSU-CRT Master Plan

## 목표

`MUSU-CRT`의 목표는 `musu-functions` 안에서 CRT 축의 canonical 구현을 만들고, 나중에만 원본 MUSE/MUSE-BEE로 backport 가능한 bounded context로 정리하는 것이다.

여기서 `CRT`는 다른 컴퓨터에 화면과 제어를 넘기는 원격 runtime을 뜻한다.

## context 정의

`CRT`는 아래 plane으로 나뉜다.

- signaling plane
- stream lifecycle plane
- terminal / data plane
- viewer UX plane
- extraction / backport plane

## transport 원칙

cross-computer CRT의 primary transport는 `WebRTC + WebSocket`이다.

- `WebRTC`
  - primary remote transport
  - screen/media, low-latency control, data channel에 사용
- `WebSocket`
  - signaling / control fallback
  - session events / remote relay candidate
- `HTTP`
  - bootstrap / metadata / local proof / fallback only
  - primary remote stream transport로 쓰지 않는다

즉 `python http.server`로 연 mock viewer/harness는 개발용 proof일 뿐이고, 실제 CRT transport를 대표하지 않는다.

## workspace 원칙

- canonical implementation workspace
  - [/home/hugh51/musu-functions/MUSU-CRT](/home/hugh51/musu-functions/MUSU-CRT)
- reference / backport-later repo
  - [/mnt/f/Aisaak/Projects/Musu-new](/mnt/f/Aisaak/Projects/Musu-new)

즉 구현은 먼저 `MUSU-CRT`에서 끝내고, 원본 repo는 비교와 나중 backport 대상으로만 쓴다.

## 원본 코드 truth

현재 원본 MUSU에는 이미 아래가 있다.

- WebRTC tauri commands
- frontend signaling wrappers
- realtime stream hook
- stream viewer UI
- data channel -> terminal send bridge
- local realtime frame path

즉 `MUSU-CRT`는 새 기능 상상이 아니라, 기존 구현을 transport-first bounded context로 추출하는 작업이다.

## 원본 코드 근거

- viewer
  - [/mnt/f/Aisaak/Projects/Musu-new/release/musu-desktop/src/components/viewer/StreamViewer.tsx](/mnt/f/Aisaak/Projects/Musu-new/release/musu-desktop/src/components/viewer/StreamViewer.tsx)
- realtime hook
  - [/mnt/f/Aisaak/Projects/Musu-new/release/musu-desktop/src/hooks/useRealtimeStream.ts](/mnt/f/Aisaak/Projects/Musu-new/release/musu-desktop/src/hooks/useRealtimeStream.ts)
- frontend tauri bridge
  - [/mnt/f/Aisaak/Projects/Musu-new/release/musu-desktop/src/lib/tauri.ts](/mnt/f/Aisaak/Projects/Musu-new/release/musu-desktop/src/lib/tauri.ts)
  - [/mnt/f/Aisaak/Projects/Musu-new/release/musu-desktop/src/lib/commandCatalog.ts](/mnt/f/Aisaak/Projects/Musu-new/release/musu-desktop/src/lib/commandCatalog.ts)
- backend commands
  - [/mnt/f/Aisaak/Projects/Musu-new/release/musu-desktop/src-tauri/src/commands/webrtc.rs](/mnt/f/Aisaak/Projects/Musu-new/release/musu-desktop/src-tauri/src/commands/webrtc.rs)

## 실행 전략

1. source map 고정
2. transport 역할을 `HTTP fallback / WS+WebRTC primary`로 고정
3. signaling / stream / terminal-data plane contract 분리
4. plane별 mock harness 작성
5. extracted candidate code를 `MUSU-CRT` 안에 먼저 구현
6. runtime gate가 닫힌 뒤에만 backport 진입

## 현재 단계

현재 `MUSU-CRT`는 canonical 구현 단계, canonical direct smoke 단계, remote session canonical harness 단계까지 닫혔고, 이제부터는 `slice-driven backport preparation` 단계다.

즉 앞으로의 중심 질문은:

- 무엇을 먼저 옮길 것인가
- 어떤 검증 단위로 옮길 것인가
- 어디까지를 한 slice로 볼 것인가

이다.

## active and queued plans

### Active

- [plans/PLAN_12_RUNTIME_REFACTOR_GATE.md](/home/hugh51/musu-functions/MUSU-CRT/plans/PLAN_12_RUNTIME_REFACTOR_GATE.md)

### Queued

- [plans/PLAN_29_SLICE_03_BACKPORT_TIMING.md](/home/hugh51/musu-functions/MUSU-CRT/plans/PLAN_29_SLICE_03_BACKPORT_TIMING.md)
- [plans/PLAN_25_SLICE_03_REMOTE_SESSION_ENTRY.md](/home/hugh51/musu-functions/MUSU-CRT/plans/PLAN_25_SLICE_03_REMOTE_SESSION_ENTRY.md)
- [plans/PLAN_28_REMOTE_SESSION_CANONICAL_HARNESS.md](/home/hugh51/musu-functions/MUSU-CRT/plans/PLAN_28_REMOTE_SESSION_CANONICAL_HARNESS.md)
- [plans/PLAN_23_BACKPORT_EXECUTION_SEQUENCE.md](/home/hugh51/musu-functions/MUSU-CRT/plans/PLAN_23_BACKPORT_EXECUTION_SEQUENCE.md)
- [plans/PLAN_10_SIGNALING_ADAPTER_SLICE.md](/home/hugh51/musu-functions/MUSU-CRT/plans/PLAN_10_SIGNALING_ADAPTER_SLICE.md)
- [plans/PLAN_27_CANONICAL_DIRECT_SMOKE.md](/home/hugh51/musu-functions/MUSU-CRT/plans/PLAN_27_CANONICAL_DIRECT_SMOKE.md)

## completed detailed plans

- [plans/PLAN_00_SOURCE_BASELINE.md](/home/hugh51/musu-functions/MUSU-CRT/plans/PLAN_00_SOURCE_BASELINE.md)
- [plans/PLAN_01_SCREEN_TAB_REPRO.md](/home/hugh51/musu-functions/MUSU-CRT/plans/PLAN_01_SCREEN_TAB_REPRO.md)
- [plans/PLAN_02_SIGNALING_CONTRACT.md](/home/hugh51/musu-functions/MUSU-CRT/plans/PLAN_02_SIGNALING_CONTRACT.md)
- [plans/PLAN_03_STREAM_LIFECYCLE_CONTRACT.md](/home/hugh51/musu-functions/MUSU-CRT/plans/PLAN_03_STREAM_LIFECYCLE_CONTRACT.md)
- [plans/PLAN_04_TERMINAL_DATA_PLANE.md](/home/hugh51/musu-functions/MUSU-CRT/plans/PLAN_04_TERMINAL_DATA_PLANE.md)
- [plans/PLAN_05_EXTRACTED_HARNESS.md](/home/hugh51/musu-functions/MUSU-CRT/plans/PLAN_05_EXTRACTED_HARNESS.md)
- [plans/PLAN_06_HARNESS_SMOKE_AND_PARITY.md](/home/hugh51/musu-functions/MUSU-CRT/plans/PLAN_06_HARNESS_SMOKE_AND_PARITY.md)
- [plans/PLAN_07_REFACTOR_ENTRY_SLICING.md](/home/hugh51/musu-functions/MUSU-CRT/plans/PLAN_07_REFACTOR_ENTRY_SLICING.md)
- [plans/PLAN_08_STREAM_EXTRACTION_CANDIDATE.md](/home/hugh51/musu-functions/MUSU-CRT/plans/PLAN_08_STREAM_EXTRACTION_CANDIDATE.md)
- [plans/PLAN_09_TRANSPORT_FIRST_ARCHITECTURE.md](/home/hugh51/musu-functions/MUSU-CRT/plans/PLAN_09_TRANSPORT_FIRST_ARCHITECTURE.md)

## foundational docs

- [README.md](/home/hugh51/musu-functions/MUSU-CRT/README.md)
- [CURRENT_STATE.md](/home/hugh51/musu-functions/MUSU-CRT/CURRENT_STATE.md)
- [CRT_SOURCE_MAP.md](/home/hugh51/musu-functions/MUSU-CRT/CRT_SOURCE_MAP.md)
- [SCREEN_TAB_SOURCE_ANALYSIS.md](/home/hugh51/musu-functions/MUSU-CRT/SCREEN_TAB_SOURCE_ANALYSIS.md)
- [CRT_TRANSPORT_ARCHITECTURE.md](/home/hugh51/musu-functions/MUSU-CRT/CRT_TRANSPORT_ARCHITECTURE.md)
- [BACKPORT_LATER_POLICY.md](/home/hugh51/musu-functions/MUSU-CRT/BACKPORT_LATER_POLICY.md)
- [BACKPORT_LATER_CHECKLIST.md](/home/hugh51/musu-functions/MUSU-CRT/BACKPORT_LATER_CHECKLIST.md)
- [BACKPORT_SLICE_STRATEGY.md](/home/hugh51/musu-functions/MUSU-CRT/BACKPORT_SLICE_STRATEGY.md)
- [FIRST_BACKPORT_SLICE_SIGNALING_ENTRY.md](/home/hugh51/musu-functions/MUSU-CRT/FIRST_BACKPORT_SLICE_SIGNALING_ENTRY.md)
- [BACKPORT_SLICE_01_SIGNALING_PROOF_2026-04-02.md](/home/hugh51/musu-functions/MUSU-CRT/BACKPORT_SLICE_01_SIGNALING_PROOF_2026-04-02.md)
- [FIRST_BACKPORT_SLICE_02_LOCAL_STREAM_ENTRY.md](/home/hugh51/musu-functions/MUSU-CRT/FIRST_BACKPORT_SLICE_02_LOCAL_STREAM_ENTRY.md)
- [BACKPORT_SLICE_02_LOCAL_STREAM_STATUS_2026-04-02.md](/home/hugh51/musu-functions/MUSU-CRT/BACKPORT_SLICE_02_LOCAL_STREAM_STATUS_2026-04-02.md)
- [BACKPORT_EXECUTION_SEQUENCE.md](/home/hugh51/musu-functions/MUSU-CRT/BACKPORT_EXECUTION_SEQUENCE.md)
- [SIGNALING_ADAPTER_SLICE_MAP.md](/home/hugh51/musu-functions/MUSU-CRT/SIGNALING_ADAPTER_SLICE_MAP.md)
- [STREAM_PATH_SPLIT_MAP.md](/home/hugh51/musu-functions/MUSU-CRT/STREAM_PATH_SPLIT_MAP.md)
- [RUNTIME_REFACTOR_GATE.md](/home/hugh51/musu-functions/MUSU-CRT/RUNTIME_REFACTOR_GATE.md)
- [TODO_EXECUTION_BOARD.md](/home/hugh51/musu-functions/MUSU-CRT/TODO_EXECUTION_BOARD.md)
