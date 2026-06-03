# MUSU 1.15.0-rc.1 Post Bounded Frontend SSE Primary Evidence Refresh

**Wiki ID**: wiki/628

Date: 2026-06-03 17:52 KST

## Scope

This pass restored primary-machine packaged release evidence after commit
`4f52269e66c3e1ffdbde9d7936bcd83e4fb4a22c` bounded dashboard mount-time SSE
reconnect loops.

The source-bearing commit is:

- `4f52269e66c3e1ffdbde9d7936bcd83e4fb4a22c`
- subject: `Bound frontend SSE reconnect loops`

## MSIX Build And Install

Clean package worktree:

- `F:\workspace\musu-bee-clean-sse-primary-refresh`

The release MSIX workflow rebuilt:

- Rust release runtime
- Tauri desktop shell
- desktop release binary
- local-sideload MSIX package
- packaged startup smoke

The first generated signing certificate stalled in the non-interactive
`certutil -user -addstore Root` path, and that same new certificate was not
LocalMachine-trusted for same-version replacement. The package was therefore
repacked with the existing LocalMachine-trusted `Yellowhama.MUSU` certificate
from the main worktree (`9048EA2A9C0891A574C62F9DF2C1D0DA873952DE`) and then
installed with explicit `-CertPath` plus `-SkipCertInstall`.

Installed package:

- `Yellowhama.MUSU_1.15.0.0_x64__ygcjq669as2b6`

Install verification:

- installed contract matched the artifact
- `musu.exe` and `musu-startup.exe` were present
- `musu-desktop.exe` was the Start-menu application executable
- startup task `MusuBridgeStartup` was present
- packaged runtime identity reported `distribution=store-msix`
- local dev-shell alias shadowing remains present, so release evidence used the
  explicit WindowsApps alias

## Evidence

Single-machine smoke:

- evidence:
  `docs\evidence\single-machine\1.15.0-rc.1\20260603-173637-HUGH_SECOND.evidence.json`
- verification:
  `docs\evidence\single-machine\1.15.0-rc.1\20260603-173637-HUGH_SECOND.verification.json`
- summary:
  `docs\evidence\single-machine\1.15.0-rc.1\20260603-173637-HUGH_SECOND.summary.md`
- dashboard task:
  `90213081-7cc4-4144-872d-6c1da383259a`
- output:
  `MUSU_RELEASE_SMOKE_OK_20260603_173611`
- bridge:
  `http://127.0.0.1:9353`
- CLI route checked:
  `true`
- evidence SHA256:
  `20028bb29fd52dd532fad8ff43529b397a2d364e1180fbcd0509f33445ae3b67`
- verification SHA256:
  `d18b0bb51d511532bdb766e4b8a0c84980b8fb9f1c50e253cbfc854c28605435`

Desktop-open idle CPU:

- evidence:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260603-174002-HUGH_SECOND.desktop-open.evidence.json`
- captured from clean git state at commit:
  `4f52269e66c3e1ffdbde9d7936bcd83e4fb4a22c`
- sample duration: `60.044s`
- MUSU CPU: `0`
- repo Node CPU: `0`
- owned WebView2 CPU: `0.29`
- hot process count: `0`
- process counts: MUSU `2`, Node `0`, WebView2 `6`
- working set after sample: `382.17MB`
- evidence SHA256:
  `ff9892c1e86fc4d04e2cb693951510b90f9c71ff2234ba5857acbc2ba82bb64e`

Runtime CPU scenario matrix:

- matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260603-174322-HUGH_SECOND.runtime-cpu-scenario-matrix.json`
- captured from clean git state at commit:
  `4f52269e66c3e1ffdbde9d7936bcd83e4fb4a22c`
- route token:
  `MUSU_CPU_SCENARIO_ROUTE_OK_20260603_174322`
- verifier: `ok=true`, `fail_count=0`
- evidence SHA256:
  `61133c2426d997c664822331eaecf0e340a543df255c05f5559db9b181995de4`

Matrix summary:

| Scenario | MUSU | Node | WebView2 | Hot | Working set |
| --- | ---: | ---: | ---: | ---: | ---: |
| startup-open | 0 | 0.03 | 0.36 | 0 | 512.36MB |
| runtime-started | 0.03 | 0 | 0.39 | 0 | 516.38MB |
| dashboard-open | 0 | 0 | 0.13 | 0 | 518.26MB |
| desktop-open | 0 | 0 | 0.08 | 0 | 517.85MB |
| post-route | 0 | 0 | 0.05 | 0 | 516.32MB |

## Validation

- `verify-single-machine-evidence.ps1`: `ok=true`
- `measure-musu-idle-cpu.ps1`: `ok=true`, `git_dirty=false`, `hot_process_count=0`
- `verify-runtime-cpu-scenario-matrix.ps1`: `ok=true`, `fail_count=0`
- post-evidence go/no-go at 2026-06-03 17:51 KST:
  - `local_artifacts_ready=true`
  - `single_machine_verified=true`
  - `runtime_idle_cpu_valid_machine_count=1`
  - `runtime_cpu_scenario_matrix_valid_machine_count=1`
  - `multi_device_verified=false`
  - `p2p_control_plane_verified=false`
  - `p2p_relay_transport_wired=false`
  - `p2p_relay_payload_transport_proven=false`
  - `git_dirty=true` because the new evidence and docs were not committed yet
    and `.codex/` remains untracked in the main worktree

## Residual Finding

The temporary production Next dashboard on `http://127.0.0.1:3001/app` served
the matrix run successfully, but stderr logged an existing server-side
`ReferenceError: self is not defined` from
`.next\server\app\m\[id]\workstation\page.js`. The matrix did not exercise that
route and remained under CPU/resource budget, but this is a separate hardening
item for the workstation page's SSR boundary.

## Release Interpretation

This restores current primary-machine packaged smoke, desktop-open idle CPU,
and five-state runtime CPU matrix evidence for the bounded frontend SSE source
change.

Public release remains No-Go. Runtime CPU and runtime matrix evidence are each
`1/2`, so second-PC runtime evidence is still required. Hosted P2P remains
blocked until live `musu.pro` proves owner-scoped release-grade relay lease
storage, wired `wss://` relay transport, and release-grade relay route payload
transport with `relay_transport_proof` and `count > 0`. Support mailbox and
Partner Center/Store evidence are also still required.
