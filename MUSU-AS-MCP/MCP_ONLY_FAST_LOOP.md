# MCP-Only Fast Loop

## 목적

`MUSU-AS-MCP`에서 전체 MUSU Desktop을 반복적으로 풀빌드하지 않고, self-MCP surface만 빠르게 재시작하고 검증하는 개발 루프를 정의한다.

## Why This Exists

현재 MUSU Desktop full rebuild는 느리다.

이미 확인된 구조적 이유:

- default full feature set
- wide Tauri runtime resource scan
- large link graph
- Windows desktop binary final link cost

따라서 semantic snapshot 같은 MCP surface 문제를 디버깅할 때 full app rebuild를 매번 반복하는 건 비효율적이다.

## Fast Loop Principle

목표는 전체 제품을 다시 만드는 게 아니라, 아래 최소 실행 단위를 빠르게 확인하는 것이다.

### Minimum Surface

- health
- tools/list
- runtime status
- current view
- actionables
- semantic snapshot

이 6개가 살아 있으면 self-MCP surface 핵심은 대부분 판단 가능하다.

## Current Code Situation

현재 self-MCP surface는 아래 코드 축에 걸쳐 있다.

### Rust MCP Server Layer

- [`builtin.rs`](/mnt/f/Aisaak/Projects/Musu-new/release/musu-desktop/src-tauri/src/mcp_broker/builtin.rs)
- 역할:
  - runtime status
  - current view
  - semantic snapshot request
  - MCP builtin tool contracts

### Rust UI State / Snapshot Command Layer

- [`ui_state.rs`](/mnt/f/Aisaak/Projects/Musu-new/release/musu-desktop/src-tauri/src/commands/ui_state.rs)
- 역할:
  - UI mirror sync/read
  - snapshot submit
  - listener diagnostics commands

### Frontend Listener Layer

- [`useUiSnapshotListener.ts`](/mnt/f/Aisaak/Projects/Musu-new/release/musu-desktop/src/hooks/useUiSnapshotListener.ts)
- 역할:
  - `musu://request-ui-snapshot` 수신
  - semantic summary capture
  - `submit_ui_snapshot` / diagnostics invoke

### Frontend Mount Path

- [`App.tsx`](/mnt/f/Aisaak/Projects/Musu-new/release/musu-desktop/src/App.tsx)
- 역할:
  - listener hook가 실제 live shell에서 mount되는지 결정

## Current Active Finding

현재 semantic snapshot timeout의 가장 유력한 분기는 아래다.

- backend request는 발사된다
- `runtime_status`에서 `ui_snapshot_diagnostics.listener_ready = false`
- stale frontend bundle이 실제 원인 후보로 확인됐다

즉 current bottleneck은 payload보다 listener registration/live bundle 반영 문제다.

## Fast Loop Design

### Loop 1. Runtime Probe Only

변경 없이 현재 상태만 확인한다.

- app launch
- `/mcp/health`
- `desktop__musu_app_get_runtime_status`
- `desktop__musu_app_get_semantic_snapshot`

### Loop 2. Frontend-Only Change

대상:

- `src/hooks/useUiSnapshotListener.ts`
- `src/App.tsx`

루프:

1. frontend build
2. minimal Rust rebuild
3. app relaunch
4. runtime status recheck

### Loop 3. Rust MCP Change

대상:

- `builtin.rs`
- `ui_state.rs`
- `state.rs`
- `build.rs`

루프:

1. `cargo check`
2. minimal Rust build
3. app relaunch
4. runtime status recheck

## Immediate Execution Rule

semantic snapshot 문제를 디버깅할 때는 아래 순서를 우선한다.

1. runtime status로 diagnostics부터 본다
2. `listener_ready`가 false면 frontend/live bundle 문제부터 본다
3. `request_received`가 없으면 event delivery를 본다
4. `submit_started`가 없으면 listener handler 내부를 본다
5. `submit_completed`까지 있는데 timeout이면 Rust channel wiring을 본다

## Planned Next Step

다음 bounded objective는 이 fast loop를 실제 runbook과 command set로 고정하는 것이다.

즉 문서만이 아니라:

- 최소 빌드 명령
- 최소 launch 명령
- 최소 probe 명령
- semantic snapshot debug checklist

를 한 세트로 만들 필요가 있다.
