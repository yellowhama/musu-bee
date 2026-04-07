# Pencil Dev Alignment

## 목적

Pencil.dev reference를 MUSU-AS-MCP에 얼마나 반영했는지 기능 단위로 쪼개서 관리한다.

분류 기준:

- `완료`: MUSU-AS-MCP 작업공간이나 하네스에 이미 반영됨
- `진행 중`: 설계와 일부 구현이 들어갔지만 canonical feature로 닫히지 않음
- `미구현`: 아직 문서 reference 수준이거나 다음 구현 대상으로 남아 있음

## Pencil Vision 요약

Pencil의 핵심은 아래다.

1. desktop app이 external CLI/IDE consumer에 바로 붙는다
2. giant generic snapshot 대신 작은 purpose-built tools로 읽는다
3. 현재 editor context를 먼저 읽는다
4. layout read는 bounded depth로 제한한다
5. visual proof는 targeted screenshot으로 분리한다
6. app 내부 model/resource layer를 MCP surface로 노출한다

## 정렬 상태

### 1. desktop app MCP identity

설명:

- 앱 자체가 MCP host가 되고 외부 consumer가 여기에 붙는다

상태:

- `진행 중`

현재 반영:

- [`VISION.md`](/home/hugh51/musu-functions/MUSU-AS-MCP/VISION.md)
- [`README.md`](/home/hugh51/musu-functions/MUSU-AS-MCP/README.md)
- [`server.py`](/home/hugh51/musu-functions/MUSU-AS-MCP/server.py)

남은 일:

- 실제 consumer install/config automation
- Codex CLI / Claude Code / Gemini CLI proof

### 2. external CLI / IDE compatibility

설명:

- Codex / Claude / Gemini 같은 consumer가 app MCP surface를 쓸 수 있어야 함

상태:

- `진행 중`

현재 반영:

- Pencil integration 구조를 문서화함
- MCP-only harness가 consumer-friendly JSON-RPC shape를 제공함

남은 일:

- fresh session proof
- consumer별 config snippet
- 실제 tools/list / tools/call usage record

### 3. giant snapshot 대신 tool decomposition

설명:

- `get_editor_state`, `snapshot_layout`, `get_screenshot` 같은 분해

상태:

- `진행 중`

현재 반영:

- [`PLAN_04_PENCIL_STYLE_TOOL_DECOMPOSITION.md`](/home/hugh51/musu-functions/MUSU-AS-MCP/plans/PLAN_04_PENCIL_STYLE_TOOL_DECOMPOSITION.md)
- [`server.py`](/home/hugh51/musu-functions/MUSU-AS-MCP/server.py)
- 원본 코드에서 `musu_app_get_editor_state` 추가 시작

현재 있는 것:

- `desktop__musu_app_get_editor_state`
- `desktop__musu_app_get_semantic_snapshot`

남은 일:

- `desktop__musu_app_get_layout_snapshot`
- `desktop__musu_app_get_native_screenshot`
- semantic snapshot의 역할 축소 또는 wrapper화

### 4. editor context first

설명:

- 무거운 구조 read보다 먼저 현재 editor/view/context를 작은 payload로 읽는다

상태:

- `완료`

현재 반영:

- [`server.py`](/home/hugh51/musu-functions/MUSU-AS-MCP/server.py)의 `desktop__musu_app_get_editor_state`
- 원본 [`builtin.rs`](/mnt/f/Aisaak/Projects/Musu-new/release/musu-desktop/src-tauri/src/mcp_broker/builtin.rs)에도 같은 개념 추가 시작

현재 payload:

- `current_view`
- `active_surface`
- `active_project`
- `surface_tabs`
- `desktop_tab_count`
- `actionable_component_count`
- shell flags

### 5. bounded layout snapshot

설명:

- depth-limited structural read

상태:

- `완료`

남은 canonical shape:

- `root_id`
- `max_depth`
- `problems_only`
- `include_text`
- `include_bounds`

다음 구현 위치:

- [`server.py`](/home/hugh51/musu-functions/MUSU-AS-MCP/server.py)
- 원본 [`ui_state.rs`](/mnt/f/Aisaak/Projects/Musu-new/release/musu-desktop/src-tauri/src/commands/ui_state.rs)
- 원본 [`builtin.rs`](/mnt/f/Aisaak/Projects/Musu-new/release/musu-desktop/src-tauri/src/mcp_broker/builtin.rs)

### 6. targeted screenshot separation

설명:

- visual proof를 구조 read와 분리

상태:

- `완료`

### 7. problem node extraction

설명:

- layout 문제를 node 단위로 별도 surface로 뽑는다

상태:

- `완료`

현재 반영:

- [`server.py`](/home/hugh51/musu-functions/MUSU-AS-MCP/server.py)의 `desktop__musu_app_get_problem_nodes`

남은 일:

- `desktop__musu_app_get_native_screenshot`
- current view screenshot vs target component screenshot 구분

### 7. internal model / mirror based reads

설명:

- 매 요청마다 raw UI 전체를 처음부터 긁지 않고 app 내부 mirror/model을 읽는다

상태:

- `진행 중`

현재 반영:

- 원본 MUSU는 `ui_state` mirror를 이미 가짐
- MCP-only harness도 synthetic mirror state를 유지함

남은 일:

- semantic snapshot을 mirror 기반 구조 read로 대체
- shadow tree 또는 projected layout model 정의

### 8. timeout diagnostics and fast loop

설명:

- snapshot timeout을 빠르게 재현/검증할 수 있어야 함

상태:

- `완료`

현재 반영:

- [`MCP_ONLY_FAST_LOOP.md`](/home/hugh51/musu-functions/MUSU-AS-MCP/MCP_ONLY_FAST_LOOP.md)
- [`server.py`](/home/hugh51/musu-functions/MUSU-AS-MCP/server.py)
- `/dev/state`로 semantic snapshot success/timeout 모드 전환 가능

## 요약 표

### 완료

- editor context first
- timeout diagnostics and fast loop
- bounded layout snapshot
- targeted screenshot separation
- problem node extraction

### 진행 중

- desktop app MCP identity
- external CLI / IDE compatibility
- tool decomposition
- internal model / mirror based reads

### 미구현

- 없음

## 다음 우선순위

1. 원본 desktop에 `musu_app_get_layout_snapshot` 역이식
2. 원본 desktop에 `musu_app_get_native_screenshot` 역이식
3. `get_semantic_snapshot`을 wrapper 또는 summary tool로 재정의
4. consumer proof를 채운다
