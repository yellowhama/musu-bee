# Original Desktop Backport Map

## 목적

`MUSU-AS-MCP` harness에서 먼저 고정한 surface를 원본 desktop 코드에 어떤 순서로 역이식할지 정리한다.

## Source Of Truth

harness:

- [`server.py`](/home/hugh51/musu-functions/MUSU-AS-MCP/server.py)

original desktop:

- [`builtin.rs`](/mnt/f/Aisaak/Projects/Musu-new/release/musu-desktop/src-tauri/src/mcp_broker/builtin.rs)
- [`ui_state.rs`](/mnt/f/Aisaak/Projects/Musu-new/release/musu-desktop/src-tauri/src/commands/ui_state.rs)
- [`useUiSnapshotListener.ts`](/mnt/f/Aisaak/Projects/Musu-new/release/musu-desktop/src/hooks/useUiSnapshotListener.ts)
- [`App.tsx`](/mnt/f/Aisaak/Projects/Musu-new/release/musu-desktop/src/App.tsx)

## Backport Order

### 1. `musu_app_get_editor_state`

상태:

- 부분 반영됨

원본 위치:

- [`builtin.rs`](/mnt/f/Aisaak/Projects/Musu-new/release/musu-desktop/src-tauri/src/mcp_broker/builtin.rs)

남은 일:

- payload shape를 harness와 맞추기
- runtime proof 갱신

### 2. `musu_app_get_layout_snapshot`

상태:

- 부분 반영됨

원본 위치:

- builtin surface: [`builtin.rs`](/mnt/f/Aisaak/Projects/Musu-new/release/musu-desktop/src-tauri/src/mcp_broker/builtin.rs)
- source data: [`ui_state.rs`](/mnt/f/Aisaak/Projects/Musu-new/release/musu-desktop/src-tauri/src/commands/ui_state.rs)

필요 작업:

- layout projection helper 추가
- `root_id`, `max_depth`, `problems_only`, `include_text`, `include_bounds` 인자 파싱
- bounded response tests 추가
- Windows build/runtime proof 확보

### 3. `musu_app_get_native_screenshot`

상태:

- 부분 반영됨

원본 위치:

- MCP builtin: [`builtin.rs`](/mnt/f/Aisaak/Projects/Musu-new/release/musu-desktop/src-tauri/src/mcp_broker/builtin.rs)
- frontend/tauri bridge 후보: [`useUiSnapshotListener.ts`](/mnt/f/Aisaak/Projects/Musu-new/release/musu-desktop/src/hooks/useUiSnapshotListener.ts)

필요 작업:

- current view screenshot 경로 정의
- target component screenshot 전략 정의
- payload media type과 byte limits 고정
- Windows build/runtime proof 확보

### 4. `musu_app_get_semantic_snapshot`

상태:

- 기존 giant/single call 유지 중

원본 방향:

- giant snapshot 단독 책임을 줄이고 wrapper/summary tool로 축소
- 내부적으로 editor state + layout snapshot + screenshot metadata 조합 검토

## Immediate Recommendation

1. 원본 desktop에는 `musu_app_get_layout_snapshot`부터 넣는다.
2. 그 다음 `musu_app_get_native_screenshot` shape를 정의한다.
3. 마지막에 `musu_app_get_semantic_snapshot`을 wrapper summary로 재정의한다.
