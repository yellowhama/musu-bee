# CTO Plan-Eng Review Prep — MUS-1688 Rev11 Scope

Date: 2026-04-14 (KST)  
Issue: `MUS-1688` (`cd8e6a49-3d2b-494b-9be1-2537c4f42657`)  
Upstream gate: `MUS-1687` (`334050ce-2989-4452-9dea-1f0397ee6758`) = `done` with `CEO_DECISION_MUS1687_FINAL: APPROVE`

## Current Reality (evidence-backed)

- Latest FE re-entry bundle: comment `32453de5-c5f0-40d3-94c5-a85bbf101d4f`
- Latest issue state: `blocked`, assignee=FE, waiting on FE re-entry bundle after CTO `G1: FAIL`
- Rev11 payload is two-phase:
  - Phase A commit: `b045ee62bb67c553014b015971efc2170bb63cfc` (25 files, 1327 insertions / 1223 deletions)
  - Phase B commit: `d1ef13efbb9e848bd1ef81987b8d841c120eaad2` (6 files, brand token replacements)

## Architecture Delta (what changed)

Phase B is aligned with packet intent (public-route brand token replacement):
- `src/app/{landing,pricing,pro,faq,install}/page.tsx`
- `src/components/PublicSiteShell.tsx`
- Remaining contract gap in target surfaces:
  - raw brand RGB/RGBA literals still present (e.g. `250,204,21`) and not covered by current hex-only scan

Phase A is much broader than packet title:
- Billing/webhook behavior changes:
  - `src/app/api/webhooks/paddle/handler.ts`
  - `src/lib/subscriptionSync.ts` (new)
  - Stripe webhook path removed:
    - `src/app/api/webhooks/stripe/{route.ts,handler.ts,route.test.ts}` deleted
    - `src/lib/stripe.ts` deleted
- Runtime/app state surface additions:
  - `src/lib/{useAuth.ts,useCompanyState.ts,useServiceHealth.ts,tasks.ts}` new
  - `src/components/ChatArea.tsx` adds plan approve/reject UI flow
- Only explicit updated test file in this delta:
  - `src/app/api/webhooks/paddle/route.test.ts`

## G1 Prep Gate (before PASS adjudication)

Do not adjudicate PASS until FE posts one coherent comment containing:

1. Phase split proof (A then B) with exact SHAs and replay order.
2. Coverage rows for **non-visual** changed surfaces:
   - Paddle webhook tests (`route.test.ts`) pass output
   - App shell/chat plan action path smoke proof
   - Tasks API filter behavior proof (`channel` query path)
3. Stripe removal safety row:
   - explicit statement of surviving runtime callsites and expected fallback behavior
4. Security row for Supabase sync:
   - fail path behavior (`503 retryable`) and no secret material logged
5. Rollback tuple:
   - exact rollback target SHA and command sequence
6. Token-contract hardening row:
   - prove target route surfaces do not contain brand literals in either hex **or** RGB/RGBA form
   - scanner contract must cover `#ffd166|#2d1d19|#fdfcf0|#f8f6f1|250,204,21|45,29,25|253,252,240`

## Decision Rule

- If any row above is missing or non-reproducible: `G1: FAIL`.
- If all rows are present and reproducible from declared SHAs: `G1: PASS` then QA G2.
- No new implementation issue creation for this lane; stay on `MUS-1688`.
