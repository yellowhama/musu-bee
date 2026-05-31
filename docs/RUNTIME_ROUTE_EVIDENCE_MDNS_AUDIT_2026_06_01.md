# Runtime Route Evidence and mDNS Audit

**Wiki ID**: wiki/528
**Date**: 2026-06-01
**Status**: Current implementation addendum after operator mDNS/Tailscale logs, bridge forwarding evidence wiring, stored `musu.pro` route-evidence API, rendezvous control-plane endpoints, Rust bridge runtime rendezvous wiring, HTTPS certificate fingerprint pinning for bridge forwarding, and the first relay fallback lease policy API.

## Executive Verdict

The current codebase is stronger than the previous CLI-only route evidence
state, but it is still **No-Go for public desktop release**.

What changed materially:

- CLI route evidence and bridge runtime route evidence now share one contract in
  `musu-rs/src/bridge/route_evidence.rs`.
- Remote forwarding from `/api/tasks/delegate`,
  `/api/companies/{id}/run`, and workflow remote steps now writes local
  `musu.route_evidence.v1` files under `~/.musu/route-evidence/`.
- Forwarding attempts now record handshake timing, total attempt timing, retry
  failure class, and success/failure result from the actual runtime attempt.
- `musu-bee` now exposes authenticated `POST` and `GET`
  `/api/v1/p2p/route-evidence` endpoints. `POST` validates
  `musu.route_evidence.v1`, accepts debug/legacy evidence, stores the record,
  and explicitly reports whether it is release-grade. `GET` returns stored
  evidence with filters for source, target, route kind, result, and
  release-grade status.
- Route evidence storage is now token-owner scoped. The API derives an
  `owner_key` from the accepted Bearer token's SHA-256 hash, stores records
  under that key, filters `GET` results to the same owner, and omits the
  linkage hash from responses.
- Route evidence is durable on hosted `musu.pro` when Vercel KV is configured,
  using a capped Redis list. Local/dev has an atomic JSON file fallback through
  `MUSU_ROUTE_EVIDENCE_STORE_PATH`.
- `musu-bee` now exposes the first short-lived rendezvous endpoints:
  create/read session, update source/target candidates, approve, and close.
  This is the server-side candidate-exchange contract the Rust cloud DTOs were
  already shaped for.
- Rendezvous candidate updates now refresh a short-lived node candidate cache in
  the control-plane store. New sessions seed source/target candidate sets from
  that cache when available, so a target candidate published during one route
  can influence a later route attempt.
- Bridge startup and rendezvous candidate publish now expose the local TLS
  certificate SHA-256 fingerprint as identity material when available. Route
  evidence can carry the advertised peer fingerprint, but still records
  `peer_identity_verified=false` until the transport proves ownership of that
  key.
- Rendezvous and registry metadata now preserve endpoint scheme (`http` or
  `https`). When forwarding to an HTTPS target with an advertised
  `sha256:<hex>` certificate fingerprint, the Rust bridge builds a fingerprint-
  pinned rustls client, verifies the target leaf certificate during the actual
  POST, and only then records `peer_identity_verified=true`,
  `peer_identity_method=tls_cert_fingerprint_pin`, and
  `encryption=https_tls_fingerprint_pin`.
- Rust bridge forwarding now creates a short-lived rendezvous session before a
  remote route attempt when an account token exists, publishes the source
  bridge endpoint, attaches `session_id` to the forwarded task, lets the target
  publish its endpoint candidates when it receives the forwarded task, and
  closes the session after terminal success/failure.
- When the refreshed rendezvous session already has target candidates, bridge
  forwarding now selects the best non-relay candidate by LAN -> Tailscale ->
  direct-public priority and uses that address for the actual attempt. If the
  selected target candidate fails after retries, forwarding falls back once to
  the original selected peer address.
- `musu-bee` now exposes authenticated `POST` and `GET`
  `/api/v1/p2p/relay/lease` endpoints. This is the relay fallback policy
  boundary, not data transport: it is fail-closed by default, requires direct
  path failure plus Connect/Pro-style entitlement env, stores owner-scoped
  leases, and records `relay_default_data_path=false`.
- Runtime route evidence now records the rendezvous `session_id` when a session
  was created, so local files and best-effort `musu.pro` submissions can be
  joined with the control-plane session.
- Rust bridge runtime evidence now converts the local evidence file into the
  shared cloud DTO and starts a background best-effort submit after local write
  succeeds when a `~/.musu/token` account token is present.
- mDNS now disables IPv6 and Tailscale interfaces by default unless explicitly
  opted in.

What is still not release-grade:

- Legacy/default route transport remains HTTP bearer.
- Legacy route evidence honestly records `peer_identity_verified=false`,
  `encryption=none_http_bearer`, and `payload_transited_musu_infra=false`.
- HTTPS fingerprint-pinned bridge evidence is a real transport check, but it is
  still bridge HTTP multipart over TLS, not the final QUIC/TLS route transport.
- `musu.pro` now also requires identity proof material when evidence claims
  `peer_identity_verified=true`; a bare boolean claim without
  `peer_identity_method` and `peer_public_key` is not release-grade.
- `musu.pro` now also requires `encryption=quic_tls_1_3` for release-grade
  evidence and returns `transport_not_release_grade_quic_tls` for
  `https_tls_fingerprint_pin`.
- The server endpoint is now a minimal durable storage/query API, but not an
  operator UI, export surface, or long-term retention system yet. Token-owner
  scoping exists, but real account-id mapping remains pending.
- Rendezvous is now bridge-wired for session lifecycle and candidate publish,
  and `musu relay status` reports `rendezvous_session_wired=true`.
- Relay lease control-plane is now wired, but runtime forwarding does not call
  it yet and the relay/tunnel transport still does not exist.
- Runtime submission does not make legacy HTTP evidence pass the release gate;
  it only makes the gap visible to the control plane.
- QUIC/TLS peer identity proof, account-scoped evidence UI/export, real
  two-machine rendezvous evidence, and relay/tunnel transport remain pending.

## Product Spec Updates

1. `musu.pro` remains the control plane, not the default payload path.
   Runtime evidence is now written locally first, then background submitted to
   `musu.pro` on a best-effort path when the node has an account token.
2. `musu.route_evidence.v1` is now a shared CLI/runtime contract. The writer is
   no longer duplicated inside the CLI module.
3. Runtime forwarding evidence path:
   `~/.musu/route-evidence/<task_id>.route-evidence.json`.
4. mDNS defaults are now:
   - `MUSU_ENABLE_MDNS=0`: no bridge advertiser/discovery loop by default
   - `MUSU_MDNS_ENABLE_IPV6=0`: no IPv6 mDNS by default
   - `MUSU_MDNS_ENABLE_TAILSCALE=0`: no mDNS on Tailscale adapters by default
5. Route evidence control-plane endpoint:
   - `POST /api/v1/p2p/route-evidence`
   - `GET /api/v1/p2p/route-evidence`
   - Auth: Bearer token from `MUSU_P2P_CONTROL_TOKEN`,
     `MUSU_ROUTE_EVIDENCE_TOKEN`, or `MUSU_TOKEN` on the server.
   - `POST` response: `202` with `stored=true`, `evidence_id`,
     `owner_scoped=true`,
     `release_grade`, and `blockers` for valid evidence; invalid schema returns
     `400`, bad/missing bearer returns `401`, missing server token returns
     `503`, and storage failure returns `503`.
   - `GET` query filters: `limit`, `source_node_id`, `target_node_id`,
     `route_kind`, `result`, and `release_grade`.
   - Hosted storage uses `KV_REST_API_URL` / `KV_REST_API_TOKEN`. Production
     fails closed without KV unless `MUSU_ROUTE_EVIDENCE_STORE_PATH` points to
     an explicit persistent file path.
   - Records are scoped by a SHA-256 owner key derived from the accepted Bearer
     token. `GET` filters by this owner key and does not expose the key in
     response records.
6. Client cloud base URL:
   - `MUSU_CLOUD_BASE_URL` overrides the default `https://musu.pro` for login,
     registry, and route-evidence submission tests.
7. Rendezvous control-plane endpoints:
   - `POST /api/v1/p2p/rendezvous`
   - `GET /api/v1/p2p/rendezvous/:id`
   - `POST /api/v1/p2p/rendezvous/:id/candidates`
   - `POST /api/v1/p2p/rendezvous/:id/approve`
   - `POST /api/v1/p2p/rendezvous/:id/close`
   - Hosted storage uses Vercel KV per-session keys; local/dev uses
     `MUSU_P2P_RENDEZVOUS_STORE_PATH`.
8. Runtime rendezvous behavior:
   - `musu-rs/src/bridge/rendezvous.rs` owns the bounded bridge-side lifecycle.
   - Source forwarding creates/refreshes a session and publishes its current
     advertised bridge endpoint before trying the selected peer.
   - The forwarded task carries `rendezvous_session_id`; the target publishes
     its local endpoint candidates on receipt.
   - The source can replace the original cached/manual peer address with the
     best target candidate returned by the refreshed session. That candidate
     can now come from the control-plane node candidate cache seeded by earlier
     candidate updates. A stale/failing target candidate falls back once to the
     original peer address.
   - Control-plane calls use `MUSU_P2P_RENDEZVOUS_CLIENT_TIMEOUT_MS` (`3000`
     default, clamped `250..10000`) and fail open to the selected direct peer
     path.
   - Current diagnostics now report `rendezvous_session_wired=true`, while
     `relay_transport_wired=false` and `release_route_evidence_ready=false`.
9. HTTPS fingerprint-pinned bridge forwarding:
   - Candidate endpoints and registry metadata preserve `transport_scheme`.
   - `advertised_bridge_http_url` advertises `https://` when bridge TLS is
     enabled and no public URL override is set.
   - `forward_to_peer_attempt` uses a fingerprint-pinned rustls reqwest client
     only for HTTPS peers with advertised `sha256:<hex>` key material.
   - Successful pinned attempts update the route peer metadata before evidence
     is written. Unpinned HTTP/HTTPS attempts do not get verified identity
     metadata.
   - The route-evidence API accepts this as useful evidence but keeps it
     non-release-grade until QUIC/TLS route proof exists.
10. Relay fallback lease policy API:
   - `POST /api/v1/p2p/relay/lease`
   - `GET /api/v1/p2p/relay/lease`
   - Auth: same Bearer-token control-plane auth as rendezvous/route evidence.
   - Default behavior is fail-closed with `lease_issued=false` and blockers.
   - A successful lease requires `MUSU_P2P_RELAY_ENABLED=1`,
     `MUSU_P2P_RELAY_TRANSPORT_WIRED=1`, `MUSU_P2P_RELAY_URL`,
     `MUSU_P2P_RELAY_ENTITLEMENT=connect|pro|enterprise`,
     `direct_path_failed=true`, and at least one non-relay attempted route.
   - Successful leases are owner-scoped, stored, queryable, and omit
     `owner_key` from responses.
   - `musu relay status --json` now reports
     `relay_control_plane_lease_wired=true`,
     `relay_lease_endpoint=/api/v1/p2p/relay/lease`,
     `relay_default_data_path=false`, and still
     `relay_transport_wired=false`.

The operator-supplied log pattern:

```text
Failed to send to [ff02::fb%9]:5353 via Interface { name: "Tailscale", ... } (os error 10065)
Failed to send SearchStarted(_musu._tcp.local.)(repeating:true): sending on a closed channel
```

means a build or command path still opened mDNS over the Tailscale IPv6
adapter. In the current source, default bridge startup should not do that.
If this reappears, first check whether the running binary predates this change,
or whether `MUSU_ENABLE_MDNS=1`, `MUSU_MDNS_ENABLE_IPV6=1`, or
`MUSU_MDNS_ENABLE_TAILSCALE=1` is set.

Latest field evidence from 2026-05-31T16:09:08Z to 2026-05-31T16:10:24Z
showed repeated sends to Tailscale adapter index 9 at `[ff02::fb%9]:5353`,
followed by `SearchStarted(_musu._tcp.local.)` closed-channel errors. Treat
that as a regression signal if it appears in a current build with all three
mDNS opt-in variables unset.

## Code Audit Findings

| Area | Severity | Finding | Status |
|---|---:|---|---|
| Runtime route evidence | High | Bridge remote forwarding previously did not write `musu.route_evidence.v1`; only CLI attempts did. | Fixed locally. `/api/tasks/delegate`, `/api/companies/{id}/run`, and workflow remote steps now write evidence. |
| Evidence contract duplication | Medium | CLI-owned evidence structs risked drifting from runtime evidence. | Fixed. Evidence structs/builders/writers are now shared in `bridge::route_evidence`. |
| Retry observability | Medium | Forwarding retries returned only a string error, losing timing and failure class. | Fixed. `ForwardAttemptReport` / `ForwardAttemptError` carry timing and failure class. |
| mDNS/Tailscale adapter noise | High | Tailscale IPv6 mDNS can repeatedly emit `os error 10065` and `closed channel` logs. | Further hardened. IPv6 and Tailscale mDNS interfaces are default-disabled; explicit opt-in env vars are required. |
| `musu.pro` route-evidence receiver | High | The Rust client had a DTO/method but no server endpoint to receive route evidence. | Fixed. `musu-bee/src/app/api/v1/p2p/route-evidence/route.ts` validates/authenticates the contract, stores evidence, and returns release blockers. |
| Route-evidence queryability | Medium | Evidence accepted by the control plane needed an audit/query path before it could support release diagnosis. | Fixed as a minimal API. `GET /api/v1/p2p/route-evidence` returns stored records with basic filters. |
| Route-evidence ownership | High | Stored route evidence could be queried from one shared control-plane bucket without a per-owner boundary. | Fixed as a token-owner scoped stub. `POST` stores a SHA-256 owner key derived from the accepted Bearer token, `GET` filters by that key, and responses omit the key. Real account-id mapping/UI/export remain pending. |
| Runtime cloud submission | High | Bridge runtime forwarding wrote local evidence but did not submit it to the control plane. | Fixed as background best-effort. Runtime submits after local write when `~/.musu/token` exists. Failures do not fail or delay the user task. |
| Rendezvous server contract | High | The Rust client had rendezvous DTOs/methods but no server endpoint to create sessions or exchange endpoint candidates. | Fixed. Server endpoints now create/read/update/approve/close sessions and seed new sessions from a recent node candidate cache. |
| Runtime rendezvous wiring | High | Bridge remote forwarding selected a peer directly but did not create a `musu.pro` session, attach a session id to route evidence, or use session target candidates. | Fixed as first runtime wiring. Forwarding creates/refreshes a session, publishes source candidates, forwards the session id to target, target publishes candidates best-effort, uses refreshed target candidates when present, falls back once to the original peer if a selected candidate fails, and evidence records the session id. |
| Peer identity material | High | Route evidence required peer identity proof, but route attempts had no durable identity material to carry. | Partially fixed. Local TLS certificate fingerprints are registered/published as candidate `public_key`, route evidence records advertised target fingerprints when available, and `musu.pro` rejects release-grade identity claims without method/key material. |
| HTTPS fingerprint pinning | High | Advertised fingerprints were previously only copied into evidence and did not prove the peer served that certificate. | Partially fixed. HTTPS bridge forwarding now verifies the target server certificate fingerprint during the actual POST and records verified identity metadata only after a successful pinned request. This is still not release-grade until QUIC/TLS route transport exists. |
| Relay fallback policy | High | Relay/tunnel fallback was documented as Connect/Pro-only but had no control-plane lease contract to prevent silent default relay use. | Partially fixed. `POST/GET /api/v1/p2p/relay/lease` is owner-scoped and fail-closed by default, requires direct path failure and explicit relay policy env, and `musu relay status` exposes the lease endpoint. Runtime relay transport remains unwired. |
| Release-grade route proof | Critical | Submitted evidence still cannot prove peer identity, QUIC/TLS encryption, or payload transit truth. | Still blocked. This is the next P0. |

## Validation

Passed:

- `cargo check --manifest-path .\musu-rs\Cargo.toml -j 1`
- `cargo test --manifest-path .\musu-rs\Cargo.toml -j 1 --lib cli_commands -- --nocapture`
- `cargo test --manifest-path .\musu-rs\Cargo.toml -j 1 --lib forward -- --nocapture`
- `cargo test --manifest-path .\musu-rs\Cargo.toml -j 1 --lib route_evidence -- --nocapture`
- `cargo test --manifest-path .\musu-rs\Cargo.toml -j 1 --lib rendezvous -- --nocapture`
- `cargo test --manifest-path .\musu-rs\Cargo.toml -j 1 --lib services -- --nocapture`
- `cargo test --manifest-path .\musu-rs\Cargo.toml -j 1 --lib discovery -- --nocapture`
- `cargo test --manifest-path .\musu-rs\Cargo.toml -j 1 --lib tls -- --nocapture`
- `cargo test --manifest-path .\musu-rs\Cargo.toml -j 1 --lib router -- --nocapture`
- `cargo test --manifest-path .\musu-rs\Cargo.toml -j 1 --bin musu cli_commands -- --nocapture`
- `cargo build --manifest-path .\musu-rs\Cargo.toml --bin musu -j 1`
- `musu relay status --json` reports `rendezvous_session_wired=true`
  and `relay_control_plane_lease_wired=true`
- `musu route --explain --json "MUSU_ROUTE_EXPLAIN_CHECK"` reports
  `rendezvous_session_wired=true`
- targeted `rustfmt --check` on changed Rust files
- `npx tsx --test src/app/api/v1/p2p/relay/lease/route.test.ts`
- `npx tsx --test src/app/api/v1/p2p/route-evidence/route.test.ts`
- `npx tsx --test src/app/api/v1/p2p/rendezvous/route.test.ts`
- `npm run typecheck`
- `cargo fmt --manifest-path .\musu-rs\Cargo.toml --check`
- `git diff --check`
- `musu indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
  indexed 1082 files and 2141 symbols after the relay fallback lease policy
  update.

Not completed:

- Full two-machine route proof and two-machine desktop-open CPU proof remain
  external/runtime evidence tasks, not unit-test tasks.

## Next Steps

1. Add account-scoped route evidence ownership, retention policy, and operator
   UI/audit export on top of the stored evidence API.
2. Verify target-candidate-assisted routing on the real second-PC route.
3. Add registry metadata as a second candidate seed source behind the current
   short-lived node candidate cache.
4. Replace HTTP bearer remote execution with QUIC/TLS route proof before
   allowing evidence to pass the release verifier. HTTPS fingerprint pinning is
   useful interim proof but remains non-release-grade.
5. Wire runtime relay/tunnel transport behind the new fail-closed lease policy;
   do not call the lease API until direct route failure evidence exists.
6. Rerun real second-PC multi-device proof and two-machine desktop-open CPU
   evidence from a clean committed HEAD.
