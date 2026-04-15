FE investigation update (clean-room replay; fail-closed)

checkout row (this heartbeat):
- \'POST /api/issues/cd8e6a49-3d2b-494b-9be1-2537c4f42657/checkout\' with expectedStatuses=[\"blocked\"]
- result: HTTP 409 (no retry per policy)
- tuple: status=blocked, assignee=FE, checkoutRunId=null, executionRunId=73a10b70-fe5e-4615-a1bb-216c8961ce3b
- evidence: \'/tmp/mus1688_checkout_blocked_20260414T0553.json\'

investigate result:
1) clean-room replay on declared canonical commit alone is non-reproducible for MUS-1688 acceptance.
2) I produced a scoped patch for the 6 offender files called out by brand-token test:
- \'musu-bee/src/app/faq/page.tsx\'
- \'musu-bee/src/app/install/page.tsx\'
- \'musu-bee/src/app/landing/page.tsx\'
- \'musu-bee/src/app/pricing/page.tsx\'
- \'musu-bee/src/app/pro/page.tsx\'
- \'musu-bee/src/components/PublicSiteShell.tsx\'

clean-room evidence bundles:
- first corrected-path replay (environment diagnostics): \'/home/hugh51/musu-functions/artifacts/mus1688-cleanroom-reentry-v2-20260414T055434+0900\'
- patch-applied replay on detached worktree: \'/home/hugh51/musu-functions/artifacts/mus1688-cleanroom-reentry-v3-20260414T055638+0900\'

v3 replay tuples (base=3bd0c078 + mus1688_brandvars.patch):
- targeted tests: exit=0 (brand-tokens + landing-exp module + contract)
  - evidence: \'/home/hugh51/musu-functions/artifacts/mus1688-cleanroom-reentry-v3-20260414T055638+0900/targeted_tests.log\', \'/home/hugh51/musu-functions/artifacts/mus1688-cleanroom-reentry-v3-20260414T055638+0900/targeted_tests.exit\'
- token scan (full brand set #facc15/#ffd166/#2d1d19/#fdfcf0/#f8f6f1): exit=1 no-match semantics
  - evidence: \'/home/hugh51/musu-functions/artifacts/mus1688-cleanroom-reentry-v3-20260414T055638+0900/token_scan_full.log\', \'/home/hugh51/musu-functions/artifacts/mus1688-cleanroom-reentry-v3-20260414T055638+0900/token_scan_full.exit\'
- typecheck: exit=2 (fails)
  - evidence: \'/home/hugh51/musu-functions/artifacts/mus1688-cleanroom-reentry-v3-20260414T055638+0900/typecheck_rerun.log\', \'/home/hugh51/musu-functions/artifacts/mus1688-cleanroom-reentry-v3-20260414T055638+0900/typecheck_rerun.exit\'
- production build: exit=1 (fails)
  - evidence: \'/home/hugh51/musu-functions/artifacts/mus1688-cleanroom-reentry-v3-20260414T055638+0900/build_rerun.log\', \'/home/hugh51/musu-functions/artifacts/mus1688-cleanroom-reentry-v3-20260414T055638+0900/build_rerun.exit\'

failure signature (non-MUS1688 drift):
- missing module surfaces and legacy stripe-type mismatches in unrelated lanes, e.g.
  - cannot resolve \'@/lib/useCompanyState\', \'@/lib/useServiceHealth\', \'@/lib/tasks\'
  - stripe subscription type mismatches under \'src/app/api/webhooks/stripe/*\'

conclusion:
- MUS-1688 brand-token patch scope can satisfy token tests, but canonical base lane is not self-consistent for required proof commands (typecheck/build).
- I cannot truthfully emit \'G1_READY_MUS1688: YES\' in this state.

[TBD: awaiting real data] owner=local-board field=canonical_merge_unit_for_mus1688_that_is_self_consistent_for_typecheck_and_build eta=<timestamp>
[TBD: awaiting real data] owner=CTO field=scope_decision_whether_mus1688_may_include_dependency_lane_fixes_or_must_wait_for_base_stabilization eta=<timestamp>
