# 2026-06-02 08:17 KST — Frontend polling timeout hardening

- Added `taskTimeoutMs` to `musu-bee/src/lib/useLowDutyPolling.ts`.
- Each configured poll run now combines hook cancellation with
  `AbortSignal.timeout`, so hung frontend fetches cannot keep a low-duty poll
  task alive indefinitely.
- Applied explicit timeouts to dashboard aggregate refresh, dashboard
  relay-token lookup, service health, device discovery, node mesh, process,
  agents surface, and bridge-task SSE fallback polling.
- Validation passed:
  - `npx tsx --test src/app/runtime-polling-contract.test.ts` => 7/7
  - `npm run typecheck`
  - `npm run build`
  - `npm run lint -- --quiet`
- This is a runtime source change. It improves idle/busy-loop posture but
  requires fresh MSIX install plus primary smoke/process/CPU/matrix evidence
  before release readiness can be restored for the new HEAD.
