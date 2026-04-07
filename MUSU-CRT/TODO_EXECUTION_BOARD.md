# MUSU-CRT TODO Execution Board

## 원칙

- 한 번에 하나의 active objective만 진행한다.
- source map과 runtime truth를 먼저 고정한다.
- repro viewer와 mock은 실제 extracted harness 전 단계다.
- 원본 코드를 바로 뜯기 전에 `MUSU-CRT`에서 contract를 먼저 문서화한다.
- cross-computer CRT에서는 `HTTP`를 주 transport로 삼지 않는다.
- `WebRTC + WebSocket`을 primary transport로 본다.

## 현재 상태

- `PLAN_00` source baseline: 완료
- `PLAN_01` screen tab repro: 완료
- `PLAN_02` signaling contract: 완료
- `PLAN_03` stream lifecycle contract: 완료
- `PLAN_04` terminal data plane: 완료
- `PLAN_05` extracted harness plan: 완료
- `PLAN_06` harness smoke and parity: 완료
- `PLAN_09` transport-first architecture: 완료

## Todo List

### In Progress

1. final workspace closure
   - 산출물: runtime prep checklist + reference-only note + closure note
   - 목적: 다음 backport window 전까지 작업공간 상태 고정

### Queued

없음

## Done

1. source baseline
   - [plans/PLAN_00_SOURCE_BASELINE.md](/home/hugh51/musu-functions/MUSU-CRT/plans/PLAN_00_SOURCE_BASELINE.md)
   - [CRT_SOURCE_MAP.md](/home/hugh51/musu-functions/MUSU-CRT/CRT_SOURCE_MAP.md)
2. screen tab source analysis and repro
   - [SCREEN_TAB_SOURCE_ANALYSIS.md](/home/hugh51/musu-functions/MUSU-CRT/SCREEN_TAB_SOURCE_ANALYSIS.md)
   - [plans/PLAN_01_SCREEN_TAB_REPRO.md](/home/hugh51/musu-functions/MUSU-CRT/plans/PLAN_01_SCREEN_TAB_REPRO.md)
   - [mock/screen_tab_fixture.json](/home/hugh51/musu-functions/MUSU-CRT/mock/screen_tab_fixture.json)
   - [viewer/index.html](/home/hugh51/musu-functions/MUSU-CRT/viewer/index.html)
   - [viewer/app.js](/home/hugh51/musu-functions/MUSU-CRT/viewer/app.js)
   - [viewer/styles.css](/home/hugh51/musu-functions/MUSU-CRT/viewer/styles.css)
3. signaling contract
   - [plans/PLAN_02_SIGNALING_CONTRACT.md](/home/hugh51/musu-functions/MUSU-CRT/plans/PLAN_02_SIGNALING_CONTRACT.md)
   - [SIGNALING_CONTRACT.md](/home/hugh51/musu-functions/MUSU-CRT/SIGNALING_CONTRACT.md)
4. stream lifecycle contract
   - [plans/PLAN_03_STREAM_LIFECYCLE_CONTRACT.md](/home/hugh51/musu-functions/MUSU-CRT/plans/PLAN_03_STREAM_LIFECYCLE_CONTRACT.md)
   - [STREAM_LIFECYCLE_CONTRACT.md](/home/hugh51/musu-functions/MUSU-CRT/STREAM_LIFECYCLE_CONTRACT.md)
5. terminal/data plane contract
   - [plans/PLAN_04_TERMINAL_DATA_PLANE.md](/home/hugh51/musu-functions/MUSU-CRT/plans/PLAN_04_TERMINAL_DATA_PLANE.md)
   - [TERMINAL_DATA_PLANE_CONTRACT.md](/home/hugh51/musu-functions/MUSU-CRT/TERMINAL_DATA_PLANE_CONTRACT.md)
6. extracted harness plan
   - [plans/PLAN_05_EXTRACTED_HARNESS.md](/home/hugh51/musu-functions/MUSU-CRT/plans/PLAN_05_EXTRACTED_HARNESS.md)
   - [EXTRACTED_HARNESS_PLAN.md](/home/hugh51/musu-functions/MUSU-CRT/EXTRACTED_HARNESS_PLAN.md)
7. signaling harness
   - [harness/signaling/index.html](/home/hugh51/musu-functions/MUSU-CRT/harness/signaling/index.html)
   - [harness/signaling/app.js](/home/hugh51/musu-functions/MUSU-CRT/harness/signaling/app.js)
8. stream lifecycle harness
   - [harness/stream-lifecycle/index.html](/home/hugh51/musu-functions/MUSU-CRT/harness/stream-lifecycle/index.html)
   - [harness/stream-lifecycle/app.js](/home/hugh51/musu-functions/MUSU-CRT/harness/stream-lifecycle/app.js)
9. terminal/data plane harness
   - [harness/terminal-data-plane/index.html](/home/hugh51/musu-functions/MUSU-CRT/harness/terminal-data-plane/index.html)
   - [harness/terminal-data-plane/app.js](/home/hugh51/musu-functions/MUSU-CRT/harness/terminal-data-plane/app.js)
10. harness smoke and parity
   - [plans/PLAN_06_HARNESS_SMOKE_AND_PARITY.md](/home/hugh51/musu-functions/MUSU-CRT/plans/PLAN_06_HARNESS_SMOKE_AND_PARITY.md)
   - [HARNESS_SMOKE_PROOF_2026-04-01.md](/home/hugh51/musu-functions/MUSU-CRT/HARNESS_SMOKE_PROOF_2026-04-01.md)
   - [SIGNALING_EXTRACTED_CANDIDATE.md](/home/hugh51/musu-functions/MUSU-CRT/SIGNALING_EXTRACTED_CANDIDATE.md)
   - [FINAL_PARITY_NOTE_2026-04-01.md](/home/hugh51/musu-functions/MUSU-CRT/FINAL_PARITY_NOTE_2026-04-01.md)
11. refactor entry slicing
   - [plans/PLAN_07_REFACTOR_ENTRY_SLICING.md](/home/hugh51/musu-functions/MUSU-CRT/plans/PLAN_07_REFACTOR_ENTRY_SLICING.md)
   - [ORIGINAL_REFACTOR_ENTRY_SLICING.md](/home/hugh51/musu-functions/MUSU-CRT/ORIGINAL_REFACTOR_ENTRY_SLICING.md)
12. stream extraction candidate
   - [plans/PLAN_08_STREAM_EXTRACTION_CANDIDATE.md](/home/hugh51/musu-functions/MUSU-CRT/plans/PLAN_08_STREAM_EXTRACTION_CANDIDATE.md)
   - [STREAM_EXTRACTION_CANDIDATE.md](/home/hugh51/musu-functions/MUSU-CRT/STREAM_EXTRACTION_CANDIDATE.md)
13. transport-first architecture
   - [plans/PLAN_09_TRANSPORT_FIRST_ARCHITECTURE.md](/home/hugh51/musu-functions/MUSU-CRT/plans/PLAN_09_TRANSPORT_FIRST_ARCHITECTURE.md)
   - [CRT_TRANSPORT_ARCHITECTURE.md](/home/hugh51/musu-functions/MUSU-CRT/CRT_TRANSPORT_ARCHITECTURE.md)
14. signaling adapter slice
   - [plans/PLAN_10_SIGNALING_ADAPTER_SLICE.md](/home/hugh51/musu-functions/MUSU-CRT/plans/PLAN_10_SIGNALING_ADAPTER_SLICE.md)
   - [SIGNALING_ADAPTER_SLICE_MAP.md](/home/hugh51/musu-functions/MUSU-CRT/SIGNALING_ADAPTER_SLICE_MAP.md)
15. stream path split
   - [plans/PLAN_11_STREAM_PATH_SPLIT.md](/home/hugh51/musu-functions/MUSU-CRT/plans/PLAN_11_STREAM_PATH_SPLIT.md)
   - [STREAM_PATH_SPLIT_MAP.md](/home/hugh51/musu-functions/MUSU-CRT/STREAM_PATH_SPLIT_MAP.md)
16. runtime refactor gate
   - [plans/PLAN_12_RUNTIME_REFACTOR_GATE.md](/home/hugh51/musu-functions/MUSU-CRT/plans/PLAN_12_RUNTIME_REFACTOR_GATE.md)
   - [RUNTIME_REFACTOR_GATE.md](/home/hugh51/musu-functions/MUSU-CRT/RUNTIME_REFACTOR_GATE.md)
17. extraction implementation progress
   - [EXTRACTION_IMPLEMENTATION_PROGRESS_2026-04-01.md](/home/hugh51/musu-functions/MUSU-CRT/EXTRACTION_IMPLEMENTATION_PROGRESS_2026-04-01.md)
18. canonical implementation first
   - [plans/PLAN_13_CANONICAL_IMPLEMENTATION_FIRST.md](/home/hugh51/musu-functions/MUSU-CRT/plans/PLAN_13_CANONICAL_IMPLEMENTATION_FIRST.md)
   - [BACKPORT_LATER_POLICY.md](/home/hugh51/musu-functions/MUSU-CRT/BACKPORT_LATER_POLICY.md)
19. signaling coordinator
   - [plans/PLAN_14_SIGNALING_COORDINATOR.md](/home/hugh51/musu-functions/MUSU-CRT/plans/PLAN_14_SIGNALING_COORDINATOR.md)
   - [extracted/signaling/session_coordinator.ts](/home/hugh51/musu-functions/MUSU-CRT/extracted/signaling/session_coordinator.ts)
20. local stream controller
   - [plans/PLAN_15_LOCAL_STREAM_CONTROLLER.md](/home/hugh51/musu-functions/MUSU-CRT/plans/PLAN_15_LOCAL_STREAM_CONTROLLER.md)
   - [extracted/stream/local_stream_controller.ts](/home/hugh51/musu-functions/MUSU-CRT/extracted/stream/local_stream_controller.ts)
21. canonical board
   - [plans/PLAN_16_CANONICAL_BOARD_AND_BACKPORT_LATER.md](/home/hugh51/musu-functions/MUSU-CRT/plans/PLAN_16_CANONICAL_BOARD_AND_BACKPORT_LATER.md)
   - [CANONICAL_IMPLEMENTATION_BOARD.md](/home/hugh51/musu-functions/MUSU-CRT/CANONICAL_IMPLEMENTATION_BOARD.md)
22. canonical harness integration
   - [plans/PLAN_17_CANONICAL_HARNESS_INTEGRATION.md](/home/hugh51/musu-functions/MUSU-CRT/plans/PLAN_17_CANONICAL_HARNESS_INTEGRATION.md)
   - [HARNESS_INTEGRATION_PROGRESS_2026-04-01.md](/home/hugh51/musu-functions/MUSU-CRT/HARNESS_INTEGRATION_PROGRESS_2026-04-01.md)
23. remote session controller
   - [plans/PLAN_18_REMOTE_SESSION_CONTROLLER.md](/home/hugh51/musu-functions/MUSU-CRT/plans/PLAN_18_REMOTE_SESSION_CONTROLLER.md)
   - [extracted/stream/remote_session_controller.ts](/home/hugh51/musu-functions/MUSU-CRT/extracted/stream/remote_session_controller.ts)
24. backport-later checklist
   - [plans/PLAN_19_BACKPORT_LATER_CHECKLIST.md](/home/hugh51/musu-functions/MUSU-CRT/plans/PLAN_19_BACKPORT_LATER_CHECKLIST.md)
   - [BACKPORT_LATER_CHECKLIST.md](/home/hugh51/musu-functions/MUSU-CRT/BACKPORT_LATER_CHECKLIST.md)
25. final implementation status
   - [FINAL_IMPLEMENTATION_STATUS_2026-04-01.md](/home/hugh51/musu-functions/MUSU-CRT/FINAL_IMPLEMENTATION_STATUS_2026-04-01.md)
26. canonical harness proof
   - [CANONICAL_HARNESS_PROOF_2026-04-01.md](/home/hugh51/musu-functions/MUSU-CRT/CANONICAL_HARNESS_PROOF_2026-04-01.md)
27. original repo proof and closure docs
   - [plans/PLAN_20_ORIGINAL_REPO_PROOF_AND_CLOSURE.md](/home/hugh51/musu-functions/MUSU-CRT/plans/PLAN_20_ORIGINAL_REPO_PROOF_AND_CLOSURE.md)
   - [ORIGINAL_REPO_COMPILE_RUNTIME_PROOF_RUNBOOK_2026-04-02.md](/home/hugh51/musu-functions/MUSU-CRT/ORIGINAL_REPO_COMPILE_RUNTIME_PROOF_RUNBOOK_2026-04-02.md)
   - [BACKPORT_DECISION_NOTE_2026-04-02.md](/home/hugh51/musu-functions/MUSU-CRT/BACKPORT_DECISION_NOTE_2026-04-02.md)
   - [FINAL_CLOSURE_NOTE_2026-04-02.md](/home/hugh51/musu-functions/MUSU-CRT/FINAL_CLOSURE_NOTE_2026-04-02.md)
28. original repo proof progress
   - [ORIGINAL_REPO_PROOF_PROGRESS_2026-04-02.md](/home/hugh51/musu-functions/MUSU-CRT/ORIGINAL_REPO_PROOF_PROGRESS_2026-04-02.md)
29. backport slice strategy
   - [plans/PLAN_21_BACKPORT_SLICE_STRATEGY.md](/home/hugh51/musu-functions/MUSU-CRT/plans/PLAN_21_BACKPORT_SLICE_STRATEGY.md)
   - [BACKPORT_SLICE_STRATEGY.md](/home/hugh51/musu-functions/MUSU-CRT/BACKPORT_SLICE_STRATEGY.md)
30. first backport slice signaling
   - [plans/PLAN_22_FIRST_BACKPORT_SLICE_SIGNALING.md](/home/hugh51/musu-functions/MUSU-CRT/plans/PLAN_22_FIRST_BACKPORT_SLICE_SIGNALING.md)
   - [FIRST_BACKPORT_SLICE_SIGNALING_ENTRY.md](/home/hugh51/musu-functions/MUSU-CRT/FIRST_BACKPORT_SLICE_SIGNALING_ENTRY.md)
31. backport execution sequence
   - [plans/PLAN_23_BACKPORT_EXECUTION_SEQUENCE.md](/home/hugh51/musu-functions/MUSU-CRT/plans/PLAN_23_BACKPORT_EXECUTION_SEQUENCE.md)
   - [BACKPORT_EXECUTION_SEQUENCE.md](/home/hugh51/musu-functions/MUSU-CRT/BACKPORT_EXECUTION_SEQUENCE.md)
32. backport slice 01 signaling proof
   - [BACKPORT_SLICE_01_SIGNALING_PROOF_2026-04-02.md](/home/hugh51/musu-functions/MUSU-CRT/BACKPORT_SLICE_01_SIGNALING_PROOF_2026-04-02.md)
33. slice 02 local stream proof
   - [plans/PLAN_24_SLICE_02_LOCAL_STREAM_PROOF.md](/home/hugh51/musu-functions/MUSU-CRT/plans/PLAN_24_SLICE_02_LOCAL_STREAM_PROOF.md)
   - [FIRST_BACKPORT_SLICE_02_LOCAL_STREAM_ENTRY.md](/home/hugh51/musu-functions/MUSU-CRT/FIRST_BACKPORT_SLICE_02_LOCAL_STREAM_ENTRY.md)
   - [BACKPORT_SLICE_02_LOCAL_STREAM_STATUS_2026-04-02.md](/home/hugh51/musu-functions/MUSU-CRT/BACKPORT_SLICE_02_LOCAL_STREAM_STATUS_2026-04-02.md)
34. slice 02 local stream smoke runbook
   - [SLICE_02_LOCAL_STREAM_SMOKE_RUNBOOK_2026-04-02.md](/home/hugh51/musu-functions/MUSU-CRT/SLICE_02_LOCAL_STREAM_SMOKE_RUNBOOK_2026-04-02.md)
35. slice 03 remote session entry
   - [plans/PLAN_25_SLICE_03_REMOTE_SESSION_ENTRY.md](/home/hugh51/musu-functions/MUSU-CRT/plans/PLAN_25_SLICE_03_REMOTE_SESSION_ENTRY.md)
   - [FIRST_BACKPORT_SLICE_03_REMOTE_SESSION_ENTRY.md](/home/hugh51/musu-functions/MUSU-CRT/FIRST_BACKPORT_SLICE_03_REMOTE_SESSION_ENTRY.md)
36. direct viewer smoke criteria
   - [plans/PLAN_26_DIRECT_VIEWER_SMOKE_CRITERIA.md](/home/hugh51/musu-functions/MUSU-CRT/plans/PLAN_26_DIRECT_VIEWER_SMOKE_CRITERIA.md)
   - [SLICE_02_DIRECT_VIEWER_SMOKE_CRITERIA.md](/home/hugh51/musu-functions/MUSU-CRT/SLICE_02_DIRECT_VIEWER_SMOKE_CRITERIA.md)
37. direct viewer smoke implementation
   - [DIRECT_VIEWER_SMOKE_IMPLEMENTATION_NOTE_2026-04-02.md](/home/hugh51/musu-functions/MUSU-CRT/DIRECT_VIEWER_SMOKE_IMPLEMENTATION_NOTE_2026-04-02.md)
