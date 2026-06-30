# Current Packaged Local Evidence Refresh (2026-06-30)

## Verdict

MUSU remains **NO-GO** for the full product spec and for public desktop
release, but the current package-bound local evidence lanes are green again on
`HUGH_SECOND`.

Latest superseding refresh:

- `docs/REMOTE_FILE_CLI_POST_FIX_PACKAGE_EVIDENCE_REFRESH_2026_06_30.md`
- `generated_at`: `2026-06-30T20:41:01.8166825+09:00`
- `manifest_git.commit`: `fbb759ed5fd7891c6db274963c7d37fc830a7c44`
- `blockers=10`, `warnings=0`, `manifest_git.dirty=false`
- This post-fix refresh rebuilt/reinstalled the remote file CLI mesh-bearer fix
  and restored the local package-bound evidence lanes on `HUGH_SECOND`.

Clean go/no-go after this refresh:

- `generated_at`: `2026-06-30T19:19:32.5816741+09:00`
- `manifest_git.commit`: `0db4b39eff9d09d5b5947c55bf8b1d4fbd482b15`
- `manifest_git.dirty=false`
- `ready_for_public_desktop_release=false`
- `full_product_spec_ready=false`
- `blockers=10`
- `warnings=0`
- `single_machine_verified=true`
- `msix_install_verified=true`
- `runtime_idle_cpu_valid_machine_count=1/2 [HUGH_SECOND]`
- `runtime_cpu_scenario_matrix_valid_machine_count=1/2 [HUGH_SECOND]`
- `runtime_cpu_second_pc_route_attempt_valid_machine_count=1/1 [HUGH_SECOND]`
- `public_metadata_ok=false`

## What Changed

The packaged sidecar pin was refreshed to the current clean
`F:\musu_2nd_brain` repository state:

- module path: `github.com/yellowhama/musu-brain`
- brain commit: `1416969c976b9edcd905c287fa70ab3221297305`
- brain commit time: `2026-06-30T18:04:37+09:00`

`scripts/windows/build-msix.ps1 -PreflightOnly` now accepts that pin, and the
full local sideload package rebuild completed with version coherence intact:

- version: `1.15.0-rc.22`
- package version: `1.15.0.22`
- installed package: `blossompark.musu_1.15.0.22_x64__f5h38pf4yt4gc`
- artifact: `.local-build/msix/output/musu_1.15.0.22_x64_local-sideload-manual.msix`
- hosted local copy: `.local-build/msix/output/musu-desktop-x64.msix`

The build produced warnings only:

- Rust release relay tunnel placeholder items in `musu-rs/src/bridge/rendezvous.rs`
  are intentionally unused until the real release tunnel runtime is implemented.
- Tauri desktop reports one `unused_mut` warning in `src/lib.rs`.

## Evidence Recorded

Current package/install/local smoke evidence:

- `docs/evidence/msix-install/1.15.0-rc.22/20260630-190259-HUGH_SECOND.evidence.json`
- `docs/evidence/single-machine/1.15.0-rc.22/20260630-190553-HUGH_SECOND.evidence.json`
- `docs/evidence/process-ownership/1.15.0-rc.22/20260630-190627-HUGH_SECOND.process-ownership.json`
- `docs/evidence/startup-single-instance/1.15.0-rc.22/20260630-190639-HUGH_SECOND.startup-single-instance.json`
- `docs/evidence/desktop-single-instance/1.15.0-rc.22/20260630-190659-HUGH_SECOND.desktop-single-instance.json`

Current CPU evidence:

- `docs/evidence/runtime-idle-cpu/1.15.0-rc.22/20260630-190831-HUGH_SECOND.desktop-open.evidence.json`
- `docs/evidence/runtime-cpu-scenarios/1.15.0-rc.22/20260630-191000-HUGH_SECOND.runtime-cpu-scenario-matrix.json`
- `docs/evidence/runtime-cpu-scenarios/1.15.0-rc.22/20260630-191000-HUGH_SECOND.runtime-cpu-scenario-matrix.verification.json`
- `docs/evidence/runtime-cpu-scenarios/1.15.0-rc.22/20260630-191000-HUGH_SECOND.target-route.verification.json`

Notable CPU facts:

- desktop-open idle CPU: `ok=true`, `git_dirty=false`, `60.03s`, hot process
  count `0`, owned WebView2 required and present.
- full matrix: `ok=true`, `git_dirty=false`, all five scenarios present:
  `startup-open`, `runtime-started`, `dashboard-open`, `desktop-open`,
  `post-route`.
- targeted route-attempt CPU proof targets `hugh-main`, not self/local.
- the `hugh-main` post-route probe succeeded and returned the expected token
  `MUSU_CPU_SCENARIO_ROUTE_OK_20260630_191000`.

## Qualitative Audit

| Severity | Finding | Evidence | Impact | Next |
|---|---|---|---|---|
| NO-GO | Full product spec is still incomplete. | go/no-go blockers remain `10`. | Do not claim product completion or public release readiness. | Work the remaining physical/external gates. |
| NO-GO | Runtime CPU evidence is only one-machine complete. | `runtime_idle_cpu_valid_machine_count=1/2`, `runtime_cpu_scenario_matrix_valid_machine_count=1/2`. | HUGH_SECOND is healthy, but release requires the second physical PC too. | Run/import the same CPU evidence on `hugh-main`. |
| NO-GO | Public metadata is currently failing at the apex DNS/TLS path. | `store-public-metadata` blocker: Cloudflare nameservers, apex TLS failure, privacy/support/public-config request failures. | Store/public release metadata cannot be claimed ready. | Repair DNS/TLS or align verifier with chosen DNS authority, then rerun public metadata verification. |
| NO-GO | Direct LAN route works, but the route is not release-grade transport proof. | Route explain selects `192.168.1.192:4387`, `current_transport=http_bearer`, `peer_identity_verified=false`, `encryption=none_http_bearer`. | Good for targetability and CPU route-attempt evidence; insufficient for release-grade multi-device identity/transport. | Implement/prove QUIC/TLS or the accepted release-grade transport path. |
| NO-GO | Relay transport remains display/control-plane only. | `relay-transport` and `p2p-control-plane` blockers remain. | Relay cannot be advertised as delegated-work transport. | Implement `quic_relay_tunnel`, storage/env, route metadata/proof, and delivery proof. |
| HIGH | Private Mesh packaged proof is still not recorded. | `private-mesh-packaged-release-proof` blocker remains. | The packaged desktop private mesh claim is unproven. | Run the second-PC return/import and final packaged desktop proof archive. |
| HIGH | V34 stale self-heal is source-gated but not physically proven. | `v34-stale-self-heal` blocker remains. | Stale registry/cache/manual-peer behavior cannot be claimed release-complete. | Record physical stale-state TTL, boot reconcile, and route preflight proof. |
| MED | Build warnings are known and non-blocking, but should not be ignored indefinitely. | MSIX build warnings in relay placeholder code and Tauri `unused_mut`. | No current release gate failure, but noise can hide real warnings later. | Clean up after relay runtime lane stabilizes, or track in a warning-debt issue. |

## Code Audit

Focused code audit scope for this refresh:

- The only functional code/config delta in this evidence lane is
  `musu-bee/src-tauri/musu-brain.pin.json`, which now points at the current clean
  `github.com/yellowhama/musu-brain` commit.
- No Rust, TypeScript, JavaScript, or Go source behavior was changed in the
  documentation refresh commits.
- No secret/token value was added; the pin records public module and VCS
  metadata only.
- Version coherence preflight and the full local-sideload MSIX rebuild both
  passed after the pin update, so the package can still assemble with the
  hidden brain sidecar contract intact.
- The remaining code-level release risks are not introduced by this refresh:
  relay runtime is still placeholder/non-release transport, direct LAN route
  proof still uses non-encrypted `http_bearer`, and build warning debt remains
  visible.

## Remaining Blockers

Clean go/no-go reports exactly these blocker areas:

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

- The current hidden brain sidecar contract is now pinned to the latest clean
  Go knowledge-engine commit. The chip remains external/unchanged; MUSU owns
  packaging, lifecycle, data-root decision, and product proof.
- The package-local HUGH_SECOND runtime is healthy under packaged desktop use:
  no hot process, no duplicate startup bridge, no duplicate desktop shell, no
  repo/dev runtime contamination.
- The `hugh-main` route is work-targetable over LAN for the current installed
  package, but it is explicitly not release-grade encrypted/identity-verified
  transport. This distinction remains part of the product spec: targetability
  evidence is not the same as release-grade route transport proof.
- The hosted public metadata lane is currently red due DNS/TLS/request failure.
  This is now a live external blocker again, not merely stale documentation.

## Next Steps

1. Run/import `hugh-main` CPU evidence for `runtime-idle-cpu` and full
   `runtime-cpu-scenarios` so both machine-count gates can reach `2/2`.
2. Repair `https://musu.pro` apex DNS/TLS/public-config/privacy/support
   verification, then rerun `verify-store-public-metadata.ps1`.
3. Complete the second-PC return flow and package Private Mesh proof archive.
4. Implement/prove release-grade route transport and relay tunnel runtime,
   including transport proof and payload delivery proof.
5. Record explicit design approval evidence and Store/Partner Center evidence.
6. Record V34 stale self-heal physical evidence.
