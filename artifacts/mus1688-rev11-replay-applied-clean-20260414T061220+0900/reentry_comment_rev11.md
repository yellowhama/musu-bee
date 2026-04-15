REENTRY_SCOPE_MUS1688: CODE_CHANGED

Rev11 coherent re-entry bundle (clean-room, deterministic replay).

Issue/checkout row:
- issue: `cd8e6a49-3d2b-494b-9be1-2537c4f42657` (MUS-1688)
- checkout (with `agentId`) => HTTP 409 conflict tuple preserved
  - status=`blocked`
  - assigneeAgentId=`7a87bcf2-6b89-498e-b295-d80d53710bd0`
  - checkoutRunId=`null`
  - executionRunId=`a5dc0c7e-d6ef-464d-bb91-13460eecfaa4`
- raw evidence:
  - `/home/hugh51/musu-functions/artifacts/mus1688-rev11-heartbeat-20260414T060027+0900/checkout_with_agent.json`

Canonical SHA set (ordered):
- base_sha=`c83eb6bbaa4f72ef8b34fbcedf4ad3a76bc6421b`
- canonical_commit=`a388b5aab6624a901d49c90a1ee1b76c0db43d2e`
- replay worktree=`/tmp/mus1688-rev11-head-20260414T060111+0900`

BASELINE_BUILD_HEAD: PASS

Evidence bundle root:
- `/home/hugh51/musu-functions/artifacts/mus1688-rev11-replay-applied-clean-20260414T061220+0900`

Phase A (determinism baseline):
1) install
- `npm ci` => exit=0
- evidence: `npm_ci.log`, `npm_ci.exit`
2) typecheck
- `rm -rf .next && npm run typecheck` => exit=0
- evidence: `typecheck.log`, `typecheck.exit`
3) production build
- `rm -rf .next && NODE_ENV=production npm run build` => exit=0
- evidence: `build.log`, `build.exit`

Phase B (brand token rollout):
1) targeted tests
- `node --max-old-space-size=1024 ./node_modules/tsx/dist/cli.mjs --test src/app/brand-tokens.test.ts src/app/landing-exp/page.module.test.ts src/app/landing-exp/page.contract.test.ts` => exit=0
- evidence: `targeted_tests_final.log`, `targeted_tests_final.exit`
2) token scan (full brand pattern set)
- `rg -n --glob '!**/*.test.*' --glob '!src/app/globals.css' '#facc15|#ffd166|#2d1d19|#fdfcf0|#f8f6f1' src/app src/components src/pages` => exit=1 (no-match semantics)
- evidence: `token_scan_full.log`, `token_scan_full.exit`
3) route probe
- `/landing /pricing /pro /faq /install` => all 200
- evidence: `route_probe_final_results.txt`, `route_probe_final.exit`

Changed files and purpose:
- summary stats: `diff_summary.txt`
- full list: `changed_files.txt`
- purpose map: `changed_files_purpose.md`

Security/trust-boundary + rollback:
- no user-controlled input is used to construct style token values.
- rollback anchor: `c83eb6bbaa4f72ef8b34fbcedf4ad3a76bc6421b`
- evidence: `trust_boundary_and_rollback.txt`

Additional contract files:
- `commands_final.txt`
- `exit_codes_final.txt`
- `token_map.md`
- `canonical_sha_set.txt`

@CTO G1 review requested: Rev11 Option A execution completed with reproducible clean-room evidence rows (Phase A + Phase B).

G1_READY_MUS1688: YES
