# MUSU Pro P2P Control-Plane Spec

**Wiki ID**: wiki/524
**Date**: 2026-05-31
**Status**: Draft implementation spec for the next runtime stabilization sprint.

## Product Decision

`musu.pro` must not replace P2P as the default data path. It must make P2P
reliable by acting as the account-scoped control plane:

1. Registry: which devices exist and what endpoints they can expose.
2. Rendezvous: which two devices are trying to connect right now.
3. Path selection: which candidate route should be tried first.
4. Relay/tunnel fallback: what to use when direct routes fail.
5. Evidence: what route actually carried the task.

The default promise remains:

- Core: localhost, LAN, and user-managed private network paths.
- Connect/Pro: MUSU-hosted relay/tunnel and external access.

## Route Kinds

Every multi-device route attempt must end with one of these values:

| `route_kind` | Meaning | Product tier |
|---|---|---|
| `lan` | Direct RFC1918/private LAN address. | Core |
| `tailscale` | User-managed overlay/private network address. | Core |
| `direct_quic` | Direct encrypted QUIC to a public or NAT-punched endpoint. | Core if user-managed, Connect if MUSU-assisted beyond rendezvous |
| `relay` | Payload transits MUSU-hosted relay/tunnel infrastructure. | Connect/Pro |
| `failed` | No route succeeded. | N/A |

## Control-Plane APIs

Existing API:

- `POST /api/v1/nodes/register`
- `GET /api/v1/nodes`

Required next APIs:

- `POST /api/v1/p2p/rendezvous`
- `GET /api/v1/p2p/rendezvous/:id`
- `POST /api/v1/p2p/rendezvous/:id/candidates`
- `POST /api/v1/p2p/rendezvous/:id/approve`
- `POST /api/v1/p2p/rendezvous/:id/close`
- `POST /api/v1/p2p/route-evidence`
- `WS /api/v1/p2p/control?node_id=...`
- `WS /api/v1/relay/connect?session_id=...&node_id=...`

## Candidate Endpoint Shape

```json
{
  "node_id": "node_abc",
  "node_name": "HUGH-MAIN",
  "app_version": "1.15.0-rc.1",
  "candidate_endpoints": [
    {
      "kind": "lan",
      "addr": "192.168.1.192:8949",
      "observed_at": "2026-05-31T09:00:00Z"
    },
    {
      "kind": "tailscale",
      "addr": "100.64.0.10:8949",
      "observed_at": "2026-05-31T09:00:00Z"
    }
  ],
  "relay_capable": true,
  "public_key": "base64-ed25519-or-x25519-key",
  "capabilities": ["remote_command", "files", "telemetry"]
}
```

## Rendezvous Flow

1. Both nodes log in and register candidate endpoints.
2. Source node requests rendezvous with target node.
3. `musu.pro` returns a short-lived session id and both nodes' endpoint
   candidates.
4. Source tries routes in order:
   - LAN direct
   - Tailscale/private overlay
   - direct QUIC
   - relay fallback
5. Target must approve the session unless policy already permits it.
6. Source writes route evidence after success or final failure.

## Client Path Selection Rules

The client must not spin or retry forever.

- Per candidate timeout: 3s default, max 10s.
- Per route attempt budget: 30s default.
- Retry policy: exponential backoff with jitter after full attempt failure.
- Offline behavior: stop active retry loop and wait for app foreground,
  network transition, or user action.
- No relay auto-upgrade without user/account policy permitting Connect/Pro.

## Route Evidence Shape

```json
{
  "schema": "musu.route_evidence.v1",
  "version": "1.15.0-rc.1",
  "source_node_id": "node_src",
  "target_node_id": "node_dst",
  "session_id": "rv_123",
  "route_kind": "lan",
  "candidate_addr": "192.168.1.192:8949",
  "handshake_ms": 42,
  "total_attempt_ms": 611,
  "peer_identity_verified": true,
  "encryption": "quic_tls_1_3",
  "payload_transited_musu_infra": false,
  "result": "success",
  "failure_class": null,
  "recorded_at": "2026-05-31T09:01:00Z"
}
```

Release gates must reject multi-device evidence that lacks:

- `route_kind`
- peer identity verification result
- handshake timing
- encryption field
- whether payload transited MUSU infrastructure

## Runtime Hardening Requirements

- One logged-in control connection per runtime process.
- Control connection uses backoff and jitter.
- Registry refresh interval defaults to 300s with a 60s floor.
- Relay sessions are short-lived and explicit.
- Remote command execution must stay allowlisted and audited.
- `musu doctor --json` must show:
  - cloud login state
  - registry freshness
  - direct route availability
  - relay configured/available/disabled
  - last route kind and failure class

## Next Implementation Order

1. Extend route evidence verifier to require `route_kind`. **Done in the release
   verifier: multi-device evidence now requires `musu.route_evidence.v1` with
   route kind, timing, peer identity, encryption, and payload transit truth.**
2. Add client DTOs for rendezvous sessions and route evidence. **Initial Rust
   DTOs and client methods exist in `musu-rs/src/cloud/mod.rs`.**
3. Add server-side mock/stub endpoints in `musu.pro` path for local tests.
   **Pending as of 2026-06-01.** The Rust client has method surfaces, but no
   local/server stub proof is recorded.
4. Add `musu relay status` and `musu route --explain`.
   **Initial diagnostic CLI done on 2026-06-01.** `musu relay status` reports
   login/cache/client readiness plus bridge path selection state, rendezvous
   session state, and relay transport state. `musu route --explain` reports the selected
   candidate, current `http_bearer` transport, route-kind classification, and
   release-evidence blockers without executing a task. This is not the final
   release-grade route evidence.
5. Add direct path selection against registered LAN/Tailscale endpoints.
   **Initial client-side selector done on 2026-06-01.** `musu-rs/src/bridge/router.rs`
   now classifies candidate addresses as `local`, `lan`, `tailscale`, or
   `direct_quic`, ranks remote candidates by LAN -> Tailscale -> direct public
   endpoint, preserves circuit-breaker filtering, and uses the same selector
   for explicit target, GPU, and OS-hint routing. `musu route --explain` and
   `musu relay status` now report `bridge_path_selection_wired=true`. This does
   not create rendezvous sessions or submit hardened route evidence yet.
6. Add relay/tunnel transport only after direct path evidence is stable.
   **Pending as of 2026-06-01.** Relay must remain an explicit route kind, not
   a silent default payload path.
