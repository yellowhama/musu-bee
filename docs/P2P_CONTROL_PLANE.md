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

## Current gate status

As of the 2026-06-05 00:19 KST post relay-connect-auth evidence refresh, the
product direction above is documented but not yet release-complete.

Passing local state:

- local MSIX install and single-machine smoke pass on `HUGH_SECOND` for commit
  `68cc6f27407c68f1e0aac6615e21f86d19495568`
- local runtime idle CPU and CPU matrix evidence are valid on one machine:
  `20260605-000707-HUGH_SECOND.desktop-open` and
  `20260605-000820-HUGH_SECOND.runtime-cpu-scenario-matrix`
- Rust background-loop, frontend polling, process ownership, local API auth,
  operator API security, and secret storage audits pass
- `/api/v1/relay/connect` is auth-gated and still fail-closed while the relay
  transport remains unwired
- `POST /api/rooms/[roomId]/work-orders` is P2P-control-auth gated before
  MUSU.PRO room input can reach the local bridge

Open external gates:

- second-PC current-build install, route, CPU, and matrix evidence is missing
- hosted P2P KV/Upstash storage is not configured
- relay payload endpoint and relay transport are not wired as release-grade
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
