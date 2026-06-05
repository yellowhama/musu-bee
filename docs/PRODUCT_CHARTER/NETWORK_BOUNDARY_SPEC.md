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

