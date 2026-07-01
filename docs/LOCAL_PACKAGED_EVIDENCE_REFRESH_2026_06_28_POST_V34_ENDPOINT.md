# Local Packaged Evidence Refresh After V34 Endpoint Hardening (2026-06-28)

## Status

This is a local evidence freshness refresh, not a full product completion claim.

The V34 endpoint validation hardening changed release verifier/source scripts,
which correctly reopened local current-package evidence freshness gates. The
current HUGH_SECOND packaged `1.15.0-rc.22` install was rechecked and the local
lanes are green again.

## Evidence

- Single-machine smoke:
  `docs/evidence/single-machine/1.15.0-rc.22/20260628-184155-HUGH_SECOND.evidence.json`
- Single-machine verification:
  `docs/evidence/single-machine/1.15.0-rc.22/20260628-184155-HUGH_SECOND.verification.json`
- Single-machine summary:
  `docs/evidence/single-machine/1.15.0-rc.22/20260628-184155-HUGH_SECOND.summary.md`
- Process ownership:
  `docs/evidence/process-ownership/1.15.0-rc.22/20260628-184214-HUGH_SECOND.process-ownership.json`
- Startup single-instance:
  `docs/evidence/startup-single-instance/1.15.0-rc.22/20260628-184214-HUGH_SECOND.startup-single-instance.json`
- Nested startup process ownership:
  `docs/evidence/startup-single-instance/1.15.0-rc.22/20260628-184214-HUGH_SECOND.startup-single-instance.process-ownership.json`
- Desktop repeated activation:
  `docs/evidence/desktop-single-instance/1.15.0-rc.22/20260628-185307-HUGH_SECOND.desktop-single-instance.json`
- Desktop-open idle CPU:
  `docs/evidence/runtime-idle-cpu/1.15.0-rc.22/20260628-184508-HUGH_SECOND.desktop-open.evidence.json`
- Full runtime CPU matrix:
  `docs/evidence/runtime-cpu-scenarios/1.15.0-rc.22/20260628-184627-HUGH_SECOND.runtime-cpu-scenario-matrix.json`
- Runtime CPU matrix verification:
  `docs/evidence/runtime-cpu-scenarios/1.15.0-rc.22/20260628-184627-HUGH_SECOND.runtime-cpu-scenario-matrix.verification.json`

## Verification

- Single-machine smoke: `ok=true`, packaged WindowsApps `musu.exe`,
  `single_machine_surface=local-bridge-only`, CLI route checked.
- Process ownership: `ok=true`, `fail_count=0`, one packaged bridge runtime,
  one packaged desktop shell, no repo-related runtime.
- Startup single-instance: `ok=true`, `fail_count=0`, repeated startup reused
  bridge PID `33504`.
- Desktop repeated activation: `ok=true`, `fail_count=0`, `git_dirty=false`,
  repeated activation kept one desktop shell PID `4360`.
- Desktop-open idle CPU: `ok=true`, `git_dirty=false`, `sample_seconds=60.022`,
  no hot MUSU processes.
- Runtime CPU matrix: `ok=true`, `git_dirty=false`, scenarios
  `startup-open`, `runtime-started`, `dashboard-open`, `desktop-open`, and
  `post-route` passed.
- Matrix route probe targeted `hugh-main` and bound token
  `MUSU_CPU_SCENARIO_ROUTE_OK_20260628_184627`.
- Matrix verifier: `ok=true`, `fail_count=0`, expected post-route target
  `hugh-main`, self/local target rejection enabled.

## Gate Result

`scripts/windows/write-release-go-no-go.ps1 -Json` generated
`.local-build/go-no-go/latest.json` at `2026-06-28T18:56:04.7165221+09:00`:

- `full_product_spec_ready=false`
- `ready_for_public_desktop_release=false`
- `blockers=10`
- `warnings=0`
- `manifest_git.commit=4f6c46f0be7575a1d1fcf0b0cb55dd52a8469897`
- `manifest_git.dirty=false`
- `v34_stale_self_heal_verified=false`

The reopened local freshness blockers are closed again. The remaining blockers
are substantive physical/external/not-yet-implemented product gates:
multi-device, packaged Private Mesh proof archive, two-machine runtime CPU
evidence, public metadata DNS/TLS, Store release, P2P control-plane, design
approval, real relay transport, and V34 physical stale self-heal proof.

## Indexing

`musu indexer sync --work-dir F:\workspace\musu-bee --name musu-bee` completed
after the documentation refresh:

- indexed 3403 files
- indexed 3879 symbols

Recall checks returned:

- `LOCAL_PACKAGED_EVIDENCE_REFRESH_2026_06_28_POST_V34_ENDPOINT`
- `MUSU_CPU_SCENARIO_ROUTE_OK_20260628_184627`
- `20260628-185307-HUGH_SECOND.desktop-single-instance.json`
