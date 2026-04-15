# Evidence — Polling Inventory & Event-Driven Priorities (MUS-1228)

Date: 2026-04-09
Owner: Founding Engineer

## 1. Polling & Tick Loop Inventory

| Component | Source Location | Interval | Purpose | Resource Impact |
| :--- | :--- | :--- | :--- | :--- |
| `musu-bee` | `src/app/page.tsx:179` | 3,000ms | `fetchStatus` (/api/device-status) | Medium (Client-side fetch) |
| `musu-port` | `src/server.rs:183` | 2,000ms | `reconcile_routes` & `auto_promote` | **High** (Server-side scanning) |
| `musu-port` | `src/server.rs:206` | 5,000ms | `peer_urls` health probe | Low (Network heartbeat) |
| `musu-port` | `src/l4.rs:295` | 10,000ms | QUIC session cleanup loop | Low (Internal maintenance) |
| `musu-port` | `src/l4.rs` (Proxy) | 40-80ms | Proxy stream yield sleeps | Medium (Context switching) |

## 2. Conversion & Optimization Priorities

### 🟢 Priority 1: Immediate Conversion (Event-Driven)
- **`musu-port` Discovery & Reconcile (2s):** Currently scans for new services every 2 seconds.
  - *Proposed:* Trigger reconciliation only when `musu-scanner` (indexer) reports a change or a new service is manually `/promote`d.
- **`musu-bee` Device Status (3s):** Client polls for CPU/RAM/GPU every 3 seconds.
  - *Proposed:* Switch to WebSocket or Server-Sent Events (SSE) for "on-change" status updates. Pause updates when tab is in background.

### 🟡 Priority 2: Relaxation (Sampling Frequency)
- **`musu-port` Peer Health (5s):** Cross-node health check.
  - *Proposed:* Increase interval to 15s or 30s when system is idle. Only use 5s during active multi-node tasks.

### 🔴 Priority 3: Maintain (Loop required)
- **`musu-port` session cleanup (10s):** Necessary for resource hygiene.
- **Proxy Stream Sleeps (40ms):** Necessary for non-blocking I/O backpressure in current implementation.

## 3. UI Sampling Rules (Proposed)

1.  **Tab Gating:** Pause all UI refresh timers (`setInterval`) when `document.hidden` is true.
2.  **Pane Gating:** Only poll/refresh data for the currently visible pane (e.g., don't poll Worker stats if on the Chat screen).
3.  **Log Virtualization:** Limit visible log lines to 500; only load more from server on-demand (scroll).
4.  **Demand-Load Panels:** Metadata panels (Discovery, Coverage) should only fetch on first click or manual refresh.

## 4. Operational Rules

- **Event First, Poll Fallback:** Every core component should attempt to push events via a shared bus (or WebSocket) before resorting to polling.
- **Exponential Backoff:** All client-side polling MUST implement exponential backoff if the server is unreachable or returns 5xx.
