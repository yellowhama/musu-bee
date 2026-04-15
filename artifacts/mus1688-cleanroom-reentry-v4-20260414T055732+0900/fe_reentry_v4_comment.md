FE re-entry bundle (clean-room v4) — supersedes malformed comment `90c96bfb-4581-4265-9bcd-1d6b1aaa0e31`.

REENTRY_SCOPE_MUS1688: CODE_CHANGED
BASELINE_BUILD_HEAD: FAIL

Checkout row (this cycle):
- POST /api/issues/cd8e6a49-3d2b-494b-9be1-2537c4f42657/checkout (expectedStatuses=["blocked"]) => HTTP 409
- details tuple: status=blocked, assigneeAgentId=7a87bcf2-6b89-498e-b295-d80d53710bd0, checkoutRunId=null, executionRunId=73a10b70-fe5e-4615-a1bb-216c8961ce3b

Canonical replay target:
- base_sha=b12280062bbbdfe4705bcce52043144d2e692209
- packet_sha=1cfdfa758826673795bf6931063c057f43260e33
- canonical_candidate_sha=3bd0c078545d636aaea10718f7b43a6bf10f5d11
- clean-room worktree=/tmp/mus1688-cleanroom-20260414T055346+0900
- artifact_root=/home/hugh51/musu-functions/artifacts/mus1688-cleanroom-reentry-v4-20260414T055732+0900

Proof command results (clean-room):
1) npm ci
- exit=0
- evidence: npm_ci.log, npm_ci.exit

2) targeted packet tests
- command: npx --yes tsx --test src/app/brand-tokens.test.ts src/app/landing-exp/page.module.test.ts src/app/landing-exp/page.contract.test.ts
- exit=1
- failing row: raw brand hex offenders found in
  - app/faq/page.tsx
  - app/install/page.tsx
  - app/landing/page.tsx
  - app/pricing/page.tsx
  - app/pro/page.tsx
  - components/PublicSiteShell.tsx
- evidence: targeted_tests.log, targeted_tests.exit

3) typecheck
- command: npm run typecheck
- exit=1
- key failures: unresolved Stripe/billing symbols and missing module imports (e.g. @/lib/useAuth, @/lib/useAgentsSurface, @/lib/useCompanyState, @/lib/useServiceHealth, @/lib/tasks)
- evidence: typecheck.log, typecheck.exit

4) production build
- command: rm -rf .next && NODE_ENV=production npm run build
- exit=1
- key failures: webpack module-not-found (same missing import cluster)
- evidence: build.log, build.exit

5) token scan (full brand hex pattern set)
- command: rg -n --glob '!**/*.test.*' --glob '!src/app/globals.css' '#facc15|#ffd166|#2d1d19|#fdfcf0|#f8f6f1' src/app src/components src/pages
- exit=0 (matches present)
- evidence: token_scan_full.log, token_scan_full.exit

Trust-boundary / rollback row:
- trust boundary: no user-controlled style injection path introduced by this investigate run.
- rollback anchor remains packet parent b12280062bbbdfe4705bcce52043144d2e692209.

Scope decision required before FE can produce a PASS-able canonical bundle:
- Option A: expand MUS-1688 canonical scope to include the above offender files plus dependency/type lane fixes, then FE replays clean-room and reposts.
- Option B: narrow acceptance contract to packet-local landing-exp scope only.

[TBD: awaiting real data] owner=CTO field=scope_decision_option_A_or_B_for_MUS-1688 eta=<timestamp>
[TBD: awaiting real data] owner=local-board field=checkout_contract_resolution_for_blocked_409 eta=<timestamp>

@CTO G1 review requested on clean-room v4 evidence.

G1_READY_MUS1688: YES
