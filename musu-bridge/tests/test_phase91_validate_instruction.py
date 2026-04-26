"""Regression tests for Phase 91: unhandled exception error propagation.

Issue dbd72847 — route_chat() except-Exception block swallowed the real
exception type and message, returning only a generic string.

Fix: error field must include exc.__class__.__name__ + str(exc) so operators
can diagnose failures without digging through logs.
"""
from __future__ import annotations

import os
import sys
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

os.environ.setdefault("MUSU_BRIDGE_TOKEN", "test-token")
sys.path.insert(0, str(Path(__file__).parent.parent))


class TestRouteChatUnhandledExceptionError:
    """route_chat() must propagate exception type+message in the error field."""

    @pytest.mark.asyncio
    async def test_unexpected_exception_includes_type_and_message_in_error(self):
        """When an unexpected exception escapes the LLM call, the task record's
        error field must contain both the exception class name and its message."""
        import handlers

        sentinel_msg = "disk full on node-7"

        mock_backend = MagicMock()
        mock_backend.get_agent_by_name.return_value = {
            "id": "agent-1",
            "role": "engineer",
            "adapter_type": "gemini_local",
            "adapter_config": {},
        }
        mock_backend.create_route_execution.return_value = None
        mock_backend.update_route_execution.return_value = None
        mock_backend.list_tasks.return_value = []
        mock_backend.create_task.return_value = {"id": "task-1", "meta": {}}

        async def _exploding_route(*_a, **_kw):
            raise RuntimeError(sentinel_msg)

        with patch("handlers._get_backend", return_value=mock_backend):
            with patch("handlers._health_probe_enabled", return_value=False):
                with patch("handlers.get_bridge_config") as mock_cfg:
                    mock_cfg.return_value.channel_agent_map = {"engineer": "engineer"}
                    with patch("handlers.get_mesh_router") as mock_mesh:
                        mock_mesh.return_value.enabled = False
                        mock_mesh.return_value.is_remote.return_value = False
                        with patch("musu_core.router.Router.route", side_effect=_exploding_route):
                            result = await handlers.route_chat(
                                channel="engineer",
                                sender_id="test-sender",
                                text="hello from test",
                            )

        assert "error" in result
        error_value = result["error"]
        assert "RuntimeError" in error_value, (
            f"Exception class name missing from error: {error_value!r}"
        )
        assert sentinel_msg in error_value, (
            f"Exception message missing from error: {error_value!r}"
        )
        assert result.get("response") is None
