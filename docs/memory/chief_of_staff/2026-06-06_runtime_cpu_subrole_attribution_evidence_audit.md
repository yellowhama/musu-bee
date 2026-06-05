# 2026-06-06 runtime CPU subrole attribution evidence audit

Runtime CPU evidence now separates MUSU-owned process subroles:
`musu_runtime`, `bridge_runtime`, `desktop_shell`, `node_helper`,
`webview2_helper`, and `other`.

What changed:

- `measure-musu-idle-cpu.ps1` records `bridge_registry`,
  `process_subrole`, `process_counts_by_subrole`,
  `memory_totals_by_subrole_mb`, `max_one_core_percent_by_subrole`, and
  `bridge_registry_pid_match`.
- Runtime CPU matrices preserve the same fields per scenario.
- The matrix verifier and go/no-go gate reject missing bridge runtime subrole
  evidence.
- Verifier regression coverage now has `44` cases and rejects a matrix missing
  `bridge_runtime`.

Fresh HUGH_SECOND evidence:

- single-machine:
  `docs\evidence\single-machine\1.15.0-rc.1\20260606-013337-HUGH_SECOND.evidence.json`
- idle CPU:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260606-011243-HUGH_SECOND.desktop-open.evidence.json`
- runtime CPU matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260606-012030-HUGH_SECOND.runtime-cpu-scenario-matrix.json`
- targeted HUGH-MAIN route CPU:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260606-012740-HUGH_SECOND.runtime-cpu-scenario-matrix.json`

Clean go/no-go after `d2296c4c`:

- local artifacts, MSIX install, and single-machine are true
- runtime idle CPU valid machines `1/2 [HUGH_SECOND]`
- runtime CPU matrix valid machines `1/2 [HUGH_SECOND]`
- targeted second-PC route CPU valid machines `1/1 [HUGH_SECOND]`
- public release remains No-Go with blockers: multi-device, second-PC idle CPU,
  second-PC runtime matrix, hosted P2P control plane, support mailbox, and Store

Product boundary remains unchanged: MUSU Desktop is the local executor.
MUSU.PRO is remote input, project/company room, rendezvous, path-selection,
relay fallback policy, and evidence control plane; it is not the default
execution server or payload data path.
