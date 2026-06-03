# MUSU 1.15.0-rc.1 Post Transport Descriptor Primary Evidence Refresh

**Wiki ID**: wiki/612

Date: 2026-06-03 13:29 KST

## Scope

This pass restored primary-machine release evidence after the P2P relay
transport descriptor/preflight gate was added and deployed.

The source-bearing descriptor gate commit is `654b9dcb`. The evidence refresh
then used clean docs/evidence-only heads as each artifact was committed:

- single-machine smoke: `75b5c4fdc9d15471276c86e70cb04fb96f469cec`
- desktop-open CPU: `97adc543fdcfbf5c1f06b142123307f53f3f6276`
- runtime CPU scenario matrix: `701b06de559d01507aa47c285206843cd5bc93d8`
- clean go/no-go summary: `2fe8d220a0493965c6d9de3842ffbec059a06f93`

No runtime source changed after the descriptor gate implementation; the later
commits are release evidence/docs commits.

## MSIX Build And Install

Command:

```powershell
scripts\windows\run-msix-workflow.ps1 -Configuration release -StartupContract local-sideload-manual -AttemptInstall -VerifyInstalled -ReplaceExisting
```

Result:

- Rust release build passed in `10m 08s`.
- Tauri desktop shell build passed.
- MSIX packaging produced:
  `.local-build\msix\output\musu_1.15.0.0_x64_local-sideload-manual.msix`
- installed package:
  `Yellowhama.MUSU_1.15.0.0_x64__ygcjq669as2b6`
- packaged startup smoke passed.
- installed package contract matched the artifact.
- packaged runtime identity reported `distribution=store-msix`.

Known local caveat remains unchanged: PATH resolves
`C:\Users\empty\.cargo\bin\musu.exe` before the WindowsApps alias, so runtime
evidence used the explicit packaged alias:

```powershell
& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe"
```

## Evidence

Single-machine smoke:

- `docs\evidence\single-machine\1.15.0-rc.1\20260603-131556-HUGH_SECOND.evidence.json`
- verification:
  `docs\evidence\single-machine\1.15.0-rc.1\20260603-131556-HUGH_SECOND.verification.json`
- summary:
  `docs\evidence\single-machine\1.15.0-rc.1\20260603-131556-HUGH_SECOND.summary.md`
- dashboard task:
  `bba38031-b333-4b86-af61-64b65187a82b`
- output:
  `MUSU_RELEASE_SMOKE_OK_20260603_131531`
- bridge:
  `http://127.0.0.1:4753`

Desktop-open idle CPU:

- `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260603-131811-HUGH_SECOND.desktop-open.evidence.json`
- captured from clean git state at commit:
  `97adc543fdcfbf5c1f06b142123307f53f3f6276`
- sample duration: `60.047s`
- MUSU CPU: `0`
- repo Node CPU: `0.05`
- owned WebView2 CPU: `0.31`
- hot process count: `0`
- process counts: MUSU `2`, Node `1`, WebView2 `6`
- working set after sample: `497.94MB`

Runtime CPU scenario matrix:

- `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260603-131938-HUGH_SECOND.runtime-cpu-scenario-matrix.json`
- captured from clean git state at commit:
  `701b06de559d01507aa47c285206843cd5bc93d8`
- route token:
  `MUSU_CPU_SCENARIO_ROUTE_OK_20260603_131938`
- verifier: `ok=true`, `fail_count=0`

Matrix summary:

| Scenario | MUSU | Node | WebView2 | Hot | Working set |
| --- | ---: | ---: | ---: | ---: | ---: |
| startup-open | 0 | 0 | 0 | 0 | 156.93MB |
| runtime-started | 0 | 0 | 0 | 0 | 157.31MB |
| dashboard-open | 0 | 0 | 0 | 0 | 158.05MB |
| desktop-open | 0.03 | 0 | 0.73 | 0 | 493.2MB |
| post-route | 0 | 0 | 0.21 | 0 | 492.93MB |

## Validation

- `verify-single-machine-evidence.ps1`: `ok=true`, `fail_count=0`
- `verify-runtime-cpu-scenario-matrix.ps1`: `ok=true`, `fail_count=0`
- idle CPU JSON: `ok=true`, `git_dirty=false`, `hot_process_count=0`
- clean `write-release-go-no-go.ps1 -Json` on `2fe8d220`:
  - `local_artifacts_ready=true`
  - `single_machine_verified=true`
  - `runtime_idle_cpu_valid_machine_count=1`
  - `runtime_cpu_scenario_matrix_valid_machine_count=1`
  - `p2p_control_plane_verified=false`
  - `p2p_relay_transport_wired=false`
  - `p2p_relay_route_evidence_count=0`
  - `p2p_relay_payload_transport_proven=false`
  - `git_dirty=false`

## Release Interpretation

This restores current primary-machine smoke, desktop-open CPU, and five-state
runtime CPU matrix evidence after the P2P relay transport descriptor gate.

Public release remains No-Go. Runtime CPU and runtime matrix evidence are each
`1/2`, so second-PC runtime evidence is still required. Hosted P2P remains
blocked until live `musu.pro` proves owner-scoped release-grade relay lease
storage, `wss://` relay transport preflight, and release-grade relay route
payload transport with `count > 0`. Support mailbox and Partner Center/Store
evidence are also still required.
