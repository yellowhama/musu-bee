# Plan template — health-surface verification step

**Date**: 2026-05-19
**Status**: project-scoped recommendation (NOT a user-level MODE edit)
**Authoring source**: V23.4 Phase 4 T2-Z6 (FO-A1a-6, wiki/445)
**Bug pattern this addresses**: F-B2-1-FOLLOW-1 (silent sweeper hatch, wiki/440)

## The check-step

Add the following gate to the Planner template's pre-freeze checklist:

> ### Observability-surface schema check
>
> **Before plan freeze**, enumerate every observability surface the new code
> exposes or modifies. For each surface, verify the target file's current
> schema and confirm the new code's emit matches what the Auditor will
> probe in §V (verification).
>
> Surfaces to enumerate:
>
> 1. **HTTP probes**: `/health`, `/readyz`, `/livez`, `/metrics`, and any
>    new HTTP endpoint that returns process-state JSON.
> 2. **Structured log events**: any `console.warn` / `logger.warn` /
>    `print(file=sys.stderr)` whose emit shape is treated as a contract by
>    a downstream consumer (operator runbook, alerting rule, install-attempt
>    telemetry parser).
> 3. **Install-attempt / telemetry schema**: new fields added to install-attempt rows, new `error_class` values, new `step` values.
> 4. **Env vars that gate behavior**: any `process.env.X === "1"` or
>    `$env:X` toggle that changes runtime semantics. These MUST be
>    observable from at least one of (1), (2), or (3).
>
> For each surface, the plan must specify:
> - Current schema (file + line + literal JSON / log shape).
> - Post-implementation schema (additive: same fields + new ones).
> - Auditor probe: the exact `curl` / `kubectl exec` / `Get-Content` command the §V verification will run, and the literal substring or jq path it asserts.

## Why this catches F-B2-1-FOLLOW-1

The V23.3 B2-1 plan added `MUSU_INSTALL_ATTEMPT_SWEEPER_DISABLED=1` as a
runtime hatch. The hatch worked correctly (short-circuit before
`setInterval` registration), but had NO observable side effect:

- No log line on the disabled path.
- No `/health` flag exposing hatch state.
- No `/metrics` counter.

An Auditor §V probe (`curl localhost:9900/health` and `tail
/var/log/musu-relay.log | grep sweeper`) pre-fix would have shown:
- `{"status":"ok"}` (regardless of hatch state).
- Empty grep result (regardless of hatch state).

So the Auditor cannot distinguish "hatch fired, sweeper disabled" from
"hatch ignored, sweeper running fine". The bug is invisible at audit time
because the surface was never specified.

A health-surface schema check at plan time would have surfaced this:
> "Hatch env var `MUSU_INSTALL_ATTEMPT_SWEEPER_DISABLED` gates sweeper
> start. What surface exposes that the hatch fired? -> none planned ->
> ADD `/health.install_attempt_sweeper_disabled: bool` + a `console.warn`
> on the disabled path."

The Z1 implementation of F-B2-1-FOLLOW-1 (V23.4 T2-Z1, wiki/440) added
exactly those two surfaces retroactively.

## Why this is a project doc, not a MODE edit

Per task constraint: do NOT edit user-level `~/.claude/CLAUDE.md` or
`~/.claude/MODE_*.md` files. Those are personal harness configuration;
project-specific gate proposals belong in `docs/` so the gate is reviewable
by code review, versioned with the project, and consultable from a closure
doc without leaving the repo.

If the gate proves effective across V23.5+ and the user wants to elevate it
to a global rule, the elevation path is: copy the check-step into
`~/.claude/MODE_Agent_Team.md` under "Quality validation" — but that is
the user's call, not this doc's.

## Recommended insertion point

In the Planner subagent prompt template (the one that drafts detail plans
from a master plan §5 row), add this step between "edge cases enumerated"
and "implementation pseudocode". Phrase as a hard gate: "plan freeze blocked
until each surface row is filled."

## References

- F-B2-1-FOLLOW-1 closure: `docs/V23_4_PHASE4_Z1_CLOSURE_2026_05_19.md` (wiki/440)
- Master plan: `docs/V23_4_PHASE4_MASTER_PLAN_2026_05_18.md` §5.Z row Z6
- V23.3 wiki/396 §5 forward-pointer FO-A1a-6
