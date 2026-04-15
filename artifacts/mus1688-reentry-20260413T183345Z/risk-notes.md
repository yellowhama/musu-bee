# MUS-1688 Risk Notes (TOKEN_ONLY)

## Trust Boundary
- Scope touches static style/token definitions and server-rendered static style literals only.
- No user-supplied values are written into CSS variable names or values.
- No new runtime path for arbitrary style injection introduced.

## Race Risk
- Low runtime race risk: changes are compile-time/front-end static assets.
- Primary operational risk is merge-conflict risk in a dirty workspace with concurrent edits.
- Mitigation: canonical patch artifact restricts merge unit to three files.

## Rollback Procedure
1. From repo root, reverse-apply the canonical patch:
   - `git apply -R artifacts/<bundle>/mus1688-token-only.patch`
2. Re-run proof commands:
   - `npx --yes tsx --test src/app/brand-tokens.test.ts`
   - `npm run typecheck`
   - `npm run build`
3. Confirm no residual token-regression via grep:
   - `rg -n "#2D1D19|#FFD166|#FDFCF0|#facc15" src/app/landing/page.tsx src/app/globals.css`
