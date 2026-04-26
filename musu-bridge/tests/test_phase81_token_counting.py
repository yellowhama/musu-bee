"""Phase 81: LLM token counting — route_message() usage propagation.

Tests:
1. ClaudeLocalAdapter stream-json parser extracts usage correctly.
2. GeminiLocalAdapter stream-json parser extracts usage correctly.
3. route_chat() passes input_tokens/output_tokens to update_route_execution().
"""
from __future__ import annotations

import json
import sys
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

# Ensure musu-core is importable
_MUSU_CORE = Path(__file__).parent.parent.parent / "musu-core" / "src"
if str(_MUSU_CORE) not in sys.path:
    sys.path.insert(0, str(_MUSU_CORE))

_BRIDGE = Path(__file__).parent.parent
if str(_BRIDGE) not in sys.path:
    sys.path.insert(0, str(_BRIDGE))


# ── Adapter unit tests ─────────────────────────────────────────────────────────

class TestClaudeLocalParseStreamJson:
    """_parse_stream_json() parses usage from a result event."""

    def _make_stdout(
        self,
        input_tokens: int,
        output_tokens: int,
        cache_tokens: int = 0,
        cache_creation_tokens: int = 0,
    ) -> str:
        events = [
            {"type": "system", "subtype": "init", "session_id": "sess-abc", "model": "claude-sonnet"},
            {"type": "assistant", "session_id": "sess-abc", "message": {"content": [{"type": "text", "text": "Hello"}]}},
            {
                "type": "result",
                "session_id": "sess-abc",
                "result": "Hello",
                "total_cost_usd": 0.001,
                "usage": {
                    "input_tokens": input_tokens,
                    "output_tokens": output_tokens,
                    "cache_read_input_tokens": cache_tokens,
                    "cache_creation_input_tokens": cache_creation_tokens,
                },
            },
        ]
        return "\n".join(json.dumps(e) for e in events)

    def test_usage_input_output_tokens_parsed(self):
        from musu_core.adapters.claude_local import _parse_stream_json
        stdout = self._make_stdout(input_tokens=100, output_tokens=50)
        result = _parse_stream_json(stdout)
        assert result["usage"] is not None
        assert result["usage"].input_tokens == 100
        assert result["usage"].output_tokens == 50

    def test_usage_cached_tokens_parsed(self):
        from musu_core.adapters.claude_local import _parse_stream_json
        stdout = self._make_stdout(input_tokens=200, output_tokens=80, cache_tokens=150)
        result = _parse_stream_json(stdout)
        assert result["usage"].cached_input_tokens == 150

    def test_cache_creation_tokens_parsed(self):
        from musu_core.adapters.claude_local import _parse_stream_json
        stdout = self._make_stdout(
            input_tokens=39, output_tokens=7953,
            cache_tokens=1770130, cache_creation_tokens=148386,
        )
        result = _parse_stream_json(stdout)
        assert result["usage"].cache_creation_input_tokens == 148386

    def test_no_result_event_returns_none_usage(self):
        from musu_core.adapters.claude_local import _parse_stream_json
        stdout = json.dumps({"type": "assistant", "message": {"content": [{"type": "text", "text": "Hi"}]}})
        result = _parse_stream_json(stdout)
        assert result["usage"] is None

    def test_cost_usd_parsed(self):
        from musu_core.adapters.claude_local import _parse_stream_json
        stdout = self._make_stdout(input_tokens=10, output_tokens=5)
        result = _parse_stream_json(stdout)
        assert result["cost_usd"] == pytest.approx(0.001)


class TestGeminiLocalParseStreamJson:
    """_parse_stream_json() parses usage from a result event with stats."""

    def _make_stdout(self, input_tokens: int, output_tokens: int, cached: int = 0) -> str:
        events = [
            {"type": "init", "session_id": "gemini-sess-1", "model": "gemini-2.5-flash"},
            {"type": "message", "role": "assistant", "content": "Response text"},
            {
                "type": "result",
                "session_id": "gemini-sess-1",
                "response": "Response text",
                "stats": {
                    "input_tokens": input_tokens,
                    "output_tokens": output_tokens,
                    "cached": cached,
                },
            },
        ]
        return "\n".join(json.dumps(e) for e in events)

    def test_usage_input_output_tokens_parsed(self):
        from musu_core.adapters.gemini_local import _parse_stream_json
        stdout = self._make_stdout(input_tokens=80, output_tokens=40)
        result = _parse_stream_json(stdout)
        assert result["usage"] is not None
        assert result["usage"].input_tokens == 80
        assert result["usage"].output_tokens == 40

    def test_usage_cached_tokens_parsed(self):
        from musu_core.adapters.gemini_local import _parse_stream_json
        stdout = self._make_stdout(input_tokens=120, output_tokens=60, cached=90)
        result = _parse_stream_json(stdout)
        assert result["usage"].cached_input_tokens == 90

    def test_no_result_event_returns_none_usage(self):
        from musu_core.adapters.gemini_local import _parse_stream_json
        stdout = json.dumps({"type": "message", "role": "assistant", "content": "Hi"})
        result = _parse_stream_json(stdout)
        assert result["usage"] is None

    def test_gemini_cost_is_none(self):
        from musu_core.adapters.gemini_local import _parse_stream_json
        stdout = self._make_stdout(input_tokens=10, output_tokens=5)
        result = _parse_stream_json(stdout)
        assert result["cost_usd"] is None


# ── Integration test: usage flows into update_route_execution ──────────────────

class TestRouteChatUsagePropagation:
    """route_chat() must pass input_tokens/output_tokens to update_route_execution()."""

    @pytest.mark.asyncio
    async def test_usage_propagated_to_update_route_execution(self):
        """When Router.route() returns a result with usage, route_chat() must pass
        input_tokens and output_tokens to backend.update_route_execution()."""
        from musu_core.adapters.base import AdapterResult, UsageSummary
        from musu_core.router import RouteResult

        fake_usage = UsageSummary(input_tokens=100, cached_input_tokens=0, output_tokens=50)
        fake_adapter_result = AdapterResult(
            run_id="run-test-1",
            success=True,
            summary="Agent reply",
            usage=fake_usage,
            cost_usd=0.002,
        )
        fake_route_result = RouteResult(
            run_id="run-test-1",
            agent_id="agent-1",
            success=True,
            summary="Agent reply",
            adapter_result=fake_adapter_result,
        )

        mock_backend = MagicMock()
        mock_backend.get_agent_by_name.return_value = {
            "id": "agent-1",
            "name": "test-agent",
            "role": "Engineer",
            "adapter_type": "claude_local",
            "adapter_config": {},
        }
        mock_backend.create_route_execution.return_value = None
        mock_backend.update_route_execution.return_value = None

        with (
            patch("handlers._get_backend", return_value=mock_backend),
            patch("handlers.get_mesh_router") as mock_mesh,
            patch("handlers.route_message") as _mock_rm,  # should NOT be called in new impl
            patch("musu_core.router.Router.route", new_callable=AsyncMock, return_value=fake_route_result),
        ):
            mock_mesh.return_value.enabled = False
            mock_mesh.return_value.is_remote.return_value = False

            import handlers
            result = await handlers.route_chat(
                channel="test-agent",
                sender_id="user-1",
                text="Hello, agent!",
            )

        # Result must contain response
        assert result.get("response") == "Agent reply"
        assert result.get("error") is None

        # update_route_execution must have been called with input_tokens and output_tokens
        calls = mock_backend.update_route_execution.call_args_list
        # Find the "done" call (not "running")
        done_calls = [c for c in calls if c.args[1] == "done" if len(c.args) > 1]
        assert done_calls, "update_route_execution was never called with status='done'"

        done_call = done_calls[-1]
        kwargs = done_call.kwargs
        assert kwargs.get("input_tokens") == 100, f"Expected input_tokens=100, got {kwargs}"
        assert kwargs.get("output_tokens") == 50, f"Expected output_tokens=50, got {kwargs}"
        assert kwargs.get("cost_usd") == pytest.approx(0.002)

    @pytest.mark.asyncio
    async def test_no_usage_does_not_crash(self):
        """When adapter returns no usage, route_chat() must still complete without error."""
        from musu_core.adapters.base import AdapterResult
        from musu_core.router import RouteResult

        fake_adapter_result = AdapterResult(
            run_id="run-test-2",
            success=True,
            summary="OK response",
            usage=None,
            cost_usd=None,
        )
        fake_route_result = RouteResult(
            run_id="run-test-2",
            agent_id="agent-2",
            success=True,
            summary="OK response",
            adapter_result=fake_adapter_result,
        )

        mock_backend = MagicMock()
        mock_backend.get_agent_by_name.return_value = {
            "id": "agent-2",
            "name": "test-agent",
            "role": "QA",
            "adapter_type": "gemini_local",
            "adapter_config": {},
        }
        mock_backend.create_route_execution.return_value = None
        mock_backend.update_route_execution.return_value = None

        with (
            patch("handlers._get_backend", return_value=mock_backend),
            patch("handlers.get_mesh_router") as mock_mesh,
            patch("musu_core.router.Router.route", new_callable=AsyncMock, return_value=fake_route_result),
        ):
            mock_mesh.return_value.enabled = False
            mock_mesh.return_value.is_remote.return_value = False

            import handlers
            result = await handlers.route_chat(
                channel="test-agent",
                sender_id="user-1",
                text="Hello, agent!",
            )

        assert result.get("response") == "OK response"
        assert result.get("error") is None

        done_calls = [
            c for c in mock_backend.update_route_execution.call_args_list
            if len(c.args) > 1 and c.args[1] == "done"
        ]
        assert done_calls
        kwargs = done_calls[-1].kwargs
        assert kwargs.get("input_tokens") is None
        assert kwargs.get("output_tokens") is None
