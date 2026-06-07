# 2026-06-07 - Current-Head Local Desktop Evidence After Relay Metadata Gate

Current packaged local desktop evidence was refreshed on `HUGH_SECOND` after
the release relay tunnel submit metadata gate changed Rust runtime source.

Evidence promoted:

- MSIX install: `20260607-090353-HUGH_SECOND`
- single-machine: `20260607-090436-HUGH_SECOND`
- process ownership: `20260607-090457-HUGH_SECOND`
- startup single-instance: `20260607-090512-HUGH_SECOND`
- desktop single-instance: `20260607-090550-HUGH_SECOND`
- desktop-open idle CPU: `20260607-092453-HUGH_SECOND`
- five-state CPU matrix: `20260607-091438-HUGH_SECOND`
- HUGH-MAIN target-route CPU attempt: `20260607-092030-HUGH_SECOND`

Results:

- single-machine `ok=true`, `local-bridge-only`,
  bridge `http://127.0.0.1:14361`
- process ownership `ok=true`, runtime `1`, owned Node `0`, owned WebView2
  `0`, orphan helpers `0`
- startup single-instance reused bridge PID `34860`
- desktop single-instance kept one packaged desktop shell after three
  activations
- idle CPU `ok=true`, `60.03s`, hot `0`, owned WebView2 `6`, WebView2 max
  one-core `0.18`
- five-state matrix `ok=true`, route probe success, max WebView2 one-core
  `0.16`
- target-route CPU `ok=true` for `HUGH-MAIN` failed route attempt with allowed
  failure, post-route CPU max WebView2 `0.03`

Clean go/no-go after evidence promotion:

- `local_artifacts_ready=true`
- `single_machine_verified=true`
- `msix_install_verified=true`
- `process_ownership_verified=true`
- `startup_single_instance_verified=true`
- `desktop_single_instance_verified=true`
- `runtime_idle_cpu_valid_machine_count=1`
- `runtime_cpu_scenario_matrix_valid_machine_count=1`
- `runtime_cpu_second_pc_route_attempt_verified=true`
- `ready_for_public_desktop_release=false`

Qualitative status: no high/medium issue found. Public release remains blocked
by second-machine idle/matrix evidence, real multi-device evidence, hosted
MUSU.PRO P2P/relay proof, support mailbox proof, and Store proof.
