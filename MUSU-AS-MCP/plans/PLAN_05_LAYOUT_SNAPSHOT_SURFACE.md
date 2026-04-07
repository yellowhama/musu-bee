# PLAN 05: Layout Snapshot Surface

> Status: done
> Updated: 2026-04-01 KST

## Goal

Pencil의 `snapshot_layout`에 대응하는 `desktop__musu_app_get_layout_snapshot`를 MCP-only harness에 먼저 구현하고 canonical response shape를 고정한다.

## Scope

- `root_id`
- `max_depth`
- `problems_only`
- `include_text`
- `include_bounds`
- bounded response contract

## Current Truth

- `get_editor_state`는 이미 harness에 있다.
- layout snapshot은 아직 없다.
- Pencil은 `maxDepth=0` top-level only와 `problemsOnly`를 제공한다.

## Tasks

1. synthetic layout tree 정의
2. depth-limited projection 구현
3. `problems_only` filter 구현
4. response JSON shape 고정
5. README/current state/todo board 반영

## Exit Condition

- `desktop__musu_app_get_layout_snapshot`가 harness에서 동작한다.
- `max_depth`에 따라 payload가 bounded하게 줄어든다.
- `problems_only=true`가 별도 문제 노드만 반환한다.

## Result

- [`server.py`](/home/hugh51/musu-functions/MUSU-AS-MCP/server.py)에 `desktop__musu_app_get_layout_snapshot` 구현 완료
- `max_depth=0` top-level only 응답 확인
- `problems_only=true` filtered subtree 응답 확인
