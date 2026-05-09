Weekly fallback report refresh after chain-exhausted alert (2026-05-07 KST).

Acknowledged alert comment:
- comment_id: `a6118c25-1fe2-48ff-b4a6-879590dcd61a`
- alerted run_id: `d69d6544-dbbc-4539-af64-25cb8c1a57f6`

Checkout row (this heartbeat):
- `POST /api/issues/e9215f15-129c-4a50-9266-e11ead78215e/checkout`
- payload: `{"agentId":"7a87bcf2-6b89-498e-b295-d80d53710bd0","expectedStatuses":["in_review"]}`
- result: HTTP `409` conflict (no retry per policy)
- tuple: `status=in_review`, `assigneeAgentId=7a87bcf2-6b89-498e-b295-d80d53710bd0`, `executionRunId=e13903f0-4f2a-4252-8b2c-b1874721bd33`

Re-run (live DB) artifacts:
- report: `/home/hugh51/musu-functions/artifacts/mus1992-weekly-fallback-20260507T180414+0900/weekly_report.md`
- summary: `/home/hugh51/musu-functions/artifacts/mus1992-weekly-fallback-20260507T180414+0900/summary.json`

Observed metrics (fresh run):
- `before_total=1512`
- `before_last_7_days=1333`
- `before_older_than_30_days=0`
- `deleted_older_than_30_days=0`
- `after_total=1512`
- `after_older_than_30_days=0`

Delta vs prior snapshot (`2026-05-07T08:59:53Z`):
- total fallback events: `+2` (`1331 -> 1333`)
- chain-exhausted: `+1` (`483 -> 484`)
- timeout reason: `+1` (`19 -> 20`)
- rate_limit reason: `+1` (`482 -> 483`)

Alerted run ID presence check on `/home/hugh51/.musu/musu.db`:
- query: `SELECT count(*) FROM fallback_metrics WHERE run_id='d69d6544-dbbc-4539-af64-25cb8c1a57f6';`
- result: `0`
- hermes adapter rows in 7-day window: `0`

Proof command:
- `cd /home/hugh51/musu-functions/musu-core && .venv/bin/python -m pytest tests/test_fallback_metrics.py -q`
- output: `12 passed in 7.52s`

Risk note:
- Alert stream and report DB are currently not provably 1:1 for run-level traceability.
- `[TBD: awaiting real data] owner=local-board field=canonical_source_mapping_for_alert_run_ids_vs_fallback_metrics_db eta=<timestamp>`

@CTO G1 review requested: refreshed weekly evidence posted after latest chain-exhausted alert.
