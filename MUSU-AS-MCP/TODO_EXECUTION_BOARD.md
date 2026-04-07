# TODO Execution Board

> Updated: 2026-04-01 KST

## 목적

남은 작업을 전부 실행 순서와 상태 기준으로 관리한다.

상태:

- `todo`
- `in_progress`
- `done`
- `blocked`

## Active Queue

1. `done` MCP-only harness baseline 고정
   - `server.py`로 독립 실행
   - `health`, `tools/list`, `get_editor_state`, `semantic_snapshot` 재현 가능
2. `done` Pencil-style `get_layout_snapshot` 추가
   - `max_depth`, `root_id`, `problems_only`, `include_text`, `include_bounds`
3. `done` Pencil-style `get_native_screenshot` 추가
   - target-aware visual proof surface
4. `done` `get_semantic_snapshot`과 분해된 surface 관계 재정의
   - wrapper 유지 vs lightweight summary 축소
5. `done` external consumer proof runbook 작성
   - Codex CLI / Claude Code / Gemini CLI
6. `done` original desktop reverse-port map 작성
   - harness -> `builtin.rs`, `ui_state.rs`, frontend listener
7. `in_progress` canonical implementation을 `musu-functions` 쪽에서 완성
   - remaining MCP surface를 여기서 먼저 고정
8. `todo` final alignment review
   - Pencil vision 관점에서 완료/진행/미구현 재평가
9. `todo` selective backport to original desktop
   - 검증된 surface만 역이식
10. `todo` governance/review read surface positioning
   - approval/escalation/morning review를 consumer surface 후보로 정리

## Detailed Work Items

### A. Harness Surface

- `done` `desktop__musu_app_get_editor_state`
- `done` `desktop__musu_app_get_layout_snapshot`
- `done` `desktop__musu_app_get_native_screenshot`
- `done` `desktop__musu_app_get_problem_nodes`

### B. Diagnostics

- `done` semantic snapshot success/timeout mode
- `done` layout snapshot payload size reporting
- `done` screenshot payload size reporting

### C. Consumer Proof

- `done` stdio/http config snippet 정리
- `todo` fresh session tools/list capture
- `todo` first-call proof capture

### D. Desktop Backport

- `done` `musu_app_get_editor_state` 원본 코드 추가 시작
- `in_progress` `musu_app_get_layout_snapshot` 원본 Rust builtin
- `in_progress` `musu_app_get_native_screenshot` 원본 route/command
- `todo` semantic snapshot timeout fix와 decomposition 결합

### E. Canonical Workspace

- `in_progress` `musu-functions/MUSU-AS-MCP`를 canonical implementation으로 유지
- `todo` remaining MCP tools 여기서 완성
- `todo` consumer proof를 여기서 먼저 채움

### F. Governance Review Surface

- `todo` owner=`MUSU-WORKS`, consumer=`MUSU-AS-MCP` 분리 고정
- `todo` approval/escalation/morning review read surface 후보 정리
