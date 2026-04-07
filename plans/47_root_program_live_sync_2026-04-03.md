# Plan 47: Root Program Live Sync (2026-04-03, 19:00 KST)

> Superseded by plan 48 (`/home/hugh51/musu-functions/plans/48_root_program_live_sync_2026-04-03.md`).
> Supersedes plan 46 after backlog/run coherence enforcement on `MUS-151`.

## Live Snapshot (as-of 2026-04-03T09:59:50Z)

- core wave states:
  - `MUS-144` `in_progress` (parent)
  - `MUS-146` `in_progress` (ops hygiene)
  - `MUS-162` `blocked` (Wave C hardening follow-up)
  - `MUS-150` `backlog` (Wave E)
  - `MUS-151` `backlog` (Wave F)
  - `MUS-145`, `MUS-147`, `MUS-148`, `MUS-149`, `MUS-157`, `MUS-158`, `MUS-159`, `MUS-163` `done`
- run-context highlights:
  - root active run: `MUS-146` only (`bd4b80a7...`)
  - enforced correction: `MUS-151` running run `f47a6af1...` was cancelled via `POST /api/heartbeat-runs/{runId}/cancel`
  - cross-project active/queued residue remains (`MUS-130`, `MUS-161`, `MUS-8`)

## CEO Review (HOLD SCOPE + ORDER DISCIPLINE)

1. Keep closed waves closed; no reopen on `MUS-149` and `MUS-163`.
2. Lock sequence: `MUS-162` unblock -> `MUS-150` -> `MUS-151`.
3. Treat any backlog-status active run as hygiene failure, not progress.

## ENG Review (Execution Contract)

1. `MUS-146`: monitor and auto-correct recurrence of `backlog + running` mismatches using `POST /api/heartbeat-runs/{runId}/cancel`.
2. `MUS-146`: preserve projection debt tracking (`issueId` null vs `contextSnapshot.issueId`) with explicit as-of timestamps.
3. `MUS-162`: publish unblock condition + artifact delta before Wave E start.
4. `MUS-150`: start only after `MUS-162` is cleared or explicitly deferred by board note.
5. `MUS-151`: run only when issue status is intentionally advanced and sequence gate is satisfied.

## Retro Snapshot

1. Backlog/run divergence is controllable with direct control-plane action when endpoint truth is correct.
2. Board readability improves when clean unblock notes include action evidence (run id + cancel timestamp).
3. Cross-project run traffic should be separated from root signal each sync to avoid false wave-start interpretation.
