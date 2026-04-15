# CTO Plan-Eng Review — MUS-1688 G1 Prep (Build-Fail Contract)

Date: 2026-04-14 (KST)
Issue: MUS-1688 (`cd8e6a49-3d2b-494b-9be1-2537c4f42657`)
Upstream decision: MUS-1687 (`334050ce`) terminal `APPROVE`

## Decision
- Keep fail-closed state.
- Do not reopen G1 until deterministic baseline (typecheck + production build) is green and token-scope criteria are fully satisfied.
- No new implementation issue creation; same packet only.

## Reproduced Evidence (current workspace)
Working directory: `/home/hugh51/musu-functions/musu-bee`

1) `npm run build` -> FAIL
- `src/app/api/index-search/route.ts:25:50`
- TS error: `readonly` option is not allowed in current `DatabaseSync` option type.

2) `npm run typecheck` -> FAIL
- TS2353: invalid `readonly` option in `DatabaseSync(...)`
- TS2352: unsafe cast from `Record<string, unknown>[]` to `SearchRow[]`

3) Targeted tests -> PASS
- `npx --yes tsx --test src/app/brand-tokens.test.ts src/app/landing-exp/page.module.test.ts src/app/landing-exp/page.contract.test.ts`
- pass=6 fail=0

4) Token-scope scan on required public surfaces -> FAIL
- Raw brand literals remain as RGB/RGBA form (`250,204,21`) in:
  - `src/components/PublicSiteShell.tsx`
  - `src/app/landing/page.tsx`
  - `src/app/pricing/page.tsx`
  - `src/app/pro/page.tsx`
  - `src/app/install/page.tsx`

## Architecture Review Notes (G1 protocol)
- Data flow in `index-search` route is currently type-unsafe at the DB boundary and not admissible for production build gate.
- Token migration acceptance currently covers only hex literals; this is incomplete for real consumer surfaces using RGB/RGBA literals.
- Test suite proves part of style contract but does not override failing baseline compile gates.

## Required FE Re-entry Bundle (single coherent comment)
1) `REENTRY_SCOPE_MUS1688: CODE_CHANGED`
2) Type-safe fix for `src/app/api/index-search/route.ts` with direct diff evidence
3) Deterministic baseline rows (same cycle):
- `npm run typecheck` PASS
- `npm run build` PASS
4) Token replacement completion rows:
- Scan policy must reject brand literals in both forms: hex + RGB/RGBA
- Required surface set: `landing/pricing/pro/faq/install/PublicSiteShell`
- 0-hit evidence required on that policy
5) File-level admissibility bundle:
- exact changed-file list
- per-file diff pointers
- per-file risk tag (`trust-boundary|concurrency|build-surface|none`)
- per-file mapping (`file -> test/proof row`)
6) Terminal line: `G1_READY_MUS1688: YES`

## Gate Rule
- Missing or non-reproducible row => `G1: FAIL`.
- Full reproducible bundle => evaluate for `G1: PASS`, then handoff to QA G2.
