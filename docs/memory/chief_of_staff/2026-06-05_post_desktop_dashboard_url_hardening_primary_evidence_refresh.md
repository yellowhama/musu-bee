# 2026-06-05 Post desktop dashboard URL hardening primary evidence refresh

After commit `7293afd6`, the local-sideload MSIX was rebuilt/reinstalled and
HUGH_SECOND packaged local-runtime evidence was refreshed.

Package workflow:

- release runtime build passed
- Tauri desktop shell build passed
- MSIX package generated/signed
- packaged startup smoke passed
- install and installed package contract verification passed
- PATH alias shadowing remains: `.cargo\bin\musu.exe` before WindowsApps alias

Runtime repair:

- `repair-packaged-local-runtime-state.ps1` passed
- bridge `http://127.0.0.1:1181`
- dashboard required `false`

Fresh evidence:

- single-machine `20260605-112337-HUGH_SECOND.evidence.json`
- idle CPU `20260605-112710-HUGH_SECOND.desktop-open.evidence.json`
- runtime matrix `20260605-112906-HUGH_SECOND.runtime-cpu-scenario-matrix.json`
- matrix verification `20260605-112906-HUGH_SECOND.verification.json`

Results:

- single-machine verifier `ok=true`, `fail_count=0`
- idle CPU `git_dirty=false`, 60.055s, MUSU `0`, Node `0`, WebView2 `0.16`,
  working set `363.72MB`, hot `0`
- matrix verifier `ok=true`, `fail_count=0`, route token
  `MUSU_CPU_SCENARIO_ROUTE_OK_20260605_112906`, task
  `37773a7f-6aa3-4f0c-90d7-0317558d044f`, max CPU MUSU `0.03`, Node `0`,
  WebView2 `0.1`

Status: one-machine current-source evidence is restored. Public release remains
blocked on second-PC route/CPU/matrix evidence, hosted P2P release proof,
support mailbox, and Store evidence.
