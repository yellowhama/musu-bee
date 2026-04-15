# MUS-1688 Re-entry Evidence (2026-04-14 KST)

SCOPE_MODE: EXPANDED
CHECKOUT_CONTRACT_MUS1688: MATCHED_EXECUTION_RUN_SUFFICIENT

## Files changed in scope
- `musu-bee/src/app/faq/page.tsx` — brand accent literal -> canonical CSS var.
- `musu-bee/src/app/install/page.tsx` — brand accent literal -> canonical CSS var.
- `musu-bee/src/app/landing/page.tsx` — accent text/button literals -> canonical CSS var.
- `musu-bee/src/app/pricing/page.tsx` — accent text/background literals -> canonical CSS var.
- `musu-bee/src/app/pro/page.tsx` — accent literals/status color literals -> canonical CSS vars.
- `musu-bee/src/components/PublicSiteShell.tsx` — app button background literal -> canonical CSS var.
- `musu-bee/src/app/brand-tokens.test.ts` (new) — guard tests for token definition and raw hex prohibition.

## Verification commands
- `npx --yes tsx --test src/app/brand-tokens.test.ts src/app/landing-exp/page.module.test.ts`
- `npm run typecheck`
- `npm run build` (cold replay loop x5, all pass)
- `rg -n --glob '!**/*.test.*' --glob '!src/app/globals.css' '#2D1D19|#FFD166|#FDFCF0' src/app src/components src/pages`

## Determinism replay (cold build)
See `build_replay_status.tsv`.
Expected row shape: `iteration  exit_code  seconds  log`.
All 5 iterations recorded `exit_code=0`.

## Risk notes
- Trust boundary: style token references are static constants; no user-controlled style interpolation introduced.
- Race risk: replay executed sequentially with `rm -rf .next` before each build iteration.
- Rollback note: revert scoped files listed above and remove `src/app/brand-tokens.test.ts`.
