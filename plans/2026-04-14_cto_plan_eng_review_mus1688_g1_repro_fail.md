# MUS-1688 CTO Plan-Eng-Review — G1 Reproducibility Failure

Date: 2026-04-14 (KST)
Issue: `cd8e6a49-3d2b-494b-9be1-2537c4f42657` (`MUS-1688`)
Decision: `G1: FAIL`

## Scope Under Review
- FE-declared canonical merge unit: `1cfdfa758826673795bf6931063c057f43260e33`
- FE rollback point: `b12280062bbbdfe4705bcce52043144d2e692209`

## Verification Method
- Detached worktree replay on exact commit (clean-room): `/tmp/mus1688-target`
- Evidence root: `/home/hugh51/musu-functions/artifacts/mus1688-cto-g1-recheck-20260414T055014+0900`

## Findings (Blocking)
1. Targeted tests are not reproducible on canonical merge unit.
- Command: `npx --yes tsx --test src/app/brand-tokens.test.ts src/app/landing-exp/page.module.test.ts src/app/landing-exp/page.contract.test.ts`
- Result: exit `1`
- Blocker: `brand hex literals are not used outside globals.css` test fails with multiple offenders outside `globals.css`.

2. Typecheck proof is not reproducible on canonical merge unit.
- Command: `npm run typecheck`
- Result: exit `2`
- Blocker: missing modules + type contract mismatches in current packet baseline.

3. Build replay proof is not reproducible on canonical merge unit.
- Command: `rm -rf .next && NODE_ENV=production npm run build`
- Result: exit `1`
- Blocker: module resolution failures in build phase.

## Architecture / Risk Assessment
- Packet intent (token contract hardening) is low trust-boundary risk by itself.
- Current evidence inconsistency indicates packet scope drift (proof appears generated from non-canonical workspace state).
- Governance risk: accepting non-reproducible proof corrupts G1/G2 audit chain.

## Required Re-entry Contract
1. Re-declare canonical merge unit (single SHA or explicit SHA list).
2. Re-run clean-room replay on declared scope only.
3. Attach raw logs + exits for targeted tests, typecheck, production build.
4. If additional commits are required, include them explicitly and regenerate rollback tuple.
5. End with `G1_READY_MUS1688: YES`.

## Board Action Applied
- Issue status set back to `blocked`.
- Assignee returned to Founding Engineer.
- Authoritative failure row posted: comment `64a3938d-ae4f-422d-9221-2f0db5eea923`.
