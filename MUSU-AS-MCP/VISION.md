# MUSU-AS-MCP Vision

## Product Statement

`MUSU-AS-MCP`는 MUSU Desktop을 자기 자신에 대한 MCP 서버로 만들고, 외부 CLI/IDE도 그 surface를 쓰게 하는 self-MCP desktop platform이다.

## Core Definition

이 제품 정의는 아래 4개로 고정한다.

1. 자기 스스로 조종 가능
2. 다른 CLI나 IDE에서 사용 가능
3. MUSU Desktop 자체가 MCP 서버
4. 레퍼런스는 Pencil.dev MCP

## What Makes It Different

### 1. External Tool MCP가 아니라 Self-MCP

보통 MCP는 파일시스템, 브라우저, git, DB 같은 외부 리소스를 붙인다.

MUSU-AS-MCP는 MUSU Desktop 자신을 MCP surface로 노출한다.

즉 앱이 자기 UI와 자기 runtime 상태를 MCP로 공개한다.

### 2. 두 층으로 나뉜다

Layer A:

- `/mcp/health`
- `initialize`
- `tools/list`
- `desktop__musu_app_*` tool family visibility

Layer B:

- `get_current_view`
- `get_ui_state`
- `list_actionables`
- `execute_action`
- `get_semantic_snapshot`

대부분의 MCP는 툴 호출까지만 제공한다.

MUSU-AS-MCP는 native app UI surface 자체를 읽고 조작하는 층까지 가진다.

### 3. Stateful UI Mirror를 가진다

이건 단순 tool server가 아니다.

앱 내부 상태를 mirror 해서 아래를 MCP로 읽게 한다.

- 현재 화면
- 활성 project/workspace
- actionable component
- route metadata

즉 UI state server 성격도 함께 가진다.

### 4. Action까지 가진다

일반 MCP는 read-heavy인 경우가 많다.

MUSU-AS-MCP는 `execute_action(open_settings)` 같은 식으로 실제 UI action도 수행한다.

즉 `read + inspect + act`가 같이 있다.

### 5. 목적은 Integration보다 Dogfooding

Codex CLI, Claude Code, Gemini CLI가 MUSU에 붙어서 MUSU를 자기 자신으로 검사하게 만드는 게 핵심 목적이다.

그래서 일반 integration MCP보다 self-observing app surface에 가깝다.

## Pencil Reference Position

Pencil.dev는 좋은 reference지만 그대로 복제 대상은 아니다.

- Pencil: desktop app + consumer integration reference
- MUSU: desktop app + self-control + native UI mirror/action reference

즉 Pencil은 integration reference이고, MUSU는 self-observing native-app MCP로 확장된 형태다.

## Current Code Anchors

현재 코드에서 이 vision을 받치는 핵심 표면은 아래다.

- frontend listener:
  - [`useUiSnapshotListener.ts`](/mnt/f/Aisaak/Projects/Musu-new/release/musu-desktop/src/hooks/useUiSnapshotListener.ts)
- app mount path:
  - [`App.tsx`](/mnt/f/Aisaak/Projects/Musu-new/release/musu-desktop/src/App.tsx)
- UI mirror / snapshot submit commands:
  - [`ui_state.rs`](/mnt/f/Aisaak/Projects/Musu-new/release/musu-desktop/src-tauri/src/commands/ui_state.rs)
- MCP builtin request path:
  - [`builtin.rs`](/mnt/f/Aisaak/Projects/Musu-new/release/musu-desktop/src-tauri/src/mcp_broker/builtin.rs)

## Strategic Consequence

이 정의가 맞다면 개발 전략도 달라져야 한다.

- 전체 앱 풀빌드 반복 X
- MCP-only fast loop O

즉 지금 중요한 건 full product rebuild보다 self-MCP surface를 빠르게 재시작하고 검증하는 루프를 먼저 만드는 것이다.
