# Fleet Retry and Last-Seen Contract

Date: 2026-06-12

## Problem

Two cockpit claims were stronger than the implementation:

1. Failed-card `Retry` said it resubmitted the exact order, but the card only
   retained the order text. The retry action read the current `order-target`
   dropdown, so changing the selected machine after failure could resend the
   same text to a different machine.
2. Offline fleet rows displayed `seen 30d ago`, but `musu nodes --local`
   synthesized that timestamp for every unhealthy peer. It was an offline marker,
   not real observation data.

## Contract

`Retry` must preserve the order tuple:

- `text`: the exact submitted order text.
- `target`: the exact submitted route target, including empty string for
  auto-route.

The retry button must use the tuple stored on its card. It must not read the
current composer dropdown because the user may have selected another machine for
the next order.

Fleet `last_seen` must mean evidence-backed observation time:

- For a successful live probe, use the probe observation time.
- For cached registry peers, use `last_heartbeat` when present.
- For `nodes.toml` peers, use `last_health_at` when present.
- If no observation evidence exists, leave `last_seen` empty and let the UI show
  `offline`.

The UI must not invent stale timestamps to force an offline rendering.

Fleet filter semantics follow that same contract:

- `Targetable` means the peer is currently reachable (direct OR relay) and
  selectable for delegated work.
- `Stale` means the peer is currently offline but has evidence-backed
  `last_seen`.
- `Offline` means the peer is currently offline regardless of whether the UI has
  a last-seen label; if no evidence exists, it renders as plain `offline`.

### Relay-reachable state (F-3, 2026-06-23)

The binary online/offline rendering is superseded by a three-state model. A
peer's direct `/api/fleet/node-status` probe can fail while the peer is still
reachable via the WAN relay forward path. Fleet status therefore carries a
`reachable_via` discriminator alongside `healthy`:

- `direct` (green / "online"): the direct probe succeeded. `healthy == true`.
- `relay` (yellow / "relay"): the direct probe failed BUT the registry heartbeat
  is fresh (`now - last_seen <= RELAY_FRESH_SECS`, currently 300s ≈ 2.5× the
  120s registry heartbeat TTL). `healthy == false` but the peer is targetable —
  delegated work routes to it over the relay.
- `offline` (red): direct probe failed AND no fresh heartbeat (or no `last_seen`
  evidence at all).

Semantic shift: `healthy == false` no longer means "offline" — it means
"direct probe failed". Offline is now `healthy == false && reachable_via != relay`.
`RELAY_FRESH_SECS` (300s) is deliberately a small multiple of the registry TTL
(120s) so a registry-expired node goes offline promptly rather than lingering
as falsely-reachable.

The same `healthy` + `reachable_via` pair MUST drive all THREE render surfaces
identically (web page, CLI, installed cockpit shell — see Implementation Notes).
Cross-surface divergence is the bug class this state is most prone to.

The relay-reachable online tally is asymmetric BY DESIGN: a `relay` peer counts
toward `online_nodes` (it is reachable) but its task counts are NOT summed into
`total_running`/`total_pending` (the direct probe failed, so task data is
unavailable and must not be fabricated).

## Implementation Notes

- `musu-bee/src-tauri-shell/main.js` stores `data-order-text` and
  `data-order-target` on task cards. `Retry` calls `submitText(text, target)` from
  those card fields.
- `musu-rs/src/peer/discovery.rs` preserves `last_heartbeat` and
  `last_health_at` as peer metadata.
- `musu-rs/src/bridge/handlers/fleet.rs` exposes `last_seen` on
  `FleetNodeStatus`. Healthy probes get a current observation timestamp;
  unreachable peers fall back to persisted evidence.
- `musu-rs/src/install/cli_commands.rs` projects bridge-provided `last_seen`
  into `musu.nodes_cli.v1` without fabricating a stale date.
- `musu-bee/src-tauri-shell/main.js` derives `Targetable`, `Stale`, and
  `Offline` filters from the rendered fleet row state instead of relying on a
  dummy timestamp.

Relay-reachable state (F-3, 2026-06-23):

- `musu-rs/src/bridge/handlers/fleet.rs` owns the policy: `RELAY_FRESH_SECS`
  (300s) + `relay_verdict()` (the only place the relay-vs-offline decision
  lives, computed at the `peer_fallback_status` chokepoint from
  `peer_last_seen()`), and `tally_fleet()` (the online-counts-relay /
  task-counts-exclude-relay asymmetry, unit-tested). `FleetNodeStatus` gains
  `reachable_via: Option<String>` (`#[serde(skip_serializing_if)]`).
- The page repointed from the never-implemented `/api/machines` to the existing
  `GET /api/fleet/status` (`FleetDashboard`/`FleetNodeStatus`). Before F-3 the
  web fleet page was fully broken (it called Python-era `/api/machines`,
  `/api/watch/subscribe`, `/api/agents` — none exist in musu-rs).
- THREE render surfaces derive the same three-state from `healthy` +
  `reachable_via` and MUST agree:
  - `musu-bee/src/app/fleet/page.tsx` — `nodeState()`.
  - `musu-rs/src/install/cli_commands.rs` — peer printer (`relay` 🟡).
  - `musu-bee/src-tauri-shell/main.js` — `nodeFleetState()`, the single
    source-of-truth feeding BOTH the order-target `<select>` and the fleet-row
    `<li>` so the two cannot drift (the installed cockpit was the surface the
    first implementation pass missed).
- `musu-bee/src-tauri/src/lib.rs` `FleetNode` carries `healthy` +
  `reachable_via`; `fleet_node_from_bridge_value` maps both so `list_fleet`
  delivers them to the cockpit shell.

## Verification

Focused checks cover:

- Retry keeps target stable even if the composer dropdown changes after failure.
- `peer_last_seen` prefers registry `last_seen`.
- `peer_last_seen` converts `nodes.toml` `last_health_at` epoch seconds to
  RFC3339.
- `musu nodes --json --local` emits empty `last_seen` when no evidence exists,
  not an invented old date.

Commands run on 2026-06-12:

- `npm run test:tauri-shell` (`4/4`)
- `cargo test --manifest-path musu-rs/Cargo.toml --lib last_ -- --nocapture`
  (`4/4`)
- `cargo test --manifest-path musu-rs/Cargo.toml --lib
  node_status_uses_runtime_registry_addr -- --nocapture` (`1/1`)
- Headless browser mock verified Retry still submitted the original target after
  the dropdown changed.
- Browser-rendered shell mock verified `Targetable 2` excludes the
  evidence-backed stale peer and `Stale 1` isolates it without treating an
  unknown offline peer as `seen 30d ago`.

Additional cross-machine smoke run on 2026-06-13 KST:

- `powershell -NoProfile -ExecutionPolicy Bypass -File
  scripts/windows/smoke-two-bridge-route-proof.ps1 -Json -TimeoutSec 120`
  started two independent bridge homes and delegated from `this-laptop` to
  `studio-pc`.
- The source task detail returned `status=done`, the target echo output,
  `route_proof.result=success`, `callback_delivered=true`, and
  `callback_node=studio-pc`.
- Evidence was written to
  `.local-build/two-bridge-route-proof/20260613-002216/two-bridge-route-proof.evidence.json`.
- `scripts/windows/smoke-real-peer-route-proof.ps1` was then validated against a
  running source bridge and existing peer with `-ExpectedRouteKind lan`.
  Evidence:
  `.local-build/real-peer-route-proof/20260613-004527/real-peer-route-proof.evidence.json`.
  The same script should be used on separate hardware with `-TailscaleIp
  <100.x.y.z> -ExpectedRouteKind tailscale` to prove the intended network path.

Relay-reachable state checks (F-3, 2026-06-23):

- `relay_verdict()` unit tests: fresh `last_seen` (≤300s) → `reachable_via=relay`
  with `healthy=false`; stale `last_seen` (>300s) → offline; no `last_seen` →
  offline (the pre-F-3 "does not fabricate online" regression test stays green).
- `tally_fleet()` test asserts a relay peer increments `online_nodes` but its
  task counts are excluded from `total_running`/`total_pending`.
- `cargo test --lib bridge::handlers::fleet` (`14/14`) and
  `bridge::services` (`20/20`) — run by an independent auditor, not just the
  builder.
- `cargo check` (both crates) + `npm run build` (webpack) + `node --check
  src-tauri-shell/main.js` all pass.
- Three-surface agreement was independently re-audited: web `nodeState()`, CLI
  peer printer, and cockpit `nodeFleetState()` derive the identical three-state
  from the same `healthy`/`reachable_via` fields.
- STILL PENDING (user-gated): two-machine real-hardware E2E showing a peer flip
  from `direct` to `relay` to `offline` on the live cockpit.
