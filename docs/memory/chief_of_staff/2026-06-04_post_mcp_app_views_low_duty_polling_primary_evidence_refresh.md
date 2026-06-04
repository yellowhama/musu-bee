# 2026-06-04 Post MCP App Views Low-Duty Polling Primary Evidence Refresh

- Rebuilt local-sideload MSIX after MCP app views low-duty polling hardening.
- `install-and-verify-msix.ps1 -StartupContract local-sideload-manual
  -ReplaceExisting` passed; HUGH_SECOND still has `.cargo\bin\musu.exe` before
  WindowsApps in PATH, so no new strict MSIX install evidence was recorded from
  that warning-mode state.
- Fresh single-machine smoke was recorded at
  `docs\evidence\single-machine\1.15.0-rc.1\20260604-211929-HUGH_SECOND.evidence.json`
  with dashboard `http://127.0.0.1:3001`, bridge `http://127.0.0.1:10487`,
  output `MUSU_RELEASE_SMOKE_OK_20260604_211856`, and CLI route checked.
- Fresh desktop-open CPU evidence was recorded at
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260604-212016-HUGH_SECOND.desktop-open.evidence.json`;
  it passed for `60.041s` from clean git state with
  `require_owned_webview2=true`, MUSU `0`, Node `0.05`, WebView2 `0.49`,
  owned WebView2 `6`, working set `490.13MB`, and hot `0`.
- Fresh five-state runtime CPU matrix was recorded at
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260604-212147-HUGH_SECOND.runtime-cpu-scenario-matrix.json`;
  verifier passed with `ok=true`, `fail_count=0`, route token
  `MUSU_CPU_SCENARIO_ROUTE_OK_20260604_212147`, max role CPU MUSU `0.03`,
  Node `0.03`, WebView2 `0.39`, max working set `494.64MB`, and hot `0`.
- Public release remains No-Go on actual second-PC multi-device evidence,
  two-machine CPU/matrix evidence, hosted P2P control-plane proof, support
  mailbox evidence, and Store evidence.
