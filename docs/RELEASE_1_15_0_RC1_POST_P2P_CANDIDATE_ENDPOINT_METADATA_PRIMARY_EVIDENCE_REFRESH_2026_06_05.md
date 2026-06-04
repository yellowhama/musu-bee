# RC1 Post P2P Candidate Metadata Primary Evidence Refresh

Date: 2026-06-05

## Summary

After commit `9be40bc4` preserved P2P candidate endpoint metadata through
`musu.pro` room presence and rendezvous flows, the primary-machine packaged
runtime evidence was refreshed on `HUGH_SECOND`.

This confirms the new source still supports the local-program / web-control
split:

- installed MUSU local runtime is the executor
- `musu.pro` is remote input, project room, presence, rendezvous, path
  selection, relay-fallback policy, and evidence
- `localhost:3001/app` remains an optional workspace dashboard
- packaged runtime evidence uses the WindowsApps `musu.exe` path and
  bridge-only local surface

## Evidence

Single-machine smoke:

- `docs\evidence\single-machine\1.15.0-rc.1\20260605-082350-HUGH_SECOND.evidence.json`
- `dashboard_required=false`
- `single_machine_surface=local-bridge-only`
- bridge: `http://127.0.0.1:10518`
- CLI route smoke checked

Runtime idle CPU:

- `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260605-082546-HUGH_SECOND.desktop-open.evidence.json`
- `ok=true`
- sample: `60.058s`
- max CPU by role: MUSU `0.05`, Node `0`, WebView2 `0.73`
- working set: `365.65MB`
- hot process count: `0`

Runtime CPU scenario matrix:

- `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260605-082656-HUGH_SECOND.runtime-cpu-scenario-matrix.json`
- verification:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260605-082656-HUGH_SECOND.verification.json`
- `ok=true`, `fail_count=0`
- route token: `MUSU_CPU_SCENARIO_ROUTE_OK_20260605_082656`
- route task: `3b2b0137-e3ee-4548-ad45-cb33228d89a9`
- max scenario CPU by role: MUSU `0.03`, Node `0`, WebView2 `0.39`
- max working set: `367.52MB`
- `dashboard-open` measured packaged runtime state because no dashboard URL was
  exposed

MSIX note:

- the MSIX was rebuilt/reinstalled and packaged-state verification passed
- strict MSIX evidence capture is still blocked by the local PATH shadow
  `C:\Users\empty\.cargo\bin\musu.exe`
- `warn-explicit-windowsapps` MSIX evidence was captured under `.local-build`
  only; it was not promoted to `docs\evidence` because final go/no-go verifies
  MSIX install evidence in strict mode

## Current Handoff

After the refreshed evidence, `show-final-release-handoff-status.ps1 -Json`
reports `ready_for_public_desktop_release=false` with the single-machine
blocker removed. Remaining blockers:

- multi-device evidence
- second-machine runtime idle CPU evidence
- second-machine runtime CPU scenario matrix evidence
- support mailbox evidence
- Store/Microsoft evidence
- hosted `musu.pro` P2P release proof
- dirty git until this evidence/report commit is made

This restores one-machine evidence only. The release remains blocked until a
second Windows PC runs this current build and hosted P2P release evidence is
recorded.
