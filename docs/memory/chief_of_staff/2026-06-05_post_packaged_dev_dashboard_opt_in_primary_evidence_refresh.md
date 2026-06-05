# 2026-06-05 Post Packaged Dev Dashboard Opt-In Primary Evidence Refresh

After `1eb4fe1a` disabled the packaged desktop dev dashboard surface by default, current-source packaged evidence was stale.

Actions:

- Rebuilt and reinstalled the local-sideload MSIX with `run-msix-workflow.ps1`.
- Repaired packaged local runtime state with `repair-packaged-local-runtime-state.ps1 -StopRepoOrphanHelpers`.
- Recorded bridge-only single-machine evidence.
- Recorded clean desktop-open idle CPU evidence.
- Recorded clean five-scenario runtime CPU matrix evidence.

Important evidence:

- Package installed as `Yellowhama.MUSU_1.15.0.0_x64__ygcjq669as2b6`.
- Runtime repair bridge: `http://127.0.0.1:9422`, `dashboard.required=false`.
- Single-machine evidence: `docs\evidence\single-machine\1.15.0-rc.1\20260605-141236-HUGH_SECOND.evidence.json`.
- Idle CPU evidence: `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260605-141514-HUGH_SECOND.desktop-open.evidence.json`, max WebView2 `0.21`, MUSU `0`, Node `0`.
- Runtime matrix evidence: `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260605-141700-HUGH_SECOND.runtime-cpu-scenario-matrix.json`, max WebView2 `0.26`, route token `MUSU_CPU_SCENARIO_ROUTE_OK_20260605_141700`.

Clean go/no-go after `8102191f` restored `single_machine_verified=true`, runtime idle CPU `1/2`, runtime CPU matrix `1/2`, and `manifest_git.dirty=false`.

Public release remains No-Go on second-PC, hosted P2P, support mailbox, and Store gates.
