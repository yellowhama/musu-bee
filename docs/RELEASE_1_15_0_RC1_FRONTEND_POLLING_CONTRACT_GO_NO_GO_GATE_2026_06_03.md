# MUSU 1.15.0-rc.1 Frontend Polling Contract Go/No-Go Gate

Date: 2026-06-03

## Summary

The frontend polling contract is now a release go/no-go gate instead of only a
web CI test.

New script:

- `scripts\windows\audit-frontend-polling-contract.ps1`
- schema: `musu.frontend_polling_contract.v1`

The audit checks that frontend refresh paths continue to use the shared
cancellable low-duty polling and bounded reconnect contracts:

- `useLowDutyPolling.ts` has a 5s minimum interval clamp, 10s default task
  timeout, hidden-tab backoff, in-flight suppression, timeout/cleanup abort
  signals, and the only direct `visibilitychange` listener.
- Dashboard, node panel, workflow run status, remote screen, agents surface,
  and onboarding refresh paths use `useLowDutyPolling`.
- Dashboard relay connect remains on demand and relay reconnect stays capped.
- Chat SSE and Fleet SSE reconnect paths remain bounded and clear stale timers.
- `/dashboard/fleet` and `/dashboard/agent/[id]` close Fleet SSE on unmount.
- non-test frontend source has no direct `setInterval(` calls.
- non-test frontend source has no direct `visibilitychange` listeners outside
  the shared poller.
- `npm run test:runtime-polling` remains present and wired into GitHub Actions.

## Release Gate Wiring

`write-release-go-no-go.ps1` now invokes the frontend polling audit and reports:

- `frontend_polling_contract_verified`
- `frontend_polling_contract_audit`

If the audit fails, go/no-go adds blocker area `frontend-polling`.

The change is release/status tooling only. It does not change runtime source, so
fresh primary CPU evidence remains release-current when the only delta is this
audit/go/no-go/operator tooling plus docs.

## Operator Packet Wiring

The final operator packet now includes the audit script and README gate:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\audit-frontend-polling-contract.ps1 -FailOnProblem -Json
```

`verify-final-operator-gate-packet.ps1` now self-checks that:

- the audit script is included in the packet
- the README references `musu.frontend_polling_contract.v1`
- `write-release-go-no-go.ps1` blocks on `frontend-polling`
- `show-final-release-handoff-status.ps1` gives an operator step when the
  frontend polling contract is not verified

## Validation

Passed before commit:

- PowerShell parser checks for changed release scripts
- `scripts\windows\audit-frontend-polling-contract.ps1 -Json`
  - `ok=true`
  - `fail_count=0`
  - `direct_interval_hit_count=0`
  - `direct_visibility_listener_hit_count=0`
- `npm run test:runtime-polling`
  - 12/12 passed
- `scripts\windows\test-release-evidence-verifiers.ps1 -Json`
  - `ok=true`
  - `case_count=20`
  - `failed_case_count=0`

`prepare-final-operator-gate-packet.ps1 -IncludeDesktopShell -Json` correctly
refused to run from the dirty worktree. The packet must be regenerated after the
commit, which preserves the final handoff rule that operator archives are built
from a clean commit.

## Current Release Interpretation

This closes a release-gate visibility gap for frontend busy-loop prevention. It
does not close public release by itself.

Public release remains No-Go until the existing blockers are completed:

- second-PC multi-device evidence
- runtime idle CPU on 2 machines
- runtime CPU scenario matrix on 2 machines
- hosted `musu.pro` P2P control-plane and relay payload proof
- support mailbox evidence
- Partner Center/Store release evidence
