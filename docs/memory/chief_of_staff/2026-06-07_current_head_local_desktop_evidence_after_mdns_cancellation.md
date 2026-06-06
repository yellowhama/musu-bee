# 2026-06-07 Current-HEAD Local Desktop Evidence After mDNS Cancellation

Current HEAD `24f360409efcf776e3e7196e7d1f01d27d7d8eb9` was rebuilt,
reinstalled, and rechecked on `HUGH_SECOND` after mDNS cancellation hardening.

Package:

- MSIX workflow passed with `-Configuration release`
- startup contract: `local-sideload-manual`
- package: `Yellowhama.MUSU_1.15.0.0_x64__ygcjq669as2b6`
- installed package contract passed
- current PowerShell still has PATH alias shadowing, so evidence used explicit
  WindowsApps alias

Evidence promoted:

- single-machine:
  `20260607-065454-HUGH_SECOND.evidence.json`
- single-machine verification:
  `20260607-065454-HUGH_SECOND.verification.json`
- process ownership:
  `20260607-065525-HUGH_SECOND.process-ownership.json`
- startup single-instance:
  `20260607-065544-HUGH_SECOND.startup-single-instance.json`
- desktop single-instance:
  `20260607-065620-HUGH_SECOND.desktop-single-instance.json`
- desktop-open idle CPU:
  `20260607-065630-HUGH_SECOND.desktop-open.evidence.json`
- five-state matrix:
  `20260607-065748-HUGH_SECOND.runtime-cpu-scenario-matrix.json`
- matrix verification:
  `20260607-065748-HUGH_SECOND.verification.json`

Results:

- single-machine verifier: `ok=true`, `fail_count=0`
- local surface: `local-bridge-only`
- bridge: `http://127.0.0.1:9020`
- process ownership: packaged runtime `1`, owned Node `0`, owned WebView2 `0`,
  repo orphan helpers `0`
- startup single-instance: repeated `musu up` reused bridge PID `10828`
- desktop single-instance: new packaged desktop PID `44540`, activation
  failures `0`
- desktop-open CPU: `60.032s`, hot `0`, WebView2 max one-core `0.23`,
  working set `362.39MB`
- matrix verifier: `ok=true`, `fail_count=0`
- matrix route token: `MUSU_CPU_SCENARIO_ROUTE_OK_20260607_065748`
- matrix route task: `31a7ad5a-d5fa-4731-b896-c490e6f5deb1`
- matrix max WebView2 one-core: `0.13`
- matrix max working set: `365.78MB`

Dirty go/no-go after promotion:

- `single_machine_verified=true`
- `process_ownership_verified=true`
- `startup_single_instance_verified=true`
- `desktop_single_instance_verified=true`
- `runtime_idle_cpu_valid_machine_count=1`
- `runtime_cpu_scenario_matrix_valid_machine_count=1`
- `runtime_cpu_second_pc_route_attempt_valid_machine_count=0`
- `p2p_control_plane_env_ready=false`

Qualitative status:

- no high/medium issue found
- one-machine local CPU evidence is current again
- public release remains blocked by second-PC route/CPU/matrix, hosted P2P,
  support mailbox, and Store proof
- low concern: release build warnings remain for source-contract relay hooks and
  legacy mDNS wrapper

Search terms: `GOAL v758`, `wiki/933`, `current-head local desktop evidence
after mDNS cancellation`, `20260607-065454-HUGH_SECOND`, `20260607-065630`,
`20260607-065748`, `MUSU_CPU_SCENARIO_ROUTE_OK_20260607_065748`,
`31a7ad5a-d5fa-4731-b896-c490e6f5deb1`, `127.0.0.1:9020`, and
`WebView2 0.23`.
