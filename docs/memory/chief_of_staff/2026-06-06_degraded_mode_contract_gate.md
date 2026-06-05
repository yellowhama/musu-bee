# 2026-06-06 degraded mode contract gate

Decision: degraded/fallback truthfulness is now a release contract.

What changed:

- Added `scripts/windows/audit-degraded-mode-contract.ps1` with schema
  `musu.degraded_mode_contract.v1`.
- `write-release-go-no-go.ps1` now exposes
  `degraded_mode_contract_verified` and blocks on `degraded-mode`.
- Final operator packet, handoff status, readiness audit, and packet verifier
  now include the degraded-mode contract.
- `/api/device-status` now returns local status plus fallback source and
  `devices`, instead of returning only fleet array state.
- `npm run test:routes` now includes agents and device-status degraded/fallback
  regressions.

Product lock:

- MUSU Desktop/local runtime executes actual work.
- MUSU.PRO/web can accept input and coordinate rooms, rendezvous, path
  selection, relay fallback, and evidence.
- If local status is missing, stale, or only available through fallback, web/API
  surfaces must show degraded/offline/fallback state instead of fabricated
  healthy state.

Validation:

- PowerShell parser: pass
- `npm run test:routes`: 28/28
- `npm run typecheck`: pass
- degraded mode audit: `ok=true`, `fail_count=0`
- release verifier regressions: `ok=true`, `case_count=51`,
  `failed_case_count=0`

Remaining release blockers:

- second-PC route/CPU/matrix evidence
- hosted MUSU.PRO P2P/relay proof
- support mailbox proof
- Store proof

References:

- GOAL v600
- wiki/775
- `docs/RELEASE_1_15_0_RC1_DEGRADED_MODE_CONTRACT_GATE_2026_06_06.md`
- `docs/RELEASE_1_15_0_RC1_NEXT_STEPS_AFTER_DEGRADED_MODE_GATE_2026_06_06.md`
