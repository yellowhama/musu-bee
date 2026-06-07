# 2026-06-07 Idle Busy-Loop Candidate Audit

Current source-contract and runtime evidence does not reproduce the reported
20% idle CPU issue on HUGH_SECOND.

Evidence:

- Rust background loop audit:
  `docs\evidence\idle-busy-loop-candidates\1.15.0-rc.1\20260607-204601-HUGH_SECOND.rust-background-loop-contract.json`
- Frontend polling audit:
  `docs\evidence\idle-busy-loop-candidates\1.15.0-rc.1\20260607-204601-HUGH_SECOND.frontend-polling-contract.json`
- Runtime idle CPU:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260607-202202-HUGH_SECOND.current-head-after-target-proof.desktop-open.evidence.json`
- Runtime CPU matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260607-202317-HUGH_SECOND.current-head-after-target-proof.runtime-cpu-scenario-matrix.json`

Results:

- Rust background loop audit `ok=true`, `fail_count=0`, unaudited loop hits `0`
- frontend polling audit `ok=true`, `fail_count=0`, low-duty call sites `29`,
  direct interval hits `0`
- go/no-go idle busy-loop candidates `8/8`, unverified `0`
- current one-machine CPU gate under budget

Release meaning:

- source and one-machine runtime evidence are good;
- final CPU release gate still requires second Windows PC evidence;
- next step is second-PC install plus desktop-open CPU, five-state matrix, and
  real second-PC route proof.
