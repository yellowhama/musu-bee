"""home_node routing — local short-circuit + remote forward + failure modes.

These exercise musu_core.dispatch.forward + the home_node branch in
execute_wake. The mesh registry and http client are both mocked, so no
real network or nodes.toml needed.
"""

from __future__ import annotations

import asyncio
import json
import os
import tempfile
from contextlib import asynccontextmanager
from unittest.mock import MagicMock, patch

import pytest

from musu_core.db import Database, get_db
from musu_core.dispatch.forward import forward_wake_to_peer
from musu_core.dispatch.wake import execute_wake


def _fresh_db():
    fd, path = tempfile.mkstemp(suffix=".db", prefix="v19c_homenode_")
    os.close(fd)
    # Drop cached config + DB instance pool.
    from musu_core import config as _cfg
    _cfg._default = None  # type: ignore[attr-defined]
    from musu_core import db as _db_mod
    _db_mod._db_instances.clear()  # type: ignore[attr-defined]
    os.environ["MUSU_DB_PATH"] = path
    db = get_db(path)
    return db, path


def _seed_agent(db, agent_id="a1", home_node=None):
    db.execute(
        "INSERT INTO agents (id, name, role, home_node) VALUES (?, ?, 'ceo', ?)",
        (agent_id, "tester", home_node),
    )


def _seed_queued_run(db, run_id="r1", agent_id="a1"):
    db.execute(
        "INSERT INTO heartbeat_runs (id, agent_id, wake_reason, wake_payload, status) "
        "VALUES (?, ?, 'test', '{}', 'queued')",
        (run_id, agent_id),
    )


class _FakeAsyncResponse:
    def __init__(self, status_code: int, json_body: dict | None = None):
        self.status_code = status_code
        self._json = json_body or {}

    def json(self):
        return self._json


class _FakeAsyncStreamResponse:
    """Mimic httpx.AsyncClient.stream context-manager output."""

    def __init__(self, status_code: int, lines: list[str]):
        self.status_code = status_code
        self._lines = lines

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb):
        return False

    async def aiter_lines(self):
        for line in self._lines:
            yield line


class _FakeHttpxClient:
    """Just enough of httpx.AsyncClient surface for forward.py.

    Constructed by a factory; supports `async with`, `post`, `stream`.
    """

    def __init__(self, post_response=None, stream_lines=None, stream_status=200,
                 raise_on_post=None, raise_on_stream=None):
        self._post_response = post_response
        self._stream_lines = stream_lines or []
        self._stream_status = stream_status
        self._raise_on_post = raise_on_post
        self._raise_on_stream = raise_on_stream

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb):
        return False

    async def post(self, url, json=None, headers=None):
        if self._raise_on_post:
            raise self._raise_on_post
        return self._post_response

    def stream(self, method, url, headers=None):
        if self._raise_on_stream:
            raise self._raise_on_stream
        return _FakeAsyncStreamResponse(self._stream_status, self._stream_lines)


def _registry_mock(*, self_name="local-a", bridge_urls=None):
    """Stub MeshRegistry: self_name + bridge_url_for_node + is_local."""
    bridge_urls = bridge_urls or {}
    m = MagicMock()
    m.self_name = self_name
    m.is_local = lambda name: name == self_name
    m.bridge_url_for_node = lambda name: bridge_urls.get(name)
    return m


@pytest.mark.asyncio
async def test_forward_unknown_home_node_marks_failed():
    """home_node not in nodes.toml → 'unknown home_node' failure."""
    db, path = _fresh_db()
    try:
        _seed_agent(db, home_node="ghost-machine")
        _seed_queued_run(db)
        with patch(
            "musu_core.mesh.get_registry",
            return_value=_registry_mock(bridge_urls={}),
        ):
            await forward_wake_to_peer(
                db,
                run_id="r1",
                agent_id="a1",
                home_node="ghost-machine",
                wake_payload={},
            )
        rows = db.execute(
            "SELECT status, error FROM heartbeat_runs WHERE id='r1'"
        )
        assert rows[0]["status"] == "failed"
        assert "unknown home_node" in rows[0]["error"]
    finally:
        db.close()
        os.unlink(path)


@pytest.mark.asyncio
async def test_forward_peer_unreachable_marks_failed():
    """Network error during POST → 'peer unreachable' failure (FR-010)."""
    db, path = _fresh_db()
    try:
        _seed_agent(db, home_node="peer-b")
        _seed_queued_run(db)

        # Pre-flip the run to running so _fail_local's WHERE status='running'
        # matches (matches execute_wake's behavior).
        db.execute("UPDATE heartbeat_runs SET status='running' WHERE id='r1'")

        class _ConnError(Exception):
            pass

        def factory():
            return _FakeHttpxClient(raise_on_post=_ConnError("refused"))

        with patch(
            "musu_core.mesh.get_registry",
            return_value=_registry_mock(
                bridge_urls={"peer-b": "http://peer-b:8070"}
            ),
        ):
            await forward_wake_to_peer(
                db,
                run_id="r1",
                agent_id="a1",
                home_node="peer-b",
                wake_payload={},
                http_client_factory=factory,
            )
        rows = db.execute(
            "SELECT status, error FROM heartbeat_runs WHERE id='r1'"
        )
        assert rows[0]["status"] == "failed"
        assert "peer unreachable" in rows[0]["error"]
        # Failure event emitted.
        events = db.execute(
            "SELECT event_type FROM heartbeat_run_events WHERE run_id='r1'"
        )
        assert any(e["event_type"] == "failed" for e in events)
    finally:
        db.close()
        os.unlink(path)


@pytest.mark.asyncio
async def test_forward_relays_events_and_applies_terminal():
    """Happy path: POST succeeds, SSE relays events, terminal marks completed."""
    db, path = _fresh_db()
    try:
        _seed_agent(db, home_node="peer-b")
        _seed_queued_run(db)
        db.execute("UPDATE heartbeat_runs SET status='running' WHERE id='r1'")

        post_resp = _FakeAsyncResponse(202, {"run_id": "remote-xyz"})
        sse_lines = [
            f"data: {json.dumps({'id': 'e1', 'event_type': 'wake_started', 'payload': {'agent_id': 'a1'}, 'created_at': '2026-05-14T00:00:00Z'})}",
            "",
            f"data: {json.dumps({'id': 'e2', 'event_type': 'message_delta', 'payload': {'text': 'hello'}, 'created_at': '2026-05-14T00:00:01Z'})}",
            f"data: {json.dumps({'type': 'done', 'status': 'completed', 'summary': 'all done', 'error': ''})}",
        ]

        def factory():
            return _FakeHttpxClient(
                post_response=post_resp, stream_lines=sse_lines
            )

        with patch(
            "musu_core.mesh.get_registry",
            return_value=_registry_mock(
                bridge_urls={"peer-b": "http://peer-b:8070"}
            ),
        ):
            await forward_wake_to_peer(
                db,
                run_id="r1",
                agent_id="a1",
                home_node="peer-b",
                wake_payload={"prompt": "hi"},
                http_client_factory=factory,
            )

        # Local run should be completed with the relayed summary.
        rows = db.execute(
            "SELECT status, summary FROM heartbeat_runs WHERE id='r1'"
        )
        assert rows[0]["status"] == "completed"
        assert rows[0]["summary"] == "all done"

        # Two forwarded_event rows + one terminal 'completed' row.
        events = db.execute(
            "SELECT event_type, payload FROM heartbeat_run_events "
            "WHERE run_id='r1' ORDER BY created_at"
        )
        types = [e["event_type"] for e in events]
        assert types.count("forwarded_event") == 2
        assert "completed" in types
        # forwarded_event payloads include remote_type + remote_payload.
        for e in events:
            if e["event_type"] == "forwarded_event":
                payload = json.loads(e["payload"])
                assert payload["forwarded_from"] == "peer-b"
                assert "remote_type" in payload
                assert "remote_payload" in payload
    finally:
        db.close()
        os.unlink(path)


@pytest.mark.asyncio
async def test_execute_wake_local_short_circuit_when_home_node_is_self():
    """home_node = self_name → no forwarding, falls through to local path.

    We can't actually run the adapter here (no agents.json registry set up),
    so we just verify the dispatcher made it past the home_node branch and
    attempted local dispatch (which then fails for unrelated reasons —
    failed status is OK; what we're proving is "no forwarded_event events").
    """
    db, path = _fresh_db()
    try:
        _seed_agent(db, home_node="local-a")
        _seed_queued_run(db)

        # Mock router so we can prove execute_wake reached it.
        called = {"hit": False}

        class _FakeRouter:
            async def route_streaming(self, req, on_delta):
                called["hit"] = True
                from musu_core.adapters.base import AdapterResult
                # Return a degenerate result so execute_wake completes.
                return _FakeRouteResult(
                    run_id=req.agent_id,
                    success=True,
                    summary="local ok",
                    adapter_result=AdapterResult(
                        run_id=req.agent_id, success=True, summary="local ok"
                    ),
                )

        with patch(
            "musu_core.mesh.get_registry",
            return_value=_registry_mock(self_name="local-a"),
        ):
            await execute_wake(db, _FakeRouter(), "r1")

        assert called["hit"], "Router was not called — execute_wake forwarded instead"
        events = db.execute(
            "SELECT event_type FROM heartbeat_run_events WHERE run_id='r1'"
        )
        types = [e["event_type"] for e in events]
        # NO forwarded_event in the local path.
        assert "forwarded_event" not in types
    finally:
        db.close()
        os.unlink(path)


@pytest.mark.asyncio
async def test_execute_wake_no_home_node_uses_local_path():
    """home_node IS NULL → existing single-machine behavior."""
    db, path = _fresh_db()
    try:
        _seed_agent(db, home_node=None)
        _seed_queued_run(db)

        called = {"hit": False}

        class _FakeRouter:
            async def route_streaming(self, req, on_delta):
                called["hit"] = True
                from musu_core.adapters.base import AdapterResult
                return _FakeRouteResult(
                    run_id=req.agent_id,
                    success=True,
                    summary="local ok",
                    adapter_result=AdapterResult(
                        run_id=req.agent_id, success=True, summary="local ok"
                    ),
                )

        with patch(
            "musu_core.mesh.get_registry",
            return_value=_registry_mock(),
        ):
            await execute_wake(db, _FakeRouter(), "r1")

        assert called["hit"]
        events = db.execute(
            "SELECT event_type FROM heartbeat_run_events WHERE run_id='r1'"
        )
        types = [e["event_type"] for e in events]
        assert "forwarded_event" not in types
    finally:
        db.close()
        os.unlink(path)


# A tiny duck-typed router result so we don't have to import RouteResult.
class _FakeRouteResult:
    def __init__(self, run_id, success, summary, adapter_result, error=None):
        self.run_id = run_id
        self.success = success
        self.summary = summary
        self.error = error
        self.adapter_result = adapter_result
