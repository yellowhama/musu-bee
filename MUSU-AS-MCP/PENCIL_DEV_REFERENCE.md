# Pencil.dev MCP Reference

## 목적

Pencil.dev는 `MUSU-AS-MCP`와 100% 같은 self-MCP product는 아니지만, "desktop app이 자기 내부 작업 surface를 MCP로 외부 consumer에 노출한다"는 점에서 가장 현실적인 shipping reference다.

이 문서는 특히 Pencil이 자기 canvas/editor를 어떻게 읽게 만드는지 정리한다.

## 한 줄 결론

Pencil은 canvas를 매 요청마다 통으로 긁는 generic semantic snapshot 모델을 쓰지 않는다.

대신 아래 3개를 중심으로 한 model-aware tool decomposition을 쓴다.

- `get_editor_state`
- `snapshot_layout`
- `get_screenshot`

즉 "현재 에디터 상태", "bounded depth 구조 스냅샷", "특정 노드 스크린샷"으로 쪼개서 읽게 한다.

## 로컬 reference

- [`/tmp/pencil_asar_extract/desktop-mcp-adapter.js`](/tmp/pencil_asar_extract/desktop-mcp-adapter.js)
- [`/tmp/pencil_asar_extract/app.js`](/tmp/pencil_asar_extract/app.js)
- [`/tmp/pencil_ha_mcp/schemas.ts`](/tmp/pencil_ha_mcp/schemas.ts)
- [`/tmp/pencil_ha_mcp/get_editor_state.json`](/tmp/pencil_ha_mcp/get_editor_state.json)
- [`/tmp/pencil_ha_mcp/snapshot_layout.json`](/tmp/pencil_ha_mcp/snapshot_layout.json)
- [`/tmp/pencil_ha_mcp/get_screenshot.json`](/tmp/pencil_ha_mcp/get_screenshot.json)
- [`/mnt/f/Aisaak/Projects/Musu-new/work/tmp/pencil_ha_mcp_more/installer.ts`](/mnt/f/Aisaak/Projects/Musu-new/work/tmp/pencil_ha_mcp_more/installer.ts)

## Pencil이 외부 consumer에 붙는 방식

`DesktopMCPAdapter`는 MCP integration target을 직접 관리한다.

확인된 supported integrations:

- `claudeCodeCLI`
- `codexCLI`
- `geminiCLI`
- `openCodeCLI`
- `kiroCLI`
- `claudeDesktop`

핵심 포인트:

- Pencil desktop app이 외부 consumer 설치/config를 직접 관리한다.
- app이 MCP host info를 저장하고 integration을 토글한다.
- 이 점은 MUSU의 "다른 CLI나 IDE에서 사용 가능" 요구와 직접 닿는다.

## Pencil의 "캔버스 읽기" 기술

### 1. `get_editor_state`

로컬 schema:

- [`/tmp/pencil_ha_mcp/get_editor_state.json`](/tmp/pencil_ha_mcp/get_editor_state.json)

설명:

- 현재 active canvas editor
- current user selection
- design task에 필요한 essential design information

중요한 시사점:

- Pencil은 먼저 "지금 어떤 editor/context를 보고 있는가"를 푼다.
- giant snapshot보다 현재 작업 맥락을 먼저 노출한다.

### 2. `snapshot_layout`

로컬 schema:

- [`/tmp/pencil_ha_mcp/snapshot_layout.json`](/tmp/pencil_ha_mcp/snapshot_layout.json)

설명상 핵심:

- `.pen` file의 현재 layout structure를 확인한다.
- `maxDepth`를 크게 두면 데이터가 커질 수 있다고 명시한다.
- `maxDepth=0`은 top-level nodes만 돌려준다.
- `problemsOnly` 옵션으로 clipped/overlap 같은 문제 노드만 추릴 수 있다.

중요한 시사점:

- Pencil은 구조 조회를 bounded depth API로 제한한다.
- full tree를 기본값으로 강요하지 않는다.
- use case별로 작은 read를 먼저 제공한다.

### 3. `get_screenshot`

로컬 schema:

- [`/tmp/pencil_ha_mcp/get_screenshot.json`](/tmp/pencil_ha_mcp/get_screenshot.json)

설명상 핵심:

- 특정 node/frame의 screenshot을 반환한다.
- caller는 screenshot을 보고 visual correctness를 검증해야 한다.

중요한 시사점:

- 구조 정보와 시각 검증을 분리한다.
- "모든 걸 한 번에 담은 giant response" 대신, targeted image read를 둔다.

## App architecture에서 보이는 실제 구조

`app.js` 기준으로 Pencil은 아래 조합으로 돌아간다.

- `WebSocketServerManager`
- `IPCDeviceManager`
- `DesktopMCPAdapter`
- `DesktopResourceDevice`

보이는 패턴:

- app이 resource/document 단위를 device로 관리한다.
- MCP tool call은 `proxyMcpToolCallRequests()`로 proxy된다.
- file/document resource가 이미 app 내부 model로 로드되어 있다.
- 즉 툴 응답은 live document/resource layer를 기반으로 만들어진다.

이건 "매 요청마다 raw canvas를 새로 분석한다"기보다 "이미 유지 중인 app/document model을 MCP surface로 내보낸다"에 가깝다.

## MUSU에 직접 주는 인사이트

Pencil이 MUSU에 주는 핵심 교훈은 아래 5개다.

1. giant `get_semantic_snapshot` 하나로 모든 걸 해결하려 하지 말아야 한다.
2. 현재 editor/view/context를 먼저 읽는 작은 툴이 필요하다.
3. 구조 snapshot은 bounded depth와 filtered mode를 가져야 한다.
4. screenshot은 별도 targeted tool로 분리하는 편이 낫다.
5. app 내부 mirror/document model을 유지하고, MCP는 그 model을 읽어야 빠르다.

## MUSU에 대한 구체 제안

현재 MUSU의 `desktop__musu_app_get_semantic_snapshot`은 timeout hotspot이다.

Pencil reference를 적용하면, 장기적으로는 아래 분해가 더 맞다.

- `desktop__musu_app_get_editor_state`
- `desktop__musu_app_get_layout_snapshot`
- `desktop__musu_app_get_component_tree`
- `desktop__musu_app_get_native_screenshot`
- `desktop__musu_app_get_accessibility_tree`
- `desktop__musu_app_get_problem_nodes`

그리고 `get_layout_snapshot` 류에는 아래 옵션을 고려해야 한다.

- `max_depth`
- `root_id`
- `problems_only`
- `include_text`
- `include_bounds`

## Pencil과 MUSU의 차이

Pencil:

- desktop app MCP integration reference
- design document/canvas 중심
- model-aware read tool decomposition이 강함

MUSU:

- self-MCP desktop platform
- app 자기 자신을 읽고 조작하는 목적이 더 강함
- native UI mirror + action surface까지 포함

따라서 Pencil은 복제 대상이 아니라 "tool decomposition과 consumer integration의 reference"로 보는 게 맞다.

## 결론

Pencil의 canvas reading 기술의 본질은 아래다.

> live canvas를 generic DOM snapshot으로 통째로 읽는 것이 아니라, app이 이미 알고 있는 editor/document model을 작은 purpose-built MCP tools로 나눠서 노출한다.

이건 MUSU의 다음 단계 방향과 정확히 맞닿는다.

- semantic snapshot giant call 축소
- stateful mirror 유지
- bounded structural reads
- targeted screenshots
- consumer-facing stable tool family
