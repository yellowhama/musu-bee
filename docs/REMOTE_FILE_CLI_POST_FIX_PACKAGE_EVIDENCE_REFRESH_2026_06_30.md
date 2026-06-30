# Remote File CLI Post-Fix Package Evidence Refresh (2026-06-30)

## Verdict

MUSU remains **NO-GO** for the full product spec and public desktop release.

The remote file CLI mesh-bearer source fix has now been rebuilt into the
current local sideload package on `HUGH_SECOND`, installed, and re-proven for
the local package-bound gates. This restores the package freshness lanes that
were intentionally reopened by the Rust source change.

Clean go/no-go after the post-fix package evidence commit:

- `generated_at`: `2026-06-30T20:41:01.8166825+09:00`
- `manifest_git.commit`: `fbb759ed5fd7891c6db274963c7d37fc830a7c44`
- `manifest_git.dirty=false`
- `ready_for_public_desktop_release=false`
- `full_product_spec_ready=false`
- `blockers=10`
- `warnings=0`
- `single_machine_verified=true`
- `msix_install_verified=true`
- `process_ownership_verified=true`
- `startup_single_instance_verified=true`
- `desktop_single_instance_verified=true`
- `runtime_idle_cpu_valid_machine_count=1/2 [HUGH_SECOND]`
- `runtime_cpu_scenario_matrix_valid_machine_count=1/2 [HUGH_SECOND]`
- `runtime_cpu_second_pc_route_attempt_valid_machine_count=1/1 [HUGH_SECOND]`
- `public_metadata_ok=false`
- `p2p_control_plane_verified=false`
- `relay_transport_product_verified=false`

## What Changed

The source-level fix from `docs/REMOTE_FILE_CLI_MESH_BEARER_FIX_2026_06_30.md`
is now package-bound on `HUGH_SECOND`:

- `musu-rs/src/install/cli_commands.rs` uses
  `get_outbound_peer_token(&home)` for `run_ls`, `run_get`, and `run_put`.
- A full local-sideload MSIX rebuild succeeded with `VERSION=1.15.0-rc.22`.
- The installed package is
  `blossompark.musu_1.15.0.22_x64__f5h38pf4yt4gc`.
- The local package was repaired and verified as package-owned, not repo/dev
  runtime-owned.

The build produced warnings only:

- release relay tunnel placeholder items in `musu-rs/src/bridge/rendezvous.rs`
  remain intentionally unused until the real release tunnel runtime exists.
- Tauri desktop still reports one `unused_mut` warning in `src/lib.rs`.

## Evidence Recorded

Current package/install/local smoke evidence:

- `docs/evidence/msix-install/1.15.0-rc.22/20260630-202448-HUGH_SECOND.evidence.json`
- `docs/evidence/single-machine/1.15.0-rc.22/20260630-202515-HUGH_SECOND.evidence.json`
- `docs/evidence/process-ownership/1.15.0-rc.22/20260630-202444-HUGH_SECOND.process-ownership.json`
- `docs/evidence/startup-single-instance/1.15.0-rc.22/20260630-202444-HUGH_SECOND.startup-single-instance.json`
- `docs/evidence/desktop-single-instance/1.15.0-rc.22/20260630-202444-HUGH_SECOND.desktop-single-instance.json`

Current CPU evidence:

- `docs/evidence/runtime-idle-cpu/1.15.0-rc.22/20260630-202444-HUGH_SECOND.desktop-open.evidence.json`
- `docs/evidence/runtime-cpu-scenarios/1.15.0-rc.22/20260630-202916-HUGH_SECOND.runtime-cpu-scenario-matrix.json`
- `docs/evidence/runtime-cpu-scenarios/1.15.0-rc.22/20260630-202916-HUGH_SECOND.runtime-cpu-scenario-matrix.verification.json`
- `docs/evidence/runtime-cpu-scenarios/1.15.0-rc.22/20260630-202916-HUGH_SECOND.target-route.verification.json`

Notable CPU facts:

- `desktop-open` idle CPU: `ok=true`, `git_dirty=false`, `60.022s`, hot
  process count `0`, owned WebView2 required.
- full matrix: `ok=true`, `git_dirty=false`, five scenarios present:
  `startup-open`, `runtime-started`, `dashboard-open`, `desktop-open`,
  `post-route`.
- all five matrix scenarios recorded hot process count `0`.
- targeted post-route probe targets `hugh-main`, not self/local.
- route candidate is `192.168.1.192:4387`, `route_kind=lan`.
- route probe returned `MUSU_CPU_SCENARIO_ROUTE_OK_20260630_202916`.

## Findings

| Severity | Issue | Evidence | Impact | Next |
|---|---|---|---|---|
| NO-GO | Full product spec remains incomplete. | Clean go/no-go still reports `full_product_spec_ready=false`, `ready_for_public_desktop_release=false`, and `blockers=10`. | Do not claim full product completion or public release readiness. | Work the remaining physical/external gates. |
| NO-GO | CPU evidence is one-machine complete only. | `runtime_idle_cpu_valid_machine_count=1/2`, `runtime_cpu_scenario_matrix_valid_machine_count=1/2`. | `HUGH_SECOND` is healthy, but release requires the second physical PC too. | Run/import the same evidence on `hugh-main`. |
| NO-GO | Direct route targetability is proven, but not release-grade transport. | Matrix route explain selected LAN with `peer_identity_verified=false` and `encryption=none_http_bearer`. | Good for targetability and CPU route-attempt evidence; insufficient for release-grade identity/encryption. | Implement/prove the accepted QUIC/TLS or release-grade transport path. |
| NO-GO | Public metadata is failing at canonical `https://musu.pro`. | go/no-go `store-public-metadata` blocker reports request failures, Cloudflare nameserver mismatch, apex TLS failure, and public-config missing fields. | Store/public release metadata cannot be called ready. | Repair DNS/TLS/public metadata and rerun verifier. |
| NO-GO | Relay transport remains unimplemented as delegated-work byte transport. | `p2p_control_plane_verified=false`, `relay_transport_product_verified=false`. | Relay may not be advertised as a completed work route. | Implement `quic_relay_tunnel`, storage/env, route proof, transport proof, and payload delivery proof. |
| HIGH | Private Mesh packaged release proof is still missing. | `private-mesh-packaged-release-proof` blocker remains. | Packaged desktop Private Mesh claim remains unproven. | Run second-PC return/import and package release-proof archive. |
| HIGH | V34 stale self-heal is not physically proven. | `v34-stale-self-heal` blocker remains. | Stale registry/cache/manual-peer recovery cannot be claimed release-complete. | Record physical stale-state TTL, reconcile, and route-preflight proof. |

## Code Audit

Focused code audit result for this refresh:

- The earlier source bug was real: route commands used outbound mesh bearer
  selection, but remote file commands could send the local bridge token.
- The fix aligns remote file CLI token selection with route submission without
  changing the release-grade transport claim.
- Targeted source tests already passed before packaging:
  `remote_file_token` (`3/3`), `remote_route_token` (`3/3`), and
  `git diff --check`.
- Rebuild/install evidence now proves the fixed source can still assemble and
  run as the current package on `HUGH_SECOND`.
- No secret value was added to docs or evidence.

Remaining code/product risks:

- real `musu ls/get/put` evidence still must be captured after the fixed
  package is installed on both PCs.
- direct LAN uses legacy HTTP bearer and unverified peer identity.
- release relay tunnel runtime is still intentionally absent.
- public metadata/DNS/TLS is an external deployment blocker, not a local code
  proof.

## Remaining Blockers

Clean go/no-go reports these blocker areas:

- `multi-device`
- `private-mesh-packaged-release-proof`
- `runtime-idle-cpu`
- `runtime-cpu-scenario-matrix`
- `store-public-metadata`
- `store-release`
- `p2p-control-plane`
- `design-approval`
- `relay-transport`
- `v34-stale-self-heal`

## Product Spec Updates

- Package freshness is restored after the remote file CLI source fix on
  `HUGH_SECOND`.
- `HUGH_SECOND` local packaged runtime is healthy: package-owned bridge,
  no duplicate startup bridge, no duplicate desktop shell, no hot CPU process,
  and no repo/dev runtime contamination.
- Sibling route targetability to `hugh-main` is proven for the current package
  as a LAN work route, but the transport is explicitly not release-grade.
- File CLI sibling behavior is now source-correct and package-built locally,
  but the product spec should not count it complete until real
  `musu ls/get/put` proof is captured after both PCs install the fixed package.
- The live public site lane is red: canonical `https://musu.pro` privacy,
  support, and public-config verification fails through the current DNS/TLS
  path.

## Next Steps

1. Install the fixed package on `hugh-main`, then capture real
   `musu ls/get/put` proof from `HUGH_SECOND` to `hugh-main`.
2. Run/import `hugh-main` `desktop-open` idle CPU and full runtime CPU matrix
   evidence so the 2-machine CPU gates can close.
3. Complete the second-PC return/import path and packaged Private Mesh release
   proof archive.
4. Repair `https://musu.pro` apex DNS/TLS/public metadata and rerun the public
   metadata verifier.
5. Implement/prove release-grade direct/relay transport, including route
   transport proof and relay payload delivery proof.
6. Record explicit design approval, Store/Partner Center evidence, and V34
   stale self-heal physical evidence.
