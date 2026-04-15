Rev11 re-entry bundle (single coherent submission).

REENTRY_SCOPE_MUS1688: CODE_CHANGED

Canonical SHA set (ordered):
- base_sha: c83eb6bbaa4f72ef8b34fbcedf4ad3a76bc6421b
- phaseA_sha: b045ee62bb67c553014b015971efc2170bb63cfc
- phaseB_sha: d1ef13efbb9e848bd1ef81987b8d841c120eaad2

Checkout row (this cycle):
- POST /api/issues/cd8e6a49-3d2b-494b-9be1-2537c4f42657/checkout
- payload: {"agentId":"7a87bcf2-6b89-498e-b295-d80d53710bd0","expectedStatuses":["blocked","in_progress","todo"]}
- HTTP 200, issue status transitioned to in_progress

Artifact root:
- /home/hugh51/musu-functions/artifacts/mus1688-rev11-final-commitproof-20260414T062754+0900

BASELINE_BUILD_HEAD: PASS

Phase A proof rows:
1) npm install
- command: npm install
- exit: 0
- evidence: phaseA_npm_install.log, phaseA_npm_install.exit

2) typecheck
- command: npm run typecheck
- exit: 0
- evidence: phaseA_typecheck.log, phaseA_typecheck.exit

3) production build
- command: rm -rf .next && NEXT_DISABLE_SWC_WORKER=1 NODE_OPTIONS='--max-old-space-size=1024' NODE_ENV=production npm run build
- exit: 0
- evidence: phaseA_build.log, phaseA_build.exit

Phase B proof rows:
1) targeted tests
- command: npx --yes tsx --test src/app/brand-tokens.test.ts src/app/landing-exp/page.module.test.ts src/app/landing-exp/page.contract.test.ts
- exit: 0
- evidence: phaseB_targeted_tests.log, phaseB_targeted_tests.exit

2) token scan (required surfaces)
- command: rg -n '#facc15|#ffd166|#2d1d19|#fdfcf0|#f8f6f1' src/app/faq/page.tsx src/app/install/page.tsx src/app/landing/page.tsx src/app/pricing/page.tsx src/app/pro/page.tsx src/components/PublicSiteShell.tsx
- exit: 1 (expected: no matches)
- evidence: phaseB_token_scan_required_surface.log, phaseB_token_scan_required_surface.exit

3) token scan (full scope)
- command: rg -n --glob '!**/*.test.*' --glob '!src/app/globals.css' '#facc15|#ffd166|#2d1d19|#fdfcf0|#f8f6f1' src/app src/components src/pages
- exit: 1 (expected: no matches)
- evidence: phaseB_token_scan_full.log, phaseB_token_scan_full.exit

4) QA route probe
- command: npm run start (port 3001) + curl probe for /landing /pricing /pro /faq /install
- exit: 0
- evidence: phaseB_start.log, phaseB_route_probe.txt, phaseB_route_probe.exit
- route probe result:
  - /landing 200
  - /pricing 200
  - /pro 200
  - /faq 200
  - /install 200

Changed files + purpose:
- Phase A (determinism/compile surface):
  - package-lock + module surface sync (tasks/auth/company/service hooks, billing/subscription sync, paddle path)
  - remove legacy stripe webhook/code paths no longer consistent with current billing surface
  - add missing shared modules and sqlite type shim to close type/build gaps
  - app/auth callback + app page updated to satisfy Next.js build constraints (suspense boundary requirement)
- Phase B (brand-token rollout required by Rev11):
  - src/app/faq/page.tsx
  - src/app/install/page.tsx
  - src/app/landing/page.tsx
  - src/app/pricing/page.tsx
  - src/app/pro/page.tsx
  - src/components/PublicSiteShell.tsx
  - hardcoded brand hex replaced with canonical vars (e.g. var(--musu-color-brand-accent))

Risk notes:
- Trust boundary: style token values are static literals/CSS vars in code; no user-controlled style injection introduced.
- Race risk: no new async/concurrency path added in this packet; changes are render/style + compile-surface alignment.
- Rollback: revert ordered commits in reverse (phaseB_sha then phaseA_sha) to return to base_sha.

Review/QA gate usage:
- /review-equivalent: diff-level sanity + deterministic proof rows captured above.
- /qa-equivalent: user-facing route probe captured above.

@CTO G1 review requested: Rev11 Option A scope recut implemented with Phase A green + Phase B token rollout evidence.

G1_READY_MUS1688: YES
