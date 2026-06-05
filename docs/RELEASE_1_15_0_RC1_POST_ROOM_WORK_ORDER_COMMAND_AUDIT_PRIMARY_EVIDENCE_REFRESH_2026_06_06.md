# MUSU 1.15.0-rc.1 Post Room Work-Order Command Audit Primary Evidence Refresh

Generated: 2026-06-06 06:00 KST

## Summary

After the room work-order command audit code change, clean go/no-go correctly
reset current-source runtime evidence. Fresh HUGH_SECOND primary evidence was
recorded again for the current commit chain.

This restores the primary-machine local runtime side of the release gate. It
does not close the real second-PC, hosted P2P, support mailbox, public metadata,
or Store release blockers.

## Evidence

- Single-machine smoke:
  `docs\evidence\single-machine\1.15.0-rc.1\20260606-053851-HUGH_SECOND.evidence.json`
- Single-machine verification:
  `docs\evidence\single-machine\1.15.0-rc.1\20260606-053851-HUGH_SECOND.verification.json`
- Single-machine summary:
  `docs\evidence\single-machine\1.15.0-rc.1\20260606-053851-HUGH_SECOND.summary.md`
- Desktop-open idle CPU:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260606-054220-HUGH_SECOND.desktop-open.evidence.json`
- Full runtime CPU scenario matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260606-054415-HUGH_SECOND.runtime-cpu-scenario-matrix.json`
- Full matrix verification:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260606-054415-HUGH_SECOND.verification.json`
- Targeted HUGH-MAIN post-route CPU diagnostic:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260606-055030-HUGH_SECOND.runtime-cpu-scenario-matrix.json`
- Targeted HUGH-MAIN verification:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260606-055030-HUGH_SECOND.target-route.verification.json`

## Results

- Packaged bridge remained healthy at `http://127.0.0.1:3622`.
- Single-machine smoke passed as `local-bridge-only`.
- CLI route smoke passed.
- Desktop shell was opened explicitly before idle CPU measurement so owned
  WebView2 evidence was present.
- Desktop-open idle CPU passed for `60.04s`.
- Desktop-open max one-core CPU:
  - MUSU `0`
  - Node `0`
  - WebView2 `0.08`
- Desktop-open hot process count: `0`.
- Full runtime matrix passed with `fail_count=0`.
- Full matrix route token:
  `MUSU_CPU_SCENARIO_ROUTE_OK_20260606_054415`.
- Targeted `HUGH-MAIN` post-route CPU diagnostic passed CPU verification with
  failed route allowed.
- The actual targeted route still timed out to
  `http://192.168.1.192:8949/api/tasks/delegate`; this is not real
  multi-device success evidence.

Operational note: `repair-packaged-local-runtime-state.ps1` was started with
`-StopRepoOrphanHelpers` and did not return output in the expected window, so
the wrapper process was terminated. A direct `musu doctor` check then confirmed
the packaged bridge was reachable, and a follow-up process attribution summary
showed process ownership passing before evidence capture continued.

## Clean Go/No-Go

Clean go/no-go after evidence commit `7f3879fc96de268a52cfac9b33601045ad453ee1`
with public metadata skipped:

- `ready_for_public_desktop_release=false`
- `local_artifacts_ready=true`
- `single_machine_verified=true`
- runtime idle CPU `1/2`
- runtime CPU scenario matrix `1/2`
- targeted second-PC route CPU `true`
- `operator_api_security_contract_verified=true`
- `p2p_control_plane_verified=false`
- `manifest_git.dirty=false`

Remaining blockers:

- real second-PC multi-device evidence
- second-PC desktop-open idle CPU evidence
- second-PC runtime CPU matrix evidence
- public metadata recheck without `-SkipPublicMetadata`
- `musu@musu.pro` support mailbox proof
- Partner Center / Store release proof
- live hosted MUSU.PRO P2P/relay control-plane proof

## Next Step

Run the current second-PC transfer kit on HUGH-MAIN or another Windows PC and
import the return zip. That is the only way to move runtime idle CPU and runtime
CPU matrix from `1/2` to `2/2` and replace the current HUGH-MAIN timeout
diagnostic with real multi-device route evidence.

