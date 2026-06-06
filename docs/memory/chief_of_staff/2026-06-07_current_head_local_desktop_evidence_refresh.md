# 2026-06-07 Current-HEAD Local Desktop Evidence Refresh

Current HEAD `2b9ff2e1415aaf857bae2a1d3a6a9d6d77174b4e` has fresh packaged
MUSU Desktop local evidence on `HUGH_SECOND`.

Evidence promoted to docs:

- single-machine: `20260607-054358-HUGH_SECOND`
- process ownership: `20260607-053318-HUGH_SECOND`
- startup single-instance: `20260607-053336-HUGH_SECOND`
- desktop single-instance: `20260607-053413-HUGH_SECOND`
- desktop-open CPU: `20260607-053429-HUGH_SECOND.desktop-open`
- five-state CPU matrix: `20260607-053555-HUGH_SECOND.runtime-cpu-scenario-matrix`

Key results:

- `local-bridge-only`
- bridge `http://127.0.0.1:1158`
- `single_machine_verified=true` after docs evidence promotion
- runtime idle CPU valid machines `1 [HUGH_SECOND]`
- runtime CPU matrix valid machines `1 [HUGH_SECOND]`
- desktop-open CPU hot `0`, WebView2 max `0.05`
- matrix hot `0`, WebView2 max `0.13`
- full local post-route token `MUSU_CPU_SCENARIO_ROUTE_OK_20260607_053555`

Interpretation:

- `localhost:3001` refusal is not a packaged MUSU Desktop runtime failure.
- MUSU Desktop remains the local executor.
- MUSU.PRO remains remote input, room/meeting, rendezvous, path-selection,
  relay-fallback, and evidence/control plane.
- Public release remains No-Go on second-PC route/CPU/matrix, clean targeted
  route-attempt CPU, hosted P2P/relay proof, support mailbox, and Store proof.

Do not use the dirty `20260607-054927-HUGH_SECOND` targeted HUGH-MAIN CPU
diagnostic as release evidence; it was captured after docs evidence dirtied the
tree.
