# 2026-06-05 Post Room Presence Candidate Metadata Primary Evidence Refresh

## DEBUG REPORT

- Trigger: `b6329f0d` changed Rust room presence publishing, so previous
  packaged local-runtime evidence was no longer current for release handoff.
- Build/install: release MSIX build/install/packaged-state verification passed.
  Packaged runtime repair passed through the WindowsApps alias and started the
  bridge at `http://127.0.0.1:10325` with `dashboard.required=false`.
- Caveat: strict MSIX install evidence capture still failed because
  `C:\Users\empty\.cargo\bin\musu.exe` shadows
  `C:\Users\empty\AppData\Local\Microsoft\WindowsApps\musu.exe`.
- Single-machine evidence:
  `docs\evidence\single-machine\1.15.0-rc.1\20260605-092924-HUGH_SECOND.evidence.json`
  passed with `single_machine_surface=local-bridge-only` and CLI route checked.
- Idle CPU evidence:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260605-093206-HUGH_SECOND.desktop-open.evidence.json`
  passed for `60.053s` with MUSU `0`, Node `0`, WebView2 `0.44`,
  working set `364.26MB`, and hot `0`.
- Runtime CPU matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260605-094033-HUGH_SECOND.runtime-cpu-scenario-matrix.json`
  passed verifier `ok=true`/`fail_count=0`; route token
  `MUSU_CPU_SCENARIO_ROUTE_OK_20260605_094033`; route task
  `6b7e1ccc-97c1-466f-9354-fedd3ef3583d`; max role CPU MUSU `0.05`, Node `0`,
  WebView2 `0.16`; max working set `366.33MB`.
- Product boundary: `dashboard-open` measured packaged runtime state because
  no dashboard URL was exposed; `localhost:3001` remains optional.
- Status: DONE_WITH_CONCERNS. Current one-machine evidence is restored, but
  public release still needs second-PC, hosted P2P release proof, support
  mailbox, and Store evidence.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_POST_ROOM_PRESENCE_CANDIDATE_METADATA_PRIMARY_EVIDENCE_REFRESH_2026_06_05.md`
