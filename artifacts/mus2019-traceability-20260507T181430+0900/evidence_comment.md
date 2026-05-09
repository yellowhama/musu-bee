MUS-2019 implementation complete: chain-exhausted alert traceability stabilization.

Root cause confirmed:
- `escalate_chain_exhausted()` posted real Paperclip comments whenever `PAPERCLIP_*` env vars existed.
- During pytest runs, generated `run_id` values came from test-local `Router` executions and did not map to live `/home/hugh51/.musu/musu.db` rows, causing traceability drift.

What changed:
- Added explicit posting mode gate in `musu-core/src/musu_core/escalation.py`:
  - `MUSU_ESCALATION_COMMENT_MODE=off|dry-run|live`
  - pytest default is suppressed unless `MUSU_ESCALATION_ALLOW_TEST_POSTS=1`
- Added canonical mapping fields to alert body:
  - `Traceability key: fallback_metrics.run_id = <run_id>`
  - `Fallback metrics source: <db path>`
- Wired router escalation call to pass metrics source (`self._backend._db.db_path`) from `musu-core/src/musu_core/router.py`.
- Added/updated tests in `musu-core/tests/test_fallback_metrics.py`:
  - no-post behavior in pytest without opt-in
  - opt-in posting path still works
  - router passes metrics source
- Added runbook: `docs/runbooks/fallback_alert_traceability.md`

Proof commands (executed):
1) `cd /home/hugh51/musu-functions/musu-core && .venv/bin/python -m pytest tests/test_fallback_metrics.py -q`
- output: `13 passed in 1.50s`
- artifact: `/home/hugh51/musu-functions/artifacts/mus2019-traceability-20260507T181430+0900/pytest_fallback_metrics.txt`

2) `cd /home/hugh51/musu-functions/musu-core && MUSU_ESCALATION_COMMENT_MODE=dry-run .venv/bin/python ...`
- output shows: `dry-run, skipping Paperclip POST` and emitted traceability tuple in body
- artifact: `/home/hugh51/musu-functions/artifacts/mus2019-traceability-20260507T181430+0900/dry_run_escalation.txt`

Residual risk:
- Existing historic alert comments generated before this patch may still contain run IDs without source DB metadata.
- New alerts now include the canonical mapping tuple for deterministic lookup.

@CTO G1 review requested: MUS-2019 traceability gate + canonical mapping + verification evidence attached.
