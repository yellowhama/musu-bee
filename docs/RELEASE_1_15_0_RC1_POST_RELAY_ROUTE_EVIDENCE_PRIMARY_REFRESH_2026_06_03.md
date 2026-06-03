# MUSU 1.15.0-rc.1 Post Relay Route Evidence Primary Refresh - 2026-06-03

## Scope

This pass restored current primary-machine runtime evidence after commit
`aebd9262b217d4b1570a9fdd94ba41192e3f3ee1` added the P2P relay route evidence
gate.

The refresh covered:

- rebuild and install current local-sideload MSIX
- packaged single-machine smoke through the explicit WindowsApps alias
- 60s desktop-open idle CPU evidence with MUSU, Node, and WebView2 separated
- four-state runtime CPU matrix with a successful post-route probe

## MSIX Build And Install

Command:

```powershell
scripts\windows\run-msix-workflow.ps1 -Configuration release -StartupContract local-sideload-manual -AttemptInstall -VerifyInstalled -ReplaceExisting
```

Result:

- Rust release runtime build passed in `9m 55s`
- Tauri desktop shell build passed
- MSIX packaging passed for
  `.local-build\msix\output\musu_1.15.0.0_x64_local-sideload-manual.msix`
- installed package:
  `Yellowhama.MUSU_1.15.0.0_x64__ygcjq669as2b6`
- packaged startup smoke passed
- installed package contract matched the artifact
- packaged runtime identity reported `distribution=store-msix`

Known local caveat remains unchanged: PATH resolves
`C:\Users\empty\.cargo\bin\musu.exe` before the WindowsApps alias, so runtime
evidence used the explicit packaged alias:

```powershell
& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe"
```

## Evidence

Single-machine smoke:

- `docs\evidence\single-machine\1.15.0-rc.1\20260603-101716-HUGH_SECOND.evidence.json`
- verification:
  `docs\evidence\single-machine\1.15.0-rc.1\20260603-101716-HUGH_SECOND.verification.json`
- summary:
  `docs\evidence\single-machine\1.15.0-rc.1\20260603-101716-HUGH_SECOND.summary.md`
- dashboard task:
  `4e0a38e6-8daf-4435-998c-36590898feb7`
- output:
  `MUSU_RELEASE_SMOKE_OK_20260603_101654`

Desktop-open idle CPU:

- `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260603-100903-HUGH_SECOND.desktop-open.evidence.json`
- captured from clean git state at commit
  `aebd9262b217d4b1570a9fdd94ba41192e3f3ee1`
- sample duration: `60.069s`
- MUSU CPU: `0`
- repo Node CPU: `0.03`
- owned WebView2 CPU: `0.52`
- hot process count: `0`
- process counts: MUSU `2`, Node `1`, WebView2 `6`
- working set after sample: `496.76MB`

Runtime CPU scenario matrix:

- `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260603-101013-HUGH_SECOND.runtime-cpu-scenario-matrix.json`
- captured from clean git state at commit
  `aebd9262b217d4b1570a9fdd94ba41192e3f3ee1`
- route token:
  `MUSU_CPU_SCENARIO_ROUTE_OK_20260603_101013`
- verifier: `ok=true`, `fail_count=0`

Matrix summary:

| Scenario | MUSU | Node | WebView2 | Hot | Working set |
| --- | ---: | ---: | ---: | ---: | ---: |
| runtime-started | 0 | 0 | 0.13 | 0 | 496.08MB |
| dashboard-open | 0 | 0 | 0.18 | 0 | 496.92MB |
| desktop-open | 0 | 0 | 0.26 | 0 | 498.71MB |
| post-route | 0 | 0 | 0.10 | 0 | 497.96MB |

## Validation

- `verify-single-machine-evidence.ps1` passed for
  `20260603-101716-HUGH_SECOND`.
- desktop-open idle CPU evidence reports `ok=true`, clean git,
  `sample_seconds=60.069`, and no resource-budget violations.
- `verify-runtime-cpu-scenario-matrix.ps1` passed for
  `20260603-101013-HUGH_SECOND.runtime-cpu-scenario-matrix`.
- Dirty-tree go/no-go recognized the refreshed primary evidence:
  `single_machine_verified=true`, runtime idle CPU valid machines `1`
  (`HUGH_SECOND`), and runtime CPU matrix valid machines `1` (`HUGH_SECOND`).

## Release Interpretation

The local primary-machine evidence is restored for current HEAD, and the
reported idle busy-loop is not reproduced on the packaged desktop path.

This does not complete public release readiness. The public release gate still
requires:

- second-PC multi-device route evidence
- second-PC desktop-open CPU evidence
- second-PC runtime CPU scenario matrix
- live `musu.pro` P2P owner-scoped relay storage, transport, and route proof
- `musu@musu.pro` mailbox evidence
- Partner Center / Microsoft Store evidence

