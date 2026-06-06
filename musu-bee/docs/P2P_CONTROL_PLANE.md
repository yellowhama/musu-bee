# MUSU P2P Control Plane

## Product split

MUSU has two separate surfaces.

- **Local MUSU program**: runs the agent runtime, accesses local files and processes, opens local browser/app automation, joins the peer mesh, and performs the actual work.
- **musu.pro**: accepts user work orders, shows device/session state, coordinates rendezvous, records route evidence, and issues relay fallback only after direct paths fail.

`musu.pro` must not become the default execution server or the default data path. A web request can create a work order or rendezvous session, but the local MUSU programs execute the work and exchange payloads peer-to-peer whenever a direct path is available.

## Local dashboard vs web control plane

`localhost` and `127.0.0.1` always refer to the current machine. A dashboard at
`http://127.0.0.1:3001/app` is therefore a local operator/developer surface,
not a remote cloud dashboard. It only works while that machine's local MUSU
runtime and dashboard are running.

The intended remote UX is `musu.pro`: the user can enter a work order, approve
actions, inspect project state, and start a connection from another location.
The target device still needs an installed local MUSU program. That local
program keeps an authenticated outbound control connection to `musu.pro`,
receives the web work order, and performs the work locally.

This is the Codex/GitHub-style product shape: the cloud service owns identity,
project/repository context, work orders, presence, and coordination. The local
program owns execution, local files, local app/browser/shell automation, and
machine-to-machine transport.

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

## Roadmap

1. **Single-machine local runtime proof**
   - Keep the installed desktop program useful without a web dashboard.
   - Treat `http://127.0.0.1:3001/app` as an optional developer dashboard, not as the product runtime.
   - Prove idle CPU/resource behavior while the local bridge waits for work.
2. **Web-to-local work orders**
   - `musu.pro` accepts user input and sends work orders to the selected installed device through an authenticated outbound control connection.
   - The local program executes the work locally and reports status/evidence back to the web control plane.
3. **Rendezvous and path selection**
   - Devices publish LAN, Tailscale/overlay, direct QUIC, and relay fallback candidates.
   - Candidate metadata must be sufficient for path selection, including public/NAT details for direct QUIC and relay URL/protocol details for relay fallback.
   - The first successful direct path becomes the peer route; `musu.pro` does not carry payloads on that path.
4. **Project rooms**
   - `musu.pro` groups local agents by project/repository, exposes presence and discussion, and records decisions, handoffs, and audit history.
   - Agents in the room can coordinate with each other, but execution still happens inside each installed local program.
5. **Multi-device release proof**
   - Install the same MUSU build on a second Windows PC.
   - Prove web work-order delivery, rendezvous, P2P route establishment, route evidence, and idle resource budget across both devices.

## API contract

The rendezvous API returns `path_selection_order` so clients do not invent their own route priority:

```json
["lan", "tailscale", "direct_quic", "relay"]
```

Relay is a fallback, not the default path. Relay lease requests must prove that a direct path was attempted and failed. Release-grade route evidence must show:

- `route_kind`: `lan`, `tailscale`, `direct_quic`, or `relay`
- direct route `candidate_addr` must classify consistently with `route_kind`: loopback/private/link-local maps to `lan`, `100.64.0.0/10` maps to `tailscale`, and public IPs or hostnames map to `direct_quic`
- relay fallback `attempted_route_kinds` contains only direct route kinds and preserves path priority order: `lan`, then `tailscale`, then `direct_quic`
- `peer_identity_verified: true`
- `encryption: "quic_tls_1_3"`
- `transport_verified_by: "musu_quic_tls_transport"`
- `payload_transited_musu_infra: false` for direct routes
- stored relay lease and transport proof for relay routes

## Release implication

The release gate is not satisfied by a web dashboard that can call a local bridge. The gate is satisfied only when the installed local programs can:

- receive a work order through the web control plane,
- establish or reuse a P2P route using the documented order,
- fall back to relay only after direct failure,
- record release-grade route evidence, and
- remain inside the idle CPU/resource budget while waiting for work.

Current validation can progress on one machine for local runtime, dashboard URL
discovery, idle CPU, and control-plane contract checks. Multi-device route proof
cannot be completed until the same current MUSU build is installed and run on a
second Windows PC.

2026-06-06 current external gate snapshot: clean HEAD
`0ba26d6d27a23a213240962517079d5fd817c7e8` verifies public metadata on
`https://musu.pro`, but hosted P2P evidence `20260606-151527-musu.pro` remains
`ok=false` with `fail_count=42`, logged-in runtime evidence false, owner scope
false, relay route evidence count `0`, relay route transport proof valid count
`0`, and relay payload delivery proof valid count `0`. This is still external
machine/account/infrastructure work; execution remains local in MUSU Desktop.

2026-06-06 relay tunnel runtime source gate: release relay readiness now also
requires `RELAY_TUNNEL_RUNTIME_IMPLEMENTED=true`. Current source keeps it
`false`, and status surfaces report `relay_tunnel_runtime_implemented=false` so
policy constants or env flags cannot fake a release tunnel without actual local
payload transit and `quic_tls_1_3` transport proof.
