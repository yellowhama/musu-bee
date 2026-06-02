# Network Boundary Spec

## Purpose

Define the technical and product boundary between:
- free local access
- paid remote access

This boundary must be simple enough to explain in one sentence:

**Access inside the user's own trusted network is free.  
Access from outside that network is paid.**

## Free boundary

The following are part of MUSU Core:
- `localhost`
- loopback access (`127.0.0.1`, `::1`)
- private LAN access (`192.168.x.x`, `10.x.x.x`, `172.16-31.x.x`)
- user-managed internal network access
- user-managed same-site device access

Allowed free interfaces:
- CLI
- MCP
- local web UI
- LAN web UI

## Paid boundary

The following are part of MUSU Connect:
- access over the public internet
- relay-based access
- tunnel-mediated access operated by MUSU
- account-authenticated external browser access
- remote session resume from outside the trusted network
- remote notifications and remote status access tied to MUSU-hosted services

## Technical interpretation

### Core (free)

Core can expose:
- local HTTP server
- LAN-reachable web UI
- local device discovery
- local device orchestration

Core does not require:
- MUSU relay
- MUSU account identity
- MUSU-hosted remote tunnel

### Connect (paid)

Connect adds:
- secure relay / tunnel
- hosted auth and device identity binding
- remote access policy enforcement
- audit trail for external access

## 2026-05-31 relay/control-plane update

The first public multi-device path should not rely only on manual LAN
`host:port` entry. `musu.pro` should provide the assisted path:

- account-scoped node registry
- low-duty rendezvous/control channel
- direct LAN/Tailscale path selection
- relay/tunnel fallback when direct private routing fails
- route evidence that records whether the path was `lan`, `tailscale`, or `relay`

This does not change the product boundary:

- direct localhost/LAN/private-network operation remains MUSU Core
- MUSU-hosted relay/tunnel operation remains MUSU Connect
- Store copy must not imply that direct P2P works through every NAT until the relay/tunnel fallback has evidence

Implementation detail is now tracked in
`docs/MUSU_PRO_P2P_CONTROL_PLANE_SPEC_2026_05_31.md` (wiki/524). That spec
locks the route kinds (`lan`, `tailscale`, `direct_quic`, `relay`, `failed`),
rendezvous API shape, and route evidence fields required before public
multi-device claims.

## 2026-06-02 deployment boundary update

The public `musu.pro` website and the `musu.pro` P2P control plane are
separate release surfaces.

- The website scroll/logo/emerald accent fix is production-deployed and
  verified on `https://musu.pro`.
- The P2P control-plane release gate remains blocked until production scoped
  relay auth is configured, deployed/reloaded, and verified with owner-scoped
  lease evidence.
- Store and public copy may mention `musu.pro` account-assisted setup only as a
  beta/control-plane feature until release-grade two-machine route evidence
  proves the data path and encryption claims.

## 2026-06-02 on-demand relay boundary update

The dashboard cloud relay path is now an explicit action path, not an idle page
load path.

- Opening the dashboard must not fetch a relay token by default.
- Selecting a node must not automatically open a relay WebSocket.
- User-initiated `Connect` may request relay/control-plane help with bounded
  timeout and reconnect behavior.

This preserves the Core/Connect product boundary:

- local/LAN/private operation remains Core
- account-assisted rendezvous and relay/tunnel remain Connect/control-plane
- public claims about internet P2P must wait for release-grade route evidence
  and live `musu.pro` owner-scoped control-plane evidence

## 2026-06-02 reconnect duty-cycle update

When an explicit relay or task event connection fails, MUSU must use bounded
retry behavior instead of fixed-delay indefinite reconnect loops.

- dashboard relay WebSocket reconnect is capped at five attempts and backs off
  from `5s` to a `60s` maximum
- chat task SSE reconnect starts at `1s`, doubles, and caps at `10s`
- pending reconnect timers must be cleared on disconnect, route/node changes,
  channel changes, and unmount
- duplicate `EventSource.CONNECTING` attempts must be suppressed
- stale timers must not reconnect after a UI lifecycle change

This is part of the desktop idle-resource contract. It does not change the
Core/Connect product boundary, and it does not replace installed MSIX CPU
evidence.

## Product copy rule

Do not describe this as "blocking remote access."
Describe it as:
- secure remote access
- remote operating mode
- internet access to your MUSU workspace
- MUSU Connect

## Non-goals

This spec does not define:
- exact relay implementation
- pricing
- pack format

Those belong in separate docs.

