# MUSU 1.15.0-rc.1 Post MCP App Views Low-Duty Polling Primary Evidence Refresh

Date: 2026-06-04 21:28 KST

## Summary

Fresh primary-machine packaged evidence was restored after the MCP app views
low-duty polling hardening.

The source change removed direct polling intervals from the separate Vite MCP
app views and expanded the frontend polling audit to cover both `musu-bee\src`
and `musu-bee\views`.

## Evidence

- single-machine smoke:
  `docs\evidence\single-machine\1.15.0-rc.1\20260604-211929-HUGH_SECOND.evidence.json`
- desktop-open CPU:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260604-212016-HUGH_SECOND.desktop-open.evidence.json`
- five-state runtime CPU matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260604-212147-HUGH_SECOND.runtime-cpu-scenario-matrix.json`

## Results

- Rebuilt local-sideload MSIX:
  `.local-build\msix\output\musu_1.15.0.0_x64_local-sideload-manual.msix`.
- `install-and-verify-msix.ps1 -StartupContract local-sideload-manual
  -ReplaceExisting` passed. HUGH_SECOND still has `.cargo\bin\musu.exe`
  before the WindowsApps alias, so no new strict MSIX install evidence was
  recorded from that warning-mode state.
- Smoke passed with dashboard `http://127.0.0.1:3001`, bridge
  `http://127.0.0.1:10487`, dashboard task
  `f073acec-efa7-468e-a4f0-921fbdcd9811`, dashboard output
  `MUSU_RELEASE_SMOKE_OK_20260604_211856`, and CLI route checked.
- Desktop-open CPU passed for `60.041s` from clean git state with
  `require_owned_webview2=true`, MUSU `0`, Node `0.05`, WebView2 `0.49`,
  owned WebView2 `6`, working set `490.13MB`, and hot process count `0`.
- Five-state matrix passed verifier `ok=true`, `fail_count=0`, route token
  `MUSU_CPU_SCENARIO_ROUTE_OK_20260604_212147`, all required scenarios present,
  startup sample delay `2.014s`, max role CPU MUSU `0.03`, Node `0.03`,
  WebView2 `0.39`, max working set `494.64MB`, and hot process count `0`.

## Release Note

Primary-machine evidence is current again for the MCP app views polling
hardening source. Public release remains blocked until actual second-PC
runtime/multi-device evidence, two-machine CPU/matrix evidence, hosted
`musu.pro` P2P control-plane proof, `musu@musu.pro` mailbox evidence, and Store
evidence are complete.
