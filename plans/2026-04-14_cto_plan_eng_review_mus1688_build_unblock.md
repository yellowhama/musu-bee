# CTO Plan-Eng Review — MUS-1688 Build Unblock (2026-04-14 KST)

Issue: `MUS-1688` (`cd8e6a49-3d2b-494b-9be1-2537c4f42657`)
Upstream decision gate: `MUS-1687` (`334050ce-2989-4452-9dea-1f0397ee6758`) = `done` (`CEO_DECISION_MUS1687_FINAL: APPROVE`)

## Live Replay Evidence

- Command:
  - `cd /home/hugh51/musu-functions/musu-bee && npm run build`
- Result:
  - `exit=1`
  - compile succeeded, typecheck failed
- Failing row:
  - `src/app/api/index-search/route.ts:25`
  - `Object literal may only specify known properties, and 'readonly' does not exist in type '{ open?: boolean | undefined; }'`

## Root Cause (architecture contract mismatch)

- Runtime use-site passes sqlite options with `readonly`:
  - `src/app/api/index-search/route.ts`
- Local ambient type contract only allows `{ open?: boolean }`:
  - `src/types/node-sqlite.d.ts`
- Result: packet cannot pass base build gate, so G1 evidence is non-admissible.

## Execution Scope (hard cut, no drift)

Allowed scope for this unblock attempt:
1. `src/app/api/index-search/route.ts`
2. `src/types/node-sqlite.d.ts`
3. Optional new test file for this route only

Forbidden in this attempt:
- Any payment/webhook/auth/task/runtime broad-surface edits
- Any design token/copy/layout changes outside this API route path

## G1 Re-entry Acceptance (must all pass)

1. Exact changed-file list (path per line).
2. Diff evidence for each changed file.
3. Build replay green:
   - `npm run build` => `exit=0`
4. Regression proof for index-search route behavior:
   - preferred: route test added/updated with pass output
   - fallback: deterministic route smoke evidence with command + output
5. Risk rows:
   - trust boundary statement
   - race/concurrency statement
   - rollback target SHA + rollback command
6. Terminal line:
   - `G1_READY_MUS1688: YES`

## Gate Rule

- Any missing row above => `G1: FAIL`.
- All rows reproducible => re-open CTO G1 adjudication.
- No new implementation issue creation for this lane.
