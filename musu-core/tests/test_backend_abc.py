"""Tests for BackendABC, LocalBackend impl, and route_message()."""

from __future__ import annotations

import asyncio
import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from musu_core.backends.base import BackendABC
from musu_core.backends.local import LocalBackend
from musu_core.backends.paperclip import PaperclipBackend
from musu_core.config import Config, detect_backend
from musu_core.router import route_message


# ---------------------------------------------------------------------------
# BackendABC
# ---------------------------------------------------------------------------


def test_backend_abc_is_abstract():
    with pytest.raises(TypeError):
        BackendABC()  # type: ignore[abstract]


def test_local_backend_is_backend_abc(tmp_path):
    backend = LocalBackend(str(tmp_path / "test.db"))
    assert isinstance(backend, BackendABC)


def test_paperclip_backend_is_backend_abc():
    pb = PaperclipBackend(api_url="http://x", api_key="k", company_id="c")
    assert isinstance(pb, BackendABC)


def test_paperclip_backend_stubs_raise(tmp_path):
    pb = PaperclipBackend(api_url="http://x", api_key="k", company_id="c")
    with pytest.raises(NotImplementedError):
        pb.get_agent("id")
    with pytest.raises(NotImplementedError):
        pb.list_agents()
    with pytest.raises(NotImplementedError):
        pb.create_task("title")
    with pytest.raises(NotImplementedError):
        pb.get_task("id")
    with pytest.raises(NotImplementedError):
        pb.list_tasks()
    with pytest.raises(NotImplementedError):
        pb.add_comment("id", "body")
    with pytest.raises(NotImplementedError):
        pb.get_comments("id")


# ---------------------------------------------------------------------------
# LocalBackend BackendABC methods
# ---------------------------------------------------------------------------


@pytest.fixture
def local(tmp_path):
    return LocalBackend(str(tmp_path / "test.db"))


def test_local_get_agent_unknown(local):
    assert local.get_agent("nonexistent") is None


def test_local_get_agent_by_name_unknown(local):
    assert local.get_agent_by_name("nobody") is None


def test_local_agent_roundtrip(local):
    agent = local.agents.create(name="ceo", role="chief", adapter_type="process")
    d = local.get_agent(agent.id)
    assert d is not None
    assert d["name"] == "ceo"
    assert d["role"] == "chief"

    d2 = local.get_agent_by_name("ceo")
    assert d2 is not None
    assert d2["id"] == agent.id


def test_local_list_agents(local):
    local.agents.create(name="a1", adapter_type="process")
    local.agents.create(name="a2", adapter_type="process")
    agents = local.list_agents()
    assert len(agents) == 2


def test_local_task_roundtrip(local):
    agent = local.agents.create(name="bot", adapter_type="process")
    task = local.create_task(title="Do it", assignee_agent_id=agent.id)
    assert task["title"] == "Do it"
    assert task["assignee_agent_id"] == agent.id

    fetched = local.get_task(task["id"])
    assert fetched is not None
    assert fetched["id"] == task["id"]


def test_local_list_tasks_filtered(local):
    agent = local.agents.create(name="bot", adapter_type="process")
    local.create_task(title="T1", assignee_agent_id=agent.id)
    local.create_task(title="T2")
    by_agent = local.list_tasks(assignee_agent_id=agent.id)
    assert len(by_agent) == 1
    assert by_agent[0]["title"] == "T1"


def test_local_comment_roundtrip(local):
    agent = local.agents.create(name="bot", adapter_type="process")
    task = local.create_task(title="Task")
    c = local.add_comment(task["id"], "hello world", author_kind="user")
    assert c["body"] == "hello world"
    assert c["author_kind"] == "user"

    comments = local.get_comments(task["id"])
    assert len(comments) == 1
    assert comments[0]["id"] == c["id"]


# ---------------------------------------------------------------------------
# detect_backend
# ---------------------------------------------------------------------------


def test_detect_backend_local(tmp_path):
    # Explicitly clear paperclip credentials so detect_backend picks LocalBackend
    cfg = Config(
        db_path=str(tmp_path / "x.db"),
        paperclip_api_url=None,
        paperclip_api_key=None,
        paperclip_company_id=None,
    )
    backend = detect_backend(cfg)
    assert isinstance(backend, LocalBackend)


def test_detect_backend_paperclip():
    cfg = Config(
        paperclip_api_url="http://localhost:3100",
        paperclip_api_key="key",
        paperclip_company_id="cid",
    )
    backend = detect_backend(cfg)
    assert isinstance(backend, PaperclipBackend)


# ---------------------------------------------------------------------------
# route_message — acceptance criterion
# ---------------------------------------------------------------------------


def _good_stream_bytes(session_id: str = "s1", result_text: str = "Route OK") -> bytes:
    events = [
        json.dumps({"type": "system", "subtype": "init", "session_id": session_id, "model": "m"}),
        json.dumps({"type": "result", "session_id": session_id, "result": result_text,
                    "usage": {"input_tokens": 1, "output_tokens": 1, "cache_read_input_tokens": 0}}),
    ]
    return "\n".join(events).encode()


def test_route_message_full_flow(tmp_path):
    """Acceptance: route_message('ceo', 'msg-001', 'hello', LocalBackend()) -> str"""
    backend = LocalBackend(str(tmp_path / "test.db"))
    backend.agents.create(
        name="ceo",
        role="chief",
        adapter_type="claude_local",
        adapter_config={"model": "claude-test"},
    )

    proc = MagicMock()
    proc.returncode = 0
    proc.communicate = AsyncMock(return_value=(_good_stream_bytes(result_text="Hello back!"), b""))

    with patch("asyncio.create_subprocess_exec", return_value=proc):
        summary = asyncio.run(route_message("ceo", "msg-001", "hello", backend))

    assert isinstance(summary, str)
    assert summary == "Hello back!"

    # Task and comments must have been persisted
    tasks = backend.list_tasks(assignee_agent_id=backend.agents.get_by_name("ceo").id)
    assert tasks, "task should have been created"
    task_id = tasks[0]["id"]

    comments = backend.get_comments(task_id)
    assert len(comments) == 2  # user message + agent response
    assert comments[0]["author_kind"] == "user"
    assert comments[1]["author_kind"] == "agent"


def test_route_message_unknown_source(tmp_path):
    backend = LocalBackend(str(tmp_path / "test.db"))
    with pytest.raises(ValueError, match="No agent found"):
        asyncio.run(route_message("unknown", "ref", "hi", backend))


def test_route_message_adapter_failure(tmp_path):
    backend = LocalBackend(str(tmp_path / "test.db"))
    backend.agents.create(name="bot", adapter_type="claude_local")

    proc = MagicMock()
    proc.returncode = 1
    proc.communicate = AsyncMock(return_value=(b"", b"boom"))

    with patch("asyncio.create_subprocess_exec", return_value=proc):
        with pytest.raises(RuntimeError, match="failure"):
            asyncio.run(route_message("bot", "ref", "hello", backend))
