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

- `POST /api/v1/p2p/rendezvous` **(short-lived session stub exists as of 2026-06-01)**
- `GET /api/v1/p2p/rendezvous/:id` **(stub exists as of 2026-06-01)**
- `POST /api/v1/p2p/rendezvous/:id/candidates` **(candidate exchange stub exists as of 2026-06-01)**
- `POST /api/v1/p2p/rendezvous/:id/approve` **(stub exists as of 2026-06-01)**
- `POST /api/v1/p2p/rendezvous/:id/close` **(stub exists as of 2026-06-01)**
- `POST /api/v1/p2p/route-evidence` **(stub exists as of 2026-06-01)**
- `GET /api/v1/p2p/route-evidence` **(stored evidence query exists as of 2026-06-01)**
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

Current rendezvous API behavior:

- `POST /api/v1/p2p/rendezvous` creates a short-lived session with source and
  target candidate sets initialized empty. This matches the current Rust client
  DTO even before the registry can hydrate full node metadata.
- `POST /api/v1/p2p/rendezvous/:id/candidates` lets either source or target
  update its endpoint candidates, relay capability, public key, and capability
  list.
- `POST /api/v1/p2p/rendezvous/:id/approve` marks the session approved and
  clears `approval_required`.
- `POST /api/v1/p2p/rendezvous/:id/close` marks the session closed.
- Hosted storage uses Vercel KV per-session keys. Local/dev can use
  `MUSU_P2P_RENDEZVOUS_STORE_PATH`. Production fails closed without KV unless
  an explicit persistent file path is configured.
- The current implementation is a coordination contract, not yet bridge-wired
  path selection. The bridge still reports `rendezvous_session_wired=false`
  until runtime route attempts create and use these sessions.

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

Current `POST /api/v1/p2p/route-evidence` behavior:

- Requires Bearer auth using server env `MUSU_P2P_CONTROL_TOKEN`,
  `MUSU_ROUTE_EVIDENCE_TOKEN`, or `MUSU_TOKEN`.
- Validates `musu.route_evidence.v1` with the route kinds above.
- Stores valid evidence and returns `202`, including `stored=true`,
  `evidence_id`, `release_grade`, and `blockers`.
- Accepts legacy/debug evidence for observability but marks it non-release-grade
  when identity, encryption, timing, result, or relay-transit truth is weak.
- Hosted storage uses Vercel KV/Upstash Redis (`KV_REST_API_URL` and
  `KV_REST_API_TOKEN`) as a capped list. Local/dev can use
  `MUSU_ROUTE_EVIDENCE_STORE_PATH`.
- Production fails closed without KV unless `MUSU_ROUTE_EVIDENCE_STORE_PATH`
  points to an explicit persistent file path.

Current `GET /api/v1/p2p/route-evidence` behavior:

- Requires the same Bearer auth.
- Returns stored evidence records with `limit`, `source_node_id`,
  `target_node_id`, `route_kind`, `result`, and `release_grade` filters.
- This is an API audit surface only; account-scoped UI, export, and retention
  policy remain pending.

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
   **Rendezvous and route-evidence stubs partially done on 2026-06-01.**
   `musu-bee/src/app/api/v1/p2p/rendezvous/*` now creates, reads, updates
   candidate sets, approves, and closes short-lived sessions. `musu-bee/src/app/api/v1/p2p/route-evidence/route.ts`
   accepts, validates, stores, and queries authenticated evidence; tests live
   next to the routes. Bridge runtime use of rendezvous sessions,
   account-scoped evidence ownership, UI/export, and retention policy remain
   pending.
4. Add `musu relay status` and `musu route --explain`.
   **Initial diagnostic CLI done on 2026-06-01.** `musu relay status` reports
   login/cache/client readiness plus bridge path selection state, rendezvous
   session state, and relay transport state. `musu route --explain` reports the
   selected candidate, current `http_bearer` transport, route-kind
   classification, and release-evidence blockers without executing a task.
   `musu route --route-evidence-path <path>` now writes
   `musu.route_evidence.v1` from the actual CLI route attempt, including
   candidate address, route kind, submit/handshake timing, total attempt timing,
   and success/failure result. This is still not final release-grade evidence
   because current transport remains legacy HTTP bearer with
   `peer_identity_verified=false` and `encryption=none_http_bearer`.
   The route evidence builder/writer now lives in shared
   `musu-rs/src/bridge/route_evidence.rs`, and bridge runtime forwarding from
   `/api/tasks/delegate`, `/api/companies/{id}/run`, and workflow remote steps
   writes local `~/.musu/route-evidence/<task_id>.route-evidence.json` files
   from the actual forwarding attempt. Runtime forwarding now best-effort
   submits that evidence to `musu.pro` after the local write when an account
   token exists. Release-grade identity/encryption proof remains pending.
5. Add direct path selection against registered LAN/Tailscale endpoints.
   **Initial client-side selector done on 2026-06-01.** `musu-rs/src/bridge/router.rs`
   now classifies candidate addresses as `local`, `lan`, `tailscale`, or
   `direct_quic`, ranks remote candidates by LAN -> Tailscale -> direct public
   endpoint, preserves circuit-breaker filtering, and uses the same selector
   for explicit target, GPU, and OS-hint routing. `musu route --explain` and
   `musu relay status` now report `bridge_path_selection_wired=true`. This does
   not create rendezvous sessions from bridge runtime route attempts yet.
6. Add relay/tunnel transport only after direct path evidence is stable.
   **Pending as of 2026-06-01.** Relay must remain an explicit route kind, not
   a silent default payload path.
