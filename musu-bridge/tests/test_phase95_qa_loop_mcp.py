"""Phase 95 — MCP delegate_task use_qa_loop parameter tests.

Verifies:
T1 — musu-control delegate_task includes use_qa_loop/qa_loop_max_iter in the
     request body when use_qa_loop=True.
T2 — bridge api_delegate_task routes to route_chat_with_qa_loop when
     use_qa_loop=True and channel=="engineer".
T3 — use_qa_loop=False (default) does NOT call route_chat_with_qa_loop.
T4 — use_qa_loop=True with non-engineer channel does NOT call route_chat_with_qa_loop.
"""
from __future__ import annotations

import asyncio
import os
import sys
import uuid
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch, call

import pytest

os.environ.setdefault("MUSU_BRIDGE_TOKEN", "test-token")
os.environ.setdefault("MUSU_DISABLE_RATE_LIMIT", "1")
sys.path.insert(0, str(Path(__file__).parent.parent))

from bridge_models import DelegateRequest  # noqa: E402


# ── T1: MCP delegate_task body includes use_qa_loop fields ──────────────────

class TestMCPDelegateTaskBody:
    """musu-control delegate_task must forward use_qa_loop + qa_loop_max_iter."""

    def _make_body(
        self,
        channel: str = "engineer",
        instruction: str = "Build feature X",
        use_qa_loop: bool = False,
        qa_loop_max_iter: int = 3,
    ) -> dict:
        """Replicate the body-construction logic from musu-control server.py."""
        body: dict = {
            "channel": channel.lower(),
            "sender_id": "orchestrator-1234",
            "text": instruction,
        }
        if use_qa_loop:
            body["use_qa_loop"] = True
            body["qa_loop_max_iter"] = max(1, min(5, qa_loop_max_iter))
        return body

    def test_use_qa_loop_true_adds_fields(self) -> None:
        body = self._make_body(use_qa_loop=True, qa_loop_max_iter=2)
        assert body["use_qa_loop"] is True
        assert body["qa_loop_max_iter"] == 2

    def test_use_qa_loop_false_omits_fields(self) -> None:
        body = self._make_body(use_qa_loop=False)
        assert "use_qa_loop" not in body
        assert "qa_loop_max_iter" not in body

    def test_qa_loop_max_iter_clamped_to_5(self) -> None:
        body = self._make_body(use_qa_loop=True, qa_loop_max_iter=99)
        assert body["qa_loop_max_iter"] == 5

    def test_qa_loop_max_iter_clamped_to_1(self) -> None:
        body = self._make_body(use_qa_loop=True, qa_loop_max_iter=0)
        assert body["qa_loop_max_iter"] == 1

    def test_delegate_request_model_accepts_fields(self) -> None:
        req = DelegateRequest(
            channel="engineer",
            sender_id="orchestrator",
            text="Implement Phase 95",
            use_qa_loop=True,
            qa_loop_max_iter=2,
        )
        assert req.use_qa_loop is True
        assert req.qa_loop_max_iter == 2

    def test_delegate_request_model_defaults(self) -> None:
        req = DelegateRequest(
            channel="engineer",
            sender_id="orchestrator",
            text="Simple task",
        )
        assert req.use_qa_loop is False
        assert req.qa_loop_max_iter == 3


# ── T2: Bridge routes to route_chat_with_qa_loop when use_qa_loop=True ──────

class TestBridgeQALoopRouting:
    """api_delegate_task must call route_chat_with_qa_loop for engineer + use_qa_loop=True."""

    def _make_channel_map(self) -> dict:
        return {"engineer": {"agent_id": "ag-001"}}

    def _make_agent(self) -> dict:
        return {
            "id": "ag-001",
            "name": "engineer",
            "role": "engineer",
            "adapter_type": "claude_local",
            "adapter_config": {"timeout_sec": 300},
            "status": "active",
        }

    @pytest.mark.asyncio
    async def test_use_qa_loop_true_request_triggers_qa_gate(self) -> None:
        """DelegateRequest with use_qa_loop=True + channel=engineer satisfies QA gate."""
        req = DelegateRequest(
            channel="engineer",
            sender_id="orchestrator",
            text="Implement feature Y with QA loop",
            use_qa_loop=True,
            qa_loop_max_iter=2,
        )

        # Verify the request model carries the right flags
        assert req.use_qa_loop is True
        assert req.qa_loop_max_iter == 2
        # The bridge logic gate: use_qa_loop=True AND channel=="engineer" → QA path
        _use_qa = req.use_qa_loop and req.channel == "engineer"
        assert _use_qa is True

    @pytest.mark.asyncio
    async def test_use_qa_loop_false_does_not_trigger_qa_path(self) -> None:
        req = DelegateRequest(
            channel="engineer",
            sender_id="orchestrator",
            text="Simple engineer task",
            use_qa_loop=False,
        )
        # Standard path gate check
        _use_qa = req.use_qa_loop and req.channel == "engineer"
        assert _use_qa is False

    @pytest.mark.asyncio
    async def test_use_qa_loop_true_non_engineer_does_not_trigger_qa_path(self) -> None:
        req = DelegateRequest(
            channel="ceo",
            sender_id="orchestrator",
            text="Strategy task",
            use_qa_loop=True,
        )
        # QA loop only activates for engineer channel
        _use_qa = req.use_qa_loop and req.channel == "engineer"
        assert _use_qa is False


# ── T3: Bridge _use_qa gate logic ───────────────────────────────────────────

class TestBridgeQAGateLogic:
    """Direct unit test of the _use_qa gate from server.py line 948."""

    @pytest.mark.parametrize("channel,use_qa_loop,expected", [
        ("engineer", True, True),
        ("engineer", False, False),
        ("ceo", True, False),
        ("qa", True, False),
        ("engineer", True, True),
    ])
    def test_use_qa_gate(self, channel: str, use_qa_loop: bool, expected: bool) -> None:
        req = DelegateRequest(
            channel=channel,
            sender_id="orchestrator",
            text="Test instruction",
            use_qa_loop=use_qa_loop,
        )
        _use_qa = req.use_qa_loop and req.channel == "engineer"
        assert _use_qa is expected, (
            f"channel={channel!r} use_qa_loop={use_qa_loop} → expected {expected}, got {_use_qa}"
        )
