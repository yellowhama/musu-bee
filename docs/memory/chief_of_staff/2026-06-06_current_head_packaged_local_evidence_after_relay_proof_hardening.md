# 2026-06-06 current HEAD packaged local evidence after relay proof hardening

Current HEAD `83e8bd415432529474930bcf54c6408847c0ad24` was rebuilt into the
local-sideload MSIX, reinstalled, and refreshed on `HUGH_SECOND`.

Evidence:

- MSIX install:
  `docs\evidence\msix-install\1.15.0-rc.1\20260606-141418-HUGH_SECOND.evidence.json`
- single-machine:
  `docs\evidence\single-machine\1.15.0-rc.1\20260606-140158-HUGH_SECOND.evidence.json`
- desktop-open CPU:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260606-140222-HUGH_SECOND.desktop-open.evidence.json`
- full runtime matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260606-140335-HUGH_SECOND.runtime-cpu-scenario-matrix.json`
- targeted HUGH-MAIN route CPU diagnostic:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260606-140947-HUGH_SECOND.runtime-cpu-scenario-matrix.json`

Key results:

- single-machine `ok=true`, `local-bridge-only`, bridge
  `http://127.0.0.1:8179`
- desktop-open CPU `ok=true`, `git_dirty=false`, `60.038s`,
  WebView2 max `0.16`, hot process `0`
- full matrix `ok=true`, route token
  `MUSU_CPU_SCENARIO_ROUTE_OK_20260606_140335`, route task
  `041f5d11-e26c-4122-bb86-4c9b687848a5`
- targeted HUGH-MAIN diagnostic `ok=true`, failed route allowed, timeout to
  `192.168.1.192:8949`, post-route WebView2 max `0.05`, hot process `0`
- go/no-go before commit restored primary counts to single-machine true,
  runtime idle CPU `1/2`, runtime matrix `1/2`, and targeted second-PC route
  CPU diagnostic `1/1`

Qualitative evaluation:

- no high or medium issue found
- local 20% idle CPU issue is not reproduced on current packaged HUGH_SECOND
- remaining blockers are real second-PC evidence, hosted MUSU.PRO P2P release
  proof, support mailbox, and Store evidence

Product boundary:

- MUSU Desktop is the local executor.
- MUSU.PRO is remote input, project/company room, rendezvous, path-selection,
  relay-fallback policy, and evidence/control plane.
