# 2026-06-05 Post P2P Candidate Metadata Primary Evidence Refresh

After `9be40bc4` changed web/P2P source, release handoff required fresh
current-source primary evidence.

Actions completed:

- rebuilt/reinstalled the local-sideload MSIX for `1.15.0-rc.1`
- captured single-machine smoke evidence:
  `docs\evidence\single-machine\1.15.0-rc.1\20260605-082350-HUGH_SECOND.evidence.json`
- captured desktop-open idle CPU evidence:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260605-082546-HUGH_SECOND.desktop-open.evidence.json`
- captured CPU scenario matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260605-082656-HUGH_SECOND.runtime-cpu-scenario-matrix.json`
- saved matrix verification:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260605-082656-HUGH_SECOND.verification.json`

Results:

- smoke: `dashboard_required=false`, `single_machine_surface=local-bridge-only`,
  bridge `http://127.0.0.1:10518`
- idle CPU: `60.058s`, MUSU `0.05`, Node `0`, WebView2 `0.73`, working set
  `365.65MB`, hot `0`
- matrix: verifier `ok=true`, `fail_count=0`, route token
  `MUSU_CPU_SCENARIO_ROUTE_OK_20260605_082656`, max role CPU MUSU `0.03`,
  Node `0`, WebView2 `0.39`

MSIX note: strict MSIX evidence capture still fails in the current shell because
`C:\Users\empty\.cargo\bin\musu.exe` shadows the WindowsApps alias in PATH.
The package rebuild/reinstall and installed package verification passed, and a
`warn-explicit-windowsapps` capture exists in `.local-build`, but it was not
promoted to docs evidence because final go/no-go verifies strict MSIX evidence.

Final handoff after the evidence refresh had `blocker_count=7`; single-machine
was no longer a blocker. Remaining blockers are second-PC multi-device,
second-PC CPU/matrix, support mailbox, Store/Microsoft, hosted `musu.pro` P2P,
and dirty git until this evidence/report commit lands.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_POST_P2P_CANDIDATE_ENDPOINT_METADATA_PRIMARY_EVIDENCE_REFRESH_2026_06_05.md`
