# MUSU-AS-MCP Master Plan

## 목표

`MUSU-AS-MCP`의 목표는 MUSU Desktop을 하나의 MCP product surface로 재정의하고 재현 가능한 형태로 고정하는 것이다.

현재 실행 전략:

- canonical implementation workspace는 [`/home/hugh51/musu-functions/MUSU-AS-MCP`](/home/hugh51/musu-functions/MUSU-AS-MCP) 이다.
- 새 MCP surface와 contract는 여기서 먼저 완성한다.
- 원본 desktop repo는 즉시 구현 대상이 아니라, 이후 검증된 surface를 backport하는 target이다.

핵심 제품 정의:

1. MUSU Desktop은 자기 스스로 조종 가능해야 한다.
2. 다른 CLI나 IDE가 MUSU MCP를 사용할 수 있어야 한다.
3. MUSU Desktop 자체가 MCP 서버여야 한다.
4. desktop app MCP reference는 Pencil.dev를 참고한다.

즉 이 프로젝트는 "MUSU Desktop 안에 MCP 기능이 있다"가 아니라, "MUSU Desktop 자체가 self-MCP desktop product다"에 가깝다.

## 핵심 축

### Layer A. Server Surface

- `/mcp/health`
- `initialize`
- `tools/list`
- `desktop__musu_app_*` tool family visibility

### Layer B. Native UI Surface

- `get_current_view`
- `get_ui_state`
- `list_actionables`
- `execute_action`
- `get_semantic_snapshot`

### Consumer Proof

- Codex CLI / Claude Code / Gemini CLI 같은 client가 실제로 붙는가
- fresh session에서 `desktop__musu_app_*`를 안정적으로 소비하는가

## Foundational Docs

- [VISION.md](/home/hugh51/musu-functions/MUSU-AS-MCP/VISION.md)
- [MCP_ONLY_FAST_LOOP.md](/home/hugh51/musu-functions/MUSU-AS-MCP/MCP_ONLY_FAST_LOOP.md)
- [DESIGNING_FOR_SELF_MCP.md](/home/hugh51/musu-functions/MUSU-AS-MCP/DESIGNING_FOR_SELF_MCP.md)
- [PENCIL_DEV_REFERENCE.md](/home/hugh51/musu-functions/MUSU-AS-MCP/PENCIL_DEV_REFERENCE.md)
- [PENCIL_DEV_ALIGNMENT.md](/home/hugh51/musu-functions/MUSU-AS-MCP/PENCIL_DEV_ALIGNMENT.md)
- [ORIGINAL_DESKTOP_BACKPORT_MAP.md](/home/hugh51/musu-functions/MUSU-AS-MCP/ORIGINAL_DESKTOP_BACKPORT_MAP.md)
- [CURRENT_STATE.md](/home/hugh51/musu-functions/MUSU-AS-MCP/CURRENT_STATE.md)
- [OPEN_SOURCE_REFERENCE_MAP.md](/home/hugh51/musu-functions/MUSU-AS-MCP/OPEN_SOURCE_REFERENCE_MAP.md)

## Reference Positioning

Pencil.dev와의 관계는 아래처럼 정리한다.

- Pencil.dev는 desktop app MCP integration reference다.
- Pencil.dev는 특히 canvas read를 `editor_state + layout snapshot + screenshot`으로 분해한다.
- MUSU는 그 reference를 바탕으로 self-control과 native UI mirror/action까지 확장한다.
- 따라서 비교 포인트는 config install, consumer compatibility, tool-family design, bounded structural reads다.

## 현재 코드 truth

2026-04-01 기준 확인된 사실:

- Rust side diagnostics path는 이미 구현돼 있다.
- semantic snapshot tracing을 위한 backend state와 Tauri commands도 들어가 있다.
- generated handler registration 누락도 코드상 수정됐다.
- Layer A는 통과한 적이 있고, Layer B의 `current_view`, `ui_state`, `actionables`, `open_settings`도 통과한 적이 있다.
- 현재 남은 직접 blocker는 semantic snapshot timeout이다.
- 최신 runtime truth에서는 `ui_snapshot_diagnostics.listener_ready = false`가 관측됐다.
- stale frontend bundle이 실제 원인 후보로 확인됐고, frontend rebuild가 이미 다시 수행됐다.

## 현재 우선순위

1. `MCP-only fast loop` 기준 최소 재현 루프 고정
2. `get_semantic_snapshot`과 분해 surface 관계 재정의
3. canonical surface를 `musu-functions` 쪽에서 완성
4. fresh session self-MCP consumer proof
5. proof 문서 체계 정리
6. 이후 필요한 항목만 original desktop으로 역이식

## 작업 원칙

- 항상 현재 runtime truth를 기준으로 움직인다.
- Layer A와 Layer B를 섞어 말하지 않는다.
- consumer proof와 server proof를 분리한다.
- 새 bounded objective는 `plans/PLAN_XX_*.md`로 먼저 만든다.

## active plan

- [plans/PLAN_04_PENCIL_STYLE_TOOL_DECOMPOSITION.md](/home/hugh51/musu-functions/MUSU-AS-MCP/plans/PLAN_04_PENCIL_STYLE_TOOL_DECOMPOSITION.md)

## queued plans

- `PLAN_00_REPRO_BASELINE.md`
- `PLAN_01_SEMANTIC_SNAPSHOT_CLOSURE.md`
- `PLAN_02_MCP_FAST_LOOP_RUNBOOK.md`
- `PLAN_03_REFERENCE_ARCHAEOLOGY.md`
- `PLAN_06_NATIVE_SCREENSHOT_SURFACE.md`
- `PLAN_07_CONSUMER_PROOF_RUNBOOK.md`
- `PLAN_08_GOVERNANCE_REVIEW_SURFACE_POSITION.md`
