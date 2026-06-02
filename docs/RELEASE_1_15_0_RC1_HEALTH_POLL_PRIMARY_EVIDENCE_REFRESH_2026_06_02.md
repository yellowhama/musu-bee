# Release 1.15.0-rc.1 Health Poll Primary Evidence Refresh

Date: 2026-06-02 10:51 KST  
Wiki id: wiki/545

## Scope

This refresh rebuilds and reinstalls the primary Windows MSIX after the bridge
health poll backoff hardening commit `1990b60b7e0b9f093c62bc48fa9b101a3f035c1b`.

Build/install command:

```powershell
$env:CARGO_BUILD_JOBS='1'
$env:CARGO_INCREMENTAL='0'
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\windows\run-msix-workflow.ps1 `
  -Configuration release `
  -StartupContract local-sideload-manual `
  -SkipSmoke `
  -AttemptInstall `
  -VerifyInstalled `
  -ReplaceExisting
```

Result:

- release Rust build completed in `16m 06s`
- Tauri desktop shell build passed
- MSIX package created and signed:
  `.local-build\msix\output\musu_1.15.0.0_x64_local-sideload-manual.msix`
- installed package:
  `Yellowhama.MUSU_1.15.0.0_x64__ygcjq669as2b6`
- installed contract matched the artifact:
  `musu-desktop.exe` application, `musu.exe` CLI alias, `musu-startup.exe`
  startup task
- known local caveat remains: this developer shell resolves
  `C:\Users\empty\.cargo\bin\musu.exe` before the WindowsApps alias, so package
  evidence uses the explicit WindowsApps alias.

## Evidence

All primary runtime samples below were captured from clean git state on commit
`1990b60b7e0b9f093c62bc48fa9b101a3f035c1b`.

| Gate | Evidence | Result |
| --- | --- | --- |
| Desktop single-instance | `docs\evidence\desktop-single-instance\1.15.0-rc.1\20260602-104113-HUGH_SECOND.desktop-single-instance.json` | Pass: baseline `1`, after `1`, new shell `0` |
| Process ownership | `docs\evidence\process-ownership\1.15.0-rc.1\20260602-104113-HUGH_SECOND.process-ownership.json` | Pass: runtime `1`, desktop `1`, owned Node `0`, owned WebView2 `6`, machine-wide Node `18` |
| Single-machine smoke | `docs\evidence\single-machine\1.15.0-rc.1\20260602-104202-HUGH_SECOND.evidence.json` | Pass: task `4204b978-d662-4762-938f-05519e6bfa85`, bridge `http://127.0.0.1:9805`, CLI route checked |
| Desktop-open CPU | `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260602-104113-HUGH_SECOND.desktop-open.evidence.json` | Pass: `git_dirty=false`, hot `0`, MUSU `0`, Node `0.03`, WebView2 `0.18`, working set `501.1MB` |
| Four-state CPU matrix | `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260602-104331-HUGH_SECOND.runtime-cpu-scenario-matrix.json` | Pass: `git_dirty=false`, route token `MUSU_CPU_SCENARIO_ROUTE_OK_20260602_104331`, max WebView2 `0.31` |

## Qualitative Assessment

The health-poll backoff change did not introduce a primary idle CPU regression.
On `HUGH_SECOND`, the packaged desktop/runtime remains well under the 5% of one
logical core release budget across desktop-open and the four matrix states.

The operator-reported busy-loop is still not globally closed. The release gate
requires the same runtime idle CPU and matrix evidence on a second Windows PC.

## Remaining Blockers

Public release remains No-Go until:

1. second-PC desktop-open CPU evidence passes
2. second-PC four-state runtime CPU matrix evidence passes
3. release-grade multi-device route evidence is recorded
4. live `musu.pro` P2P relay lease evidence proves owner scope and production
   storage
5. `musu@musu.pro` receive/forward evidence is recorded
6. Microsoft Store / Partner Center evidence is recorded
