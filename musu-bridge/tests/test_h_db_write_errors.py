"""V23.5 H-2: uniform DB-write try/catch tests (4 sites + kill-switch).

Verifies the V23.5 H-2 contract at 4 DB-write sites:
  1. handlers.py route_chat  (site=route_chat_db_write) — fail-open, no kill-switch branch
  2. server.py  delegate     (site=delegate_db_write)   — 500 vs legacy HTTPException(500)
  3. server.py  create_company (site=create_company_db_write) — 500 vs legacy bubble
  4. dispatch_routes.py post_wake (site=dispatch_wake_db_write) — 500 vs legacy HTTPException(400)

For each site (where applicable):
  - DB write success → normal response, no logger.error emitted
  - DB write failure (mocked Exception) → logger.error with extra={error_class, error_msg, site}
  - Kill-switch ON (default)  → JSONResponse 500 + bridge_error envelope
  - Kill-switch OFF           → legacy control flow (raise / HTTPException at original status)

Plus cross-cutting invariants:
  - All 4 site names unique and disjoint from H-1's 4 site names.
  - logger schema mirrors H-1 (extra={error_class, error_msg, site}) byte-identical keys.

Master plan: wiki/459 v4 §5.H-2; impl plan: wiki/460 §2 H-2; pattern source: V23.4 F-B2-3 (wiki/428).
"""
from __future__ import annotations

import logging
import os
import sys
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).parent.parent))

# Ensure server imports go through conftest's MUSU_BRIDGE_TOKEN setup.
from server import app  # noqa: E402

client = TestClient(app, headers={"Authorization": "Bearer test-token"})


# ── H-2 site name registry (must stay disjoint from H-1's 4 sites) ───────────
_H2_SITES = {
    "route_chat_db_write",
    "delegate_db_write",
    "create_company_db_write",
    "dispatch_wake_db_write",
}
_H1_SITES = {
    "probe_agent_health_outer",
    "route_chat_cb_import",
    "startup_durability_redispatch",
    "startup_mdns_init",
}


# ── Cross-cutting invariants ─────────────────────────────────────────────────

def test_h2_site_names_unique_and_disjoint_from_h1():
    """All 4 H-2 sites are unique and don't collide with any H-1 site name."""
    assert len(_H2_SITES) == 4, "H-2 expects exactly 4 unique site names"
    overlap = _H2_SITES & _H1_SITES
    assert overlap == set(), f"H-2 sites must not overlap H-1: {overlap}"


def test_h2_kill_switch_default_on():
    """Kill-switch default ON: unset env → uniform handling enabled."""
    from handlers import _uniform_db_error_handling_enabled

    # Use clear=True to remove any inherited MUSU_UNIFORM_DB_ERROR_HANDLING_ENABLED.
    with patch.dict(os.environ, {}, clear=False):
        os.environ.pop("MUSU_UNIFORM_DB_ERROR_HANDLING_ENABLED", None)
        assert _uniform_db_error_handling_enabled() is True


def test_h2_kill_switch_explicit_off():
    """Kill-switch OFF: MUSU_UNIFORM_DB_ERROR_HANDLING_ENABLED=0 → legacy handling."""
    from handlers import _uniform_db_error_handling_enabled

    with patch.dict(os.environ, {"MUSU_UNIFORM_DB_ERROR_HANDLING_ENABLED": "0"}):
        assert _uniform_db_error_handling_enabled() is False


def test_h2_kill_switch_any_other_value_keeps_on():
    """Any value other than '0' keeps uniform handling ON (defensive default)."""
    from handlers import _uniform_db_error_handling_enabled

    for v in ("1", "true", "TRUE", "yes", "on", ""):
        with patch.dict(os.environ, {"MUSU_UNIFORM_DB_ERROR_HANDLING_ENABLED": v}):
            assert _uniform_db_error_handling_enabled() is True, f"value {v!r} unexpectedly disabled"


# ── Site 1: handlers.py route_chat (route_chat_db_write) ─────────────────────
# Fail-open invariant: route_chat ALWAYS continues; logger.error is the only
# observable change. Kill-switch is irrelevant here (no control-flow branch).

@pytest.mark.asyncio
async def test_site1_route_chat_db_write_success_no_error_log(caplog):
    """route_chat success path: no db_write logger.error.

    Strategy: mock create_route_execution to succeed; allow route_chat to fail
    downstream (no agent registered) — we only assert the db_write site emits
    nothing on success.
    """
    from handlers import route_chat

    mock_backend = MagicMock()
    mock_backend.create_route_execution.return_value = None
    mock_backend.update_route_execution.return_value = None
    mock_backend._db.execute.return_value = []

    with patch("handlers._get_backend", return_value=mock_backend), \
         patch("handlers._health_probe_enabled", return_value=False):
        with caplog.at_level(logging.ERROR, logger="handlers"):
            try:
                await route_chat(channel="zzzz_unknown", sender_id="u1", text="hi")
            except Exception:
                pass  # downstream errors out of scope
    db_write_errs = [r for r in caplog.records if getattr(r, "site", "") == "route_chat_db_write"]
    assert db_write_errs == [], "no db_write logger.error on success path"


@pytest.mark.asyncio
async def test_site1_route_chat_db_write_failure_logs_and_falls_through(caplog):
    """route_chat DB write failure → logger.error with H-1 schema; control flow preserved."""
    from handlers import route_chat

    mock_backend = MagicMock()
    mock_backend.create_route_execution.side_effect = RuntimeError("disk full simulated")
    mock_backend._db.execute.return_value = []

    with patch("handlers._get_backend", return_value=mock_backend), \
         patch("handlers._health_probe_enabled", return_value=False):
        with caplog.at_level(logging.ERROR, logger="handlers"):
            try:
                await route_chat(channel="zzzz_unknown", sender_id="u1", text="hi")
            except Exception:
                pass

    db_write_errs = [r for r in caplog.records if getattr(r, "site", "") == "route_chat_db_write"]
    assert len(db_write_errs) == 1, f"expected exactly 1 db_write error log, got {len(db_write_errs)}"
    rec = db_write_errs[0]
    assert rec.message == "db write failed"
    assert rec.error_class == "RuntimeError"
    assert "disk full simulated" in rec.error_msg
    assert rec.site == "route_chat_db_write"


@pytest.mark.asyncio
async def test_site1_route_chat_db_write_logger_schema_kill_switch_off(caplog):
    """Kill-switch OFF: route_chat still logs (fail-open site is unconditional)."""
    from handlers import route_chat

    mock_backend = MagicMock()
    mock_backend.create_route_execution.side_effect = RuntimeError("oops")
    mock_backend._db.execute.return_value = []

    with patch.dict(os.environ, {"MUSU_UNIFORM_DB_ERROR_HANDLING_ENABLED": "0"}), \
         patch("handlers._get_backend", return_value=mock_backend), \
         patch("handlers._health_probe_enabled", return_value=False):
        with caplog.at_level(logging.ERROR, logger="handlers"):
            try:
                await route_chat(channel="zzzz_unknown", sender_id="u1", text="hi")
            except Exception:
                pass
    db_write_errs = [r for r in caplog.records if getattr(r, "site", "") == "route_chat_db_write"]
    assert len(db_write_errs) == 1, "route_chat logger.error fires regardless of kill-switch"


def test_site1_route_chat_db_write_error_msg_capped():
    """error_msg truncated at 200 chars (matches H-1 invariant)."""
    # Source-level scan — handlers.py route_chat site uses str(exc)[:200]
    src = Path(__file__).parent.parent / "handlers.py"
    text = src.read_text(encoding="utf-8")
    # Find the route_chat_db_write block (after its site identifier)
    idx = text.find('"site": "route_chat_db_write"')
    assert idx > 0
    block = text[max(0, idx - 600):idx + 200]
    assert "str(exc)[:200]" in block, "route_chat_db_write logger must cap error_msg at 200 chars"


# ── Site 2: server.py delegate (delegate_db_write) ───────────────────────────

def test_site2_delegate_db_write_success_returns_202():
    """delegate happy path: 202 + task_id, no db_write logger.error."""
    mock_backend = MagicMock()
    mock_backend.create_route_execution.return_value = None
    mock_backend.update_route_execution.return_value = None
    # _db.execute calls return iterables; one call for input_hash UPDATE.
    mock_backend._db.execute.return_value = []

    # MUSU_PLAN=pro bypasses free-tier gate (which queries DB).
    with patch.dict(os.environ, {"MUSU_PLAN": "pro"}), \
         patch("handlers._get_backend", return_value=mock_backend), \
         patch("server.get_channel_map", return_value={"engineer": {"agent_id": "a1"}}), \
         patch("server.get_company", return_value=None), \
         patch("server.get_agent_by_id", return_value=None), \
         patch("server._get_channel_semaphore") as mock_sem:
        mock_sem.return_value.at_capacity.return_value = False
        r = client.post(
            "/api/tasks/delegate",
            json={"channel": "engineer", "sender_id": "u1", "text": "delegate test 1"},
        )
    # On happy path we expect 202 (Accepted) per route decorator status_code=202.
    assert r.status_code == 202, f"got {r.status_code}: {r.text}"
    assert "task_id" in r.json()


def test_site2_delegate_db_write_failure_kill_switch_on(caplog):
    """Kill-switch ON: DB failure → 500 JSONResponse bridge_error envelope."""
    mock_backend = MagicMock()
    mock_backend.create_route_execution.side_effect = RuntimeError("db locked")
    mock_backend._db.execute.return_value = []

    with patch.dict(os.environ, {
        "MUSU_UNIFORM_DB_ERROR_HANDLING_ENABLED": "1",
        "MUSU_PLAN": "pro",
    }), \
         patch("handlers._get_backend", return_value=mock_backend), \
         patch("server.get_channel_map", return_value={"engineer": {"agent_id": "a1"}}), \
         patch("server.get_company", return_value=None), \
         patch("server.get_agent_by_id", return_value=None), \
         patch("server._get_channel_semaphore") as mock_sem:
        mock_sem.return_value.at_capacity.return_value = False
        with caplog.at_level(logging.ERROR, logger="server"):
            r = client.post(
                "/api/tasks/delegate",
                json={"channel": "engineer", "sender_id": "u1", "text": "delegate test ks-on"},
            )
    assert r.status_code == 500
    body = r.json()
    assert body == {
        "error": "bridge_error",
        "detail": "database write failed",
        "site": "delegate_db_write",
    }
    db_write_errs = [r for r in caplog.records if getattr(r, "site", "") == "delegate_db_write"]
    assert len(db_write_errs) == 1
    assert db_write_errs[0].error_class == "RuntimeError"


def test_site2_delegate_db_write_failure_kill_switch_off():
    """Kill-switch OFF: DB failure → legacy HTTPException(500, 'Failed to record task — try again')."""
    mock_backend = MagicMock()
    mock_backend.create_route_execution.side_effect = RuntimeError("db locked")
    mock_backend._db.execute.return_value = []

    with patch.dict(os.environ, {
        "MUSU_UNIFORM_DB_ERROR_HANDLING_ENABLED": "0",
        "MUSU_PLAN": "pro",
    }), \
         patch("handlers._get_backend", return_value=mock_backend), \
         patch("server.get_channel_map", return_value={"engineer": {"agent_id": "a1"}}), \
         patch("server.get_company", return_value=None), \
         patch("server.get_agent_by_id", return_value=None), \
         patch("server._get_channel_semaphore") as mock_sem:
        mock_sem.return_value.at_capacity.return_value = False
        r = client.post(
            "/api/tasks/delegate",
            json={"channel": "engineer", "sender_id": "u1", "text": "delegate test ks-off"},
        )
    assert r.status_code == 500
    # Legacy detail string preserved (does NOT match the bridge_error envelope)
    body = r.json()
    assert body.get("detail") == "Failed to record task — try again"
    assert body.get("error") != "bridge_error", "kill-switch OFF must NOT emit bridge_error envelope"


def test_site2_delegate_db_write_logger_schema(caplog):
    """delegate logger.error matches H-1 schema (error_class + error_msg + site)."""
    mock_backend = MagicMock()
    mock_backend.create_route_execution.side_effect = RuntimeError("X" * 500)
    mock_backend._db.execute.return_value = []

    with patch.dict(os.environ, {
        "MUSU_UNIFORM_DB_ERROR_HANDLING_ENABLED": "1",
        "MUSU_PLAN": "pro",
    }), \
         patch("handlers._get_backend", return_value=mock_backend), \
         patch("server.get_channel_map", return_value={"engineer": {"agent_id": "a1"}}), \
         patch("server.get_company", return_value=None), \
         patch("server.get_agent_by_id", return_value=None), \
         patch("server._get_channel_semaphore") as mock_sem:
        mock_sem.return_value.at_capacity.return_value = False
        with caplog.at_level(logging.ERROR, logger="server"):
            client.post(
                "/api/tasks/delegate",
                json={"channel": "engineer", "sender_id": "u1", "text": "delegate test logger"},
            )
    rec = [r for r in caplog.records if getattr(r, "site", "") == "delegate_db_write"][0]
    assert rec.message == "db write failed"
    assert rec.error_class == "RuntimeError"
    assert rec.site == "delegate_db_write"
    assert len(rec.error_msg) <= 200, "error_msg must be capped at 200 chars (H-1 invariant)"


# ── Site 3: server.py api_create_company (create_company_db_write) ───────────

def test_site3_create_company_db_write_success():
    """create_company happy path: returns company dict, no db_write logger.error."""
    fake_company = {"id": "c1", "name": "Test", "status": "active"}
    with patch("company_templates.get_template", return_value=None), \
         patch("server.create_company", return_value=fake_company):
        r = client.post(
            "/api/companies",
            json={"name": "Test", "template_key": "custom", "workspace_id": "ws-1"},
        )
    assert r.status_code == 200
    assert r.json()["id"] == "c1"


def test_site3_create_company_db_write_failure_kill_switch_on(caplog):
    """Kill-switch ON: DB failure → 500 + bridge_error envelope."""
    with patch.dict(os.environ, {"MUSU_UNIFORM_DB_ERROR_HANDLING_ENABLED": "1"}), \
         patch("company_templates.get_template", return_value=None), \
         patch("server.create_company", side_effect=RuntimeError("UNIQUE constraint failed")):
        with caplog.at_level(logging.ERROR, logger="server"):
            r = client.post(
                "/api/companies",
                json={"name": "Test", "template_key": "custom", "workspace_id": "ws-1"},
            )
    assert r.status_code == 500
    assert r.json() == {
        "error": "bridge_error",
        "detail": "database write failed",
        "site": "create_company_db_write",
    }
    db_errs = [r for r in caplog.records if getattr(r, "site", "") == "create_company_db_write"]
    assert len(db_errs) == 1
    assert db_errs[0].error_class == "RuntimeError"


def test_site3_create_company_db_write_failure_kill_switch_off():
    """Kill-switch OFF: DB failure → exception bubbles to FastAPI default 500 handler."""
    with patch.dict(os.environ, {"MUSU_UNIFORM_DB_ERROR_HANDLING_ENABLED": "0"}), \
         patch("company_templates.get_template", return_value=None), \
         patch("server.create_company", side_effect=RuntimeError("UNIQUE constraint failed")):
        # TestClient with default config re-raises server exceptions; verify with raise_server_exceptions=False.
        legacy_client = TestClient(
            app, headers={"Authorization": "Bearer test-token"}, raise_server_exceptions=False,
        )
        r = legacy_client.post(
            "/api/companies",
            json={"name": "Test", "template_key": "custom", "workspace_id": "ws-1"},
        )
    assert r.status_code == 500
    # Legacy bubble: FastAPI's default response does NOT include bridge_error
    body_text = r.text
    assert "bridge_error" not in body_text, "kill-switch OFF must NOT emit bridge_error envelope"


def test_site3_create_company_db_write_logger_schema(caplog):
    """create_company logger.error matches H-1 schema."""
    with patch.dict(os.environ, {"MUSU_UNIFORM_DB_ERROR_HANDLING_ENABLED": "1"}), \
         patch("company_templates.get_template", return_value=None), \
         patch("server.create_company", side_effect=RuntimeError("boom")):
        with caplog.at_level(logging.ERROR, logger="server"):
            client.post(
                "/api/companies",
                json={"name": "Test", "template_key": "custom", "workspace_id": "ws-1"},
            )
    rec = [r for r in caplog.records if getattr(r, "site", "") == "create_company_db_write"][0]
    assert rec.message == "db write failed"
    assert rec.error_class == "RuntimeError"
    assert rec.site == "create_company_db_write"


# ── Site 4: dispatch_routes.py post_wake (dispatch_wake_db_write) ────────────

def test_site4_dispatch_wake_db_write_success():
    """post_wake happy path: returns 200 + run_id queued."""

    async def _noop_execute(*_a, **_kw):
        return None

    with patch("dispatch_routes.enqueue_wake", return_value="run-xyz"), \
         patch("dispatch_routes.execute_wake", side_effect=_noop_execute), \
         patch("dispatch_routes.make_router", return_value=MagicMock()), \
         patch("dispatch_routes.get_config") as mock_cfg, \
         patch("dispatch_routes.get_db", return_value=MagicMock()):
        mock_cfg.return_value.db_path = ":memory:"
        r = client.post(
            "/api/dispatch/wake",
            json={"agent_id": "a1", "wake_reason": "manual"},
        )
    assert r.status_code == 200
    assert r.json() == {"run_id": "run-xyz", "status": "queued"}


def test_site4_dispatch_wake_db_write_failure_kill_switch_on(caplog):
    """Kill-switch ON: DB failure → 500 + bridge_error envelope (NOT legacy 400)."""
    with patch.dict(os.environ, {"MUSU_UNIFORM_DB_ERROR_HANDLING_ENABLED": "1"}), \
         patch("dispatch_routes.enqueue_wake", side_effect=RuntimeError("FK violation simulated")), \
         patch("dispatch_routes.get_config") as mock_cfg, \
         patch("dispatch_routes.get_db", return_value=MagicMock()):
        mock_cfg.return_value.db_path = ":memory:"
        with caplog.at_level(logging.ERROR, logger="dispatch_routes"):
            r = client.post(
                "/api/dispatch/wake",
                json={"agent_id": "a1", "wake_reason": "manual"},
            )
    assert r.status_code == 500, f"expected 500 under uniform handling, got {r.status_code}"
    assert r.json() == {
        "error": "bridge_error",
        "detail": "database write failed",
        "site": "dispatch_wake_db_write",
    }
    db_errs = [r for r in caplog.records if getattr(r, "site", "") == "dispatch_wake_db_write"]
    assert len(db_errs) == 1
    assert db_errs[0].error_class == "RuntimeError"


def test_site4_dispatch_wake_db_write_failure_kill_switch_off():
    """Kill-switch OFF: DB failure → legacy HTTPException(400, 'enqueue failed: ...')."""
    with patch.dict(os.environ, {"MUSU_UNIFORM_DB_ERROR_HANDLING_ENABLED": "0"}), \
         patch("dispatch_routes.enqueue_wake", side_effect=RuntimeError("FK violation")), \
         patch("dispatch_routes.get_config") as mock_cfg, \
         patch("dispatch_routes.get_db", return_value=MagicMock()):
        mock_cfg.return_value.db_path = ":memory:"
        r = client.post(
            "/api/dispatch/wake",
            json={"agent_id": "a1", "wake_reason": "manual"},
        )
    assert r.status_code == 400, f"expected legacy 400, got {r.status_code}"
    body = r.json()
    assert "enqueue failed" in body.get("detail", "")
    assert body.get("error") != "bridge_error"


def test_site4_dispatch_wake_cycle_detected_unaffected_by_kill_switch():
    """CycleDetected stays 409 regardless of kill-switch (domain validation, not DB write error)."""
    from musu_core.dispatch import CycleDetected

    for ks in ("0", "1"):
        with patch.dict(os.environ, {"MUSU_UNIFORM_DB_ERROR_HANDLING_ENABLED": ks}), \
             patch("dispatch_routes.enqueue_wake", side_effect=CycleDetected("cycle")), \
             patch("dispatch_routes.get_config") as mock_cfg, \
             patch("dispatch_routes.get_db", return_value=MagicMock()):
            mock_cfg.return_value.db_path = ":memory:"
            r = client.post(
                "/api/dispatch/wake",
                json={"agent_id": "a1", "wake_reason": "manual"},
            )
        assert r.status_code == 409, f"CycleDetected must stay 409 under kill_switch={ks!r}"


# ── Cross-site logger schema source-level scan ────────────────────────────────

def test_h2_all_sites_use_h1_logger_schema_keys():
    """Every H-2 site emits logger.error with extra keys {error_class, error_msg, site} (H-1 byte-identical)."""
    handlers_src = (Path(__file__).parent.parent / "handlers.py").read_text(encoding="utf-8")
    server_src = (Path(__file__).parent.parent / "server.py").read_text(encoding="utf-8")
    dispatch_src = (Path(__file__).parent.parent / "dispatch_routes.py").read_text(encoding="utf-8")

    site_to_src = {
        "route_chat_db_write": handlers_src,
        "delegate_db_write": server_src,
        "create_company_db_write": server_src,
        "dispatch_wake_db_write": dispatch_src,
    }

    for site, src in site_to_src.items():
        idx = src.find(f'"site": "{site}"')
        assert idx > 0, f"site {site!r} not found in source"
        # Search backwards for the surrounding logger.error block.
        block_start = src.rfind("logger.error", 0, idx)
        assert block_start > 0, f"site {site!r} missing logger.error call"
        block = src[block_start:idx + 100]
        for key in ('"error_class"', '"error_msg"', '"site"'):
            assert key in block, f"site {site!r} missing extra key {key}"
        assert "str(exc)[:200]" in block, f"site {site!r} missing 200-char cap"
