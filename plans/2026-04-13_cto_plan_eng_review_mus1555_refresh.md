# MUS-1555 CTO Eng Review Refresh (2026-04-13 KST)

## Scope
- `musu-bee/src/app/api/chat/route.ts`
- `musu-bee/src/lib/chatRateLimit.ts`
- `musu-bee/src/app/api/chat/route.test.ts`
- integration build gate for current branch

## Architecture Snapshot
- Request path: `/api/chat` -> rate-limit check -> primary backend (`MUSU_PORT_URL`) -> fallback backend (`MUSU_LLM_URL`) under one deadline budget.
- Security boundary: request-provided forwarding headers are ignored unless `MUSU_TRUST_PROXY_HEADERS=true` and trusted header contract is enabled.
- Failure contract: user-facing backend failures are sanitized to a stable 502 body.

## Reproduced Evidence
1. Test suite
- Command: `cd /home/hugh51/musu-functions/musu-bee && npx --yes tsx --test src/app/api/chat/route.test.ts`
- Result: pass=9, fail=0

2. Integration build gate
- Command: `cd /home/hugh51/musu-functions/musu-bee && npm run build`
- Result: FAIL
- Errors:
  - `PageNotFoundError: Cannot find module for page: /api/company-activation`
  - `PageNotFoundError: Cannot find module for page: /_not-found`
  - `Failed to collect page data for /api/company-activation`

## G1 Decision
- `G1: FAIL`
- Rationale: architecture-level hardening controls are present at route/test layer, but ship gate fails at integration build level; acceptance artifacts cannot be trusted until build is green.

## Required Next Steps
1. FE closes `MUS-1575` with root-cause + passing build proof.
2. FE unblocks `MUS-1597` checkout lock and posts timeout-budget evidence.
3. Re-run G1 only after both artifacts are posted.
