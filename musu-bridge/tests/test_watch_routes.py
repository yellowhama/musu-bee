"""POST /api/watch/notify + GET /api/watch/subscribe (v21.B).

Pins:
- valid notify body dispatches to local WatchDispatcher
- unknown table -> 400
- invalid op -> 400
- SSE subscribe streams events written after subscription
"""
from __future__ import annotations

import asyncio
import json

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient


@pytest.fixture
def client():
    import watch_routes
    watch_routes.reset_watch_dispatcher_for_tests()
    app = FastAPI()
    app.include_router(watch_routes.watch_router)
    yield TestClient(app)
    watch_routes.reset_watch_dispatcher_for_tests()


def test_notify_valid_body_returns_ok(client):
    r = client.post(
        "/api/watch/notify",
        json={"table": "agents", "key": "a1", "op": "update"},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["status"] == "ok"
    assert body["table"] == "agents"
    assert body["key"] == "a1"


def test_notify_unknown_table_400(client):
    r = client.post(
        "/api/watch/notify",
        json={"table": "nonsense", "key": "x", "op": "update"},
    )
    assert r.status_code == 400
    assert "allowlist" in r.json()["detail"]


def test_notify_invalid_op_400(client):
    r = client.post(
        "/api/watch/notify",
        json={"table": "agents", "key": "a1", "op": "delete_all"},
    )
    # Pydantic validates the Literal type first → 422
    # Either is acceptable as a hard reject
    assert r.status_code in (400, 422)


@pytest.mark.slow
def test_subscribe_endpoint_opens_stream(client):
    """Connecting opens an SSE stream with the right content-type.

    Marked slow because TestClient + StreamingResponse holding an
    unbounded async generator under SyncClient can race on teardown
    (sync TestClient cannot wake the server's `async for event in
    sub` loop via is_disconnected). End-to-end delivery is also
    exercised by test_watch_subscribe_e2e via an httpx async client.
    """
    with client.stream(
        "GET", "/api/watch/subscribe", params={"table": "agents"},
    ) as resp:
        assert resp.status_code == 200
        assert resp.headers["content-type"].startswith("text/event-stream")


@pytest.mark.slow
def test_watch_subscribe_e2e(client):
    """End-to-end SSE delivery using an httpx async client thread.

    Marked slow so default CI skips it; manual run via -m slow.
    Uses an httpx.AsyncClient against a real ASGI transport so
    request.is_disconnected() can fire and the server loop can exit.
    """
    import httpx
    from concurrent.futures import ThreadPoolExecutor

    async def run() -> dict:
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=client.app), base_url="http://test",
        ) as ac:
            # Subscribe in a task
            async def reader() -> dict:
                async with ac.stream(
                    "GET", "/api/watch/subscribe", params={"table": "agents"},
                    timeout=5.0,
                ) as resp:
                    assert resp.status_code == 200
                    async for line in resp.aiter_lines():
                        if line.startswith("data:"):
                            return json.loads(line[len("data: "):])
                    raise RuntimeError("no data frame")

            reader_task = asyncio.create_task(reader())
            await asyncio.sleep(0.1)  # let subscribe register
            r = await ac.post(
                "/api/watch/notify",
                json={"table": "agents", "key": "a-e2e", "op": "create"},
            )
            assert r.status_code == 200
            payload = await asyncio.wait_for(reader_task, timeout=3.0)
            return payload

    payload = asyncio.run(run())
    assert payload["table"] == "agents"
    assert payload["key"] == "a-e2e"
    assert payload["op"] == "create"


def test_subscribe_unknown_table_400(client):
    r = client.get("/api/watch/subscribe", params={"table": "nonsense"})
    assert r.status_code == 400
