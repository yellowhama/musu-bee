# MUSU 1.15.0-rc.1 Current HEAD Packaged Local Evidence After Relay Proof Hardening

**Wiki ID**: wiki/839
**Date**: 2026-06-06

## Summary

Current HEAD `83e8bd415432529474930bcf54c6408847c0ad24` was rebuilt into the
local-sideload MSIX, reinstalled, and refreshed on `HUGH_SECOND` after relay
proof hardening changed Rust/runtime source.

The one-machine result is healthy:

- MSIX package installed and verified as `Yellowhama.MUSU_1.15.0.0_x64__ygcjq669as2b6`
- single-machine smoke passes as `local-bridge-only`
- desktop-open idle CPU passes for 60 seconds with no hot process
- five-scenario runtime CPU matrix passes with successful local post-route
  probe
- targeted `HUGH-MAIN` failed-route CPU diagnostic passes as an allowed failed
  target route attempt

This restores current primary-machine evidence to `1/2 [HUGH_SECOND]`. Public
release remains No-Go until a real second Windows PC, hosted MUSU.PRO P2P proof,
support mailbox proof, and Store evidence are recorded.

## Evidence

MSIX install:

- evidence:
  `docs\evidence\msix-install\1.15.0-rc.1\20260606-141418-HUGH_SECOND.evidence.json`
- verification:
  `docs\evidence\msix-install\1.15.0-rc.1\20260606-141418-HUGH_SECOND.verification.json`
- startup contract: `local-sideload-manual`
- alias shadowing mode: `warn-explicit-windowsapps`
- alias shadowing accepted: `true`

Single-machine packaged local runtime:

- evidence:
  `docs\evidence\single-machine\1.15.0-rc.1\20260606-140158-HUGH_SECOND.evidence.json`
- verification:
  `docs\evidence\single-machine\1.15.0-rc.1\20260606-140158-HUGH_SECOND.verification.json`
- result: `ok=true`
- bridge: `http://127.0.0.1:8179`
- dashboard required: `false`
- surface: `local-bridge-only`
- CLI route checked: `true`

Desktop-open idle CPU:

- evidence:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260606-140222-HUGH_SECOND.desktop-open.evidence.json`
- result: `ok=true`
- `git_dirty=false`
- sample: `60.038s`
- process counts: MUSU `2`, Node `0`, WebView2 `6`, other `0`
- subroles: `bridge_runtime=1`, `desktop_shell=1`, `webview2_helper=6`
- max one-core CPU: MUSU `0`, Node `0`, WebView2 `0.16`, other `0`
- working set after sample: `372.87MB`
- hot process count: `0`

Full runtime CPU scenario matrix:

- matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260606-140335-HUGH_SECOND.runtime-cpu-scenario-matrix.json`
- verification:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260606-140335-HUGH_SECOND.verification.json`
- verifier result: `ok=true`, `fail_count=0`
- scenarios: `startup-open`, `runtime-started`, `dashboard-open`,
  `desktop-open`, `post-route`
- route token: `MUSU_CPU_SCENARIO_ROUTE_OK_20260606_140335`
- route task: `041f5d11-e26c-4122-bb86-4c9b687848a5`
- max observed WebView2 CPU: `0.13`

Targeted HUGH-MAIN route CPU diagnostic:

- matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260606-140947-HUGH_SECOND.runtime-cpu-scenario-matrix.json`
- verification:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260606-140947-HUGH_SECOND.target-route.verification.json`
- verifier result: `ok=true`, `fail_count=0`
- target: `HUGH-MAIN`
- route wait timeout: `30s`
- route result: `ok=false`, `failure_allowed=true`
- failure: request to `http://192.168.1.192:8949/api/tasks/delegate` timed out
- post-route CPU: MUSU `0`, Node `0`, WebView2 `0.05`
- post-route working set: `367.38MB`
- hot process count: `0`

The targeted HUGH-MAIN diagnostic is not successful two-machine route proof. It
only proves that this local runtime stays idle-budget-safe after a targeted
route attempt to the known second-PC address fails.

## Go/No-Go Snapshot

Dirty worktree go/no-go before committing this evidence reported:

- `ready_for_public_desktop_release=false`
- `single_machine_verified=true`
- `runtime_idle_cpu_valid_machine_count=1/2 [HUGH_SECOND]`
- `runtime_cpu_scenario_matrix_valid_machine_count=1/2 [HUGH_SECOND]`
- `runtime_cpu_second_pc_route_attempt_verified=true`
- `runtime_cpu_second_pc_route_attempt_valid_machine_count=1/1`
- `process_ownership_verified=true`
- `startup_single_instance_verified=true`
- `desktop_single_instance_verified=true`
- `idle_busy_loop_candidate_contract_verified=true`
- `p2p_store_forward_relay_contract_verified=true`

Expected pre-commit blocker:

- `git`: evidence/docs are uncommitted until this report is committed

Remaining release blockers:

- `multi-device`: real second-PC multi-device evidence has not been recorded
- `runtime-idle-cpu`: needs valid desktop-open CPU evidence on two machines
- `runtime-cpu-scenario-matrix`: needs full successful matrix on two machines
- `support-mailbox`: `musu@musu.pro` delivery is not operator-verified
- `store-release`: Partner Center/certification/restricted capability evidence
  is not recorded
- `p2p-control-plane`: live `https://musu.pro` release relay proof remains
  incomplete

## Qualitative Evaluation

No high or medium issue was found in the current packaged local runtime
evidence.

The earlier 20% idle CPU concern is not reproduced on `HUGH_SECOND` with this
current packaged build. The desktop-open sample shows no hot process, WebView2
max one-core CPU of `0.16`, and no owned Node helper. Process ownership stays
within the intended shape: one bridge runtime, one desktop shell, six WebView2
helpers, and zero orphan repo helpers.

The risk that remains is external proof, not local runtime viability on this
machine. The next release-critical step is still to run the same installed
current build on a real second PC and import its route/CPU/matrix evidence.

## Product Boundary

The product boundary remains unchanged:

- MUSU Desktop is the local executor and resource owner.
- MUSU.PRO is remote input, project/company room, rendezvous, path-selection,
  relay-fallback policy, and evidence/control plane.
- `localhost:3001` is not required for packaged local runtime evidence.
- Hosted relay remains fallback-only and cannot satisfy release proof until
  real `quic_relay_tunnel` transport and payload delivery proof exist.

## Next Step Document

- `docs\plans\RELEASE_1_15_0_RC1_NEXT_STEPS_AFTER_CURRENT_HEAD_PACKAGED_LOCAL_EVIDENCE_AFTER_RELAY_PROOF_HARDENING_2026_06_06.md`
