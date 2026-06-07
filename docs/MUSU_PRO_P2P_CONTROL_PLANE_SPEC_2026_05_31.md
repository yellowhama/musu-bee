# MUSU Pro P2P Control-Plane Spec

**Wiki ID**: wiki/524
**Date**: 2026-05-31
**Status**: Current implementation spec. Server-side rendezvous, route-evidence, and relay fallback lease APIs exist. Rust bridge runtime route attempts now create short-lived rendezvous sessions, seed sessions from recent node candidate cache, can use returned target candidates before legacy direct forwarding, exchange advertised TLS certificate fingerprints as peer identity material, verify HTTPS peer certificate fingerprints during bridge forwarding when a target candidate supplies a `sha256:<hex>` fingerprint, request a fail-closed relay lease after terminal direct-route failure when a rendezvous session and account token exist, persist the relay fallback evaluation inside failed route evidence, expose `musu relay transport --json`, `musu relay leases --json`, and `musu relay route-evidence --json` for owner-scoped audit queries, accept either a raw static control token or SHA-256 runtime-token allowlist for P2P control auth, write target-side audit rows when `/api/tasks/forward` accepts cross-machine work, and accept either `KV_REST_API_*` or `UPSTASH_REDIS_REST_*` storage env names for hosted P2P storage. Relay route evidence now also requires `musu.relay_transport_proof.v1` before `route_kind=relay` can become release-grade, and that proof must be bound to the same source/target peer pair as the route evidence record. This is still not final release-grade transport because the accepted release proof remains QUIC/TLS evidence, not bridge HTTP multipart over TLS, relay/tunnel data transport is still not wired, and live `https://musu.pro` still needs actual production KV/Upstash storage credentials plus release-grade relay route evidence before the hosted P2P gate can pass. The 2026-06-03 09:36 KST live evidence now fails the stricter verifier with `fail_count=31` because relay transport descriptor evidence is absent, relay lease storage is unconfigured, and owner-scoped relay route evidence count is `0`.

**2026-06-07 current target-route CPU audit update**: Current HEAD
`6cbeb3b34dad0c01c4a539f170435759095efc59` has fresh HUGH_SECOND evidence for
a targeted failed `HUGH-MAIN` route-attempt CPU diagnostic:
`20260607-072059-HUGH_SECOND.runtime-cpu-scenario-matrix.json` plus
`20260607-072059-HUGH_SECOND.target-route.verification.json`. This restores
`runtime_cpu_second_pc_route_attempt_verified=true` and
`runtime_cpu_second_pc_route_attempt_valid_machine_count=1`, while
`ready_for_public_desktop_release=false` and
`p2p_control_plane_env_ready=false`. The attempt timed out at
`http://192.168.1.192:8949/api/tasks/delegate`; it is not successful route
proof and does not close second-PC route/CPU/matrix or hosted relay gates. The
architecture remains local executor plus web control plane: MUSU Desktop does
local execution, while MUSU.PRO accepts remote input, hosts project rooms,
coordinates rendezvous/path selection, issues fallback relay only after direct
path failure, and records evidence.

**2026-06-07 post-research CPU matrix update**: After supplementing the
agent-control SaaS research and AG UI/UX design, current HEAD
`13dcd4677fde12daa6454b4064ca14da55b3a3ae` has clean packaged HUGH_SECOND
runtime CPU evidence:
`20260607-141207-HUGH_SECOND.current-head-target-route.runtime-cpu-scenario-matrix.json`,
`20260607-141207-HUGH_SECOND.current-head-target-route.runtime-cpu-scenario-matrix.verification.json`,
and
`20260607-141207-HUGH_SECOND.current-head-target-route.post-route-target.verification.json`.
The full matrix and post-route target verifier both pass with `ok=true` and
`fail_count=0`; every scenario has hot process count `0`, MUSU `0`, Node `0`,
and owned WebView2 max `0.13`. The route target remains unreachable at
`http://192.168.1.192:8949/api/tasks/delegate`, so this is current
failed-route CPU diagnostic evidence only. It does not close successful
second-PC route proof, second-PC CPU/matrix, live MUSU.PRO relay proof,
support, or Store gates.

**2026-06-03 gate update**: Hosted P2P release evidence now requires relay
payload transport proof separately from relay lease control-plane proof.
`verify-p2p-control-plane-evidence.ps1` fails unless
`relay_status.relay_transport_wired=true` and
`relay_transport.relay_transport_descriptor_wired=true`,
`relay_transport.ok=true`, `relay_transport.relay_transport_wired=true`,
`relay_transport.relay_default_data_path=false`,
`relay_transport.payload_transit_requires_lease=true`, `relay_transport.relay_url`
starts with `wss://`, `relay_leases.relay_transport_wired=true`, and the live
evidence contains owner-scoped release-grade relay route evidence with
`count > 0` and `relay_transport_proven=true`. KV/Upstash owner-scoped lease
storage alone is no longer enough to pass the public P2P gate.

**2026-06-03 relay fallback payload-gap update**: Runtime
`relay_fallback` evidence now records whether relay payload transport was
attempted and proven. Current bridge forwarding records
`payload_transport_attempted=false`, `payload_transport_proven=false`, and
`payload_transport_failure_class=relay_payload_transport_not_implemented` when
a relay lease is issued because the relay payload path remains unwired.

**2026-06-05 relay connect preflight update**:
`/api/v1/relay/connect` is now an authenticated release-connect preflight
endpoint instead of an always-501 placeholder. `GET` returns
`musu.relay_connect.v1` status behind P2P control auth. `POST` validates
`lease_id`, `session_id`, `source_node_id`, and `target_node_id`, queries the
owner-scoped relay lease store, and only then reports whether a release connect
attempt can proceed. Current source still returns `409` for a verified lease
because `RELAY_PAYLOAD_ENDPOINT_IMPLEMENTED=false` and
`RELAY_TRANSPORT_KIND=websocket_tunnel`, not the required release relay tunnel
kind `quic_relay_tunnel`. `quic_tls_1_3` remains the required release
encryption/proof contract. This removes the source-level connect placeholder
blocker without implementing release-grade relay payload transport.

**2026-06-06 relay connect strict metadata update**:
`POST /api/v1/relay/connect` is strict metadata-only preflight. The request may
include optional `schema=musu.relay_connect_request.v1`, but only `lease_id`,
`session_id`, `source_node_id`, and `target_node_id` are accepted. Unknown
fields are rejected, and known payload byte fields (`payload`, `payload_base64`,
`payload_b64`, `payload_bytes`, `body_base64`) are rejected before lease lookup
with `relay_connect_payload_bytes_not_accepted`. This keeps the release connect
surface from becoming an accidental payload ingress path while the actual
release relay tunnel payload transport remains unwired.

**2026-06-06 release payload preflight update**:
`/api/v1/relay/payload` now exists as a distinct authenticated release payload
preflight surface, separate from the preview store-forward queue at
`/api/v1/p2p/relay/payload`. It validates P2P control auth, accepts only
metadata needed to find an owner-scoped relay lease, and returns
`musu.relay_payload_preflight.v1` with `release_payload_accepted=false`,
`payload_stored=false`, and `payload_transported=false` while
`RELAY_PAYLOAD_ENDPOINT_IMPLEMENTED=false`. It does not call queue storage and
does not emit delivery or transport proof. This prepares the release endpoint
contract without treating the preview queue as release-grade relay transport.
As of the byte-rejection hardening pass, this endpoint also rejects known
payload byte fields such as `payload_base64`, `payload`, `payload_b64`,
`payload_bytes`, and `body_base64` with
`release_payload_bytes_not_accepted` before lease lookup. Release clients must
send only relay lease and tunnel payload metadata here until real release
tunnel payload transport exists. The request schema is strict: aside from the
optional `schema=musu.relay_payload_preflight_request.v1`, only `lease_id`,
`session_id`, `source_node_id`, `target_node_id`, `tunnel_id`,
`payload_kind=forwarded_task_envelope`, and 64-hex `payload_sha256` are
accepted. `tunnel_id`, `payload_kind`, and `payload_sha256` are required before
lease lookup so a metadata-only preflight cannot look like an underspecified
release tunnel payload path. Lease-verified fail-closed responses echo
`release_payload_metadata`, but still keep `release_payload_accepted=false`,
`payload_stored=false`, and `payload_transported=false`.

**2026-06-06 P2P env status release payload terminology update**:
`show-musu-pro-p2p-env-status.ps1` now reports release payload terminology as
three separate source facts. `release_payload_preflight_endpoint_implemented`
means `/api/v1/relay/payload` exists as metadata-only release preflight.
`release_tunnel_payload_endpoint_missing` means the actual release tunnel
payload endpoint is still not implemented because
`RELAY_PAYLOAD_ENDPOINT_IMPLEMENTED=false`.
`preview_store_forward_payload_queue_non_release_grade` means
`/api/v1/p2p/relay/payload` remains the non-release preview queue fallback. The
legacy `release_payload_endpoint_queue_only` field remains only as an evidence
compatibility alias and must not be read as the release preflight endpoint
state. Current status correctly stays No-Go until a distinct release tunnel
payload endpoint, `quic_relay_tunnel` transport kind, `quic_tls_1_3` proof,
live route transport proof, and relay payload delivery proof exist.

**2026-06-06 relay transport proof peer identity binding update**:
`musu.relay_transport_proof.v1` now carries peer identity binding fields:
`peer_identity_verified`, `peer_identity_method`, and `peer_public_key`. The
release verifier, route-evidence API, stored proof filter, and Rust cloud DTOs
now require the relay transport proof identity to match the route evidence
identity. Current release-grade identity method is
`quic_tls_cert_fingerprint`, and the public key/fingerprint value must be
`sha256:`-prefixed. Relay proof is therefore bound to the same session, lease,
source, target, tunnel, transport kind, encryption proof, and peer identity
claim before it can help satisfy hosted P2P release evidence.

**2026-06-06 relay payload delivery proof release metadata update**:
`musu.relay_payload_delivery_proof.v1` now carries `relay_url`,
`transport_kind`, `relay_default_data_path`, and `release_grade`. Release
route evidence requires delivery proof to use `transport_kind=quic_relay_tunnel`,
`release_grade=true`, `relay_default_data_path=false`, and a `wss://` relay URL
matching the relay transport proof. Stored payload records must also match
those release metadata fields. Preview queue records remain
`transport_kind=http_store_forward_preview` and `release_grade=false`, so they
can prove preview drain behavior but cannot satisfy hosted P2P release relay
payload delivery proof.

**2026-06-06 relay transport kind/encryption split update**:
Relay tunnel kind and encryption/proof are now separate source and evidence
fields. API preflight/status responses expose
`release_grade_relay_transport_kind=quic_relay_tunnel` and
`release_grade_transport_required=quic_tls_1_3`. Verifiers require
`relay_transport_kind` to match `quic_relay_tunnel`; they still require
release-grade proof/encryption to be `quic_tls_1_3`. Current source remains
non-release-grade because `RELAY_TRANSPORT_KIND=websocket_tunnel`,
`RELAY_PAYLOAD_ENDPOINT_IMPLEMENTED=false`, and hosted relay payload transport
proof is absent.

**2026-06-06 room work-order command audit update**:
`POST /api/rooms/[roomId]/work-orders` now writes a privacy-preserving
`rooms.work_orders` command audit event after P2P control auth whenever MUSU.PRO
room input reaches the local bridge handoff, fails bridge forwarding, or is
rejected after auth. The audit record includes the authenticated owner key,
room/work-order/company/project context, target node, `origin=musu.pro`, result,
HTTP status, bridge status, and trace id. It intentionally excludes the
instruction body so command audit remains a control-plane forensic trail rather
than a prompt/content store.

**2026-06-06 idle busy-loop source-contract update**:
The P2P/control-plane release posture now includes an explicit idle busy-loop
candidate source contract. `write-release-go-no-go.ps1` must continue exposing
all eight idle candidates: clipboard polling, mDNS discovery, health check
retry loop, bridge readiness wait loop, frontend interval/refetch, relay
payload target poller, cloud heartbeat, and log/telemetry flush loop.
`test-release-evidence-verifiers.ps1` fails if the candidate inventory,
`idle_busy_loop_candidate_status`,
`idle_busy_loop_candidate_contract_verified`, or the
`idle-busy-loop-candidates` blocker is removed. This does not change the
MUSU.PRO role: hosted web remains control-plane/evidence/room input, while
local MUSU Desktop processes execute work and own the idle resource budget.

**2026-06-06 packaged local evidence update**:
Current packaged local evidence on `HUGH_SECOND` now proves that the installed
MUSU Desktop runtime can pass single-machine smoke, desktop-open idle CPU, the
full runtime CPU scenario matrix, and a targeted failed HUGH-MAIN route CPU
diagnostic without requiring the localhost developer dashboard. Clean go/no-go
reports `single_machine_verified=true`,
`runtime_cpu_second_pc_route_attempt_verified=true`, and
`msix_current_legacy_conflicts_ok=true`, but public release remains blocked on
real second-PC multi-device evidence, two-machine CPU/matrix counts, live
MUSU.PRO owner-scoped relay proof, support mailbox evidence, and Store evidence.
This preserves the control-plane boundary: MUSU.PRO can receive remote user
input and coordinate project/company rooms, presence, rendezvous, path
selection, relay fallback, and evidence, but local MUSU Desktop programs still
execute the work on each device.

**2026-06-08 room work-order drain delivery ack update**:
The hosted-safe room work-order flow now has an explicit server delivery ack
protocol. Local Desktop/CLI drains claim owner-scoped queued work, hand it to
the local bridge, then `PATCH /api/rooms/[roomId]/work-orders` with schema
`musu.room_work_order_delivery.v1`. MUSU.PRO records `accepted` when the bridge
returns a task id, `queued` when local handoff failed and the work should be
retried, and `failed` for terminal failure. The Rust drain client now requires
the server ack outcome to match the requested delivery status; `ack.ok` alone
does not prove state alignment.

This preserves the boundary: MUSU.PRO receives remote input, stores the inbox,
and records claim/delivery state, while the installed local MUSU program owns
bridge handoff and local execution. Current diagnostic smoke remains No-Go
because this machine lacks MUSU.PRO login and an owner-scoped P2P control token.

**2026-06-07 support mailbox request packet update**:
`prepare-support-mailbox-verification-request.ps1` now creates a support-only
operator request packet with schema
`musu.support_mailbox_verification_request.v1`. It outputs an email template,
verification token, record command, checksums, and zip under ignored
`.local-build\support-mailbox-requests`, and always reports
`release_gate_satisfied=false`. This updates the external gate workflow only:
support proof still requires a real delivered message recorded by
`record-support-mailbox-verification.ps1`. Support mailbox
request/record/verify/operator-card scripts are freshness status-only tooling
and do not change the local-executor boundary.

**2026-06-06 desktop clean-start evidence update**:
After runtime relay candidate coverage carry, the current local-sideload MSIX
was rebuilt, reinstalled, and revalidated on `HUGH_SECOND` as MUSU Desktop.
Strict MSIX install evidence passed with the WindowsApps execution alias first.
Single-machine smoke passed as `local-bridge-only` at
`http://127.0.0.1:4751`. Desktop-open CPU evidence passed for `60.043s` with
hot process count `0`, WebView2 max one-core CPU `0.23`, and working set
`363.69MB`. The full runtime CPU scenario matrix passed for `startup-open`,
`runtime-started`, `dashboard-open`, `desktop-open`, and `post-route` with route
token `MUSU_CPU_SCENARIO_ROUTE_OK_20260606_171403`. Clean go/no-go now
recognizes one-machine current evidence again: single-machine true, MSIX
install true, runtime idle CPU `1/2`, and runtime matrix `1/2`.
This update clarifies the product boundary again: a refused `localhost:3001`
dashboard page is not the packaged desktop contract. MUSU Desktop is the local
executor; MUSU.PRO is remote input, project/company room, AI meeting room,
presence, rendezvous, path selection, relay fallback, and evidence/control
plane. Public release remains blocked until a second Windows PC, live hosted
MUSU.PRO P2P/relay proof, support mailbox, and Store evidence are recorded.

**2026-06-06 crash-recovery contract update**:
The local runtime startup contract now includes stale bridge registry cleanup.
If `~/.musu/services/bridge.json` points to a dead bridge PID, `musu up`
removes the stale record before probing bridge health and before starting a new
bridge. `musu up --json` reports `stale_bridge_registry_removed` and
`stale_bridge_registry_pid` for operator evidence. This is enforced by
`audit-musu-crash-recovery-contract.ps1` and final go/no-go reports
`crash_recovery_contract_verified`.

This update is local runtime hardening only. It does not move execution into
MUSU.PRO, and it does not make `localhost:3001` a packaged runtime dependency.
MUSU Desktop remains the local executor; MUSU.PRO remains remote input,
project/company room, AI meeting room, presence, rendezvous, path selection,
relay fallback coordination, and evidence/control plane.

**2026-06-06 current HEAD reinstall crash-recovery evidence update**:
The crash-recovery source contract was rebuilt into the current local-sideload
MSIX and reinstalled on `HUGH_SECOND` as
`Yellowhama.MUSU_1.15.0.0_x64__ygcjq669as2b6`. Packaged `musu up --json`
exposes `stale_bridge_registry_removed` and `stale_bridge_registry_pid`. A
dynamic stale registry simulation removed dead PID `999999`, started a healthy
bridge at `127.0.0.1:3678`, and passed
`audit-musu-crash-recovery-contract.ps1` with `ok=true` and `fail_count=0`.
Canonical single-machine evidence
`docs\evidence\single-machine\1.15.0-rc.1\20260606-195631-HUGH_SECOND.evidence.json`
passed as `local-bridge-only`; canonical desktop-open CPU evidence
`docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260606-200405-HUGH_SECOND.desktop-open.evidence.json`
passed with hot process count `0`, MUSU `0`, Node `0`, WebView2 `0.08`, and
working set `178MB`.

This evidence closes the package/source mismatch for local crash recovery. It
still does not complete public P2P release: current proof is one-machine only,
the current reinstall matrix lacks `post-route`, live MUSU.PRO runtime
login/storage is still absent, and release `quic_relay_tunnel` transport plus
payload delivery proof remain open.

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
- `GET /api/v1/relay/connect`
  - requires P2P control bearer auth before returning release-connect preflight
    status
- `POST /api/v1/relay/connect`
  - requires P2P control bearer auth
  - validates an owner-scoped relay lease by `lease_id`, `session_id`,
    `source_node_id`, and `target_node_id`
  - accepts optional `schema=musu.relay_connect_request.v1`
  - rejects payload byte fields before lease lookup
  - rejects unknown request fields instead of passing them through
  - currently remains non-release-grade until the distinct release tunnel
    payload endpoint, `quic_relay_tunnel` relay kind, and `quic_tls_1_3`
    transport proof exist
- `GET /api/v1/relay/payload`
  - requires P2P control bearer auth before returning release payload preflight
    status
- `POST /api/v1/relay/payload`
  - requires P2P control bearer auth
  - requires `lease_id`, `session_id`, `source_node_id`, `target_node_id`,
    `tunnel_id`, `payload_kind=forwarded_task_envelope`, and 64-hex
    `payload_sha256` before owner-scoped lease lookup
  - validates the owner-scoped relay lease metadata before any release payload
    decision
  - currently remains fail-closed with `relay_payload_endpoint_not_wired`,
    `release_payload_accepted=false`, `payload_stored=false`, and
    `payload_transported=false`
  - echoes `release_payload_metadata` only after lease verification, as
    metadata evidence rather than payload transit proof
  - rejects payload byte fields before lease lookup while it is preflight-only
  - rejects unknown request fields instead of passing them through
  - must not reuse `/api/v1/p2p/relay/payload` queue storage as release-grade
    transport

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
- When the receiving target accepts a forwarded task through
  `/api/tasks/forward`, it now writes an `audit_log` row with the real peer IP
  from `ConnectInfo`, `cross_machine=true`, `status_code=202`, and bounded
  task/source/rendezvous identifiers. Prompt text, cwd, callback URL, model, and
  adapter metadata are intentionally excluded from the audit note.
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
- `musu route --explain` is a preflight diagnostic and must not trust
  registry/rendezvous metadata claims such as `peer_identity_verified=true` or
  `encryption=quic_tls_1_3`. As of 2026-06-02 22:18 KST, explain output only
  reports advertised key material as
  `advertised_tls_cert_fingerprint_unverified` and keeps
  `peer_identity_verified=false` / `encryption=none_http_bearer` until a real
  runtime transport proof exists.

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
    "failure_class": "relay_lease_denied",
    "payload_transport_attempted": false,
    "payload_transport_proven": false,
    "payload_transport_failure_class": null
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
- Treats issued relay fallback addenda as non-release-grade unless payload
  transport state is explicit. Current runtime-issued fallback evidence records
  `payload_transport_attempted=false`, `payload_transport_proven=false`, and
  `payload_transport_failure_class=relay_payload_transport_not_implemented`
  because the relay payload path is still not wired.
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
  - code-level relay payload endpoint implementation marker enabled
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
- Registry heartbeat hardware metadata is low-duty: it is process-cached in the
  runtime, Windows RAM/CPU metadata uses native Win32 probes instead of default
  PowerShell/WMIC process spawning, and remaining external probes must be
  timeout-bounded.
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

## 2026-06-02 Deployment Boundary Note

The public marketing/support surface at `https://musu.pro` is already
production-deployed for the current scroll/logo/emerald accent scope. Live QA
passed on `/`, `/landing`, `/pricing`, and `/install` across desktop/mobile.
That deployment does not satisfy the P2P control-plane release gate.

The remaining `musu.pro` work for public desktop release is operational control
plane evidence:

- configure production `MUSU_P2P_CONTROL_TOKEN_SHA256S` or equivalent scoped
  auth
- deploy/reload the Vercel production environment after the env change
- rerun `record-p2p-control-plane-evidence.ps1` without `-AllowUnverified`
- require owner-scoped relay lease query success while keeping
  `relay_default_data_path=false`

Public web deploy status and P2P control-plane readiness are separate gates.

## 2026-06-02 Current-Head Evidence Boundary

After relay idle hardening, the desktop dashboard no longer treats the cloud
relay as idle background work:

- no mount-time `/api/account/relay-token` fetch
- no automatic relay WebSocket just because a node is selected
- relay token fetch and relay WebSocket open occur only after explicit
  `Connect`

This clarifies the product contract for `musu.pro`:

- `musu.pro` is the account/rendezvous/lease/control-plane surface.
- `musu.pro` must not be described as the default payload data path.
- Release evidence must prove owner-scoped relay/control auth before P2P
  control-plane readiness can pass.
- Store/public copy may mention account-assisted setup only as beta/control
  plane support until real two-machine route evidence proves identity,
  encryption, route kind, and payload-transit truth.

Current go/no-go at 2026-06-02 12:05 KST remains No-Go even though primary
desktop CPU evidence passes. The remaining P2P-specific blocker is still live
owner-scoped `musu.pro` evidence: configure production scoped auth, redeploy or
reload production, and rerun evidence without `-AllowUnverified`.

## 2026-06-02 Post-Reconnect Evidence Status

The post-reconnect primary evidence refresh confirms that MUSU's local packaged
desktop runtime can stay under the idle CPU budget on `HUGH_SECOND`, including
`post-route` measurement. This is useful hardening evidence but it is not a
P2P control-plane completion signal.

Current product interpretation:

- `musu.pro` remains the account/rendezvous/lease/control-plane surface, not
  the default payload data path.
- The local runtime can use `musu.pro` only for assisted discovery, candidate
  exchange, lease policy, and route evidence until relay/tunnel transport is
  implemented and proven.
- Production release still requires owner-scoped live control-plane evidence,
  two-machine route evidence, and CPU/matrix evidence from both machines.
- A machine-wide pile of unrelated Node.js processes is not sufficient release
  evidence either way; evidence must classify MUSU-owned helpers separately
  from repo-related or unrelated processes.

## 2026-06-02 Route Explain and Primary Evidence Update

`musu route --explain` is now explicitly an advertised-metadata diagnostic.
Registry or rendezvous metadata must not be treated as verified peer identity
or release-grade encryption. Even when advertised fingerprint material exists,
candidate explain output remains `peer_identity_verified=false`,
`peer_identity_method=advertised_tls_cert_fingerprint_unverified`, and
`encryption=none_http_bearer` until runtime route evidence proves the
transport.

Fresh primary local evidence after commit `93025897` confirms the current
packaged desktop is quiet locally: desktop-open CPU records MUSU `0`, Node `0`,
WebView2 `0.39`, working set `365.49MB`, and hot `0`; process ownership
records MUSU-owned Node `0` even though the machine has `16` unrelated Node
processes. This is local hardening evidence only. The P2P control-plane gate
still requires production KV-backed owner-scoped relay leases, and the route
gate still requires release-grade two-machine transport proof.

## 2026-06-02 Relay Route Lease-Proof Requirement

The route-evidence API now requires explicit relay lease proof before a
`route_kind=relay` record can be considered release-grade. Relay evidence must
prove direct path failure, lease request, `status=issued`, `lease_issued=true`,
a non-empty lease id, at least one prior non-relay attempted route kind, and no
relay policy blockers.

This keeps relay fallback aligned with the Connect/Pro policy boundary:
`musu.pro` may issue a relay lease after direct path failure, but a payload
route cannot become release-grade by simply claiming `route_kind=relay` and
infra transit. Missing or denied lease proof remains stored as audit evidence
with blockers such as `relay_route_missing_lease_proof`,
`relay_route_lease_not_issued`, or `relay_route_lease_blocked`.

## 2026-06-03 Relay Fallback Payload-Gap Requirement

Relay lease issuance is not relay payload transport proof. Runtime
`relay_fallback` evidence now carries `payload_transport_attempted`,
`payload_transport_proven`, and optional `payload_transport_failure_class`.

Current bridge forwarding sets both booleans to `false` and records
`relay_payload_transport_not_implemented` when a relay lease is issued after
terminal direct-route failure. Hosted route-evidence grading adds blockers
`relay_fallback_payload_transport_not_attempted`,
`relay_fallback_payload_transport_not_proven`, and
`relay_fallback_payload_transport_not_implemented` for issued fallback addenda
that lack actual payload transport proof.

This keeps `musu.pro` on the control-plane and policy boundary until real
relay/tunnel transport can emit release-grade `musu.relay_transport_proof.v1`.

## 2026-06-03 Post Forwarded-Task Audit Evidence Update

The Rust bridge target now writes an `audit_log` row when
`/api/tasks/forward` accepts and spawns forwarded cross-machine work. The row
records the `ConnectInfo` peer IP, `cross_machine=true`, status `202`,
company id, and bounded task/source/rendezvous identifiers while excluding
prompt text, cwd, callback URL, model, and adapter metadata.

Fresh primary packaged evidence after this source change confirms the local
desktop remains quiet on `HUGH_SECOND`: desktop-open CPU records MUSU `0.03`,
Node `0`, WebView2 `0.08`, working set `454.06MB`, private memory `265.8MB`,
and hot `0`; process ownership records MUSU-owned Node `0` even though the
machine has `19` machine-wide Node processes.

This is local auditability and runtime-hardening evidence only. The P2P
control-plane gate still requires production KV-backed owner-scoped relay
lease evidence from `musu.pro`, and the route gate still requires
release-grade two-machine transport proof.

## 2026-06-03 External Recheck Evidence Contract

The release evidence spec now includes
`musu.external_release_gate_recheck.v1`, written by
`scripts\windows\record-external-release-gate-recheck.ps1`.

This artifact is the operator-level snapshot that ties together:

- final go/no-go state
- second-PC reachability
- `musu.pro` P2P env readiness
- live P2P control-plane evidence

Clean evidence `20260603-050915-HUGH_SECOND.external-gates` confirms the
current boundary: local artifacts and single-machine evidence are ready, but
`musu.pro` still lacks KV/Upstash-backed owner-scoped relay lease proof. Live
P2P evidence `20260603-051044-musu.pro` uses the packaged WindowsApps alias and
still fails with `p2p_relay_lease_kv_not_configured`.

This does not make `musu.pro` a payload data path. `musu.pro` remains the
account/rendezvous/path-selection/lease control plane until route evidence
proves release-grade transport and explicit relay lease policy.

## 2026-06-03 Bounded External Probe Evidence

The external release evidence contract now records bounded second-PC
reachability under `second_pc_reachability`:

- `probe_method=bounded_ping_and_tcp`
- `probe_timeout_ms`
- `ping_elapsed_ms`
- `tcp_elapsed_ms`
- `tcp_error`

Clean evidence `20260603-052447-HUGH_SECOND.external-gates` keeps the same
product conclusion: local artifacts are ready, but second-PC reachability is
false and live P2P evidence `20260603-052547-musu.pro` still fails owner scope
with `p2p_relay_lease_kv_not_configured`.

## 2026-06-03 Primary Evidence After Relay Store Status

Fresh primary-machine evidence after the relay lease store status hardening
confirms the local runtime remains quiet, but it does not close any P2P
control-plane or payload-transport gate.

Current primary evidence:

- single-machine:
  `20260603-062456-HUGH_SECOND`
- desktop-open idle CPU:
  `20260603-062633-HUGH_SECOND.desktop-open`
- runtime CPU scenario matrix:
  `20260603-063400-HUGH_SECOND.runtime-cpu-scenario-matrix`
- route token:
  `MUSU_CPU_SCENARIO_ROUTE_OK_20260603_063400`

Product interpretation:

- `musu.pro` remains the account, rendezvous, path-selection, and relay lease
  control plane.
- Primary local evidence proves local desktop resource quality only.
- P2P readiness still requires live owner-scoped KV/Upstash relay lease
  evidence with `relay_default_data_path=false`.
- Relay payload transport still requires separate implementation and evidence;
  relay lease status alone is not payload transit proof.

## 2026-06-03 External Recheck CLI Override

`record-external-release-gate-recheck.ps1` now accepts `-MusuExe` and passes it
through to the live P2P control-plane evidence recorder. This keeps the external
gate evidence path aligned with current-source CLI schema changes before a new
MSIX package is rebuilt and installed.

Clean evidence `20260603-065918-HUGH_SECOND.external-gates` used
`.\musu-rs\target\debug\musu.exe` and produced P2P evidence
`20260603-070018-musu.pro` with `musu_exe_source=parameter`. The live P2P
result remains failed: `relay_lease_store_backend=unconfigured`,
`relay_lease_store_release_grade=false`, and
`p2p_relay_lease_kv_not_configured`.

This is an evidence fidelity improvement, not a P2P completion. The product
state remains unchanged: `musu.pro` is the control plane, not the default
payload data path, until owner-scoped storage and relay/QUIC payload transport
are implemented and proven.

## 2026-06-03 Relay Transport Gate Hardening

The P2P control-plane verifier now treats relay lease control-plane proof and
relay payload transport proof as two separate release gates.

Required live evidence fields:

- `relay_status.relay_transport_wired=true`
- `relay_leases.relay_transport_wired=true`
- `relay_route_evidence.relay_transport_proven=true`
- `relay_route_evidence.count > 0`
- `relay_default_data_path=false`
- owner-scoped relay lease query succeeds against release-grade KV/Upstash
  storage
- owner-scoped route evidence query filters `route_kind=relay`,
  `result=success`, and `release_grade=true`

Current live evidence `20260603-093640-musu.pro` fails with `fail_count=13`.
The failure includes the existing KV/Upstash storage blocker, the explicit
transport blocker, and the route-evidence proof blocker:

- `relay status transport wired=false`
- `relay leases transport wired=false`
- `relay route evidence count=0`
- `relay payload transport proven=false`
- `live_evidence_relay_transport_not_wired`
- `live_evidence_relay_route_not_proven`

Product boundary:

- `musu.pro` may coordinate accounts, rendezvous, candidate exchange,
  path selection, route evidence, and relay leases.
- `musu.pro` must not be treated as a release-grade payload route until the
  relay/tunnel transport is implemented and route evidence proves which path
  carried the payload.
- Operators must not set `MUSU_P2P_RELAY_TRANSPORT_WIRED=1` as a workaround;
  that flag is only acceptable after real payload transport has been
  implemented, the payload endpoint implementation marker has been enabled, and
  owner-scoped release-grade relay route evidence has recorded the actual data
  path.

## 2026-06-03 Relay Transport Descriptor Gate

The hosted control plane now exposes a dedicated relay transport
descriptor/preflight endpoint:

- `GET /api/v1/p2p/relay/transport`
- schema `musu.p2p_relay_transport.v1`
- CLI audit surface `musu relay transport --json`
- CLI schema `musu.relay_transport.v1`

The descriptor is required in live P2P evidence. It must report:

- `owner_scope_verified=true`
- `owner_scoped=true`
- `relay_transport_descriptor_wired=true`
- `relay_transport_wired=true`
- `relay_payload_endpoint_wired=true`
- `relay_default_data_path=false`
- `payload_transit_requires_lease=true`
- `relay_url` using `wss://`
- `release_grade_transport_required=quic_tls_1_3`
- `relay_lease_store_release_grade=true`
- no transport preflight blockers

This endpoint is a fail-closed preflight/descriptor gate only. It does not
implement relay/tunnel payload transport and does not by itself prove that a
relay route carried payload. The release gate still requires owner-scoped
release-grade relay route evidence with `relay_transport_proven=true` and
`count > 0`.

## 2026-06-03 Relay Route Evidence Stored Lease Gate

`POST /api/v1/p2p/route-evidence` now verifies release-grade
`route_kind=relay` evidence against the owner-scoped relay lease store.

Relay route evidence cannot become release-grade by presenting only an
issued-looking `relay_fallback.lease_id`. The route evidence API now requires a
stored relay lease matching:

- owner key derived from the bearer token
- `session_id`
- `source_node_id`
- `target_node_id`
- `lease_id`
- attempted route kind set

New non-release-grade blockers:

- `relay_route_lease_not_found`
- `relay_route_lease_attempts_mismatch`
- `relay_route_lease_store_unavailable:<detail>`

Validation passed `npx tsx --test src/app/api/v1/p2p/route-evidence/route.test.ts`
13/13, `npm run test:p2p` 29/29, `npm run typecheck`, and `git diff --check`.

This is evidence-chain hardening, not relay payload transport completion. Public
release still requires real relay/tunnel payload transport and live
owner-scoped release-grade relay route evidence on `musu.pro`.

## 2026-06-03 Relay Transport Proof Gate

Release-grade relay route evidence now requires a dedicated
`relay_transport_proof` object:

- schema `musu.relay_transport_proof.v1`
- `session_id` matching the route evidence session
- `lease_id` matching the issued relay lease
- `source_node_id` matching the route evidence source node
- `target_node_id` matching the route evidence target node
- non-empty `transport_kind`, `tunnel_id`, and timestamps
- `relay_url` using `wss://`
- `payload_bytes_transited > 0`
- `payload_transited_musu_infra=true`
- `encryption=quic_tls_1_3`
- `transport_verified_by=musu_quic_tls_transport`

This prevents a stored relay lease from being mistaken for payload transit
proof. Current bridge forwarding does not emit this proof; future relay/tunnel
runtime code must generate it from the actual relay data path before hosted
P2P evidence can pass the release gate.

## 2026-06-05 Relay Transport Proof Peer Binding Gate

Inline relay transport proof is now peer-bound. `POST /api/v1/p2p/route-evidence`
rejects malformed inline relay transport proof without `source_node_id` and
`target_node_id`, and keeps relay evidence non-release-grade when either field
does not match the route evidence source/target pair.

Stored `release_grade=true` relay queries also revalidate the current relay
transport proof against the same peer pair. This prevents proof reuse across
different source/target routes.

Rust `RouteRelayTransportProof` now serializes the same fields, so local DTOs
and hosted proof shape stay aligned.

This is evidence-chain hardening only. It does not implement release relay
tunnel payload transport and does not change the local-executor product model.

## 2026-06-03 Relay Payload Endpoint Fail-Closed Gate

`MUSU_P2P_RELAY_TRANSPORT_WIRED=1` is no longer sufficient for hosted P2P relay
readiness. `relayTransportWired()` now requires both the env flag and an
explicit code-level payload endpoint implementation marker.

Current source keeps that marker false because `/api/v1/relay/connect` payload
transport is not implemented. As a result:

- `GET /api/v1/p2p/relay/transport` reports
  `relay_payload_endpoint_wired=false`.
- The relay transport preflight includes `relay_payload_endpoint_not_wired`.
- `POST /api/v1/p2p/relay/lease` refuses env-only fallback leases.
- Relay route evidence cannot become release-grade while the payload endpoint
  marker is false, even if a stored lease and `relay_transport_proof` JSON are
  present.

This is fail-closed release hardening, not relay/tunnel payload transport
completion.

## 2026-06-05 Local/Web Split And One-Machine Evidence State

The product boundary is now restated as a release invariant:

- `musu.pro` is the web control plane for remote user input, project rooms,
  company-room coordination, room presence, rendezvous, path selection, relay
  fallback coordination, and evidence.
- Local MUSU programs on each device are the execution plane. They run the
  agent runtime, access local files/processes, perform local browser/app
  automation, and exchange payloads through P2P mesh paths when available.
- A user may enter a work order through `musu.pro` from another location, but
  the selected local MUSU program performs the work locally.
- Route order remains `lan`, `tailscale`, `direct_quic`, then `relay`.
- Relay remains a Connect/Pro fallback and cannot be the default payload data
  path.

After room work-order auth hardening, primary packaged evidence was refreshed on
`HUGH_SECOND` for commit `aa52b243cb6b1b8350f060516e72c26d730da059`:

- single-machine:
  `docs\evidence\single-machine\1.15.0-rc.1\20260605-004553-HUGH_SECOND.evidence.json`
- desktop-open CPU:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260605-004657-HUGH_SECOND.desktop-open.evidence.json`
- runtime CPU matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260605-004808-HUGH_SECOND.runtime-cpu-scenario-matrix.json`

This proves current local primary-machine behavior only. Multi-device release
work still requires installing the current build on another Windows PC and
returning second-PC route, CPU, matrix, and owner-scoped release-grade P2P
evidence. `/api/v1/relay/connect` is now P2P-control-auth gated, but the
release-grade relay/tunnel payload transport remains unwired.

## 2026-06-05 Room Work-Order Web-Input Auth

`POST /api/rooms/[roomId]/work-orders` is the MUSU.PRO room entry point that can
turn a remote user instruction into a local bridge task. It now requires P2P
control auth before forwarding to `/api/tasks/delegate`.

This locks the web-input/control-plane boundary:

- unauthenticated web input cannot reach a local executor
- the local bridge token stays server-side
- successful responses record `owner_scoped=true`
- the room/work-order context remains bounded before forwarding

This is not a P2P transport completion. It is required security hardening for
the product model where `musu.pro` accepts work orders while local MUSU programs
execute them.

## 2026-06-05 Post Room Work-Order Auth Evidence Refresh

Fresh primary-machine evidence was restored after the room work-order auth
hardening above:

- single-machine smoke:
  `docs\evidence\single-machine\1.15.0-rc.1\20260605-004553-HUGH_SECOND.evidence.json`
- desktop-open CPU:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260605-004657-HUGH_SECOND.desktop-open.evidence.json`
- runtime CPU matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260605-004808-HUGH_SECOND.runtime-cpu-scenario-matrix.json`

The single-machine smoke output was
`MUSU_RELEASE_SMOKE_OK_20260605_004448`; desktop-open CPU stayed at MUSU `0`,
Node `0`, WebView2 `0.39`, working set `489.86MB`, hot `0`; and the five-state
matrix passed with route token `MUSU_CPU_SCENARIO_ROUTE_OK_20260605_004808`.

This keeps the current one-machine local executor evidence fresh. It still does
not prove multi-device P2P, hosted relay payload transport, or owner-scoped
release-grade route evidence on `musu.pro`.

## 2026-06-06 Post Relay Payload Preflight Evidence Update

After the distinct `/api/v1/relay/payload` preflight endpoint, HUGH_SECOND was
rebuilt and revalidated as the current one-machine packaged desktop executor.

Current evidence:

- MSIX install:
  `docs\evidence\msix-install\1.15.0-rc.1\20260606-001948-HUGH_SECOND.evidence.json`
- single-machine local bridge-only smoke:
  `docs\evidence\single-machine\1.15.0-rc.1\20260606-002102-HUGH_SECOND.evidence.json`
- desktop-open idle CPU:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260606-002155-HUGH_SECOND.desktop-open.evidence.json`
- five-scenario runtime CPU matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260606-003003-HUGH_SECOND.runtime-cpu-scenario-matrix.json`
- targeted HUGH-MAIN post-route CPU diagnostic:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260606-004121-HUGH_SECOND.runtime-cpu-scenario-matrix.json`

This confirms the one-machine local executor path only. It does not complete
multi-device P2P, live owner-scoped hosted P2P proof, or release-grade relay
payload transport.

Release relay payload state remains:

- `/api/v1/relay/payload` is a release preflight endpoint.
- `/api/v1/p2p/relay/payload` is a non-release-grade preview queue.
- `RELAY_PAYLOAD_ENDPOINT_IMPLEMENTED=false`.
- `release_payload_accepted=false`, `payload_stored=false`, and
  `payload_transported=false` are the correct release state until real
  transport is wired and proven.

## 2026-06-06 Runtime CPU Subrole Attribution Evidence Update

Local runtime CPU release evidence now requires process subrole attribution.
This keeps hosted P2P/control-plane work from obscuring the local executor
resource picture.

Required CPU evidence subroles:

- `bridge_runtime`
- `desktop_shell`
- `webview2_helper`
- `node_helper`
- `musu_runtime`
- `other`

Current HUGH_SECOND evidence separates the packaged bridge PID from the desktop
shell PID and WebView2 helper processes:

- single-machine local bridge-only smoke:
  `docs\evidence\single-machine\1.15.0-rc.1\20260606-013337-HUGH_SECOND.evidence.json`
- desktop-open idle CPU:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260606-011243-HUGH_SECOND.desktop-open.evidence.json`
- five-scenario runtime CPU matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260606-012030-HUGH_SECOND.runtime-cpu-scenario-matrix.json`
- targeted HUGH-MAIN post-route CPU diagnostic:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260606-012740-HUGH_SECOND.runtime-cpu-scenario-matrix.json`

This is local auditability and runtime-hardening evidence only. It does not
complete multi-device P2P, live owner-scoped hosted P2P proof, or release-grade
relay payload transport.

## 2026-06-06 Second-PC Runtime CPU Subrole Import Contract

The second-PC return path now enforces the runtime CPU subrole evidence contract
at import time, not only at final go/no-go aggregation.

Release-grade second-PC return imports require:

- `musu.second_pc_release_check.v1` with
  `runtime_cpu_subrole_contract_ok=true`
- `musu.runtime_idle_cpu_evidence.v1` with `process_counts_by_subrole`,
  `max_one_core_percent_by_subrole`, `memory_totals_by_subrole_mb`, and
  `cpu_attribution.top_processes[*].process_subrole`
- `musu.runtime_cpu_scenario_matrix.v1` with the same subrole fields per
  scenario measurement
- `bridge_runtime` present for runtime evidence
- `desktop_shell` present for desktop/startup evidence
- `webview2_helper` present for `desktop-open`

This is an evidence/control-plane import contract. It does not move work to
`musu.pro`; the local MUSU program on the second Windows PC still performs the
install check, CPU sampling, process attribution, and route smoke. `musu.pro`
continues to provide remote input, room/rendezvous/path-selection, and evidence
coordination only.

Older second-PC return archives generated before this contract are diagnostic
only. They cannot satisfy `import-second-pc-return.ps1
-RequireReleaseGateEvidence` or close the public two-machine CPU/matrix gates.

## 2026-06-06 Final Operator Packet Refresh After Subrole Gate

Current operator handoff artifacts are refreshed from clean HEAD
`a45e6a1b75a51cba4276cdf60a452041069fd6c3`:

- final operator packet:
  `.local-build\final-operator-gates\musu-final-operator-gates-1.15.0-rc.1-20260606-020415.zip`
- operator action pack:
  `.local-build\operator-action-pack\MUSU-1.15.0-rc.1-operator-action-pack-20260606-020432.zip`
- second-PC transfer zip:
  `.local-build\operator-action-pack\MUSU-1.15.0-rc.1-operator-action-pack-20260606-020432\second-pc\MUSU-second-PC-transfer-1.15.0-rc.1-20260606-020432.zip`

Both `verify-final-operator-gate-packet.ps1` and
`verify-operator-action-pack.ps1` pass with `ok=true` and `fail_count=0`.

This is an operator-readiness update, not hosted P2P completion. MUSU.PRO
remains the remote input, room, rendezvous, path-selection, relay-fallback, and
evidence control plane. The local MUSU programs still perform work and should
move to direct P2P mesh paths after web-assisted discovery whenever possible.

Release-grade MUSU.PRO proof remains open until live owner-scoped storage/auth,
route evidence, relay transport proof, and payload delivery proof are captured
without unverified bypasses.

## 2026-06-06 Relay Transport Proof Input Boundary

`POST /api/v1/p2p/relay/transport-proof` is a strict metadata-only proof
recorder. It is not the relay payload transport endpoint.

Current contract:

- requires P2P control auth
- requires `schema=musu.relay_transport_proof.v1`
- accepts proof metadata for the actual relay tunnel path:
  `session_id`, `lease_id`, `source_node_id`, `target_node_id`,
  `transport_kind`, `relay_url`, `tunnel_id`, `handshake_ms`,
  `payload_bytes_transited`, `payload_transited_musu_infra`, `encryption`,
  `transport_verified_by`, `opened_at`, and optional `closed_at`
- rejects raw payload byte fields before lease lookup:
  `payload`, `payload_base64`, `payload_b64`, `payload_bytes`, and
  `body_base64`
- rejects unknown fields
- keeps `payload_bytes_transited` as proof metadata only

Release-grade relay transport still requires a distinct `quic_relay_tunnel`
payload path and `quic_tls_1_3` proof emitted from that actual path. The
current source remains `RELAY_TRANSPORT_KIND=websocket_tunnel` and
`RELAY_PAYLOAD_ENDPOINT_IMPLEMENTED=false`, so this is input-boundary hardening
only and does not close hosted P2P release proof.

## 2026-06-06 Current Audit Boundary Update

The latest code audit keeps the same product boundary and release posture.

Current product contract:

- MUSU Desktop is the local executor on every device.
- MUSU.PRO accepts remote user input and coordinates project/company rooms,
  presence, rendezvous, path selection, relay-fallback policy, and evidence.
- MUSU.PRO may make P2P bootstrap easier by exchanging owner-scoped candidate,
  NAT, relay descriptor, room, and route-evidence metadata.
- After bootstrap, direct P2P mesh is the preferred work path.
- Hosted relay remains fallback-only and non-default.

Current release state:

- store-forward relay queue fallback is implemented and audited
- `/api/v1/relay/payload` is a metadata-only, fail-closed release preflight
- `RELAY_PAYLOAD_ENDPOINT_IMPLEMENTED=false`
- `RELAY_TRANSPORT_KIND=websocket_tunnel`
- release tunnel kind required: `quic_relay_tunnel`
- release encryption/proof required: `quic_tls_1_3`
- live production KV/Upstash relay lease storage is missing
- live release-grade relay route proof and payload delivery proof are missing

Validation passed `npm run test:p2p` `90/90`, `npm run typecheck`, P2P
store-forward relay contract audit, Rust background-loop audit, release
verifier regressions `51/51`, `cargo test --lib relay_payload` `24/24`,
`cargo check --bin musu`, and `git diff --check`.

No high/medium code issue was found in this audit. The open risk is
deployment/evidence: second-PC route/CPU/matrix, production hosted P2P proof,
release relay tunnel proof, support mailbox, and Store evidence.

## 2026-06-06 Current HEAD Local CPU Evidence Boundary

Current clean HEAD `2387db2dea5fc983d0d3104b41037642b9939ccc` has fresh
`desktop-open` idle CPU evidence on `HUGH_SECOND`:

- `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260606-071122-HUGH_SECOND.desktop-open.evidence.json`
- `git_dirty=false`
- sample time `60.04s`
- hot process count `0`
- owned MUSU runtime/shell processes `2`
- owned WebView2 helpers `6`
- owned Node helpers `0`
- max WebView2 one-core CPU `0.08`
- working set `363.83MB`

This is local executor health evidence, not hosted P2P completion. It keeps
the same control-plane interpretation:

- MUSU Desktop executes work and owns local CPU/process/resource behavior.
- MUSU.PRO accepts remote input and coordinates rooms, presence, rendezvous,
  route selection, relay fallback, and evidence.
- Web-assisted discovery can make P2P setup easier, but the preferred data path
  after bootstrap remains direct P2P mesh.
- Hosted relay remains fallback-only until release tunnel payload transport and
  proof are real.

Release proof still requires a second Windows PC on the same current build plus
owner-scoped hosted P2P/relay evidence from production infrastructure.

## 2026-06-06 Route Evidence Input Boundary

`POST /api/v1/p2p/route-evidence` is now strict metadata-only:

- route evidence, fallback, transport proof, and delivery proof schemas reject
  unknown fields
- raw payload byte fields are rejected before storage with
  `route_evidence_payload_bytes_not_accepted`
- `relay_payload_delivery_proof.payload_bytes` remains a numeric proof count,
  not raw payload content
- the P2P store-forward relay contract audit gates this boundary

This keeps MUSU.PRO as the evidence/control plane for P2P bootstrap and relay
fallback. It does not move work or payload execution into the website, and it
does not implement release-grade relay tunnel transport.

## 2026-06-06 Rendezvous Input Boundary

Core P2P rendezvous creation and candidate exchange are now strict
metadata-only:

- `POST /api/v1/p2p/rendezvous` rejects unknown fields and raw payload byte
  fields
- `POST /api/v1/p2p/rendezvous/[id]/candidates` rejects unknown fields and raw
  payload byte fields
- direct QUIC candidates still require public endpoint and NAT metadata
- relay-capable candidate sets still require relay endpoint details
- owner-scoped candidate/session isolation is unchanged

This is the intended MUSU.PRO role: exchange enough metadata to make P2P path
selection easier, then let local programs perform the actual work and data
movement.

## 2026-06-06 Room Control Input Boundary

Room-scoped presence and rendezvous are strict metadata-only:

- `POST /api/rooms/[roomId]/rendezvous` rejects unknown fields, body `room_id`,
  and raw payload byte fields.
- `POST /api/rooms/[roomId]/presence` rejects unknown fields and raw payload
  byte fields before presence storage or candidate-cache seeding.
- room presence candidate endpoints are strict route/NAT/relay descriptor
  records.
- the path `roomId` is the canonical room identity.
- room events/work-orders remain separate bounded payload-capable surfaces.

This preserves the split the product needs: MUSU.PRO can host the project room
and bootstrap local-program connectivity, but presence/rendezvous do not carry
work payload bytes.

## 2026-06-06 Post Room-Control Local CPU Audit Update

Fresh current clean HEAD evidence confirms the current one-machine local
runtime is idle and owned after the room control strict metadata hardening:

- CPU evidence:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260606-080201-HUGH_SECOND.desktop-open.evidence.json`
- process ownership evidence:
  `docs\evidence\process-ownership\1.15.0-rc.1\20260606-080350-HUGH_SECOND.process-ownership.json`
- commit `ade5b64f012c14a8de6f2c0fa99065de5db45f64`
- `git_dirty=false`
- CPU sample `60.045s`
- hot process count `0`
- MUSU CPU `0`, Node CPU `0`, WebView2 CPU `0.18`
- owned WebView2 helpers `6`, owned Node helpers `0`
- process ownership `ok=true`, `fail_count=0`

Spec interpretation is unchanged:

- MUSU Desktop is the local executor on each device.
- MUSU.PRO coordinates user input, rooms, presence, rendezvous, path
  selection, relay fallback, and evidence.
- MUSU.PRO can make P2P bootstrap easier, but local programs still do the
  work.
- Direct P2P mesh remains preferred after bootstrap.
- Hosted relay is fallback-only and still needs separate release tunnel proof.

This CPU/process audit is not a hosted P2P control-plane proof and does not
replace second-PC route/CPU/matrix evidence.

## 2026-06-06 Live External Gate Recheck

Live public metadata is currently verified:

- `https://musu.pro/privacy` returns HTTP `200`
- `https://musu.pro/support` returns HTTP `200`
- both pages contain `musu@musu.pro`
- go/no-go without `-SkipPublicMetadata` reports `public_metadata_ok=True`

Live hosted P2P control-plane proof is still not release-grade:

- evidence:
  `docs\evidence\p2p-control-plane\1.15.0-rc.1\20260606-082429-musu.pro.evidence.json`
- verification fail count: `40`
- packaged WindowsApps alias used:
  `C:\Users\empty\AppData\Local\Microsoft\WindowsApps\musu.exe`
- relay status/transport/leases/route-evidence report `logged_in=false`
- owner scope is not verified
- relay lease store is not configured or release-grade
- release relay transport, connect endpoint, and payload endpoint are not
  wired
- relay route evidence count is `0`
- relay payload transport proven is `False`

Spec interpretation is unchanged. MUSU.PRO is still the remote input,
room/rendezvous/path-selection/evidence control plane and fallback coordinator.
The release-grade hosted P2P gate requires a logged-in production runtime,
owner-scoped P2P control auth, release-grade relay lease storage, and actual
relay payload transport proof.

## 2026-06-06 External Gate Root-Cause Evidence Update

External gate evidence from clean HEAD
`f0b09139de93cfa98ab1b5d0d8f85e0115fea6b3` confirms the current product split:

- MUSU Desktop is still the local executor.
- MUSU.PRO is still remote input, project/company room, rendezvous, path
  selection, relay fallback, and evidence control plane.
- Direct P2P mesh remains preferred after web-assisted bootstrap.
- Hosted relay remains fallback-only and must not become the default payload
  path.

Current evidence:

- external:
  `docs\evidence\external-gates\1.15.0-rc.1\20260606-090152-HUGH_SECOND.external-gates.evidence.json`
- P2P:
  `docs\evidence\p2p-control-plane\1.15.0-rc.1\20260606-090333-musu.pro.evidence.json`
- P2P verification:
  `docs\evidence\p2p-control-plane\1.15.0-rc.1\20260606-090333-musu.pro.verification.json`

Flattened root-cause state:

- public metadata is checked and ok
- second PC is unreachable at `192.168.1.192:8949` with
  `tcp_connect_timeout`
- P2P runtime is not logged in for relay status, transport, leases, or route
  evidence queries
- owner scope is not verified
- relay lease store is not configured or release-grade
- relay transport descriptor/connect/payload endpoints are not wired
- relay route evidence count is `0`
- relay payload delivery proof valid count is `0`

Release implication: this is external machine/account/infrastructure evidence
work. It does not justify moving execution into MUSU.PRO or requiring the
localhost developer dashboard for packaged MUSU Desktop.

## 2026-06-06 Current HEAD Runtime CPU Matrix Refresh

Current clean HEAD `ac1e67a4dd8f610a6f09ff61d3107f556e2ac5e5` has fresh
one-machine runtime CPU scenario matrix evidence on `HUGH_SECOND`:

- full matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260606-094149-HUGH_SECOND.runtime-cpu-scenario-matrix.json`
- full matrix verification:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260606-094149-HUGH_SECOND.verification.json`
- HUGH-MAIN route-attempt diagnostic:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260606-095252-HUGH_SECOND.runtime-cpu-scenario-matrix.json`
- HUGH-MAIN diagnostic verification:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260606-095252-HUGH_SECOND.target-route.verification.json`

The full matrix verifier passed with `ok=true` and `fail_count=0`. The matrix
covers `startup-open`, `runtime-started`, `dashboard-open`, `desktop-open`, and
`post-route`; all scenarios stayed under the local resource budget with hot
process count `0`.

The HUGH-MAIN diagnostic attempted
`http://192.168.1.192:8949/api/tasks/delegate`, timed out, and was verified
only as an allowed failed target-route CPU diagnostic. It does not prove a
working second-PC route. It does prove the current local packaged runtime did
not enter a CPU busy loop during the failed route attempt.

Spec interpretation is unchanged:

- MUSU Desktop executes work locally on each device.
- MUSU.PRO accepts remote user input and hosts project/company room,
  presence, rendezvous, path-selection, relay-fallback, and evidence surfaces.
- The web control plane may bootstrap P2P connectivity, but local programs do
  the work.
- Direct P2P mesh remains preferred after bootstrap.
- Hosted relay remains fallback-only and still needs release tunnel payload
  proof.

## 2026-06-06 Room Work-Order Rejected Audit Gate

MUSU.PRO room work-order rejected-input audit logging is now release-gated:

- invalid JSON after P2P control auth is rejected and command-audit logged
- missing instruction after P2P control auth is rejected and command-audit
  logged
- rejected work orders must not call the local bridge
- audit events record owner/room/status/reason metadata
- audit events must not store the user instruction body as `text` or
  `instruction`

Validation:

- `npm run test:routes`: `30/30`
- `npm run typecheck`: pass
- operator API security audit: `ok=true`, `fail_count=0`
- release evidence verifier regression: `58/58`

This is a P2P command-audit hardening gate. It does not move execution into
MUSU.PRO. The website remains the remote input and coordination plane; the
local MUSU Desktop/bridge remains the executor.

## 2026-06-06 Relay Route Transport Proof Verifier Gate

`verify-p2p-control-plane-evidence.ps1` now requires hosted release-grade relay
route evidence to contain a valid route-level `relay_transport_proof`.

Passing hosted P2P evidence must include:

- `relay_route_evidence.count > 0`
- returned relay route records for `route_kind=relay`, `result=success`, and
  `release_grade=true`
- route record `session_id`, `source_node_id`, and `target_node_id`
- issued `relay_fallback.lease_id`
- `relay_transport_proof.schema=musu.relay_transport_proof.v1`
- `relay_transport_proof.session_id`, `lease_id`, `source_node_id`, and
  `target_node_id` matching the route/fallback values
- `relay_transport_proof.transport_kind=quic_relay_tunnel`
- `relay_transport_proof.relay_url` over `wss://`
- `relay_transport_proof.payload_bytes_transited > 0`
- `relay_transport_proof.payload_transited_musu_infra=true`
- `relay_transport_proof.encryption=quic_tls_1_3`
- `relay_transport_proof.transport_verified_by=musu_quic_tls_transport`
- `relay_payload_delivery_proof` bound to the same session, lease, source,
  target, and tunnel

The verifier now reports `relay_route_transport_proof_required_count`,
`relay_route_transport_proof_valid_count`, and
`relay_route_transport_proof_invalid_count`.

Server-side `queryRouteEvidenceRecords({ release_grade: true })` also
revalidates fallback, transport proof, and delivery proof before returning
stored records. This prevents stale/manual `release_grade=true` records from
passing the hosted P2P gate when they lack the actual relay tunnel proof chain.

## 2026-06-06 Relay Route Transport Proof Status Surface

The route transport proof requirement is now visible in release status outputs,
not only in the low-level verifier:

- `write-release-go-no-go.ps1` exposes
  `p2p_relay_route_transport_proof_valid_count`
- `record-external-release-gate-recheck.ps1` exposes the same count and emits
  `p2p_relay_route_transport_proof_missing`
- `show-musu-pro-p2p-env-status.ps1` exposes
  `relay_route_transport_proof_valid_count`,
  `relay_route_transport_proof_required_count`, and
  `relay_route_transport_proof_invalid_count`
- `show-final-release-handoff-status.ps1` forwards the go/no-go count

Current hosted status remains expectedly blocked: live P2P env status reports
route transport proof count `0`, payload delivery proof count `0`, and blocker
`live_evidence_relay_route_transport_proof_missing`.

Spec interpretation is unchanged:

- MUSU.PRO is remote input, project/company room, presence, rendezvous, path
  selection, relay fallback, and evidence/control plane.
- MUSU Desktop remains the local executor on each device.
- Local programs should prefer direct P2P mesh routes after web-assisted
  bootstrap.
- Hosted relay is fallback-only and must not become release-grade until actual
  `quic_relay_tunnel` payload transport and delivery proof exist.
- A refused `localhost:3001` browser page does not define whether MUSU Desktop
  is installed or working; release evidence comes from the packaged local
  runtime and hosted MUSU.PRO gates.

## 2026-06-06 Relay Route Record Metadata Verifier Gate

Hosted P2P release evidence now requires the returned relay route record itself
to carry release-grade metadata. A nested `relay_transport_proof` is necessary,
but it is no longer sufficient if the enclosing `musu.route_evidence.v1` record
omits candidate, latency, handshake, peer identity, encryption, or verifier
metadata.

For returned relay success records where `route_kind=relay`,
`result=success`, and `payload_transited_musu_infra=true`,
`verify-p2p-control-plane-evidence.ps1` now requires:

- `schema=musu.route_evidence.v1`
- non-empty `candidate_addr`
- numeric `handshake_ms >= 0`
- numeric `total_attempt_ms >= handshake_ms`
- `peer_identity_verified=true`
- `peer_identity_method=quic_tls_cert_fingerprint`
- `peer_public_key` beginning with `sha256:`
- `encryption=quic_tls_1_3`
- `transport_verified_by=musu_quic_tls_transport`
- valid `recorded_at`
- `relay_transport_proof.handshake_ms` matching route record `handshake_ms`

The verifier exposes `relay_route_metadata_required_count`,
`relay_route_metadata_valid_count`, and
`relay_route_metadata_invalid_count`. The release interpretation is unchanged:
MUSU.PRO is still remote input, room, rendezvous, path-selection,
relay-fallback, and evidence control plane. MUSU Desktop remains the local
executor, and public release still requires real second-PC route/CPU/matrix
evidence plus live owner-scoped relay proof.

## 2026-06-06 route metadata status surface

Route metadata counts are now required release status data.

The hosted verifier still owns the release-grade check. The handoff surfaces
must also carry the count so operators can diagnose the exact P2P blocker:

- P2P evidence recorder: `relay_route_metadata_valid_count`
- go/no-go: `p2p_relay_route_metadata_required_count`,
  `p2p_relay_route_metadata_valid_count`, and
  `p2p_relay_route_metadata_invalid_count`
- MUSU.PRO P2P env status:
  `live_evidence_relay_route_metadata_missing` when the valid count is `0`
- external gate recheck: `p2p_relay_route_metadata_valid_count` and
  `p2p_relay_route_metadata_missing`
- final handoff: `p2p_relay_route_metadata_valid_count`

External release handoff reports must preserve the full triplet, not only the
valid count:

- `p2p_relay_route_metadata_required_count`
- `p2p_relay_route_metadata_valid_count`
- `p2p_relay_route_metadata_invalid_count`

The same rule applies to proof counts:

- `p2p_relay_route_transport_proof_required_count`
- `p2p_relay_route_transport_proof_valid_count`
- `p2p_relay_route_transport_proof_invalid_count`
- `p2p_relay_payload_delivery_proof_required_count`
- `p2p_relay_payload_delivery_proof_valid_count`
- `p2p_relay_payload_delivery_proof_invalid_count`

This does not change the local-first product boundary. MUSU Desktop executes
locally; MUSU.PRO coordinates remote input, rooms, rendezvous, path selection,
relay fallback, and release evidence.

## 2026-06-06 Rust Route Evidence Relay Transport Proof Carry

Rust bridge route evidence now preserves relay route transport proof through
the local-runtime evidence path:

- `musu-rs/src/bridge/route_evidence.rs` defines
  `RouteRelayTransportProof`
- `RouteAttemptEvidence` and `RouteAttemptEvidenceInput` include optional
  `relay_transport_proof`
- `cloud_route_evidence()` maps the proof into
  `crate::cloud::RouteRelayTransportProof`
- direct/CLI route evidence continues to set `relay_transport_proof=None`
- P2P store-forward relay contract audit now gates this with
  `route evidence carries relay transport proof to cloud`

This closes the carry-path gap where Rust could serialize the cloud DTO but
bridge route evidence submitted `relay_transport_proof=None`.

## 2026-06-06 Relay Payload Delivery Proof Release Metadata

Relay payload delivery proof is now explicitly tied to release tunnel metadata:

- `relay_url`
- `transport_kind`
- `relay_default_data_path`
- `release_grade`

Release-grade hosted P2P evidence must show delivery proof with
`transport_kind=quic_relay_tunnel`, `release_grade=true`, and
`relay_default_data_path=false`, and the delivery proof relay URL must match the
route transport proof relay URL. The stored payload record must carry the same
release metadata.

This keeps the preview store-forward queue out of the release tunnel gate. A
preview queue payload can still be owner-scoped, claimed, delivered, and
recorded for diagnostics, but it stays `transport_kind=http_store_forward_preview`
and `release_grade=false`, which cannot close hosted P2P release proof.

Spec interpretation remains unchanged: this is not the release relay tunnel.
It is the evidence path needed once the real local runtime tunnel produces
`musu.relay_transport_proof.v1`.

## 2026-06-06 Telemetry Flush Scope Audit

The local runtime idle contract now includes explicit log/telemetry flush scope
verification.

Release interpretation:

- A one-shot uninstall TTY prompt flush is allowed in
  `musu-rs\src\install\uninstall.rs`.
- Background telemetry/log flush workers remain disallowed unless they are
  explicitly designed, gated, audited, and backed by release CPU evidence.
- Final operator packets must include the Rust background-loop audit with the
  `one-shot log flush primitives stay allowlisted` check and
  `allowed_telemetry_flush_primitive_hit_count`.

This does not change the P2P product split. MUSU.PRO may receive remote input,
host project/company rooms, coordinate rendezvous/path selection/relay
fallback, and store evidence. MUSU Desktop remains the executor and local
resource owner on each device.

## 2026-06-06 Current external gate snapshot

Current clean HEAD `0ba26d6d27a23a213240962517079d5fd817c7e8` was rechecked
against `https://musu.pro` without skipping public metadata.

Spec state:

- MUSU Desktop remains the local executor on each device.
- MUSU.PRO remains remote input, rooms, presence, rendezvous, path selection,
  relay fallback, and evidence/control plane.
- Direct P2P mesh remains preferred after web-assisted bootstrap.
- Hosted relay remains fallback-only and cannot satisfy release without actual
  `quic_relay_tunnel` transport and payload delivery proof.

Current release evidence:

- external gate:
  `docs\evidence\external-gates\1.15.0-rc.1\20260606-151336-HUGH_SECOND.external-gates.evidence.json`
- hosted P2P evidence:
  `docs\evidence\p2p-control-plane\1.15.0-rc.1\20260606-151527-musu.pro.evidence.json`
- public metadata checked/ok: `true`/`true`
- second PC `192.168.1.192:8949`: TCP `false`, `tcp_connect_timeout`
- hosted P2P verification: `ok=false`, `fail_count=42`
- relay route evidence count: `0`
- relay route transport proof valid count: `0`
- relay payload delivery proof valid count: `0`

Current blockers are second-PC route/CPU/matrix evidence, production runtime
login, owner-scoped release-grade storage, release relay tunnel transport,
payload endpoint wiring, support mailbox proof, and Store/Partner Center proof.

## 2026-06-06 Relay tunnel runtime source gate

Release relay readiness now requires a separate source marker for actual local
runtime implementation:

- `RELAY_TUNNEL_RUNTIME_IMPLEMENTED=false`
- relay status surfaces expose `relay_tunnel_runtime_implemented=false`
- P2P env status emits
  `source_release_relay_tunnel_runtime_not_implemented`

This is deliberate fail-closed behavior. The release tunnel is not implemented
until local runtime code moves payload bytes through `quic_relay_tunnel` and
emits `quic_tls_1_3` relay transport proof. The preview queue and proof
recorders cannot satisfy this marker.

## 2026-06-06 Relay fallback candidate coverage gate

Release relay route evidence now has to prove candidate coverage before
fallback can be considered release-grade.

`relay_fallback.candidate_route_kinds` records the route kinds made available
by rendezvous/path selection. For a relay route, release grading blocks records
when this candidate set is absent, lacks a relay fallback candidate, lacks any
direct candidate, skips an available direct candidate, attempts a direct
candidate that was not available, or attempts direct candidates out of canonical
priority order.

Canonical order remains:

1. `lan`
2. `tailscale`
3. `direct_quic`
4. `relay`

This prevents a false fallback pass where the route evidence claims relay after
trying only one direct route while another available direct candidate was
skipped. MUSU.PRO remains rendezvous/path-selection/evidence control plane;
the local MUSU runtime still performs the route attempts and payload work.

## 2026-06-06 runtime relay candidate coverage carry

The desktop/runtime source now preserves route candidate coverage through the
relay fallback preview path:

- `candidate_route_kinds` is preserved in rendezvous-selected peer metadata.
- local forwarding attempts ordered direct candidates before relay lease
  fallback.
- `RouteRelayFallbackEvidence` includes `candidate_route_kinds` in local JSON
  and cloud submission DTOs.
- relay payload enqueue and stored records carry `candidate_route_kinds` and
  `attempted_route_kinds`.
- target-side relay delivery route evidence reuses the stored source route
  metadata.

Release interpretation:

- missing route metadata remains non-release-grade;
- store-forward relay payloads remain preview/non-release transport;
- `RELAY_TUNNEL_RUNTIME_IMPLEMENTED=false` still blocks release relay transport;
- fresh packaged evidence is required because runtime source changed.

## 2026-06-06 current audit boundary

Current HEAD `c879a849f403aadefdd071a012aaa4cd304cbf24` keeps the MUSU.PRO
control-plane boundary unchanged.

Normative spec state:

- MUSU Desktop executes local work on each device.
- MUSU.PRO may accept remote user input, host project/company rooms, host AI
  meeting-room coordination state, exchange presence, coordinate rendezvous,
  help with path selection, coordinate relay fallback, and store evidence.
- MUSU.PRO must not become the default executor.
- MUSU.PRO relay must not become the default data path.
- `localhost:3001` is not a packaged desktop runtime dependency.
- Release relay proof requires a real local `quic_relay_tunnel` runtime,
  `quic_tls_1_3` transport proof, owner-scoped route evidence, and payload
  delivery proof.

Current implementation status:

- store-forward queue fallback: implemented and audited
- release relay connect preflight: implemented and fail-closed
- release relay payload preflight: implemented and fail-closed
- release relay payload endpoint: not implemented
- release relay tunnel runtime: not implemented
- live P2P evidence: not verified
- current public release state: No-Go

## 2026-06-06 current HEAD qualitative audit boundary

Current HEAD `52d325d43b691c6e1b56404e34cfd2ba85257311` keeps the same
control-plane boundary after fresh code audit and release-gate checks.

Normative status:

- MUSU Desktop is the local executor and resource owner.
- MUSU.PRO is remote input, project/company room, AI meeting room, presence,
  rendezvous, path selection, relay fallback coordination, and
  evidence/control plane.
- MUSU.PRO may bootstrap P2P discovery and make remote work submission easier,
  but it does not execute local work and does not become the default data path.
- Path priority remains `lan -> tailscale -> direct_quic -> relay`.
- Hosted relay remains fallback-only and non-default.
- `localhost:3001` is optional developer/operator dashboard behavior, not the
  packaged desktop runtime contract.

Current audited implementation status:

- local packaged bridge is healthy on `127.0.0.1:4751`
- store-forward queue fallback is implemented and audited
- release relay connect preflight is implemented and fail-closed
- release relay payload preflight is implemented and fail-closed
- release relay payload endpoint is not implemented
- local release `quic_relay_tunnel` runtime is not implemented
- production KV/Upstash storage is missing
- live P2P evidence is not logged in and not verified
- relay route transport proof count is `0`
- relay payload delivery proof count is `0`
- current public release state is No-Go

## 2026-06-07 desktop runtime and HUGH-MAIN route reachability boundary

The current local product surface is MUSU Desktop, not the localhost web
dashboard. On `HUGH_SECOND`, packaged `musu status --json` reported the local
desktop bridge healthy at `http://127.0.0.1:1158`.

The active second-PC blocker is the `HUGH-MAIN` peer endpoint:

- registered peer: `HUGH-MAIN`
- registered address: `192.168.1.192:8949`
- peer health: `false`
- peer version: `unknown`
- selected route kind: manual `lan`
- selected transport: `http_bearer`
- encryption: `none_http_bearer`
- peer identity verified: `false`
- TCP probe to `192.168.1.192:8949`: `false`
- ping probe to `192.168.1.192`: `false`

This confirms the product boundary:

- MUSU Desktop executes local work on each device.
- MUSU.PRO receives remote input, hosts project/company room state, assists
  rendezvous/path selection/relay fallback, and stores route evidence.
- MUSU.PRO does not become the local executor.
- `localhost:3001` is not the packaged desktop runtime dependency.
- A manual HTTP bearer peer is diagnostic only; release P2P still requires
  verified peer identity, `quic_tls_1_3`, route metadata, relay transport
  proof when relay is used, and payload delivery proof.

## 2026-06-07 route reachability tooling contract

Second-PC reachability must now be captured through
`record-route-reachability-diagnostic.ps1` and checked with
`verify-route-reachability-diagnostic.ps1` before treating a peer endpoint as a
real release candidate.

The verifier rejects:

- local-only targets when `-RequireNonLocalTarget` is used;
- route diagnostics that claim successful multi-device proof;
- diagnostics where the route attempt is not a failed route while the evidence
  is being used as failed reachability proof;
- missing route explain/path-priority evidence;
- missing raw `musu.route_evidence.v1` route-attempt evidence.

This keeps MUSU.PRO as the control plane and keeps failed manual LAN/HTTP
evidence out of the successful P2P release path.

## 2026-06-07 second-PC route reachability handoff contract

Second-PC operator handoff now carries route reachability diagnostics when the
operator supplies a target peer.

Normative behavior:

- `run-second-pc-release-check.ps1 -RouteReachabilityTarget <peer>` records
  `musu.route_reachability_diagnostic.v1`.
- If `-RouteReachabilityTarget` is omitted, the wrapper may use
  `-RuntimeCpuRouteTarget`; if neither exists, route reachability is skipped so
  one-machine install/handoff smoke remains usable.
- Returned zips may include
  `.local-build\route-diagnostics\*.route-reachability-diagnostic.json`.
- `import-second-pc-return.ps1` must verify returned diagnostics with
  `-RequireNonLocalTarget` when the release-check JSON marks them required.

Product boundary:

- MUSU Desktop is the local executor on each device.
- MUSU.PRO is remote input, project/company room, AI meeting room, presence,
  rendezvous, path selection, relay fallback coordination, and evidence/control
  plane.
- MUSU.PRO does not become the default payload path and does not execute local
  work.
- Successful release still requires release-grade route evidence after the
  reachability diagnostic is healthy.

## 2026-06-07 current primary CPU and route-attempt boundary

Current primary-machine evidence after process ownership CLI hardening confirms
the local packaged MUSU Desktop runtime is quiet, while `HUGH-MAIN` remains an
unreachable peer endpoint.

Current status:

- local bridge on `HUGH_SECOND`: `127.0.0.1:1158`
- clean desktop-open idle CPU: MUSU `0`, Node `0`, WebView2 `0.08`
- clean five-scenario matrix: MUSU `0`, Node `0`, WebView2 max `0.18`
- route target: `HUGH-MAIN`
- route endpoint attempted: `192.168.1.192:8949`
- route result: timeout
- target-route CPU verifier: pass with failed route allowed
- full route-success verifier: fail on `post-route route probe`

Control-plane interpretation:

- this is not a localhost dashboard problem;
- this is not a reason to move execution into MUSU.PRO;
- MUSU.PRO may help with remote input, room state, rendezvous, path selection,
  relay fallback, and evidence;
- release still requires a reachable second MUSU Desktop runtime and
  release-grade `musu.route_evidence.v1` before hosted MUSU.PRO relay proof can
  close the public P2P gate.

## 2026-06-07 P2P env blockers go/no-go surface

Release go/no-go must surface hosted P2P env status detail, not only the broad
`p2p-control-plane` blocker.

Normative behavior:

- go/no-go invokes `show-musu-pro-p2p-env-status.ps1 -Json`.
- go/no-go passes the selected latest P2P control-plane evidence path to that
  status reporter when evidence exists.
- go/no-go JSON includes `p2p_control_plane_env_ready`.
- go/no-go JSON includes `p2p_control_plane_env_blockers`.
- go/no-go JSON includes `p2p_control_plane_env_status`.
- the `p2p-control-plane` blocker message includes a concise
  `P2P env blockers:` summary when env blockers exist.

Current release interpretation:

- source release relay tunnel runtime is still not implemented;
- source release relay payload endpoint is still not implemented;
- preview store-forward queue remains non-release-grade;
- production KV/Upstash names and live runtime login/proof are still missing;
- release relay route metadata, transport proof, and payload delivery proof are
  still missing.

This status surface is not a relay implementation. MUSU.PRO remains remote
input, room, rendezvous, path-selection, relay fallback, and evidence/control
plane. MUSU Desktop remains the local executor.

## 2026-06-07 runtime hardening note: optional local watchers

The clipboard cancellation hardening does not change the P2P control-plane
contract, but it tightens the local executor side of the boundary.

- MUSU.PRO must not execute local clipboard work.
- Clipboard polling remains a local, opt-in watcher behind
  `MUSU_ENABLE_CLIPBOARD_SYNC`.
- If enabled, the local monitor now has a `CancellationToken` and Ctrl-C
  cancellation path.
- Hosted P2P release proof remains focused on rendezvous, path selection,
  owner-scoped relay storage, relay route metadata, transport proof, and payload
  delivery proof.

## 2026-06-07 runtime hardening note: opt-in local mDNS

The mDNS cancellation hardening does not change the hosted P2P control-plane
contract. It tightens the local LAN discovery helper that can run before the
cloud registration heartbeat when explicitly enabled.

- MUSU.PRO must not execute local mDNS discovery work.
- mDNS remains a local-only helper behind `MUSU_ENABLE_MDNS`.
- IPv6, Tailscale, and common VPN/virtual mDNS adapters remain separate opt-ins.
- The bridge now passes the cloud registration cancellation token into mDNS
  auto-registration.
- If cancellation fires during mDNS browse, the local receive wait exits before
  the bridge continues to later cloud registration calls.
- Hosted P2P release proof remains focused on rendezvous, path selection,
  owner-scoped relay storage, relay route metadata, transport proof, and payload
  delivery proof.

## 2026-06-07 release relay tunnel marker conflict rule

Release source markers are not sufficient proof.

Normative behavior:

- `RELAY_PAYLOAD_ENDPOINT_IMPLEMENTED=true` is invalid while
  `/api/v1/relay/payload` is still preflight-only and returns
  `release_payload_accepted=false` or `payload_transported=false`.
- `RELAY_TUNNEL_RUNTIME_IMPLEMENTED=true` is invalid while Rust source is
  missing release tunnel submit/accept hooks and `quic_relay_tunnel`
  `quic_tls_1_3` payload proof emission.
- P2P env status must surface missing source hooks and add source conflict
  blockers when markers claim release readiness too early.

Current required hooks before release tunnel runtime can be marked ready:

- `rust_source_submit_release_relay_tunnel_payload`
- `rust_target_accept_release_relay_tunnel_payload`
- `rust_transport_emits_quic_relay_tunnel_proof`
- `rust_delivery_records_release_relay_tunnel_payload`

This keeps MUSU.PRO on the control-plane path and prevents the preview
store-forward queue from being treated as the release relay tunnel.

## 2026-06-07 release relay tunnel source hook contract

Release relay tunnel source hooks are now present in Rust:

- `submit_release_relay_tunnel_payload`
- `accept_release_relay_tunnel_payload`
- proof-boundary metadata for `quic_relay_tunnel`, `quic_tls_1_3`,
  `quic_tls_cert_fingerprint`, and `musu_quic_tls_transport`

Normative boundary:

- source hook presence is necessary but not sufficient
- `RELAY_TUNNEL_RUNTIME_IMPLEMENTED=false` remains correct until payload bytes
  move through an actual `quic_relay_tunnel`
- `RELAY_PAYLOAD_ENDPOINT_IMPLEMENTED=false` remains correct until the release
  endpoint accepts/transports bytes and emits release proof
- preview store-forward queue proof remains non-release-grade
- hosted MUSU.PRO evidence must still prove runtime login, owner-scoped
  storage, relay route metadata, relay transport proof, and relay payload
  delivery proof

2026-06-07 submit metadata tightening: `submit_release_relay_tunnel_payload`
now also requires non-empty source, target, and tunnel ids,
`payload_kind=forwarded_task_envelope`, and a 64-hex `payload_sha256` before
the fail-closed not-implemented branch. This keeps the local runtime source
hook aligned with `/api/v1/relay/payload` release preflight and prevents future
runtime work from accepting underspecified tunnel payload metadata.

## 2026-06-07 Current Runtime Boundary Note

Current local evidence confirms the product split:

- MUSU Desktop is the packaged local executor on each device.
- MUSU.PRO is remote input, project/company room, AI meeting room, presence,
  rendezvous, path selection, relay fallback, and evidence/control plane.
- MUSU.PRO must not become the runtime that executes local work.
- `localhost:3001` is not the packaged desktop runtime contract; the packaged
  desktop runtime can be healthy as `local-bridge-only` through
  `http://127.0.0.1:<bridge-port>`.
- The 2026-06-07 current-head local evidence used bridge
  `http://127.0.0.1:1158`, while the public release remains blocked on
  two-machine evidence and hosted MUSU.PRO relay proof.

## 2026-06-07 Current-Head Qual Audit and Next Steps

Current HEAD `078ce1c5eeb11edc00aa9a6597e6db1f5b0acc59` keeps the P2P
control-plane spec unchanged and fail-closed.

Current product state:

- MUSU Desktop remains the local executor.
- MUSU.PRO remains remote input, project/company room, AI meeting room,
  presence, rendezvous, path selection, relay fallback, and evidence/control
  plane.
- MUSU.PRO may collect user input from elsewhere and deliver control metadata
  to local programs.
- MUSU.PRO must not run local tasks or become the default payload transit path.
- After rendezvous, local programs still prefer `lan`, `tailscale`,
  `direct_quic`, then relay fallback.

Current source/evidence state:

- release connect preflight exists and is authenticated;
- release payload preflight exists, is strict metadata-only, and remains
  fail-closed;
- Rust release relay tunnel source hooks exist and require release payload
  metadata;
- `RELAY_PAYLOAD_ENDPOINT_IMPLEMENTED=false`;
- `RELAY_TUNNEL_RUNTIME_IMPLEMENTED=false`;
- `RELAY_TRANSPORT_KIND=websocket_tunnel`;
- release transport still requires `quic_relay_tunnel` plus `quic_tls_1_3`
  proof;
- live hosted P2P evidence still lacks runtime login, owner-scoped
  KV/Upstash-backed storage, route metadata, transport proof, and payload
  delivery proof.

Validation for the current audit passed P2P tests `112/112`, typecheck, P2P
relay/source contract audit `ok=true`, release evidence verifier regression
`104/104`, and `git diff --check`. No high or medium code issue was found.

Next implementation order:

1. Regenerate final/operator handoff packs from current HEAD before physical
   second-PC transfer.
2. Capture second-machine local package, CPU, matrix, route, and return
   evidence.
3. Configure live hosted MUSU.PRO owner-scoped storage/login.
4. Implement real release `quic_relay_tunnel` runtime byte transit and proof
   emission.
5. Record support mailbox and Store/Partner Center proof.

## 2026-06-07 frontend polling gate note

The frontend polling inventory hardening does not change the P2P control-plane
spec.

- MUSU.PRO remains remote input, project/company room, AI meeting room,
  presence, rendezvous, path selection, relay fallback, and evidence/control
  plane.
- Local MUSU Desktop/WebView refresh loops remain local runtime/UI behavior.
- The release audit now locks the exact 29 non-test low-duty polling call-site
  files so UI polling cannot silently expand during release evidence work.
- Hosted P2P release proof remains blocked by the same 12 env/evidence gaps:
  release payload endpoint, release tunnel runtime, release transport kind,
  KV/Upstash storage, runtime login, route proof, route metadata, transport
  proof, and payload delivery proof.

## 2026-06-07 Current Desktop CPU Recheck Control-Plane Note

The current desktop-open CPU recheck does not change the MUSU.PRO P2P
control-plane spec.

- Evidence `20260607-102745-HUGH_SECOND.desktop-open` proves the packaged local
  MUSU Desktop runtime stayed idle-safe on `HUGH_SECOND`.
- The bridge used `127.0.0.1:14361`; this is the packaged local runtime bridge,
  not a `localhost:3001` developer dashboard contract.
- MUSU.PRO remains remote input, project/company room, AI meeting room,
  presence, rendezvous, path selection, relay fallback, and evidence/control
  plane.
- Local MUSU Desktop programs still execute work and own local resources.
- Public P2P release proof still requires a real second machine and live
  hosted owner-scoped route, transport, and payload delivery proof.

## 2026-06-07 AG UI/UX Control-Plane Note

AG UI/UX design is now a product-facing expression of this spec:

- MUSU.PRO receives remote input and hosts Command Center / Project Room state.
- Local MUSU Desktop runtimes remain the execution devices.
- Every run UI must show input source, execution device, route kind, and
  evidence state.
- Device Mesh must expose route candidates and fallback reason.
- Evidence Center must map UI readiness to release verifier outputs.

The design is documented in
`docs\AG_UI_UX_CONTROL_PLANE_DESIGN_2026_06_07.md`. It does not relax relay,
route, second-PC, support, or Store release gates.

## 2026-06-07 Relay Transport Descriptor Target Kind

Current source now reports the release relay descriptor as
`quic_relay_tunnel`. This supersedes earlier current-state notes that said the
descriptor itself was `websocket_tunnel`.

Current source/evidence state:

- `RELAY_TRANSPORT_KIND=quic_relay_tunnel`
- `RELEASE_GRADE_RELAY_TRANSPORT_KIND=quic_relay_tunnel`
- `RELEASE_GRADE_TRANSPORT_REQUIRED=quic_tls_1_3`
- `RELAY_PAYLOAD_ENDPOINT_IMPLEMENTED=false`
- `RELAY_TUNNEL_RUNTIME_IMPLEMENTED=false`
- release payload preflight remains metadata-only and fail-closed
- preview store-forward payload queue remains non-release-grade

This does not change the product boundary. MUSU.PRO coordinates remote input,
rooms, rendezvous, relay fallback, and evidence; MUSU Desktop executes local
work and must implement the actual release relay tunnel runtime before payload
transit can be claimed.

Current release blockers are the real implementation/proof gaps: release
payload endpoint, local release tunnel runtime, KV/Upstash-backed hosted
storage, packaged runtime login, relay route metadata, relay transport proof,
and payload delivery proof.

## 2026-06-07 Relay Candidate Protocol Release Kind

Candidate exchange now supports the release relay tunnel kind end to end:

- `P2pRelayProtocol` includes `quic_relay_tunnel`;
- rendezvous candidate updates accept `relay_protocol=quic_relay_tunnel`;
- room presence accepts and caches `relay_protocol=quic_relay_tunnel`;
- Rust `RelayProtocol::QuicRelayTunnel` serializes as `quic_relay_tunnel`;
- the local room presence CLI defaults relay candidates to
  `QuicRelayTunnel` when a relay URL is advertised.

This is required so MUSU.PRO can be the room/rendezvous/path-selection control
plane for local programs without rewriting the local runtime's route semantics.
It does not make MUSU.PRO the executor and does not prove relay payload
transport. Release evidence still requires an actual local `quic_relay_tunnel`
runtime, `quic_tls_1_3` proof, owner-scoped route metadata, relay transport
proof, and payload delivery proof.

## 2026-06-07 Relay Tunnel Not-Implemented Branch Guard

Current env status must treat release tunnel hook presence and release tunnel
runtime execution as separate gates.

Required interpretation:

- `release_relay_tunnel_runtime_source_contract_ready=true` only means the Rust
  source has the expected submit/accept/proof-boundary hooks.
- `release_relay_tunnel_runtime_not_implemented_branch_active=true` means the
  runtime still fails closed and does not move payload bytes.
- `RELAY_TUNNEL_RUNTIME_IMPLEMENTED=true` is invalid while the
  not-implemented branch is active.

Spec lock:

- MUSU.PRO remains control plane and relay coordination.
- MUSU Desktop remains executor and data-plane owner.
- A release relay tunnel claim requires the local runtime to remove the
  not-implemented branch, move bytes through `quic_relay_tunnel`, and record
  live `quic_tls_1_3` transport proof plus payload delivery proof.

## 2026-06-07 Release Relay Lease Readiness Gate

Release relay connect/payload preflight must reject stale relay leases before
any future release transport proof can be bound to them.

The shared readiness gate rejects a lease when:

- the lease relay URL is not WSS;
- the lease relay URL does not match the current configured relay URL;
- direct route attempts are missing;
- direct route failure class is missing;
- the lease policy is not `connect_pro_fallback_only`;
- the lease claims default data path;
- the lease does not describe MUSU relay payload transit.

Spec interpretation:

- this is a proof-binding hardening step;
- it does not make the preflight endpoint a release payload endpoint;
- it does not make MUSU.PRO the executor;
- it keeps release payload transport blocked until the local runtime byte path
  and live route/transport/delivery proof exist.

## 2026-06-07 Late SaaS/AG-UI Recheck Note

The late comparable-SaaS recheck does not change the P2P control-plane spec.
It reinforces the existing split:

- MUSU.PRO coordinates room/order state, presence, rendezvous, path selection,
  relay lease negotiation, evidence indexing, notifications, and owner/org
  policy.
- MUSU Desktop executes local work, owns file/process/tool/adapter access,
  applies local approval policy, records route/resource evidence, and owns the
  relay byte path when implemented.
- Remote input and status can use an event-stream UI model, but events are
  control metadata unless and until the local runtime accepts and executes an
  authenticated work-order envelope.

AG-UI protocol research adds a useful UI model, not a release gate. MUSU room,
order, and run state should be represented as typed events such as prompt
delivered, approval requested, command rejected, route candidate published,
rendezvous created, direct route attempted, relay lease requested, transport
proof attached, payload proof attached, evidence attached, and run completed.
These events must not collapse control-plane state into payload execution
claims.

Codex, GitHub Copilot, Cursor, Jules, Devin, and Replit validate command-center
and async-agent UX. Tailscale validates direct-first mesh UX with explicit
relay fallback. MUSU keeps the stricter release requirement: second-machine
evidence, owner-scoped live P2P metadata, relay transport proof, and relay
payload delivery proof are still required before public release.

## 2026-06-07 Current Deep Research Control-Plane Note

The operator-requested current deep research recheck is recorded in
`docs\RESEARCH_AGENT_CONTROL_SAAS_CURRENT_DEEP_RESEARCH_2026_06_07.md`.

Spec interpretation stays fixed:

- MUSU.PRO can receive remote prompts, approvals, cancellations, room messages,
  and route/evidence metadata.
- MUSU.PRO can coordinate rendezvous, path selection, relay leases,
  notification, and team policy.
- MUSU.PRO cannot be treated as the default executor for local files, shell,
  app adapters, or tools.
- A remote order becomes execution only after the selected MUSU Desktop runtime
  accepts an authenticated work-order envelope under local policy.
- Control-plane events are not payload proof.
- Relay lease readiness is not relay byte transit proof.
- Failed-route-allowed CPU diagnostics are not successful multi-device proof.

The next implementation slice should therefore bind room/order/run events to
device and route state without weakening the evidence gates:

1. room order created on MUSU.PRO;
2. owner/org policy authorizes the target device or group;
3. selected Desktop runtime heartbeats and accepts the envelope;
4. direct P2P route is attempted after rendezvous;
5. relay fallback is requested only after direct-route failure and policy allow;
6. route metadata, transport proof, payload delivery proof, and CPU evidence
   are attached separately.

## 2026-06-07 Release Relay Payload Route Evidence Recorder

The Rust runtime now has the release route-evidence writer that future relay
tunnel runtime code must call after successful byte transit:
`record_release_relay_payload_delivery_route_evidence(...)`.

The recorder is part of the proof contract, not the transport implementation.
It requires one successful relay record to bind:

- delivered release payload record
- `musu.relay_transport_proof.v1`
- `musu.relay_payload_delivery_proof.v1`
- `session_id`, `lease_id`, source node, target node, WSS relay URL, tunnel ID,
  payload hash, and payload byte count
- `transport_kind=quic_relay_tunnel`
- `encryption=quic_tls_1_3`
- `transport_verified_by=musu_quic_tls_transport`
- verified peer identity with `quic_tls_cert_fingerprint`
- `payload_transited_musu_infra=true`
- `relay_fallback.payload_transport_proven=true`
- `policy=connect_pro_fallback_only`

Spec interpretation:

- relay lease issuance is still only control-plane permission;
- the preview store-forward queue is still non-release-grade;
- the release payload endpoint and local release tunnel runtime remain
  unimplemented;
- future runtime code must call the recorder only after the actual
  `quic_relay_tunnel` byte path has delivered the payload;
- AG UI Evidence Center must show relay route evidence as incomplete until
  route metadata, transport proof, and payload delivery proof are attached to
  the same release-grade route record.

## 2026-06-07 Current-HEAD Local Desktop Evidence After Relay Recorder

The current packaged local desktop evidence refresh after the release relay
payload route evidence recorder keeps the control-plane spec unchanged.

Current `HUGH_SECOND` one-machine state:

- single-machine smoke: pass
- process ownership: pass
- startup single-instance: pass
- desktop single-instance: pass
- desktop-open idle CPU: pass
- five-state runtime CPU matrix: pass
- target-route CPU diagnostic: pass as explicitly allowed failed
  `PRIMARY-PC` route attempt

The target route failed because `PRIMARY-PC` is not registered as a peer on this
machine. That is valid failed-route CPU diagnostic evidence, not successful
multi-device route proof.

Spec interpretation stays fixed:

- MUSU.PRO receives remote input, room/meeting events, presence, rendezvous,
  route policy, relay fallback coordination, evidence, notifications, and
  owner/org policy.
- MUSU Desktop remains the executor and local permission boundary.
- A web order becomes execution only when the selected Desktop runtime accepts
  the authenticated work-order envelope.
- Direct P2P remains preferred after MUSU.PRO rendezvous.
- Hosted relay remains explicit fallback and still requires route metadata,
  `quic_tls_1_3` transport proof, and payload delivery proof before release.
- The current local evidence does not close second-PC, live MUSU.PRO P2P,
  support mailbox, or Store release gates.

## 2026-06-07 Target Drain Release Relay Proof Wiring

The target-side local runtime can now consume an attached delivery-response
`musu.relay_transport_proof.v1` and call
`record_release_relay_payload_delivery_route_evidence(...)`.

Spec meaning:

- delivery response DTOs may carry `relay_transport_proof`;
- target drain must use that proof plus `musu.relay_payload_delivery_proof.v1`
  before writing release-grade relay route evidence;
- release-grade payload/delivery metadata without transport proof fails as
  `release_relay_transport_proof_missing`;
- preview store-forward delivery still writes non-release-grade preview
  evidence;
- release payload endpoint and release relay tunnel runtime markers remain
  false until the real byte path is implemented and proven.

The local-fleet SaaS research addendum strengthens the same split:

- MUSU.PRO is the control plane and command room;
- MUSU Desktop remains the executor and evidence recorder;
- every work order/run must show input surface, executing runtime, route, and
  evidence status.
