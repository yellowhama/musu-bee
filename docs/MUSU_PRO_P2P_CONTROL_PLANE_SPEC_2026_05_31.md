# MUSU Pro P2P Control-Plane Spec

**Wiki ID**: wiki/524
**Date**: 2026-05-31
**Status**: Current implementation spec. Server-side rendezvous, route-evidence, and relay fallback lease APIs exist. Rust bridge runtime route attempts now create short-lived rendezvous sessions, seed sessions from recent node candidate cache, can use returned target candidates before legacy direct forwarding, exchange advertised TLS certificate fingerprints as peer identity material, verify HTTPS peer certificate fingerprints during bridge forwarding when a target candidate supplies a `sha256:<hex>` fingerprint, request a fail-closed relay lease after terminal direct-route failure when a rendezvous session and account token exist, persist the relay fallback evaluation inside failed route evidence, expose `musu relay leases --json` for relay lease audit queries, and accept either a raw static control token or SHA-256 runtime-token allowlist for P2P control auth. This is still not final release-grade transport because the accepted release proof remains QUIC/TLS evidence, not bridge HTTP multipart over TLS, relay/tunnel data transport is still not wired, and live `https://musu.pro` still needs the production `MUSU_P2P_CONTROL_TOKEN_SHA256S`/equivalent env configured before relay lease queries can pass.

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

P2P APIs:

- `POST /api/v1/p2p/rendezvous` **(short-lived session API exists as of 2026-06-01; Rust bridge source route attempts now call it)**
- `GET /api/v1/p2p/rendezvous/:id` **(exists as of 2026-06-01; Rust bridge refreshes after source candidate publish)**
- `POST /api/v1/p2p/rendezvous/:id/candidates` **(candidate exchange API exists as of 2026-06-01; source publishes before forwarding, target publishes on received forwarded task)**
- `POST /api/v1/p2p/rendezvous/:id/approve` **(exists as of 2026-06-01)**
- `POST /api/v1/p2p/rendezvous/:id/close` **(exists as of 2026-06-01; Rust bridge closes after terminal forward success/failure)**
- `POST /api/v1/p2p/route-evidence` **(stub exists as of 2026-06-01)**
- `GET /api/v1/p2p/route-evidence` **(stored evidence query exists as of 2026-06-01)**
- `POST /api/v1/p2p/relay/lease` **(fallback lease policy API exists as of 2026-06-01; default fail-closed)**
- `GET /api/v1/p2p/relay/lease` **(owner-scoped relay lease audit query exists as of 2026-06-01)**
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
      "scheme": "https",
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
  target candidate sets seeded from recent node candidate cache when available;
  otherwise each side starts empty.
- `POST /api/v1/p2p/rendezvous/:id/candidates` lets either source or target
  update its endpoint candidates, relay capability, public key, and capability
  list. Candidate updates also refresh a short-lived node candidate cache
  (`candidates_by_node` for local/dev file storage, KV candidate keys in hosted
  storage).
- Rust candidates now set `public_key` to the local TLS certificate SHA-256
  fingerprint when `~/.musu/tls/cert.pem` or `MUSU_TLS_CERT` is available.
  Candidate endpoints also preserve their advertised `scheme` (`http` or
  `https`). Advertised identity material alone is not considered verified; an
  HTTPS bridge forward is marked verified only after the TLS server leaf
  certificate hash matches the advertised fingerprint during the actual POST.
- New sessions are seeded from that recent node candidate cache before they are
  returned, so a target that previously published LAN/Tailscale/direct
  candidates can influence the next route attempt without waiting for payload
  delivery on that same attempt.
- `POST /api/v1/p2p/rendezvous/:id/approve` marks the session approved and
  clears `approval_required`.
- `POST /api/v1/p2p/rendezvous/:id/close` marks the session closed.
- Hosted storage uses Vercel KV per-session keys. Local/dev can use
  `MUSU_P2P_RENDEZVOUS_STORE_PATH`. Production fails closed without KV unless
  an explicit persistent file path is configured.
- Rust bridge runtime route attempts now create a session, publish the source
  node's current advertised bridge endpoint, attach `session_id` to the
  forwarded task, let the receiving target publish its local candidate set, and
  close the session after terminal forward success/failure.
- If the refreshed session already contains target candidate endpoints, the
  bridge picks the best non-relay endpoint using the same LAN -> Tailscale ->
  direct-public priority and forwards to that selected candidate instead of the
  original cached/manual peer address. If that candidate is stale or fails
  after retries, the bridge falls back once to the original selected peer
  address so the control-plane hint does not make an otherwise valid direct
  route less reliable.
- Runtime control-plane calls are bounded by
  `MUSU_P2P_RENDEZVOUS_CLIENT_TIMEOUT_MS` (`3000` default, clamped
  `250..10000`) and fall back to the selected direct peer path on timeout or
  cloud failure.
- The current implementation is still not release-grade routing: legacy HTTP
  bearer remains the default/debug transport, target-side candidate publish is
  best-effort, HTTPS fingerprint pinning is only a bridge HTTP-over-TLS proof,
  QUIC/TLS release proof is not wired, and relay/tunnel fallback remains
  pending.

Current route-evidence identity fields:

- `peer_identity_verified`: `false` for legacy HTTP bearer forwarding; `true`
  only for a successful HTTPS bridge forward whose server certificate
  fingerprint matched the advertised `sha256:<hex>` value.
- `peer_identity_method`: optional; currently records
  `advertised_tls_cert_fingerprint_unverified` when a target candidate supplied
  a TLS certificate fingerprint, or `tls_cert_fingerprint_pin` when the actual
  HTTPS connection matched that fingerprint.
- `peer_public_key`: optional; currently the advertised certificate fingerprint
  such as `sha256:<hex>`.
- `encryption`: `none_http_bearer` for legacy/debug forwarding,
  `https_tls_fingerprint_pin` for HTTPS bridge forwarding with a matching
  pinned certificate, and `quic_tls_1_3` only for the future release-grade route
  proof.
- `musu.pro` rejects release-grade claims where
  `peer_identity_verified=true` but identity method or public key proof is
  missing.
- `musu.pro` also keeps `https_tls_fingerprint_pin` evidence non-release-grade
  via `transport_not_release_grade_quic_tls`; accepted release-grade transport
  still requires `encryption=quic_tls_1_3`.
- `transport_verified_by`: optional verifier id. Release-grade QUIC/TLS
  evidence must set `transport_verified_by=musu_quic_tls_transport`. The bridge
  HTTPS fingerprint-pinned path sets
  `transport_verified_by=musu_bridge_forward_fingerprint_pinned_client`, which
  proves an interim HTTPS certificate pin but is intentionally not release-grade.
  A bare `encryption=quic_tls_1_3` string without this verifier is rejected as
  missing transport proof.

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
  "peer_identity_method": "quic_tls_cert_fingerprint",
  "peer_public_key": "sha256:<hex>",
  "encryption": "quic_tls_1_3",
  "transport_verified_by": "musu_quic_tls_transport",
  "payload_transited_musu_infra": false,
  "result": "success",
  "failure_class": null,
  "recorded_at": "2026-05-31T09:01:00Z"
}
```

When a direct runtime route fails and relay fallback is evaluated, failed route
evidence can include an optional addendum:

```json
{
  "relay_fallback": {
    "direct_path_failed": true,
    "lease_requested": true,
    "status": "denied",
    "lease_issued": false,
    "attempted_route_kinds": ["tailscale", "lan"],
    "requested_capability": "remote_command",
    "policy": "connect_pro_fallback_only",
    "blockers": ["relay_transport_not_wired"],
    "lease_id": null,
    "failure_class": "relay_lease_denied"
  }
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
  `MUSU_ROUTE_EVIDENCE_TOKEN`, `MUSU_TOKEN`, or the SHA-256 allowlist
  `MUSU_P2P_CONTROL_TOKEN_SHA256S` / `MUSU_P2P_CONTROL_TOKEN_SHA256`.
  The hash allowlist is the current safe bridge for runtime account tokens:
  production can accept the token `MusuCloud` already sends without storing the
  raw token in Vercel env. The longer-term model should still map validated
  account/device tokens to account ids or issue scoped P2P control tokens.
- Validates `musu.route_evidence.v1` with the route kinds above.
- Validates and stores the optional `relay_fallback` addendum for terminal
  direct-route failures. Valid statuses are `skipped_no_token`,
  `skipped_no_session`, `denied`, `issued`, `failed`, and `timed_out`.
- Stores valid evidence and returns `202`, including `stored=true`,
  `evidence_id`, `owner_scoped=true`, `release_grade`, and `blockers`.
- Stores an `owner_key` derived from the accepted Bearer token's SHA-256 hash,
  not the raw token. This is the current local/stub account boundary until real
  account auth maps tokens to account ids.
- Accepts legacy/debug evidence for observability but marks it non-release-grade
  when identity, encryption, timing, result, or relay-transit truth is weak.
- Keeps HTTPS fingerprint-pinned bridge evidence observable but
  non-release-grade until the route records `encryption=quic_tls_1_3`.
- Hosted storage uses Vercel KV/Upstash Redis (`KV_REST_API_URL` and
  `KV_REST_API_TOKEN`) as a capped list. Local/dev can use
  `MUSU_ROUTE_EVIDENCE_STORE_PATH`.
- Production fails closed without KV unless `MUSU_ROUTE_EVIDENCE_STORE_PATH`
  points to an explicit persistent file path.

Current `GET /api/v1/p2p/route-evidence` behavior:

- Requires the same Bearer auth.
- Returns stored evidence records with `limit`, `source_node_id`,
  `target_node_id`, `route_kind`, `result`, and `release_grade` filters.
- Queries are scoped to the same token-derived `owner_key` used on write, so a
  caller cannot enumerate records written under a different Bearer token.
  Responses omit `owner_key` to avoid exposing the account-linkage hash.
- This is an API audit surface only; operator UI, export, and retention policy
  remain pending.

## Relay Lease Control-Plane

Relay/tunnel fallback must be explicitly leased before any future relay data
path is used. The lease endpoint is a policy boundary, not the relay transport
itself.

Current `POST /api/v1/p2p/relay/lease` behavior:

- Requires the same Bearer auth as the rendezvous and route-evidence APIs.
  Live production previously returned `p2p_control_auth_not_configured` because
  no static token was configured; the code now also accepts
  `MUSU_P2P_CONTROL_TOKEN_SHA256S`, but production must still set that env to
  the SHA-256 hash of the accepted runtime token before this endpoint can pass
  live diagnostics.
- Validates `session_id`, `source_node_id`, `target_node_id`,
  `attempted_route_kinds`, `direct_path_failed`, optional
  `requested_capability`, and optional `failure_class`.
- Returns `409` with `lease_issued=false` and explicit `blockers` unless all
  fallback policy requirements pass.
- Default policy is fail-closed. A lease requires:
  - `MUSU_P2P_RELAY_ENABLED=1`
  - `MUSU_P2P_RELAY_TRANSPORT_WIRED=1`
  - `MUSU_P2P_RELAY_URL`
  - `MUSU_P2P_RELAY_ENTITLEMENT=connect|pro|enterprise`
  - `direct_path_failed=true`
  - at least one non-relay attempted route kind before relay
- On success, stores an owner-scoped lease and returns `201` with
  `lease_issued=true`, `relay_control_plane_wired=true`,
  `relay_transport_wired=true`, `relay_default_data_path=false`,
  `policy=connect_pro_fallback_only`, and a public lease record.
- Lease records include `route_kind=relay`,
  `payload_transited_musu_infra=true`, `default_data_path=false`, and
  `policy=connect_pro_fallback_only`.
- Stored leases use Vercel KV/Upstash Redis or
  `MUSU_P2P_RELAY_LEASE_STORE_PATH`. Production fails closed without KV unless
  an explicit persistent file path is configured.
- Records are scoped by the same token-derived `owner_key` boundary as route
  evidence. `GET /api/v1/p2p/relay/lease` filters by caller owner and omits the
  key from responses.

Current Rust client/diagnostic behavior:

- `musu-rs/src/cloud/mod.rs` has relay lease request/response DTOs and
  `request_relay_lease`.
- `musu-rs/src/cloud/mod.rs` also has relay lease query DTOs and
  `query_relay_leases` for `GET /api/v1/p2p/relay/lease`.
- `musu-rs/src/bridge/rendezvous.rs` now builds a relay lease request from the
  failed direct-route attempt and calls `/api/v1/p2p/relay/lease` after
  forwarding exhausts direct candidates. The request includes `session_id`,
  `source_node_id`, `target_node_id`, attempted direct route kinds,
  `direct_path_failed=true`, failure class, and requested capability.
- Runtime forwarding skips the lease call when there is no rendezvous session
  or no account token. A failed, denied, or timed-out lease does not mask the
  original direct-route failure and does not send payload over relay.
- Failed runtime route evidence now carries `relay_fallback` when this
  evaluation occurs, including whether a lease was requested/issued, the
  attempted route kinds, policy/blockers, optional lease id, and relay failure
  class. This lets local evidence and submitted `musu.pro` records prove the
  control-plane fallback decision without claiming relay payload transport.
- `musu relay status --json` reports
  `relay_control_plane_lease_wired=true`,
  `relay_lease_endpoint=/api/v1/p2p/relay/lease`,
  `relay_runtime_fallback_lease_request_wired=true`,
  `relay_default_data_path=false`, and still
  `relay_transport_wired=false`.
- `musu relay leases --json` reports schema `musu.relay_leases.v1`, the
  registry URL, login state, filters, count, returned leases, `owner_scope_verified`,
  and any non-crashing API error. It must not be treated as verified owner-scoped
  evidence unless `owner_scope_verified=true`.
- Relay/tunnel transport remains unwired. The runtime lease request is a policy
  and audit handoff only; it must not become a silent relay data path.

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
   **Rendezvous, route-evidence, and relay fallback lease stubs partially done on 2026-06-01.**
   `musu-bee/src/app/api/v1/p2p/rendezvous/*` now creates, reads, updates
   candidate sets, approves, and closes short-lived sessions. `musu-bee/src/app/api/v1/p2p/route-evidence/route.ts`
   accepts, validates, stores, and queries authenticated evidence; tests live
   next to the routes. Bridge runtime route attempts now create/read/close
   rendezvous sessions, publish source/target candidate sets on a best-effort
   path, cache recent node candidates, seed new sessions from that cache, and
   use refreshed target candidates when present. `musu-bee/src/app/api/v1/p2p/relay/lease/route.ts`
   now enforces the Connect/Pro fallback lease policy and stores/query-filters
   leases by token owner. Runtime forwarding now requests such a lease after
   terminal direct-route failure when a rendezvous session/account token exists,
   but does not send payload over relay. Account-scoped evidence is now
   token-owner scoped and query-isolated. UI/export, retention policy, real
   account-id mapping, runtime relay transport, and release-grade QUIC/TLS
   proof remain pending.
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
   token exists. Runtime route evidence now carries the rendezvous `session_id`
   when one was created. HTTPS target candidates with advertised SHA-256
   certificate fingerprints can now be verified during bridge forwarding and
   recorded as `peer_identity_method=tls_cert_fingerprint_pin` with
   `encryption=https_tls_fingerprint_pin`; release-grade QUIC/TLS evidence
   remains pending.
5. Add direct path selection against registered LAN/Tailscale endpoints.
   **Initial client-side selector done on 2026-06-01.** `musu-rs/src/bridge/router.rs`
   now classifies candidate addresses as `local`, `lan`, `tailscale`, or
   `direct_quic`, ranks remote candidates by LAN -> Tailscale -> direct public
   endpoint, preserves circuit-breaker filtering, and uses the same selector
   for explicit target, GPU, and OS-hint routing. `musu route --explain` and
   `musu relay status` now report `bridge_path_selection_wired=true` and
   `rendezvous_session_wired=true`. Runtime forwarding can now replace the
   selected peer with the best target endpoint returned by the rendezvous
   session. This still does not prove hardened P2P release readiness because
   the selected transport is legacy HTTP bearer and relay/tunnel fallback is
   not implemented.
6. Add relay/tunnel transport only after direct path evidence is stable.
   **Control-plane lease boundary and runtime fail-closed lease request exist
   as of 2026-06-01; relay data transport remains pending.** Relay must remain
   an explicit route kind, not a silent default payload path.
