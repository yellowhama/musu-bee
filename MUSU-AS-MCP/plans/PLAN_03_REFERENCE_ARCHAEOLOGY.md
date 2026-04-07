# PLAN 03: Reference Archaeology

> Status: active
> Updated: 2026-04-01 KST

## Goal

MUSU-AS-MCP를 설계할 때 직접 참고할 오픈소스 reference를 local artifact와 문서 기준으로 고정한다.

## Scope

- Pencil.dev MCP
- CDP / DevTools Protocol
- Neovim msgpack-RPC
- React DevTools shared
- MUSU current code와의 대응 관계

## Current Truth

- self-MCP desktop app과 100% 동일한 shipping OSS reference는 거의 없다.
- Pencil.dev는 desktop app MCP integration과 model-aware canvas reads의 shipping reference다.
- CDP, Neovim, React DevTools가 각각 MUSU의 핵심 아키텍처 조각을 제공한다.
- local reference artifacts는 `references/` 아래 확보했다.
- Pencil 관련 local artifacts도 별도 확보돼 있다.

## Tasks

1. Pencil, CDP, Neovim, React reference artifact를 local에 정리한다.
2. 각 reference의 핵심 파일과 핵심 protocol/tool surface를 지정한다.
3. Pencil의 `editor_state + layout_snapshot + screenshot` 분해 방식을 MUSU에 대응시킨다.
4. giant snapshot vs bounded structural read vs inspect-on-demand 방향을 비교한다.
5. MUSU가 유지해야 할 최소 read surface와 분해 후보를 정리한다.
6. 결과를 vision/plan/fast-loop 문서와 연결한다.

## Evidence

- [`PENCIL_DEV_REFERENCE.md`](/home/hugh51/musu-functions/MUSU-AS-MCP/PENCIL_DEV_REFERENCE.md)
- [`OPEN_SOURCE_REFERENCE_MAP.md`](/home/hugh51/musu-functions/MUSU-AS-MCP/OPEN_SOURCE_REFERENCE_MAP.md)
- local `references/` artifacts
- local Pencil artifacts:
  - [`/tmp/pencil_asar_extract/app.js`](/tmp/pencil_asar_extract/app.js)
  - [`/tmp/pencil_asar_extract/desktop-mcp-adapter.js`](/tmp/pencil_asar_extract/desktop-mcp-adapter.js)
  - [`/tmp/pencil_ha_mcp/schemas.ts`](/tmp/pencil_ha_mcp/schemas.ts)
  - [`/tmp/pencil_ha_mcp/get_editor_state.json`](/tmp/pencil_ha_mcp/get_editor_state.json)
  - [`/tmp/pencil_ha_mcp/snapshot_layout.json`](/tmp/pencil_ha_mcp/snapshot_layout.json)
  - [`/tmp/pencil_ha_mcp/get_screenshot.json`](/tmp/pencil_ha_mcp/get_screenshot.json)

## Exit Condition

- 다음 사람이 "왜 이 네 레퍼런스를 봐야 하는지" 바로 이해할 수 있다.
- MUSU 설계 방향이 reference 관점에서도 설명 가능하다.
- Pencil reference를 기준으로 MUSU의 `semantic_snapshot` 장기 분해 후보까지 설명 가능하다.
