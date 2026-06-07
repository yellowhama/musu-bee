# MUSU 1.15.0-rc.1 Current-Head Local Desktop Evidence After Relay Metadata Gate

Date: 2026-06-07 KST

## Summary

Current packaged local desktop evidence was refreshed on `HUGH_SECOND` after
the Rust release relay tunnel submit metadata gate changed runtime source.

The one-machine local desktop gate is restored:

- MSIX rebuild/reinstall succeeded.
- Single-machine packaged bridge smoke passed.
- Process ownership passed.
- Startup single-instance passed.
- Desktop single-instance passed.
- 60s `desktop-open` idle CPU passed.
- Five-state runtime CPU scenario matrix passed.
- Targeted HUGH-MAIN route-attempt CPU evidence passed.

Public release remains No-Go because this is still one-machine local evidence
and hosted P2P/relay, support mailbox, Store, and real multi-device evidence
remain missing.

## Package Refresh

Commands:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\windows\run-msix-workflow.ps1 -Configuration release -Architecture x64 -StartupContract local-sideload-manual -AttemptInstall -MachineTrust -ReplaceExisting -VerifyInstalled
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\windows\run-msix-workflow.ps1 -Configuration release -Architecture x64 -StartupContract local-sideload-manual -SkipBuild -AttemptInstall -ReplaceExisting -VerifyInstalled
```

The first command built and verified the package, then failed at the
`-MachineTrust` elevation prompt because UAC was not completed. The second
command reused the built MSIX and completed current-user replace install and
verification.

Result:

- package:
  `Yellowhama.MUSU_1.15.0.0_x64__ygcjq669as2b6`
- package path:
  `.local-build\msix\output\musu_1.15.0.0_x64_local-sideload-manual.msix`
- startup contract: `local-sideload-manual`
- local sideload/manual bridge contract: passed

Known local warning:

- current PowerShell PATH still resolves `C:\Users\empty\.cargo\bin\musu.exe`
  before the WindowsApps alias
- evidence commands used the explicit WindowsApps alias:
  `C:\Users\empty\AppData\Local\Microsoft\WindowsApps\musu.exe`

## Evidence

MSIX install:

- evidence:
  `docs\evidence\msix-install\1.15.0-rc.1\20260607-090353-HUGH_SECOND.evidence.json`
- verification:
  `docs\evidence\msix-install\1.15.0-rc.1\20260607-090353-HUGH_SECOND.verification.json`
- result: `ok=true`
- alias mode: `warn-explicit-windowsapps`
- alias shadowing accepted: `true`

Single-machine smoke:

- evidence:
  `docs\evidence\single-machine\1.15.0-rc.1\20260607-090436-HUGH_SECOND.evidence.json`
- verification:
  `docs\evidence\single-machine\1.15.0-rc.1\20260607-090436-HUGH_SECOND.verification.json`
- result: `ok=true`
- surface: `local-bridge-only`
- bridge: `http://127.0.0.1:14361`
- CLI route checked: `true`

Process ownership:

- evidence:
  `docs\evidence\process-ownership\1.15.0-rc.1\20260607-090457-HUGH_SECOND.process-ownership.json`
- result: `ok=true`
- packaged runtime: `1`
- MUSU-owned Node helpers: `0`
- MUSU-owned WebView2 helpers before desktop activation: `0`
- repo orphan helpers: `0`
- bridge PID: `34860`
- bridge address: `127.0.0.1:14361`

Startup single-instance:

- evidence:
  `docs\evidence\startup-single-instance\1.15.0-rc.1\20260607-090512-HUGH_SECOND.startup-single-instance.json`
- result: `ok=true`
- repeated `musu up` invocations reused bridge PID `34860`
- repeated spawn count: `0`

Desktop single-instance:

- evidence:
  `docs\evidence\desktop-single-instance\1.15.0-rc.1\20260607-090550-HUGH_SECOND.desktop-single-instance.json`
- result: `ok=true`
- baseline desktop shell: `0`
- desktop shell after repeated activation: `1`
- new desktop shell count: `1`

Desktop-open idle CPU:

- evidence:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260607-092453-HUGH_SECOND.desktop-open.evidence.json`
- result: `ok=true`, `git_dirty=false`
- sample: `60.03s`
- hot process count: `0`
- subroles: bridge runtime `1`, desktop shell `1`, owned WebView2 `6`
- max one-core CPU: bridge `0`, desktop shell `0`, WebView2 `0.18`
- total working set: `361.93MB`

Five-state runtime CPU matrix:

- matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260607-091438-HUGH_SECOND.runtime-cpu-scenario-matrix.json`
- verification:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260607-091438-HUGH_SECOND.verification.json`
- verifier: `ok=true`, `fail_count=0`
- scenarios: `startup-open`, `runtime-started`, `dashboard-open`,
  `desktop-open`, `post-route`
- route probe: `ok=true`, attempts `1`
- max WebView2 one-core CPU across matrix: `0.16`

HUGH-MAIN target-route CPU:

- matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260607-092030-HUGH_SECOND.target-route.runtime-cpu-scenario-matrix.json`
- verification:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260607-092030-HUGH_SECOND.target-route.verification.json`
- verifier: `ok=true`, `fail_count=0`
- target: `HUGH-MAIN`
- route probe: `ok=false`, attempts `1`, raw exit code `0`, effective exit
  code `1`
- failure allowed: `true`
- post-route CPU sample: `ok=true`
- WebView2 max one-core CPU: `0.03`

## Go/No-Go

Clean go/no-go after evidence promotion:

- `ready_for_public_desktop_release=false`
- `local_artifacts_ready=true`
- `single_machine_verified=true`
- `msix_install_verified=true`
- `process_ownership_verified=true`
- `startup_single_instance_verified=true`
- `desktop_single_instance_verified=true`
- `runtime_idle_cpu_valid_machine_count=1`
- `runtime_cpu_scenario_matrix_valid_machine_count=1`
- `runtime_cpu_second_pc_route_attempt_verified=true`
- `p2p_control_plane_env_ready=false`
- `multi_device_verified=false`
- `manifest_git.dirty=false`

## Qualitative Audit

No high or medium issue was found in this pass.

What the evidence proves:

- The current packaged local desktop runtime does not reproduce the reported
  idle CPU busy-loop on `HUGH_SECOND`.
- MUSU-owned process attribution is clean despite machine-wide Node/WebView2
  processes from unrelated tools.
- Startup and desktop activation reuse the existing packaged runtime instead
  of multiplying runtime or desktop processes.
- The local runtime remains local-only; MUSU.PRO is not executing tasks.

Low-severity concerns:

- PATH alias shadowing remains in this shell, so explicit WindowsApps alias
  invocation is still required for developer evidence.
- The release build still emits dead-code warnings for fail-closed release
  relay tunnel source hooks until real `quic_relay_tunnel` runtime work is
  implemented.

## Remaining Release Blockers

- second-machine desktop-open idle CPU evidence
- second-machine five-state runtime CPU matrix evidence
- real second-PC multi-device route evidence
- hosted MUSU.PRO P2P/relay proof
- production KV/Upstash storage configuration
- production runtime login
- release `quic_relay_tunnel` runtime implementation
- release relay payload endpoint implementation
- relay route metadata, transport proof, and payload delivery proof
- `musu@musu.pro` support mailbox delivery evidence
- Partner Center/Store submission and certification evidence

## Next Step

Run the same packaged evidence pack on the second machine. If the second PC is
not available, the next source-side work is to implement the real release
relay tunnel runtime path while keeping MUSU.PRO as control-plane/rendezvous
and relay fallback, not the local execution path.

## Index Refresh

- command: `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- indexed files: `2879`
- indexed symbols: `2790`
- duration: `57437 ms`
- wiki: `wiki/946`
