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

2026-06-06 addendum after relay proof hardening and MSIX candidate selection:
the product split is unchanged. MUSU Desktop is still the local executor and
resource owner. `musu.pro` is remote input, project/company room, presence,
rendezvous, path-selection, relay fallback policy, and evidence/control plane.
The latest packaged local refresh on `HUGH_SECOND` restores one-machine local
evidence: single-machine smoke true, desktop-open idle CPU `1/2`, full runtime
matrix `1/2`, and targeted HUGH-MAIN failed-route CPU diagnostic `1/1`. The
MSIX install go/no-go gate now scans recent install evidence candidates by
machine so developer warning-mode alias-shadow evidence cannot mask clean
strict install proof. This is release-gate hardening only; it does not move
execution into MUSU.PRO and does not complete hosted release relay transport.

2026-06-06 relay preflight failure evidence addendum: release relay connect and
release payload preflight invalid JSON/metadata responses now include the same
structured release status fields as normal preflight responses, with
accepted/transit booleans explicitly false. This improves operator diagnostics
and release evidence quality without accepting payload bytes, using the preview
queue as release transport, or emitting release relay proof before the actual
`quic_relay_tunnel` payload path exists.

2026-06-06 route evidence peer identity addendum: release-grade route evidence
now requires the top-level route peer identity claim to use
`peer_identity_method=quic_tls_cert_fingerprint` and a `sha256:` fingerprint.
Stored route evidence queries also revalidate this before returning
`release_grade=true` records. This prevents direct or relay route evidence from
passing with a non-release identity method even if the route claims
`peer_identity_verified=true`.

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
- room work-order accepted, bridge-error, invalid-JSON, and
  missing-instruction paths are covered by command audit regressions; rejected
  paths must not call the bridge and must not write prompt text to
  command-center audit JSONL
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

2026-06-06 current HEAD MSIX reinstall and crash-recovery evidence addendum:
the source crash-recovery contract is now proven in the installed package, not
only in source tests. HEAD `29dc84db1d8018fd8f8f7bf98588cb6bca0700a2` was
rebuilt and reinstalled as
`Yellowhama.MUSU_1.15.0.0_x64__ygcjq669as2b6`; packaged `musu up --json`
exposes `stale_bridge_registry_removed` and `stale_bridge_registry_pid`. A
dead bridge registry PID `999999` was removed before a healthy bridge started
at `127.0.0.1:3678`, and the crash-recovery audit passed with `ok=true` and
`fail_count=0`. Canonical single-machine evidence
`20260606-195631-HUGH_SECOND` passes as `local-bridge-only`, and canonical
desktop-open idle CPU evidence `20260606-200405-HUGH_SECOND.desktop-open`
passes with hot process count `0` and WebView2 `0.08`.

This does not change the release boundary. MUSU Desktop remains the local
executor. MUSU.PRO remains remote input, project/company room, AI meeting room,
presence, rendezvous, path selection, relay fallback policy, and
evidence/control plane. `localhost:3001` is not the packaged desktop runtime
contract. Current public P2P release still needs second-PC route/CPU/matrix
proof, a current full `post-route` matrix, live MUSU.PRO login/storage, release
`quic_relay_tunnel` proof, support mailbox proof, and Store proof.
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

## 2026-06-06 relay route transport proof verifier gate

Hosted P2P release evidence now requires each returned release-grade relay
route record to include a valid `relay_transport_proof`, not only a relay lease
or payload delivery proof.

Required binding chain:

- route record has `session_id`, `source_node_id`, and `target_node_id`
- relay fallback has an issued `lease_id`
- `relay_transport_proof` matches the same session, lease, source, and target
- `relay_transport_proof.transport_kind=quic_relay_tunnel`
- `relay_transport_proof.relay_url` uses `wss://`
- `relay_transport_proof.encryption=quic_tls_1_3`
- `relay_transport_proof.transport_verified_by=musu_quic_tls_transport`
- `relay_payload_delivery_proof` matches the same session, lease, source,
  target, and tunnel

`queryRouteEvidenceRecords({ release_grade: true })` also revalidates this
chain before returning stale/manual records whose stored `release_grade` flag
is true. The release verifier exposes
`relay_route_transport_proof_valid_count` so hosted evidence cannot pass with a
lease-only or queue-only relay proof.

## 2026-06-06 relay route transport proof status surface

The relay route transport proof requirement is now propagated through the
operator status layer:

- go/no-go exposes `p2p_relay_route_transport_proof_valid_count`
- external gate recheck exposes the same count and emits
  `p2p_relay_route_transport_proof_missing`
- P2P env status exposes
  `relay_route_transport_proof_valid_count`,
  `relay_route_transport_proof_required_count`, and
  `relay_route_transport_proof_invalid_count`
- P2P env status emits
  `live_evidence_relay_route_transport_proof_missing` and next steps to rerun
  hosted evidence until `relay_route_transport_proof_valid_count > 0`
- final handoff status forwards the go/no-go count

This is reporting hardening. The release rule is unchanged: MUSU.PRO can help
local devices connect by exchanging control-plane metadata, but local MUSU
Desktop programs do the work. Relay remains fallback-only and release-grade
only after real tunnel proof and delivery proof are recorded.

## 2026-06-06 Rust route evidence relay transport proof carry

Rust bridge route evidence now has the same optional `relay_transport_proof`
shape as the hosted cloud DTO and preserves it during cloud submission.

This removes a runtime evidence plumbing gap: when a real release
`quic_relay_tunnel` produces `musu.relay_transport_proof.v1`, local route
evidence can carry the proof to MUSU.PRO instead of converting it to `None`.

This still does not implement release tunnel transport. It only ensures the
local executor can preserve proof once runtime transport code produces it.

## 2026-06-06 current external gate snapshot

Current clean HEAD `0ba26d6d27a23a213240962517079d5fd817c7e8` confirms the
current product split and remaining P2P release blockers:

- MUSU Desktop remains the local executor and resource owner.
- MUSU.PRO remains remote input, project/company room, presence, rendezvous,
  path selection, relay fallback policy, and evidence/control plane.
- Public metadata is checked and ok on `https://musu.pro`.
- Hosted P2P evidence `20260606-151527-musu.pro` verifies `ok=false` with
  `fail_count=42`.
- The packaged runtime is not logged in for hosted relay status, transport,
  leases, or route-evidence queries.
- Owner scope is not verified.
- Production relay lease storage is not configured/release-grade.
- Release relay transport/connect/payload endpoints are not wired.
- Relay route evidence count, route transport proof valid count, and payload
  delivery proof valid count are all `0`.

Release implication: this is still external machine/account/infrastructure
work. It is not a reason to use the localhost developer dashboard as the
product surface, and it is not a reason to move execution into MUSU.PRO.

## 2026-06-06 relay tunnel runtime source gate

Release relay readiness now requires a distinct local runtime marker:

- `RELAY_TUNNEL_RUNTIME_IMPLEMENTED=false`
- `relay_tunnel_runtime_implemented=false` in relay status surfaces
- `source_release_relay_tunnel_runtime_not_implemented` in P2P env status

This keeps `relay_transport_wired=false` unless actual local runtime code can
move payload bytes through a release `quic_relay_tunnel` and emit
`quic_tls_1_3` transport proof. The preview store-forward queue and proof DTOs
remain useful diagnostics, but they are not the release relay tunnel.

## 2026-06-06 relay fallback candidate coverage gate

Relay fallback route evidence now includes candidate coverage metadata via
`relay_fallback.candidate_route_kinds`. Release grading blocks relay records
that do not prove the available direct route candidates were attempted in the
canonical order before fallback:

1. `lan`
2. `tailscale`
3. `direct_quic`
4. `relay`

This makes MUSU.PRO's rendezvous/path-selection role auditable without turning
MUSU.PRO into the default payload data path.

## 2026-06-06 runtime relay candidate coverage carry

The local runtime now carries the same candidate coverage contract that the
hosted route-evidence verifier requires.

- Rendezvous-selected peer metadata preserves `candidate_route_kinds`.
- Forwarding builds an ordered direct candidate list and attempts direct
  candidates before relay fallback.
- Runtime `relay_fallback` evidence submits `candidate_route_kinds` to
  MUSU.PRO.
- Relay payload enqueue/store records `candidate_route_kinds` and
  `attempted_route_kinds` as metadata.
- Target-side relay payload delivery route evidence reuses the stored route
  metadata instead of using placeholder `failed`/`relay` attempts.

This is evidence carry-path hardening. It does not implement the release
`quic_relay_tunnel` runtime and does not make the preview relay queue
release-grade.

## 2026-06-06 route record metadata verifier gate

Hosted P2P release evidence now validates the route record metadata around the
relay transport proof.

For relay success records, `verify-p2p-control-plane-evidence.ps1` requires:

- `candidate_addr`
- `handshake_ms`
- `total_attempt_ms`
- `peer_identity_verified=true`
- `peer_identity_method=quic_tls_cert_fingerprint`
- `peer_public_key=sha256:*`
- `encryption=quic_tls_1_3`
- `transport_verified_by=musu_quic_tls_transport`
- matching `relay_transport_proof.handshake_ms`

The verifier reports `relay_route_metadata_required_count`,
`relay_route_metadata_valid_count`, and
`relay_route_metadata_invalid_count`.

This is evidence hardening only. It does not complete release relay runtime or
second-PC proof.

## 2026-06-06 route metadata status surface

Route metadata counts are now part of the release status contract, not only the
hosted verifier contract.

Status surfaces must carry:

- `relay_route_metadata_required_count`
- `relay_route_metadata_valid_count`
- `relay_route_metadata_invalid_count`
- `p2p_relay_route_metadata_valid_count` in release handoff summaries

The external release handoff path must preserve the full count triplet:

- recorder result JSON and summary:
  `relay_route_metadata_required_count`,
  `relay_route_metadata_valid_count`, and
  `relay_route_metadata_invalid_count`
- external recheck/final handoff:
  `p2p_relay_route_metadata_required_count`,
  `p2p_relay_route_metadata_valid_count`, and
  `p2p_relay_route_metadata_invalid_count`

Route transport proof and payload delivery proof status must also preserve
required/valid/invalid triplets:

- route transport proof:
  `p2p_relay_route_transport_proof_required_count`,
  `p2p_relay_route_transport_proof_valid_count`, and
  `p2p_relay_route_transport_proof_invalid_count`
- payload delivery proof:
  `p2p_relay_payload_delivery_proof_required_count`,
  `p2p_relay_payload_delivery_proof_valid_count`, and
  `p2p_relay_payload_delivery_proof_invalid_count`

Release interpretation:

- hosted P2P No-Go diagnostics must name missing route metadata separately
  from missing route transport proof or payload delivery proof;
- go/no-go must require `relay_route_metadata_valid_count > 0` alongside route
  evidence count, route transport proof count, and payload delivery proof
  count;
- MUSU.PRO still does not execute local work and must not become the default
  payload path;
- the local MUSU runtime must still produce the route attempt, route metadata,
  `quic_relay_tunnel` transport proof, and payload delivery proof.

## 2026-06-07 HUGH-MAIN route reachability diagnostic

Packaged MUSU Desktop status on `HUGH_SECOND` proves the local runtime is
healthy at `http://127.0.0.1:1158`. The currently registered `HUGH-MAIN`
manual LAN peer is unhealthy at `192.168.1.192:8949`.

Route explain selected exactly one candidate:

- source: `manual`
- route kind: `lan`
- transport scheme: `http`
- encryption: `none_http_bearer`
- peer identity: `peer_identity_verified=false`
- release transport requirement: `quic_tls_1_3`
- route evidence ready: `false`

The direct network probe recorded TCP `false` and ping `false` to
`192.168.1.192:8949`; a LAN neighbor entry existed but is not route success
proof. The raw route attempt failed with `submit_http_error` after `10006 ms`.

Release interpretation:

- this is a peer endpoint reachability blocker, not proof that the local MUSU
  Desktop runtime is down;
- this does not satisfy successful multi-device route evidence;
- this does not use a MUSU.PRO relay path;
- a manual HTTP bearer candidate remains diagnostic/non-release-grade even if
  it starts responding;
- the next release-grade path is current MUSU Desktop installed/running on a
  second Windows PC, reachable endpoint proof, successful two-machine route
  evidence, and then hosted MUSU.PRO rendezvous/relay proof.

## 2026-06-07 route reachability diagnostic tooling

Failed peer reachability diagnostics are now captured by
`record-route-reachability-diagnostic.ps1` and verified by
`verify-route-reachability-diagnostic.ps1`.

The diagnostic schema records:

- packaged MUSU status and local bridge URL
- selected route explain candidate and canonical path priority
- TCP/ping/neighbor probe result
- raw `musu.route_evidence.v1` route-attempt evidence
- command captures
- explicit conclusion fields for local runtime health, peer health,
  reachability, relay usage, and successful multi-device proof

The verifier requires non-local target proof when `-RequireNonLocalTarget` is
used and rejects fake successful route proof. This makes reachability failure
useful for recovery without allowing it to satisfy release-grade route proof.

## 2026-06-07 second-PC route reachability handoff

Route reachability diagnostics are now carried by the operator handoff path.

When `run-second-pc-release-check.ps1` receives `-RouteReachabilityTarget` or
falls back to `-RuntimeCpuRouteTarget`, it writes
`musu.route_reachability_diagnostic.v1` under
`.local-build\route-diagnostics\` and includes the file in the second-PC return
zip. The primary-side `import-second-pc-return.ps1` copies it into the same
canonical evidence root and verifies that the route target is non-local.

Control-plane interpretation:

- MUSU.PRO may help devices find each other, exchange peer/project room state,
  and coordinate relay fallback.
- MUSU.PRO does not execute local work.
- The local MUSU Desktop runtime still records the route attempt and endpoint
  diagnostic.
- Route reachability diagnostics explain endpoint state; they do not replace
  release-grade `musu.route_evidence.v1` proof.

## 2026-06-07 current primary route-attempt CPU matrix

The current primary-machine CPU matrix after process ownership CLI hardening
keeps the same P2P boundary.

Evidence:

- matrix `20260607-025704-HUGH_SECOND` was captured clean from `.local-build`
- target-route diagnostic verification passed with failed `HUGH-MAIN` route
  allowed
- full release matrix verification still fails on `post-route route probe`
- route prompt and expected token are both
  `MUSU_CPU_SCENARIO_ROUTE_OK_20260607_025704`
- route target remains non-local: `HUGH-MAIN`
- route failure remains timeout to `192.168.1.192:8949`

Interpretation:

- failed route CPU evidence is useful for busy-loop diagnosis only;
- successful multi-device release still requires a second reachable local MUSU
  Desktop executor;
- MUSU.PRO remains the web control plane for remote input, rooms, rendezvous,
  path selection, relay fallback, and evidence.

## 2026-06-07 P2P env blockers in go/no-go

The release go/no-go report now embeds hosted P2P env status from
`show-musu-pro-p2p-env-status.ps1`.

The report must expose:

- `p2p_control_plane_env_ready`
- `p2p_control_plane_env_blockers`
- `p2p_control_plane_env_status`
- a concise `P2P env blockers:` summary on the `p2p-control-plane` blocker

Current blocker split:

- release relay tunnel runtime missing
- release relay payload endpoint missing
- preview store-forward queue non-release-grade
- release transport kind not release-grade
- KV/Upstash and login/proof evidence missing
- relay route metadata, transport proof, and payload delivery proof missing

This keeps the gate fail-closed and makes the next implementation work visible
without changing the local-executor / MUSU.PRO control-plane boundary.

## 2026-06-07 release tunnel marker conflict rule

P2P env status now rejects marker-only release relay tunnel flips.

The release tunnel is not considered source-ready unless these source hooks are
present:

- `rust_source_submit_release_relay_tunnel_payload`
- `rust_target_accept_release_relay_tunnel_payload`
- `rust_transport_emits_quic_relay_tunnel_proof`
- `rust_delivery_records_release_relay_tunnel_payload`

If release markers claim readiness while `/api/v1/relay/payload` is still
preflight-only or those hooks are missing, env status emits source conflict
blockers. This prevents the preview store-forward queue and proof DTOs from
being mistaken for a real `quic_relay_tunnel` payload path.
