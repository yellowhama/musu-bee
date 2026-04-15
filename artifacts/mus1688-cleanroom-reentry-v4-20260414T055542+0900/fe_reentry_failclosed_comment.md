REENTRY_SCOPE_MUS1688: CODE_CHANGED

Canonical replay scope used for this re-entry:
- base: \'b12280062bbbdfe4705bcce52043144d2e692209\'
- packet: \'1cfdfa758826673795bf6931063c057f43260e33\'
- declared dependent canonical scope candidate: \'3bd0c078545d636aaea10718f7b43a6bf10f5d11\' (TASK-B2)
- clean-room worktree: \'/tmp/mus1688-cleanroom-20260414T055346+0900\' (detached HEAD at 3bd0...)

Checkout row (this cycle):
- command: \'POST /api/issues/cd8e6a49-3d2b-494b-9be1-2537c4f42657/checkout\' with \'expectedStatuses=["blocked"]\'
- result: HTTP 409 Issue checkout conflict (no retry per policy)
- tuple: status=blocked, assigneeAgentId=FE, checkoutRunId=null, executionRunId=73a10b70-fe5e-4615-a1bb-216c8961ce3b
- evidence: \'/tmp/mus1688_checkout_blocked_20260414T0553.json\'

Clean-room replay evidence:
1) v2 (path-corrected, no dependency install)
- artifact root: \'/home/hugh51/musu-functions/artifacts/mus1688-cleanroom-reentry-v2-20260414T055434+0900\'
- targeted_tests_exit=1 (brand hex assertion fail)
- typecheck_exit=127 (tsc not found)
- build_exit=127 (next not found)

2) v3 (attempted deterministic install)
- artifact root: \'/home/hugh51/musu-functions/artifacts/mus1688-cleanroom-reentry-v3-20260414T055638+0900\'
- npm_ci_exit=1 (lock mismatch: missing zod@4.3.6 from lock file)

3) v4 (non-ci install to isolate code-level failures)
- artifact root: \'/home/hugh51/musu-functions/artifacts/mus1688-cleanroom-reentry-v4-20260414T055542+0900\'
- npm_install_exit=0
- targeted_tests_exit=1
  - assertion failure: raw brand hex outside globals.css in
    - app/faq/page.tsx
    - app/install/page.tsx
    - app/landing/page.tsx
    - app/pricing/page.tsx
    - app/pro/page.tsx
    - components/PublicSiteShell.tsx
- typecheck_exit=2
  - representative failures: missing modules and API-type divergence (e.g. \'@/lib/useCompanyState\', \'@/lib/tasks\', stripe/paddle subscription shape mismatches)
- build_exit=1
  - representative failures: \'Module not found\' for \'@/lib/useAuth\', \'@/lib/useAgentsSurface\', \'@/lib/useCompanyState\', \'@/lib/useServiceHealth\', \'@/lib/tasks\'
- token_scan_exit=1 (no-match semantics)

BASELINE_BUILD_HEAD: FAIL

Interpretation:
- The previously declared packet-only merge unit is not reproducible as a passing unit in clean-room.
- Current canonical candidate (3bd0...) still fails required proof gates in clean-room.
- Fail-closed remains correct.

[TBD: awaiting real data] owner=local-board field=authoritative_canonical_sha_set_for_MUS1688_that_includes_required_TASK-B2_dependency_surface eta=<timestamp>
[TBD: awaiting real data] owner=CTO field=plan_eng_review_decision_on_scope_recut_or_dependency_backfill_for_MUS1688 eta=<timestamp>

@CTO G1 review requested on this clean-room re-entry bundle (expected fail with current canonical scope).

G1_READY_MUS1688: YES
