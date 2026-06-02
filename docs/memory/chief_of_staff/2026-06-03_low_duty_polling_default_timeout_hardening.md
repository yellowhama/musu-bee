# 2026-06-03 Low-Duty Polling Default Timeout Hardening

Frontend shared polling now has a default task timeout. `useLowDutyPolling`
defines `DEFAULT_LOW_DUTY_POLL_TASK_TIMEOUT_MS = 10_000` and applies it when a
caller omits `taskTimeoutMs`, so shared polling tasks get
`AbortSignal.timeout(...)` / `AbortSignal.any(...)` cancellation by default.

The contract test was updated to assert the constant and default binding.

Validation passed:

- `npx tsx --test src/app/runtime-polling-contract.test.ts` - 10/10
- `npm run typecheck`
- `npm run build`
- `git diff --check`

Qualitative result: this reduces frontend polling hang/overlap risk but does
not prove the user's busy-loop report is fully closed. The next evidence gate
is a fresh MSIX rebuild/primary evidence refresh plus second-PC CPU/matrix/route
evidence. `musu.pro` P2P also remains blocked on missing KV/Upstash credentials
and owner-scoped relay lease proof.

