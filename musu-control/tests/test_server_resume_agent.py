import asyncio
import json

from musu_control import server


class _StubClient:
    def __init__(self) -> None:
        self.calls: list[tuple[str, dict]] = []

    async def post(self, path: str, body: dict | None = None) -> dict:
        payload = body or {}
        self.calls.append((path, payload))
        return {"ok": True, "path": path, "body": payload}


def _run_resume(agent_id: str, reason: str) -> tuple[str, _StubClient]:
    stub = _StubClient()
    original_client = server._client
    server._client = stub
    try:
        result = asyncio.run(server.resume_agent(agent_id=agent_id, reason=reason))
    finally:
        server._client = original_client
    return result, stub


def test_resume_agent_forwards_reason_body() -> None:
    result, stub = _run_resume("agent-123", "CONFIRM_RESUME_AGENT resume now")
    assert stub.calls == [
        ("/agents/agent-123/resume", {"reason": "CONFIRM_RESUME_AGENT resume now"})
    ]
    assert json.loads(result) == {
        "ok": True,
        "path": "/agents/agent-123/resume",
        "body": {"reason": "CONFIRM_RESUME_AGENT resume now"},
    }


def test_resume_agent_uses_empty_body_when_reason_missing() -> None:
    result, stub = _run_resume("agent-456", "")
    assert stub.calls == [("/agents/agent-456/resume", {})]
    assert json.loads(result) == {
        "ok": True,
        "path": "/agents/agent-456/resume",
        "body": {},
    }
