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

## 2026-06-06 packaged local/runtime boundary update

Current packaged evidence on `HUGH_SECOND` confirms that MUSU Desktop is the
local executor and does not depend on the developer dashboard at
`localhost:3001`.

- The packaged local bridge is the runtime surface for one-machine proof.
- MUSU.PRO may receive remote input, host project/company rooms, coordinate
  rendezvous/path selection, issue relay fallback policy, and store evidence.
- The actual task execution still belongs to the local MUSU program on each
  device.
- A targeted failed HUGH-MAIN route attempt is valid CPU diagnostic evidence,
  but it is not successful multi-device route proof.
- Public remote/P2P claims still require second-PC route evidence and live
  hosted P2P relay transport proof.

This keeps the Core/Connect split intact: local execution and same-network
operation remain Core; MUSU-hosted remote access, relay, and external
account-authenticated coordination remain Connect/Pro surfaces.

## 2026-06-06 P2P status terminology boundary update

The hosted P2P status surface now distinguishes release payload preflight from
the missing release tunnel payload endpoint and the preview store-forward queue.

- `release_payload_preflight_endpoint_implemented=true` means the hosted
  metadata-only release preflight surface exists.
- `release_tunnel_payload_endpoint_missing=true` means release payload bytes do
  not yet have a proven tunnel transport endpoint.
- `preview_store_forward_payload_queue_non_release_grade=true` means the
  store-forward queue is wired for preview/fallback use but cannot satisfy the
  Connect/Pro release tunnel proof.

This reinforces the boundary: MUSU.PRO may coordinate and relay only when
properly proven, but local MUSU Desktop remains the executor and the preview
queue cannot be marketed or treated as release-grade remote transport.

## 2026-06-06 Relay Proof Identity Boundary Update

Hosted relay proof must bind peer identity to the relay transport proof itself,
not only to a surrounding route evidence record.

- release relay proof requires `peer_identity_verified=true`
- current release method is `quic_tls_cert_fingerprint`
- peer identity material must be a `sha256:` fingerprint
- the proof identity must match route evidence identity for the same
  session/lease/source/target/tunnel

This keeps Connect/Pro relay claims tied to verifiable peer identity while
MUSU Desktop continues to execute work locally.

## 2026-06-06 Local Crash-Recovery Boundary Update

Local startup recovery is part of the MUSU Desktop/Core runtime boundary.

- `musu up` now removes stale bridge registry records whose PID is dead before
  probing or restarting the bridge.
- `musu up --json` exposes `stale_bridge_registry_removed` and
  `stale_bridge_registry_pid` for operator evidence.
- Final go/no-go reports `crash_recovery_contract_verified`.
- This does not create a hosted execution path. MUSU.PRO may coordinate remote
  input, rooms, rendezvous, path selection, relay fallback, and evidence, but
  local MUSU Desktop/bridge remains the executor and resource owner.
- `localhost:3001` remains optional developer/operator dashboard behavior, not
  required packaged MUSU Desktop behavior.

Current installed-package evidence:

- HEAD `29dc84db1d8018fd8f8f7bf98588cb6bca0700a2` was rebuilt and reinstalled
  as `Yellowhama.MUSU_1.15.0.0_x64__ygcjq669as2b6`
- packaged `musu up --json` exposes the stale registry cleanup fields
- a dead bridge registry PID `999999` was removed before bridge startup
- bridge health recovered at `127.0.0.1:3678`
- canonical single-machine smoke
  `20260606-195631-HUGH_SECOND` passed as `local-bridge-only`
- canonical desktop-open CPU
  `20260606-200405-HUGH_SECOND.desktop-open` passed with hot process count `0`
  and WebView2 `0.08`

This keeps crash recovery inside the local Core runtime. It is not a Connect
relay claim and not a MUSU.PRO execution claim.

## 2026-06-06 Relay Delivery Proof Boundary Update

Hosted relay payload delivery proof must identify whether it came from the
release relay tunnel or the preview store-forward queue.

- release delivery proof requires `transport_kind=quic_relay_tunnel`
- release delivery proof requires `release_grade=true`
- release delivery proof requires `relay_default_data_path=false`
- release delivery proof relay URL must match the route transport proof relay
  URL
- stored payload records must carry the same release metadata

Preview queue delivery remains useful for diagnostics and fallback experiments,
but it is not release-grade relay tunnel transport. MUSU.PRO may coordinate and
record proof, but local MUSU Desktop runtimes still execute work.

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

## 2026-06-02 post-reconnect evidence boundary update

Fresh primary packaged evidence after reconnect hardening restores the local
desktop claim on `HUGH_SECOND`:

- packaged MSIX installs and runs through the explicit WindowsApps alias
- desktop activation remains single-instance
- process ownership separates MUSU-owned helpers from unrelated machine-wide
  Node.js processes
- desktop-open and four-state runtime CPU evidence stay below the 5% one-core
  release budget on the primary machine

This does not expand the public network claim:

- one-machine smoke and post-route CPU evidence prove local orchestration only
- second-PC CPU/matrix/route evidence is still required before two-machine
  desktop readiness is claimed
- live `musu.pro` owner-scoped control-plane evidence is still required before
  account-assisted P2P/relay readiness is claimed
- Store copy must continue to avoid universal NAT traversal, production relay,
  or internet-P2P claims until route kind, identity, encryption, and payload
  transit are proven on two machines

## 2026-06-03 relay lease store status boundary update

The P2P control-plane release gate now requires explicit relay lease store
status in the API/CLI/evidence contract.

- `/api/v1/p2p/relay/lease` reports whether the lease audit store is configured,
  which backend is active, and whether that backend is release-grade.
- `musu relay leases --json` preserves those fields even when the hosted API
  returns a storage error body.
- `verify-p2p-control-plane-evidence.ps1` rejects evidence with missing,
  unconfigured, or non-release-grade relay lease storage.
- File and development-file stores are valid for local tests only. Hosted public
  P2P evidence must use KV/Upstash-backed owner-scoped storage.

This does not make relay the default payload path and does not claim relay
payload transport is ready. It narrows the remaining `musu.pro` blocker to
actual hosted storage, owner scope, and later relay/tunnel transport proof.

## 2026-06-02 post-file-sync primary evidence boundary update

Fresh primary packaged evidence after file sync watcher storm hardening restores
the local desktop/resource claim on `HUGH_SECOND`:

- single-machine smoke passed through the packaged WindowsApps alias and local
  dashboard bridge
- desktop repeated activation stayed single-instance
- process ownership reported runtime `1`, desktop `1`, MUSU-owned Node `0`, and
  MUSU-owned WebView2 `7`
- desktop-open CPU and the four-state runtime matrix stayed below the 5%
  one-core release budget
- machine-wide Node process count was `18`, but current evidence does not
  attribute those processes to MUSU-owned helpers

This still does not expand the public network claim:

- primary evidence is one-machine evidence
- second-PC CPU/matrix/route evidence remains required for two-machine desktop
  readiness
- live `musu.pro` owner-scoped control-plane evidence remains required before
  account-assisted rendezvous/relay readiness is claimed
- Store copy must stay limited to evidence-backed local/LAN/private workflow
  claims until route kind, peer identity, encryption, and payload transit truth
  are proven on two machines

## 2026-06-03 primary evidence after relay-store-status boundary update

Fresh primary evidence after the relay lease store status live P2P pass
restores the local runtime quality claim on `HUGH_SECOND`:

- single-machine smoke passed
- desktop-open CPU passed with MUSU `0`, Node `0.05`, WebView2 `0.31`, and
  hot `0`
- four-state runtime CPU matrix passed with route token
  `MUSU_CPU_SCENARIO_ROUTE_OK_20260603_063400`
- clean go/no-go reports `local_artifacts_ready=True` and
  `single_machine_verified=True`

This does not expand public network claims:

- second-PC route, runtime idle CPU, and runtime CPU matrix evidence are still
  required for two-machine readiness
- `musu.pro` still lacks owner-scoped KV/Upstash relay lease proof
- `musu.pro` still must not be described as the default payload data path
- relay payload transport must be separately implemented and proven before
  `route_kind=relay` can be marketed as release-grade

## 2026-06-04 local-first web coordination update

MUSU must preserve a hard boundary between local execution and web
coordination.

- `localhost` / `127.0.0.1` remains the local dashboard and developer/operator
  surface for the installed program on that device.
- `musu.pro` is the remote account and coordination surface. It can accept user
  input from another place, show project rooms, bind devices, broker rendezvous,
  and display status.
- Local work is executed by the installed MUSU program on each participating
  device. The web service should deliver instructions to that runtime; it
  should not become the default execution server.
- Cross-device setup may use `musu.pro` for initial discovery and lease/session
  coordination, then prefer direct P2P mesh transport. Relay/tunnel remains a
  fallback path and a Connect feature, not the default Core data path.
- A real multi-device claim requires the same current MUSU build installed and
  running on the other device, plus imported second-PC evidence.

## 2026-06-06 primary evidence boundary update

Fresh primary packaged evidence after the degraded/fallback gate confirms the
local-runtime side of the boundary:

- the installed WindowsApps MUSU runtime can be clean-started as a local
  desktop program
- `musu up --json` may report `dashboard.required=false`; this is valid for the
  packaged local executor because user input can arrive through MUSU.PRO or
  another connected operator surface
- single-machine smoke can pass as `local-bridge-only` without
  `localhost:3001`
- desktop-open idle CPU and five-scenario runtime CPU matrix stay below the
  one-core CPU budget on the primary machine

This does not expand the network claim:

- the targeted `HUGH-MAIN` route attempt still timed out at
  `192.168.1.192:8949`
- a failed targeted route CPU sample is not real multi-device success evidence
- second-PC route/CPU/matrix evidence and hosted MUSU.PRO owner-scoped P2P/relay
  proof remain required before account-assisted P2P or relay readiness can be
  claimed

This keeps the simple product rule intact: local and trusted-network execution
is Core; remote web input, hosted rendezvous, relay/tunnel, and project-room
coordination are Connect.

## 2026-06-05 background-task audit boundary update

Rust spawn/background-task audit coverage is now part of the local-executor
quality gate.

- New Rust files using `tokio::spawn`, `tokio::task::spawn_blocking`,
  `std::thread::spawn`, or `thread::spawn` must be explicitly allowlisted and
  contract-audited by `audit-rust-background-loop-contract.ps1`.
- A spawn is acceptable only when it is tied to an explicit local runtime
  contract such as opt-in feature gating, request scope, awaited bounded work,
  timeout-bound cloud submission, cancellation-aware daemon shutdown, or
  one-shot completion.
- This protects MUSU Desktop idle CPU behavior. It is not a substitute for
  two-machine runtime CPU evidence.
- This does not move execution to `musu.pro`. Local MUSU programs still execute
  work, and `musu.pro` remains the remote input, rendezvous, path-selection,
  relay-fallback policy, and evidence coordination plane.

## 2026-06-05 native RPC exec boundary update

Native bridge `/api/v1/rpc/exec` is a local-runtime execution boundary, not a
general remote shell.

- The endpoint fails closed unless `MUSU_RPC_EXEC_ALLOWLIST` explicitly names
  the requested bare command.
- Command paths are rejected even when their basename is allowlisted.
- User-supplied `cwd` is rejected to avoid platform-specific executable path
  resolution ambiguity.
- Arguments, command length, stdout/stderr, and execution time are bounded.
- Timed-out children are created with `kill_on_drop(true)`.
- Rejected, failed, timed-out, and completed attempts are audit-logged.
- The operator API security contract now covers this endpoint.

This preserves the local-first rule: web or peer input can request bounded,
audited work from a local MUSU program, but it cannot turn MUSU.PRO or the P2P
control plane into an unrestricted command executor.

## 2026-06-05 post native RPC exec evidence boundary update

Fresh packaged local-runtime evidence after native RPC exec hardening confirms
the intended product boundary on HUGH_SECOND.

- Packaged single-machine evidence passes with
  `single_machine_surface=local-bridge-only` and `dashboard_required=false`.
- The installed bridge/runtime is the local product surface; a fixed
  `localhost:3001` dashboard is optional and must not be treated as required
  cloud access.
- MUSU.PRO can host remote user input, project/company rooms, meetings,
  rendezvous, path selection, fallback policy, and evidence.
- MUSU.PRO must not become the execution server or default payload data path.
- Local MUSU programs execute work on each device and should prefer direct P2P
  mesh after web-assisted discovery.
- Targeted HUGH-MAIN post-route CPU evidence only proves this machine stays
  inside CPU budget after a failed second-PC route attempt. It does not prove
  successful multi-device routing.

This does not expand the public network claim. Public release still requires
second-PC multi-device evidence, second-PC idle CPU and runtime matrix evidence,
live owner-scoped MUSU.PRO P2P control-plane proof, support mailbox evidence,
and Store evidence.

## 2026-06-06 post relay payload preflight evidence boundary update

Fresh HUGH_SECOND packaged evidence after the release relay payload preflight
endpoint confirms the same local/web boundary:

- MUSU Desktop runs the local runtime and desktop shell.
- The packaged local bridge can be healthy without a fixed
  `localhost:3001` dashboard.
- MUSU.PRO may provide remote input, project/company rooms, rendezvous,
  path-selection, relay-fallback policy, and evidence.
- MUSU.PRO still must not become the default execution server or default
  payload data path.
- `/api/v1/relay/payload` is preflight only while
  `RELAY_PAYLOAD_ENDPOINT_IMPLEMENTED=false`.

Current HUGH_SECOND evidence proves one-machine local execution only:

- single-machine local bridge-only smoke passed
- desktop-open idle CPU stayed within budget
- five-scenario runtime CPU matrix passed
- failed HUGH-MAIN route attempt did not cause a post-route CPU spike

Public release still requires another Windows PC plus live owner-scoped
MUSU.PRO P2P/relay proof.

## 2026-06-06 runtime CPU subrole evidence boundary update

Fresh HUGH_SECOND evidence after the runtime CPU subrole attribution gate
confirms the same local/web boundary with stronger process attribution:

- MUSU Desktop remains the local executor.
- MUSU.PRO remains remote input, project/company room, rendezvous,
  path-selection, relay-fallback policy, and evidence control plane.
- The packaged local bridge can be healthy without a fixed
  `localhost:3001` dashboard.
- CPU evidence now separates `bridge_runtime`, `desktop_shell`, and
  `webview2_helper` instead of accepting only coarse MUSU/WebView2 process
  roles.

Current HUGH_SECOND evidence proves one-machine local execution only:

- single-machine local bridge-only smoke passed
- desktop-open idle CPU stayed within budget with `bridge_runtime=1`,
  `desktop_shell=1`, and `webview2_helper=6`
- five-scenario runtime CPU matrix passed with the same subrole attribution
- failed HUGH-MAIN route attempt did not cause a post-route CPU spike

Public release still requires another Windows PC plus live owner-scoped
MUSU.PRO P2P/relay proof, support mailbox proof, and Store proof.

## 2026-06-06 second-PC CPU import boundary update

The second-PC return importer now rejects release-gate CPU returns that do not
carry current runtime CPU subrole attribution.

- `run-second-pc-release-check.ps1` records
  `runtime_cpu_subrole_contract_ok=true` only when imported CPU evidence
  separates `bridge_runtime`, `desktop_shell`, and `webview2_helper`.
- `import-second-pc-return.ps1 -RequireReleaseGateEvidence` directly checks the
  returned idle CPU and runtime matrix JSONs for `process_counts_by_subrole`,
  `max_one_core_percent_by_subrole`, `memory_totals_by_subrole_mb`, and
  `process_subrole` top-process rows.
- Stale second-PC return zips remain diagnostic but cannot close public
  two-machine CPU/matrix gates.

This keeps the product boundary explicit: MUSU Desktop on each device measures
and executes locally; MUSU.PRO can coordinate input, rendezvous, path selection,
room state, and evidence, but it does not become the executor or the default
payload data path.

## 2026-06-06 final operator packet boundary update

The final operator packet and operator action pack were regenerated after the
second-PC CPU subrole import contract.

- Current second-PC transfer:
  `.local-build\operator-action-pack\MUSU-1.15.0-rc.1-operator-action-pack-20260606-020432\second-pc\MUSU-second-PC-transfer-1.15.0-rc.1-20260606-020432.zip`
- Current final operator packet:
  `.local-build\final-operator-gates\musu-final-operator-gates-1.15.0-rc.1-20260606-020415.zip`
- Current operator action pack:
  `.local-build\operator-action-pack\MUSU-1.15.0-rc.1-operator-action-pack-20260606-020432.zip`

Both artifact verifiers pass with `fail_count=0`. This means operator handoff
is aligned with the product boundary: the web/control-plane side can coordinate
input and evidence, but the current second-PC kit still requires a local MUSU
program on the other Windows device to perform install checks, route smoke,
CPU sampling, runtime matrix capture, and process subrole attribution.

This does not expand the public network claim. Public release still requires
real second-PC evidence, live owner-scoped MUSU.PRO P2P proof, support mailbox
proof, and Store proof.

## 2026-06-06 relay transport kind/encryption boundary update

The relay release contract now names two separate things:

- release relay tunnel kind: `quic_relay_tunnel`
- release encryption/proof requirement: `quic_tls_1_3`

`websocket_tunnel` remains a preview/store-forward descriptor and cannot satisfy
the release relay transport gate. `quic_tls_1_3` is not the relay kind; it is
the encryption/proof contract the release tunnel must emit.

This preserves the product boundary:

- MUSU Desktop on each device remains the local executor and payload worker.
- MUSU.PRO can accept remote user input, host project/company rooms, coordinate
  rendezvous/path selection, issue relay fallback leases, and record evidence.
- MUSU.PRO still does not become the default execution server or default
  payload data path.

Current source therefore remains release-blocked for hosted relay transport:
`RELAY_TRANSPORT_KIND=websocket_tunnel`,
`RELAY_PAYLOAD_ENDPOINT_IMPLEMENTED=false`, hosted KV/Upstash evidence is not
configured, and live relay payload delivery proof is absent.

## 2026-06-06 filesystem watcher boundary update

The default local desktop/runtime path must not start hidden file/index
watchers as a side effect of MUSU.PRO control-plane work.

Current contract:

- `musu indexer watch` is an explicit CLI/operator command, not a default
  bridge or desktop behavior.
- File sync watcher starts only when shared file roots are configured for the
  bridge, or when an operator explicitly runs `musu sync`.
- The Rust background-loop release audit rejects filesystem watcher primitives
  outside `musu-rs/src/indexer/watch.rs` and `musu-rs/src/install/sync.rs`.
- The final operator packet verifier checks that the strengthened watcher-scope
  audit is present.

This reinforces the same product boundary: MUSU Desktop is the local executor
and resource owner; MUSU.PRO can coordinate remote input, rooms, rendezvous,
path selection, relay fallback, and evidence, but it does not turn the web
control plane into a default local filesystem watcher or execution server.

## 2026-06-06 network watcher boundary update

The default local desktop/runtime path must not grow hidden network scan or
poll loops as a side effect of MUSU.PRO control-plane work.

Current contract:

- `musu discover` is the explicit active mDNS discovery command.
- Bridge mDNS remains opt-in through `MUSU_ENABLE_MDNS=1`.
- Relay payload target polling remains opt-in through
  `MUSU_ENABLE_RELAY_PAYLOAD_POLLER=1`.
- `musu login` owns device-code polling.
- Logged-in MUSU.PRO registration remains the low-duty heartbeat path.
- Control SSE heartbeat, auto-update ticker, and relay payload handler/client
  surfaces are allowlisted and audited.
- The Rust background-loop release audit rejects new network watcher/poller
  primitives outside those reviewed surfaces.

This keeps MUSU.PRO as remote input/rendezvous/path-selection/relay-fallback
control plane, not a reason for the local desktop runtime to perform hidden
network watching.

## 2026-06-06 degraded/fallback truthfulness boundary

MUSU.PRO/web may accept remote user input and coordinate rooms, rendezvous,
path selection, relay fallback, and evidence. It must not make missing local
runtime state look healthy.

Current contract:

- Local MUSU Desktop/bridge remains the executor and resource owner.
- Web/API status surfaces must expose stale, unavailable, or fallback state as
  `degraded`, `offline`, `health-fallback`, or `offline-fallback`.
- Agents data failures return `agents_unavailable` and do not fabricate
  department state.
- Stale agents snapshots return `agents_stale`.
- `/api/device-status` returns local status plus fallback source and `devices`;
  failed bridge status/health returns `offline-fallback` and no fabricated
  `recommended_for` capabilities.
- COS synthesis and node mesh surfaces keep structured degraded envelopes.
- The release gate `musu.degraded_mode_contract.v1` blocks if these surfaces
  drift.

This reinforces the same product boundary: MUSU.PRO is the remote input and
coordination plane, while the installed local MUSU program remains the place
where work and local status truth originate.

## 2026-06-06 current P2P/control-plane audit boundary

The current audit keeps the local-vs-web split explicit:

- Local MUSU Desktop/bridge executes work on the device.
- MUSU.PRO provides authenticated remote input and coordination, not default
  execution.
- MUSU.PRO can host company/project room state so AIs attached to the same
  project can coordinate.
- MUSU.PRO can exchange presence, candidate, NAT, relay-fallback, and route
  evidence metadata to bootstrap device connections.
- Direct P2P mesh remains the preferred data/work path after bootstrap.
- Hosted relay remains fallback-only, owner-scoped, non-default, and
  release-blocked until real `quic_relay_tunnel` payload transport with
  `quic_tls_1_3` proof is implemented and evidenced.

Current validation found no high/medium code issue in the audited surfaces.

## 2026-06-06 room work-order audit boundary

MUSU.PRO room work-order input is now part of the command-audit boundary.

- `POST /api/rooms/[roomId]/work-orders` still requires P2P control auth before
  it can reach the local bridge.
- After auth, accepted, rejected, and bridge-error room work-order handoffs
  write `rooms.work_orders` events to command-center audit JSONL.
- The event records owner key, room/work-order/company/project context, target
  node, `origin=musu.pro`, status, and trace id.
- The event does not store `instruction` or `text`.

This keeps MUSU.PRO as remote input/control plane and MUSU Desktop as the local
executor, while making remote-input-to-local-execution handoff auditable.
Release remains No-Go because second-PC evidence, production hosted P2P proof,
support mailbox proof, and Store evidence are still missing.

## 2026-06-06 runtime CPU attribution boundary

Release CPU evidence for the local runtime must prove which local process tree
was measured.

Current contract:

- runtime CPU scenario matrices must carry per-scenario process metadata
  availability
- process metadata lookup must not time out
- helper process scope must be limited to the MUSU process tree or
  repo-related helpers
- CPU attribution scope must be
  `musu_process_tree_or_repo_related`
- unrelated local helper processes must not be able to satisfy release CPU
  evidence for the MUSU Desktop runtime

This reinforces the same product boundary: MUSU Desktop remains the local
executor and resource owner, while MUSU.PRO can coordinate remote input,
rooms, rendezvous, path selection, relay fallback, and evidence/control state.

## 2026-06-06 relay connect preflight input boundary

MUSU.PRO release relay connect preflight is metadata-only until real release
tunnel payload transport exists.

Current contract:

- `/api/v1/relay/connect` requires P2P control auth.
- `POST /api/v1/relay/connect` accepts only relay lease metadata:
  optional `schema`, `lease_id`, `session_id`, `source_node_id`, and
  `target_node_id`.
- payload byte fields are rejected before lease lookup.
- unknown request fields are rejected instead of passed through.
- the endpoint does not call the preview store-forward payload queue.
- verified leases still fail closed with `relay_payload_endpoint_not_wired`
  until the release relay tunnel payload endpoint exists.

This keeps MUSU.PRO as control plane and prevents the connect preflight surface
from becoming an accidental data path.

## 2026-06-07 release payload preflight metadata boundary

MUSU.PRO release payload preflight is still metadata-only until real release
relay tunnel payload transport exists. The preflight now requires enough tunnel
metadata to identify the intended release payload before any lease lookup:

- `tunnel_id`
- `payload_kind=forwarded_task_envelope`
- 64-hex `payload_sha256`

Boundary interpretation:

- byte fields are rejected before schema parsing
- unknown fields are rejected before lease lookup
- a verified lease still returns `relay_payload_endpoint_not_wired`
- `release_payload_metadata` is audit metadata only
- `release_payload_accepted=false`, `payload_stored=false`, and
  `payload_transported=false` remain normative until the release tunnel is
  implemented
- `RELAY_PAYLOAD_ENDPOINT_IMPLEMENTED=false`,
  `RELAY_TUNNEL_RUNTIME_IMPLEMENTED=false`, and
  `RELAY_TRANSPORT_KIND=websocket_tunnel` keep the hosted P2P release gate
  closed

This keeps MUSU.PRO as remote input/control plane and prevents a loose
metadata preflight from becoming an accidental payload or execution path.

## 2026-06-06 relay transport proof input boundary

MUSU.PRO relay transport proof recording is metadata-only.

Current contract:

- `POST /api/v1/p2p/relay/transport-proof` requires P2P control auth.
- the request schema is strict.
- raw payload byte fields are rejected before lease lookup.
- unknown request fields are rejected.
- `payload_bytes_transited` is allowed only as proof metadata.
- the endpoint does not transport payload bytes and does not call the preview
  store-forward payload queue.

This keeps the release evidence API from becoming an accidental data path.
Release payload transport still belongs to a future distinct
`quic_relay_tunnel` path that can emit `quic_tls_1_3` proof.

## 2026-06-06 current HEAD local CPU evidence boundary

Current clean HEAD `2387db2dea5fc983d0d3104b41037642b9939ccc` has fresh
one-machine `desktop-open` idle CPU evidence on `HUGH_SECOND`.

Contract interpretation:

- the evidence proves MUSU Desktop local resource behavior on the sampled
  machine
- owned process attribution separates MUSU runtime/shell/WebView2 helpers from
  unrelated machine-wide Node/WebView2 processes
- this does not prove a second Windows PC route
- this does not prove hosted MUSU.PRO P2P control-plane readiness
- this does not prove release relay tunnel payload transport

This reinforces the product boundary: the local program is the executor and
resource owner; MUSU.PRO is the web input, room, rendezvous, path-selection,
relay-fallback, and evidence/control plane.

## 2026-06-06 route evidence input boundary

MUSU.PRO route evidence recording is metadata-only.

Current contract:

- `POST /api/v1/p2p/route-evidence` requires P2P control auth.
- route evidence, relay fallback, relay transport proof, and relay payload
  delivery proof schemas are strict.
- raw payload byte fields are rejected before evidence storage.
- numeric byte counts and hashes are proof metadata only.
- route evidence does not transport payload bytes.

This keeps route evidence as a control-plane/evidence surface, not a data path.

## 2026-06-06 rendezvous input boundary

MUSU.PRO P2P rendezvous and candidate exchange are metadata-only.

Current contract:

- `POST /api/v1/p2p/rendezvous` requires P2P control auth and accepts only
  source/target/capability metadata.
- `POST /api/v1/p2p/rendezvous/[id]/candidates` requires P2P control auth and
  accepts only node identity, route candidate, NAT, relay descriptor, and
  capability metadata.
- raw payload byte fields are rejected before session/candidate-cache storage.
- unknown fields are rejected.
- rendezvous does not transport payload bytes.

This keeps MUSU.PRO as the P2P bootstrap and path-selection control plane.

## 2026-06-06 room control input boundary

MUSU.PRO room rendezvous and room presence are metadata-only.

Current contract:

- `POST /api/rooms/[roomId]/rendezvous` requires P2P control auth and accepts
  only source/target/capability plus bounded context metadata.
- body `room_id` is rejected; the path `roomId` is canonical.
- `POST /api/rooms/[roomId]/presence` requires P2P control auth and accepts
  only node identity, room context, route candidate, NAT, relay descriptor, and
  capability metadata.
- raw payload byte fields are rejected before room storage or candidate-cache
  seeding.
- unknown fields are rejected.
- room presence and rendezvous do not transport payload bytes.

This keeps MUSU.PRO as a project/company room and P2P bootstrap control plane;
local MUSU programs still do the actual work.

## 2026-06-06 post room-control local CPU evidence boundary

Current clean HEAD `ade5b64f012c14a8de6f2c0fa99065de5db45f64` has fresh
one-machine `desktop-open` idle CPU and process ownership evidence on
`HUGH_SECOND`.

Contract interpretation:

- the evidence proves local MUSU Desktop CPU/process behavior on the sampled
  machine only
- process ownership separates MUSU-owned runtime/shell/WebView2 helpers from
  unrelated machine-wide Node/WebView2 processes
- MUSU.PRO remains a remote input and coordination plane, not the executor
- MUSU.PRO can help local programs discover each other through rooms,
  presence, rendezvous, path selection, relay fallback, and evidence metadata
- direct P2P mesh remains preferred after bootstrap
- hosted relay remains fallback-only and still requires distinct release
  tunnel payload transport proof

Release interpretation:

- `20260606-080201-HUGH_SECOND.desktop-open` does not reproduce the local
  busy-loop concern
- `20260606-080350-HUGH_SECOND.process-ownership` proves the live runtime is
  packaged and owned
- this does not satisfy second-PC route/CPU/matrix evidence
- this does not satisfy live hosted MUSU.PRO P2P/relay proof
- this does not satisfy public metadata, support mailbox, or Store proof

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

## 2026-06-06 external gate root-cause boundary

The current clean external-gate recheck keeps the local/web/network boundary
unchanged.

Evidence:

- `docs\evidence\external-gates\1.15.0-rc.1\20260606-090152-HUGH_SECOND.external-gates.evidence.json`
- `docs\evidence\p2p-control-plane\1.15.0-rc.1\20260606-090333-musu.pro.evidence.json`

Boundary interpretation:

- `public_metadata_ok=True` proves the public site metadata gate, not runtime
  execution.
- `tcp_connect_timeout` to `192.168.1.192:8949` proves the second-PC route is
  unavailable from this machine state.
- P2P `logged_in=false`, owner scope false, and release relay endpoint wiring
  false prove production account/control-plane/relay evidence is incomplete.
- These failures are not localhost dashboard failures and do not move local
  execution to MUSU.PRO.

Required path remains:

- local MUSU programs execute work on their own devices
- MUSU.PRO accepts remote user input and coordinates rooms, presence,
  rendezvous, path selection, relay fallback, and evidence
- direct P2P mesh is preferred after bootstrap
- hosted relay is fallback-only and release-grade only after real tunnel
  payload proof exists

## 2026-06-06 idle busy-loop source-contract boundary

The idle busy-loop source-contract audit does not move execution or payload
transport across the network boundary.

Contract interpretation:

- go/no-go must keep reporting all eight idle candidates: clipboard polling,
  mDNS discovery, health check retry, bridge readiness wait, frontend
  interval/refetch, relay payload target polling, cloud heartbeat, and
  log/telemetry flush
- the source verifier now fails if the candidate list, status field, verified
  field, or blocker area disappears
- this is a local desktop resource-budget release contract, not a hosted
  execution feature
- MUSU.PRO remains remote input, rooms, rendezvous, path selection,
  relay-fallback coordination, and evidence
- local MUSU programs remain the execution and resource owners

## 2026-06-06 current HEAD runtime CPU matrix boundary

Fresh current clean HEAD runtime CPU matrix evidence on `HUGH_SECOND` confirms
local packaged runtime resource behavior only.

Evidence:

- `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260606-094149-HUGH_SECOND.runtime-cpu-scenario-matrix.json`
- `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260606-095252-HUGH_SECOND.runtime-cpu-scenario-matrix.json`

Boundary interpretation:

- the full matrix proves local MUSU Desktop CPU/process behavior on the
  sampled machine across `startup-open`, `runtime-started`, `dashboard-open`,
  `desktop-open`, and `post-route`
- the HUGH-MAIN diagnostic proves the local runtime stayed under CPU budget
  while a target route attempt timed out against `192.168.1.192:8949`
- the failed target diagnostic does not prove a successful second-PC route
- `localhost:3001` remains optional developer/operator dashboard behavior, not
  required packaged MUSU Desktop behavior
- MUSU.PRO remains the web input, room, rendezvous, path-selection,
  relay-fallback, and evidence control plane
- local MUSU programs remain the execution and resource owners

## 2026-06-06 room work-order rejected audit boundary

MUSU.PRO room work-order rejected-input audit logging is now a release-gated
security contract.

Boundary interpretation:

- P2P control auth is required before room work-order input can reach the local
  bridge.
- Accepted, bridge-error, invalid-JSON, and missing-instruction paths leave
  command audit metadata.
- Rejected invalid-JSON and missing-instruction paths do not call the bridge.
- Command audit metadata records owner/room/status/reason fields.
- Command audit metadata must not store prompt text as `text` or
  `instruction`.

This keeps MUSU.PRO as a remote input and control-plane surface. It does not
make MUSU.PRO the executor, and it does not make command audit logs a content
store.

## 2026-06-06 relay route transport proof verifier boundary

Hosted P2P release evidence now fails unless each release-grade relay route
record proves the route's own relay transport path.

Boundary interpretation:

- MUSU.PRO may store and return route evidence.
- MUSU.PRO does not become the executor merely because it stores relay route
  evidence.
- Release-grade relay evidence must bind route `session_id`, source node,
  target node, fallback `lease_id`, `relay_transport_proof`, and
  `relay_payload_delivery_proof` into one coherent proof chain.
- Store-forward queue delivery proof alone is not release relay tunnel proof.
- The release relay transport kind remains `quic_relay_tunnel`; preview or
  queue descriptors such as `websocket_tunnel` stay non-release-grade.

This strengthens evidence verification without closing the external hosted P2P
gate. The production runtime still needs real owner-scoped MUSU.PRO login,
release relay tunnel transport, nonzero relay route evidence, and second-PC
route/CPU/matrix evidence.

## 2026-06-06 telemetry flush scope boundary

Log/telemetry flush scope is now part of the local-runtime idle boundary.

Boundary interpretation:

- one-shot CLI prompt flushing is allowed only from explicit request-scoped
  surfaces such as uninstall confirmation
- background telemetry/log flush workers are not allowed in packaged MUSU
  Desktop unless a future change adds explicit opt-in, low-duty behavior,
  cancellation, and release CPU evidence
- final operator gate packets must preserve this audit contract
- this is a local desktop resource-budget contract, not a hosted execution
  feature

MUSU Desktop remains the local executor. MUSU.PRO remains remote input,
project/company room, rendezvous, path-selection, relay-fallback policy, and
evidence/control plane.

## 2026-06-06 current audit network boundary

The current code audit at
`c879a849f403aadefdd071a012aaa4cd304cbf24` reaffirms the same boundary:

- local MUSU Desktop owns execution, files, shell/app/browser automation,
  local bridge behavior, and local CPU/memory budget
- MUSU.PRO owns remote input, project/company room state, AI meeting-room
  coordination state, presence, rendezvous, path selection, relay fallback
  coordination, and evidence/control-plane APIs
- path priority remains `lan -> tailscale -> direct_quic -> relay`
- hosted relay remains fallback-only and non-default
- preview store-forward payload queues remain non-release-grade
- release relay requires actual `quic_relay_tunnel` payload movement and
  `quic_tls_1_3` proof
- `localhost:3001` is optional developer/operator dashboard behavior, not a
  packaged local runtime requirement

Release readiness still requires successful two-machine route evidence,
second-machine CPU/matrix evidence, live owner-scoped MUSU.PRO P2P proof,
support mailbox proof, and Store/Partner Center proof.

## 2026-06-06 current HEAD qualitative audit network boundary

Current HEAD `52d325d43b691c6e1b56404e34cfd2ba85257311` reaffirms the network
boundary after fresh security, polling, process ownership, relay, and
go/no-go audits:

- local MUSU Desktop owns execution, files, shell/app/browser automation,
  local bridge behavior, CPU, and memory
- MUSU.PRO owns remote input, project/company room state, AI meeting-room
  coordination state, presence, rendezvous, path selection, relay fallback
  coordination, and evidence/control-plane APIs
- the packaged local bridge is healthy on `127.0.0.1:4751`
- `localhost:3001` is not a packaged runtime requirement
- path priority remains `lan -> tailscale -> direct_quic -> relay`
- hosted relay remains fallback-only and non-default
- preview store-forward payload queues remain non-release-grade
- release relay requires real `quic_relay_tunnel` payload movement,
  `quic_tls_1_3` proof, owner-scoped route proof, and payload delivery proof

Current No-Go blockers are external/evidence blockers: second-PC route/CPU
matrix evidence, live MUSU.PRO login/storage and relay proof, support mailbox
proof, and Store/Partner Center proof.

## 2026-06-06 relay route record metadata boundary

Hosted P2P release evidence now requires the route record itself to include
release-grade metadata:

- candidate address
- route latency and handshake timing
- verified QUIC/TLS peer identity
- hardened encryption
- transport verifier
- matching relay transport proof handshake timing

Boundary interpretation:

- MUSU.PRO may store and return route evidence.
- MUSU.PRO still does not execute local work.
- A nested proof object cannot compensate for a weak route record.
- Release relay evidence must prove both the enclosing route record and the
  nested transport/delivery proof chain.
- `localhost:3001` remains irrelevant to packaged desktop runtime readiness.

This keeps MUSU.PRO as web input, room, rendezvous, path-selection,
relay-fallback, and evidence control plane. MUSU Desktop remains the local
executor and resource owner on each device.

## 2026-06-06 second-PC route-attempt local target boundary

Targeted second-PC route-attempt CPU diagnostics must not use a local-only
target.

Boundary interpretation:

- `localhost`, loopback, and local-only aliases are local runtime diagnostics,
  not second-PC route attempts.
- A failed route attempt can be useful for CPU attribution only when the target
  is non-local, command-bound, argument-bound, token-bound, and not the
  operator machine.
- This does not make failed route attempts multi-device proof.
- Successful two-machine route evidence remains required for release.

## 2026-06-07 MUSU Desktop HUGH-MAIN reachability boundary

MUSU Desktop is the local executor. `localhost:3001` is not the packaged
desktop runtime contract.

The current `HUGH_SECOND` diagnostic reports local packaged MUSU Desktop
healthy at `http://127.0.0.1:1158`. The registered `HUGH-MAIN` peer is
`192.168.1.192:8949`, unhealthy, and not reachable by TCP or ping from
`HUGH_SECOND`.

Boundary implications:

- this is not a reason to move execution into MUSU.PRO;
- this is not a reason to require the localhost web dashboard for packaged
  desktop operation;
- this is not successful multi-device proof;
- this is not release-grade P2P proof because the candidate is manual
  `lan`/HTTP bearer with `none_http_bearer` and
  `peer_identity_verified=false`;
- MUSU.PRO may still be the remote input, project room, rendezvous,
  path-selection, relay-fallback, and evidence control plane;
- the next release step is current MUSU Desktop running on a reachable second
  Windows PC, followed by successful route/CPU/matrix evidence and hosted
  MUSU.PRO route/relay proof.

## 2026-06-07 route reachability diagnostic tooling boundary

Route reachability failure is now a first-class diagnostic evidence type:
`musu.route_reachability_diagnostic.v1`.

Boundary implications:

- failed reachability diagnostics can guide recovery work;
- failed reachability diagnostics cannot satisfy successful multi-device
  release proof;
- local-only targets are rejected when the verifier is run with
  `-RequireNonLocalTarget`;
- fake successful route proof is rejected by requiring failed diagnostics to
  keep peer health, TCP reachability, route result, and conclusion fields
  consistent;
- neighbor/ARP presence remains explicitly marked as not route success proof.

## 2026-06-07 second-PC route reachability handoff boundary

Route reachability diagnostics are now included in the second-PC handoff path
when a target peer is supplied.

Boundary implications:

- The diagnostic can travel through a second-PC return zip and be imported into
  the primary repo's `.local-build\route-diagnostics\` evidence root.
- The primary importer verifies non-local target shape before accepting a
  required diagnostic.
- MUSU.PRO may be used to make remote input and device connection easier, but
  the local MUSU Desktop program remains the process that records endpoint and
  route-attempt evidence.
- This does not change the release proof boundary: successful multi-device
  proof still requires release-grade `musu.route_evidence.v1`, verified peer
  identity, hardened transport, and payload transit truth.

## 2026-06-07 current primary CPU refresh boundary

Current primary-machine evidence after process ownership CLI hardening confirms
the local packaged MUSU Desktop runtime is healthy and quiet on `HUGH_SECOND`.

Boundary implications:

- `localhost:3001` remains outside the packaged desktop runtime contract;
- the working local bridge is `127.0.0.1:1158`;
- the current failing network edge is the non-local `HUGH-MAIN` peer at
  `192.168.1.192:8949`;
- failed route-attempt CPU evidence is diagnostic and does not become
  successful P2P proof;
- MUSU.PRO still coordinates remote input, rooms, rendezvous, path selection,
  relay fallback, and evidence, while MUSU Desktop executes work locally.

Release proof still requires successful second-machine route evidence, verified
peer identity, hardened transport, and payload transit truth before any
MUSU.PRO relay path can satisfy the public P2P gate.

## 2026-06-07 P2P env go/no-go boundary

The public go/no-go report now exposes P2P env readiness and blockers from
`show-musu-pro-p2p-env-status.ps1`.

Boundary implications:

- exposing `p2p_control_plane_env_status` is diagnostic/status hardening only;
- a MUSU.PRO status preflight cannot replace local execution on each device;
- a MUSU.PRO relay fallback cannot become the default payload path;
- release-grade relay remains blocked until the local runtime implements the
  release tunnel, the hosted endpoint proves owner-scoped storage/login, and
  route records include metadata, transport proof, and payload delivery proof;
- public release still needs successful second-PC route/CPU/matrix evidence.

This keeps the product split intact: MUSU Desktop does the work locally, and
MUSU.PRO coordinates input, rooms, rendezvous, path selection, relay fallback,
and evidence.

## 2026-06-07 release relay tunnel marker boundary

Release relay readiness cannot be declared by policy markers alone.

Boundary implications:

- preflight-only `/api/v1/relay/payload` remains control-plane metadata, not a
  payload tunnel;
- preview store-forward queues remain non-release-grade;
- Rust must implement release tunnel submit/accept and emit
  `quic_relay_tunnel` plus `quic_tls_1_3` payload proof before the release
  markers can become true;
- marker-only flips must produce source conflict blockers in P2P env status.

## 2026-06-07 support mailbox request boundary

Support mailbox request packets are operator-action templates, not release
evidence.

Boundary implications:

- `prepare-support-mailbox-verification-request.ps1` writes only ignored local
  request output under `.local-build\support-mailbox-requests`;
- the request schema is `musu.support_mailbox_verification_request.v1`;
- request output must report `release_gate_satisfied=false`;
- real release evidence still requires a delivered email in the support inbox
  and `record-support-mailbox-verification.ps1`;
- placeholder sender addresses are rejected by the verifier, so templates must
  be replaced with a real external sender before evidence can pass;
- support request/record/verify/operator-card tooling is freshness status-only
  and must not stale unrelated local desktop evidence;
- this does not move execution or verification into MUSU.PRO.

MUSU Desktop remains the local executor. MUSU.PRO remains remote input,
project/company room, rendezvous, path selection, relay fallback coordination,
and evidence/control plane.

## 2026-06-07 route attempt CPU evidence boundary

Post-route CPU evidence for an allowed failed target route attempt must prove
the route probe attempt metadata, not only a summary status.

Boundary implications:

- failed target-route attempts may support CPU diagnostics only;
- route probe evidence must include `raw_exit_code`, `attempt_count`,
  `attempts[]`, timeout/output fields, and summary/final-attempt agreement;
- failed route attempts are not route success proof and do not close hosted
  P2P/relay gates;
- MUSU Desktop remains the local executor while MUSU.PRO remains the
  rendezvous/path-selection/relay-fallback/evidence control plane.

## 2026-06-07 release relay tunnel source hook boundary

Release relay tunnel source hooks are now explicit in Rust, but they are still
inside the local executor boundary.

Boundary implications:

- `submit_release_relay_tunnel_payload` and
  `accept_release_relay_tunnel_payload` are local runtime contracts, not
  hosted execution;
- source contract readiness is not runtime readiness;
- release payload movement must still happen locally through an actual
  `quic_relay_tunnel`;
- MUSU.PRO may coordinate the relay fallback and verify owner-scoped evidence,
  but it does not execute the user task;
- preview store-forward queue delivery remains non-release-grade and cannot be
  promoted to release relay proof.

Current correct state remains fail-closed:

- `RELAY_TUNNEL_RUNTIME_IMPLEMENTED=false`
- `RELAY_PAYLOAD_ENDPOINT_IMPLEMENTED=false`
- `RELAY_TRANSPORT_KIND=websocket_tunnel`
- live hosted relay route metadata, transport proof, and payload delivery proof
  are absent

## 2026-06-07 Local Desktop / Web Control-Plane Boundary

The packaged MUSU Desktop runtime is allowed to operate without a local web
dashboard on `localhost:3001`. The release contract is the packaged local
program and bridge, not a developer dashboard port.

Current evidence on `HUGH_SECOND` proves the packaged desktop surface as
`local-bridge-only` with bridge `http://127.0.0.1:1158`.

Network boundary:

- local MUSU programs execute local tasks;
- MUSU.PRO receives remote user input and coordinates rooms, presence,
  rendezvous, path selection, relay fallback, and evidence;
- after rendezvous/path selection, devices should prefer direct P2P routes and
  use relay only as fallback;
- MUSU.PRO must not be treated as a replacement for local execution.

## 2026-06-07 Local Optional Watcher Boundary

Optional local watchers are part of the MUSU Desktop local executor boundary,
not MUSU.PRO execution.

Clipboard polling remains local-only and opt-in:

- default packaged behavior keeps `MUSU_ENABLE_CLIPBOARD_SYNC` off;
- when enabled, the local clipboard monitor now owns a cancellation token;
- Ctrl-C cancellation and loop exit are required by the Rust background-loop
  release audit;
- clipboard polling evidence is CPU/hardening evidence, not hosted control-plane
  evidence.

MUSU.PRO may receive user input and coordinate devices, but it does not read a
device clipboard or execute clipboard work on behalf of the local runtime.

## 2026-06-07 Local mDNS Discovery Boundary

Optional mDNS discovery is part of the MUSU Desktop local executor boundary, not
MUSU.PRO hosted execution.

mDNS remains local-only and opt-in:

- default packaged behavior keeps `MUSU_ENABLE_MDNS` off;
- IPv6, Tailscale, and common VPN/virtual mDNS adapters remain separately
  gated;
- when enabled from the bridge cloud registration loop, mDNS auto-registration
  now receives the cloud loop cancellation token;
- mDNS browse remains bounded by caller duration and 1s receive timeout;
- cancellation exits the receive wait before the bridge continues to later
  cloud control-plane calls.

MUSU.PRO may help devices find each other through registry/rendezvous/path
selection, but local LAN discovery still runs on the local device and cannot be
used as hosted execution proof.

## 2026-06-07 Current Target-Route CPU Audit Boundary

Current target-route CPU evidence proves resource behavior on the local
executor after an explicit non-local route attempt. It does not move execution
to MUSU.PRO and does not prove a successful P2P route.

Boundary implications:

- `HUGH_SECOND` attempted `musu route --target HUGH-MAIN --wait`.
- The target resolved to `http://192.168.1.192:8949/api/tasks/delegate` and
  timed out.
- The failed route attempt is allowed only as a CPU diagnostic when the
  verifier sees the expected target, per-attempt metadata, nonzero normalized
  exit code, and no self/local target.
- `runtime_cpu_second_pc_route_attempt_verified=true` means the local executor
  stayed within CPU/resource budget after the failed non-local route attempt.
- It does not mean `HUGH-MAIN` successfully ran work.
- It does not satisfy the second-PC CPU/matrix, live MUSU.PRO P2P, relay proof,
  support mailbox, or Store gates.

The product boundary remains: MUSU Desktop executes local work and joins the
mesh; MUSU.PRO receives user input, coordinates project rooms and rendezvous,
helps devices discover each other, and records evidence.

## 2026-06-07 Current-Head Boundary Lock

Current HEAD `078ce1c5eeb11edc00aa9a6597e6db1f5b0acc59` does not change the
network boundary. It clarifies it:

- local MUSU Desktop programs execute work on each device;
- MUSU.PRO can receive user input from a remote browser and forward only
  authenticated control metadata to the local runtime;
- MUSU.PRO can host project/company rooms where local agents coordinate;
- MUSU.PRO can assist rendezvous and path selection;
- MUSU.PRO can issue relay fallback only after direct path failure;
- MUSU.PRO must not become the default runtime or default payload path;
- release relay proof must be `quic_relay_tunnel` plus `quic_tls_1_3` proof,
  not preview store-forward queue proof.

The current local desktop evidence is one-machine proof only. Release still
requires second-machine route/CPU/matrix evidence and live hosted
owner-scoped P2P/relay evidence.

## 2026-06-07 Frontend Polling Inventory Boundary

Frontend polling is part of the local desktop/web surface quality contract.
It is not MUSU.PRO execution.

Boundary implications:

- local MUSU Desktop/WebView surfaces may poll local/control metadata only
  through the shared low-duty polling helper;
- direct `setInterval` and ad hoc `visibilitychange` listeners remain banned
  outside the shared poller;
- the release audit now locks the exact 29 non-test low-duty polling call-site
  files and fails on missing or unexpected paths;
- new polling surfaces require an intentional audit update with abort-aware,
  low-duty behavior;
- this gate protects local idle CPU evidence but does not replace 60s runtime
  CPU samples or second-machine proof;
- MUSU.PRO remains remote input, meeting room, rendezvous, path selection,
  relay fallback, and evidence/control plane.

## 2026-06-07 Current Desktop CPU Recheck Boundary

Fresh desktop-open CPU evidence `20260607-102745-HUGH_SECOND.desktop-open`
confirms the packaged local MUSU Desktop runtime can be healthy without any
developer dashboard on `localhost:3001`.

Boundary implications:

- the release runtime contract is the installed local MUSU program and its
  bridge, here `127.0.0.1:14361`;
- MUSU Desktop remains the local executor and owns local work/resources;
- MUSU.PRO may accept remote user input, coordinate rooms, help rendezvous and
  path selection, issue relay fallback, and record evidence;
- MUSU.PRO must not become the default runtime or the default payload path;
- this one-machine CPU pass does not close second-PC evidence, hosted P2P
  route/relay proof, support mailbox proof, or Store proof.

## 2026-06-07 Bridge-Only CPU Boundary

Bridge-only CPU evidence `20260607-105020-HUGH_SECOND.bridge-only` proves the
packaged local bridge can run without desktop shell, Node helpers, WebView2
helpers, or a localhost dashboard.

Boundary implications:

- the local bridge is part of the MUSU Desktop executor boundary;
- the bridge can stay alive as a local control surface without requiring
  `localhost:3001`;
- MUSU.PRO remains remote input, room, rendezvous, path selection, relay
  fallback, and evidence/control plane;
- bridge-only CPU proof does not prove hosted P2P route success or relay
  payload transport.
