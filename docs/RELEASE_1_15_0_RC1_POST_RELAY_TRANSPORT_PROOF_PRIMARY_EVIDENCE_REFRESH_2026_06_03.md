# MUSU 1.15.0-rc.1 Post Relay Transport Proof Primary Evidence Refresh

**Wiki ID**: wiki/616

Date: 2026-06-03 14:25 KST

## Scope

This pass restored primary-machine packaged release evidence after the relay
transport proof gate was added.

The source-bearing relay transport proof gate commit is `7ba01fe`. Later
commits in this chain are docs/evidence-only:

- single-machine evidence commit: `c8628d58`
- desktop-open CPU evidence commit: `4873e212`
- runtime CPU matrix evidence commit and clean go/no-go head: `2445c3bb`

No runtime source changed after the relay transport proof gate implementation.

## MSIX Build And Install

Command:

```powershell
scripts\windows\run-msix-workflow.ps1 -Configuration release -StartupContract local-sideload-manual -AttemptInstall -VerifyInstalled -ReplaceExisting
```

Result:

- Rust release runtime build completed in `9m 23s`.
- Tauri desktop shell build passed.
- MSIX packaging produced:
  `.local-build\msix\output\musu_1.15.0.0_x64_local-sideload-manual.msix`
- installed package:
  `Yellowhama.MUSU_1.15.0.0_x64__ygcjq669as2b6`
- packaged startup smoke passed.
- installed package contract matched the artifact.
- packaged runtime identity reported `distribution=store-msix`.

Local PATH still resolves `C:\Users\empty\.cargo\bin\musu.exe` before the
WindowsApps alias, so release evidence used the explicit packaged alias:

```powershell
& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe"
```

## Evidence

Single-machine smoke:

- `docs\evidence\single-machine\1.15.0-rc.1\20260603-141358-HUGH_SECOND.evidence.json`
- verification:
  `docs\evidence\single-machine\1.15.0-rc.1\20260603-141358-HUGH_SECOND.verification.json`
- summary:
  `docs\evidence\single-machine\1.15.0-rc.1\20260603-141358-HUGH_SECOND.summary.md`
- dashboard task:
  `3e8522a2-73ef-4b51-bb3c-bb0b6bc251af`
- output:
  `MUSU_RELEASE_SMOKE_OK_20260603_141331`
- bridge:
  `http://127.0.0.1:7483`

Desktop-open idle CPU:

- `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260603-141524-HUGH_SECOND.desktop-open.evidence.json`
- captured from clean git state at commit:
  `c8628d58e988af56e9fe01c11471c6dfbafabfc6`
- sample duration: `60.059s`
- MUSU CPU: `0`
- repo Node CPU: `0.03`
- owned WebView2 CPU: `0.44`
- hot process count: `0`
- process counts: MUSU `2`, Node `1`, WebView2 `6`
- working set after sample: `517.83MB`

Runtime CPU scenario matrix:

- `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260603-141712-HUGH_SECOND.runtime-cpu-scenario-matrix.json`
- captured from clean git state at commit:
  `4873e2121a6dedec8764ac2bbefc2164896aeac4`
- route token:
  `MUSU_CPU_SCENARIO_ROUTE_OK_20260603_141712`
- verifier: `ok=true`, `fail_count=0`

Matrix summary:

| Scenario | MUSU | Node | WebView2 | Hot | Working set |
| --- | ---: | ---: | ---: | ---: | ---: |
| startup-open | 1.04 | 0.05 | 2.03 | 0 | 540.38MB |
| runtime-started | 0 | 0.1 | 0.13 | 0 | 541.02MB |
| dashboard-open | 0 | 0 | 0.18 | 0 | 543.81MB |
| desktop-open | 0 | 0 | 0.08 | 0 | 543.44MB |
| post-route | 0 | 0.03 | 0.16 | 0 | 542.74MB |

## Validation

- `verify-single-machine-evidence.ps1`: `ok=true`, `fail_count=0`
- `verify-runtime-cpu-scenario-matrix.ps1`: `ok=true`, `fail_count=0`
- idle CPU JSON: `ok=true`, `git_dirty=false`, `hot_process_count=0`
- clean `write-release-go-no-go.ps1 -Json` on `2445c3bb`:
  - `local_artifacts_ready=true`
  - `single_machine_verified=true`
  - `runtime_idle_cpu_valid_machine_count=1`
  - `runtime_cpu_scenario_matrix_valid_machine_count=1`
  - `p2p_control_plane_verified=false`
  - `p2p_relay_transport_wired=false`
  - `p2p_relay_route_evidence_count=0`
  - `p2p_relay_payload_transport_proven=false`
  - `git_dirty=false`

## Local Dashboard Note

The evidence server was intentionally run on `http://127.0.0.1:3001/app`.
`localhost` without a port and `localhost:3000` were not serving this
production dashboard during the run, so browser attempts against those
addresses returned `ERR_CONNECTION_REFUSED`.

## Release Interpretation

This restores current primary-machine smoke, desktop-open CPU, and five-state
runtime CPU matrix evidence after the relay transport proof gate.

Public release remains No-Go. Runtime CPU and runtime matrix evidence are each
`1/2`, so second-PC runtime evidence is still required. Hosted P2P remains
blocked until live `musu.pro` proves owner-scoped release-grade relay lease
storage, wired `wss://` relay transport, and release-grade relay route payload
transport with `relay_transport_proof` and `count > 0`. Support mailbox and
Partner Center/Store evidence are also still required.
