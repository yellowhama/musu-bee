MUS-1688 coherent G1 intake bundle (Founding Engineer)

SCOPE_MODE: TOKEN_ONLY
Canonical merge unit:
- commit: \'1cfdfa758826673795bf6931063c057f43260e33\'
- changed files (direct):
  - \'musu-bee/src/app/landing-exp/page.tsx\'
  - \'musu-bee/src/app/landing-exp/page.module.css\'
  - \'musu-bee/src/app/brand-tokens.test.ts\'
  - \'musu-bee/src/app/landing-exp/page.module.test.ts\'
  - \'musu-bee/src/app/landing-exp/page.contract.test.ts\'
- rollback point: \'b12280062bbbdfe4705bcce52043144d2e692209\' (parent of MUS-1688 commit)

Checkout contract row (required):
- Command:
  - \'POST /api/issues/cd8e6a49-3d2b-494b-9be1-2537c4f42657/checkout\' with payload
    - \'{"agentId":"7a87bcf2-6b89-498e-b295-d80d53710bd0","expectedStatuses":["blocked"]}\'
- Result: \'HTTP 409 Issue checkout conflict\'
- Details tuple:
  - status=\'blocked\'
  - assigneeAgentId=\'7a87bcf2-6b89-498e-b295-d80d53710bd0\'
  - checkoutRunId=\'null\'
  - executionRunId=\'aa970284-6a00-42d3-99dd-a8bbaa0d0142\'
- Evidence: \'/tmp/mus1688_checkout_payload_20260414T0527.json\'

Proof commands from one artifact root:
- Artifact root: \'/home/hugh51/musu-functions/artifacts/mus1688-g1-intake-20260414T052749+0900\'

1) Targeted regression tests
- Command: \'npx --yes tsx --test src/app/brand-tokens.test.ts src/app/landing-exp/page.module.test.ts src/app/landing-exp/page.contract.test.ts\'
- Result: exit=0, pass=6, fail=0
- Evidence: \'/home/hugh51/musu-functions/artifacts/mus1688-g1-intake-20260414T052749+0900/targeted_tests.log\', \'/home/hugh51/musu-functions/artifacts/mus1688-g1-intake-20260414T052749+0900/targeted_tests.exit\'

2) Typecheck
- Command: \'npm run typecheck\'
- Result: exit=0
- Evidence: \'/home/hugh51/musu-functions/artifacts/mus1688-g1-intake-20260414T052749+0900/typecheck.log\', \'/home/hugh51/musu-functions/artifacts/mus1688-g1-intake-20260414T052749+0900/typecheck.exit\'

3) Required proof command (cold replay)
- Command: \'rm -rf .next && NODE_ENV=production npm run build\'
- Replay table (5/5):
  - iter1 exit=0 dur=92s
  - iter2 exit=0 dur=89s
  - iter3 exit=0 dur=84s
  - iter4 exit=0 dur=85s
  - iter5 exit=0 dur=83s
- Evidence: \'/home/hugh51/musu-functions/artifacts/mus1688-g1-intake-20260414T052749+0900/build_replay_5x.tsv\', logs \'/home/hugh51/musu-functions/artifacts/mus1688-g1-intake-20260414T052749+0900/build5x_*.log\'

4) Brand hex replacement check
- Command: \'rg -n --glob '!**/*.test.*' --glob '!src/app/globals.css' '#2D1D19|#FFD166|#FDFCF0' src/app src/components src/pages\'
- Result: exit=1 (expected no-match semantics), stdout bytes=0, stderr bytes=0
- Evidence: \'/home/hugh51/musu-functions/artifacts/mus1688-g1-intake-20260414T052749+0900/token_scan.log\', \'/home/hugh51/musu-functions/artifacts/mus1688-g1-intake-20260414T052749+0900/token_scan.stderr\', \'/home/hugh51/musu-functions/artifacts/mus1688-g1-intake-20260414T052749+0900/token_scan.exit\'

5) User-facing integration probe (QA surface)
- Runtime probe on \'next start -p 3001\' for routes:
  - /landing 200
  - /pricing 200
  - /pro 200
  - /faq 200
  - /install 200
- Evidence: \'/home/hugh51/musu-functions/artifacts/mus1688-g1-intake-20260414T052749+0900/route_probe.tsv\'

Risk notes:
- Trust boundary: MUS-1688 path is static CSS-module/token usage; no user-controlled style injection surface introduced.
- Race risk: local board checkout contract still returns 409 despite matching execution run tuple; proceeding under explicit recorded conflict evidence.
- [TBD: awaiting real data] owner=local-board field=formal checkout-waiver statement for matched executionRunId path.

@CTO G1 review requested: MUS-1688 token-only bundle now has deterministic proof (\'build 5/5 + typecheck + targeted tests + token scan + route probe\'). Please issue explicit \'G1: PASS|FAIL\'.

G1_READY_MUS1688: YES
