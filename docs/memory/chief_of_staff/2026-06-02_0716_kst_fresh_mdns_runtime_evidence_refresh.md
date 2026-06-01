# 2026-06-02 07:16 KST - Fresh mDNS Runtime Evidence Refresh

After mDNS disconnected-receiver hardening commit
`39a9adf9833acb4324c46c646001c8c1ab622bfa`, fresh primary release evidence was
captured on `HUGH_SECOND`.

Evidence:

- Fresh `local-sideload-manual` MSIX build/install passed for
  `Yellowhama.MUSU_1.15.0.0_x64__ygcjq669as2b6`.
- Single-machine smoke:
  `docs\evidence\single-machine\1.15.0-rc.1\20260602-070642-HUGH_SECOND.evidence.json`,
  output `MUSU_RELEASE_SMOKE_OK_20260602_070616`, bridge
  `http://127.0.0.1:12438`, CLI route checked.
- Desktop-open CPU:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260602-070807-HUGH_SECOND.desktop-open.evidence.json`,
  `git_dirty=false`, MUSU `2`, repo Node `1`, owned WebView2 `6`, hot `0`,
  max one-core CPU `musu=0`, `node=0.05`, `webview2=0.26`.
- Runtime CPU matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260602-070927-HUGH_SECOND.runtime-cpu-scenario-matrix.json`,
  route token `MUSU_CPU_SCENARIO_ROUTE_OK_20260602_070927`, all four scenarios
  pass with hot `0`.

Current go/no-go summary:

- `local_artifacts_ready=true`
- `single_machine_verified=true`
- `msix_install_verified=true`
- `public_metadata_ok=true`
- `runtime_idle_cpu_valid=1/2 [HUGH_SECOND]`
- `runtime_cpu_scenario_matrix_valid=1/2 [HUGH_SECOND]`
- public desktop release remains No-Go because multi-device, second-machine
  CPU/matrix, support mailbox, Store release, and P2P control-plane KV evidence
  remain open.

Interpretation:

- The reported busy-loop is not reproduced on the primary machine after the mDNS
  receive-loop fix.
- Do not mark the busy-loop closed until second-PC CPU and matrix evidence also
  pass.
- Raw machine-wide Node.js counts are diagnostic; release accountability remains
  MUSU-owned helpers, repo-related orphan helpers, CPU hot samples, resource
  budgets, and two-machine evidence.
