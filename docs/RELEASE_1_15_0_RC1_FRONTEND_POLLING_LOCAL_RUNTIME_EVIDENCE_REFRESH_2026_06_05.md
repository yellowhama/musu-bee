# MUSU 1.15.0-rc.1 Frontend Polling / Local Runtime Evidence Refresh

**Wiki ID**: wiki/730
Date: 2026-06-05

## Decision Lock

The installed MUSU program is the local executor. It is not a cloud-hosted web
app and it does not require the workspace `localhost:3001/app` dashboard to be
running.

`localhost` is still valid for local loopback IPC: the desktop shell and CLI can
talk to a local packaged bridge on `127.0.0.1:<runtime-port>`. The confusing
part was treating `127.0.0.1:3001/app` as a user-facing requirement. That port
is an optional workspace/developer dashboard; connection refused on that port is
expected when the packaged local runtime is healthy but the workspace dashboard
is stopped.

The product split remains:

- local MUSU programs execute work on each device;
- `musu.pro` accepts authenticated remote user input, project/company room
  context, presence, rendezvous, path selection, relay-fallback policy, and
  evidence;
- web-assisted rendezvous can bootstrap the P2P mesh, after which direct P2P is
  preferred and relay remains fallback-only.

## Frontend Polling Hardening

Commit `2517ffab` tightened frontend idle-polling coverage:

- `useBoundedEventSource` visibility reconnect low-duty callback now receives
  an `AbortSignal` and returns when aborted.
- `audit-frontend-polling-contract.ps1` now inventories non-test
  `useLowDutyPolling` call sites across `musu-bee/src` and `musu-bee/views`.
- The audit records call-site count, call-site paths, signal-gap count, and
  signal-gap paths.
- The audit fails if any inventoried low-duty polling callback does not expose
  `AbortSignal`, if direct `setInterval` use appears, or if direct
  `visibilitychange` listeners appear.
- `runtime-polling-contract.test.ts` now checks the bounded EventSource abort
  guard and the all-call-site audit marker.

Validation:

- PowerShell parser passed for `audit-frontend-polling-contract.ps1`.
- `audit-frontend-polling-contract.ps1 -FailOnProblem -Json` passed with
  `ok=true`, `fail_count=0`, `low_duty_polling_call_site_count=29`,
  `low_duty_polling_signal_gap_count=0`, `direct_interval_hit_count=0`, and
  `direct_visibility_listener_hit_count=0`.
- `npm run test:runtime-polling` passed `17/17`.
- `npm run typecheck` passed.
- `git diff --check` passed.

## Fresh Packaged Evidence

The local-sideload MSIX was rebuilt and reinstalled for the current packaged
runtime flow.

- MSIX artifact:
  `.local-build\msix\output\musu_1.15.0.0_x64_local-sideload-manual.msix`
- Installed package:
  `Yellowhama.MUSU_1.15.0.0_x64__ygcjq669as2b6`
- Strict MSIX install evidence:
  `docs\evidence\msix-install\1.15.0-rc.1\20260605-070256-HUGH_SECOND.evidence.json`
- Strict MSIX verification:
  `docs\evidence\msix-install\1.15.0-rc.1\20260605-070256-HUGH_SECOND.verification.json`
- Single-machine bridge-only smoke:
  `docs\evidence\single-machine\1.15.0-rc.1\20260605-065900-HUGH_SECOND.evidence.json`
  with bridge `http://127.0.0.1:8370`, `dashboard_required=false`, and
  `single_machine_surface=local-bridge-only`.

Commit `0c219639` recorded fresh one-machine desktop-open idle CPU evidence:

- idle CPU evidence:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260605-070404-HUGH_SECOND.desktop-open.evidence.json`
- sample duration: `60.046s`
- process count after sample: `8`
- role process counts: MUSU `2`, Node `0`, WebView2 `6`
- max one-core CPU by role: MUSU `0`, Node `0`, WebView2 `0.26`
- working set: `364.9MB`
- private memory: `178.84MB`
- hot process count: `0`
- resource budget violations: none

Commit `ff8fdf46` recorded the fresh runtime CPU scenario matrix evidence:

- matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260605-070552-HUGH_SECOND.runtime-cpu-scenario-matrix.json`
- verification:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260605-070552-HUGH_SECOND.verification.json`
- summary:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260605-070552-HUGH_SECOND.summary.md`
- verifier: `ok=true`, `fail_count=0`
- route token: `MUSU_CPU_SCENARIO_ROUTE_OK_20260605_070552`
- route probe: `ok=true`, one attempt
- executable identity: WindowsApps `musu.exe`, `allow_developer_runtime=false`
- dashboard-open note: no dashboard URL was exposed by the packaged runtime, so
  the scenario measured packaged runtime state instead of depending on
  `localhost:3001`.

Runtime matrix maxima:

| Scenario | MUSU | Node | WebView2 | Working set | Hot |
|---|---:|---:|---:|---:|---:|
| startup-open | 0 | 0 | 0.16 | 365.40MB | 0 |
| runtime-started | 0 | 0 | 0.08 | 365.38MB | 0 |
| dashboard-open | 0 | 0 | 0.05 | 365.19MB | 0 |
| desktop-open | 0 | 0 | 0.21 | 365.61MB | 0 |
| post-route | 0 | 0 | 0.10 | 363.91MB | 0 |

## Current Handoff Status

Clean final handoff status at `2026-06-05T07:16:16+09:00`:

- `ready_for_public_desktop_release=false`
- `packet.verified=true`
- `action_pack.verified=true`
- `local_artifacts_ready=true`
- `single_machine_verified=true`
- `msix_install_verified=true`
- `msix_desktop_entrypoint_verified=true`
- `runtime_idle_cpu_valid_machine_count=1/2 [HUGH_SECOND]`
- `runtime_cpu_scenario_matrix_valid_machine_count=1/2 [HUGH_SECOND]`
- `frontend_polling_contract_verified=true`
- `manifest_git_dirty=false`

Remaining blockers:

- second-PC multi-device evidence is not recorded;
- second-PC desktop-open idle CPU evidence is still required;
- second-PC runtime CPU scenario matrix evidence is still required;
- `musu@musu.pro` support delivery is not operator-verified;
- Partner Center / Microsoft Store evidence is not recorded;
- live `https://musu.pro` P2P control-plane evidence still lacks
  release-grade owner-scoped relay lease storage, relay transport wiring, route
  evidence, payload transport proof, and payload delivery proof.

## Release Decision

This closes the current one-machine local-runtime/frontend-polling evidence
refresh and keeps the local program / MUSU.PRO web split explicit. It does not
close public desktop release. The next hard external gate is installing this
current build on the second PC and importing fresh multi-device, idle CPU, and
runtime-matrix evidence.
