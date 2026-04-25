"""Phase 89: RED metrics completion — test_metrics_coverage.py

Tests:
  test_record_metric_done_path     — _record_task_metric called on normal done path
  test_record_metric_timeout_path  — _record_task_metric called on timeout path
  test_histogram_buckets           — histogram must contain 1, 5, 15 buckets
  test_alert_rules_defined         — prometheus_rules.yml has AgentTaskP99High + ZombieRateHigh
"""
from __future__ import annotations

import inspect
import sys
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock

import pytest

# ---------------------------------------------------------------------------
# Path setup (mirrors conftest.py)
# ---------------------------------------------------------------------------
_ROOT = Path(__file__).parent.parent.parent
_MUSU_CORE = _ROOT / "musu-core" / "src"
_BRIDGE = Path(__file__).parent.parent

for p in (_MUSU_CORE, _BRIDGE):
    s = str(p)
    if s not in sys.path:
        sys.path.insert(0, s)


# ---------------------------------------------------------------------------
# test_record_metric_done_path
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_record_metric_done_path(monkeypatch):
    """route_chat must call _record_task_metric with status='done' on success."""
    import handlers

    mock_backend = MagicMock()
    mock_backend.create_route_execution = MagicMock()
    mock_backend.update_route_execution = MagicMock()
    mock_backend.get_agent_by_name = MagicMock(return_value={"id": "a1", "role": "eng", "adapter_type": "test", "name": "engineer"})
    mock_backend.list_agents = MagicMock(return_value=[])
    mock_backend.list_tasks = MagicMock(return_value=[])
    mock_backend.create_task = MagicMock(return_value={"id": "t1"})
    mock_backend.add_comment = MagicMock()
    mock_backend.touch_route_execution_activity = MagicMock()

    monkeypatch.setattr(handlers, "_backend", mock_backend)

    mock_cfg = MagicMock()
    mock_cfg.channel_agent_map = {}
    monkeypatch.setattr(handlers, "get_bridge_config", lambda: mock_cfg)

    mock_mesh = MagicMock()
    mock_mesh.enabled = False
    mock_mesh.is_remote = MagicMock(return_value=False)
    monkeypatch.setattr(handlers, "get_mesh_router", lambda: mock_mesh)

    # Mock router so it returns success
    mock_router_inst = MagicMock()
    mock_result = MagicMock()
    mock_result.success = True
    mock_result.summary = "done output"
    mock_result.error = None
    mock_result.adapter_result = MagicMock(cost_usd=None, usage=None)
    mock_router_inst.route = AsyncMock(return_value=mock_result)

    import musu_core.router as _router_mod
    monkeypatch.setattr(handlers, "Router", lambda **kw: mock_router_inst)

    recorded = []

    def _fake_record(channel, status, duration_s=None):
        recorded.append({"channel": channel, "status": status})

    monkeypatch.setattr(handlers, "_record_task_metric", _fake_record)

    result = await handlers.route_chat("engineer", "user1", "please implement tests in tests/test_api.py")
    assert any(r["status"] == "done" for r in recorded), (
        f"Expected at least one 'done' metric record, got: {recorded}"
    )


# ---------------------------------------------------------------------------
# test_record_metric_timeout_path
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_record_metric_timeout_path(monkeypatch):
    """route_chat must call _record_task_metric with status='failed' on timeout."""
    import handlers

    mock_backend = MagicMock()
    mock_backend.create_route_execution = MagicMock()
    mock_backend.update_route_execution = MagicMock()
    mock_backend.get_agent_by_name = MagicMock(return_value={"id": "a1", "role": "eng", "adapter_type": "test", "name": "engineer"})
    mock_backend.list_agents = MagicMock(return_value=[])
    mock_backend.list_tasks = MagicMock(return_value=[])
    mock_backend.create_task = MagicMock(return_value={"id": "t1"})
    mock_backend.add_comment = MagicMock()
    mock_backend.touch_route_execution_activity = MagicMock()

    monkeypatch.setattr(handlers, "_backend", mock_backend)

    mock_cfg = MagicMock()
    mock_cfg.channel_agent_map = {}
    monkeypatch.setattr(handlers, "get_bridge_config", lambda: mock_cfg)

    mock_mesh = MagicMock()
    mock_mesh.enabled = False
    mock_mesh.is_remote = MagicMock(return_value=False)
    monkeypatch.setattr(handlers, "get_mesh_router", lambda: mock_mesh)

    # Mock router to raise TimeoutError
    mock_router_inst = MagicMock()
    mock_router_inst.route = AsyncMock(side_effect=TimeoutError("timeout"))
    monkeypatch.setattr(handlers, "Router", lambda **kw: mock_router_inst)

    recorded = []

    def _fake_record(channel, status, duration_s=None):
        recorded.append({"channel": channel, "status": status})

    monkeypatch.setattr(handlers, "_record_task_metric", _fake_record)

    result = await handlers.route_chat("engineer", "user1", "please implement tests in tests/test_api.py")
    assert result.get("error") is not None
    assert any(r["status"] == "failed" for r in recorded), (
        f"Expected at least one 'failed' metric record on timeout, got: {recorded}"
    )


# ---------------------------------------------------------------------------
# test_histogram_buckets
# ---------------------------------------------------------------------------


def test_histogram_buckets():
    """metrics.py histogram must include 1, 5, 15 buckets (Phase 89 bucket update)."""
    import metrics
    source = inspect.getsource(metrics)
    for bucket in ("1", "5", "15"):
        assert bucket in source, (
            f"Bucket {bucket!r} not found in metrics.py — "
            "histogram buckets must include [1, 5, 15, 30, 60, 120, 300, 600]"
        )


# ---------------------------------------------------------------------------
# test_alert_rules_defined
# ---------------------------------------------------------------------------


def test_alert_rules_defined():
    """prometheus_rules.yml must define AgentTaskP99High and ZombieRateHigh alerts."""
    try:
        import yaml
    except ImportError:
        pytest.skip("PyYAML not installed")

    rules_path = Path(__file__).parent.parent / "monitoring" / "prometheus_rules.yml"
    assert rules_path.exists(), f"prometheus_rules.yml not found at {rules_path}"

    with open(rules_path) as f:
        data = yaml.safe_load(f)

    all_rules = [r for g in data.get("groups", []) for r in g.get("rules", [])]
    names = [r.get("alert") for r in all_rules]

    assert "AgentTaskP99High" in names, f"AgentTaskP99High missing from rules: {names}"
    assert "ZombieRateHigh" in names, f"ZombieRateHigh missing from rules: {names}"

    # ZombieRateHigh must reference task_stuck_total
    zombie_rule = next(r for r in all_rules if r.get("alert") == "ZombieRateHigh")
    assert "task_stuck_total" in zombie_rule.get("expr", ""), (
        f"ZombieRateHigh expr must use task_stuck_total, got: {zombie_rule.get('expr')!r}"
    )

    # AgentTaskP99High must fire within 2 minutes
    p99_rule = next(r for r in all_rules if r.get("alert") == "AgentTaskP99High")
    assert p99_rule.get("for") in ("2m", "2m0s"), (
        f"AgentTaskP99High 'for' must be '2m', got: {p99_rule.get('for')!r}"
    )
