"""Unit tests for agents.py — AgentRegistry CRUD."""

from __future__ import annotations

import tempfile
import os
import pytest

from musu_core.db import Database
from musu_core.agents import Agent, AgentRegistry


@pytest.fixture
def db(tmp_path):
    return Database(str(tmp_path / "test.db"))


@pytest.fixture
def registry(db):
    return AgentRegistry(db)


def test_create_agent_minimal(registry):
    agent = registry.create(name="alice")
    assert agent.id
    assert agent.name == "alice"
    assert agent.role == ""
    assert agent.adapter_type == "process"
    assert agent.adapter_config == {}
    assert agent.status == "active"
    assert agent.created_at
    assert agent.updated_at


def test_create_agent_full(registry):
    agent = registry.create(
        name="bob",
        role="engineer",
        adapter_type="claude_local",
        adapter_config={"model": "claude-sonnet-4-5", "cwd": "/tmp"},
    )
    assert agent.name == "bob"
    assert agent.role == "engineer"
    assert agent.adapter_type == "claude_local"
    assert agent.adapter_config == {"model": "claude-sonnet-4-5", "cwd": "/tmp"}


def test_create_agent_with_explicit_id(registry):
    agent = registry.create(name="charlie", agent_id="fixed-id-123")
    assert agent.id == "fixed-id-123"


def test_get_agent_roundtrip(registry):
    created = registry.create(name="dave", role="qa", adapter_type="process")
    fetched = registry.get(created.id)
    assert fetched is not None
    assert fetched.id == created.id
    assert fetched.name == created.name
    assert fetched.role == created.role
    assert fetched.adapter_type == created.adapter_type
    assert fetched.status == created.status


def test_get_agent_missing_returns_none(registry):
    assert registry.get("does-not-exist") is None


def test_get_by_name(registry):
    registry.create(name="eve")
    agent = registry.get_by_name("eve")
    assert agent is not None
    assert agent.name == "eve"


def test_get_by_name_missing_returns_none(registry):
    assert registry.get_by_name("ghost") is None


def test_list_agents_empty(registry):
    assert registry.list() == []


def test_list_agents(registry):
    registry.create(name="a1")
    registry.create(name="a2")
    agents = registry.list()
    assert len(agents) == 2
    names = {a.name for a in agents}
    assert names == {"a1", "a2"}


def test_list_agents_by_status(registry):
    registry.create(name="active1")
    a2 = registry.create(name="paused1")
    registry.update(a2.id, status="paused")
    active = registry.list(status="active")
    paused = registry.list(status="paused")
    assert len(active) == 1
    assert active[0].name == "active1"
    assert len(paused) == 1
    assert paused[0].name == "paused1"


def test_update_agent_name(registry):
    agent = registry.create(name="old-name")
    updated = registry.update(agent.id, name="new-name")
    assert updated is not None
    assert updated.name == "new-name"
    # Other fields unchanged
    assert updated.role == agent.role
    assert updated.status == agent.status


def test_update_agent_status(registry):
    agent = registry.create(name="worker")
    updated = registry.update(agent.id, status="paused")
    assert updated is not None
    assert updated.status == "paused"
    # Verify via get
    fetched = registry.get(agent.id)
    assert fetched.status == "paused"


def test_update_agent_config(registry):
    agent = registry.create(name="cfg-agent", adapter_config={"key": "v1"})
    updated = registry.update(agent.id, adapter_config={"key": "v2", "new": True})
    assert updated.adapter_config == {"key": "v2", "new": True}


def test_update_agent_missing_returns_none(registry):
    assert registry.update("no-such-id", name="x") is None


def test_delete_agent(registry):
    agent = registry.create(name="doomed")
    assert registry.delete(agent.id) is True
    assert registry.get(agent.id) is None


def test_delete_agent_missing_returns_false(registry):
    assert registry.delete("no-such-id") is False


def test_agent_dataclass_fields():
    """Agent dataclass has the expected fields."""
    import dataclasses
    field_names = {f.name for f in dataclasses.fields(Agent)}
    expected = {"id", "name", "role", "adapter_type", "adapter_config", "status", "created_at", "updated_at"}
    assert expected.issubset(field_names)
