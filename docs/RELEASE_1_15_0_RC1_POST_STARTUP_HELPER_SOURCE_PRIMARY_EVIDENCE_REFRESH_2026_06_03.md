# MUSU 1.15.0-rc.1 Post Startup Helper Source Primary Evidence Refresh

**Wiki ID**: wiki/624

Date: 2026-06-03 16:24 KST

## Scope

This pass restored current primary-machine packaged release evidence after the
packaged startup helper source was made reproducible in a clean checkout.

The source-bearing commit is `79368c53`. It tracks
`musu-rs\src\bin\musu-startup.rs` and updates `.gitignore` so `musu-rs\src\bin`
is not hidden by the root `bin/` ignore rule.

Validation before packaging:

- `cargo check --bin musu-startup -j 1` passed.
- A clean detached worktree at `79368c53` contained the tracked startup helper
  source and built the release MSIX.

## MSIX Build And Install

The clean worktree was `F:\workspace\musu-bee-clean-primary-refresh`.

The release MSIX workflow rebuilt:

- Rust release runtime
- Tauri desktop shell
- desktop release binary
- MSIX package and startup smoke

The package was installed as:

- `Yellowhama.MUSU_1.15.0.0_x64__ygcjq669as2b6`

The install verification reported:

- local sideload contract matched the artifact
- `musu.exe` and `musu-startup.exe` were present
- startup task `MusuBridgeStartup` was present
- packaged runtime identity reported `distribution=store-msix`

Local PATH still resolves `C:\Users\empty\.cargo\bin\musu.exe` before the
WindowsApps alias, so release evidence used the explicit packaged alias:

```powershell
& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe"
```

## Evidence

Single-machine smoke:

- `docs\evidence\single-machine\1.15.0-rc.1\20260603-160842-HUGH_SECOND.evidence.json`
- verification:
  `docs\evidence\single-machine\1.15.0-rc.1\20260603-160842-HUGH_SECOND.verification.json`
- summary:
  `docs\evidence\single-machine\1.15.0-rc.1\20260603-160842-HUGH_SECOND.summary.md`
- dashboard task:
  `5ed5bff5-6ac9-46b8-a2d5-b93d3211e447`
- output:
  `MUSU_RELEASE_SMOKE_OK_20260603_160819`
- bridge:
  `http://127.0.0.1:2328`
- evidence SHA256:
  `ef7b65d209e3c186b9f182d253a9fb16a574402102dedffa56fed4f513351f78`
- verification SHA256:
  `51563d0ebb21871aebacdbc399ddcb0a79816bf7d15ab32ff66de0ced523ea5b`

Desktop-open idle CPU:

- `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260603-161155-HUGH_SECOND.desktop-open.evidence.json`
- captured from clean git state at commit:
  `79368c53a6c66a5c7e792711770c3a1c5dcb9990`
- sample duration: `60.076s`
- MUSU CPU: `0.03`
- repo Node CPU: `0`
- owned WebView2 CPU: `0.21`
- hot process count: `0`
- process counts: MUSU `2`, Node `0`, WebView2 `6`
- working set after sample: `461.69MB`
- evidence SHA256:
  `719bd161f0bf815912e718f0f51c9018b05d2e5a7cf3ceee29e38b17b16a553e`

Runtime CPU scenario matrix:

- `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260603-161836-HUGH_SECOND.runtime-cpu-scenario-matrix.json`
- captured from clean git state at commit:
  `79368c53a6c66a5c7e792711770c3a1c5dcb9990`
- route token:
  `MUSU_CPU_SCENARIO_ROUTE_OK_20260603_161836`
- verifier: `ok=true`, `fail_count=0`
- evidence SHA256:
  `b9cab6796e9d8cef87c483eb2f4feac0969e3e7fd73fc9c67218ecf19c8a5e61`

Matrix summary:

| Scenario | MUSU | Node | WebView2 | Hot | Working set |
| --- | ---: | ---: | ---: | ---: | ---: |
| startup-open | 0.03 | 0.05 | 1.35 | 0 | 513.21MB |
| runtime-started | 0 | 0 | 0.36 | 0 | 515.65MB |
| dashboard-open | 0 | 0 | 0.08 | 0 | 515.27MB |
| desktop-open | 0 | 0 | 0.34 | 0 | 514.98MB |
| post-route | 0 | 0 | 0.10 | 0 | 518.12MB |

## Validation

- `verify-single-machine-evidence.ps1`: `ok=true`, `fail_count=0`
- `verify-runtime-cpu-scenario-matrix.ps1`: `ok=true`, `fail_count=0`
- idle CPU JSON: `ok=true`, `git_dirty=false`, `hot_process_count=0`
- dirty-tree `write-release-go-no-go.ps1 -Json` after evidence capture:
  - `local_artifacts_ready=true`
  - `single_machine_verified=true`
  - `runtime_idle_cpu_valid_machine_count=1`
  - `runtime_cpu_scenario_matrix_valid_machine_count=1`
  - `p2p_control_plane_verified=false`
  - `p2p_relay_transport_wired=false`
  - `p2p_relay_payload_transport_proven=false`
  - `git_dirty=true` because this evidence and docs were not committed yet and
    `.codex/` remains untracked in the main worktree

## Local Dashboard Note

The single-machine smoke used a temporary Next dev dashboard on
`http://127.0.0.1:3000`. When that server is not running, browser attempts to
`localhost` or `localhost:3000` return `ERR_CONNECTION_REFUSED`; that is a
local dashboard process state, not a packaged runtime failure.

The release CPU matrix used a production Next dashboard on
`http://127.0.0.1:3001/app` to avoid counting Next dev server CPU and memory as
release evidence.

## Release Interpretation

This restores current primary-machine smoke, desktop-open CPU, and five-state
runtime CPU matrix evidence on the same clean source commit that fixed startup
helper source reproducibility.

Public release remains No-Go. Runtime CPU and runtime matrix evidence are each
`1/2`, so second-PC runtime evidence is still required. Hosted P2P remains
blocked until live `musu.pro` proves owner-scoped release-grade relay lease
storage, wired `wss://` relay transport, and release-grade relay route payload
transport with `relay_transport_proof` and `count > 0`. Support mailbox and
Partner Center/Store evidence are also still required.
