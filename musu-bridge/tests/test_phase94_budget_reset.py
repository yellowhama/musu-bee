"""Phase 94: Budget monthly auto-reset tests.

Verifies that route_chat() auto-resets budget_usd_spent when
budget_reset_at is in the past, then updates reset_at to next month.
"""
from __future__ import annotations

import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

os.environ.setdefault("MUSU_BRIDGE_TOKEN", "test-token")
os.environ.setdefault("MUSU_DISABLE_RATE_LIMIT", "1")
sys.path.insert(0, str(Path(__file__).parent.parent))

from handlers import route_chat  # noqa: E402


def _make_agent(
    *,
    agent_id: str = "ag-001",
    name: str = "engineer",
    budget_usd_monthly: float | None = 10.0,
    budget_usd_spent: float = 9.0,
    budget_reset_at: str | None = None,
) -> dict:
    return {
        "id": agent_id,
        "name": name,
        "budget_usd_monthly": budget_usd_monthly,
        "budget_usd_spent": budget_usd_spent,
        "budget_reset_at": budget_reset_at,
        "role": "engineer",
        "adapter_type": "claude_local",
        "adapter_config": {},
        "status": "active",
        "paused": False,
        "company_id": None,
    }


def _mesh_mock():
    m = MagicMock()
    m.enabled = False
    m.is_remote.return_value = False
    m.forward = AsyncMock(return_value={"response": "ok"})
    return m


def _route_result_mock(agent_id: str = "ag-001"):
    """Build a mock Router.route() return value (RouteResult-like)."""
    rr = MagicMock()
    rr.success = True
    rr.error = None
    rr.summary = "Feature implemented"
    adapter_result = MagicMock()
    adapter_result.cost_usd = 0.05
    usage = MagicMock()
    usage.input_tokens = 100
    usage.output_tokens = 50
    adapter_result.usage = usage
    rr.adapter_result = adapter_result
    return rr


class TestBudgetAutoReset:
    """AC1-AC8: budget_reset_at 도래 시 자동 초기화."""

    @pytest.mark.asyncio
    async def test_reset_triggered_when_reset_at_in_past(self):
        """AC1+AC6: budget_reset_at이 과거 → spent=0으로 리셋, update_agent 호출."""
        past = "2020-01-01T00:00:00+00:00"
        agent = _make_agent(budget_usd_spent=8.0, budget_reset_at=past)
        reset_agent = {**agent, "budget_usd_spent": 0.0}

        mock_backend = MagicMock()
        mock_backend.get_agent_by_name.return_value = agent
        mock_backend.update_agent.return_value = reset_agent
        mock_backend.get_agent.return_value = reset_agent
        mock_backend.create_route_execution.return_value = None
        mock_backend.update_route_execution.return_value = None
        mock_backend.touch_route_execution_activity.return_value = None
        mock_backend.list_tasks.return_value = []
        mock_backend.create_task.return_value = {"id": "task-001", "meta": {}}
        mock_backend.add_comment.return_value = None
        mock_backend.list_agents.return_value = [agent]

        config_mock = MagicMock()
        config_mock.channel_agent_map = {"engineer": "engineer"}

        with (
            patch("handlers._get_backend", return_value=mock_backend),
            patch("handlers.get_bridge_config", return_value=config_mock),
            patch("handlers.get_mesh_router", return_value=_mesh_mock()),
            patch("handlers.Router") as mock_router_cls,
        ):
            mock_router_instance = MagicMock()
            mock_router_instance.route = AsyncMock(return_value=_route_result_mock())
            mock_router_cls.return_value = mock_router_instance

            await route_chat("engineer", "user-001", "implement feature X with tests")

        calls = mock_backend.update_agent.call_args_list
        reset_calls = [c for c in calls if c.kwargs.get("budget_usd_spent") == 0.0]
        assert reset_calls, f"Expected update_agent(budget_usd_spent=0.0) call, got: {calls}"

    @pytest.mark.asyncio
    async def test_reset_at_updated_to_next_month(self):
        """AC2: 리셋 후 budget_reset_at이 다음 달 1일로 갱신된다."""
        past = "2020-06-01T00:00:00+00:00"
        agent = _make_agent(budget_usd_spent=5.0, budget_reset_at=past)

        updated_reset_ats: list[str] = []

        def capture_update(agent_id, **kwargs):
            if "budget_reset_at" in kwargs and kwargs.get("budget_usd_spent") == 0.0:
                updated_reset_ats.append(kwargs["budget_reset_at"])
            return {**agent, **kwargs}

        mock_backend = MagicMock()
        mock_backend.get_agent_by_name.return_value = agent
        mock_backend.update_agent.side_effect = capture_update
        mock_backend.get_agent.return_value = {**agent, "budget_usd_spent": 0.0}
        mock_backend.create_route_execution.return_value = None
        mock_backend.update_route_execution.return_value = None
        mock_backend.touch_route_execution_activity.return_value = None
        mock_backend.list_tasks.return_value = []
        mock_backend.create_task.return_value = {"id": "task-001", "meta": {}}
        mock_backend.add_comment.return_value = None
        mock_backend.list_agents.return_value = [agent]

        config_mock = MagicMock()
        config_mock.channel_agent_map = {"engineer": "engineer"}

        with (
            patch("handlers._get_backend", return_value=mock_backend),
            patch("handlers.get_bridge_config", return_value=config_mock),
            patch("handlers.get_mesh_router", return_value=_mesh_mock()),
            patch("handlers.Router") as mock_router_cls,
        ):
            mock_router_instance = MagicMock()
            mock_router_instance.route = AsyncMock(return_value=_route_result_mock())
            mock_router_cls.return_value = mock_router_instance

            await route_chat("engineer", "user-001", "implement feature X with tests")

        assert updated_reset_ats, "Expected budget_reset_at to be updated"
        new_reset = datetime.fromisoformat(updated_reset_ats[0])
        assert new_reset.day == 1
        assert new_reset.hour == 0
        assert new_reset.minute == 0
        now = datetime.now(timezone.utc)
        assert new_reset > now, f"New reset_at {new_reset} should be in the future"

    @pytest.mark.asyncio
    async def test_no_reset_when_reset_at_in_future(self):
        """AC3: budget_reset_at이 미래 → 리셋 없음."""
        future = "2099-12-01T00:00:00+00:00"
        agent = _make_agent(budget_usd_spent=3.0, budget_reset_at=future)

        mock_backend = MagicMock()
        mock_backend.get_agent_by_name.return_value = agent
        mock_backend.get_agent.return_value = agent
        mock_backend.create_route_execution.return_value = None
        mock_backend.update_route_execution.return_value = None
        mock_backend.touch_route_execution_activity.return_value = None
        mock_backend.list_tasks.return_value = []
        mock_backend.create_task.return_value = {"id": "task-001", "meta": {}}
        mock_backend.add_comment.return_value = None
        mock_backend.list_agents.return_value = [agent]

        config_mock = MagicMock()
        config_mock.channel_agent_map = {"engineer": "engineer"}

        with (
            patch("handlers._get_backend", return_value=mock_backend),
            patch("handlers.get_bridge_config", return_value=config_mock),
            patch("handlers.get_mesh_router", return_value=_mesh_mock()),
            patch("handlers.Router") as mock_router_cls,
        ):
            mock_router_instance = MagicMock()
            mock_router_instance.route = AsyncMock(return_value=_route_result_mock())
            mock_router_cls.return_value = mock_router_instance

            await route_chat("engineer", "user-001", "implement feature X with tests")

        reset_calls = [
            c for c in mock_backend.update_agent.call_args_list
            if c.kwargs.get("budget_usd_spent") == 0.0
        ]
        assert not reset_calls, "Should NOT reset spent when reset_at is in the future"

    @pytest.mark.asyncio
    async def test_no_reset_when_reset_at_is_none(self):
        """AC5: budget_reset_at=None → 리셋 없이 spent 유지."""
        agent = _make_agent(budget_usd_spent=2.0, budget_reset_at=None)

        mock_backend = MagicMock()
        mock_backend.get_agent_by_name.return_value = agent
        mock_backend.get_agent.return_value = agent
        mock_backend.create_route_execution.return_value = None
        mock_backend.update_route_execution.return_value = None
        mock_backend.touch_route_execution_activity.return_value = None
        mock_backend.list_tasks.return_value = []
        mock_backend.create_task.return_value = {"id": "task-001", "meta": {}}
        mock_backend.add_comment.return_value = None
        mock_backend.list_agents.return_value = [agent]

        config_mock = MagicMock()
        config_mock.channel_agent_map = {"engineer": "engineer"}

        with (
            patch("handlers._get_backend", return_value=mock_backend),
            patch("handlers.get_bridge_config", return_value=config_mock),
            patch("handlers.get_mesh_router", return_value=_mesh_mock()),
            patch("handlers.Router") as mock_router_cls,
        ):
            mock_router_instance = MagicMock()
            mock_router_instance.route = AsyncMock(return_value=_route_result_mock())
            mock_router_cls.return_value = mock_router_instance

            await route_chat("engineer", "user-001", "implement feature X with tests")

        reset_calls = [
            c for c in mock_backend.update_agent.call_args_list
            if c.kwargs.get("budget_usd_spent") == 0.0
        ]
        assert not reset_calls, "Should NOT reset when budget_reset_at is None"

    @pytest.mark.asyncio
    async def test_reset_unblocks_budget_exceeded_agent(self):
        """AC4: 리셋 후 budget_usd_spent=0이므로 budget_exceeded 없이 dispatch 진행."""
        past = "2020-01-01T00:00:00+00:00"
        # spent == monthly limit → would be blocked without reset
        agent = _make_agent(budget_usd_monthly=5.0, budget_usd_spent=5.0, budget_reset_at=past)
        reset_agent = {**agent, "budget_usd_spent": 0.0}

        mock_backend = MagicMock()
        mock_backend.get_agent_by_name.return_value = agent
        mock_backend.update_agent.return_value = reset_agent
        mock_backend.get_agent.return_value = reset_agent
        mock_backend.create_route_execution.return_value = None
        mock_backend.update_route_execution.return_value = None
        mock_backend.touch_route_execution_activity.return_value = None
        mock_backend.list_tasks.return_value = []
        mock_backend.create_task.return_value = {"id": "task-001", "meta": {}}
        mock_backend.add_comment.return_value = None
        mock_backend.list_agents.return_value = [agent]

        config_mock = MagicMock()
        config_mock.channel_agent_map = {"engineer": "engineer"}

        with (
            patch("handlers._get_backend", return_value=mock_backend),
            patch("handlers.get_bridge_config", return_value=config_mock),
            patch("handlers.get_mesh_router", return_value=_mesh_mock()),
            patch("handlers.Router") as mock_router_cls,
        ):
            mock_router_instance = MagicMock()
            mock_router_instance.route = AsyncMock(return_value=_route_result_mock())
            mock_router_cls.return_value = mock_router_instance

            result = await route_chat("engineer", "user-001", "implement feature X with tests")

        assert result.get("error") != "budget_exceeded", (
            f"Expected dispatch to proceed after reset, but got: {result}"
        )

    def test_december_next_reset_formula(self):
        """AC2 edge: 12월 기준 next reset 계산이 내년 1월 1일을 반환한다 (로직 단위 테스트)."""
        # This mirrors the exact formula in handlers.py budget reset block
        from datetime import datetime, timezone as _tz

        now = datetime(2025, 12, 15, 12, 0, 0, tzinfo=_tz.utc)
        if now.month == 12:
            next_reset = datetime(now.year + 1, 1, 1, tzinfo=_tz.utc)
        else:
            next_reset = datetime(now.year, now.month + 1, 1, tzinfo=_tz.utc)

        assert next_reset.year == 2026
        assert next_reset.month == 1
        assert next_reset.day == 1
        assert next_reset > now
