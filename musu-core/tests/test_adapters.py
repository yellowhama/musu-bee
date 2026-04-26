"""Unit tests for adapters — base, claude_local, process, registry, remote, hermes."""

from __future__ import annotations

import asyncio
import json
import os
import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

import httpx

from musu_core.adapters.base import AdapterContext, AdapterResult, BaseAdapter, UsageSummary
from musu_core.adapters.claude_local import ClaudeLocalAdapter, _parse_stream_json
from musu_core.adapters.hermes import HermesAdapter, _parse_hermes_output
from musu_core.adapters.process import ProcessAdapter
from musu_core.adapters.registry import get_adapter, list_adapter_types, register_adapter
from musu_core.adapters.remote_cli import RemoteCLIAdapter
from musu_core.adapters.remote_process import RemoteProcessAdapter


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def make_ctx(**kwargs) -> AdapterContext:
    defaults = dict(
        run_id=str(uuid.uuid4()),
        prompt="hello",
        agent_id="agent-1",
        agent_name="test-agent",
        agent_role="assistant",
        adapter_type="claude_local",
    )
    defaults.update(kwargs)
    return AdapterContext(**defaults)


def stream_json_lines(*events: dict) -> str:
    return "\n".join(json.dumps(e) for e in events)


# ---------------------------------------------------------------------------
# BaseAdapter
# ---------------------------------------------------------------------------


def test_base_adapter_is_abstract():
    with pytest.raises(TypeError):
        BaseAdapter()  # type: ignore[abstract]


def test_adapter_result_defaults():
    r = AdapterResult(run_id="r1", success=True, summary="ok")
    assert r.session_id is None
    assert r.usage is None
    assert r.cost_usd is None
    assert r.error is None
    assert r.raw == {}


# ---------------------------------------------------------------------------
# _parse_stream_json
# ---------------------------------------------------------------------------


def test_parse_stream_json_full_result():
    lines = stream_json_lines(
        {"type": "system", "subtype": "init", "session_id": "sess-abc", "model": "claude-3"},
        {"type": "assistant", "session_id": "sess-abc", "message": {"content": [{"type": "text", "text": "hello"}]}},
        {
            "type": "result",
            "session_id": "sess-abc",
            "result": "Final answer",
            "usage": {"input_tokens": 10, "cache_read_input_tokens": 2, "output_tokens": 5},
            "total_cost_usd": 0.001,
        },
    )
    parsed = _parse_stream_json(lines)
    assert parsed["session_id"] == "sess-abc"
    assert parsed["summary"] == "Final answer"
    assert parsed["usage"].input_tokens == 10
    assert parsed["usage"].cached_input_tokens == 2
    assert parsed["usage"].output_tokens == 5
    assert parsed["cost_usd"] == pytest.approx(0.001)


def test_parse_stream_json_cache_creation_tokens():
    """cache_creation_input_tokens must be captured in UsageSummary.

    This is the most expensive token category ($3.75/MTok vs $3.00 input,
    $0.30 cache_read). Omitting it makes cost reconciliation impossible.
    Previously this field was silently dropped; verify it is now preserved.
    """
    lines = stream_json_lines(
        {"type": "system", "subtype": "init", "session_id": "s", "model": "claude-sonnet-4-6"},
        {
            "type": "result",
            "session_id": "s",
            "result": "done",
            "usage": {
                "input_tokens": 39,
                "cache_read_input_tokens": 1770130,
                "cache_creation_input_tokens": 148386,
                "output_tokens": 7953,
            },
            "total_cost_usd": 1.2069,
        },
    )
    parsed = _parse_stream_json(lines)
    usage = parsed["usage"]
    assert usage is not None
    assert usage.input_tokens == 39
    assert usage.cached_input_tokens == 1770130
    assert usage.cache_creation_input_tokens == 148386
    assert usage.output_tokens == 7953


def test_parse_stream_json_no_result_falls_back_to_assistant_text():
    lines = stream_json_lines(
        {"type": "system", "subtype": "init", "session_id": "sess-x", "model": "m"},
        {"type": "assistant", "session_id": "sess-x", "message": {"content": [{"type": "text", "text": "hi there"}]}},
    )
    parsed = _parse_stream_json(lines)
    assert parsed["session_id"] == "sess-x"
    assert parsed["summary"] == "hi there"
    assert parsed["usage"] is None
    assert parsed["result_json"] is None


def test_parse_stream_json_empty_input():
    parsed = _parse_stream_json("")
    assert parsed["summary"] == ""
    assert parsed["session_id"] is None


def test_parse_stream_json_garbage_lines():
    raw = "not-json\n{broken\n" + json.dumps({"type": "result", "session_id": "s", "result": "ok", "usage": {}})
    parsed = _parse_stream_json(raw)
    assert parsed["summary"] == "ok"
    assert parsed["session_id"] == "s"


# ---------------------------------------------------------------------------
# ClaudeLocalAdapter — ENV cleanup
# ---------------------------------------------------------------------------


def test_claude_local_strips_nesting_vars():
    """ENV must not contain CLAUDECODE / CLAUDE_CODE_* vars when subprocess runs."""
    adapter = ClaudeLocalAdapter()
    ctx = make_ctx()

    captured_env: dict[str, str] | None = None

    async def fake_exec(*args, stdin, stdout, stderr, cwd, env):
        nonlocal captured_env
        captured_env = env.copy()
        return _mock_claude_proc(
            [{"type": "result", "session_id": "s1", "result": "done", "usage": {}}],
            returncode=0,
        )

    with patch.dict(
        os.environ,
        {
            "CLAUDECODE": "1",
            "CLAUDE_CODE_ENTRYPOINT": "cli",
            "CLAUDE_CODE_SESSION": "parent-sess",
            "CLAUDE_CODE_PARENT_SESSION": "root",
        },
    ):
        with patch("asyncio.create_subprocess_exec", side_effect=fake_exec):
            asyncio.run(adapter.execute(ctx))

    assert captured_env is not None
    for var in ("CLAUDECODE", "CLAUDE_CODE_ENTRYPOINT", "CLAUDE_CODE_SESSION", "CLAUDE_CODE_PARENT_SESSION"):
        assert var not in captured_env, f"{var} should be stripped from env"


# ---------------------------------------------------------------------------
# ClaudeLocalAdapter — event loop non-blocking (streaming reads)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_claude_local_streaming_does_not_block_event_loop():
    """run_attempt must read stdout/stderr via streaming (not proc.communicate)
    so other coroutines (e.g. _activity_heartbeat) can run concurrently.

    Strategy: create a fake proc whose stdout delivers data in chunks with
    asyncio.sleep(0.05) between them. A concurrent counter task increments
    every 0.02s. If the event loop is blocked, the counter stays at 0.
    If streaming is used, the counter increments at least once during the read.
    """
    import json as _json

    result_event = {"type": "result", "session_id": "s1", "result": "ok", "usage": {}}
    stdout_data = (_json.dumps(result_event) + "\n").encode()

    # Chunk the data to force multiple reads
    chunk1 = stdout_data[:10]
    chunk2 = stdout_data[10:]

    stdout_chunks_sent = 0
    stderr_chunks_sent = 0

    class FakeStreamReader:
        def __init__(self, chunks: list[bytes]):
            self._chunks = list(chunks)

        async def read(self, n: int) -> bytes:
            nonlocal stdout_chunks_sent
            if self._chunks:
                await asyncio.sleep(0.05)  # yield to event loop between chunks
                stdout_chunks_sent += 1
                return self._chunks.pop(0)
            return b""

    class FakeStderrReader:
        async def read(self, n: int) -> bytes:
            return b""

    class FakeStdin:
        def write(self, data: bytes) -> None:
            pass

        async def drain(self) -> None:
            pass

        def close(self) -> None:
            pass

    proc = MagicMock()
    proc.returncode = 0
    proc.stdin = FakeStdin()
    proc.stdout = FakeStreamReader([chunk1, chunk2])
    proc.stderr = FakeStderrReader()
    proc.wait = AsyncMock(return_value=0)
    # Ensure communicate is NOT used (it would bypass streaming)
    proc.communicate = AsyncMock(side_effect=AssertionError("proc.communicate must not be called in streaming mode"))

    concurrent_ticks = 0

    async def tick_counter():
        nonlocal concurrent_ticks
        for _ in range(20):
            await asyncio.sleep(0.02)
            concurrent_ticks += 1

    adapter = ClaudeLocalAdapter()
    ctx = make_ctx()

    async def run():
        with patch("asyncio.create_subprocess_exec", return_value=proc):
            result = await adapter.execute(ctx)
        return result

    result, _ = await asyncio.gather(run(), tick_counter())

    assert result.success, f"Expected success, got error: {result.error}"
    assert concurrent_ticks >= 2, (
        f"Event loop was blocked during subprocess read — concurrent_ticks={concurrent_ticks}. "
        "Use streaming reads (proc.stdout.read) instead of proc.communicate()."
    )


# ---------------------------------------------------------------------------
# ClaudeLocalAdapter — successful execution
# ---------------------------------------------------------------------------


def _mock_claude_proc(stdout_events: list[dict], returncode: int = 0):
    """Return a fake proc compatible with the streaming read interface."""
    stdout_bytes = "\n".join(json.dumps(e) for e in stdout_events).encode()

    class _FakeStream:
        def __init__(self, data: bytes):
            self._data = data
            self._sent = False

        async def read(self, n: int) -> bytes:
            if not self._sent:
                self._sent = True
                return self._data
            return b""

    class _FakeEmptyStream:
        async def read(self, n: int) -> bytes:
            return b""

    class _FakeStdin:
        def write(self, data: bytes) -> None:
            pass

        async def drain(self) -> None:
            pass

        def close(self) -> None:
            pass

    proc = MagicMock()
    proc.returncode = returncode
    proc.stdin = _FakeStdin()
    proc.stdout = _FakeStream(stdout_bytes)
    proc.stderr = _FakeEmptyStream()
    proc.wait = AsyncMock(return_value=returncode)
    return proc


@pytest.fixture
def good_events():
    return [
        {"type": "system", "subtype": "init", "session_id": "sess-new", "model": "claude-sonnet-4-5"},
        {"type": "result", "session_id": "sess-new", "result": "All done", "usage": {"input_tokens": 5, "cache_read_input_tokens": 0, "output_tokens": 3}},
    ]


def test_claude_local_execute_success(good_events):
    adapter = ClaudeLocalAdapter()
    ctx = make_ctx()

    with patch("asyncio.create_subprocess_exec", return_value=_mock_claude_proc(good_events)):
        result = asyncio.run(adapter.execute(ctx))

    assert result.success
    assert result.summary == "All done"
    assert result.session_id == "sess-new"
    assert result.usage is not None
    assert result.usage.input_tokens == 5
    assert result.error is None


def test_claude_local_execute_session_id_forwarded(good_events):
    adapter = ClaudeLocalAdapter()
    ctx = make_ctx(session_id="existing-sess")

    calls: list[tuple] = []

    async def fake_exec(cmd, *args, stdin, stdout, stderr, cwd, env):
        calls.append(args)
        return _mock_claude_proc(good_events)

    with patch("asyncio.create_subprocess_exec", side_effect=fake_exec):
        asyncio.run(adapter.execute(ctx))

    assert calls
    assert "--resume" in calls[0]
    idx = list(calls[0]).index("--resume")
    assert calls[0][idx + 1] == "existing-sess"


# ---------------------------------------------------------------------------
# ClaudeLocalAdapter — session-not-found retry
# ---------------------------------------------------------------------------


def test_claude_local_retries_without_resume_on_unknown_session():
    adapter = ClaudeLocalAdapter()
    ctx = make_ctx(session_id="stale-sess")

    fail_events = [
        {"type": "result", "session_id": None, "subtype": "unknown_session", "result": "session not found", "usage": {}},
    ]
    retry_events = [
        {"type": "system", "subtype": "init", "session_id": "new-sess", "model": "m"},
        {"type": "result", "session_id": "new-sess", "result": "Retry OK", "usage": {}},
    ]

    call_count = 0

    async def fake_exec(cmd, *args, stdin, stdout, stderr, cwd, env):
        nonlocal call_count
        call_count += 1
        if call_count == 1:
            # First call: non-zero exit + unknown session
            return _mock_claude_proc(fail_events, returncode=1)
        return _mock_claude_proc(retry_events, returncode=0)

    with patch("asyncio.create_subprocess_exec", side_effect=fake_exec):
        result = asyncio.run(adapter.execute(ctx))

    assert call_count == 2
    assert result.success
    assert result.summary == "Retry OK"
    assert result.session_id is None  # reset because session was dropped


# ---------------------------------------------------------------------------
# ClaudeLocalAdapter — failure paths
# ---------------------------------------------------------------------------


def test_claude_local_timeout():
    adapter = ClaudeLocalAdapter()
    ctx = make_ctx(config={"timeout_sec": 1})

    async def fake_exec(*args, stdin, stdout, stderr, cwd, env):
        class _SlowStream:
            async def read(self, n: int) -> bytes:
                await asyncio.sleep(9999)  # hang forever → triggers TimeoutError
                return b""

        class _FakeEmptyStream:
            async def read(self, n: int) -> bytes:
                return b""

        class _FakeStdin:
            def write(self, data: bytes) -> None:
                pass

            async def drain(self) -> None:
                pass

            def close(self) -> None:
                pass

        proc = MagicMock()
        proc.returncode = -1
        proc.stdin = _FakeStdin()
        proc.stdout = _SlowStream()
        proc.stderr = _FakeEmptyStream()
        async def _slow_wait():
            await asyncio.sleep(9999)

        proc.wait = _slow_wait
        return proc

    with patch("asyncio.create_subprocess_exec", side_effect=fake_exec):
        result = asyncio.run(adapter.execute(ctx))

    assert not result.success
    assert "Timed out" in (result.error or "")


def test_claude_local_empty_response():
    adapter = ClaudeLocalAdapter()
    ctx = make_ctx()

    with patch("asyncio.create_subprocess_exec", return_value=_mock_claude_proc([], returncode=0)):
        result = asyncio.run(adapter.execute(ctx))

    assert not result.success
    assert result.error == "Empty response from Claude"


# ---------------------------------------------------------------------------
# ProcessAdapter
# ---------------------------------------------------------------------------


def test_process_adapter_success(tmp_path):
    adapter = ProcessAdapter()
    ctx = make_ctx(
        adapter_type="process",
        config={"command": "cat", "args": []},
        prompt="echo back this",
    )
    result = asyncio.run(adapter.execute(ctx))
    assert result.success
    assert "echo back this" in result.summary


def test_process_adapter_missing_command():
    adapter = ProcessAdapter()
    ctx = make_ctx(adapter_type="process", config={})
    result = asyncio.run(adapter.execute(ctx))
    assert not result.success
    assert "command" in result.error


def test_process_adapter_nonzero_exit():
    adapter = ProcessAdapter()
    ctx = make_ctx(
        adapter_type="process",
        config={"command": "false"},
    )
    result = asyncio.run(adapter.execute(ctx))
    assert not result.success


# ---------------------------------------------------------------------------
# Registry
# ---------------------------------------------------------------------------


def test_registry_returns_claude_local():
    adapter = get_adapter("claude_local")
    assert isinstance(adapter, ClaudeLocalAdapter)


def test_registry_returns_process():
    adapter = get_adapter("process")
    assert isinstance(adapter, ProcessAdapter)


def test_registry_returns_none_for_unknown():
    adapter = get_adapter("nonexistent_type")
    assert adapter is None


def test_registry_list_types():
    types = list_adapter_types()
    assert "claude_local" in types
    assert "process" in types


def test_registry_register_custom():
    class DummyAdapter(BaseAdapter):
        @property
        def adapter_type(self) -> str:
            return "dummy_test_xyz"

        async def execute(self, ctx: AdapterContext) -> AdapterResult:
            return AdapterResult(run_id=ctx.run_id, success=True, summary="dummy")

    register_adapter(DummyAdapter())
    assert get_adapter("dummy_test_xyz") is not None
    assert "dummy_test_xyz" in list_adapter_types()


def test_registry_includes_remote_adapters():
    assert get_adapter("remote_cli") is not None
    assert get_adapter("remote_process") is not None
    assert "remote_cli" in list_adapter_types()
    assert "remote_process" in list_adapter_types()


# ---------------------------------------------------------------------------
# RemoteCLIAdapter
# ---------------------------------------------------------------------------


def _make_remote_ctx(adapter_type: str = "remote_cli", **config_overrides) -> AdapterContext:
    config = {"worker_url": "http://worker:9700", "cli_type": "claude"}
    config.update(config_overrides)
    return make_ctx(adapter_type=adapter_type, config=config)


def _mock_httpx_response(json_body: dict, status_code: int = 200) -> MagicMock:
    resp = MagicMock()
    resp.status_code = status_code
    resp.json.return_value = json_body
    resp.text = json.dumps(json_body)
    return resp


def _mock_httpx_client(response: MagicMock) -> MagicMock:
    client = MagicMock()
    client.__aenter__ = AsyncMock(return_value=client)
    client.__aexit__ = AsyncMock(return_value=None)
    client.post = AsyncMock(return_value=response)
    return client


def test_remote_cli_missing_worker_url():
    adapter = RemoteCLIAdapter()
    ctx = make_ctx(adapter_type="remote_cli", config={})
    result = asyncio.run(adapter.execute(ctx))
    assert not result.success
    assert "worker_url" in result.error


def test_remote_cli_success():
    adapter = RemoteCLIAdapter()
    ctx = _make_remote_ctx()

    resp = _mock_httpx_response({"stdout": "hello world", "stderr": "", "exit_code": 0, "success": True})
    client = _mock_httpx_client(resp)

    with patch("httpx.AsyncClient", return_value=client):
        result = asyncio.run(adapter.execute(ctx))

    assert result.success
    assert result.summary == "hello world"
    assert result.error is None


def test_remote_cli_nonzero_exit():
    adapter = RemoteCLIAdapter()
    ctx = _make_remote_ctx()

    resp = _mock_httpx_response({"stdout": "", "stderr": "CLI crashed", "exit_code": 1, "success": False})
    client = _mock_httpx_client(resp)

    with patch("httpx.AsyncClient", return_value=client):
        result = asyncio.run(adapter.execute(ctx))

    assert not result.success
    assert "CLI crashed" in result.error


def test_remote_cli_http_error():
    adapter = RemoteCLIAdapter()
    ctx = _make_remote_ctx()

    resp = _mock_httpx_response({}, status_code=500)
    resp.text = "internal error"
    client = _mock_httpx_client(resp)

    with patch("httpx.AsyncClient", return_value=client):
        result = asyncio.run(adapter.execute(ctx))

    assert not result.success
    assert "500" in result.error


def test_remote_cli_connect_error():
    adapter = RemoteCLIAdapter()
    ctx = _make_remote_ctx()

    client = MagicMock()
    client.__aenter__ = AsyncMock(return_value=client)
    client.__aexit__ = AsyncMock(return_value=None)
    client.post = AsyncMock(side_effect=httpx.ConnectError("refused"))

    with patch("httpx.AsyncClient", return_value=client):
        result = asyncio.run(adapter.execute(ctx))

    assert not result.success
    assert "Cannot connect" in result.error


def test_remote_cli_bearer_token_forwarded():
    adapter = RemoteCLIAdapter()
    ctx = _make_remote_ctx(worker_token="secret-token")

    captured_headers: dict = {}

    async def fake_post(url, *, json=None, headers=None):
        captured_headers.update(headers or {})
        return _mock_httpx_response({"stdout": "ok", "stderr": "", "exit_code": 0, "success": True})

    client = MagicMock()
    client.__aenter__ = AsyncMock(return_value=client)
    client.__aexit__ = AsyncMock(return_value=None)
    client.post = fake_post

    with patch("httpx.AsyncClient", return_value=client):
        asyncio.run(adapter.execute(ctx))

    assert captured_headers.get("Authorization") == "Bearer secret-token"


# ---------------------------------------------------------------------------
# RemoteProcessAdapter
# ---------------------------------------------------------------------------


def test_remote_process_missing_worker_url():
    adapter = RemoteProcessAdapter()
    ctx = make_ctx(adapter_type="remote_process", config={})
    result = asyncio.run(adapter.execute(ctx))
    assert not result.success
    assert "worker_url" in result.error


def test_remote_process_missing_command():
    adapter = RemoteProcessAdapter()
    ctx = make_ctx(adapter_type="remote_process", config={"worker_url": "http://worker:9700"})
    result = asyncio.run(adapter.execute(ctx))
    assert not result.success
    assert "command" in result.error


def test_remote_process_success():
    adapter = RemoteProcessAdapter()
    ctx = make_ctx(
        adapter_type="remote_process",
        config={"worker_url": "http://worker:9700", "command": "cargo", "args": ["build"]},
    )

    resp = _mock_httpx_response({"stdout": "Compiling foo v0.1.0", "stderr": "", "exit_code": 0, "success": True})
    client = _mock_httpx_client(resp)

    with patch("httpx.AsyncClient", return_value=client):
        result = asyncio.run(adapter.execute(ctx))

    assert result.success
    assert "Compiling" in result.summary


def test_remote_process_nonzero_exit():
    adapter = RemoteProcessAdapter()
    ctx = make_ctx(
        adapter_type="remote_process",
        config={"worker_url": "http://worker:9700", "command": "cargo", "args": ["build"]},
    )

    resp = _mock_httpx_response({"stdout": "", "stderr": "error[E0001]: oops", "exit_code": 101, "success": False})
    client = _mock_httpx_client(resp)

    with patch("httpx.AsyncClient", return_value=client):
        result = asyncio.run(adapter.execute(ctx))

    assert not result.success
    assert "error[E0001]" in result.error


# ---------------------------------------------------------------------------
# dispatch_parallel
# ---------------------------------------------------------------------------


def test_dispatch_parallel_empty():
    from musu_core.adapters.dispatch import dispatch_parallel
    from musu_core.router import Router

    router = MagicMock(spec=Router)
    results = asyncio.run(dispatch_parallel(router, []))
    assert results == []


def test_dispatch_parallel_runs_concurrently():
    from musu_core.adapters.dispatch import dispatch_parallel
    from musu_core.router import RouteRequest, RouteResult

    order: list[str] = []

    async def fake_route(req: RouteRequest) -> RouteResult:
        order.append(f"start:{req.agent_id}")
        await asyncio.sleep(0)
        order.append(f"end:{req.agent_id}")
        return RouteResult(run_id="r", agent_id=req.agent_id, success=True, summary="ok")

    router = MagicMock()
    router.route = fake_route

    reqs = [RouteRequest(agent_id="a", prompt="p1"), RouteRequest(agent_id="b", prompt="p2")]
    results = asyncio.run(dispatch_parallel(router, reqs))

    assert len(results) == 2
    assert all(r.success for r in results)
    assert results[0].agent_id == "a"
    assert results[1].agent_id == "b"


def test_dispatch_parallel_captures_exceptions():
    from musu_core.adapters.dispatch import dispatch_parallel
    from musu_core.router import RouteRequest

    async def boom(req: RouteRequest):
        raise RuntimeError("adapter exploded")

    router = MagicMock()
    router.route = boom

    reqs = [RouteRequest(agent_id="c", prompt="p")]
    results = asyncio.run(dispatch_parallel(router, reqs))

    assert len(results) == 1
    assert not results[0].success
    assert "adapter exploded" in results[0].error


# ---------------------------------------------------------------------------
# _parse_hermes_output
# ---------------------------------------------------------------------------


def test_parse_hermes_output_with_session_id():
    stdout = "Hello from Hermes!\nsession_id: abc-123"
    response, session_id = _parse_hermes_output(stdout)
    assert response == "Hello from Hermes!"
    assert session_id == "abc-123"


def test_parse_hermes_output_without_session_id():
    stdout = "Hello from Hermes!"
    response, session_id = _parse_hermes_output(stdout)
    assert response == "Hello from Hermes!"
    assert session_id is None


def test_parse_hermes_output_multiline_response():
    stdout = "Line one\nLine two\nLine three\nsession_id: xyz-789"
    response, session_id = _parse_hermes_output(stdout)
    assert response == "Line one\nLine two\nLine three"
    assert session_id == "xyz-789"


def test_parse_hermes_output_empty():
    response, session_id = _parse_hermes_output("")
    assert response == ""
    assert session_id is None


# ---------------------------------------------------------------------------
# HermesAdapter
# ---------------------------------------------------------------------------


def _mock_hermes_proc(stdout: str, returncode: int = 0):
    proc = MagicMock()
    proc.returncode = returncode
    proc.communicate = AsyncMock(return_value=(stdout.encode(), b""))
    return proc


def test_hermes_adapter_success():
    adapter = HermesAdapter()
    ctx = make_ctx(adapter_type="hermes", prompt="What is 2+2?")

    stdout = "The answer is 4.\nsession_id: sess-hermes-1"
    with patch("asyncio.create_subprocess_exec", return_value=_mock_hermes_proc(stdout)):
        result = asyncio.run(adapter.execute(ctx))

    assert result.success
    assert result.summary == "The answer is 4."
    assert result.session_id == "sess-hermes-1"
    assert result.error is None


def test_hermes_adapter_session_id_forwarded():
    adapter = HermesAdapter()
    ctx = make_ctx(adapter_type="hermes", session_id="existing-hermes-sess")

    calls: list[tuple] = []

    async def fake_exec(cmd, *args, stdout, stderr, cwd, env):
        calls.append(args)
        return _mock_hermes_proc("ok\nsession_id: existing-hermes-sess")

    with patch("asyncio.create_subprocess_exec", side_effect=fake_exec):
        asyncio.run(adapter.execute(ctx))

    assert calls
    assert "--resume" in calls[0]
    idx = list(calls[0]).index("--resume")
    assert calls[0][idx + 1] == "existing-hermes-sess"


def test_hermes_adapter_model_forwarded():
    adapter = HermesAdapter()
    ctx = make_ctx(adapter_type="hermes", config={"model": "llama-3-70b"})

    calls: list[tuple] = []

    async def fake_exec(cmd, *args, stdout, stderr, cwd, env):
        calls.append(args)
        return _mock_hermes_proc("ok")

    with patch("asyncio.create_subprocess_exec", side_effect=fake_exec):
        asyncio.run(adapter.execute(ctx))

    assert calls
    assert "-m" in calls[0]
    idx = list(calls[0]).index("-m")
    assert calls[0][idx + 1] == "llama-3-70b"


def test_hermes_adapter_provider_prefixed_to_model():
    adapter = HermesAdapter()
    ctx = make_ctx(adapter_type="hermes", config={"model": "llama-3-70b", "provider": "openrouter"})

    calls: list[tuple] = []

    async def fake_exec(cmd, *args, stdout, stderr, cwd, env):
        calls.append(args)
        return _mock_hermes_proc("ok")

    with patch("asyncio.create_subprocess_exec", side_effect=fake_exec):
        asyncio.run(adapter.execute(ctx))

    assert calls
    assert "-m" in calls[0]
    idx = list(calls[0]).index("-m")
    assert calls[0][idx + 1] == "openrouter:llama-3-70b"


def test_hermes_adapter_timeout():
    adapter = HermesAdapter()
    ctx = make_ctx(adapter_type="hermes", config={"timeout_sec": 1})

    async def fake_exec(*args, stdout, stderr, cwd, env):
        proc = MagicMock()
        proc.returncode = -1
        proc.kill = MagicMock()
        call_count = 0

        async def slow_communicate(input=None):
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                raise asyncio.TimeoutError
            return b"", b""

        proc.communicate = slow_communicate
        return proc

    with patch("asyncio.create_subprocess_exec", side_effect=fake_exec):
        result = asyncio.run(adapter.execute(ctx))

    assert not result.success
    assert "Timed out" in (result.error or "")


def test_hermes_adapter_nonzero_exit():
    adapter = HermesAdapter()
    ctx = make_ctx(adapter_type="hermes")

    with patch("asyncio.create_subprocess_exec", return_value=_mock_hermes_proc("", returncode=1)):
        result = asyncio.run(adapter.execute(ctx))

    assert not result.success
    assert "code 1" in (result.error or "")


def test_hermes_adapter_empty_response():
    adapter = HermesAdapter()
    ctx = make_ctx(adapter_type="hermes")

    with patch("asyncio.create_subprocess_exec", return_value=_mock_hermes_proc("")):
        result = asyncio.run(adapter.execute(ctx))

    assert not result.success
    assert result.error == "Empty response from Hermes"


def test_hermes_adapter_yolo_and_quiet_flags_default():
    adapter = HermesAdapter()
    ctx = make_ctx(adapter_type="hermes")

    calls: list[tuple] = []

    async def fake_exec(cmd, *args, stdout, stderr, cwd, env):
        calls.append(args)
        return _mock_hermes_proc("ok")

    with patch("asyncio.create_subprocess_exec", side_effect=fake_exec):
        asyncio.run(adapter.execute(ctx))

    assert calls
    args = calls[0]
    assert "--yolo" in args
    assert "-Q" in args


def test_registry_includes_hermes():
    assert get_adapter("hermes") is not None
    assert isinstance(get_adapter("hermes"), HermesAdapter)
    assert "hermes" in list_adapter_types()
