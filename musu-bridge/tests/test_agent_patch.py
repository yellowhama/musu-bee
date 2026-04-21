"""Unit tests for PATCH /api/agents/{agent_id} endpoint."""
from __future__ import annotations

import os
import sys
from pathlib import Path
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

os.environ.setdefault("MUSU_BRIDGE_TOKEN", "test-token")
sys.path.insert(0, str(Path(__file__).parent.parent))

from server import app  # noqa: E402

client = TestClient(app, headers={"Authorization": "Bearer test-token"})

_AGENT_UPDATED = {
    "id": "agent-001",
    "name": "ceo",
    "role": "Chief Executive",
    "adapter_type": "hermes",
    "adapter_config": {"model": "qwen2.5-14b-instruct"},
    "status": "active",
    "created_at": "2026-04-22T00:00:00.000Z",
    "updated_at": "2026-04-22T00:01:00.000Z",
}


def test_patch_agent_role(monkeypatch):
    with patch("server.update_agent_fields", return_value=_AGENT_UPDATED) as mock:
        resp = client.patch("/api/agents/agent-001", json={"role": "Chief Executive"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["role"] == "Chief Executive"
    mock.assert_called_once_with("agent-001", role="Chief Executive", model=None)


def test_patch_agent_model(monkeypatch):
    with patch("server.update_agent_fields", return_value=_AGENT_UPDATED) as mock:
        resp = client.patch("/api/agents/agent-001", json={"model": "qwen2.5-14b-instruct"})
    assert resp.status_code == 200
    mock.assert_called_once_with("agent-001", role=None, model="qwen2.5-14b-instruct")


def test_patch_agent_not_found():
    with patch("server.update_agent_fields", return_value=None):
        resp = client.patch("/api/agents/nonexistent", json={"role": "X"})
    assert resp.status_code == 404


def test_patch_agent_no_fields():
    resp = client.patch("/api/agents/agent-001", json={})
    assert resp.status_code == 400
