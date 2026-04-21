"""Tests for global (cross-company) runs and costs helpers."""
from __future__ import annotations

import datetime

import pytest

from musu_core.backends.local import LocalBackend


def _backend(tmp_path) -> LocalBackend:
    return LocalBackend(db_path=str(tmp_path / "test.db"))


def _insert_execution(b: LocalBackend, status: str, channel: str, company_id: str = "co1"):
    """Insert a route_execution row directly for test setup."""
    b._db.execute(
        "INSERT INTO route_executions (channel, sender_id, company_id, status, input)"
        " VALUES (?, 'test-sender', ?, ?, ?)",
        (channel, company_id, status, "{}"),
    )


def test_get_runs_recent_returns_list(tmp_path):
    b = _backend(tmp_path)
    _insert_execution(b, "done", "ceo")
    _insert_execution(b, "failed", "cto")
    rows = b.get_runs_recent(limit=10)
    assert isinstance(rows, list)
    assert len(rows) == 2


def test_get_runs_recent_respects_limit(tmp_path):
    b = _backend(tmp_path)
    for i in range(10):
        _insert_execution(b, "done", f"agent_{i}")
    rows = b.get_runs_recent(limit=3)
    assert len(rows) == 3


def test_get_runs_recent_includes_expected_fields(tmp_path):
    b = _backend(tmp_path)
    _insert_execution(b, "done", "ceo", "company-123")
    row = b.get_runs_recent(limit=1)[0]
    assert "id" in row
    assert "status" in row
    assert "channel" in row
    assert "company_id" in row
    assert "created_at" in row


def test_get_costs_global_sums_all_companies(tmp_path):
    b = _backend(tmp_path)
    _insert_execution(b, "done", "ceo", "co1")
    _insert_execution(b, "failed", "cto", "co2")
    _insert_execution(b, "done", "cos", "co1")
    result = b.get_costs_global()
    assert result["total_requests"] == 3
    assert result["by_status"]["done"] == 2
    assert result["by_status"]["failed"] == 1


def test_get_costs_global_empty_returns_zero(tmp_path):
    b = _backend(tmp_path)
    result = b.get_costs_global()
    assert result["total_requests"] == 0
    assert result["by_status"] == {}


def test_get_costs_by_agent_global_groups_by_channel(tmp_path):
    b = _backend(tmp_path)
    _insert_execution(b, "done", "ceo", "co1")
    _insert_execution(b, "done", "ceo", "co2")
    _insert_execution(b, "failed", "cto", "co1")
    rows = b.get_costs_by_agent_global()
    by_name = {r["agent_name"]: r for r in rows}
    assert by_name["ceo"]["total_requests"] == 2
    assert by_name["ceo"]["done"] == 2
    assert by_name["cto"]["total_requests"] == 1
    assert by_name["cto"]["failed"] == 1
