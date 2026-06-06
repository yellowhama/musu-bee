# MUSU P2P Control Plane

## Product split

MUSU has two separate surfaces.

- **Local MUSU program**: runs the agent runtime, accesses local files and processes, opens local browser/app automation, joins the peer mesh, and performs the actual work.
- **musu.pro**: accepts user work orders, shows device/session state, coordinates rendezvous, records route evidence, and issues relay fallback only after direct paths fail.

`musu.pro` must not become the default execution server or the default data path. A web request can create a work order or rendezvous session, but the local MUSU programs execute the work and exchange payloads peer-to-peer whenever a direct path is available.

## Connection flow

1. A user enters a work order on `musu.pro`.
2. The target local MUSU program keeps an authenticated outbound control connection to `musu.pro`.
3. `musu.pro` creates a rendezvous session for the source and target nodes.
4. Each node uploads candidate endpoints: LAN, Tailscale or overlay, public/direct QUIC, and relay capability.
5. The nodes attempt paths in this order:
   - `lan`
   - `tailscale`
   - `direct_quic`
   - `relay`
6. After a direct path succeeds, the two local MUSU programs communicate over the P2P mesh.
7. If every direct path fails, a Connect/Pro relay lease may be issued as fallback.
8. The local program records route evidence with route kind, latency, peer identity proof, encryption proof, and whether any payload transited MUSU infrastructure.

## Project rooms

`musu.pro` can also host project rooms, similar to a company meeting room for the local MUSU agents attached to the same project.

The room is a shared coordination surface:

- user work orders and approvals,
- agent presence and current assignment,
- discussion threads between local agents,
- decisions, task handoffs, and meeting notes,
- transcript and audit history, and
- route/session status for the devices doing the work.

The room does not execute the work itself. When an agent in the room accepts a task, the matching local MUSU program performs the work on its own machine or coordinates with peers through the P2P mesh. Large payloads, file access, shell commands, browser automation, and local app control stay on the local programs unless a relay fallback is explicitly issued and recorded.

## API contract

The rendezvous API returns `path_selection_order` so clients do not invent their own route priority:

```json
["lan", "tailscale", "direct_quic", "relay"]
```

Relay is a fallback, not the default path. Relay lease requests must prove that a direct path was attempted and failed. Release-grade route evidence must show:

- `route_kind`: `lan`, `tailscale`, `direct_quic`, or `relay`
- `peer_identity_verified: true`
- `encryption: "quic_tls_1_3"`
- `transport_verified_by: "musu_quic_tls_transport"`
- `payload_transited_musu_infra: false` for direct routes
- stored relay lease and transport proof for relay routes
- relay transport proof source and target node ids matching the route evidence
  source and target node ids
- relay payload delivery proof for relay routes that claim payload transit

## Current gate status

As of the 2026-06-06 current HEAD runtime CPU matrix refresh, the product
direction above is still unchanged: MUSU Desktop is the local executor, while
`musu.pro` is remote input, project/company room, presence, rendezvous,
path-selection, relay fallback policy, and evidence control plane. The
lease-bound queue fallback source contract is gated, room
presence/rendezvous candidate metadata is preserved, room control-plane inputs
are strict metadata-only, and release relay route queries reject transport
proof that is not bound to the same source/target peer pair. Public P2P
release is still not release-complete.

Passing local state:

- current source contract audit on commit `7ad2e6eb` plus this verifier-only
  change reports
  `local_artifacts_ready=true`, `single_machine_verified=true`,
  runtime idle CPU valid machine count `1/2`, runtime CPU matrix valid machine
  count `1/2`, `p2p_store_forward_relay_contract_verified=true`,
  `idle_busy_loop_candidate_contract_verified=true`, idle candidate count `8`,
  failed idle candidate count `0`, and public release
  `ready_for_public_desktop_release=false`
- current clean full runtime CPU matrix evidence
  `20260606-094149-HUGH_SECOND.runtime-cpu-scenario-matrix.json` verifies
  `startup-open`, `runtime-started`, `dashboard-open`, `desktop-open`, and
  `post-route` on commit `ac1e67a4dd8f610a6f09ff61d3107f556e2ac5e5` with
  `git_dirty=false`, hot process count `0` in every scenario, MUSU CPU `0`,
  Node CPU `0`, max WebView2 CPU `0.16`, owned process count `8`, WebView2
  helper count `6`, and working set around `364MB`
- current HUGH-MAIN target-route CPU diagnostic
  `20260606-095252-HUGH_SECOND.runtime-cpu-scenario-matrix.json` verifies an
  explicitly allowed failed route attempt to
  `http://192.168.1.192:8949/api/tasks/delegate`; it is diagnostic only and
  does not count as successful multi-device route proof
- `dashboard-open` matrix evidence measured packaged runtime state because no
  required dashboard URL was exposed; `localhost:3001` is an optional workspace
  dashboard, not the installed local program
- Rust background-loop, frontend polling, process ownership, local API auth,
  operator API security, and secret storage audits pass
- `test-release-evidence-verifiers.ps1` now locks the eight idle busy-loop
  candidates exposed by go/no-go: clipboard polling, mDNS discovery, health
  check retry, bridge readiness wait, frontend interval/refetch, relay payload
  target polling, cloud heartbeat, and log/telemetry flush
- `/api/v1/relay/connect` is auth-gated and still fail-closed while the relay
  transport remains unwired
- `POST /api/rooms/[roomId]/work-orders` is P2P-control-auth gated before
  MUSU.PRO room input can reach the local bridge
- `audit-p2p-store-forward-relay-contract.ps1` passes with `ok=true`,
  proving the preview store-forward queue fallback is owner/lease scoped,
  non-default, non-release-grade, and separated from release tunnel transport
- release-grade relay route queries revalidate fallback, transport proof,
  payload delivery proof, the release relay transport proof kind
  `quic_relay_tunnel`, and now bind relay transport proof to the fallback
  lease/session plus route source/target peer pair before returning stored
  `release_grade=true` relay records
- hosted P2P evidence verification now rejects relay descriptors whose
  `relay_transport_kind` is only `websocket_tunnel` or another preview/queue
  transport; the release relay descriptor kind must match
  `quic_relay_tunnel`, while release encryption/proof must remain
  `quic_tls_1_3`
- direct route evidence now cross-checks `route_kind` against
  `candidate_addr`; loopback/private/link-local addresses must be `lan`,
  `100.64.0.0/10` addresses must be `tailscale`, and public IPs/hostnames
  classify as `direct_quic`
- `musu.pro` room presence and rendezvous candidate exchange now preserve
  `public_addr`, `nat_type`, `nat_observed_by`, `relay_url`, and
  `relay_protocol` so local programs can use web-assisted discovery for better
  P2P path selection without making the web server the data path
- `musu room presence publish` can now advertise extra `--candidate-url`
  values, `--nat-type`, `--nat-observed-by`, `--relay-url`, and
  `--relay-protocol`, so each local program can publish the same public/NAT
  and relay fallback descriptors that `musu.pro` preserves
- Rust rendezvous path selection now uses a direct candidate's `public_addr`
  as the selected direct endpoint when present, preserves the original
  candidate `addr`, NAT type/observer, and selected address source in
  `ResolvedPeer.meta`, and carries relay descriptors as fallback metadata
  without making relay the default data path
- `show-musu-pro-p2p-env-status.ps1` reports
  `source.relay_payload_queue_fallback_implemented=true`
Open external gates:

- second-PC current-build install, route, CPU, and matrix evidence is missing
- hosted P2P evidence currently fails because the packaged runtime is not
  logged in to production P2P evidence paths
- hosted owner scope is not verified
- hosted P2P KV/Upstash storage is not configured or release-grade
- release relay connect/payload tunnel endpoints and release relay transport
  are not wired as release-grade
- current hosted relay transport descriptor still reports `websocket_tunnel`,
  which is intentionally rejected by the release verifier
- owner-scoped relay route evidence count is `0`
- relay payload transport proof is `false`
- relay payload delivery proof valid count is `0`

This means current validation is still a one-machine test. Installing this
work-in-progress build on another computer is required before multi-device work
can be proven. The release gate closes only after the same current MUSU build is
installed on a second Windows PC and after `musu.pro` records owner-scoped
release-grade route/relay evidence.

## Release implication

The release gate is not satisfied by a web dashboard that can call a local bridge. The gate is satisfied only when the installed local programs can:

- receive a work order through the web control plane,
- establish or reuse a P2P route using the documented order,
- fall back to relay only after direct failure,
- record release-grade route evidence, and
- remain inside the idle CPU/resource budget while waiting for work.
