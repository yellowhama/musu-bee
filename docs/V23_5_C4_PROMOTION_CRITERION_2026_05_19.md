# V23.5 C-4 — V23.7 Promotion Criterion for LLM Synthesis (Y-path)

**Wiki**: wiki/479 (within V23.5 reserved range 459-482 per master plan §"Wiki ID reservations")
**Date**: 2026-05-19
**Status**: documentation-only — no code triggers based on this metric in V23.5
**Authority**: V23.5 master plan v4 §"Promotion criterion" (wiki/459) — board panel SWOT verdict 3Z+1X+0Y; Option Z hybrid adopted with this 40% gate locked in C sub-WS spec.

## Why this exists

V23.5 ships LLM synthesis (Option Y) as **opt-in only**: the
"📝 Get AI synthesis" button is disabled unless the operator has explicitly
configured `MUSU_USER_LLM_API_KEY`, and even when enabled it requires a
per-session cost-preview confirmation before the first call (constraints b
+ c from the C-3 Phase -1 mini-gate).

Promotion to default-on is **not** automatic. V23.7 master plan must
explicitly re-evaluate this criterion and decide. C-4 is the place where the
criterion is pinned, NOT in code.

## The criterion

> If ≥40% of users with `MUSU_USER_LLM_API_KEY` configured click
> "📝 Get AI synthesis" at least once over a rolling 60-day window,
> V23.7 should consider promoting LLM synthesis from opt-in (Y) to
> default-on, with explicit opt-out toggle.

The metric explicitly excludes users **without** an API key — they cannot
click the button by design, so including them in the denominator would
make the gate unreachable. This matches the Phase -1 mini-gate framing of
Y as an operator opt-in path, not a global feature flag.

## Measurement (operator-driven, local-only)

Per C-3 constraint (d), there is **no phone-home telemetry** in V23.5. The
agent emits two structured log lines locally:

* `cos_synthesis_ok` — successful LLM call (includes input/output token
  counts, duration, page count; never the prompt body or response).
* `cos_synthesis_failed` — provider exception (includes error class +
  truncated message + duration).

Operators measure adoption manually from these logs:

```bash
# Total invocations over a 60-day window (any outcome)
grep -E "cos_synthesis_(ok|failed)" /var/log/musu-bridge.log \
    | awk -v cutoff="$(date -d '60 days ago' --iso-8601)" \
        '$0 >= cutoff' \
    | wc -l

# Unique sessions (rough proxy for unique users — refine in V23.7 if
# needed by adding a session_id field to the log extra at that point)
grep -E "cos_synthesis_(ok|failed)" /var/log/musu-bridge.log \
    | grep -oE 'request_id=[a-f0-9-]+' | sort -u | wc -l
```

V23.5 deliberately does NOT add a `/api/cos-synthesis/metrics` endpoint
or a database table for these counts — that's V23.7 work, gated on the
operator reporting non-trivial usage.

## Thresholds and what each one triggers

| Click rate (60d) | V23.7 recommendation                                                                                                              |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| **<20%**         | C-3 is overengineered for actual usage. V24 should consider removing the LLM path entirely and keeping C-1 algorithmic only.       |
| **20%–40%**      | Keep opt-in (current state). Continue measuring; no V23.7 changes needed.                                                          |
| **≥40%**         | V23.7 candidate for **default-on** with explicit "Disable AI synthesis" toggle. Add caching layer (~30 min TTL) before flipping.   |
| **≥70%**         | V23.8 candidate for inverting the fallback — algorithmic C-1 becomes the degrade path, Y becomes the default. Schema versioning gate fires here. |

## What V23.7 needs to build IF the gate fires

V23.5 deliberately does NOT implement these — they are V23.7+ work gated
on the 40% measurement. Listing them here so V23.7 planning has the
forward-pointer:

1. **Per-user / per-company aggregated invocation counts** (replacement for
   raw log scrape). Likely an additive in-process counter with periodic
   sqlite write — no schema migration on hot tables (Const III).
2. **UI opt-out toggle** in user preferences (current state is opt-in via
   button; default-on flips the polarity).
3. **LLM response caching layer** with ~30 min TTL to cap per-user cost
   from accidental re-clicks. Cache key = `(company_id, page_id_set_hash)`.
4. **Schema versioning** for the structured synthesis output (in
   anticipation of multi-language or template-driven prompts at V23.8+).
5. **Cost ceiling alerting** — when an operator's logged token use crosses
   a configurable monthly threshold, suppress further calls and surface a
   "configure budget" UI affordance. Local-only, no phone-home.

## What V23.5 explicitly does NOT do

These were explicitly cut from V23.5 scope per master plan §"Out-of-scope
for V23.5":

* **No caching layer.** Every click re-hits the provider. Acceptable
  because click volume is capped by the opt-in gate.
* **No budget UI.** Cost preview is per-session via `window.confirm`
  only; no monthly cap, no usage dashboard.
* **No prompt versioning.** The synthesis prompt is hardcoded in
  `cos_briefing_agent.py`. Schema drift handled by the parse-error
  degrade path (C-4 test 4a/4b).
* **No phone-home.** Constraint (d) — all telemetry stays in
  `logger.info` / `logger.error` structured fields on the bridge.

## Constitution check

* **Const III** (schema): NOT triggered. No new tables, no column adds,
  no migration. C-3 and C-4 both add only in-process state.
* **Const VI** (performance experiment): NOT triggered. The 40% click rate
  is the V23.7 **promotion criterion** — it is a *strategic* gate, NOT a
  V23.5 perf gate. No regression budget tracked against it.
* **Const VII** (push gate): unchanged. C-4 is a feature-branch commit
  on `v23/phase4`; no main merge.

## V23.7 hand-off summary

When V23.7 planning starts:

1. Run the log-scrape commands above against ~60d of bridge logs.
2. Look up the row in the threshold table for the observed rate.
3. If `≥40%`: open a V23.7 sub-WS scoped to items 1–5 in the "What V23.7
   needs to build" list above, gated by an explicit Phase -1 strategic
   panel review (the polarity flip is product-positioning relevant
   per Christensen + Drucker frameworks).
4. If `<40%`: log the observed rate in the V23.7 master plan as a
   "deferred — Y stays opt-in" decision, with the measurement as
   evidence.
