"""Phase 88: Structured logging — agent_id/task_id in JSON log records.

AC1:  _agent_id_var ContextVar exported from server
AC2:  _task_id_var ContextVar exported from server
AC3:  LogContextFilter class exported from server
AC4:  LogContextFilter.filter injects agent_id from ContextVar
AC5:  LogContextFilter.filter injects task_id from ContextVar
AC6:  LogContextFilter does not overwrite agent_id already set on record
AC7:  JsonFormatter includes agent_id in JSON output when present on record
AC8:  JsonFormatter includes task_id in JSON output when present on record
AC9:  JsonFormatter omits agent_id/task_id keys when absent
AC10: watchdog zombie-kill log includes agent_id + task_id extra fields
AC11: watchdog escalate log includes agent_id + task_id extra fields
AC12: watchdog warn log includes agent_id + task_id extra fields
"""
from __future__ import annotations

import json
import logging
import sys
import unittest.mock as mock
from contextvars import ContextVar
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

sys.path.insert(0, str(Path(__file__).parent.parent))


# ---------------------------------------------------------------------------
# AC1 — _agent_id_var ContextVar exported from server
# ---------------------------------------------------------------------------

def test_ac1_agent_id_var_exported():
    from server import _agent_id_var
    assert isinstance(_agent_id_var, ContextVar)


# ---------------------------------------------------------------------------
# AC2 — _task_id_var ContextVar exported from server
# ---------------------------------------------------------------------------

def test_ac2_task_id_var_exported():
    from server import _task_id_var
    assert isinstance(_task_id_var, ContextVar)


# ---------------------------------------------------------------------------
# AC3 — LogContextFilter class exported from server
# ---------------------------------------------------------------------------

def test_ac3_log_context_filter_exported():
    from server import LogContextFilter
    assert issubclass(LogContextFilter, logging.Filter)


# ---------------------------------------------------------------------------
# AC4 — LogContextFilter.filter injects agent_id from ContextVar
# ---------------------------------------------------------------------------

def test_ac4_filter_injects_agent_id():
    from server import LogContextFilter, _agent_id_var
    token = _agent_id_var.set("agent-abc")
    try:
        filt = LogContextFilter()
        record = logging.LogRecord(
            name="test", level=logging.INFO, pathname="", lineno=0,
            msg="hi", args=(), exc_info=None,
        )
        filt.filter(record)
        assert record.agent_id == "agent-abc"
    finally:
        _agent_id_var.reset(token)


# ---------------------------------------------------------------------------
# AC5 — LogContextFilter.filter injects task_id from ContextVar
# ---------------------------------------------------------------------------

def test_ac5_filter_injects_task_id():
    from server import LogContextFilter, _task_id_var
    token = _task_id_var.set("task-xyz")
    try:
        filt = LogContextFilter()
        record = logging.LogRecord(
            name="test", level=logging.INFO, pathname="", lineno=0,
            msg="hi", args=(), exc_info=None,
        )
        filt.filter(record)
        assert record.task_id == "task-xyz"
    finally:
        _task_id_var.reset(token)


# ---------------------------------------------------------------------------
# AC6 — LogContextFilter does not overwrite agent_id already set on record
# ---------------------------------------------------------------------------

def test_ac6_filter_does_not_overwrite_existing_agent_id():
    from server import LogContextFilter, _agent_id_var
    token = _agent_id_var.set("var-agent")
    try:
        filt = LogContextFilter()
        record = logging.LogRecord(
            name="test", level=logging.INFO, pathname="", lineno=0,
            msg="hi", args=(), exc_info=None,
        )
        record.agent_id = "pre-set-agent"
        filt.filter(record)
        assert record.agent_id == "pre-set-agent"
    finally:
        _agent_id_var.reset(token)


# ---------------------------------------------------------------------------
# AC7 — JsonFormatter includes agent_id in JSON when present on record
# ---------------------------------------------------------------------------

def test_ac7_json_formatter_includes_agent_id():
    from server import JsonFormatter
    formatter = JsonFormatter()
    record = logging.LogRecord(
        name="test", level=logging.INFO, pathname="", lineno=0,
        msg="msg", args=(), exc_info=None,
    )
    record.agent_id = "agent-001"
    output = json.loads(formatter.format(record))
    assert output.get("agent_id") == "agent-001"


# ---------------------------------------------------------------------------
# AC8 — JsonFormatter includes task_id in JSON when present on record
# ---------------------------------------------------------------------------

def test_ac8_json_formatter_includes_task_id():
    from server import JsonFormatter
    formatter = JsonFormatter()
    record = logging.LogRecord(
        name="test", level=logging.INFO, pathname="", lineno=0,
        msg="msg", args=(), exc_info=None,
    )
    record.task_id = "task-002"
    output = json.loads(formatter.format(record))
    assert output.get("task_id") == "task-002"


# ---------------------------------------------------------------------------
# AC9 — JsonFormatter omits agent_id/task_id keys when absent / falsy
# ---------------------------------------------------------------------------

def test_ac9_json_formatter_omits_absent_agent_task_id():
    from server import JsonFormatter
    formatter = JsonFormatter()
    record = logging.LogRecord(
        name="test", level=logging.INFO, pathname="", lineno=0,
        msg="plain", args=(), exc_info=None,
    )
    output = json.loads(formatter.format(record))
    assert "agent_id" not in output
    assert "task_id" not in output


# ---------------------------------------------------------------------------
# Helpers for watchdog tests (AC10-12)
# ---------------------------------------------------------------------------

def _make_watchdog_row(task_id: str, channel: str, last_activity: str) -> dict:
    return {"id": task_id, "channel": channel, "last_activity_at": last_activity}


def _run_watchdog_with_mock_db(rows_by_query: dict) -> list[logging.LogRecord]:
    """Run _run_watchdog_once with mocked DB and capture log records."""
    import asyncio
    import watchdog as wd

    captured: list[logging.LogRecord] = []

    class _Cap(logging.Handler):
        def emit(self, record: logging.LogRecord) -> None:
            captured.append(record)

    handler = _Cap()
    wd_logger = logging.getLogger("musu.watchdog")
    wd_logger.addHandler(handler)
    wd_logger.setLevel(logging.DEBUG)

    mock_db = MagicMock()

    def _db_execute(sql: str, params):
        if "kill_cutoff" in sql or (len(params) == 1):
            return rows_by_query.get("kill", [])
        args = params
        if len(args) == 2:
            # distinguishing escalate vs warn by which cutoffs are used
            # escalate: (escalate_cutoff, kill_cutoff) → second param is kill_cutoff
            # warn: (warn_cutoff, escalate_cutoff) → second param is escalate_cutoff
            # We just return keyed by call order; easier to mock execute directly
            pass
        return []

    mock_backend = MagicMock()
    mock_backend._db.execute.side_effect = lambda sql, params: (
        rows_by_query.get("kill", []) if len(params) == 1
        else rows_by_query.get("escalate", []) if rows_by_query.get("escalate") is not None and len(params) == 2 and "escalate" in str(rows_by_query)
        else rows_by_query.get("warn", []) if rows_by_query.get("warn") is not None
        else []
    )

    try:
        with patch.object(wd, "_get_watchdog_backend", return_value=mock_backend):
            asyncio.get_event_loop().run_until_complete(wd._run_watchdog_once())
    finally:
        wd_logger.removeHandler(handler)

    return captured


# ---------------------------------------------------------------------------
# AC10 — watchdog zombie-kill log includes agent_id + task_id extra fields
# ---------------------------------------------------------------------------

def test_ac10_watchdog_kill_log_has_agent_id_task_id():
    import asyncio
    import watchdog as wd

    captured: list[logging.LogRecord] = []

    class _Cap(logging.Handler):
        def emit(self, r: logging.LogRecord) -> None:
            captured.append(r)

    handler = _Cap()
    wd_logger = logging.getLogger("musu.watchdog")
    wd_logger.addHandler(handler)
    wd_logger.setLevel(logging.DEBUG)

    kill_row = {"id": "task-kill-1", "channel": "engineer", "last_activity_at": "2026-01-01T00:00:00"}
    call_count = [0]

    def _execute(sql, params):
        call_count[0] += 1
        if call_count[0] == 1:
            return [kill_row]  # kill scan
        return []  # escalate + warn scans

    mock_backend = MagicMock()
    mock_backend._db.execute.side_effect = _execute

    try:
        with patch.object(wd, "_get_watchdog_backend", return_value=mock_backend):
            asyncio.get_event_loop().run_until_complete(wd._run_watchdog_once())
    finally:
        wd_logger.removeHandler(handler)

    kill_logs = [r for r in captured if "zombie cancel" in r.getMessage()]
    assert kill_logs, "Expected zombie cancel log"
    rec = kill_logs[0]
    assert getattr(rec, "agent_id", None) == "engineer"
    assert getattr(rec, "task_id", None) == "task-kill-1"


# ---------------------------------------------------------------------------
# AC11 — watchdog escalate log includes agent_id + task_id extra fields
# ---------------------------------------------------------------------------

def test_ac11_watchdog_escalate_log_has_agent_id_task_id():
    import asyncio
    import watchdog as wd

    captured: list[logging.LogRecord] = []

    class _Cap(logging.Handler):
        def emit(self, r: logging.LogRecord) -> None:
            captured.append(r)

    handler = _Cap()
    wd_logger = logging.getLogger("musu.watchdog")
    wd_logger.addHandler(handler)
    wd_logger.setLevel(logging.DEBUG)

    escalate_row = {"id": "task-esc-1", "channel": "cto", "last_activity_at": "2026-01-01T00:00:00"}
    call_count = [0]

    def _execute(sql, params):
        call_count[0] += 1
        if call_count[0] == 1:
            return []  # kill scan — nothing
        if call_count[0] == 2:
            return [escalate_row]  # escalate scan
        return []  # warn scan

    mock_backend = MagicMock()
    mock_backend._db.execute.side_effect = _execute

    try:
        with patch.object(wd, "_get_watchdog_backend", return_value=mock_backend):
            asyncio.get_event_loop().run_until_complete(wd._run_watchdog_once())
    finally:
        wd_logger.removeHandler(handler)

    esc_logs = [r for r in captured if "ESCALATE" in r.getMessage()]
    assert esc_logs, "Expected ESCALATE log"
    rec = esc_logs[0]
    assert getattr(rec, "agent_id", None) == "cto"
    assert getattr(rec, "task_id", None) == "task-esc-1"


# ---------------------------------------------------------------------------
# AC12 — watchdog warn log includes agent_id + task_id extra fields
# ---------------------------------------------------------------------------

def test_ac12_watchdog_warn_log_has_agent_id_task_id():
    import asyncio
    import watchdog as wd

    captured: list[logging.LogRecord] = []

    class _Cap(logging.Handler):
        def emit(self, r: logging.LogRecord) -> None:
            captured.append(r)

    handler = _Cap()
    wd_logger = logging.getLogger("musu.watchdog")
    wd_logger.addHandler(handler)
    wd_logger.setLevel(logging.DEBUG)

    warn_row = {"id": "task-warn-1", "channel": "ceo", "last_activity_at": "2026-01-01T00:00:00"}
    call_count = [0]

    def _execute(sql, params):
        call_count[0] += 1
        if call_count[0] <= 2:
            return []  # kill + escalate scans — nothing
        return [warn_row]  # warn scan

    mock_backend = MagicMock()
    mock_backend._db.execute.side_effect = _execute

    try:
        with patch.object(wd, "_get_watchdog_backend", return_value=mock_backend):
            asyncio.get_event_loop().run_until_complete(wd._run_watchdog_once())
    finally:
        wd_logger.removeHandler(handler)

    warn_logs = [r for r in captured if "approaching timeout" in r.getMessage()]
    assert warn_logs, "Expected approaching timeout log"
    rec = warn_logs[0]
    assert getattr(rec, "agent_id", None) == "ceo"
    assert getattr(rec, "task_id", None) == "task-warn-1"
