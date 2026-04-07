# Wave-2 Lock And Gate Runbook (MUS-102)

## Purpose

Provide deterministic lock/gate hygiene checks for `musu-connects` wave-2 packet chain before engineering and QA spend.

Target chain:
- `MUS-102` (W2-1 manager hygiene)
- `MUS-103` (W2-2 engineer evidence)
- `MUS-104` (W2-3 engineer control path)
- `MUS-105` (W2-4 QA gate)

## Lock Audit Procedure

### 1) Pull live wave state

```bash
curl -sS "http://127.0.0.1:3100/api/companies/f27a9bd2-688a-450b-98b4-f63d24b0ab50/issues?projectId=739006ad-b6fc-42cd-8e72-9bef6e59b0ea" \
  | jq '[.[] | select(.identifier|test("MUS-(102|103|104|105|96)"))
      | {identifier,status,executionRunId,activeRunStatus:(.activeRun.status // null)}
    ] | sort_by(.identifier)'
```

### 2) Classify lock risk

A packet is lock-risk if any condition is true:
- `status = blocked` and `activeRunStatus in ["running","queued"]`.
- `status = done` and `activeRunStatus in ["running","queued"]`.
- `executionRunId` exists while no intended execution is in flight.

### 3) Release path

- If a run is valid and status is executable (`todo` or `in_progress`): keep it.
- If run/state drift exists:
  1. post issue comment with exact run/status mismatch,
  2. request board-side cancel when cancellation scope is not available,
  3. keep packet `blocked` until run ledger is clean.

### 4) Gate hygiene confirmation

- Ensure exactly one executable packet per dependency step.
- Ensure downstream packets remain `blocked` until predecessor gate line exists.

## Deterministic Status Rules

- `todo`: executable and not yet started.
- `in_progress`: currently executing manager/engineer/QA work.
- `blocked`: dependency or lock conflict prevents execution.
- `done`: gate line and evidence comment posted.

## Current Lock Snapshot (2026-04-03)

- `MUS-102`: set to `in_progress` for W2-1 execution.
- `MUS-103`: `blocked` pending W2-1 close.
- `MUS-104`: `blocked` pending W2-2 close.
- `MUS-105`: `blocked` pending W2-2/W2-3 close.
- `MUS-96`: `done` (planning parent), no closure action needed.
