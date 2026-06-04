# 2026-06-04 Post Secret Storage Primary Evidence Refresh

- After commit `26294fa2`, rebuilt and reinstalled the local-sideload MSIX with
  `run-msix-workflow.ps1 -Configuration release -StartupContract
  local-sideload-manual -AttemptInstall -VerifyInstalled -ReplaceExisting`.
- MSIX build/install/packaged startup smoke passed; installed package is
  `Yellowhama.MUSU_1.15.0.0_x64__ygcjq669as2b6`.
- HUGH_SECOND still has warning-mode `.cargo\bin\musu.exe` PATH shadowing, so
  packaged checks used the explicit WindowsApps alias.
- Single-machine smoke passed at
  `docs\evidence\single-machine\1.15.0-rc.1\20260604-232809-HUGH_SECOND.evidence.json`
  with dashboard `http://127.0.0.1:3001`, bridge `http://127.0.0.1:1823`,
  task `8877c18b-866a-405c-9f61-a097cc5d0301`, and output
  `MUSU_RELEASE_SMOKE_OK_20260604_232737`.
- Desktop-open CPU passed at
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260604-233024-HUGH_SECOND.desktop-open.evidence.json`
  with MUSU `0.05`, Node `0.03`, WebView2 `0.6`, owned WebView2 `6`, working
  set `487.21MB`, and hot `0`.
- Runtime matrix passed at
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260604-233135-HUGH_SECOND.runtime-cpu-scenario-matrix.json`
  with route token `MUSU_CPU_SCENARIO_ROUTE_OK_20260604_233135`, max role CPU
  MUSU `0`, Node `0.03`, WebView2 `0.39`, max working set `490.08MB`, and
  route probe ok.
- Go/no-go sees primary runtime CPU and matrix as valid on `HUGH_SECOND` only;
  public release is still No-Go until second-PC CPU/matrix and the other
  external gates pass.
