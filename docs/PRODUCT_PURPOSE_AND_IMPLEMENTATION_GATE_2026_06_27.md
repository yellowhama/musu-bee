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

## Current Audit Against The Pasted Findings

| Finding | Current status | Evidence |
|---|---|---|
| `last_heartbeat` was fabricated from registry fetch time | Fixed in current tree | `musu-rs/src/bridge/mod.rs` uses `registry_last_seen_to_heartbeat(&node.last_seen)` before writing `CachedNode.last_heartbeat`; `cargo test --manifest-path musu-rs\Cargo.toml --lib registry_last_seen -j 1` passed. |
| Remote `127.0.0.1` public URL survived as route truth | Fixed in current tree | `public_url_to_remote_addr` rejects loopback/wildcard hosts; `resolve_all_peers` ignores unusable cache rows and keeps a valid same-name manual LAN peer; `verify-fleet-audit-contract.ps1 -SelfTestRemoteUsable -Json` passed with `ok=true`, `fail_count=0`. |
| Relay-display counted as online | Fixed in current tree | `tally_fleet()` counts only `healthy` peers; `cargo test --manifest-path musu-rs\Cargo.toml --lib tally_counts_only_direct_healthy_peers_online -j 1` passed. |
| `bridge.json`/actual bind confusion can understate attack surface | Proven on `hugh_second`; still needs live proof per machine | `verify-fleet-audit-contract.ps1 -RequireBrainToken -Json` passed on `hugh_second` with `bridge_bind_addr=0.0.0.0:11105`, `advertised_public_url=http://192.168.1.154:11105`, `online_nodes=1`, and `direct_healthy_nodes=1`. The same proof is still missing on `hugh-main`. |
| `tls/key.pem` and `private_mesh.toml` ACLs were too broad | Proven on `hugh_second`; still needs live proof per machine | `verify-fleet-audit-contract.ps1 -RequireBrainToken -Json` passed on `hugh_second` with `tls_key_acl_restricted`, `private_mesh_acl_restricted`, and `brain_ingest_token_acl_restricted` all passing. The same proof is still missing on `hugh-main`. |

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

The remaining blocker is not more local reasoning. It is physical evidence from
the main PC.

Run on `hugh-main`:

```powershell
irm https://musu.pro/install.ps1 | iex
```

Launch MUSU once, then run:

```powershell
& ([scriptblock]::Create((irm https://musu.pro/fleet-proof.ps1))) -ExpectedNodeName hugh-main -ExpectedDirectPeerName hugh_second -RequireBrainToken -Json
```

Until that emits `musu.fleet_node_proof.v1` with the expected installed version,
remote-usable URL, direct peer proof, and brain token ACL proof, MUSU can be
called ready on `hugh_second` but not on the two-machine product goal.

## Next Implementation Gate

Do not add new product breadth until this gate is green:

1. `hugh-main` installs `1.15.0-rc.22` through the public one-line installer.
2. `hugh-main` first launch creates the expected runtime services and brain token.
3. Hosted `fleet-proof.ps1` passes with `-ExpectedDirectPeerName hugh_second`.
4. PR #34 design-gate has explicit approval evidence.
5. The final report states direct, relay-display, and offline as separate states
   without implying relay transport for delegated work.

## Confidence

High confidence: the pasted audit's top three runtime defects are fixed in the
current tree and covered by targeted tests.

Medium confidence: the install channel and proof wrapper are correct because the
live verifier passed previously, but physical `hugh-main` evidence is still
absent in this workspace.

Not proven: real two-machine product readiness, Store readiness, and release
relay transport readiness.
