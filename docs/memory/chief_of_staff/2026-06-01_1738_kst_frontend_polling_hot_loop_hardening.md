# 2026-06-01 17:38 KST - Frontend polling hot-loop hardening

Context:

- The active release goal still treats idle busy-loop CPU as a P0 blocker.
- Primary CPU evidence is currently clean, but second-PC evidence remains missing.
- The next code-side reduction target was frontend polling/refetch loops.

Changes:

- `musu-bee/src/app/c/[id]/workflows/[wfId]/edit/RunPanel.tsx` moved workflow run status polling from direct `setInterval(..., 2000)` to `useLowDutyPolling` at 5s with terminal-status stop.
- `musu-bee/src/app/app/screen/page.tsx` moved remote screen device refresh from direct `setInterval` to `useLowDutyPolling` and passes AbortSignal through each bridge fetch.
- `musu-bee/src/lib/useAgentsSurface.ts` replaced its custom timeout/visibility loop with `useLowDutyPolling`.
- `musu-bee/src/components/onboarding/useOnboardingFlow.ts` moved onboarding research polling from direct interval to `useLowDutyPolling`.
- `musu-bee/src/app/runtime-polling-contract.test.ts` now asserts these surfaces use `useLowDutyPolling` and do not regress to direct interval loops.

Validation:

- `rg -n "setInterval\(" musu-bee\src -S` returned no matches.
- `npx tsx --test src/app/runtime-polling-contract.test.ts` passed 4/4.
- `npm run typecheck` passed.
- `npm run build` passed.

Status:

- This removes known frontend interval-loop candidates and adds cancellation/backoff discipline.
- It is not a substitute for release evidence; fresh clean 60s CPU evidence is still required on primary and second PC after the next packaged/deployed build.
