# MUSU Product Purpose and Implementation Gate (2026-06-27)

## Purpose

MUSU exists to make the user's own computers behave like one trustworthy work
surface. The user should be able to install MUSU on a second or main PC, see
which machine can actually do work, delegate work to it, and get evidence back
without reasoning about ports, stale registry rows, hidden sidecars, or local
files.

The product is not a generic cloud agent runner. `musu.pro` coordinates install,
identity, rendezvous, public proof scripts, and route evidence. MUSU Desktop is
the local executor. `musu-brain` is a hidden knowledge chip owned by the product
lifecycle, with data under `~/.musu/brain`; the user should not manage it as a
separate app.

## What "Implemented Properly" Means

The product is implemented properly only when these claims are simultaneously
true and verified:

1. A visible online node is actually work-targetable from this machine.
2. A relay/yellow node is presented only as fresh display evidence, not as proof
   that delegated work will route over relay transport.
3. `last_seen` is evidence-backed. Registry fetch time must never be written as
   peer heartbeat time.
4. A remote node's `public_url` must be usable by another PC. Loopback,
   localhost, wildcard, IPv4-mapped loopback/wildcard, and port-0 values are not
   fleet truth.
5. The install channel must prove the package version that is actually installed,
   not just that a URL returns HTTP 200.
6. Brain integration must stay hidden, sidecar-owned, and IPC-only. No shared
   SQLite writes between MUSU and the Go brain chip.
7. A release claim needs live or packaged evidence: route proof, installed
   package proof, token ACL proof when required, and a clear remaining blocker
   list.

## Full Product Completion Status

As of 2026-06-27, MUSU is not fully complete against the whole product spec.
The current `1.15.0-rc.22` evidence proves the two-PC direct fleet slice for
`hugh-main` and `hugh_second`, including installed package version,
remote-usable public URLs, direct healthy peer status, and brain ingest token
ACL on the main PC proof.

The remaining product gates are separate claims and must not be inferred from
the direct fleet proof:

- PR #34 design approval.
- Microsoft Store or equivalent trusted distribution evidence.
- Real delegated-work relay transport and release-grade relay route evidence.
- Full brain product proof: packaged `/health`, actual task source ingest,
  cockpit recall/capture UX, fleet event ingest or explicit scope decision, and
  stronger version surface.
- V34 discovery/stale self-heal evidence for stale registry/cache/manual-peer
  cases.
- Support mailbox evidence or a formal decision to retire that historical
  release gate.

Canonical roadmap:
`docs/MUSU_FULL_PRODUCT_SPEC_COMPLETION_ROADMAP_2026_06_27.md`.

## Current Audit Against The Pasted Findings

| Finding | Current status | Evidence |
|---|---|---|
| `last_heartbeat` was fabricated from registry fetch time | Fixed in current tree | `musu-rs/src/bridge/mod.rs` uses `registry_last_seen_to_heartbeat(&node.last_seen)` before writing `CachedNode.last_heartbeat`; `cargo test --manifest-path musu-rs\Cargo.toml --lib registry_last_seen -j 1` passed. |
| Remote `127.0.0.1` public URL survived as route truth | Fixed in current tree | `public_url_to_remote_addr` rejects loopback/wildcard hosts; `resolve_all_peers` ignores unusable cache rows and keeps a valid same-name manual LAN peer; `verify-fleet-audit-contract.ps1 -SelfTestRemoteUsable -Json` passed with `ok=true`, `fail_count=0`. |
| Relay-display counted as online | Fixed in current tree | `tally_fleet()` counts only `healthy` peers; `cargo test --manifest-path musu-rs\Cargo.toml --lib tally_counts_only_direct_healthy_peers_online -j 1` passed. |
| `bridge.json`/actual bind confusion can understate attack surface | Proven on both physical nodes for rc.22 direct fleet | `verify-fleet-audit-contract.ps1 -RequireBrainToken -Json` passed on `hugh_second` with `bridge_bind_addr=0.0.0.0:11105`, `advertised_public_url=http://192.168.1.154:11105`, `online_nodes=1`, and `direct_healthy_nodes=1`. Hosted `fleet-proof.ps1` then passed on `hugh-main` with `bridge_bind_addr=0.0.0.0:4387`, `advertised_public_url=http://192.168.1.192:4387`, `online_nodes=2`, and `direct_healthy_nodes=2`. |
| `tls/key.pem` and `private_mesh.toml` ACLs were too broad | Proven on `hugh_second`; brain ingest token ACL also proven on `hugh-main` | `verify-fleet-audit-contract.ps1 -RequireBrainToken -Json` passed on `hugh_second` with `tls_key_acl_restricted`, `private_mesh_acl_restricted`, and `brain_ingest_token_acl_restricted` all passing. Hosted `fleet-proof.ps1 -RequireBrainToken` passed on `hugh-main` with `brain_token_present=true` and `brain_ingest_token_acl_restricted` passing. |

## Fresh Verification Snapshot

Current `hugh_second` evidence captured on 2026-06-27 KST:

- `verify-fleet-audit-contract.ps1 -RequireBrainToken -Json`: `ok=true`,
  `fail_count=0`, `warn_count=0`.
- Installed package: `blossompark.musu_1.15.0.22_x64__f5h38pf4yt4gc`.
- Bridge bind and advertised URL are separated correctly:
  `bridge_bind_addr=0.0.0.0:11105`, `advertised_public_url=http://192.168.1.154:11105`.
- Fleet counts are honest: `total_nodes=2`, `online_nodes=1`,
  `direct_healthy_nodes=1`; the remote peer is not counted online.
- Secret custody gates pass for `tls/key.pem`, `private_mesh.toml`, and
  `~/.musu/brain/runtime/musu-ingest.token`.
- Service registry contract tests also pass:
  `cargo test --manifest-path musu-rs\Cargo.toml --lib bridge::services::tests:: -j 1`
  (`21/21`).
- After the main PC proof, `musu status --json` on `hugh_second` reports both
  nodes healthy over direct routes: `hugh_second` at
  `http://192.168.1.154:11105` and `hugh-main` at
  `http://192.168.1.192:4387`.

Current `hugh-main` proof captured on 2026-06-27 KST:

- Evidence file:
  `docs/evidence/fleet-proof/1.15.0-rc.22/hugh-main-20260627T010201Z.fleet-proof.json`.
- Hosted `fleet-proof.ps1` schema: `musu.fleet_node_proof.v1`.
- Result: `ok=true`, `fail_count=0`, `warn_count=0`.
- Installed package:
  `blossompark.musu_1.15.0.22_x64__f5h38pf4yt4gc`.
- Bridge bind and advertised URL are separated correctly:
  `bridge_bind_addr=0.0.0.0:4387`,
  `advertised_public_url=http://192.168.1.192:4387`.
- Fleet counts are now direct-green across both PCs: `total_nodes=2`,
  `online_nodes=2`, `direct_healthy_nodes=2`.
- Expected direct peer proof passes for `hugh_second`.
- Cloud registry URLs are remote-usable, with
  `remote_cloud_warning_count=0`.
- Brain token custody passes with `brain_token_required=true`,
  `brain_token_present=true`, and `brain_ingest_token_acl_restricted`.

## System Design Boundary

| Surface | Owner | Contract |
|---|---|---|
| Public install scripts | `musu.pro` Next routes | Serve version-pinned scripts and proof wrappers; live verifier must fail if routes are stale. |
| Desktop package | MSIX/AppInstaller | Installed package version must equal the current release package version. |
| Bridge | MUSU local Rust runtime | Owns local HTTP API, peer probes, fleet status, route execution, and service registry. |
| Registry | `musu.pro` account-scoped node registry | Stores only remote-usable public URLs for fleet truth; old unusable rows must be hidden or cleaned up. |
| Brain chip | Go `musu-brain` sidecar | Owns its own store under `~/.musu/brain`; MUSU communicates by IPC/proxy only. |
| Proof scripts | Hosted PowerShell wrappers | Convert physical-machine state into JSON evidence, not prose. |

## Current Main Constraint

The two-machine direct route proof is now green for the current rc.22 package.
The remaining merge/release blocker is explicit PR #34 design approval evidence:
issue #35 needs an approval comment, and the PR body must say `Design: Approved`
with the approval URL.

This does not prove Store readiness or real relay transport for delegated work.
Release reporting must continue to keep direct, relay-display, and offline as
separate states.

## Next Implementation Gate

Do not add new product breadth until this gate is green:

1. `hugh-main` installs `1.15.0-rc.22` through the public one-line installer.
2. `hugh-main` first launch creates the expected runtime services and brain token.
3. Hosted `fleet-proof.ps1` passes with `-ExpectedDirectPeerName hugh_second`.
4. The proof JSON is saved in the release evidence tree.
5. PR #34 design-gate has explicit approval evidence.
6. The final report states direct, relay-display, and offline as separate states
   without implying relay transport for delegated work.

## Confidence

High confidence: the pasted audit's top three runtime defects are fixed in the
current tree and covered by targeted tests; the current two-PC direct route
claim is backed by `hugh_second` status and `hugh-main` hosted proof evidence.

Medium confidence: the public install/proof channel is correct for rc.22 because
the live verifier and hosted `hugh-main` proof both passed.

Not proven: PR #34 design approval, Store readiness, and real relay transport
readiness.
