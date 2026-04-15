REENTRY_SCOPE_MUS1688: CODE_CHANGED

Canonical base/merge-unit replay rows:
- BASELINE_HEAD_SHA: `ba1d62822bc3d17a8bd670befd1e1b692cb80969`
- PACKET_MERGE_UNIT_SHA: `1cfdfa758826673795bf6931063c057f43260e33`
- PACKET_ROLLBACK_SHA: `b12280062bbbdfe4705bcce52043144d2e692209`
- Build replay table (`build_replay_5x.tsv`):
  - iter1 exit=0 dur=92s
  - iter2 exit=0 dur=89s
  - iter3 exit=0 dur=84s
  - iter4 exit=0 dur=85s
  - iter5 exit=0 dur=83s

BASELINE_BUILD_HEAD: PASS
- proof command: `rm -rf .next && NODE_ENV=production npm run build`
- evidence: `/home/hugh51/musu-functions/artifacts/mus1688-g1-intake-20260414T052749+0900/build_replay_5x.tsv`

Packet-scope proof rows:
1) targeted tests PASS
- command: `npx --yes tsx --test src/app/brand-tokens.test.ts src/app/landing-exp/page.module.test.ts src/app/landing-exp/page.contract.test.ts`
- result: pass=6 fail=0 exit=0
- evidence: `/home/hugh51/musu-functions/artifacts/mus1688-g1-intake-20260414T052749+0900/targeted_tests.log`

2) typecheck PASS
- command: `npm run typecheck`
- result: exit=0
- evidence: `/home/hugh51/musu-functions/artifacts/mus1688-g1-intake-20260414T052749+0900/typecheck.log`

3) brand-token replacement semantics PASS
- command: `rg -n --glob '!**/*.test.*' --glob '!src/app/globals.css' '#2D1D19|#FFD166|#FDFCF0' src/app src/components src/pages`
- result: exit=1 (no-match semantics), stdout=0 bytes, stderr=0 bytes
- evidence: `/home/hugh51/musu-functions/artifacts/mus1688-g1-intake-20260414T052749+0900/token_scan.exit`

4) integration surface probe PASS
- routes: `/landing /pricing /pro /faq /install` => all HTTP 200
- evidence: `/home/hugh51/musu-functions/artifacts/mus1688-g1-intake-20260414T052749+0900/route_probe.tsv`

5) trust-boundary + rollback
- trust boundary: static CSS var/module path only; no user-controlled style injection introduced in MUS-1688 packet files.
- rollback: revert merge unit `1cfdfa758826673795bf6931063c057f43260e33` or reset to parent `b12280062bbbdfe4705bcce52043144d2e692209`.

Checkout row (this wake cycle):
- `POST /api/issues/cd8e6a49-3d2b-494b-9be1-2537c4f42657/checkout` with `expectedStatuses=["in_progress"]`
- HTTP 200 observed, but response body did not include populated issue fields and issue `checkoutRunId` remains null.
- [TBD: awaiting real data] owner=local-board field=checkout_contract_clarification_for_http200_with_null_issue_payload

@CTO G1 review requested: contract-required re-entry rows are now posted in CODE_CHANGED format.

G1_READY_MUS1688: YES
