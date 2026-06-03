# 2026-06-03 Post Relay Proof Store Primary Evidence Refresh

After the relay transport proof store gate, current primary-machine packaged
evidence was refreshed.

Evidence:

- single-machine `20260603-232213-HUGH_SECOND`
- desktop-open CPU `20260603-232423-HUGH_SECOND.desktop-open`
- runtime CPU matrix `20260603-232620-HUGH_SECOND.runtime-cpu-scenario-matrix`

Results:

- smoke output `MUSU_RELEASE_SMOKE_OK_20260603_232146`
- dashboard `http://127.0.0.1:3001`
- bridge `http://127.0.0.1:11952`
- desktop-open CPU `60.046s`, MUSU `0`, Node `0.03`, WebView2 `0.39`,
  hot `0`, working set `462.32MB`
- runtime matrix verifier `ok=true`, `fail_count=0`
- route token `MUSU_CPU_SCENARIO_ROUTE_OK_20260603_232620`
- max matrix CPU: startup MUSU `2.37`, runtime-started MUSU `2.03`,
  dashboard WebView2 `0.1`, desktop WebView2 `0.18`, post-route MUSU `0.03`

Clean go/no-go on `4ab4281f` restored `single_machine_verified=true`,
runtime idle CPU `1/2`, runtime CPU matrix `1/2`, and `manifest_dirty=false`.
Remaining public release blockers are second-PC runtime/multi-device evidence,
hosted relay payload proof, support mailbox evidence, and Store evidence.
