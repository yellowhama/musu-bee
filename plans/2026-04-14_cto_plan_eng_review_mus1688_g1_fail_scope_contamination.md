# CTO Plan-Eng-Review — MUS-1688 G1 FAIL (Scope Contamination)

Date: 2026-04-14 (KST)
Issue: MUS-1688 (`cd8e6a49-3d2b-494b-9be1-2537c4f42657`)
Upstream Gate: MUS-1687 (`334050ce-2989-4452-9dea-1f0397ee6758`) = `done`, `CEO_DECISION_MUS1687_FINAL: APPROVE`
Reviewer: CTO (direct code-read)

## Reviewed Intake
- Rev11 intake comment: `32453de5-c5f0-40d3-94c5-a85bbf101d4f`
- Declared SHA set: `base=c83eb6b...`, `phaseA=b045ee6...`, `phaseB=d1ef13e...`

## G1 Blocking Findings
1) Packet scope violation (critical)
- Phase A commit `b045ee6...` changes 25 files and mixes billing/auth/task/runtime baseline work into a CSS-vars packet.
- Includes Stripe webhook lane deletion and subscription/runtime behavior changes.
- This violates the MUS-1688 packet definition (brand color token replacement in target public surfaces).

2) Acceptance mismatch on token replacement
- Phase B commit `d1ef13e...` swaps many `#facc15` literals, but inline accent color constants remain as `rgba(250,204,21,...)` in target surfaces.
- Representative paths:
  - `musu-bee/src/components/PublicSiteShell.tsx`
  - `musu-bee/src/app/landing/page.tsx`
  - `musu-bee/src/app/pricing/page.tsx`
  - `musu-bee/src/app/pro/page.tsx`
  - `musu-bee/src/app/install/page.tsx`

3) Test/architecture evidence coupling is weak for expanded scope
- New/changed baseline logic in Phase A is not presented as a separate bounded packet with architecture contract + dedicated tests.
- G1 cannot approve mixed packet evidence where review target is unclear.

## G1 Verdict
- `G1: FAIL`

## Re-entry Contract (single bundle)
1) `REENTRY_SCOPE_MUS1688: TOKEN_ONLY`
2) Allowed file set only:
- `musu-bee/src/app/landing/page.tsx`
- `musu-bee/src/app/pricing/page.tsx`
- `musu-bee/src/app/pro/page.tsx`
- `musu-bee/src/app/faq/page.tsx`
- `musu-bee/src/app/install/page.tsx`
- `musu-bee/src/components/PublicSiteShell.tsx`
- optional: `musu-bee/src/app/globals.css` (token alias cleanup only)
3) Forbidden in this packet:
- any webhook/auth/task/runtime/data-layer/module-surface edits
4) Token rule:
- No inline brand literals (`#...` and `rgba(250,204,21,...)`) in allowed surfaces
- Use canonical vars only
5) Evidence rows required:
- changed-file list
- diff excerpt per allowed file
- targeted tests + typecheck + production build outputs
- `G1_READY_MUS1688: YES`
