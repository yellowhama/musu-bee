# 2026-06-02 07:46 KST - Second-PC Import Release-Gate Requirement

`scripts\windows\import-second-pc-return.ps1` now supports
`-RequireReleaseGateEvidence`.

Why:

- The 2026-05-31 `HUGH-MAIN` return archive imported successfully but only
  contained MSIX install evidence and handoff JSON.
- That was useful diagnostically, but it could not close the release runtime
  gates because it had no runtime idle CPU evidence, no runtime CPU scenario
  matrix, no process attribution summary, and no release-check JSON.

Behavior:

- Default import remains backward-compatible: it can import old/MSIX-only return
  archives for diagnosis and reports `release_gate_evidence_ok=false`.
- Release import should use `-RequireReleaseGateEvidence`; the command exits 1
  and returns JSON `ok=false` if required evidence is missing or the release
  check says runtime CPU, matrix, process attribution, or return zip failed.

Validation:

- Running the new flag against
  `F:\Aisaak\Projects\localsend\second-pc-return\20260531-165240-HUGH-MAIN.second-pc-return.zip`
  correctly failed with issues:
  `missing_runtime_idle_cpu_evidence`,
  `missing_runtime_cpu_scenario_matrix`,
  `missing_process_attribution_summary`, and
  `missing_second_pc_release_check`.
- Running the same import without the flag still returned `ok=true` while
  surfacing the same release-gate evidence issues.

Operator flow:

- Final packet and operator action-pack templates now use
  `-RequireReleaseGateEvidence` for release imports.
- The second-PC runbook explicitly says release import fails if runtime idle
  CPU, matrix, release-check, or process attribution evidence is missing.
