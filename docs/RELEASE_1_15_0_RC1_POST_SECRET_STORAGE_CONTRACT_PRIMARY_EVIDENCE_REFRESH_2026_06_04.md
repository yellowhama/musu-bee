# MUSU 1.15.0-rc.1 Post Secret Storage Contract Primary Evidence Refresh

**Wiki ID**: wiki/708
**Date**: 2026-06-04 23:40 KST

## Decision

Fresh primary-machine packaged evidence is restored after secret storage
contract hardening.

The previous evidence became stale because commit `26294fa2` changed Rust
runtime token-storage code and MSIX release gate scripts. The local-sideload
MSIX was rebuilt, reinstalled, and verified before smoke/CPU/matrix evidence was
refreshed.

## Build And Install

Command:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\run-msix-workflow.ps1 -Configuration release -StartupContract local-sideload-manual -AttemptInstall -VerifyInstalled -ReplaceExisting
```

Result:

- release runtime build completed
- Tauri desktop shell build completed
- local-sideload MSIX packed and signed:
  `.local-build\msix\output\musu_1.15.0.0_x64_local-sideload-manual.msix`
- packaged startup smoke passed
- installed package verified as `Yellowhama.MUSU_1.15.0.0_x64__ygcjq669as2b6`
- WindowsApps alias exists and the installed package contract matches the
  artifact
- HUGH_SECOND still has warning-mode PATH shadowing from
  `C:\Users\empty\.cargo\bin\musu.exe`; packaged checks used the explicit
  WindowsApps alias

## Fresh Evidence

Single-machine smoke:

- `docs\evidence\single-machine\1.15.0-rc.1\20260604-232809-HUGH_SECOND.evidence.json`
- dashboard: `http://127.0.0.1:3001`
- bridge: `http://127.0.0.1:1823`
- task: `8877c18b-866a-405c-9f61-a097cc5d0301`
- output: `MUSU_RELEASE_SMOKE_OK_20260604_232737`
- CLI route checked: `true`

Desktop-open CPU:

- `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260604-233024-HUGH_SECOND.desktop-open.evidence.json`
- sample: `60.063s`
- max one-core CPU: MUSU `0.05`, Node `0.03`, WebView2 `0.6`
- owned WebView2: `6`
- working set: `487.21MB`
- hot process count: `0`

Runtime CPU scenario matrix:

- `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260604-233135-HUGH_SECOND.runtime-cpu-scenario-matrix.json`
- verifier result: `ok=true`, `fail_count=0`
- route token: `MUSU_CPU_SCENARIO_ROUTE_OK_20260604_233135`
- max role CPU across required scenarios: MUSU `0`, Node `0.03`, WebView2
  `0.39`
- max working set: `490.08MB`
- route probe: `ok=true`

The first manual desktop-open CPU attempt failed only because no owned WebView2
was present; it measured CPU as cold but did not satisfy
`RequireOwnedWebView2`. The installed desktop app was then activated through
AppsFolder and the passing evidence above was recorded with owned WebView2
present.

## Gate Status

Dirty-tree go/no-go after evidence copy reported:

- `local_artifacts_ready=true`
- `single_machine_verified=true`
- `msix_install_verified=true`
- `msix_desktop_entrypoint_verified=true`
- `secret_storage_contract_verified=true`
- runtime idle CPU valid machines: `1` (`HUGH_SECOND`)
- runtime CPU matrix valid machines: `1` (`HUGH_SECOND`)

The runtime CPU gates still report `ok=false` overall because the public release
gate requires two machines. This refresh restores the primary-machine side only.

## Release Interpretation

Packaged primary evidence is current again for commit `26294fa2`.

Public desktop release remains No-Go until real second-PC multi-device evidence,
two-machine CPU/matrix evidence, hosted `musu.pro` P2P control-plane/relay
proof, support mailbox delivery evidence, and Store evidence are complete.
