# MUSU Private Mesh Deep Research And Redesign

Date: 2026-06-13

Status: design gate before more implementation.

This is an engineering/product design, not legal advice. License, trademark,
and hosted-service obligations still need counsel review before release.

## Verdict

Current MUSU is directionally right but not yet product-grade for the new
promise.

The correct product is not "MUSU uses Tailscale.com." It is:

> MUSU Private Mesh: local/LAN first, then a MUSU-managed or operator-managed
> Headscale-compatible tailnet, with MUSU owning enrollment UX, bridge health,
> route proof, task execution, and callback reconciliation.

Current code already has useful pieces: tailnet IP detection, 100.64/10 route
classification, bridge node registration, delegated task proof, callback proof,
and an MCP runbook that forbids Tailscale.com signup as the default.

But the product architecture is incomplete because there is no MUSU-owned
Headscale provisioning/enrollment layer yet. The code can use a tailnet once it
exists; it does not yet create, configure, operate, or safely explain that
tailnet as a MUSU feature.

## Official Findings That Matter

### Headscale

Local snapshot:

- `docs/vendor/official-network-docs/headscale/`
- commit `21058d11424d5121dbc1eeb3ba0a39d2f462bfcc`

Findings:

- Headscale is an open source, self-hosted implementation of the Tailscale
  control server.
- The control server exchanges WireGuard public keys and coordinates client
  network membership; it is not the data plane doing the MUSU work.
- Headscale's stated scope is narrow and single-tailnet-oriented, suitable for
  personal/lab/small-organization use, not a ready-made multi-tenant enterprise
  SaaS control plane.
- Upstream client enrollment supports
  `tailscale up --login-server <YOUR_HEADSCALE_URL>` and preauth keys via
  `tailscale up --login-server <YOUR_HEADSCALE_URL> --authkey <YOUR_AUTH_KEY>`.
  In MUSU these are implementation primitives or manual fallback, not the
  default user/LLM instruction.
- Embedded DERP exists but is disabled by default upstream. If MUSU removes
  Tailscale's DERP map, MUSU must enable and verify its own DERP path and still
  operate redundant DERP/relay capacity before high-availability claims.
- Headscale does not currently replace every Tailscale SaaS feature. Its feature
  page marks Funnel, Serve, and network flow logs as unavailable.
- Headscale is BSD-3-Clause. MUSU can build a product around it if notices,
  binary/source redistribution obligations, and no-endorsement language are
  preserved.
- Official release docs say container deployments should use a concrete
  `<VERSION>` image tag. MUSU bootstrap must not default to `latest`; the
  current generated bundle pins `ghcr.io/juanfont/headscale:v0.28.0`, matching
  the latest stable release observed during this review.
- Official DERP docs describe enabling embedded DERP with
  `derp.server.enabled: true`, exposing udp/3478 for STUN, and optionally
  setting public IPv4/IPv6 addresses. MUSU's generated bundle now enables
  embedded DERP by default and removes the upstream Tailscale DERP map unless
  the operator explicitly passes `--keep-tailscale-derp`.

### Tailscale Client / Docs

Local snapshot:

- `docs/vendor/official-network-docs/tailscale-docs/`
- 575 pages, 0 failed downloads

Findings:

- Official docs describe configuring Tailscale clients to use a custom control
  server such as Headscale.
- The official CLI supports `--login-server=<url>`.
- `tailscale ip -4` is the right way to discover the client tailnet IPv4.
- `tailscale ping` proves overlay reachability, not MUSU bridge availability.
  MUSU still needs bridge `/health` and delegated-task callback proof.
- Tailscale and WireGuard are registered trademarks. MUSU should not market
  itself as a Tailscale product or imply endorsement.

### Alternatives

Local snapshots:

- `docs/MUSU_PRIVATE_MESH_OPEN_SOURCE_DOCS_MANIFEST_2026_06_13.md`

Candidate summary:

- Headscale remains the best immediate path because it fits current
  Tailscale-compatible route work and is permissively licensed.
- Nebula is the cleanest permissive fallback if MUSU wants to own more of the
  overlay/control UX.
- Netmaker is viable as a WireGuard manager, but it does not align as directly
  with existing MUSU route evidence.
- OpenZiti is powerful but a heavier zero-trust app networking framework, not
  the fastest path for "my machines as one device."
- NetBird is attractive technically but its management/signal/relay areas are
  AGPL, which is a product constraint.
- ZeroTier is mature, but the repo includes MPL and non-free/source-available
  areas, which makes it less clean as MUSU's no-signup default.

## Current MUSU Fit

### Correct Pieces

1. `musu-rs/src/peer/tailscale.rs` prefers the official `tailscale ip -4`
   command and falls back to interface detection.
2. `musu-rs/src/bridge/handlers/nodes.rs` accepts `tailscale_ip` and resolves it
   to `http://<tailnet-ip>:8070`.
3. `musu-rs/src/install/cli_commands.rs` adds detected tailnet IPs to room
   presence candidates.
4. Route priority already models `lan -> tailscale -> direct_quic -> relay`.
5. `scripts/windows/smoke-real-peer-route-proof.ps1` now proves more than ping:
   local tailnet IP, tailnet ping, target bridge `/health`, delegated route, and
   callback reconciliation.
6. `musu-bee/src/app/api/mcp/handlers/network.ts` now exposes a runbook that
   forbids Tailscale.com signup as the default and points agents to Headscale.

### Incorrect Or Incomplete Pieces

1. MUSU has no `musu mesh` or installer path that creates/joins a Headscale
   control plane. The user/operator still has to understand the overlay.
2. The code uses the label `tailscale` for both Tailscale.com and
   Headscale-backed routes. That is technically understandable at the protocol
   level but wrong at the product level. UI and evidence need a higher-level
   `musu_private_mesh` / `headscale_backed` label.
3. The smoke script used to say "Install and log in to Tailscale" when the CLI
   was missing. That message was incompatible with the product contract and has
   been changed to MUSU Private Mesh / `--login-server` language.
4. Node registration stores `tailscale_ip` but does not store the control server
   URL, tailnet owner/team, enrollment method, DERP policy, preauth key metadata,
   or verification timestamp.
5. MUSU does not verify which control server the local client is using. A user
   could accidentally be on Tailscale.com and MUSU would still call the route
   `tailscale`.
6. No local state file defines the MUSU Private Mesh config, so the cockpit
   cannot show "LAN only", "MUSU Private Mesh connected", "external managed
   tailnet", or "wrong control server" accurately.
7. Headscale operational constraints are not encoded in setup: Linux/BSD host,
   public HTTPS, optional OIDC, preauth key creation, DERP tcp/443 and udp/3478,
   and the unsupported shape of running Headscale on a node inside its own
   tailnet.
8. There is no physical two-machine Headscale proof yet. Current software-path
   proof with two bridges is useful but not enough to claim network product
   readiness.

## Proposed Product Architecture

```text
┌─────────────────────────────────────────────────────────────────────┐
│ MUSU Cockpit                                                        │
│ - "Add this machine"                                                │
│ - fleet cards                                                       │
│ - route proof: LAN / Private Mesh / Relay                           │
│ - retry exact order + exact target                                  │
└───────────────────────────────┬─────────────────────────────────────┘
                                │ MCP / local API
┌───────────────────────────────▼─────────────────────────────────────┐
│ MUSU Runtime On Each Machine                                        │
│ - bridge / worker                                                   │
│ - node registry                                                     │
│ - task delegate + callback reconciliation                           │
│ - route evidence writer                                             │
│ - private mesh agent wrapper                                        │
└───────────────────────────────┬─────────────────────────────────────┘
                                │ local commands
┌───────────────────────────────▼─────────────────────────────────────┐
│ Mesh Client Layer                                                   │
│ - installed tailscale client, configured with --login-server         │
│ - no default Tailscale.com signup                                   │
│ - reports tailnet IP, status, ping, control-server identity          │
└───────────────────────────────┬─────────────────────────────────────┘
                                │ control plane only
┌───────────────────────────────▼─────────────────────────────────────┐
│ MUSU Private Mesh Control Plane                                     │
│ - Headscale instance or per-owner Headscale instance                 │
│ - preauth keys / OIDC                                               │
│ - DERP map policy                                                   │
│ - owner/team isolation                                              │
│ - audit records                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

Data-plane rule:

- MUSU work and files move machine-to-machine through MUSU bridge/worker over
  the selected route.
- Headscale is only the coordination server for WireGuard/tailnet membership.
- Tailscale.com is not used unless the user explicitly opts into an external
  managed tailnet.

## Required Data Model

Add a local config file, for example:

```toml
# ~/.musu/private_mesh.toml
[mesh]
mode = "musu_headscale" # local_lan | musu_headscale | external_tailscale_opt_in
control_server_url = "https://mesh.musu.example"
owner_id = "owner_..."
tailnet_id = "tailnet_..."
node_name = "studio-pc"
client_kind = "tailscale_cli"
derp_policy = "musu_managed"
last_verified_at = "2026-06-13T00:00:00Z"

[verification]
local_tailnet_ip = "100.x.y.z"
control_server_verified = true
tailscale_ping_verified = true
bridge_health_verified = true
callback_verified = true
```

Extend node records with:

- `mesh_mode`
- `mesh_provider = headscale | external_tailscale | none`
- `control_server_url_hash`
- `tailnet_ip`
- `bridge_port`
- `last_mesh_verified_at`
- `last_bridge_health_at`
- `last_callback_verified_at`
- `route_label = lan | musu_private_mesh | external_tailnet | relay`

## Required CLI Surface

Add a first-class command group instead of hiding this under `route` or
`nodes`:

```text
musu mesh status --json
musu mesh bootstrap --server-url <https://mesh-host> [--output <dir>] [--derp-ipv4 <public-ip>] [--derp-ipv6 <public-ip>]
musu mesh join --device-add-pass <musu.device_add.v1.json> [--node-name <name>]
musu mesh join --login-server <url> [--authkey <key>] [--node-name <name>]  # advanced/manual fallback only
musu mesh verify --target-ip <100.x.y.z> [--json]
musu mesh physical-peer-evidence [--output <file>] [--json]
musu mesh release-proof --target-node <node> --target-ip <100.x.y.z> --expected-control-server-url <https://mesh-host> --physical-peer-evidence <copied-target-pc-physical-peer-evidence.json> [--json]
musu mesh doctor --json
musu mesh leave
```

Expected behavior:

- `join` must never run plain `tailscale login` by default.
- `bootstrap` must generate a reproducible Headscale deployment bundle so MUSU
  can offer a no-Tailscale.com setup path instead of telling users to create an
  external managed tailnet.
- `bootstrap` must also provide a MUSU/operator DERP posture by default. It
  should not silently remove Tailscale DERP while leaving hard-NAT machines
  without any relay path.
- Default enrollment is `musu mesh join --device-add-pass
  <musu.device_add.v1.json>`. The pass owns the login server/authkey tuple,
  local TTL checks, one-time semantics, redaction, and post-success consumption.
- Raw `join --login-server/--authkey` is advanced/manual fallback only and must
  not be copied by Cockpit, generated helpers, or LLM agents as the normal setup
  flow.
- Internally, MUSU may call the compatible mesh client with
  `tailscale up --login-server <url> --authkey <key>` after extracting verified
  data from a pass or explicit manual fallback input.
- `status` must report control-server mode, not just a `100.x` IP.
- `verify` must require all four proofs: local IP, ping, bridge health, callback.
- `doctor` must explain whether the machine is LAN-only, MUSU Private Mesh,
  external Tailscale.com, or misconfigured.

Implemented addendum:

- `musu mesh bootstrap --server-url <https://mesh-host>` writes a Docker Compose
  Headscale bundle, `config/config.yaml`, `config/policy.json`, README, and
  Headscale notice file under `~/.musu/private-mesh-control-plane` or the
  provided `--output` directory.
- The generated bundle enables Headscale embedded DERP by default, exposes
  udp/3478, writes `derp.server.enabled: true`, and leaves the upstream
  Tailscale DERP map disabled unless `--keep-tailscale-derp` is explicitly
  chosen.
- The generated bundle includes `scripts/create-join-key.ps1` and
  `scripts/create-join-key.sh`, which create a Headscale preauth key, write a
  `musu.device_add.v1` pass under `device-add-passes/`, and print only the pass
  file path plus the target-side `musu mesh join --device-add-pass
  <musu.device_add.v1.json>` command. The default helper output no longer prints
  the raw authkey join command or the secret-bearing pass JSON, so users and LLM
  agents do not need to handle raw Headscale CLI syntax for the normal
  enrollment path.
- The generated README makes `musu mesh join --device-add-pass
  <musu.device_add.v1.json>` the enrollment path and does not require
  Tailscale.com signup.
- `musu mesh join`, `status`, `doctor`, and `verify` remain separate so runtime
  enrollment and control-plane provisioning can be verified independently.
- `musu mesh physical-peer-evidence` runs on the target PC and writes
  `musu.private_mesh_physical_peer_evidence.v1`, including the target node name,
  target tailnet IP, control-server URL, OS/arch, hostname, and a SHA256 sidecar.
- `musu mesh release-proof` now separates software-route trust from final
  release trust. Distinct node name and distinct 100.x tailnet IP prove the route
  is not self-targeting, but they do not prove separate physical hardware because
  two bridge instances can run on one host. Final `release_evidence_trusted=true`
  therefore requires `--physical-peer-evidence
  <copied-target-pc-physical-peer-evidence.json>`. The file must be structured
  JSON generated by `musu mesh physical-peer-evidence`, and its `.sha256`
  sidecar must be copied alongside it in the same folder; release proof rejects
  missing sidecars, arbitrary files, wrong schema, mismatched `node_name`,
  mismatched `tailnet_ip`, mismatched `control_server_url`, or
  `control_server_verified=false`.
- If `--physical-peer-evidence` is omitted, a successful proof can still produce
  `software_route_trusted=true`, but Cockpit must display it as physical-peer
  incomplete instead of a final release-grade claim.
- Cockpit fleet rows now expose both physical proof commands at the point of use:
  `Evidence cmd` copies the target-side
  `musu mesh physical-peer-evidence --json` command, while `Release cmd` copies
  the source-side `musu mesh release-proof ... --physical-peer-evidence
  <copied-target-pc-physical-peer-evidence.json> --json` command. This removes
  the hidden documentation jump between choosing a target machine and producing
  the target-generated evidence file. The target-side command prints both
  `evidence_path` and `evidence_sha256_path`; copy both files to the source PC.
- If the operator clicks `Run proof` before pasting a physical-peer evidence
  path, Cockpit now warns immediately that final release trust needs the target
  generated JSON. The run may continue as a software-route diagnostic, but the UI
  must not let that look like final `release_evidence_trusted=true`.
- The physical evidence input strip must be visible as soon as a targetable
  Private Mesh peer exists, not only after a proof run. Otherwise the user cannot
  paste the target-generated JSON before the first release proof attempt.
- Cockpit must preflight-validate a pasted physical evidence path before calling
  native release proof. The preflight uses `validate_physical_peer_evidence_path`
  and refuses to run if `node_name`, `tailnet_ip`, or `control_server_url` do not
  match the selected fleet row. This prevents a stale or copied-from-another-PC
  evidence file from being accidentally attached to the wrong machine.
- The Add PC flow should present enrollment as a MUSU `musu.device_add.v1` pass,
  not as raw Headscale preauth-key mechanics. The generated join-key helpers now
  write that device-add pass to `device-add-passes/` and print the pass path
  plus the pass-consumer command, and
  `musu mesh join --device-add-pass <musu.device_add.v1.json>` now consumes the
  pass directly on the target PC. This is not yet a full QR/one-click enrollment
  service, but it gives Cockpit and LLM operators a product-owned enrollment
  envelope instead of telling users to reason about Headscale internals.
- `musu mesh join --device-add-pass` now requires the auth key as an explicit
  `authkey` field inside the `musu.device_add.v1` pass. It does not parse
  `--authkey` out of a free-form `join_command`, so legacy command-shaped
  snippets cannot silently become trusted device-add passes.
- If the pass contains an `authkey`, `musu mesh join --device-add-pass` now
  requires a file path instead of inline JSON. This keeps the one-time key out of
  shell history and process arguments. Inline JSON remains suitable only for
  non-secret validation/debug cases.
- The generated helpers now write the pass to `device-add-passes/` instead of
  printing the secret-bearing JSON to stdout. Operator output includes the pass
  file path, copy/delete guidance, and the target-side join command only.
- Official Headscale docs state generated preauth keys are one-use and valid
  for one hour by default. MUSU relies on that short default for the helper path
  and adds product-side containment: pass files are permission-restricted where
  possible, operators are told to delete stale copies after use, and helper
  failure output redacts `hskey-auth-*` tokens before printing diagnostics.
- MUSU pass files now require `created_at_utc` and
  `expires_after_seconds=3600`. `musu mesh join --device-add-pass` rejects
  missing-expiry or expired passes locally before invoking the mesh client, so
  stale onboarding files fail with a clear MUSU error instead of a late
  Headscale registration failure.
- `musu mesh join --device-add-pass` also rejects pass files whose
  `created_at_utc` is more than 300 seconds in the future. This closes the
  simple TTL-extension footgun where a copied or edited pass could push its
  creation time forward and appear valid for longer than the intended one-hour
  onboarding window.
- MUSU pass files now also require `one_time_key=true` and `reusable=false`.
  The generated helper no longer exposes a reusable-key switch, and
  `musu mesh join --device-add-pass` rejects reusable pass files before they can
  enroll a machine.
- After a successful non-dry-run `musu mesh join --device-add-pass`, MUSU now
  writes a redacted `.used-<timestamp>` marker with schema
  `musu.device_add.consumed.v1`, records the original pass SHA-256, and deletes
  the original secret-bearing pass file. The marker explicitly records
  `secret_material_retained=false`, and the join report sets
  `device_add_pass_consumed=true`. If cleanup fails, the join report exposes
  `device_add_pass_cleanup_error` and adds a manual-delete next step instead of
  silently leaving the operator to assume the secret file was consumed.

## Required Cockpit UX

Fleet card states:

- `LAN`: same network, no overlay needed.
- `Private Mesh`: Headscale-backed route, verified.
- `External Tailnet`: user opted into Tailscale.com or other external managed
  control plane.
- `Mesh Misconfigured`: tailnet IP exists but control server is unknown/wrong.
- `Reachable But Unproven`: ping or `/health` works but no callback proof.
- `Offline`: no recent verified route.

Setup copy:

- Good: "Add this machine to MUSU Private Mesh."
- Good: "Use my own Headscale URL."
- Bad: "Sign up for Tailscale."
- Bad by default: "Log in to Tailscale."

## Implementation Order

### Phase 1: Stop Wrong Claims

- Change script and UI copy from "log in to Tailscale" to "install the
  compatible client and join MUSU Private Mesh with `--login-server`."
- Rename user-facing route label from `tailscale` to `Private Mesh` when MUSU
  knows the control server is Headscale/MUSU-managed.
- Keep internal `RouteKind::Tailscale` only as a protocol/address classifier
  until a migration is safe.

### Phase 2: Add Mesh State And Doctor

- Add `private_mesh.toml`.
- Add `musu mesh status --json`.
- Detect:
  - `tailscale ip -4`
  - `tailscale status --json`
  - configured login server, where available from CLI/status/local prefs
  - bridge `/health`
- Report whether the route is `local_lan`, `musu_headscale`,
  `external_tailscale_opt_in`, or `unknown_tailnet`.

### Phase 3: Add Join/Verify

- Add first-class `musu mesh join --device-add-pass
  <musu.device_add.v1.json>` enrollment. Keep
  `musu mesh join --login-server <url> --authkey <key>` only as a
  documented advanced/manual fallback for operators who explicitly need raw
  Headscale-compatible client control.
- Add `musu mesh verify --target-ip <100.x.y.z>`.
- Emit a machine-readable `musu.private_mesh_verification.v1` evidence file.
- Update `smoke-real-peer-route-proof.ps1` to use Private Mesh language and to
  fail if `ExpectedRouteKind tailscale` is claimed without a Headscale/MUSU
  control-server assertion.

### Phase 4: Control Plane Packaging

- Decide between:
  - operator-provided Headscale URL;
  - MUSU-managed shared infrastructure with strict per-owner isolation;
  - per-owner Headscale instance.
- For S-grade consumer UX, prefer per-owner or strongly isolated control-plane
  tenancy over one giant shared Headscale until scale/security is proven.
- Add preauth key issuance flow. The user should see a device-add code, not raw
  Headscale commands.

### Phase 5: Physical Proof

The product claim is not complete until this passes on two real machines:

1. Machine A joins MUSU Private Mesh.
2. Machine B joins the same MUSU Private Mesh.
3. A sees B in cockpit without cloud-login dependency.
4. A sends work to B.
5. B executes.
6. B callback authenticates back to A.
7. A cockpit card reaches `done` with output.
8. Evidence includes `control_server=headscale`, tailnet IPs, ping, bridge
   health, route proof, and callback proof.

## Design Decision

Proceed with Headscale-compatible MUSU Private Mesh as the default.

Do not switch to NetBird/Netmaker/Nebula/OpenZiti now. They are useful fallback
research, but switching now would discard current route evidence work and delay
the "fleet as one device" product loop.

The immediate redesign is not a new network stack. It is a missing ownership
layer:

- MUSU owns setup.
- MUSU owns labels.
- MUSU owns verification.
- Headscale owns tailnet coordination.
- The compatible client owns WireGuard connectivity.
- Tailscale.com is only an explicit user-chosen external dependency.

## Next Code Changes

1. Extend node records with control-server identity and verification timestamps.
2. Add cockpit labels for `Private Mesh` versus `External Tailnet`.
3. Wire cockpit/installer to call `musu mesh join/status/verify` instead of
   exposing raw mesh commands.

## Implementation Addendum 2026-06-13

Implemented Phase 2's first slice:

- `musu mesh status --json`
- `musu mesh doctor --json`
- local `~/.musu/private_mesh.toml` read contract
- status classification into `local_lan`, `musu_headscale`, or
  `external_tailscale_opt_in`
- user-facing route labels `LAN`, `Private Mesh`, and `External Tailnet`
- compatible-client missing copy that does not send the user to Tailscale.com
- MCP runbook now tells agents to call `musu mesh status --json` before
  claiming a mesh route

Still missing:

- GUI/device-add-code wrapper around Headscale preauth-key provisioning
- control-server identity verification from the local client
- cockpit rendering of the new mesh state
- two-physical-machine proof

## Implementation Addendum 2026-06-13b

Implemented Phase 3's first slice:

- `musu mesh join --device-add-pass <musu.device_add.v1.json>` as the product
  enrollment path
- `musu mesh join --login-server <url> [--authkey <key>]` as an
  advanced/manual fallback only
- `musu mesh join --dry-run` for CI and setup preview
- `musu mesh verify --target-ip <100.x.y.z>`
- local config write/update for `~/.musu/private_mesh.toml`
- `join --device-add-pass` extracts verified pass data, may call
  `tailscale up --login-server <url>` internally, and never runs plain
  `tailscale login` as the default product path
- `verify` checks tailnet ping and target bridge `/health`, then updates local
  verification state

Still missing:

- GUI/device-add-code wrapper around Headscale preauth-key provisioning
- control-server identity verification from the local client
- delegated task callback integration into `musu mesh verify`
- cockpit rendering of the new mesh state
- two-physical-machine proof

## Implementation Addendum 2026-06-13c

Added the physical proof gate:

- `scripts/windows/smoke-private-mesh-route-proof.ps1`
- requires `musu mesh status --json` to report `mode=musu_headscale`
- requires `control_server_url` and `control_server_verified=true`
- optionally enforces `-ExpectedControlServerUrl`
- runs `musu mesh verify --target-ip <100.x.y.z>` before delegated proof
- then calls `smoke-real-peer-route-proof.ps1` to prove delegated execution and
  callback reconciliation

This means a real-peer proof can no longer be used as a MUSU Private Mesh proof
unless the local machine is explicitly classified as Headscale-backed MUSU
Private Mesh first.

Still missing:

- GUI/device-add-code wrapper around Headscale preauth-key provisioning
- stronger control-server identity extraction from the local client
- cockpit rendering of the new mesh state
- actual two-physical-machine execution of this proof

## Implementation Addendum 2026-06-13d

Added bundle-local join-key helpers:

- `scripts/create-join-key.ps1`
- `scripts/create-join-key.sh`
- helpers run `headscale health`, ensure the MUSU owner namespace exists, call
  `headscale preauthkeys create`, extract the one-time `hskey-auth-*` value, and
  write a `musu.device_add.v1` pass under `device-add-passes/`. The helper
  prints only the pass file path plus the target-side
  `musu mesh join --device-add-pass <musu.device_add.v1.json>` command. The raw
  `--login-server ... --authkey ...` tuple stays inside the file and is consumed
  by MUSU, not presented as the normal user command.

This is not yet the final consumer-grade device-add flow, but it removes the
biggest operator/LLM footgun: normal enrollment no longer requires remembering
Headscale's raw preauth-key command shape.

Still missing:

- first-class cockpit "Add PC" flow that wraps the helper/device code
- stronger control-server identity extraction from the local client
- actual two-physical-machine execution of this proof

## Implementation Addendum 2026-06-13e

Added the first cockpit Add PC surface:

- empty fleet state now shows a three-step Private Mesh guide instead of raw
  one-line mesh commands;
- bootstrap, generated join-key helper, and verify commands have copy buttons;
- command palette includes "Show Add PC guide" for keyboard access.

This is still not the final one-click/device-code flow, but the normal user path
is now visible in the product surface without opening docs.

## Implementation Addendum 2026-06-13f

Added cockpit-visible Private Mesh readiness:

- Tauri desktop now exposes `private_mesh_status`, backed by
  `musu mesh status --json`.
- `list_fleet` now preserves `tailscale_ip`, `mesh_mode`, `route_label`,
  `control_server_url`, and `control_server_verified` so the cockpit's Private
  Mesh badges are based on real runtime evidence, not discarded bridge data.
- Add PC panel now shows whether this PC is setup-needed, joined, external
  tailnet, unavailable, or release-grade.

This closes a product-truth gap: the UI no longer only tells the user how to set
up Private Mesh; it also shows whether this PC actually satisfies the local mesh
contract.

## Implementation Addendum 2026-06-13g

Tightened the proof boundary between "some Tailscale-compatible route worked"
and "MUSU Private Mesh is release-grade":

- `callback_verified` is now only written when local config is explicitly
  `mode=musu_headscale`, `control_server_url` is present, and
  `control_server_verified=true`.
- `release_grade` now requires verified MUSU Headscale control-server identity
  in addition to tailnet ping, peer bridge `/health`, and callback
  reconciliation.
- MCP runbook now tells LLM agents not to treat external Tailnet success as
  Private Mesh proof.

This is intentionally stricter than the earlier route proof gate. A delegated
task over an external Tailscale.com tailnet can still be useful, but it cannot
be used as proof that MUSU works without requiring Tailscale signup.

## Implementation Addendum 2026-06-13h

Moved the cockpit Add PC flow one step closer to a productized setup wizard:

- Tauri desktop now exposes `private_mesh_doctor`, backed by
  `musu mesh doctor --json`.
- The Add PC card has a "Run local check" action so the user can inspect local
  mesh readiness without opening a terminal first.
- The card still includes a copyable `musu mesh doctor --json` escape hatch for
  support/debugging.

This is intentionally not an automatic bootstrap/join action yet. `bootstrap`
needs a real public control-server URL, and `join` needs an auth key printed by
the Headscale helper. Automating those without collecting/validating inputs
would create a worse S-tier failure mode: a button that appears magical but
cannot safely know where the user's control plane should live.

## Implementation Addendum 2026-06-13i

Reduced the next verification footgun in the fleet cockpit:

- Private Mesh peer rows now expose a copyable exact verify command:
  `musu mesh verify --target-ip <that-peer-100.x.y.z> --json`.
- The action is only shown for online non-local rows already classified as
  verified MUSU Private Mesh, not for external Tailnet or unclassified tailnet
  rows.
- The row still remains clickable for "send work to this machine"; the verify
  button stops event propagation so copying the command does not accidentally
  retarget the composer.

This removes the earlier placeholder burden where the user had to discover a
peer's 100.64.0.0/10 address manually before running the release proof.

## Implementation Addendum 2026-06-13j

Promoted peer verification from "copy a command" to an in-cockpit action:

- Tauri desktop now exposes `private_mesh_verify_target`, which validates that
  the target is inside 100.64.0.0/10 before running
  `musu mesh verify --target-ip <peer> --json`.
- Verified Private Mesh peer rows now show `Run verify` plus a secondary copy
  fallback.
- The row records whether verification reached the peer bridge, reached
  release-grade, or failed.

This still does not claim full release proof from a ping/health check alone.
The button intentionally returns the same stricter result as `musu mesh verify`:
peer ping and bridge health can pass while callback reconciliation remains the
remaining release gate.

## Implementation Addendum 2026-06-13k

Connected the remaining callback-proof step to the cockpit:

- Verified Private Mesh peer rows now include `Proof order`, which sends a
  targeted delegated order through the same `submit_order` and task-polling path
  as a real user order.
- The proof order is intentionally plain-language and harmless:
  "MUSU Private Mesh proof: reply with the executing machine name and current
  time."
- When the peer completes, the existing task card displays the route proof and
  callback reconciliation; the bridge-side callback handler is still responsible
  for marking `callback_verified` only under the strict MUSU Headscale gate.

This closes a UX gap, not a proof claim. A user no longer has to invent a test
order after peer reachability passes, but release-grade status still requires
the callback proof to actually come back from a real peer.

## Implementation Addendum 2026-06-13l

Closed the cockpit feedback loop after callback proof:

- When a task poll returns a terminal status with
  `route_proof.callback_delivered=true`, the cockpit immediately refreshes
  `private_mesh_status`.
- This lets the readiness card update as soon as the bridge has accepted and
  persisted callback proof, instead of waiting for the next periodic cockpit
  refresh.

The refresh remains evidence-driven: it does not infer readiness from the task
card alone. The card still re-reads `musu mesh status --json`, whose
`release_grade` gate is backed by verified Headscale control-server identity,
tailnet ping, bridge health, and callback verification.

## Implementation Addendum 2026-06-13m

Made peer verification results persistent in the fleet row:

- `Run verify` now leaves a row-level proof status chip such as `reachable`,
  `release proof`, or `failed` instead of showing the result only temporarily in
  the button label.
- Running peer verification also refreshes `private_mesh_status` immediately so
  the readiness card stays synchronized with the latest `musu mesh verify`
  evidence.

This reduces an S-tier UX miss: a user can now see which peer has been checked
and what gate remains without remembering a transient button state.

## Implementation Addendum 2026-06-13n

Mapped callback proof back onto the peer row:

- When a terminal task includes `route_proof.callback_delivered=true`, the
  cockpit now marks the matching fleet row as `callback proof`.
- The match uses `callback_node` first, then `target_node_id`, then the locked
  task target as fallback.
- The row state remains distinct from `release proof`; final release-grade
  readiness is still read from `musu mesh status --json`.

This closes another feedback gap: the proof no longer lives only in the task
card. The machine row that proved the callback now carries that evidence too.

## Implementation Addendum 2026-06-13o

Tightened release-grade proof integrity:

- `musu mesh verify` now stores the verified target tailnet IP in
  `private_mesh.toml`.
- Callback proof now records the callback route's tailnet IP and is only accepted
  when it matches the last verified target tailnet IP.
- `release_grade` now requires the verified target IP and callback route IP to
  match, in addition to verified Headscale control-server identity, ping,
  bridge health, and callback delivery.

This prevents a false release-grade proof where peer A passed ping/health but
peer B produced the callback. The software proof now binds transport reachability
and result reconciliation to the same tailnet peer.

## Implementation Addendum 2026-06-13p

Made target-bound proof visible:

- `musu mesh status --json` and `musu mesh verify --json` now expose the
  verified target tailnet IP, callback tailnet IP, and whether they match.
- The cockpit Private Mesh readiness card renders that binding as
  `target <ip> · callback <ip> · bound proof`.
- The UI still treats this as evidence display, not as an independent readiness
  claim; release-grade remains owned by the stricter status JSON gate.

This makes the anti-false-positive rule inspectable by the user and by support:
the product no longer only says "ready"; it shows which peer the proof is bound
to.

## Implementation Addendum 2026-06-13q

Made the release smoke enforce target-bound proof:

- `scripts/windows/smoke-private-mesh-route-proof.ps1` now fails unless
  `verified_target_tailnet_ip`, `callback_tailnet_ip`, and the expected target IP
  are identical.
- The same smoke now requires `target_callback_match=true` in both the top-level
  status object and the nested verification object.
- MCP runbook guidance now includes target-bound proof as a required release
  evidence item.

This prevents the official release smoke from passing on weaker evidence than
the runtime requires.

## Implementation Addendum 2026-06-13r

Made Private Mesh proof copyable from the cockpit:

- The readiness card now exposes `Copy proof` once `private_mesh_status` is
  available.
- The copied JSON includes control-server verification, local IP, verified
  target IP, callback IP, `target_callback_match`, ping/health/callback gates,
  release-grade state, warnings, and next steps.

This gives the user and support a portable proof artifact without opening a
terminal or hunting through local evidence files.

## Implementation Addendum 2026-06-13s

Promoted proof copy from empty-state-only to always-visible cockpit evidence:

- The fleet screen now shows a compact Private Mesh proof strip whenever local
  mesh status has been loaded, even when machines are already present.
- `Copy proof` copies a structured
  `musu.private_mesh_desktop_proof_clipboard.v1` JSON artifact that includes the
  target/callback binding fields.
- The compact shell layout now wraps fleet-row proof actions into readable
  information blocks instead of forcing all actions onto one narrow row.
- Browser QA covers desktop and 420px compact layouts, including clipboard proof
  JSON and no-horizontal-overflow assertions.

This closes the last UX gap in the proof surface: the user can see, copy, and
share the exact mesh evidence from the main fleet view without needing a
terminal or an empty fleet state.

## Implementation Addendum 2026-06-13t

Moved Add PC from an empty-state-only guide into a persistent product action:

- The fleet header now has an `Add PC` action even when multiple machines are
  already present.
- The Add PC panel is a collapsible fleet-level setup flow, not a child of
  `fleet-empty`.
- One-PC fleets open the setup panel automatically unless the user has manually
  toggled it.
- The command palette, empty-state CTA, and header action now share the same
  `openAddPcGuide()` path.
- Browser QA verifies that the guide is accessible on a populated fleet before
  the proof/order loop runs.

This fixes a real onboarding flaw: adding the second, third, or fourth PC is now
a first-class action in the cockpit instead of a guide that disappears after the
first successful peer.

## Implementation Addendum 2026-06-13u

Fixed multi-button proof-copy feedback:

- `Copy proof` now updates the button that was actually clicked, using the
  event `currentTarget`.
- This matters because the cockpit now has more than one proof-copy surface: the
  fleet proof strip and the Add PC setup panel.
- Browser QA clicks the Add PC panel's proof button and verifies that the strip
  button does not incorrectly change state.

This prevents a small but trust-damaging proof UX bug: the user no longer sees
feedback appear in a different part of the cockpit than the button they pressed.

## Implementation Addendum 2026-06-13v

Made the generated control-plane bundle match the public HTTPS promise:

- `musu mesh bootstrap --server-url https://...` now generates a default Caddy
  reverse proxy alongside Headscale and embedded DERP.
- The default Docker Compose file keeps Headscale on localhost/internal 8080,
  exposes Caddy on tcp/80 and tcp/443, and exposes embedded DERP/STUN on
  udp/3478.
- The generated `Caddyfile` reverse-proxies the requested mesh host to
  `headscale:8080`.
- The bootstrap JSON now exposes `caddy_reverse_proxy_enabled` and
  `caddy_https_port`.
- Cockpit and MCP runbook copy now say "Headscale + Caddy HTTPS + embedded
  DERP", and the runbook tells agents to point DNS at the control host before
  enrolling machines.

This fixes a setup-contract mismatch: the previous command asked for an HTTPS
public `server_url` but generated only a local Headscale listener, leaving the
operator to infer the missing reverse proxy. The default bundle is now closer to
"run the generated commands, then join PCs."

## Implementation Addendum 2026-06-13w

Aligned generated join-key helpers with the official Headscale registration
flow:

- The generated PowerShell helper now resolves the Headscale user id for the
  configured MUSU tailnet/user, then runs
  `headscale preauthkeys create --user <USER_ID>`.
- The generated shell helper now parses `headscale users list` and also creates
  the preauth key with `--user "$USER_ID"`.
- Failure messages now tell operators to run `headscale users list` and
  `headscale preauthkeys create --user <USER_ID>` manually.

This closes another first-run setup risk. The helper no longer creates a
preauth key without binding it to the intended Headscale user/tailnet.

## Implementation Addendum 2026-06-13x

Added a pre-start Compose validation gate to the generated control-plane bundle:

- `musu mesh bootstrap` now includes `docker compose config --quiet` in the
  generated command list.
- The generated README tells operators to run the same validation before
  `docker compose up -d`.
- The bootstrap unit test asserts that this validation command is present.
- The generated Caddy/Headscale/DERP compose file was verified with Docker
  Compose v2.40.3 using `docker compose config --quiet`.

This catches malformed compose/Caddy changes before the user starts containers,
which is the right failure point for a setup flow that is supposed to feel
copy-paste reliable.

## Implementation Addendum 2026-06-13y

Added a post-start public endpoint check to the generated control-plane bundle:

- Bootstrap now generates `scripts/check-public-endpoint.ps1` and
  `scripts/check-public-endpoint.sh`.
- The scripts verify DNS resolution, tcp/443 reachability, and the public
  `https://<mesh-host>/health` endpoint through Caddy.
- The generated command list and README now run this check after internal
  `headscale health` and before join-key creation.
- Actual generated output was verified for script presence and Docker Compose
  config validity.

This moves another common setup failure to a clear, named check: if DNS,
firewall, Caddy, or ACME is wrong, the operator finds out before handing a join
command to the second PC.

## Implementation Addendum 2026-06-13z

Aligned the cockpit and MCP setup guidance with the generated bundle:

- The Cockpit Add PC panel now includes a "Start + checks" step between
  bootstrap and join-key creation.
- That step exposes `docker compose config --quiet`, `docker compose up -d`,
  `docker compose exec headscale headscale health`, and
  `scripts/check-public-endpoint.ps1`.
- The MCP network runbook now tells agents to require compose validation,
  internal Headscale health, and the generated public endpoint check before
  sharing a device-add pass.

This closes a product copy mismatch: the UI no longer skips the checks that the
CLI bundle now generates specifically to prevent DNS, firewall, Caddy, or ACME
failures from reaching the second PC.

## Implementation Addendum 2026-06-13aa

Tightened `musu mesh join` so it no longer overclaims control-server proof:

- Official Headscale setup guidance requires the instance to be reachable at its
  public `/health` endpoint before client registration.
- `musu mesh join` now checks `<login-server>/health` before enrolling a real
  client and only writes `control_server_verified=true` when that public health
  check passed during a non-dry-run join.
- `--dry-run` and `--skip-control-health` may still create/debug local state,
  but they write `control_server_verified=false` and cannot satisfy
  release-grade proof.
- The join report now includes `control_server_health_url`,
  `control_server_health_ok`, `control_server_health_status`, and
  `control_server_verified` so support can see exactly why a machine is or is
  not trusted.
- Cockpit and MCP runbook copy now warn that skipped health is not verified
  setup.

This fixes a trust-boundary flaw in the previous implementation. A successful
join command is useful evidence, but MUSU's product claim is stronger: the app
must prove the self-hosted Headscale endpoint the user is relying on is actually
reachable through the public URL it hands to other PCs.

## Implementation Addendum 2026-06-13ab

Added an independent release evidence verifier for Private Mesh:

- `scripts/windows/smoke-private-mesh-route-proof.ps1` now writes a SHA256
  integrity sidecar next to `private-mesh-route-proof.evidence.json`.
- `scripts/windows/verify-private-mesh-route-proof-evidence.ps1` reads that
  evidence file and fails closed unless the sidecar matches, the schema is
  correct, timestamps are fresh, `mode=musu_headscale`,
  `control_server_verified=true`, tailnet ping passed, target bridge health
  passed, delegated real-peer evidence used the `tailscale` route, callback
  reconciliation reached the source cockpit, and the verified target IP equals
  the callback IP.
- The generated bootstrap README and MCP runbook now tell operators and LLM
  agents to run the verifier after the smoke and require `ok=true` before using
  the proof in a release claim.

This separates evidence generation from evidence judgment. A smoke can still be
the thing that drives the system, but the release decision is now a repeatable
artifact check that can be rerun on the saved JSON without trusting terminal
memory or a hand-written verdict.

## Implementation Addendum 2026-06-13ac

Added a one-command Private Mesh release proof runner:

- `scripts/windows/run-private-mesh-release-proof.ps1` runs the route/callback
  smoke, then immediately runs
  `verify-private-mesh-route-proof-evidence.ps1` against the saved evidence.
- The runner now also requires `-PhysicalPeerEvidencePath
  <copied-target-pc-physical-peer-evidence.json>` by default and invokes native
  `musu mesh release-proof --physical-peer-evidence ...`; route/callback proof
  alone is not treated as final release evidence.
- The runner writes `private-mesh-release-proof.verification.json` plus a
  `.sha256` sidecar, so the final release artifact contains the smoke result,
  verifier result, native release proof result, physical peer verification,
  `release_evidence_trusted`, target IP, control-server URL, and any failure
  reason.
- The runner also supports `-ExistingEvidencePath` for rechecking a previously
  captured `private-mesh-route-proof.evidence.json` without rerunning the
  physical smoke.
- MCP runbook now prefers the runner for physical verification and keeps the
  standalone verifier as the saved route-evidence recheck tool. The standalone
  verifier is not sufficient for a final S-grade release claim because it cannot
  prove a separate physical peer by itself.

This removes another human-error gap: the operator should not have to remember
that "smoke passed" is insufficient until the saved evidence has passed the
route verifier and native release proof has accepted target-generated physical
peer evidence. The default physical proof command now performs all three steps.

## Implementation Addendum 2026-06-13ac2

Tightened physical-host proof so a two-bridge same-host simulation cannot look
like a release-grade two-PC proof:

- `musu mesh physical-peer-evidence --json` now requires and records the target
  OS hostname in the target-generated evidence JSON.
- Native `musu mesh release-proof` now records `source_hostname`,
  `target_hostname`, and `physical_host_distinct` in
  `musu.private_mesh_peer_identity.v1`.
- `release_identity_bound` now requires distinct node name, distinct tailnet IP,
  target URL bound to target IP, and `physical_host_distinct=true`.
- The Windows release bundle verifier now fails closed unless physical peer
  evidence includes a target hostname and native peer identity includes
  distinct source/target hostnames.
- Tauri physical evidence validation now rejects old target evidence files that
  omit hostname, so the cockpit cannot silently accept weak physical evidence.
- The cockpit release-proof preflight now surfaces the target hostname and
  blocks same-host evidence before invoking native release proof, instead of
  making the user wait for a late verifier failure.
- The Tauri physical-evidence summary now also parses the target-generated
  `os` and `arch` fields and Cockpit surfaces them as target platform detail
  in the status line and release evidence clipboard snapshot. This improves
  reviewability without pretending that OS/arch are hardware attestation.

This does not claim hardware-serial attestation. It deliberately avoids invasive
device serial collection. The release bar is pragmatic and fail-closed: a final
MUSU "three computers as one device" claim requires evidence generated on a
target OS host whose hostname differs from the source OS host, plus the already
required Headscale, route, callback, hash, bundle manifest, and archive checks.

## Implementation Addendum 2026-06-13ad

Aligned the Cockpit Add PC guide with the release-proof runner:

- The Add PC flow now separates ordinary machine enrollment/peer verification
  from the final `Release proof` step.
- The release step exposes a copyable
  `scripts/windows/run-private-mesh-release-proof.ps1` command so the user does
  not stop at `musu mesh verify`.
- Browser and contract tests now assert that the runner command appears in the
  setup panel.

This closes the UI side of the evidence-contract gap. The product now tells the
user, in the primary cockpit setup flow, that a real cross-machine claim requires
the full delegated task, callback, hash, and verifier judgment path.

## Implementation Addendum 2026-06-13ae

Added target-specific release proof commands to fleet rows:

- Private Mesh peer rows now expose a `Release cmd` action next to `Run verify`,
  `Proof order`, and the simple verify copy action.
- The copied command is fully bound to the selected node name, target tailnet IP,
  and verified Headscale control-server URL.
- The command uses PowerShell single-argument quoting so ordinary node names or
  URLs do not break the runner invocation.
- Contract and browser tests now click the row action and assert the exact
  runner command copied for `studio-pc`.

This removes another operator transcription step. The cockpit no longer merely
teaches the release-proof command with placeholders; it can produce the exact
command for the machine the user is already looking at.

## Deep Review Addendum 2026-06-13af

Re-read the current official Tailscale and Headscale docs against the current
MUSU code. The design direction remains correct, but the product boundary must
be stricter than the code's current developer-oriented surfaces.

Official facts that must stay encoded in MUSU:

- Tailscale is only partly open source. The daemon/client and DERP server are
  open source, but Tailscale's coordination server is closed source. A no-signup
  MUSU default cannot depend on the hosted Tailscale coordination server.
- Headscale is the self-hosted, open-source implementation of the Tailscale
  control server, scoped for a single tailnet / personal / small-organization
  shape. MUSU can build a product around it, but must not pretend it is already
  a multi-tenant enterprise control plane.
- Headscale production assumptions require a public server, HTTPS on tcp/443,
  Linux/BSD, and operational command-line knowledge. If MUSU wants S-grade UX,
  those requirements must be hidden behind a managed/provisioned control-plane
  layer or a guided operator bundle with checks.
- Headscale registration supports both interactive
  `tailscale up --login-server <YOUR_HEADSCALE_URL>` and non-interactive
  `tailscale up --login-server <YOUR_HEADSCALE_URL> --authkey <YOUR_AUTH_KEY>`.
  MUSU's default join flow must keep using the product-owned
  `musu mesh join --device-add-pass <musu.device_add.v1.json>` wrapper; raw
  `--login-server/--authkey` belongs inside the pass implementation or an
  explicit manual fallback, not the default user instruction.
- Headscale embedded DERP is disabled by default upstream. Enabling it and
  removing Tailscale's DERP map is the right independence posture, but it creates
  an availability and NAT-traversal responsibility MUSU must own.
- Official DERP guidance treats self-hosted/custom DERP as advanced operations
  requiring direct internet access and open HTTP/HTTPS/STUN ports. MUSU must
  surface DERP as a health/proof dimension, not as an invisible implementation
  detail.
- `tailscale ping` proves overlay reachability only. MUSU release proof still
  requires bridge `/health`, delegated task execution, authenticated callback,
  and saved evidence verification.

Current-code fit:

- Correct: `musu mesh bootstrap` now generates a pinned Headscale/Caddy bundle
  with embedded DERP enabled by default, upstream Tailscale DERP disabled unless
  explicitly requested, public endpoint checks, join-key helpers, and preserved
  notices.
- Correct: `musu mesh join --device-add-pass` is the default join UX; it checks
  `<login-server>/health`, consumes the pass, may call
  `tailscale up --login-server ...` internally, and does not run plain
  Tailscale.com login by default.
- Correct: `musu mesh status/doctor/verify`, cockpit labels, MCP runbook, and
  release-proof verifier now separate `MUSU Private Mesh` from an external
  managed Tailnet.
- Correct: fleet rows now expose both a target-bound native `Release cmd` copy
  action and a `Run proof` action backed by Tauri IPC. The proof action runs the
  native release verifier with the row's fixed node/IP/control-server tuple, not
  the current composer dropdown state.
- Closed for desktop architecture, pending packaged-app proof: a packaged
  desktop app should not depend on
  `.\scripts\windows\run-private-mesh-release-proof.ps1` existing relative to
  the current working directory. MUSU now has a native
  `musu mesh release-proof` command that can generate the release evidence
  without repo-local script assumptions, and Cockpit can execute it through
  Tauri.
- Not sufficient: control-server identity is currently verified by public
  `/health` and local config, not by extracting the client's active control URL
  from the local Tailscale-compatible client state. This is good enough to block
  obvious false claims but not enough for the strongest "wrong control server"
  detection.
- Not sufficient: a single embedded DERP region is a single point of failure.
  MUSU can default to it for independence, but S-grade service needs either
  multiple MUSU/operator DERP regions or a clearly degraded status when only one
  relay region exists.
- Not sufficient: two bridges on one host prove routing/auth/callback software
  paths, but not real NAT/firewall/DERP behavior. The release verdict must still
  require two physical machines on a real network.

Revised architecture decision:

```text
MUSU Cockpit
  -> Add PC / Proof / Recovery UX
  -> local Tauri commands only

MUSU CLI/runtime
  -> mesh bootstrap/join/status/doctor/verify/release-proof
  -> bridge health, delegated task, callback reconciliation
  -> signed/hash-checked release evidence

Compatible mesh client
  -> tailscale client configured with --login-server
  -> no default Tailscale.com login

MUSU Private Mesh control plane
  -> Headscale per owner or strongly isolated small-tailnet instance
  -> MUSU/operator DERP map and health checks
  -> preauth key issuance and revocation
```

Implementation priority from this review:

1. Verify the Cockpit `Run proof` Tauri IPC path in a packaged desktop build on
   two physical machines. The code path exists; the release claim is still gated
   on real hardware/NAT/DERP proof, not screenshots or same-host bridges.
2. Extend mesh status with `derp_regions`, `derp_single_point_of_failure`,
   `active_control_server_observed`, and `active_control_server_matches_config`
   when the client exposes enough local status to prove it.
3. Replace command-copy join UX with a device-add flow: create short-lived
   one-use preauth key, show QR/copy code, run join, immediately verify public
   health, overlay ping, bridge health, and callback.
4. Keep External Tailnet as an explicit opt-in route class. It can run work, but
   must never satisfy "MUSU works without Tailscale signup" release proof.

## Implementation Addendum 2026-06-13ag

Added the native release proof command the deep review called for:

- `musu mesh release-proof --target-node <node> --target-ip <peer-100.x.y.z>
  --expected-control-server-url <headscale-url> --physical-peer-evidence
  <copied-target-pc-physical-peer-evidence.json> --json`
- The command runs the same release-grade chain without requiring a repo-local
  PowerShell script: local Private Mesh status check, tailnet ping, target bridge
  `/health`, source bridge `/health`, target registration, delegated task,
  callback reconciliation, post-callback release-grade status check, evidence
  JSON, and SHA256 sidecar.
- The Cockpit Add PC guide and fleet-row `Release cmd` now copy this native
  command instead of `scripts/windows/run-private-mesh-release-proof.ps1`.

This closes the packaged-app design gap for command generation. It does not yet
claim the final S-grade UX because the physical two-machine proof remains
required before the full product verdict is complete.

## Implementation Addendum 2026-06-13ah

Closed the next product gap from the deep review:

- Added `private_mesh_release_proof_target` to the desktop Tauri IPC surface.
  It validates the target node, target `100.64.0.0/10` IP, and expected
  Headscale/control-server URL, then runs native `musu mesh release-proof`.
- Non-zero release-proof exits still return a structured result when the native
  command produced JSON, so Cockpit can show the failure reason instead of a
  generic IPC wall.
- Fleet rows now show `Run proof` for MUSU Private Mesh peers. The click handler
  uses the row's fixed node/IP/control-server tuple, so proof execution cannot
  drift to whatever machine is currently selected in the order composer.
- Contract, browser, and Rust parser tests now cover the IPC command name,
  payload binding, proof status transition, and evidence path preservation.

Remaining release gate: run the packaged desktop app on two physical machines
joined to MUSU Headscale, force a real tailnet path, and archive the generated
release evidence plus SHA256 sidecar.

## Implementation Addendum 2026-06-13ai

Closed the evidence visibility gap in the Cockpit proof flow:

- After `Run proof`, Cockpit now keeps a visible `Release evidence` strip instead
  of hiding the artifact path in a tooltip.
- The strip shows the target node, target tailnet IP, verifier outcome, and the
  saved verification/evidence path.
- `Copy evidence` copies a structured JSON envelope containing the latest
  release-proof result, release readiness checks, canonical evidence path,
  target snapshot, and physical-peer evidence validation snapshot. The copied
  JSON now shows whether the current target evidence path was validated for the
  selected peer, including node name, tailnet IP, control URL, host
  distinctness, and hash-integrity context, so an audit or support thread does
  not have to infer why a release claim was accepted or blocked. After app
  restart, when the renderer validation cache is gone, the copied envelope falls
  back to the reloaded release result's accepted physical-peer evidence path,
  sidecar path, and digest instead of reporting the validation snapshot as
  missing.
- Release readiness now carries check-level diagnostics in `blocking_details`.
  The UI and copied envelope include the first concrete cause, such as
  `archive_error`, `archive_verifier_error`, `bundle_manifest_error`, or
  `physical_peer_error`, so "Needs Archive verifier passed" is paired with a
  real reason rather than a bare checklist label.
- `Open folder` opens only validated release-proof evidence folders under
  `MUSU_HOME/private-mesh-release-proof`; arbitrary paths are rejected at the
  Tauri boundary.
- When release readiness includes a verified archive, `Open folder` now targets
  the archive manifest path so the OS opens the verified archive directory the
  operator must attach to release notes. Before archive verification passes, it
  falls back to the regular release-proof evidence folder.
- On startup, Cockpit reloads the latest
  `private-mesh-release-proof.verification.json` under
  `MUSU_HOME/private-mesh-release-proof`, so a completed proof remains visible
  after app restart instead of being only in renderer memory.
- Reloaded release evidence uses the same readiness gate as freshly generated
  proof: `release_evidence_trusted=true` is not enough to render a ready state
  unless bundle manifest, archive presence, and archive verifier checks also
  pass. This prevents an app restart from visually upgrading a trusted but
  unarchived proof into a release-ready result.
- Fleet rows now distinguish a real proof failure from a trusted-but-unarchived
  result. Missing archive evidence sets the row to `archive-required` and the
  button to `Archive needed` instead of painting the row as a generic failure.
- Cockpit verifies the latest verification JSON against its
  `private-mesh-release-proof.verification.json.sha256` sidecar and displays
  `hash verified` only when the sidecar schema, algorithm, and digest match.
  Missing or mismatched sidecars keep the evidence visible but explicitly mark
  the hash as unverified.
- The evidence strip handles running, success, and failure states. This matters
  because a failed release proof is still useful diagnostic evidence; it should
  not collapse into a generic red button.

Remaining release gate is unchanged: packaged desktop app, two physical machines,
MUSU Headscale join, real tailnet path, generated evidence plus SHA256 sidecar.

## Implementation Addendum 2026-06-13aj

Added DERP readiness to the Private Mesh status surface:

- `musu mesh status/doctor --json` now includes `derp_policy` and
  `derp_readiness`.
- `derp_readiness=declared_private` means the local config declares MUSU/operator
  managed DERP capacity.
- `derp_readiness=external_dependency` means the mesh is still relying on an
  upstream/external DERP fallback and cannot satisfy the fully self-contained
  network claim.
- `derp_readiness=missing` means Headscale mode is configured but no DERP policy
  is recorded; hard-NAT physical proof should be treated as not release-ready.
- Cockpit now surfaces this in the Private Mesh proof strip and includes it in
  copied proof JSON.

`musu mesh doctor --json` now adds a timeout-bound
`tailscale debug derp headscale` probe when the local machine is in MUSU
Headscale mode, declares private/operator DERP capacity, and has a compatible
client CLI. Regular desktop status polling does not run the probe; Cockpit shows
`DERP probe ok` or `DERP probe failed` only after the user runs the local check.
The probe stdout/stderr summary is shown as `DERP detail` in the proof strip and
status card so a failed relay check is actionable without opening raw JSON.

## Implementation Addendum 2026-06-13ak

Tightened the release-grade gate so a proof cannot claim self-contained MUSU
Private Mesh while silently depending on missing or external DERP capacity:

- `verification.release_grade=true` now requires `derp_private_declared=true`.
- `derp_private_declared=true` is derived from `derp_readiness=declared_private`,
  meaning the local Headscale config declares MUSU/operator-managed DERP.
- `musu mesh verify` now reports `derp_readiness` and
  `derp_private_declared` in its JSON result.
- `musu mesh release-proof` rejects a Private Mesh proof before task delegation
  if the local status does not declare private/operator DERP policy.
- Cockpit copied proof JSON includes `derp_private_declared`, so a support or
  release reviewer can tell whether `release_grade=false` is caused by weak
  relay independence rather than task execution failure.

This does not prove that a particular hard-NAT path used DERP; that remains a
physical two-machine/NAT proof requirement. It does prevent the product from
calling an external- or no-DERP configuration release-grade.

## Implementation Addendum 2026-06-13al

Tightened the two-machine proof boundary:

- `musu mesh verify` now rejects a target IP that matches the local machine's
  tailnet IP.
- Because `musu mesh release-proof` calls `verify` before delegation, a proof
  cannot be generated by accidentally targeting the source machine itself.
- This still does not cryptographically prove two different physical chassis;
  it does remove the most dangerous same-node false positive from the product
  release path. The final release gate remains a packaged desktop proof on two
  physical machines joined to MUSU Headscale.

## Implementation Addendum 2026-06-13am

Bound release-proof target URL to the claimed tailnet peer:

- `musu mesh release-proof --target-url` now accepts only `http://` or
  `https://` bridge origin URLs whose host exactly matches `--target-ip`.
- `localhost`, LAN addresses, another `100.x` peer, paths, queries, and
  fragments are rejected before target registration.
- Non-default `--bridge-port` still works because MUSU generates
  `http://<target-ip>:<bridge-port>` and validates that generated URL through
  the same gate.

This prevents a false proof where the user claims target `100.64.x.y` but
actually registers a local or different bridge URL for delegation.

## Implementation Addendum 2026-06-13an

Bound release-proof target node to a distinct peer:

- `musu mesh release-proof` now reads the local Private Mesh config and rejects
  `--target-node` when it matches the source machine's configured node name.
- The comparison is case-insensitive to avoid Windows/user-input casing
  loopholes.
- Together with the target IP and target URL gates, the proof must now describe
  a distinct node name, a distinct tailnet IP, and a bridge URL hosted by that
  same target IP before task delegation starts.

This still cannot replace the final physical-hardware proof, but it makes the
release verifier materially harder to satisfy with a same-machine loop.

## Implementation Addendum 2026-06-13ao

Made the release evidence self-auditing for peer identity:

- `private-mesh-route-proof.evidence.json` now includes a `peer_identity`
  section with schema `musu.private_mesh_peer_identity.v1`.
- The section records source node name, source tailnet IP, target node, target
  IP, target URL, target URL host, and the three proof booleans:
  `node_distinct`, `tailnet_ip_distinct`, and
  `target_url_host_matches_target_ip`.
- `release_identity_bound=true` is written only when all three booleans are
  true.

The release verifier already rejects weak identity tuples before delegation; the
new evidence field makes successful proofs reviewable without reconstructing
that logic from logs or source code.

## Implementation Addendum 2026-06-13ap

Surfaced peer identity proof in the desktop product:

- Tauri now reads `peer_identity` from
  `private-mesh-route-proof.evidence.json` when a proof completes and when
  Cockpit reloads the latest saved evidence.
- The desktop result includes `peer_identity`, `release_identity_bound`, and
  `peer_identity_error`.
- Cockpit's release evidence strip now shows `identity bound` beside
  `hash verified` when the route evidence proves the source/target node, IP,
  and URL tuple are bound.
- Copied release evidence includes the same fields, so support/release review
  does not need raw file access to see the identity-bound verdict.

## Implementation Addendum 2026-06-13aq

Bound Cockpit's `identity bound` label to route-evidence integrity:

- Tauri now verifies
  `private-mesh-route-proof.evidence.json.sha256`, not only the verification
  JSON sidecar.
- The desktop result includes `route_evidence_sha256_path`,
  `route_evidence_sha256`, `route_evidence_integrity_verified`, and
  `route_evidence_integrity_error`.
- `peer_identity` is loaded only after the route evidence hash verifies.
- Cockpit shows `identity bound` only when both the peer tuple is bound and the
  route evidence file carrying that tuple has a valid SHA256 sidecar.

This prevents the UI from combining a trusted verification report with a
tampered route evidence file.

## Implementation Addendum 2026-06-13ar

Separated native verifier success from desktop evidence trust:

- The Tauri release-proof result now exposes `release_evidence_trusted`.
- `release_evidence_trusted=true` requires the native verifier `ok=true`,
  verification JSON hash verification, route evidence hash verification, and
  identity tuple binding.
- Cockpit uses `release_evidence_trusted`, not raw `ok`, for the green
  "Proof passed" / release-grade row state.
- If the native verifier returns `ok=true` but desktop trust checks fail,
  Cockpit shows "Release evidence needs review" and keeps the row out of the
  release-grade state.

This keeps diagnostic information from the native verifier while preventing the
desktop product from over-claiming when any saved evidence trust check fails.

## Implementation Addendum 2026-06-13as

Locked the trust-failure path with a browser-level regression test:

- `cockpit-browser.spec.ts` can now override the mocked native release-proof
  result per scenario.
- Added a test where the native verifier returns `ok=true`, but
  `route_evidence_integrity_verified=false`,
  `release_identity_bound=false`, and `release_evidence_trusted=false`.
- The expected Cockpit state is `data-verify-state=failed`, button text
  `Proof review`, row status `needs review`, and evidence title
  `Release evidence needs review`.
- The copied evidence payload must preserve `ok=true` while still exposing
  `release_evidence_trusted=false`, so support can see the native proof result
  and the desktop trust rejection separately.

Verification run:

- `node --check src-tauri-shell/main.js`
- `npm run test:tauri-shell`
- `npx playwright test --config playwright.tauri-shell.config.ts`
- `npm run build:tauri-shell`
- `git diff --check -- musu-bee/src-tauri-shell/cockpit-browser.spec.ts
  musu-bee/src-tauri-shell/cockpit-contract.test.ts
  musu-bee/src-tauri-shell/main.js`

## Implementation Addendum 2026-06-13at

Verified the build and bootstrap path beyond mocked browser tests:

- `npm run tauri:build` completed and produced:
  `musu-bee/src-tauri/target/release/musu-desktop.exe`,
  `musu-bee/src-tauri/target/release/bundle/msi/MUSU_1.15.0_x64_en-US.msi`,
  and
  `musu-bee/src-tauri/target/release/bundle/nsis/MUSU_1.15.0_x64-setup.exe`.
- `musu mesh status --json` was run through the compiled `musu` CLI on the
  current workstation. Because this workstation is not joined to any tailnet,
  it correctly reported `mode=local_lan`, `config_present=false`,
  `local_tailnet_ip=null`, and `release_grade=false`.
- `musu mesh bootstrap --server-url https://mesh.example.com --output
  ./tmp-private-mesh-bootstrap-proof --derp-ipv4 203.0.113.10 --force --json`
  generated a Headscale deployment bundle without using Tailscale.com signup as
  the default path.
- `docker compose -f ./tmp-private-mesh-bootstrap-proof/docker-compose.yaml
  config --quiet` passed.
- The generated Headscale config uses embedded DERP, `derp.urls: []`, and
  `derp.paths: []`; the compose bundle exposes UDP 3478 for DERP/STUN and TCP
  443 through Caddy, with pinned `ghcr.io/juanfont/headscale:v0.28.0`.

Remaining release blocker:

- The current workstation has Tailscale CLI installed, but `tailscale status
  --json` reports `BackendState=NoState`, `CurrentTailnet=null`, and
  `TailscaleIPs=null`.
- Therefore the final product claim still needs a real two-physical-machine
  proof after joining both machines to the generated MUSU Headscale control
  plane and verifying DERP with `tailscale debug derp headscale`.
- Until that physical proof exists, the honest claim is: packaged app,
  bootstrap bundle, release-proof trust gates, and mocked UI proof are verified;
  cross-hardware network traversal is not yet verified in this environment.

## Implementation Addendum 2026-06-13au

Made the LLM/operator instructions wrapper-first:

- `musu-system-prompt-v1.md` no longer tells the assistant to default to direct
  `tailscale login --login-server` enrollment.
- The prompt now tells operators to use `musu mesh bootstrap`,
  `musu mesh join`, `musu mesh status`, `musu mesh verify`, and
  `musu mesh release-proof` as the default product path.
- Low-level `tailscale up/login --login-server` is described only as an
  implementation detail or manual fallback.
- The Headscale runbook now requires `control_server_verified=true`, DERP
  readiness, evidence hashes, and `release_evidence_trusted=true` before
  reporting success.
- `route.test.ts` now reads the system prompt and fails if the default
  instruction regresses to direct `tailscale login --login-server`.

Verification run:

- `npm exec -- tsx --test src/app/api/mcp/route.test.ts`
- `git diff --check -- musu-bee/src/prompts/musu-system-prompt-v1.md
  musu-bee/src/app/api/mcp/route.test.ts`

## Implementation Addendum 2026-06-13ao

Closed the release-proof runner gap found during the S-grade review:

- `scripts/windows/run-private-mesh-release-proof.ps1` now requires
  `-PhysicalPeerEvidencePath <copied-target-pc-physical-peer-evidence.json>`
  for a final proof. The file must be generated on the target physical PC with
  `musu mesh physical-peer-evidence --json`, and the matching `.sha256` sidecar
  must sit next to it on the source PC.
- The runner still creates or rechecks `private-mesh-route-proof.evidence.json`,
  but route evidence alone no longer produces `ok=true`.
- After route verification, the runner invokes native
  `musu mesh release-proof --physical-peer-evidence ...`, opens the native
  evidence JSON, and records `software_route_trusted`,
  `release_identity_bound`, `physical_peer_verified`, and
  `release_evidence_trusted` in the runner artifact.
- MCP runbook and `musu-system-prompt-v1.md` now instruct LLM operators to
  collect target-generated physical evidence before claiming success.

The final product claim remains blocked until this stricter flow is run on two
separate physical machines joined through MUSU Headscale, with
`release_evidence_trusted=true` archived alongside the SHA256 sidecars.

## Implementation Addendum 2026-06-13ap

Added a final release-proof bundle verifier:

- `scripts/windows/verify-private-mesh-release-proof-bundle.ps1` accepts either
  `-EvidenceRoot <proof-folder>` or `-VerificationPath
  <private-mesh-release-proof.verification.json>`.
- `scripts/windows/run-private-mesh-release-proof.ps1` now invokes that bundle
  verifier automatically after strict physical release proof succeeds.
- It writes `private-mesh-release-proof.bundle-manifest.json` with schema
  `musu.private_mesh_release_proof_bundle.v1` plus a `.sha256` sidecar.
- It fails unless the runner verification, route evidence, target physical-peer
  evidence, native release evidence, native verification, and all listed
  SHA256 sidecars are present and valid.
- It also requires `software_route_trusted=true`,
  `release_identity_bound=true`, `physical_peer_verified=true`, and
  `release_evidence_trusted=true`.
- MCP runbook and `musu-system-prompt-v1.md` now require this bundle manifest
  to report `ok=true` and `fail_count=0` before an operator or LLM may use the
  proof in a release claim.
- The final runner now also invokes
  `scripts/windows/archive-private-mesh-release-proof-bundle.ps1` after the
  bundle verifier passes. The archive step copies the runner verification,
  bundle manifest, route evidence, target physical-peer evidence, native release
  evidence, native verification, and every `.sha256` sidecar into a role-based
  archive directory, writes `private-mesh-release-proof.archive.json` with schema
  `musu.private_mesh_release_proof_archive.v1`, records both `archived_at` and
  `archived_at_unix_ms`, writes its own `.sha256` sidecar, and emits
  `archive_zip_path`.
- New PowerShell archives use the canonical `verification` artifact role for the
  runner verification JSON so the standalone archive verifier and the native
  Cockpit loader share the same manifest contract. The native loader also
  accepts legacy `runner_verification` and `native_verification` aliases for
  older archives, but new producers should not emit those as the primary release
  verification role.
- The archive verifier's minimum portable evidence set is `verification`,
  `bundle_manifest`, `route_evidence`, and `physical_peer_evidence`. Extra
  native-only artifacts such as `native_release_evidence` and
  `native_verification` are copied when present, but their absence no longer
  prevents archiving a manifest that already passed the release bundle verifier.
- Final release claims require both gates: bundle manifest `ok=true` with
  `fail_count=0`, and archive manifest `ok=true` with
  `release_evidence_trusted=true`, `bundle_manifest_ok=true`,
  `bundle_manifest_fail_count=0`, matching archive manifest sidecar, and a
  present `archive_zip_path`.
- 2026-06-14 hardening: the release tool hash set now includes
  `verify-private-mesh-release-proof-archive.ps1` as `archive_verifier`.
  The bundle verifier checks that hash against the current toolchain, and the
  archiver invokes `verify-private-mesh-release-proof-archive.ps1` after writing
  `private-mesh-release-proof.archive.json` but before creating the zip. If the
  standalone archive verifier fails, the zip is not created and the archive is
  not acceptable as release evidence.
- The standalone archive verifier emits
  `musu.private_mesh_release_proof_archive_verification.v1` and fails unless
  every archived artifact file, `.sha256` sidecar path, recorded SHA256, bundle
  target, control-server URL, release contract, and current verifier-toolchain
  hash matches. The native Cockpit loader now re-reads the archived bundle
  manifest too, so a hash-valid archive whose bundle target/control binding does
  not match the archive manifest is rejected on both verifier paths.
  Archived artifact paths must also resolve inside the archive directory itself;
  a manifest that points back to the original proof folder is rejected because it
  is not a portable, self-contained release archive.
  When multiple archive manifests exist, the desktop verifier selects the latest
  valid archive by the manifest's own `archived_at_unix_ms`, not by local file
  modified time, so an older archive copied later cannot replace the newest
  release archive. Native desktop archives and PowerShell archives both write
  `archived_at_unix_ms`; legacy PowerShell archives that only have `archived_at`
  are parsed from that embedded timestamp, still never from copy-time mtime.
- The desktop "latest release evidence" loader now follows the same rule for
  release-proof reports: new `musu.private_mesh_release_proof.v1` reports carry
  `completed_at`, and Cockpit selects the newest proof by that value before
  falling back to sidecar `recorded_at` and finally file mtime for legacy
  reports. This prevents an older proof copied later from replacing the proof
  that actually completed later.
- Cockpit readiness now separates archive existence from archive verification:
  `release_archive_ready` only means the archive manifest, sidecar, and minimum
  artifact set are present; `archive_verifier_passed` must also pass before the
  UI says "Release evidence archived." Native desktop archives are re-read by
  the same internal archive verifier path after writing and report
  `archive_verifier_kind=native_desktop_internal`; PowerShell release archives
  report the standalone verifier schema and fail count from the release tool.
  A bare `archive_verifier_ok=true` flag is not sufficient, and
  `archive_verifier_schema` plus `archive_verifier_fail_count=0` is not
  sufficient if `archive_verifier_ok` is false or missing. Cockpit and the
  native parser require all three: `archive_verifier_ok=true`,
  `archive_verifier_schema=musu.private_mesh_release_proof_archive_verification.v1`
  and `archive_verifier_fail_count=0` before treating the archive verifier as
  passed. The PowerShell archive producer also writes the explicit
  `archive_verifier_ok` field so producer and consumer contracts match.
- Fleet-row `Release cmd` now copies a runnable command only when the current
  physical-peer evidence path has been validated against that exact target. The
  fleet row no longer exposes or copies the
  `<copied-target-pc-physical-peer-evidence.json>` placeholder as if it were a
  runnable command. If no path is pasted, the click is fail-closed: Cockpit opens
  the target evidence input and explains that the target-generated JSON plus
  `.sha256` sidecar are required. If a path is present but not yet validated, the
  click handler first validates it against the selected peer, then copies the
  exact runnable command only after node name, tailnet IP, control URL, host
  distinctness, and hash integrity pass. Failed validation does not copy a
  misleading release command.
- Cockpit `Use latest` now treats the evidence JSON's own `generated_at` as the
  source of truth for "latest" physical-peer evidence, not the local file
  modified time. This matters during real two-PC proof collection: an older file
  can be copied into the evidence folder later, but that should not displace a
  newer target-generated proof. Only already-valid, fresh, hash-verified,
  separate-host evidence participates in latest selection.

This changes the final proof from "a command returned success" to "a complete,
hash-checked, replayable evidence bundle and archive exists." The remaining
release gate is still the real two-physical-machine run; the new verifier and
archive step make that final run auditable instead of anecdotal.

## Implementation Addendum 2026-06-13av

Closed a packaged-app execution gap: the desktop shell now bundles the MUSU
runtime CLI it invokes.

Problem found during packaging review:

- The Tauri desktop executable is `musu-desktop.exe`.
- Desktop commands call a sibling runtime named `musu.exe` for startup, fleet,
  task, and Private Mesh operations.
- The previous bundle produced `musu-desktop.exe`, MSI, and NSIS installers, but
  did not prove that `musu.exe` was included beside the desktop executable.
- That meant an installed app could pass browser mocks yet fail real Private
  Mesh buttons with `failed to run musu.exe ...`.

Fix:

- Added `scripts/build-tauri-sidecars.mjs`.
- The script builds `musu-rs --bin musu --release`, detects the host target
  triple with `rustc --print host-tuple`, and copies the binary to
  `src-tauri/binaries/musu-<target-triple>.exe`.
- `tauri.conf.json` now has `bundle.externalBin: ["binaries/musu"]`.
- `beforeBuildCommand` now runs both the shell build and sidecar preparation.
- Added a Tauri unit test that fails if `bundle.externalBin` stops including
  `binaries/musu`.

Verification run:

- `npm run build:tauri-sidecars`
- `cargo test --manifest-path musu-bee/src-tauri/Cargo.toml runtime_command
  --lib -j 1`
- `cargo test --manifest-path musu-bee/src-tauri/Cargo.toml
  tauri_bundle_config_includes_runtime_sidecar --lib -j 1`
- `cargo check --manifest-path musu-bee/src-tauri/Cargo.toml -j 1`
- `npm run tauri:build`
- `npm run test:tauri-shell`
- `npm exec -- tsx --test src/app/api/mcp/route.test.ts`
- `git diff --check -- musu-bee/package.json
  musu-bee/scripts/build-tauri-sidecars.mjs
  musu-bee/src-tauri/tauri.conf.json
  musu-bee/src-tauri/src/lib.rs`

Packaging evidence:

- `musu-bee/src-tauri/target/release/musu.exe` exists.
- `musu-bee/src-tauri/target/release/wix/x64/main.wxs` includes a component for
  `INSTALLDIR/musu.exe`.
- The final bundles were regenerated:
  `MUSU_1.15.0_x64_en-US.msi` and `MUSU_1.15.0_x64-setup.exe`.

## Implementation Addendum 2026-06-13aw

Ran the generated Headscale bundle against a real Docker container instead of
only checking file generation.

Initial lab result:

- Generated a local bundle under `%TEMP%/musu-private-mesh-lab-20260613`.
- `docker compose config --quiet` passed.
- `docker compose up -d` created and started `musu-headscale`.
- The container then restarted repeatedly. Logs exposed three real contract
  bugs in the generated bundle:
  - `dns.nameservers.global must be set when dns.override_local_dns is true`
  - `parsing policy: unknown field "grants"`
  - `initial DERPMap is empty, Headscale requires at least one entry`

Fixes:

- The generated DNS block now explicitly sets `override_local_dns: false`,
  `nameservers.global: []`, `nameservers.split: {}`, `search_domains: []`, and
  `extra_records: []`.
- The default policy file is now `{}` because Headscale documents this as
  allow-all and it boots cleanly across policy parser differences.
- `musu mesh bootstrap` now rejects `--disable-embedded-derp` unless
  `--keep-tailscale-derp` is explicitly set. A zero-DERP map is not a warning;
  it is an invalid Headscale control plane.
- The PowerShell and shell join-key helpers now resolve the bundle root from
  their own script path, so they work from any current working directory.

Verified local lab path:

- `musu mesh bootstrap --server-url http://127.0.0.1:8080 --disable-embedded-derp
  --keep-tailscale-derp --allow-insecure-http --force --json`
- `docker compose config --quiet`
- `docker compose up -d`
- `docker inspect` reached `running healthy`
- `docker compose exec -T headscale headscale health`
- `Invoke-WebRequest http://127.0.0.1:8080/health` returned HTTP 200
- `scripts/check-public-endpoint.ps1` passed
- `scripts/create-join-key.ps1` produced a `musu.device_add.v1` pass and the
  target-side `musu mesh join --device-add-pass <musu.device_add.v1.json>`
  command from outside the bundle directory
- The lab container was stopped and removed with `docker compose down
  --remove-orphans`

Verification run:

- `cargo test --manifest-path musu-rs/Cargo.toml
  bootstrap_bundle_writes_headscale_control_plane_files --lib -j 1`
- `cargo test --manifest-path musu-rs/Cargo.toml
  bootstrap_embedded_derp_requires_https_and_valid_public_ips --lib -j 1`
- `cargo test --manifest-path musu-rs/Cargo.toml private_mesh --lib -j 1`

Important boundary:

- This local lab used `--keep-tailscale-derp` only because HTTP local lab cannot
  run embedded DERP. The production MUSU default remains embedded/operator DERP
  on HTTPS and must not rely on upstream Tailscale DERP for release-grade claims.

## Source Pointers

- Headscale README and docs snapshot:
  `docs/vendor/official-network-docs/headscale/`
- Tailscale docs snapshot:
  `docs/vendor/official-network-docs/tailscale-docs/`
- Alternative docs manifest:
  `docs/MUSU_PRIVATE_MESH_OPEN_SOURCE_DOCS_MANIFEST_2026_06_13.md`
- Current MCP runbook:
  `musu-bee/src/app/api/mcp/handlers/network.ts`
- Current tailnet IP detection:
  `musu-rs/src/peer/tailscale.rs`
- Current node tailnet registration:
  `musu-rs/src/bridge/handlers/nodes.rs`
- Current real-peer smoke:
  `scripts/windows/smoke-real-peer-route-proof.ps1`

## Implementation Addendum 2026-06-14a

Closed a release-trust overclaim in the Private Mesh route evidence gate.

Problem found during verifier review:

- Desktop `software_route_trusted` required native proof success, route hash
  integrity, and release-bound peer identity, but did not require the route
  evidence itself to prove release-grade private-mesh transport.
- Some historical route evidence used `encryption=none_http_bearer` or a
  legacy smoke schema. That was acceptable for non-release local/LAN task
  summaries, but not enough for the final Private Mesh release claim.
- The PowerShell bundle verifier independently checked hashes, physical peer
  evidence, native peer identity, and tool hashes, but did not fail closed on
  weak route transport metadata.

New contract:

- Private Mesh release route evidence must use
  `schema=musu.route_evidence.v1`.
- `route_kind` must be `tailscale`.
- `result` must be `success`.
- `candidate_addr` must resolve to the selected target IP.
- The selected target IP must be in the tailnet IPv4 range `100.64.0.0/10`.
- `encryption` must be `tailscale_wireguard_overlay`.
- `transport_verified_by` must be `musu_private_mesh_tailnet_route`.
- `private_mesh_mode` must be `musu_headscale`.
- `private_mesh_control_server_url` must match the release proof's expected
  control server URL.
- `private_mesh_control_server_verified` must be `true`.
- `payload_transited_musu_infra` must be `false`.

Implementation:

- `musu-rs/src/bridge/route_evidence.rs` now records tailnet route evidence
  with `tailscale_wireguard_overlay` and
  `musu_private_mesh_tailnet_route` only when the candidate address is a
  tailnet route and the peer metadata proves `mesh_mode=musu_headscale`,
  `control_server_verified=true`, a non-empty control server URL, and a
  `tailscale_ip` matching the routed candidate host. A raw `100.64.0.0/10`
  address without MUSU control-plane metadata remains `none_http_bearer`.
  This does not claim TLS peer identity; it records that the route is the MUSU
  private tailnet overlay path bound to a verified MUSU control plane.
- `musu-bee/src-tauri/src/lib.rs` now exposes `route_transport_verified` and
  `route_transport_error`, and `software_route_trusted` cannot be true unless
  route transport verification passes. The desktop verifier also checks that
  the route evidence's private mesh control server URL matches the expected
  control server URL from the release proof command.
- The desktop parser preserves peer identity details even when transport proof
  fails, so the UI can distinguish "identity tuple bound" from "transport proof
  missing or weak."
- `scripts/windows/verify-private-mesh-release-proof-bundle.ps1` now performs
  the same route transport check independently. A bundle with valid hashes and
  physical evidence still fails if route evidence is legacy, points at the
  wrong IP, is outside `100.64.0.0/10`, uses `none_http_bearer`, omits the
  verified MUSU Headscale control-plane binding, or omits the no-MUSU-infra
  transit proof.
- Cockpit readiness now labels this gate as "Route transport and identity
  bound to selected peer" and surfaces `route_transport_error` in the blocking
  details.

Boundary:

- This is a Headscale/Tailscale tailnet WireGuard-overlay proof gate.
- It is not a hosted relay/QUIC/TLS transport proof, and it must not be used to
  claim the hosted relay path is release-grade.
- The remaining final release gate is still the real two-physical-machine run
  through the packaged desktop app and archived verifier bundle.

## Implementation Addendum 2026-06-14b

Closed the archive replay gap in the Private Mesh release proof.

Problem found during verifier review:

- The archive verifier checked archive manifest integrity, copied artifact
  sidecars, tool hashes, and the archived bundle manifest's `ok=true` /
  `fail_count=0`.
- That was still one trust layer too indirect: an old archive could preserve a
  bundle manifest that said route checks passed before the stricter
  Headscale/Tailnet transport contract existed.

New archive contract:

- The standalone archive verifier and native desktop archive verifier now
  re-open the archived `route_evidence` artifact itself.
- The archived route evidence must pass the same release-grade transport
  contract as the live bundle verifier:
  `schema=musu.route_evidence.v1`, `route_kind=tailscale`, `result=success`,
  target IP match, `100.64.0.0/10`, `encryption=tailscale_wireguard_overlay`,
  `transport_verified_by=musu_private_mesh_tailnet_route`,
  `private_mesh_mode=musu_headscale`,
  verified `private_mesh_control_server_url` matching the expected MUSU
  control server, and `payload_transited_musu_infra=false`.
- Therefore an archived bundle manifest can no longer make a weak or legacy
  route proof acceptable by recording a historical `ok=true`.

Implementation:

- `scripts/windows/verify-private-mesh-release-proof-archive.ps1` now contains
  the same `Add-PrivateMeshRouteTransportCheck` contract as the bundle
  verifier and applies it to the archived `route_evidence` artifact.
- `musu-bee/src-tauri/src/lib.rs` now uses
  `verify_archived_route_transport_binding` from the internal archive verifier,
  backed by the shared `verify_private_mesh_route_transport_contract` helper.
- `musu-bee/src-tauri-shell/cockpit-contract.test.ts` statically pins this
  archive-level route transport/control-plane replay check so future verifier
  edits cannot silently downgrade the release proof.

## Implementation Addendum 2026-06-14c

Closed the physical-peer freshness replay gap.

Problem found during verifier review:

- Physical peer evidence was checked for "fresh within 24 hours" against the
  verifier's current wall clock.
- That is acceptable for live UI preflight, but wrong for release evidence
  replay. A valid archived release proof could fail days later only because the
  verifier was run later, while the actual question is whether the target-PC
  evidence was fresh when the release proof completed.

New contract:

- Release proof bundle verification binds physical peer evidence
  `generated_at` to release proof `completed_at`, not to the verifier's current
  time.
- `generated_at` must be no older than 24 hours before `completed_at` and no
  more than 5 minutes after `completed_at`.
- `completed_at` is now a required verifier input for the bundle path; if it is
  missing or malformed, the bundle fails closed.
- Existing bundle manifests must include a passing
  `physical peer evidence release time binding` check. A historical manifest
  with `ok=true` but no replayable time-binding check is no longer accepted.

Implementation:

- `musu-bee/src-tauri/src/lib.rs` now has a release-time physical evidence
  reader for bundle generation/reload while keeping the live physical evidence
  picker on current-time freshness.
- `scripts/windows/verify-private-mesh-release-proof-bundle.ps1` now parses
  runner `completed_at` and evaluates physical evidence freshness against that
  timestamp.
- `musu-bee/src-tauri-shell/cockpit-contract.test.ts` pins the release-time
  binding so future verifier edits cannot quietly revert to wall-clock replay.

## Implementation Addendum 2026-06-14d

Closed the archive-level physical freshness replay gap.

Problem found after 2026-06-14c:

- Bundle verification independently checked physical evidence `generated_at`
  against release proof `completed_at`.
- Archive verification still trusted the archived bundle manifest's historical
  `ok=true` for that part of the contract unless the current bundle manifest
  happened to contain the new check.
- That left a replay gap: an older archive could pass archive verification even
  if its physical evidence freshness had not been judged by the current
  release-time rule.

New archive contract:

- The archived bundle manifest must contain a passing
  `physical peer evidence release time binding` check.
- The standalone archive verifier and native desktop archive verifier also
  re-open archived verification and physical peer evidence artifacts directly.
- They parse archived verification `completed_at`, parse physical evidence
  `generated_at`, and require the physical evidence to match archive
  target node, target tailnet IP, expected control server URL, verified target
  evidence schema/flags, and the 24-hour/5-minute release-time freshness
  window.
- Archive replay deliberately does not compare the target physical hostname to
  the verifier machine's current hostname. A portable archive may be inspected
  on a third machine; the current verifier host must not affect release proof
  replay.

Implementation:

- `musu-bee/src-tauri/src/lib.rs` now runs
  `verify_archived_physical_peer_time_binding` as part of the internal archive
  verifier.
- `scripts/windows/verify-private-mesh-release-proof-archive.ps1` now runs
  `Add-ArchivedPhysicalEvidenceReleaseTimeBindingCheck` and rejects archived
  bundle manifests that lack the current time-binding check.
- `musu-bee/src-tauri-shell/cockpit-contract.test.ts` statically pins the
  archive-level physical evidence replay check.

## Implementation Addendum 2026-06-14e

Closed the archive verification artifact binding gap.

Problem found after 2026-06-14d:

- Archive verification checked the archived verification artifact's sidecar and
  that the file lived inside the archive directory.
- It did not independently prove that the verification JSON itself described
  the same target node, target tailnet IP, expected control server URL, success
  state, and release completion time as the archive manifest.
- A malformed archive could therefore carry a valid-looking archive manifest,
  bundle manifest, route evidence, and physical evidence while the primary
  verification artifact pointed at a different proof.

New archive contract:

- The archived verification artifact must have schema
  `musu.private_mesh_release_proof.v1` or
  `musu.private_mesh_release_proof_runner.v1`.
- `ok` must be `true`.
- `target_node`, `target_ip`, and `expected_control_server_url` must match the
  archive manifest.
- `completed_at` must be present and parse as RFC3339.
- This check runs before archive physical freshness replay, because
  `completed_at` is the time anchor for replayable physical evidence freshness.

Implementation:

- `musu-bee/src-tauri/src/lib.rs` now runs
  `verify_archived_verification_binding` from the internal archive verifier.
- `scripts/windows/verify-private-mesh-release-proof-archive.ps1` now runs
  `Add-ArchivedVerificationBindingCheck`.
- `musu-bee/src-tauri-shell/cockpit-contract.test.ts` pins the verification
  artifact binding contract.

## Implementation Addendum 2026-06-14f

Closed the archive peer-identity replay gap.

Problem found after 2026-06-14e:

- Archive verification directly replayed route transport, verification target
  binding, and physical evidence freshness.
- It still did not independently replay the `route_evidence.peer_identity`
  tuple that proves the delegated proof was bound to a distinct target machine.
- That meant archive replay could rely too much on historical bundle checks for
  identity while directly checking transport and physical evidence.

New archive contract:

- Archived route evidence must contain `peer_identity` with schema
  `musu.private_mesh_peer_identity.v1`.
- `peer_identity.target_node` and `peer_identity.target_ip` must match the
  archive manifest.
- `node_distinct`, `tailnet_ip_distinct`, `physical_host_distinct`,
  `target_url_host_matches_target_ip`, `release_identity_bound`, and
  `physical_peer_verified` must all be `true`.
- `target_url_host` must equal the archive target IP.
- `peer_identity.target_hostname` must match the archived physical peer
  evidence `hostname`.
- Like physical freshness replay, this check is portable: it compares archived
  target evidence to archived identity evidence, not to the machine running the
  verifier.

Implementation:

- `musu-bee/src-tauri/src/lib.rs` now runs
  `verify_archived_peer_identity_binding` during internal archive verification.
- `scripts/windows/verify-private-mesh-release-proof-archive.ps1` now runs
  `Add-ArchivedPeerIdentityBindingCheck`.
- `musu-bee/src-tauri-shell/cockpit-contract.test.ts` pins the peer identity
  archive replay contract.

## Implementation Addendum 2026-06-14g

Clarified archive verifier scope in the desktop UX.

Problem found during the archive verifier review:

- The standalone PowerShell archive verifier checks `release_tool_hashes`
  against the current verifier scripts.
- The native desktop archive verifier performs structural replay of the archive
  contract inside the packaged app, but it does not and should not imply that
  external PowerShell verifier files were present and hash-matched.
- Cockpit previously rendered both as generic "Archive verifier passed", which
  could overstate the verifier scope.

New UX contract:

- Native desktop archive verification is labeled `native structural replay`.
- Standalone PowerShell archive verification is labeled
  `standalone current-toolchain replay`.
- Release readiness can still pass with native structural replay, but copied
  evidence and on-screen diagnostics no longer imply that PowerShell toolchain
  hash validation happened unless the standalone path actually reported it.

Implementation:

- `musu-bee/src-tauri-shell/main.js` now maps `archive_verifier_kind` to a
  human-readable verifier scope in the release evidence strip and readiness
  checklist.
- `scripts/windows/archive-private-mesh-release-proof-bundle.ps1` now emits
  `archive_verifier_kind=powershell_current_toolchain`.
- `scripts/windows/run-private-mesh-release-proof.ps1` now propagates
  archive verifier schema, fail count, ok state, and kind into the final runner
  verification JSON.
- `musu-bee/src-tauri-shell/cockpit-contract.test.ts` pins these scope labels
  and propagation points.

## Implementation Addendum 2026-06-14h

Added packaged desktop runtime identity to release readiness.

Problem found after verifier-scope review:

- Release evidence proved route, callback, physical peer evidence, bundle
  manifest, and archive replay.
- It still did not prove that the evidence was generated from the packaged MUSU
  desktop app the user will actually install.
- A dev/native run could therefore look release-ready even though the final
  claim is a packaged desktop product claim.

New release-readiness contract:

- Desktop release proof records `desktop_runtime_kind`,
  `desktop_runtime_packaged`, `desktop_runtime_exe_path`, and
  `desktop_runtime_exe_sha256`.
- `target/debug`, `target/release`, `src-tauri`, and `node_modules` runtime
  paths are treated as `dev_or_unpackaged_desktop`.
- Cockpit final readiness requires `desktop_runtime_packaged=true`.
- Existing evidence reloads runtime identity from the saved bundle/archive
  manifest instead of replacing it with the runtime identity of the machine that
  happens to be reviewing the proof.

Implementation:

- `musu-bee/src-tauri/src/lib.rs` attaches runtime identity during release proof
  generation and writes it into bundle and archive manifests.
- `musu-bee/src-tauri-shell/main.js` adds a `Packaged desktop runtime` readiness
  check and exposes the runtime scope in the release strip.
- `musu-bee/src-tauri-shell/cockpit-contract.test.ts` now proves that otherwise
  complete archive evidence is not ready when it came from a dev/unpackaged
  runtime.

## Implementation Addendum 2026-06-14i

Closed the PowerShell release-runner scope ambiguity.

Problem found after adding packaged desktop readiness:

- Native desktop evidence now records packaged/unpackaged runtime identity.
- The standalone PowerShell release runner still produced trusted bundle/archive
  evidence without explicitly saying that it was an external CLI/script runner,
  not a packaged desktop app session.
- Cockpit would still reject it for final desktop readiness, but the artifact
  itself did not carry the reason clearly enough.

New artifact contract:

- `scripts/windows/run-private-mesh-release-proof.ps1` writes
  `desktop_runtime_kind=external_cli_release_runner`,
  `desktop_runtime_packaged=false`, the invoked `musu.exe` path, and its SHA256.
- `verify-private-mesh-release-proof-bundle.ps1` checks that runtime scope is
  recorded and copies it into the bundle manifest.
- `archive-private-mesh-release-proof-bundle.ps1` copies runtime scope into the
  archive manifest and archive result.
- `verify-private-mesh-release-proof-archive.ps1` verifies the archive runtime
  scope matches the archived bundle manifest.

Product implication:

- PowerShell release archives can still be useful standalone current-toolchain
  evidence.
- They no longer satisfy the final packaged desktop readiness claim unless a
  packaged desktop runtime generated and recorded `desktop_runtime_packaged=true`.

## Implementation Addendum 2026-06-14j

Made packaged desktop Private Mesh proof a final go/no-go blocker.

Problem found after runtime-scope propagation:

- Runner, bundle, archive, archive verifier, and Cockpit readiness now carry
  `desktop_runtime_*` scope.
- The final release go/no-go script still only blocked on generic
  `multi_device_verified`, P2P control-plane evidence, MSIX, CPU, and Store
  gates.
- That meant a release packet could clearly label standalone CLI Private Mesh
  proof as `external_cli_release_runner`, but the final decision artifact did
  not separately require a packaged desktop-generated proof archive.

New final release contract:

- `scripts/windows/write-release-go-no-go.ps1` scans
  `docs/evidence/private-mesh-release-proof/<version>` and
  `.local-build/private-mesh-release-proof` for
  `private-mesh-release-proof.archive.json`.
- Each candidate is replayed through
  `verify-private-mesh-release-proof-archive.ps1`.
- The go/no-go result sets
  `private_mesh_packaged_release_proof_verified=true` only when archive replay
  is `ok=true`, `desktop_runtime_kind=packaged_desktop`, and
  `desktop_runtime_packaged=true`.
- Otherwise it adds a hard blocker under
  `private-mesh-packaged-release-proof`.

Product implication:

- A developer or standalone PowerShell proof can no longer accidentally satisfy
  the user-facing "packaged desktop app controls another machine over Private
  Mesh" claim.
- Final public desktop release remains blocked until a packaged MUSU desktop
  runtime generates the Private Mesh release archive on real hardware and the
  archive verifier accepts it.

## Implementation Addendum 2026-06-14k

Surfaced the packaged Private Mesh release-proof gate in operator status.

Problem found after adding the go/no-go blocker:

- `write-release-go-no-go.ps1` correctly blocked final release without
  `private_mesh_packaged_release_proof_verified=true`.
- `show-final-release-handoff-status.ps1` did not yet show that gate in its
  `gates` summary, evidence roots, or next operator steps.
- `record-external-release-gate-recheck.ps1` flattened generic go/no-go blockers,
  but did not expose packaged Private Mesh proof as a first-class field.
- That forced an operator to inspect the raw go/no-go JSON to understand the
  remaining packaged desktop Private Mesh work.

New operator-status contract:

- Final handoff status now includes
  `gates.private_mesh_packaged_release_proof_verified`.
- It scans `docs/evidence/private-mesh-release-proof/<version>` and
  `.local-build/private-mesh-release-proof` recursively for
  `private-mesh-release-proof.archive.json`.
- If the gate is missing, the operator step explicitly says to run release proof
  from the installed MUSU desktop app on real hardware.
- The step also says not to use
  `scripts/windows/run-private-mesh-release-proof.ps1` for the final packaged
  desktop gate, because that runner intentionally records
  `desktop_runtime_kind=external_cli_release_runner`.
- External release-gate recheck now emits
  `private_mesh_packaged_release_proof_verified`,
  `private_mesh_packaged_release_proof_evidence`, and blocker
  `private_mesh_packaged_release_proof_missing`.

Product implication:

- The release dashboard and external recheck now tell the operator exactly why
  MUSU is still not an S-tier public desktop release: the final packaged app
  itself must prove real Private Mesh work routing and archive replay.

## Implementation Addendum 2026-06-14l

Added a strict importer for packaged desktop Private Mesh release archives.

Problem found after surfacing the final gate:

- The packaged desktop app writes release proof archives under
  `MUSU_HOME/private-mesh-release-proof/...`.
- Final go/no-go scans the repo release evidence roots:
  `docs/evidence/private-mesh-release-proof/<version>` and
  `.local-build/private-mesh-release-proof`.
- Without a verifier-backed import step, an operator could successfully create a
  packaged archive but still fail final go/no-go, or manually copy an incomplete
  archive without its sidecars.

New import contract:

- `scripts/windows/import-private-mesh-release-proof-archive.ps1` accepts
  `-ArchiveDir` or `-ArchiveManifestPath`.
- It first runs `verify-private-mesh-release-proof-archive.ps1`.
- It refuses to import unless archive replay passes and the archive reports
  `desktop_runtime_kind=packaged_desktop` plus
  `desktop_runtime_packaged=true`.
- It copies the entire archive directory into
  `docs/evidence/private-mesh-release-proof/<version>/...` by default.
- It verifies the copied archive again from the destination path before
  reporting success.
- It optionally copies the sibling `.zip` if the packaged archive flow produced
  one.
- Final handoff status now tells the operator to run this importer after
  clicking Release proof in the installed desktop app.

Product implication:

- The path from "the installed app proved Private Mesh on real hardware" to
  "go/no-go can verify and ship that proof" is now explicit and tool-checked.
- Standalone CLI proof remains diagnostic; it cannot be imported as final
  packaged desktop proof.

## Implementation Addendum 2026-06-14m

Closed the remaining release-proof import UX gap.

Problem:

- The strict importer was correct, but the handoff command still required the
  operator to find and paste a deep
  `MUSU_HOME/private-mesh-release-proof/.../private-mesh-release-proof.archive.json`
  path.
- That is an avoidable failure mode for the final S-grade proof: the packaged
  desktop app may generate the right archive while the release gate still fails
  because the operator imports the wrong folder, misses a sidecar, or gives up
  on path discovery.

New behavior:

- `scripts/windows/import-private-mesh-release-proof-archive.ps1` now accepts
  `-LatestFromMusuHome` and `-MusuHome`.
- If neither `-ArchiveDir` nor `-ArchiveManifestPath` is passed, the importer
  automatically resolves `$env:MUSU_HOME`, then falls back to
  `%USERPROFILE%\.musu`, scans `private-mesh-release-proof` recursively, and
  imports the newest `private-mesh-release-proof.archive.json`.
- The same strict verifier replay remains in front of import and after copy.
  Auto-discovery only finds the candidate; it does not weaken packaged runtime,
  archive hash, route transport, physical-peer, or sidecar checks.
- Final handoff status now tells the operator to run:
  `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\import-private-mesh-release-proof-archive.ps1 -LatestFromMusuHome -Json`.

Product implication:

- The final proof path is now closer to the actual user mental model:
  "click Release proof in the installed app, then run the importer" instead of
  "manually spelunk through archive directories and hope the right manifest was
  selected."

## Implementation Addendum 2026-06-14n

Hardened `-LatestFromMusuHome` from "newest file wins" to "newest verified
packaged archive wins."

Problem:

- A user's `MUSU_HOME/private-mesh-release-proof` can contain failed runs,
  incomplete archives, standalone CLI diagnostic archives, or old development
  artifacts.
- If the importer picked only the newest manifest, one bad latest archive could
  block import even when a valid packaged desktop archive was present nearby.

New behavior:

- Auto-discovery scans the newest 25 `private-mesh-release-proof.archive.json`
  candidates under `MUSU_HOME/private-mesh-release-proof`.
- Each candidate is replayed through
  `verify-private-mesh-release-proof-archive.ps1`.
- The importer selects the first candidate whose verifier result is `ok=true`,
  `desktop_runtime_kind=packaged_desktop`, and
  `desktop_runtime_packaged=true`.
- Rejected candidates are recorded in the import result as
  `auto_rejected_archive_candidates`, including reason, verifier exit code,
  fail count, and runtime scope when available.

Product implication:

- The final release import path now behaves like a resilient release tool
  instead of a brittle file picker. It still fails closed when no packaged
  archive can be verified, but it no longer makes the operator manually recover
  from an unrelated failed or diagnostic run.

## Implementation Addendum 2026-06-14o

Made failed archive auto-discovery machine-readable.

Problem:

- After addendum `2026-06-14n`, the importer could correctly reject multiple
  bad candidates, but in `-Json` mode the terminal still ended with a PowerShell
  exception string.
- That is weak release UX: a failed final-gate import should produce an artifact
  that an operator, LLM assistant, or CI wrapper can parse and explain.

New behavior:

- When `-LatestFromMusuHome`/auto-discovery finds archive manifests but none
  pass the packaged desktop verifier gate, the importer now exits with code `1`
  and emits schema `musu.private_mesh_release_proof_archive_import.v1` with
  `ok=false`.
- The failure JSON includes `failed_at`, `version`, resolved `musu_home`,
  `error`, `next_action`, and `auto_rejected_archive_candidates`.
- Each rejected candidate retains the manifest path, reason, verifier exit code,
  verifier `ok`, fail count, and runtime scope when the verifier exposed it.

Product implication:

- Failure is now diagnosable without rerunning blind commands. The user can see
  whether the problem is "only CLI/dev archives exist", "archive verifier
  failed", or "Release proof has not produced a packaged archive yet."

## Implementation Addendum 2026-06-14p

Extended structured importer failure to the discovery entry points.

Problem:

- Addendum `2026-06-14o` structured the "candidates exist but none pass" case.
- Two earlier auto-discovery failures still returned plain PowerShell errors:
  missing `MUSU_HOME/private-mesh-release-proof` and zero archive manifests under
  that root.

New behavior:

- Missing release-proof root now returns JSON with
  `failure_kind=private_mesh_release_proof_root_missing`.
- Empty release-proof root now returns JSON with
  `failure_kind=private_mesh_release_proof_archive_manifest_missing`.
- No verifier-passing packaged desktop archive now returns JSON with
  `failure_kind=no_packaged_desktop_archive_candidate`.
- All three use the same import schema, `ok=false`, resolved `musu_home`, and
  the same next action guidance.

Product implication:

- The importer is now CI/LLM-friendly across the full auto-discovery path. A
  release operator can distinguish "Release proof was never run" from "Release
  proof ran but produced no archive" from "archives exist but none satisfy the
  packaged desktop gate."

## Implementation Addendum 2026-06-14q

Promoted structured importer failures into release verifier regressions.

Problem:

- Addendum `2026-06-14p` made the importer emit JSON for discovery failures,
  but the regression suite only checked source-code needles.
- That could miss a real runtime regression where PowerShell exits with a plain
  exception string, emits unparsable output, or returns the wrong
  `failure_kind`.

New behavior:

- `test-release-evidence-verifiers.ps1` now executes
  `import-private-mesh-release-proof-archive.ps1 -Json` against three synthetic
  MUSU_HOME layouts:
  - no `private-mesh-release-proof` root,
  - an empty `private-mesh-release-proof` root,
  - an invalid archive manifest candidate.
- Each case must exit non-zero, parse as
  `musu.private_mesh_release_proof_archive_import.v1`, set `ok=false`, and expose
  the exact expected `failure_kind`.

Product implication:

- Final release handoff tooling now treats failure explanation as a tested
  product surface, not an incidental terminal message. That matters because the
  operator and LLM assistant both need machine-readable next actions when the
  packaged Private Mesh proof has not been imported yet.

## Implementation Addendum 2026-06-14r

Extended importer failure JSON to explicit archive paths.

Problem:

- Auto-discovery failures were machine-readable, but an operator could still pass
  `-ArchiveManifestPath` or `-ArchiveDir` directly and receive a plain
  PowerShell exception when the path was wrong or the verifier rejected the
  archive.
- That is still a product failure for the final handoff loop: a user or LLM
  assistant should not have to parse terminal exception text to recover.

New behavior:

- Missing explicit archive manifest paths now return
  `failure_kind=archive_manifest_path_missing`.
- Explicit archive directories that are missing, lack
  `private-mesh-release-proof.archive.json`, fail archive verification, or are
  not `packaged_desktop` now fail through the same
  `musu.private_mesh_release_proof_archive_import.v1` schema.
- The release verifier regression suite now executes two explicit-path failure
  cases: missing manifest path and invalid manifest rejected by the archive
  verifier.

Product implication:

- The import step is now machine-readable whether the operator lets MUSU discover
  the latest packaged archive or points at a specific archive manually. That
  keeps the final "make this usable" loop recoverable instead of turning one bad
  file path into a dead end.

## Implementation Addendum 2026-06-14s

Promoted explicit archive directory failures into importer regressions.

Problem:

- Addendum `2026-06-14r` made explicit archive path failures structured, but the
  regression suite still only executed `-ArchiveManifestPath` failures.
- Operators can also pass `-ArchiveDir`; if that directory is wrong or lacks
  `private-mesh-release-proof.archive.json`, the final handoff needs the same
  machine-readable recovery path.

New behavior:

- `test-release-evidence-verifiers.ps1` now executes two additional importer
  failure cases:
  - missing explicit `-ArchiveDir` with `failure_kind=archive_dir_missing`,
  - existing explicit `-ArchiveDir` without
    `private-mesh-release-proof.archive.json` with
    `failure_kind=archive_manifest_missing_in_archive_dir`.
- Both cases must exit non-zero, parse as
  `musu.private_mesh_release_proof_archive_import.v1`, and set `ok=false`.

Product implication:

- The final Private Mesh proof import path now has tested recovery semantics for
  auto-discovery, explicit manifest files, and explicit archive directories. That
  removes another class of "operator typed the wrong thing, now the loop is a
  PowerShell exception" failures from the S-grade handoff path.

## Implementation Addendum 2026-06-14t

Tightened importer failure context regression.

Problem:

- The importer failure regression suite proved `schema`, `ok=false`, and
  `failure_kind`, but it did not prove the context fields were truthful.
- That left room for an explicit `-ArchiveManifestPath` or `-ArchiveDir` failure
  to be mislabeled as `auto_discovered_from_musu_home=true`, or to show a default
  `musu_home` even though MUSU_HOME was not used.

New behavior:

- Auto-discovery failure fixtures must now prove:
  - `latest_from_musu_home=true`,
  - `auto_discovered_from_musu_home=true`,
  - `musu_home` equals the synthetic MUSU_HOME used by the fixture.
- Explicit archive input failure fixtures must now prove:
  - `latest_from_musu_home=false`,
  - `auto_discovered_from_musu_home=false`,
  - `musu_home` is blank.

Product implication:

- Failure JSON is now tested for truthful recovery context, not just parseability.
  This prevents the handoff assistant from giving the operator the wrong next
  step because an explicit path failure was mislabeled as an auto-discovery
  failure.

## Implementation Addendum 2026-06-14u

Made final handoff status resilient when go/no-go is unavailable.

Problem:

- `show-final-release-handoff-status.ps1 -Json` invoked
  `write-release-go-no-go.ps1` as a hard dependency.
- If go/no-go timed out or failed before returning parseable JSON, final handoff
  status emitted a plain PowerShell exception instead of the
  `musu.final_release_handoff_status.v1` document the operator/LLM assistant
  expects.

New behavior:

- The handoff status script now invokes go/no-go with `-AllowFailure`.
- If go/no-go is unavailable, handoff status still returns structured JSON with:
  - `go_no_go_available=false`,
  - `go_no_go_invocation` exit/timeout/raw details,
  - a fallback `musu.release_go_no_go_unavailable.v1` object,
  - one actionable `go-no-go-unavailable` operator step instead of a misleading
    flood of downstream gate steps.
- The release verifier suite now has a source contract requiring this fallback
  path.

Product implication:

- Final release handoff is no longer a dead end when one verifier run is slow or
  broken. The operator still gets a parseable status artifact and a precise next
  command, which is the behavior expected from an S-grade release workflow.

## Implementation Addendum 2026-06-14v

Fixed go/no-go packaged-proof fallback on Windows PowerShell.

Problem:

- `write-release-go-no-go.ps1 -SkipPublicMetadata -ScriptTimeoutSeconds 30 -Json`
  could fail after the child verifiers completed with `Argument types do not
  match`.
- The failure occurred while building the fallback
  `private_mesh_packaged_release_proof_evidence` object when no valid packaged
  desktop Private Mesh release archive was available.
- This meant the resilient final handoff status from addendum `2026-06-14u`
  could correctly report go/no-go as unavailable, but the go/no-go script itself
  still had a PowerShell runtime crash instead of returning the authoritative
  `musu.release_go_no_go.v1` blocker document.

New behavior:

- The fallback candidate counts and candidate result list are materialized before
  the `pscustomobject` is created.
- The candidate result list is explicitly emitted from
  `$privateMeshPackagedReleaseProofEvidenceResults.ToArray()` instead of relying
  on PowerShell's generic-list enumerable binder inside an object literal.
- The release verifier source contract now requires this materialization so the
  regression cannot silently return.

Verification:

- `write-release-go-no-go.ps1 -SkipPublicMetadata -ScriptTimeoutSeconds 30 -Json`
  now returns `schema=musu.release_go_no_go.v1` with
  `private_mesh_packaged_release_proof_verified=false` instead of throwing the
  type error.
- `test-release-evidence-verifiers.ps1 -Json` passes with `case_count=161` and
  `failed_case_count=0`.

Product implication:

- A missing packaged desktop Private Mesh proof is now a normal release blocker,
  not a verifier crash. That preserves the final release loop: the operator sees
  the real remaining blocker and can generate/import the packaged proof instead
  of debugging PowerShell internals.

## Implementation Addendum 2026-06-14w

Closed the desktop-shell readiness blocker.

Problem:

- The final handoff status still reported `desktop-shell` as the first blocker
  even though the packaged MSIX desktop entrypoint itself verified.
- The failure was in the desktop shell readiness contract:
  - no visible Start Runtime button gated by backend `can_start_runtime`,
  - no explicit package/auth/runtime-profile/process-ownership status rows in
    the diagnostics drawer,
  - no visible warning panel/list for doctor-derived warnings,
  - no `open_dashboard` Tauri command in the handler set.

New behavior:

- The diagnostics drawer now surfaces package, auth, runtime profile, process
  ownership, and owned helper counts from `desktop_status`.
- Doctor-derived warnings render into an explicit `warnings-panel` /
  `warning-list` surface and elevate the connection pill to Review.
- Start Runtime is now a visible diagnostics action and is disabled unless
  `state.status?.can_start_runtime` is true and the cockpit is not busy.
- The Tauri handler set now includes `open_dashboard`; it opens the optional
  developer dashboard only when that dashboard is available.

Verification:

- `audit-desktop-release-readiness.ps1 -Json` now reports
  `desktop_shell_ready=true`.
- `show-final-release-handoff-status.ps1 -SkipPublicMetadata
  -SkipPacketVerification -SkipActionPackVerification -ScriptTimeoutSeconds 120
  -Json` now reports `local_artifacts_ready=true`; the `desktop-shell` blocker
  is gone.
- `npm run test:tauri-shell` passes with `35` tests.
- `cargo test --manifest-path musu-bee/src-tauri/Cargo.toml` passes with `31`
  Rust tests.
- `test-release-evidence-verifiers.ps1 -Json` passes with `case_count=161` and
  `failed_case_count=0`.

Product implication:

- The packaged desktop cockpit now gives an operator an actionable local recovery
  surface instead of hiding runtime/package/process ownership state behind copied
  JSON. This does not finish the release: the remaining blockers are proof and
  environment gates, especially real single-machine, real second-PC Private Mesh,
  packaged proof archive, CPU/process evidence, public metadata, store/support,
  P2P control-plane evidence, and a clean git manifest.
