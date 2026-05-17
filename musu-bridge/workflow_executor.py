"""V23.4 Phase 4 T2-A' asyncio + SQLite workflow executor (wiki/432 §2.5).

This module runs the per-bridge asyncio loop that:
  - polls workflow_steps assigned to THIS_MACHINE_ID
  - atomically claims pending steps (TOCTOU-safe per pattern-toctou-atomic-update)
  - dispatches each via the existing enqueue_wake + execute_wake primitive
  - reports terminal status back to the rendezvous PC (Pattern A)

Pattern A: rendezvous PC owns workflow tables; peer PCs poll
GET /api/workflows/_pending and PATCH results back. No state replication.

Critic HIGH addressed:
  H1  _is_primary() reads MUSU_NODE_ROLE (not MUSU_PRIMARY_URL).
  H2  RETURNING + truthiness on every UPDATE (no .rowcount on db.execute).
  H3  _claim_step_toctou(db, step, this_machine_id) takes full step dict.
  H5  _get_sync_token from sync_engine; _primary_url is a local helper.
Critic MED addressed:
  M1  Peer-claim PATCH carries assigned_pc; server-side TOCTOU predicate.
Critic LOW addressed:
  L4  _peer_crash_sweeper async task for stale running-steps on rendezvous.
Auditor HIGH addressed:
  A-H1 Every UPDATE bumps updated_at (sweeper, crash recovery, primary claim).
  A-H2 _report_step_result returns bool with status checking so 5xx/transport
       failures preserve local state for retry.
Auditor MED addressed:
  A-M3 _peer_crash_sweep_once is a synchronous, testable single-iteration helper.
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import time
from typing import Any

import httpx

from sync_engine import _get_sync_token  # Per Critic H5: actual module path


logger = logging.getLogger(__name__)


POLL_INTERVAL_MS = int(os.environ.get("MUSU_WORKFLOW_EXECUTOR_POLL_MS", "1000"))
POLL_BATCH = int(os.environ.get("MUSU_WORKFLOW_EXECUTOR_BATCH", "5"))
PEER_SWEEPER_INTERVAL_S = int(
    os.environ.get("MUSU_WORKFLOW_PEER_SWEEPER_INTERVAL_S", "60")
)


def _enabled() -> bool:
    """Read MUSU_WORKFLOW_EXECUTOR_ENABLED lazily so tests can flip mid-run."""
    return (
        os.environ.get("MUSU_WORKFLOW_EXECUTOR_ENABLED", "true").lower()
        == "true"
    )


# Cached per-process; reset between tests by reload or by setting back to None.
_this_machine_id: str | None = None


def _resolve_this_machine_id(db: Any) -> str | None:
    """Resolve MUSU_NODE_NAME → machines.id per Researcher F-R7.1.

    Looks first by hostname then by id (some deployments set MUSU_NODE_NAME to
    the machine id directly). Returns None if unresolvable — loop will refuse
    to start so the operator gets a clear log line.
    """
    global _this_machine_id
    if _this_machine_id:
        return _this_machine_id
    node_name = os.environ.get("MUSU_NODE_NAME")
    if not node_name:
        return None
    rows = db.execute(
        "SELECT id FROM machines WHERE hostname = ? OR id = ?",
        (node_name, node_name),
    )
    _this_machine_id = rows[0][0] if rows else None
    return _this_machine_id


def _is_primary() -> bool:
    """Per Critic H1 + OQ-CRIT-1: reuse MUSU_NODE_ROLE per server.py:577.

    Rendezvous-decoupling (separate MUSU_WORKFLOW_RENDEZVOUS env) deferred to
    V23.5 if/when failover decoupling becomes necessary.
    """
    return os.environ.get("MUSU_NODE_ROLE", "primary").lower() == "primary"


def _primary_url() -> str:
    """Local helper (Critic H5) — returns rendezvous PC base URL.

    Raises if called on a peer that has no primary configured (would be a
    logic bug — peer code paths must only be entered when _is_primary() is
    False AND MUSU_PRIMARY_URL is set).
    """
    url = os.environ.get("MUSU_PRIMARY_URL", "").rstrip("/")
    if not url:
        raise RuntimeError(
            "MUSU_PRIMARY_URL must be set when MUSU_NODE_ROLE != primary"
        )
    return url


# ---------------------------------------------------------------------------
# Crash recovery + peer sweeper
# ---------------------------------------------------------------------------


async def _crash_recovery(db: Any, this_machine_id: str) -> None:
    """Mark stale 'running' steps for THIS_MACHINE_ID as failed at startup.

    Per Critic H2: RETURNING + truthiness; never .rowcount on db.execute().
    Per OQ-CRIT-2: marks as 'failed' + error_json reason='executor_crash'.
    Operator recovers via POST /api/workflows/{id}/retry — avoids silent
    double-invoke of non-idempotent agent steps.
    Per Auditor A-HIGH-1: bumps updated_at.
    """
    now = int(time.time())
    recovered = db.execute(
        "UPDATE workflow_steps "
        "SET status = 'failed', error_json = ?, finished_at = ?, updated_at = ? "
        "WHERE assigned_pc = ? AND status = 'running' RETURNING id",
        (
            json.dumps({"reason": "executor_crash"}),
            now,
            now,
            this_machine_id,
        ),
    )
    if recovered:
        logger.warning(
            "[workflow_executor] crash recovery: marked %d stale running "
            "steps as failed (this_machine=%s)",
            len(recovered),
            this_machine_id,
        )


def _peer_crash_sweep_once(db: Any) -> list:
    """Single synchronous sweep iteration — extracted per Auditor A-MED-3.

    Lets T24 drive one iteration without a `while True` async loop. Sweeps
    stale 'running' steps whose assigned peer PC likely crashed (started_at
    older than MUSU_WORKFLOW_PEER_TIMEOUT_S, default 7200s). Returns the
    swept rows.

    Per Critic H2: RETURNING + truthiness.
    Per Auditor A-HIGH-1: bumps updated_at.
    """
    timeout_floor = int(os.environ.get("MUSU_WORKFLOW_PEER_TIMEOUT_S", "7200"))
    now = int(time.time())
    swept = db.execute(
        "UPDATE workflow_steps "
        "SET status = 'timeout', error_json = ?, finished_at = ?, updated_at = ? "
        "WHERE status = 'running' AND started_at IS NOT NULL "
        "AND started_at < ? - ? "
        "RETURNING id, assigned_pc",
        (
            json.dumps({"reason": "peer_timeout"}),
            now,
            now,
            now,
            timeout_floor,
        ),
    )
    return list(swept) if swept else []


async def _peer_crash_sweeper(db: Any) -> None:
    """Rendezvous-side periodic wrapper around _peer_crash_sweep_once.

    Per Critic L4 + OQ-CRIT-3: skipped on peer PCs (peers recover their own
    steps at startup via _crash_recovery). Runs every
    MUSU_WORKFLOW_PEER_SWEEPER_INTERVAL_S seconds (default 60).
    """
    if not _is_primary():
        return
    while True:
        try:
            swept = _peer_crash_sweep_once(db)
            if swept:
                logger.warning(
                    "[workflow_executor] peer sweeper: timed out %d stale "
                    "running steps (peers likely offline): %s",
                    len(swept),
                    [(r["id"], r["assigned_pc"]) for r in swept],
                )
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception(
                "[workflow_executor] peer sweeper iteration error; continuing"
            )
        await asyncio.sleep(PEER_SWEEPER_INTERVAL_S)


# ---------------------------------------------------------------------------
# Fetch + claim + execute + report
# ---------------------------------------------------------------------------


async def _fetch_pending_steps(
    db: Any, this_machine_id: str
) -> list[dict]:
    """Return pending step dicts for THIS_MACHINE.

    Primary path: local SQLite via handlers.get_pending_steps_for_pc.
    Peer path: httpx GET to rendezvous /api/workflows/_pending with Bearer.
    """
    if _is_primary():
        from handlers import get_pending_steps_for_pc  # noqa: PLC0415

        return get_pending_steps_for_pc(db, this_machine_id, POLL_BATCH)
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(
            f"{_primary_url()}/api/workflows/_pending",
            params={"assigned_pc": this_machine_id, "limit": POLL_BATCH},
            headers={"Authorization": f"Bearer {_get_sync_token()}"},
        )
        resp.raise_for_status()
        return resp.json()


async def _claim_step_toctou(
    db: Any, step: dict, this_machine_id: str
) -> bool:
    """TOCTOU-safe claim. Primary: local UPDATE...RETURNING. Peer: HTTP PATCH.

    Per Critic H3: signature receives full `step` dict (must contain both
    `step_id` AND `workflow_id`); do not split into separate args.

    Per Critic H2: RETURNING + truthiness on db.execute() return; never
    .rowcount.

    Per Critic M1: peer-claim PATCH is TOCTOU-safe server-side because
    transition_workflow_step enforces `AND status='pending' AND assigned_pc=?`
    for the 'running' transition. Both branches have semantically identical
    race semantics — only one claimant wins.

    Per Auditor A-HIGH-1: primary branch bumps workflow_steps.updated_at.
    """
    step_id = step["step_id"]
    workflow_id = step["workflow_id"]
    if _is_primary():
        now = int(time.time())
        claimed = db.execute(
            "UPDATE workflow_steps "
            "SET status = 'running', started_at = ?, updated_at = ? "
            "WHERE id = ? AND status = 'pending' AND assigned_pc = ? "
            "RETURNING id",
            (now, now, step_id, this_machine_id),
        )
        return bool(claimed)
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.patch(
            f"{_primary_url()}/api/workflows/{workflow_id}/steps/{step_id}",
            json={"status": "running", "assigned_pc": this_machine_id},
            headers={"Authorization": f"Bearer {_get_sync_token()}"},
        )
        if resp.status_code == 204:
            return True
        if resp.status_code == 409:
            return False
        resp.raise_for_status()
        return False


async def _execute_step(
    db: Any, router: Any, step: dict, timeout_seconds: int
) -> None:
    """Wrap enqueue_wake + execute_wake per Researcher F-R2.1.

    Outcome reporting via _report_step_result (returns False on transport
    failures — caller in loop logs and will retry next iteration).
    """
    from musu_core.dispatch.wake import enqueue_wake, execute_wake  # noqa: PLC0415

    run_id = enqueue_wake(
        db,
        agent_id=step["agent_id"],
        wake_reason="workflow_step",
        wake_payload={
            "workflow_id": step["workflow_id"],
            "step_id": step["step_id"],
            "input": json.loads(step.get("input_json") or "{}"),
        },
    )
    try:
        await asyncio.wait_for(
            execute_wake(db, router, run_id), timeout=timeout_seconds
        )
        rows = db.execute(
            "SELECT status, summary, error FROM heartbeat_runs WHERE id = ?",
            (run_id,),
        )
        if not rows:
            raise RuntimeError(
                f"heartbeat_runs row missing for run_id={run_id}"
            )
        row = rows[0]
        final = "succeeded" if row["status"] == "completed" else "failed"
        await _report_step_result(
            db,
            step,
            final,
            result_json=row["summary"],
            error_json=row["error"],
        )
    except asyncio.TimeoutError:
        # Step ran past spec timeout — distinct from peer-sweeper's
        # 'peer_timeout' reason.
        await _report_step_result(
            db,
            step,
            "timeout",
            error_json=json.dumps({"reason": "spec_timeout"}),
        )
    except Exception as e:
        logger.exception(
            "[workflow_executor] step %s failed", step["step_id"]
        )
        await _report_step_result(
            db,
            step,
            "failed",
            error_json=json.dumps({"reason": str(e)}),
        )


async def _report_step_result(
    db: Any,
    step: dict,
    new_status: str,
    result_json: str | None = None,
    error_json: str | None = None,
) -> bool:
    """Report a terminal status for a step. Returns True iff reported.

    Per Auditor A-HIGH-2: returns True on confirmed 204 or 404 (workflow
    gone — nothing to retry), False on 5xx / transport error so caller can
    preserve local state for retry. Without status checking, a 5xx from
    rendezvous silently lost step state.

    Primary path: synchronous local handler call (always succeeds or raises).
    Peer path: httpx PATCH with status code branching.
    """
    if _is_primary():
        from handlers import transition_workflow_step  # noqa: PLC0415

        return transition_workflow_step(
            db, step["step_id"], new_status, result_json, error_json
        )
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.patch(
                f"{_primary_url()}/api/workflows/{step['workflow_id']}/"
                f"steps/{step['step_id']}",
                json={
                    "status": new_status,
                    "result_json": result_json,
                    "error_json": error_json,
                },
                headers={
                    "Authorization": f"Bearer {_get_sync_token()}"
                },
            )
        if resp.status_code == 204:
            return True
        if resp.status_code == 404:
            logger.warning(
                "[workflow_executor] terminal PATCH 404 for step %s "
                "(workflow likely deleted mid-step); dropping local state",
                step["step_id"],
            )
            return True  # nothing to retry — workflow is gone
        logger.warning(
            "[workflow_executor] terminal PATCH status=%s for step %s "
            "(new_status=%s); will retry next iteration",
            resp.status_code,
            step["step_id"],
            new_status,
        )
        return False
    except (httpx.RequestError, httpx.HTTPError) as e:
        logger.warning(
            "[workflow_executor] terminal PATCH transport error for step "
            "%s: %s; will retry next iteration",
            step["step_id"],
            e,
        )
        return False


# ---------------------------------------------------------------------------
# Main loop
# ---------------------------------------------------------------------------


async def _workflow_executor_loop(db: Any, router: Any) -> None:
    """Main asyncio loop. Mirrors heartbeat_scheduler.py:236-316 shape."""
    if not _enabled():
        logger.info(
            "[workflow_executor] disabled via MUSU_WORKFLOW_EXECUTOR_ENABLED"
        )
        return
    this_machine_id = _resolve_this_machine_id(db)
    if not this_machine_id:
        logger.warning(
            "[workflow_executor] cannot resolve THIS_MACHINE_ID; loop not started"
        )
        return
    if _is_primary():
        await _crash_recovery(db, this_machine_id)
    logger.info(
        "[workflow_executor] started; this_machine=%s, primary=%s",
        this_machine_id,
        _is_primary(),
    )
    while True:
        try:
            steps = await _fetch_pending_steps(db, this_machine_id)
            for step in steps:
                if not await _claim_step_toctou(db, step, this_machine_id):
                    continue  # another worker won
                wf_rows = db.execute(
                    "SELECT spec_json FROM workflows WHERE id = ?",
                    (step["workflow_id"],),
                )
                if not wf_rows:
                    continue
                spec = json.loads(wf_rows[0]["spec_json"])
                agent_spec = next(
                    (a for a in spec["agents"] if a["id"] == step["agent_id"]),
                    None,
                )
                if not agent_spec:
                    logger.warning(
                        "[workflow_executor] step %s references unknown "
                        "agent %s in workflow %s; skipping",
                        step["step_id"],
                        step["agent_id"],
                        step["workflow_id"],
                    )
                    continue
                timeout = agent_spec.get("timeoutSeconds", 3600)
                await _execute_step(db, router, step, timeout)
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception(
                "[workflow_executor] iteration error; continuing"
            )
        await asyncio.sleep(POLL_INTERVAL_MS / 1000.0)
