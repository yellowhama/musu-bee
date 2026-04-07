# Open Source Reference Map

## 목적

`MUSU-AS-MCP`와 가장 닮은 구조를 가진 오픈소스 레퍼런스를 정리하고, 어떤 개념을 MUSU에 직접 가져와야 하는지 매핑한다.

핵심 전제:

- MUSU와 100% 동일한 self-MCP desktop app 오픈소스는 현재 거의 없다.
- 따라서 "같은 제품"을 찾기보다 "같은 아키텍처 조각"을 가진 레퍼런스를 합성해서 봐야 한다.

## Reference Set

현재 기준 최우선 레퍼런스는 아래 4개다.

1. Pencil.dev MCP / desktop app MCP integration + model-aware canvas reads
2. Chrome DevTools Protocol / DevTools Protocol
3. Neovim msgpack-RPC / UI separation
4. React DevTools shared / global hook + inspected element pipeline

---

## 0. Pencil.dev MCP

로컬 reference:

- [PENCIL_DEV_REFERENCE.md](/home/hugh51/musu-functions/MUSU-AS-MCP/PENCIL_DEV_REFERENCE.md)
- [`/tmp/pencil_asar_extract/desktop-mcp-adapter.js`](/tmp/pencil_asar_extract/desktop-mcp-adapter.js)
- [`/tmp/pencil_asar_extract/app.js`](/tmp/pencil_asar_extract/app.js)
- [`/tmp/pencil_ha_mcp/schemas.ts`](/tmp/pencil_ha_mcp/schemas.ts)
- [`/tmp/pencil_ha_mcp/get_editor_state.json`](/tmp/pencil_ha_mcp/get_editor_state.json)
- [`/tmp/pencil_ha_mcp/snapshot_layout.json`](/tmp/pencil_ha_mcp/snapshot_layout.json)
- [`/tmp/pencil_ha_mcp/get_screenshot.json`](/tmp/pencil_ha_mcp/get_screenshot.json)

왜 중요한가:

- shipping 중인 desktop app MCP integration reference다.
- Codex/Claude/Gemini 같은 external consumer를 실제 지원한다.
- canvas reading을 giant snapshot 하나가 아니라 purpose-built tools로 분해한다.

MUSU에 주는 직접 인사이트:

- `get_semantic_snapshot` 하나에 과도하게 의존하지 말아야 한다.
- 먼저 `editor_state` 같은 현재 맥락 read를 제공해야 한다.
- layout read는 bounded depth, filtered mode, subtree root를 가져야 한다.
- visual verification은 targeted screenshot tool로 분리하는 편이 안정적이다.

MUSU에 바로 가져올 개념:

- consumer integration compatibility를 제품 surface의 일부로 취급
- `editor_state + layout_snapshot + screenshot` 식 tool decomposition
- app 내부 model/mirror를 기반으로 한 fast read
- giant one-shot snapshot 대신 bounded, selective read

---

## 1. Chrome DevTools Protocol

로컬 reference:

- [`references/devtools-protocol/json/browser_protocol.json`](/home/hugh51/musu-functions/MUSU-AS-MCP/references/devtools-protocol/json/browser_protocol.json)
- [`references/devtools-protocol/types/protocol.d.ts`](/home/hugh51/musu-functions/MUSU-AS-MCP/references/devtools-protocol/types/protocol.d.ts)

직접 연결 포인트:

- `DOMSnapshot.captureSnapshot`
- `Accessibility.getFullAXTree`
- `Accessibility.queryAXTree`

왜 중요한가:

- 브라우저가 자기 내부 DOM/AX tree를 외부 프로토콜로 노출하는 대표 사례다.
- "실제 픽셀"이 아니라 "의미론적 구조"를 외부 에이전트가 이해할 수 있는 형태로 던진다.

MUSU에 주는 직접 인사이트:

- `get_semantic_snapshot`은 full DOM dump보다 semantic tree/summary로 가야 한다.
- accessibility tree 같은 의미 구조를 우선적으로 노출하는 쪽이 agent 친화적이다.
- layout/paint/style 전체를 매번 다 넘기는 모델은 비싸다.

MUSU에 바로 가져올 개념:

- semantic node 중심 snapshot
- 필요 정보 whitelist
- full snapshot과 lightweight query를 분리
- "한 번의 giant response"보다 목적별 read surface

---

## 2. Neovim

로컬 reference:

- [`references/neovim/runtime/doc/channel.txt`](/home/hugh51/musu-functions/MUSU-AS-MCP/references/neovim/runtime/doc/channel.txt)
- [`references/neovim/runtime/doc/api.txt`](/home/hugh51/musu-functions/MUSU-AS-MCP/references/neovim/runtime/doc/api.txt)
- [`references/neovim/src/mpack/rpc.c`](/home/hugh51/musu-functions/MUSU-AS-MCP/references/neovim/src/mpack/rpc.c)
- [`references/neovim/src/mpack/rpc.h`](/home/hugh51/musu-functions/MUSU-AS-MCP/references/neovim/src/mpack/rpc.h)

왜 중요한가:

- Neovim은 core와 UI를 분리하고, 그 사이를 RPC로 통신하는 대표 사례다.
- 외부 프로세스가 Neovim 상태를 읽고 조작하는 철학이 MUSU self-MCP와 매우 가깝다.

MUSU에 주는 직접 인사이트:

- Layer A와 Layer B를 명시적으로 분리하는 설계가 맞다.
- 상태 조회 API와 action API를 분리해도 철학적으로 자연스럽다.
- callback/event path는 빠르고 가벼워야 한다.

MUSU에 바로 가져올 개념:

- UI surface와 core surface 분리
- bidirectional RPC/event contract
- "callback should be fast" 원칙
- external client가 붙어도 product 구조가 흔들리지 않는 core-first 설계

---

## 3. React DevTools Shared

로컬 reference:

- [`references/react/packages/react-devtools-shared/src/hook.js`](/home/hugh51/musu-functions/MUSU-AS-MCP/references/react/packages/react-devtools-shared/src/hook.js)
- [`references/react/packages/react-devtools-shared/src/backendAPI.js`](/home/hugh51/musu-functions/MUSU-AS-MCP/references/react/packages/react-devtools-shared/src/backendAPI.js)
- [`references/react/packages/react-devtools-shared/src/backend/fiber/renderer.js`](/home/hugh51/musu-functions/MUSU-AS-MCP/references/react/packages/react-devtools-shared/src/backend/fiber/renderer.js)
- [`references/react/packages/react-devtools-extensions/src/contentScripts/installHook.js`](/home/hugh51/musu-functions/MUSU-AS-MCP/references/react/packages/react-devtools-extensions/src/contentScripts/installHook.js)

왜 중요한가:

- 실행 중인 React 앱에서 현재 컴포넌트 트리, 상태, hooks 정보를 외부 도구에 안전하게 노출하는 구조다.
- `__REACT_DEVTOOLS_GLOBAL_HOOK__`를 통해 런타임에 renderer를 붙잡고, bridge로 inspect 요청을 주고받는다.

MUSU에 주는 직접 인사이트:

- live UI state를 뽑을 때 request 시점마다 전체 UI를 새로 뒤지지 말고, 이미 유지되는 구조를 활용해야 한다.
- inspect는 timeout/bridge/requestID 기반으로 다뤄야 한다.
- 비싼 계산은 캐시/partial hydration/selected path 중심으로 줄여야 한다.

MUSU에 바로 가져올 개념:

- global hook 또는 central observer concept
- bridge + requestID + timeout 구조
- inspected element path 기반의 partial read
- full snapshot보다 inspect-on-demand 모델

---

## Common Insight

네 레퍼런스가 공통으로 말하는 정답은 이거다.

> UI를 매 요청마다 처음부터 다 순회하지 말고, 가벼운 shadow tree 또는 이미 유지되는 state graph를 메모리에 두고, 요청이 오면 그걸 빠르게 serialize 해서 반환해야 한다.

이건 현재 MUSU semantic snapshot timeout에도 직접 연결된다.

현재 MUSU의 핵심 문제는 단순히 "snapshot 응답이 느리다"가 아니라:

- listener registration
- event delivery
- snapshot capture 비용
- serialization 비용
- Rust response wiring

중 어디가 병목인지 좁히는 단계다.

하지만 장기적으로는 설계도 아래 방향으로 가야 한다.

- giant snapshot 1개보다 small focused reads
- shadow tree / mirror state 유지
- request-driven full traversal 최소화

## Current MUSU Mapping

현재 MUSU 코드에서 대응되는 축:

- app mount:
  - [`App.tsx`](/mnt/f/Aisaak/Projects/Musu-new/release/musu-desktop/src/App.tsx)
- snapshot listener:
  - [`useUiSnapshotListener.ts`](/mnt/f/Aisaak/Projects/Musu-new/release/musu-desktop/src/hooks/useUiSnapshotListener.ts)
- UI mirror/snapshot command layer:
  - [`ui_state.rs`](/mnt/f/Aisaak/Projects/Musu-new/release/musu-desktop/src-tauri/src/commands/ui_state.rs)
- MCP builtin request layer:
  - [`builtin.rs`](/mnt/f/Aisaak/Projects/Musu-new/release/musu-desktop/src-tauri/src/mcp_broker/builtin.rs)

## Immediate Recommendation

1. semantic snapshot closure는 current listener/runtime truth를 먼저 닫는다.
2. 그 다음 `get_semantic_snapshot`을 giant one-shot API로 둘지 재검토한다.
3. 레퍼런스 방향대로 아래 분해를 검토한다.

- `get_ui_text_summary`
- `get_layout_snapshot`
- `get_component_tree`
- `get_accessibility_tree`
- `get_native_screenshot`

## Conclusion

현재 MUSU-AS-MCP는 "Pencil tool decomposition + CDP snapshot discipline + Neovim RPC separation + React DevTools inspection strategy"를 합친 형태로 보는 것이 가장 정확하다.
