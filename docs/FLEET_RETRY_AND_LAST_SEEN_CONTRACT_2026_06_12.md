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

- `Targetable` means the peer is currently online and selectable for delegated
  work.
- `Stale` means the peer is currently offline but has evidence-backed
  `last_seen`.
- `Offline` means the peer is currently offline regardless of whether the UI has
  a last-seen label; if no evidence exists, it renders as plain `offline`.

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
