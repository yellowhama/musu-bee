# MUSU 1.15.0-rc.1 Current-HEAD Local Desktop Evidence After mDNS Cancellation

Date: 2026-06-07 KST

## Summary

Current HEAD `24f360409efcf776e3e7196e7d1f01d27d7d8eb9` was rebuilt,
reinstalled, and rechecked on `HUGH_SECOND` after the mDNS cancellation
hardening changed runtime source.

The one-machine packaged local desktop gate is restored:

- MSIX rebuild and reinstall succeeded for
  `Yellowhama.MUSU_1.15.0.0_x64__ygcjq669as2b6`.
- Single-machine packaged bridge smoke passed.
- Process ownership passed.
- Startup single-instance passed.
- Desktop single-instance passed.
- 60s `desktop-open` idle CPU passed.
- 5-state runtime CPU scenario matrix passed.

Public release remains No-Go because this is still one-machine evidence only
and hosted P2P/relay proof remains absent.

## Package Refresh

Command:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\windows\run-msix-workflow.ps1 -Configuration release -StartupContract local-sideload-manual -AttemptInstall -VerifyInstalled -ReplaceExisting
```

Result:

- package path:
  `.local-build\msix\output\musu_1.15.0.0_x64_local-sideload-manual.msix`
- application executable: `musu-desktop.exe`
- CLI alias executable: `musu.exe`
- startup executable: `musu-startup.exe`
- package full name: `Yellowhama.MUSU_1.15.0.0_x64__ygcjq669as2b6`
- installed package contract: passed
- local sideload/manual bridge contract: passed

Known local environment warning:

- current PowerShell PATH still resolves `C:\Users\empty\.cargo\bin\musu.exe`
  before the WindowsApps alias
- release evidence commands therefore used the explicit WindowsApps alias:
  `C:\Users\empty\AppData\Local\Microsoft\WindowsApps\musu.exe`

## Evidence

Single-machine smoke:

- evidence:
  `docs\evidence\single-machine\1.15.0-rc.1\20260607-065454-HUGH_SECOND.evidence.json`
- verification:
  `docs\evidence\single-machine\1.15.0-rc.1\20260607-065454-HUGH_SECOND.verification.json`
- verifier: `ok=true`, `fail_count=0`
- surface: `local-bridge-only`
- dashboard required: `false`
- bridge: `http://127.0.0.1:9020`
- CLI route checked: `true`

Process ownership:

- evidence:
  `docs\evidence\process-ownership\1.15.0-rc.1\20260607-065525-HUGH_SECOND.process-ownership.json`
- result: `ok=true`, `fail_count=0`
- packaged runtime: `1`
- non-packaged runtime: `0`
- MUSU-owned Node helpers: `0`
- MUSU-owned WebView2 helpers before desktop activation: `0`
- repo orphan helpers: `0`
- bridge PID: `10828`
- bridge health: `HTTP 200` at `127.0.0.1:9020`

Startup single-instance:

- evidence:
  `docs\evidence\startup-single-instance\1.15.0-rc.1\20260607-065544-HUGH_SECOND.startup-single-instance.json`
- result: `ok=true`, `fail_count=0`
- repeated `musu up` invocations reused bridge PID `10828`

Desktop single-instance:

- evidence:
  `docs\evidence\desktop-single-instance\1.15.0-rc.1\20260607-065620-HUGH_SECOND.desktop-single-instance.json`
- result: `ok=true`, `fail_count=0`
- activation failure count: `0`
- new packaged desktop PID: `44540`
- desktop shell after activation: `1`

Desktop-open idle CPU:

- evidence:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260607-065630-HUGH_SECOND.desktop-open.evidence.json`
- result: `ok=true`, `git_dirty=false`
- sample: `60.032s`
- hot process count: `0`
- max one-core CPU by role: MUSU `0`, Node `0`, WebView2 `0.23`
- process counts by subrole: bridge runtime `1`, desktop shell `1`, owned
  Node `0`, owned WebView2 `6`
- total working set: `362.39MB`
- private memory: `184.83MB`

Five-state runtime CPU matrix:

- matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260607-065748-HUGH_SECOND.runtime-cpu-scenario-matrix.json`
- verification:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260607-065748-HUGH_SECOND.verification.json`
- verifier: `ok=true`, `fail_count=0`
- scenarios: `startup-open`, `runtime-started`, `dashboard-open`,
  `desktop-open`, `post-route`
- route token: `MUSU_CPU_SCENARIO_ROUTE_OK_20260607_065748`
- route task: `31a7ad5a-d5fa-4731-b896-c490e6f5deb1`
- hot process count: `0` in all scenarios
- max one-core CPU:
  - startup-open: WebView2 `0.05`
  - runtime-started: WebView2 `0.03`
  - dashboard-open: WebView2 `0.08`
  - desktop-open: WebView2 `0.13`
  - post-route: WebView2 `0.03`
- max working set observed: `365.78MB`

## Go/No-Go

Dirty-tree go/no-go after evidence promotion reports:

- `ready_for_public_desktop_release=false`
- `local_artifacts_ready=true`
- `single_machine_verified=true`
- `process_ownership_verified=true`
- `startup_single_instance_verified=true`
- `desktop_single_instance_verified=true`
- `runtime_idle_cpu_valid_machine_count=1`
- `runtime_cpu_scenario_matrix_valid_machine_count=1`
- `runtime_cpu_second_pc_route_attempt_valid_machine_count=0`
- `rust_background_loop_contract_verified=true`
- `idle_busy_loop_candidate_contract_verified=true`
- `p2p_control_plane_env_ready=false`

## Qualitative Audit

No high or medium issue was found in this pass.

What the evidence proves:

- The current packaged local desktop runtime does not reproduce the reported
  idle CPU busy-loop on `HUGH_SECOND`.
- The `localhost:3001` developer dashboard remains outside the packaged runtime
  contract.
- MUSU-owned process attribution is clean despite machine-wide Node/WebView2
  processes.
- mDNS cancellation hardening is now represented in installed packaged bits.

Low-severity concerns:

- The current shell still has PATH alias shadowing; release commands must keep
  using the explicit WindowsApps alias in this terminal.
- The release build emitted dead-code warnings for source-contract relay tunnel
  hooks and the legacy mDNS wrapper. They did not block packaging or evidence,
  but should be cleaned up before final release polish.
- This is one-machine evidence only.

## Remaining Release Blockers

- real second-PC multi-device route evidence
- second-machine desktop-open idle CPU evidence
- second-machine 5-state runtime CPU matrix evidence
- clean targeted second-PC route-attempt CPU evidence
- hosted MUSU.PRO P2P/relay proof
- production KV/Upstash storage configuration
- production runtime login
- release `quic_relay_tunnel` runtime implementation
- release relay payload endpoint implementation
- relay route metadata, transport proof, and payload delivery proof
- `musu@musu.pro` support mailbox delivery evidence
- Partner Center/Store submission and certification evidence

## Next Step

The next highest-value evidence step is second-PC packaged runtime validation:
install/run the current package on the second machine, capture single-machine
smoke, route reachability, desktop-open idle CPU, and the same 5-state runtime
CPU matrix. If the second PC is not available, the next source-side cleanup is
to remove or intentionally annotate the release-build dead-code warnings without
changing release markers.

## Index Refresh

After this report and evidence promotion, the local MUSU indexer was refreshed:

- command: `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- indexed files: `2844`
- indexed symbols: `2788`
- duration: `76659 ms`
- wiki: `wiki/934`
