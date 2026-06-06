# 2026-06-06 Current Packaged Local Evidence Refresh

Current packaged MUSU Desktop local evidence was refreshed on `HUGH_SECOND`.

Evidence:

- single-machine:
  `docs\evidence\single-machine\1.15.0-rc.1\20260606-114258-HUGH_SECOND.evidence.json`
- desktop-open idle CPU:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260606-114621-HUGH_SECOND.desktop-open.evidence.json`
- full CPU matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260606-120547-HUGH_SECOND.runtime-cpu-scenario-matrix.json`
- targeted HUGH-MAIN diagnostic:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260606-121806-HUGH_SECOND.runtime-cpu-scenario-matrix.json`

Clean go/no-go on commit `168f4530ced1551eade17bb1c937dcaa0eed8ff7` reports:

- `single_machine_verified=true`
- `runtime_idle_cpu_valid_machine_count=1/2`
- `runtime_cpu_scenario_matrix_valid_machine_count=1/2`
- `runtime_cpu_second_pc_route_attempt_verified=true`
- `runtime_cpu_second_pc_route_attempt_valid_machine_count=1/1`
- `msix_current_legacy_conflicts_ok=true`
- `current_process_path_stale=true` diagnostic only
- `ready_for_public_desktop_release=false`

Remaining blockers:

- real second-PC multi-device evidence
- second-machine desktop-open idle CPU evidence
- second-machine full runtime CPU matrix evidence
- `musu@musu.pro` support mailbox evidence
- Microsoft Store/Partner Center evidence
- live `https://musu.pro` owner-scoped P2P control-plane and release relay
  transport proof

Product decision:

- MUSU Desktop remains the local executor.
- MUSU.PRO is remote input, project/company room, presence, rendezvous,
  path-selection, relay-fallback policy, and evidence/control plane.
- The localhost developer dashboard is optional and must not be required for
  packaged local runtime proof.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_CURRENT_PACKAGED_LOCAL_EVIDENCE_REFRESH_2026_06_06.md`

Next-step plan:

- `docs\plans\RELEASE_1_15_0_RC1_NEXT_STEPS_AFTER_CURRENT_PACKAGED_LOCAL_EVIDENCE_REFRESH_2026_06_06.md`
