# 2026-06-03 Post Bounded Frontend SSE Primary Evidence Refresh

Decision:

- Commit `4f52269e66c3e1ffdbde9d7936bcd83e4fb4a22c` changed runtime source, so
  primary packaged evidence had to be refreshed.

Evidence:

- single-machine:
  `docs/evidence/single-machine/1.15.0-rc.1/20260603-173637-HUGH_SECOND.evidence.json`
- desktop-open CPU:
  `docs/evidence/runtime-idle-cpu/1.15.0-rc.1/20260603-174002-HUGH_SECOND.desktop-open.evidence.json`
- runtime CPU matrix:
  `docs/evidence/runtime-cpu-scenarios/1.15.0-rc.1/20260603-174322-HUGH_SECOND.runtime-cpu-scenario-matrix.json`

Key numbers:

- smoke output: `MUSU_RELEASE_SMOKE_OK_20260603_173611`
- desktop-open CPU: MUSU `0`, Node `0`, WebView2 `0.29`, hot `0`,
  working set `382.17MB`
- matrix token: `MUSU_CPU_SCENARIO_ROUTE_OK_20260603_174322`
- matrix verifier: `ok=true`, `fail_count=0`
- go/no-go: `single_machine_verified=true`, runtime idle CPU `1/2`,
  runtime CPU matrix `1/2`

Operational note:

- The clean worktree generated a new cert that stalled in non-interactive
  `certutil`; same-version replacement succeeded after repacking with existing
  LocalMachine-trusted cert `9048EA2A9C0891A574C62F9DF2C1D0DA873952DE`.
- Production Next stderr logged `ReferenceError: self is not defined` from the
  workstation route. Treat as separate SSR-boundary hardening work.

Canonical report:

- `docs/RELEASE_1_15_0_RC1_POST_BOUNDED_FRONTEND_SSE_PRIMARY_EVIDENCE_REFRESH_2026_06_03.md`
