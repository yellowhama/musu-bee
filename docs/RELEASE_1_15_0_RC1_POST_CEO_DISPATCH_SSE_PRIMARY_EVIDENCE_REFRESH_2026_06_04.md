# Release 1.15.0-rc.1 Post CEO Dispatch SSE Primary Evidence Refresh

Recorded: 2026-06-04 KST

## Scope

This refresh restores current primary-machine evidence after the CEO dispatch
SSE cleanup hardening. The product roadmap remains local-executor first:
`musu.pro` is the remote web input, project room, rendezvous, path-selection,
relay-fallback coordination, and evidence plane, while each installed local
MUSU program performs the actual work on its device.

This is still one-machine evidence. Public release still requires the same
current MUSU build installed and verified on a second Windows PC.

## Evidence

- MSIX install:
  `docs\evidence\msix-install\1.15.0-rc.1\20260604-140415-HUGH_SECOND.evidence.json`
- single-machine smoke:
  `docs\evidence\single-machine\1.15.0-rc.1\20260604-140717-HUGH_SECOND.evidence.json`
- desktop-open idle CPU:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260604-141753-HUGH_SECOND.desktop-open.evidence.json`
- runtime CPU scenario matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260604-141924-HUGH_SECOND.runtime-cpu-scenario-matrix.json`
- runtime CPU scenario matrix verification:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260604-141924-HUGH_SECOND.verification.json`

## Results

- strict MSIX alias evidence passed with `alias_shadowing_count=0`
- single-machine smoke passed with dashboard
  `http://127.0.0.1:3001`, source `musu up.dashboard.reachable_url`,
  bridge `http://127.0.0.1:7462`, dashboard output
  `MUSU_RELEASE_SMOKE_OK_20260604_140650`, and CLI route output
  `MUSU_CLI_ROUTE_OK_20260604_140650`
- desktop-open CPU passed for `60.062s` from clean commit `f96e5cca` with
  `git_dirty=false`, MUSU `0`, Node `0.03`, WebView2 `0.16`, owned WebView2
  `6`, hot `0`, and working set `485.51MB`
- five-state runtime matrix passed verifier `ok=true`, `fail_count=0`, with
  `git_dirty=false`, route token
  `MUSU_CPU_SCENARIO_ROUTE_OK_20260604_141924`, scenarios
  `startup-open,runtime-started,dashboard-open,desktop-open,post-route`, max
  MUSU `0`, Node `0.05`, WebView2 `0.23`, max working set `485.13MB`, and all
  scenarios hot `0`

Clean go/no-go after the primary refresh reported:

- `ready=false`
- `local_artifacts_ready=true`
- `single_machine_verified=true`
- `msix_install_verified=true`
- runtime idle CPU valid machine count `1`
- runtime CPU scenario matrix valid machine count `1`
- `multi_device_verified=false`
- `manifest_git.dirty=false`
- blocker count `6`

Remaining public-release blockers:

- second-PC multi-device evidence
- second-PC runtime idle CPU evidence
- second-PC runtime CPU scenario matrix evidence
- live owner-scoped `musu.pro` P2P relay proof
- support mailbox evidence
- Store release evidence

## Validation

- `smoke-single-machine-beta.ps1`
- `record-single-machine-evidence.ps1`
- `measure-musu-idle-cpu.ps1 -SampleSeconds 60 -Scenario desktop-open`
- `measure-musu-runtime-cpu-scenarios.ps1 -Scenario startup-open,runtime-started,dashboard-open,desktop-open,post-route`
- `verify-runtime-cpu-scenario-matrix.ps1`
- `write-release-go-no-go.ps1 -ScriptTimeoutSeconds 120 -Json`
