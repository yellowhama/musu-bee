"""Cross-process atomicity tests (v19.F.2 Phase C).

Both tests use multiprocessing.get_context('spawn') for Windows safety.
Worker functions are module-level so spawn can pickle them.

Marked @pytest.mark.slow — excluded from default sweep. Run with:
    pytest -m slow musu-core/tests/test_approval_multiprocess.py -v -s
"""

from __future__ import annotations

import multiprocessing as mp
import os
import sys

import pytest


def _worker_record_event(db_path: str, run_id: str, prefix: str, n: int) -> None:
    """Module-level worker: fire n record_event calls on the given DB."""
    # Each spawn'd child re-imports modules and runs migrations on Database
    # init. Clear any cached Database instances from the parent's state.
    from musu_core.db import Database, _db_instances
    _db_instances.clear()
    from musu_core.dispatch.wake import record_event

    db = Database(db_path)
    for i in range(n):
        record_event(db, run_id, f"{prefix}_{i}")
    db.close()


def _worker_submit_approval(db_path: str, approval_id: str, results: list) -> None:
    """Module-level worker: call submit_approval once and append the result."""
    from musu_core.db import Database, _db_instances
    _db_instances.clear()
    from musu_core.dispatch.approval import submit_approval

    db = Database(db_path)
    res = submit_approval(db, approval_id, "approved")
    # Strip non-pickleable values just in case (e.g. nested Event refs).
    results.append({
        k: v for k, v in res.items()
        if isinstance(v, (str, int, bool, type(None)))
    })
    db.close()


@pytest.mark.slow
def test_record_event_cross_process_atomicity(tmp_path) -> None:
    """4 procs × 50 record_event = 200 rows seq 1..200 contiguous.

    Carryover from v19.F.1 Constitution VI experiment, now pinned as
    a regression-prevention test. SQLite WAL must serialize the
    single-INSERT-with-subquery across processes.
    """
    db_path = str(tmp_path / "xproc.db")

    # Seed from this process so migrations run + agent/run exist.
    from musu_core.db import Database, _db_instances
    _db_instances.clear()
    db = Database(db_path)
    db.execute(
        "INSERT INTO agents (id, name, role) VALUES ('a1', 'tester', 'ceo')"
    )
    db.execute(
        "INSERT INTO heartbeat_runs (id, agent_id, wake_reason, status) "
        "VALUES ('r1', 'a1', 'test', 'running')"
    )
    db.close()
    _db_instances.clear()

    ctx = mp.get_context("spawn")
    N_PER_PROC = 50
    N_PROCS = 4
    procs = [
        ctx.Process(
            target=_worker_record_event,
            args=(db_path, "r1", f"w{i}", N_PER_PROC),
        )
        for i in range(N_PROCS)
    ]
    for p in procs:
        p.start()
    for p in procs:
        p.join(timeout=60)
        assert p.exitcode == 0, f"worker exited with {p.exitcode}"

    # Re-open and verify.
    db = Database(db_path)
    rows = db.execute(
        "SELECT seq FROM heartbeat_run_events "
        "WHERE run_id='r1' ORDER BY seq ASC"
    )
    seqs = [r["seq"] for r in rows]
    expected_total = N_PER_PROC * N_PROCS
    assert len(seqs) == expected_total, (
        f"missing rows: got {len(seqs)} expected {expected_total}"
    )
    assert seqs == list(range(1, expected_total + 1)), (
        f"seq not contiguous 1..{expected_total}; "
        f"first 20: {seqs[:20]}, last 5: {seqs[-5:]}"
    )
    db.close()


@pytest.mark.slow
def test_submit_approval_cross_process_mutual_exclusion(tmp_path) -> None:
    """2 procs × same approval_id × submit_approval(approved).

    Exactly one process gets resolved=True. The other gets
    already_resolved=True (or returns the same approval_id with
    a non-resolved outcome). At most 1 resume wake enqueued.
    """
    db_path = str(tmp_path / "xproc_approval.db")

    # Seed: agent + run waiting_approval + pending approval row.
    from musu_core.db import Database, _db_instances
    _db_instances.clear()
    db = Database(db_path)
    db.execute(
        "INSERT INTO agents (id, name, role) VALUES ('a1', 'tester', 'ceo')"
    )
    db.execute(
        "INSERT INTO heartbeat_runs "
        "(id, agent_id, wake_reason, wake_payload, status) "
        "VALUES ('r1', 'a1', 'test', '{\"prompt\":\"hi\"}', 'waiting_approval')"
    )
    db.execute(
        "INSERT INTO run_approvals (id, run_id, prompt, status) "
        "VALUES ('a-x', 'r1', 'go?', 'pending')"
    )
    db.close()
    _db_instances.clear()

    ctx = mp.get_context("spawn")
    manager = ctx.Manager()
    results = manager.list()

    p1 = ctx.Process(
        target=_worker_submit_approval, args=(db_path, "a-x", results)
    )
    p2 = ctx.Process(
        target=_worker_submit_approval, args=(db_path, "a-x", results)
    )
    p1.start()
    p2.start()
    p1.join(timeout=30)
    p2.join(timeout=30)
    assert p1.exitcode == 0
    assert p2.exitcode == 0

    outcomes = list(results)
    assert len(outcomes) == 2, f"expected 2 outcomes, got {len(outcomes)}: {outcomes}"

    resolved = [r for r in outcomes if r.get("resolved") is True]
    already = [r for r in outcomes if r.get("already_resolved") is True]
    assert len(resolved) == 1, (
        f"expected exactly 1 winner, got {len(resolved)} "
        f"(outcomes: {outcomes})"
    )
    assert len(already) == 1, (
        f"expected exactly 1 already_resolved, got {len(already)} "
        f"(outcomes: {outcomes})"
    )

    # At most 1 resume wake enqueued (neither process has the in-memory
    # waiter — fresh spawn'd processes have empty _approval_events dict
    # — so the winner takes the orphan-approved path and enqueues
    # exactly 1 resume run).
    db = Database(db_path)
    resume_rows = db.execute(
        "SELECT id FROM heartbeat_runs WHERE wake_reason='approval_resumed'"
    )
    assert len(resume_rows) == 1, (
        f"expected exactly 1 resume wake (orphan-approved path), "
        f"got {len(resume_rows)}"
    )

    # Confirm approval_status mirror reflects the decision.
    rows = db.execute(
        "SELECT approval_status FROM heartbeat_runs WHERE id='r1'"
    )
    assert rows[0]["approval_status"] == "approved", (
        f"approval_status mirror = {rows[0]['approval_status']}"
    )
    db.close()
