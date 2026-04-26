"""Regression test: get_dashboard agents.total must reflect all registered agents."""
from __future__ import annotations

import sys
from pathlib import Path
from unittest.mock import AsyncMock, patch

import pytest

sys.path.insert(0, str(Path(__file__).parent.parent))

from server import app  # noqa: E402
from fastapi.testclient import TestClient

client = TestClient(app, headers={"Authorization": "Bearer test-token"})


@pytest.fixture()
def company_with_agents():
    """Create a company + agents with mixed statuses via the backend directly."""
    from handlers import _get_backend, create_company

    backend = _get_backend()
    company = create_company(name="Test Corp")
    company_id = company["id"]

    a1 = backend.create_agent(name="ceo", role="ceo", adapter_type="gemini_local", company_id=company_id)
    # status defaults to "active" on creation; leave as-is

    a2 = backend.create_agent(name="engineer", role="engineer", adapter_type="gemini_local", company_id=company_id)
    backend.update_agent(a2["id"], status="paused")

    backend.create_agent(name="qa", role="qa", adapter_type="gemini_local", company_id=company_id)
    # status defaults to "active"

    yield company_id


@patch("server.list_nodes", new_callable=AsyncMock, return_value=[])
def test_dashboard_agents_total_reflects_all_statuses(mock_nodes, company_with_agents):
    """total must include paused agents, not just active ones."""
    company_id = company_with_agents
    resp = client.get(f"/api/companies/{company_id}/dashboard")
    assert resp.status_code == 200
    body = resp.json()
    total = body["agents"]["total"]
    active = body["agents"]["active"]
    # We created 3 scoped agents (2 active, 1 paused); global agents from other
    # tests may also be included by the merge logic, so total >= 3.
    assert total >= 3, f"Expected at least 3 agents (2 active + 1 paused), got {total}"
    # active count must be strictly less than total — the paused agent is counted
    # in total but must not appear in active.
    assert active < total, (
        f"active ({active}) should be < total ({total}): paused agent not counted"
    )


@patch("server.list_nodes", new_callable=AsyncMock, return_value=[])
def test_dashboard_agents_active_lte_total(mock_nodes, company_with_agents):
    company_id = company_with_agents
    resp = client.get(f"/api/companies/{company_id}/dashboard")
    assert resp.status_code == 200
    body = resp.json()
    assert body["agents"]["active"] <= body["agents"]["total"]
