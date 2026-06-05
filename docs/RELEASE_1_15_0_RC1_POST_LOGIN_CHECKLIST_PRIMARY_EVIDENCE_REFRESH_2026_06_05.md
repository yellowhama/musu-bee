# Release 1.15.0-rc.1 - Post Login Checklist Primary Evidence Refresh

Date: 2026-06-05

## Summary

After removing the fixed localhost dashboard URL from the `musu login`
completion checklist, the local-sideload MSIX was rebuilt, reinstalled, and
fresh HUGH_SECOND packaged runtime evidence was recorded.

The installed local runtime remains local-bridge-only:

- `localhost:3001` is not required and may be connection-refused.
- The packaged bridge is the local executor.
- MUSU.PRO is the remote input/control-plane/workspace surface.

## Evidence

Single-machine smoke:

- `docs\evidence\single-machine\1.15.0-rc.1\20260605-161147-HUGH_SECOND.evidence.json`
- `dashboard_required=false`
- `single_machine_surface=local-bridge-only`
- bridge `http://127.0.0.1:13486`
- CLI route checked

Desktop-open idle CPU:

- `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260605-161246-HUGH_SECOND.desktop-open.evidence.json`
- `git_dirty=false`
- sample `60.05s`
- max role CPU: MUSU `0.03`, Node `0`, WebView2 `0.52`
- working set `365.56MB`
- hot process count `0`

Runtime CPU scenario matrix:

- `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260605-162127-HUGH_SECOND.runtime-cpu-scenario-matrix.json`
- `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260605-162127-HUGH_SECOND.verification.json`
- verifier `ok=true`, `fail_count=0`
- `git_dirty=false`
- route token `MUSU_CPU_SCENARIO_ROUTE_OK_20260605_162127`
- route task `a38d0adc-e760-4962-8303-f863c665124d`
- max role CPU: MUSU `0`, Node `0`, WebView2 `0.1`
- max working set `366.72MB`

## Go/No-Go

Clean go/no-go after the evidence commits reports:

- `ready_for_public_desktop_release=false`
- `local_artifacts_ready=true`
- `single_machine_verified=true`
- runtime idle CPU `1/2`
- runtime CPU scenario matrix `1/2`
- targeted second-PC route CPU matrix `0/1`
- `p2p_control_plane_verified=false`
- `manifest_git.dirty=false`

Remaining blockers:

- second-PC multi-device evidence
- second-PC idle CPU evidence
- second-PC runtime CPU scenario matrix evidence
- targeted second-PC route-attempt CPU sample
- hosted MUSU.PRO P2P release proof
- `musu@musu.pro` support mailbox delivery evidence
- Store/Microsoft submission/certification evidence

## Validation

Passed:

- release MSIX build/package/sign workflow
- installed package contract verification
- packaged runtime identity verification
- packaged runtime repair with after-process ownership OK
- single-machine smoke
- desktop-open idle CPU sample
- runtime CPU scenario matrix verifier
- clean go/no-go recomputation
