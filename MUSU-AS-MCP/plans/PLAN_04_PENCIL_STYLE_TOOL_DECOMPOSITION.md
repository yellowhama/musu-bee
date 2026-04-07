# PLAN 04: Pencil-Style Tool Decomposition

> Status: in_progress
> Updated: 2026-04-01 KST

## Goal

`desktop__musu_app_get_semantic_snapshot` 단일 호출에 과도하게 의존하는 현재 구조를, Pencil.dev reference를 따라 더 작은 목적별 MCP tool surface로 분해할 실행 계획을 고정한다.

## Scope

- Pencil의 `get_editor_state + snapshot_layout + get_screenshot` 분해 패턴을 MUSU에 대응시킨다.
- MUSU의 최소 read surface를 재정의한다.
- 기존 `get_semantic_snapshot`의 유지/축소/대체 관계를 명확히 한다.
- fast-loop 기준으로 검증 가능한 최소 구현 순서를 정한다.

## Current Truth

- 현재 MUSU의 Layer B는 대부분 동작하지만 `desktop__musu_app_get_semantic_snapshot`는 timeout hotspot이다.
- Pencil.dev는 giant generic snapshot 대신 작은 purpose-built tools로 canvas/editor를 읽게 한다.
- MUSU도 장기적으로 giant snapshot보다 bounded structural reads와 targeted visual reads가 더 적합하다.
- 첫 분해 툴로 `desktop__musu_app_get_editor_state`를 `builtin.rs`에 추가하기 시작했다.
- 현재 MUSU 코드 접점은 아래 4개다.
  - [`App.tsx`](/mnt/f/Aisaak/Projects/Musu-new/release/musu-desktop/src/App.tsx)
  - [`useUiSnapshotListener.ts`](/mnt/f/Aisaak/Projects/Musu-new/release/musu-desktop/src/hooks/useUiSnapshotListener.ts)
  - [`ui_state.rs`](/mnt/f/Aisaak/Projects/Musu-new/release/musu-desktop/src-tauri/src/commands/ui_state.rs)
  - [`builtin.rs`](/mnt/f/Aisaak/Projects/Musu-new/release/musu-desktop/src-tauri/src/mcp_broker/builtin.rs)

## Proposed MUSU Surface

### 1. `desktop__musu_app_get_editor_state`

목적:

- 현재 view
- active route
- active project/session identity
- focus context
- selected actionable 또는 selected component

왜 먼저 필요한가:

- semantic snapshot보다 먼저 "지금 앱이 어떤 상태에 있는가"를 작게 읽을 수 있어야 한다.
- consumer가 매번 큰 snapshot 없이도 맥락을 잡을 수 있다.

### 2. `desktop__musu_app_get_layout_snapshot`

목적:

- 현재 UI surface의 구조/영역/layout metadata를 bounded depth로 읽는다.

권장 인자:

- `root_id`
- `max_depth`
- `problems_only`
- `include_text`
- `include_bounds`

왜 필요한가:

- giant semantic dump를 대체하는 핵심 read surface다.
- Pencil의 `snapshot_layout`처럼 depth-limited 구조 조회가 가능해야 한다.

### 3. `desktop__musu_app_get_native_screenshot`

목적:

- 현재 view 또는 특정 subtree/actionable의 visual proof를 targeted하게 읽는다.

권장 인자:

- `target_id`
- `view_only`
- `include_window_frame`

왜 필요한가:

- 구조 정보와 visual verification을 분리해야 한다.
- semantic read와 screenshot을 같은 response에 섞지 않아야 한다.

### 4. optional follow-up tools

- `desktop__musu_app_get_component_tree`
- `desktop__musu_app_get_accessibility_tree`
- `desktop__musu_app_get_problem_nodes`
- `desktop__musu_app_get_ui_text_summary`

## Relationship To Existing `get_semantic_snapshot`

`get_semantic_snapshot`은 아래 세 가지 중 하나로 정리해야 한다.

1. compatibility tool로 유지하되 내부적으로 smaller tools를 조합한다.
2. lightweight summary tool로 축소한다.
3. 장기적으로 deprecated 처리하고 분해된 tools를 canonical surface로 승격한다.

현재 단계에서는 1 또는 2가 현실적이다.

## Implementation Order

1. `get_editor_state`를 먼저 만든다.
2. `get_layout_snapshot`을 bounded depth read로 만든다.
3. `get_native_screenshot`를 targeted proof tool로 추가한다.
4. 이후 `get_semantic_snapshot`의 역할을 축소하거나 wrapper로 바꾼다.

## Progress

- `musu_app_get_editor_state` builtin tool definition 추가
- existing `current_view + ui_state`를 조합한 lightweight payload helper 추가
- builtin registration test와 payload summary test 추가
- harness에 `desktop__musu_app_get_layout_snapshot` 구현
- harness에 `desktop__musu_app_get_native_screenshot` 구현
- harness에서 `get_semantic_snapshot`을 wrapper summary tool로 재정의

## Code Touch Points

frontend:

- [`App.tsx`](/mnt/f/Aisaak/Projects/Musu-new/release/musu-desktop/src/App.tsx)
- [`useUiSnapshotListener.ts`](/mnt/f/Aisaak/Projects/Musu-new/release/musu-desktop/src/hooks/useUiSnapshotListener.ts)

backend:

- [`ui_state.rs`](/mnt/f/Aisaak/Projects/Musu-new/release/musu-desktop/src-tauri/src/commands/ui_state.rs)
- [`builtin.rs`](/mnt/f/Aisaak/Projects/Musu-new/release/musu-desktop/src-tauri/src/mcp_broker/builtin.rs)

예상 추가 포인트:

- UI mirror state snapshot schema
- screenshot capture command
- actionables/registry를 subtree root로 삼는 layout projection

## Validation Plan

`MCP_ONLY_FAST_LOOP.md` 기준으로 아래만 빠르게 검증 가능해야 한다.

1. `tools/list`에 새 tool family가 노출된다.
2. `get_editor_state`가 즉시 응답한다.
3. `get_layout_snapshot(max_depth=0)`가 작은 payload로 응답한다.
4. `get_layout_snapshot(max_depth=1..2)`가 bounded payload로 응답한다.
5. `get_native_screenshot`이 targeted visual proof를 반환한다.
6. 기존 `get_semantic_snapshot`보다 재현성과 응답 시간이 좋아진다.

## Evidence

- [PENCIL_DEV_REFERENCE.md](/home/hugh51/musu-functions/MUSU-AS-MCP/PENCIL_DEV_REFERENCE.md)
- [OPEN_SOURCE_REFERENCE_MAP.md](/home/hugh51/musu-functions/MUSU-AS-MCP/OPEN_SOURCE_REFERENCE_MAP.md)
- runtime MCP call logs
- sample response JSON
- payload size / latency 비교

## Exit Condition

- MUSU의 장기 Layer B read surface가 giant semantic snapshot 하나가 아니라 작은 tool set으로 정의된다.
- 최소 3개 canonical tool 후보와 검증 방법이 문서로 고정된다.
- 다음 구현자가 이 문서만 보고 첫 분해 작업에 들어갈 수 있다.
