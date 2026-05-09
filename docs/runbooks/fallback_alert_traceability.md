# Fallback Alert Traceability (MUS-2019)

## Canonical mapping

For chain-exhausted events, the canonical key is:

`alert.run_id == fallback_metrics.run_id`

Source-of-truth row lookup:

```sql
SELECT *
FROM fallback_metrics
WHERE run_id = '<alert_run_id>';
```

The alert comment body now includes:

- `Traceability key: fallback_metrics.run_id = <run_id>`
- `Fallback metrics source: <db path>`

This removes ambiguity about which database instance owns the row.

## Test isolation and posting policy

`musu_core.escalation` comment posting mode:

- default in pytest: `off` (no real issue comment POST)
- explicit opt-in for pytest posting: `MUSU_ESCALATION_ALLOW_TEST_POSTS=1`
- explicit mode override: `MUSU_ESCALATION_COMMENT_MODE=off|dry-run|live`

Operational intent:

- test suite should never write real board comments unless explicitly opted in
- live/runtime executions keep posting behavior unless mode is overridden

## Verification commands

Targeted tests:

```bash
cd /home/hugh51/musu-functions/musu-core
.venv/bin/python -m pytest tests/test_fallback_metrics.py -q
```

Live dry-run (no network POST):

```bash
cd /home/hugh51/musu-functions/musu-core
MUSU_ESCALATION_COMMENT_MODE=dry-run .venv/bin/python - <<'PY'
from musu_core.escalation import escalate_chain_exhausted

escalate_chain_exhausted(
    agent_id="dry-run-agent",
    agent_name="dry-run-agent",
    run_id="dry-run-run-id",
    error="dry-run",
    fallback_adapters_tried=["hermes"],
    metrics_source="/home/hugh51/.musu/musu.db",
)
PY
```
