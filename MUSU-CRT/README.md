# MUSU-CRT

## 목적

`MUSU-CRT`는 MUSU의 WebRTC / realtime stream / remote terminal viewer 축을 별도 작업공간에서 정리하는 bounded context다.

구현 원칙:

- canonical implementation은 `MUSU-CRT`에서 진행한다
- 원본 repo는 reference / compare / backport-later 대상으로만 쓴다

중요한 transport 원칙:

- local mock/viewer를 열기 위해 HTTP를 쓸 수는 있다
- 하지만 cross-computer CRT의 primary transport는 `WebRTC + WebSocket`이다
- `HTTP`는 bootstrap / metadata / fallback 용도로만 본다

여기서는 아래를 다룬다.

- WebRTC signaling
- realtime stream viewer
- remote terminal/data channel
- stream status / reconnect / quality control
- 원본 MUSU에서 CRT 축만 분리해 이해하고 backport 가능한 계약면 만들기

## 현재 기준

원본 MUSU의 WebRTC 축은 이미 존재한다.

핵심 원본 파일:

- [/mnt/f/Aisaak/Projects/Musu-new/release/musu-desktop/src/components/viewer/StreamViewer.tsx](/mnt/f/Aisaak/Projects/Musu-new/release/musu-desktop/src/components/viewer/StreamViewer.tsx)
- [/mnt/f/Aisaak/Projects/Musu-new/release/musu-desktop/src/hooks/useRealtimeStream.ts](/mnt/f/Aisaak/Projects/Musu-new/release/musu-desktop/src/hooks/useRealtimeStream.ts)
- [/mnt/f/Aisaak/Projects/Musu-new/release/musu-desktop/src/lib/tauri.ts](/mnt/f/Aisaak/Projects/Musu-new/release/musu-desktop/src/lib/tauri.ts)
- [/mnt/f/Aisaak/Projects/Musu-new/release/musu-desktop/src/lib/commandCatalog.ts](/mnt/f/Aisaak/Projects/Musu-new/release/musu-desktop/src/lib/commandCatalog.ts)
- [/mnt/f/Aisaak/Projects/Musu-new/release/musu-desktop/src-tauri/src/commands/webrtc.rs](/mnt/f/Aisaak/Projects/Musu-new/release/musu-desktop/src-tauri/src/commands/webrtc.rs)

## 문서

- [MASTER_PLAN.md](/home/hugh51/musu-functions/MUSU-CRT/MASTER_PLAN.md)
- [CURRENT_STATE.md](/home/hugh51/musu-functions/MUSU-CRT/CURRENT_STATE.md)
- [SPEC.md](/home/hugh51/musu-functions/MUSU-CRT/SPEC.md)
- [CODE_AND_DOC_INDEX_2026-04-01.md](/home/hugh51/musu-functions/MUSU-CRT/CODE_AND_DOC_INDEX_2026-04-01.md)
- [CRT_SOURCE_MAP.md](/home/hugh51/musu-functions/MUSU-CRT/CRT_SOURCE_MAP.md)
- [SCREEN_TAB_SOURCE_ANALYSIS.md](/home/hugh51/musu-functions/MUSU-CRT/SCREEN_TAB_SOURCE_ANALYSIS.md)
- [CRT_TRANSPORT_ARCHITECTURE.md](/home/hugh51/musu-functions/MUSU-CRT/CRT_TRANSPORT_ARCHITECTURE.md)
- [BACKPORT_LATER_POLICY.md](/home/hugh51/musu-functions/MUSU-CRT/BACKPORT_LATER_POLICY.md)
- [CANONICAL_IMPLEMENTATION_BOARD.md](/home/hugh51/musu-functions/MUSU-CRT/CANONICAL_IMPLEMENTATION_BOARD.md)
- [SIGNALING_CONTRACT.md](/home/hugh51/musu-functions/MUSU-CRT/SIGNALING_CONTRACT.md)
- [STREAM_LIFECYCLE_CONTRACT.md](/home/hugh51/musu-functions/MUSU-CRT/STREAM_LIFECYCLE_CONTRACT.md)
- [TERMINAL_DATA_PLANE_CONTRACT.md](/home/hugh51/musu-functions/MUSU-CRT/TERMINAL_DATA_PLANE_CONTRACT.md)
- [EXTRACTED_HARNESS_PLAN.md](/home/hugh51/musu-functions/MUSU-CRT/EXTRACTED_HARNESS_PLAN.md)
- [BACKPORT_NOTES.md](/home/hugh51/musu-functions/MUSU-CRT/BACKPORT_NOTES.md)
- [HARNESS_SMOKE_PROOF_2026-04-01.md](/home/hugh51/musu-functions/MUSU-CRT/HARNESS_SMOKE_PROOF_2026-04-01.md)
- [SIGNALING_EXTRACTED_CANDIDATE.md](/home/hugh51/musu-functions/MUSU-CRT/SIGNALING_EXTRACTED_CANDIDATE.md)
- [FINAL_PARITY_NOTE_2026-04-01.md](/home/hugh51/musu-functions/MUSU-CRT/FINAL_PARITY_NOTE_2026-04-01.md)
- [QUALITATIVE_EVALUATION_2026-04-01.md](/home/hugh51/musu-functions/MUSU-CRT/QUALITATIVE_EVALUATION_2026-04-01.md)
- [AUDIT_2026-04-01.md](/home/hugh51/musu-functions/MUSU-CRT/AUDIT_2026-04-01.md)
- [SIGNALING_ADAPTER_SLICE_MAP.md](/home/hugh51/musu-functions/MUSU-CRT/SIGNALING_ADAPTER_SLICE_MAP.md)
- [STREAM_PATH_SPLIT_MAP.md](/home/hugh51/musu-functions/MUSU-CRT/STREAM_PATH_SPLIT_MAP.md)
- [RUNTIME_REFACTOR_GATE.md](/home/hugh51/musu-functions/MUSU-CRT/RUNTIME_REFACTOR_GATE.md)
- [EXTRACTION_IMPLEMENTATION_PROGRESS_2026-04-01.md](/home/hugh51/musu-functions/MUSU-CRT/EXTRACTION_IMPLEMENTATION_PROGRESS_2026-04-01.md)
- [HARNESS_INTEGRATION_PROGRESS_2026-04-01.md](/home/hugh51/musu-functions/MUSU-CRT/HARNESS_INTEGRATION_PROGRESS_2026-04-01.md)
- [BACKPORT_LATER_CHECKLIST.md](/home/hugh51/musu-functions/MUSU-CRT/BACKPORT_LATER_CHECKLIST.md)
- [FINAL_IMPLEMENTATION_STATUS_2026-04-01.md](/home/hugh51/musu-functions/MUSU-CRT/FINAL_IMPLEMENTATION_STATUS_2026-04-01.md)
- [CANONICAL_HARNESS_PROOF_2026-04-01.md](/home/hugh51/musu-functions/MUSU-CRT/CANONICAL_HARNESS_PROOF_2026-04-01.md)
- [ORIGINAL_REPO_COMPILE_RUNTIME_PROOF_RUNBOOK_2026-04-02.md](/home/hugh51/musu-functions/MUSU-CRT/ORIGINAL_REPO_COMPILE_RUNTIME_PROOF_RUNBOOK_2026-04-02.md)
- [ORIGINAL_REPO_PROOF_PROGRESS_2026-04-02.md](/home/hugh51/musu-functions/MUSU-CRT/ORIGINAL_REPO_PROOF_PROGRESS_2026-04-02.md)
- [BACKPORT_DECISION_NOTE_2026-04-02.md](/home/hugh51/musu-functions/MUSU-CRT/BACKPORT_DECISION_NOTE_2026-04-02.md)
- [FINAL_CLOSURE_NOTE_2026-04-02.md](/home/hugh51/musu-functions/MUSU-CRT/FINAL_CLOSURE_NOTE_2026-04-02.md)
- [ORIGINAL_REFACTOR_ENTRY_SLICING.md](/home/hugh51/musu-functions/MUSU-CRT/ORIGINAL_REFACTOR_ENTRY_SLICING.md)
- [STREAM_EXTRACTION_CANDIDATE.md](/home/hugh51/musu-functions/MUSU-CRT/STREAM_EXTRACTION_CANDIDATE.md)
- [BACKPORT_SLICE_STRATEGY.md](/home/hugh51/musu-functions/MUSU-CRT/BACKPORT_SLICE_STRATEGY.md)
- [FIRST_BACKPORT_SLICE_SIGNALING_ENTRY.md](/home/hugh51/musu-functions/MUSU-CRT/FIRST_BACKPORT_SLICE_SIGNALING_ENTRY.md)
- [BACKPORT_SLICE_01_SIGNALING_PROOF_2026-04-02.md](/home/hugh51/musu-functions/MUSU-CRT/BACKPORT_SLICE_01_SIGNALING_PROOF_2026-04-02.md)
- [FIRST_BACKPORT_SLICE_02_LOCAL_STREAM_ENTRY.md](/home/hugh51/musu-functions/MUSU-CRT/FIRST_BACKPORT_SLICE_02_LOCAL_STREAM_ENTRY.md)
- [BACKPORT_SLICE_02_LOCAL_STREAM_STATUS_2026-04-02.md](/home/hugh51/musu-functions/MUSU-CRT/BACKPORT_SLICE_02_LOCAL_STREAM_STATUS_2026-04-02.md)
- [SLICE_02_LOCAL_STREAM_SMOKE_RUNBOOK_2026-04-02.md](/home/hugh51/musu-functions/MUSU-CRT/SLICE_02_LOCAL_STREAM_SMOKE_RUNBOOK_2026-04-02.md)
- [SLICE_02_DIRECT_VIEWER_SMOKE_CRITERIA.md](/home/hugh51/musu-functions/MUSU-CRT/SLICE_02_DIRECT_VIEWER_SMOKE_CRITERIA.md)
- [DIRECT_VIEWER_SMOKE_IMPLEMENTATION_NOTE_2026-04-02.md](/home/hugh51/musu-functions/MUSU-CRT/DIRECT_VIEWER_SMOKE_IMPLEMENTATION_NOTE_2026-04-02.md)
- [CANONICAL_DIRECT_SMOKE_RUNBOOK_2026-04-02.md](/home/hugh51/musu-functions/MUSU-CRT/CANONICAL_DIRECT_SMOKE_RUNBOOK_2026-04-02.md)
- [CANONICAL_DIRECT_SMOKE_PROOF_2026-04-02.md](/home/hugh51/musu-functions/MUSU-CRT/CANONICAL_DIRECT_SMOKE_PROOF_2026-04-02.md)
- [REMOTE_SESSION_CANONICAL_PLAN.md](/home/hugh51/musu-functions/MUSU-CRT/REMOTE_SESSION_CANONICAL_PLAN.md)
- [REMOTE_SESSION_CANONICAL_PROOF_2026-04-02.md](/home/hugh51/musu-functions/MUSU-CRT/REMOTE_SESSION_CANONICAL_PROOF_2026-04-02.md)
- [FIRST_BACKPORT_SLICE_03_REMOTE_SESSION_ENTRY.md](/home/hugh51/musu-functions/MUSU-CRT/FIRST_BACKPORT_SLICE_03_REMOTE_SESSION_ENTRY.md)
- [RUNTIME_FACING_PREP_CHECKLIST_2026-04-02.md](/home/hugh51/musu-functions/MUSU-CRT/RUNTIME_FACING_PREP_CHECKLIST_2026-04-02.md)
- [QA_GATE_AND_RELEASE_READINESS_2026-04-03.md](/home/hugh51/musu-functions/MUSU-CRT/QA_GATE_AND_RELEASE_READINESS_2026-04-03.md)
- [REFERENCE_ONLY_EVIDENCE_NOTE_2026-04-02.md](/home/hugh51/musu-functions/MUSU-CRT/REFERENCE_ONLY_EVIDENCE_NOTE_2026-04-02.md)
- [FINAL_WORKSPACE_CLOSURE_2026-04-02.md](/home/hugh51/musu-functions/MUSU-CRT/FINAL_WORKSPACE_CLOSURE_2026-04-02.md)
- [BACKPORT_EXECUTION_SEQUENCE.md](/home/hugh51/musu-functions/MUSU-CRT/BACKPORT_EXECUTION_SEQUENCE.md)
- [TODO_EXECUTION_BOARD.md](/home/hugh51/musu-functions/MUSU-CRT/TODO_EXECUTION_BOARD.md)
- [plans/README.md](/home/hugh51/musu-functions/MUSU-CRT/plans/README.md)

## 현재 closure 상태

- canonical implementation: 완료
- canonical harness proof: 완료
- canonical direct smoke proof: 완료
- remote session canonical harness proof: 완료
- original repo proof: reference only
- slice 3 backport timing decision: later
- workspace closure: complete
