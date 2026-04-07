# MUSU-AS-MCP Current State

## 현재 목적

MUSU Desktop self-MCP 재현을 별도 작업 공간으로 분리하고, runtime truth를 독립 문서로 관리한다.

현재 기준 구현 원칙:

- 기능 완성은 먼저 [`/home/hugh51/musu-functions/MUSU-AS-MCP`](/home/hugh51/musu-functions/MUSU-AS-MCP) 에서 한다.
- 원본 [`release/musu-desktop`](/mnt/f/Aisaak/Projects/Musu-new/release/musu-desktop) 은 reference/backport target으로 본다.

고정된 제품 정의:

1. 자기 스스로 조종 가능
2. 다른 CLI나 IDE에서 사용 가능
3. MUSU Desktop 자체가 MCP 서버
4. reference는 Pencil.dev MCP

## 2026-04-01 기준 현재 상태

### Already Known Good

- `cargo build -p musu-desktop`는 완료된 적이 있다.
- Layer A는 pass 기록이 있다.
  - `/mcp/health`
  - `initialize`
  - `tools/list`
- Layer B도 부분적으로 pass 기록이 있다.
  - `ui_state_initialized = true`
  - `current_view.view_mode = home`
  - `ui_registry/actionables = 4`
  - `open_settings` action execution pass
- `MUSU-AS-MCP` 작업 공간 자체에는 독립 실행 가능한 MCP-only harness를 추가했다.
  - [`package.json`](/home/hugh51/musu-functions/MUSU-AS-MCP/package.json)
  - [`server.py`](/home/hugh51/musu-functions/MUSU-AS-MCP/server.py)
- harness 기준으로 아래 Pencil-style surface가 실제 동작한다.
  - `desktop__musu_app_get_editor_state`
  - `desktop__musu_app_get_layout_snapshot`
  - `desktop__musu_app_get_native_screenshot`
  - `desktop__musu_app_get_problem_nodes`
- harness 기준 `desktop__musu_app_get_semantic_snapshot`은 giant call이 아니라 wrapper summary로 재정의됐다.
- 원본 desktop [`builtin.rs`](/mnt/f/Aisaak/Projects/Musu-new/release/musu-desktop/src-tauri/src/mcp_broker/builtin.rs)에는 `musu_app_get_layout_snapshot` 최소 버전 역이식을 시작했다.
- 원본 desktop [`builtin.rs`](/mnt/f/Aisaak/Projects/Musu-new/release/musu-desktop/src-tauri/src/mcp_broker/builtin.rs)에는 `musu_app_get_native_screenshot` synthetic contract도 추가했다.

### Main Active Problem

- `desktop__musu_app_get_semantic_snapshot`가 5초 timeout으로 실패한다.
- 병행 작업으로 Pencil-style 분해의 첫 툴 `musu_app_get_editor_state`를 추가하기 시작했다.

### Narrowed Findings

- backend diagnostics path는 구현돼 있다.
- `build.rs` generated handler에 아래 command가 실제 포함되도록 수정됐다.
  - `set_ui_snapshot_listener_status`
  - `report_ui_snapshot_listener_event`
- runtime status raw JSON에서 아래가 관측됐다.
  - `ui_snapshot_diagnostics.listener_ready = false`
  - `last_request_sent_at`는 존재
  - `last_error = "semantic snapshot request timed out"`
- 즉 현재 분기는 `request_sent` 이후 frontend listener registration 문제 쪽으로 기울어져 있다.

### Important Runtime Finding

- stale frontend bundle이 실제 원인 후보로 확인됐다.
- `dist`에는 한때 최신 `useUiSnapshotListener` 변경 문자열이 없었다.
- 따라서 Rust만 다시 빌드하고 frontend를 안 구운 상태에서는 semantic snapshot diagnostics가 runtime에 반영되지 않는다.
- 이후 `npm run build`는 다시 완료됐다.

## 현재 가설

가장 유력한 현재 가설은 아래다.

1. frontend bundle이 stale했다
2. 그래서 listener readiness/status reporting code가 live app에 없었다
3. 결과적으로 `listener_ready = false`
4. semantic snapshot request는 발사되지만 frontend에서 받지 못하거나 응답 경로가 없다

## Current Code Anchors

- frontend mount path:
  - [`App.tsx`](/mnt/f/Aisaak/Projects/Musu-new/release/musu-desktop/src/App.tsx)
- frontend listener:
  - [`useUiSnapshotListener.ts`](/mnt/f/Aisaak/Projects/Musu-new/release/musu-desktop/src/hooks/useUiSnapshotListener.ts)
- Rust UI mirror/snapshot commands:
  - [`ui_state.rs`](/mnt/f/Aisaak/Projects/Musu-new/release/musu-desktop/src-tauri/src/commands/ui_state.rs)
- Rust MCP builtin request path:
  - [`builtin.rs`](/mnt/f/Aisaak/Projects/Musu-new/release/musu-desktop/src-tauri/src/mcp_broker/builtin.rs)

## 즉시 다음 단계

1. MCP-only harness 실행
2. `tools/list`와 `desktop__musu_app_get_editor_state` 응답 shape 확인
3. `/dev/state`로 semantic snapshot success/timeout 모드 재현
4. harness 기준으로 `get_semantic_snapshot` 역할 축소안 정리
5. `musu-functions` 쪽 canonical surface 완성
6. consumer proof runbook 작성
7. 이후 필요한 항목만 원본 desktop에 backport
8. governance/review read surface를 owner-consumer 분리 기준으로 위치 고정
