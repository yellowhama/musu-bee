# 2026-06-03 Bounded Frontend SSE Hardening

Decision:

- Dashboard mount-time SSE subscriptions should not rely on the browser's
  unbounded `EventSource` auto-retry loop.
- A shared `useBoundedEventSource` hook now owns failed-stream close,
  capped reconnect, hidden-document close, and stale-generation handling.

Changed:

- `musu-bee/src/lib/useBoundedEventSource.ts`
- `musu-bee/src/app/fleet/page.tsx`
- `musu-bee/src/app/c/[id]/page.tsx`
- `musu-bee/src/app/m/[id]/page.tsx`
- `musu-bee/src/components/TasksPanel.tsx`
- `musu-bee/src/app/runtime-polling-contract.test.ts`

Validation:

- `npm run test:runtime-polling` passed `14/14`
- `npm run typecheck` passed
- `npm run build` passed
- `git diff --check` passed with only the existing CRLF normalization warning
  for `TasksPanel.tsx`

Release interpretation:

- This removes another frontend busy-loop candidate.
- This is runtime source; fresh clean packaged MSIX/smoke/CPU/matrix evidence
  is required after commit before current-HEAD primary packaged evidence can be
  claimed.
- Public release remains No-Go on second-PC runtime/multi-device evidence,
  hosted relay payload proof, support mailbox evidence, and Store evidence.

Canonical report:

- `docs/RELEASE_1_15_0_RC1_BOUNDED_FRONTEND_SSE_HARDENING_2026_06_03.md`
