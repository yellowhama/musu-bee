# 2026-06-03 Frontend polling contract go/no-go gate

Durable fact:

- Added `scripts/windows/audit-frontend-polling-contract.ps1` with schema
  `musu.frontend_polling_contract.v1`.
- The audit verifies shared frontend low-duty polling, interval clamp, default
  task timeout, cleanup/timeout abort signals, no direct non-test `setInterval`,
  no direct `visibilitychange` listener outside `useLowDutyPolling`, bounded
  dashboard relay reconnect, bounded Chat/Fleet SSE reconnect, Fleet SSE
  unmount cleanup, runtime-polling test coverage, package script, and CI wiring.
- `write-release-go-no-go.ps1` now emits
  `frontend_polling_contract_verified` and `frontend_polling_contract_audit`,
  and adds a `frontend-polling` blocker if the audit fails.
- Final operator packet generation/verification and handoff status now include
  the frontend polling audit.

Validation:

- PowerShell parser checks passed.
- `audit-frontend-polling-contract.ps1 -Json` passed with `ok=true`,
  `fail_count=0`, `direct_interval_hit_count=0`, and
  `direct_visibility_listener_hit_count=0`.
- `npm run test:runtime-polling` passed 12/12.
- release evidence verifier regressions passed 20/20.

Release interpretation:

- This is release/status tooling, not runtime source, so it should not stale
  current primary runtime CPU evidence.
- Public release remains No-Go on second-PC, two-machine CPU/matrix, hosted P2P,
  support mailbox, and Store evidence.
