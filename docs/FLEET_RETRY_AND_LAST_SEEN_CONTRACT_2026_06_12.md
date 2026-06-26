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

Cloud registry `public_url` must be usable by other PCs:

- `/api/v1/nodes/register` rejects non-HTTP(S), loopback, localhost, wildcard,
  IPv4-mapped loopback/wildcard (`[::ffff:127.0.0.1]`,
  `[::ffff:0.0.0.0]`), and port-0 `public_url` values before writing the
  registry row.
- `/api/v1/nodes` filters legacy rows with non-remote-usable `public_url` so old
  registry pollution is not returned as fleet truth.
- `musu nodes` applies the same client-side default filter and omits remote
  non-usable registry rows from the default fleet view. `--include-unusable`
  exists for audit/cleanup so stale rows can still be inspected deliberately.
- `DELETE /api/v1/nodes/[nodeName]` is owner-scoped cleanup for stale registry
  rows, including legacy rows that `listNodes` would hide because their
  `public_url` is not remote-usable.
- `musu nodes --delete <nodeName>` is the CLI wrapper for that cleanup API. It
  emits `musu.nodes_delete_cli.v1` in JSON mode and deletes only the caller's
  owner-scoped registry row; it does not evict a Headscale mesh node.
- If the cleanup API returns the JSON not-found shape for an owner-scoped row,
  the CLI treats it as idempotent success/already-absent, not as a fatal cleanup
  failure.
- Local resolver/cache code treats any legacy remote loopback/wildcard registry
  entry, including IPv4-mapped loopback/wildcard forms, as unusable and does
  not convert it into a cached peer or fresh heartbeat evidence.

Fleet filter semantics follow that same contract:

- `Targetable` means the peer is currently reachable for delegated work. In the
  current release this requires a direct/healthy probe; `relay` is a display
  freshness state only until release-grade relay transport is implemented and
  proven.
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
  120s registry heartbeat TTL). `healthy == false`; the peer is displayed as a
  relay candidate, but it is **not** counted in `online_nodes` and is **not**
  treated as work-targetable until transport proof exists.
  ⚠️ **V33 정정 (2026-06-26)**: 이 3-state는 **표시/판정 레이어**일 뿐이다. `relay`는
  heartbeat가 신선해 곧 복구될 수 있음을 노란 상태로 **표시**한다는 의미이지, 그 상태에서
  delegate한 work가 실제로 relay 경로로 forward된다는 뜻이 **아니다**. 실제
  라우팅(`router.rs::select_peer_for_route`, L170-171)은 **relay를 선택하지 않는다 — relay/QUIC 터널 transport가 아직 미구현**
  (`relay_transport_wired == false`). direct 경로가 복구되기 전까지 실제 forward는 가지 않는다.
  relay transport 실구현은 별도 후속(V34, `NEXT_STEPS_V34_2026_06_26.md` N-4)이며, 그것이 되어야
  "delegated work routes over the relay"가 비로소 참이 된다.
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

The relay-display tally is asymmetric BY DESIGN: a `relay` peer remains visible
as a distinct yellow state, but it does **not** count toward `online_nodes`, and
its task counts are NOT summed into `total_running`/`total_pending`. The direct
probe failed, so neither work availability nor task data is proven.

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
  `peer_last_seen()`), and `tally_fleet()` (direct/healthy nodes count online;
  relay-display peers remain visible but are excluded from online/task totals,
  unit-tested). `FleetNodeStatus` gains `reachable_via: Option<String>`
  (`#[serde(skip_serializing_if)]`).
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

Web-surface reconnect completion (WS-A, 2026-06-24):

- The web side now derives the three-state from a single shared module
  `musu-bee/src/lib/fleetState.ts` (`FleetNodeStatus`/`FleetDashboard`/`NodeState`
  + `nodeState()`/`stateLabel()`), imported by BOTH `app/fleet/page.tsx` and
  `app/m/[id]/page.tsx`. The two web pages can no longer drift from each other.
- `app/m/[id]/page.tsx` was also on the phantom shape (`GET /api/machines/{id}` +
  dead `/api/watch/subscribe?table=machines|resource_requests` SSE). Repointed to
  `GET /api/fleet/status` filtered by node **name** (FleetNodeStatus has no `id`
  field — it is keyed by `name`; fleet cards link `/m/${node.name}`). GPU/capacity
  bars + active-requests dropped (FleetNodeStatus carries none).
- AddPcWizard (in `app/fleet/page.tsx`) was hitting `${BRIDGE_URL}/api/agents` and
  `${BRIDGE_URL}/api/admin/pair/accept` (neither served by musu-rs). Repointed to
  the relative Next proxy routes `/api/agents` and `/api/nodes/pair` (the latter
  forwards to bridge `/api/nodes/add`; the wizard's name+url+agents IS node-add).
- The `runtime-polling-contract` test was loosened to allow polling-only axis
  pages (no SSE at all is the strongest form of "no unbounded browser auto-retry").
- The `design-gate` dropped its dead Paperclip dependency; the design-brief issue
  URL check now accepts musu's own trackers (musu-system / musu-brain /
  musu-website-co), including plain numeric GitHub `/issues/<n>`.

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

Relay-display state checks (F-3/V33, corrected 2026-06-26):

- `relay_verdict()` unit tests: fresh `last_seen` (≤300s) → `reachable_via=relay`
  with `healthy=false`; stale `last_seen` (>300s) → offline; no `last_seen` →
  offline (the pre-F-3 "does not fabricate online" regression test stays green).
- `tally_fleet()` test asserts a relay-display peer does **not** increment
  `online_nodes`, and its task counts are excluded from
  `total_running`/`total_pending`.
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

Additional rc.21 stale-registry audit hotfix checks (2026-06-26):

- Server registry write/list path rejects or hides non-remote-usable
  `public_url` values; resolver/cache also excludes legacy remote loopback rows.
- 2026-06-27 follow-up: the same remote-usable rule now covers IPv4-mapped
  loopback/wildcard forms in TS registry, Rust resolver/cache, `musu doctor` /
  `musu nodes` warning helpers, and `verify-fleet-audit-contract.ps1`.
- `cargo test --manifest-path musu-rs\Cargo.toml --jobs 1 --lib
  cloud::tests::delete_registry_node_by_name_treats_json_404_as_absent` passed,
  proving the cleanup CLI path treats JSON 404 as idempotent absent.
- `verify-fleet-audit-contract.ps1 -AllowRemoteRegistryWarnings -Json` passed on
  `hugh_second` with exactly one external warning: live `hugh-main` still
  advertises `http://127.0.0.1:13397`.
- Strict verifier remains intentionally blocked until `hugh-main` republishes a
  non-loopback URL or the production cleanup route removes the stale row.
