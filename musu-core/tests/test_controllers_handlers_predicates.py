"""Tests for controllers.handlers + controllers.predicates."""
from __future__ import annotations

from musu_core.controllers.handlers import (
    enqueue_request_for_object,
    enqueue_request_for_owner,
)
from musu_core.controllers.predicates import (
    GenerationChanged,
    LabelSelector,
    StatusIn,
)


def test_enqueue_request_for_object_basic():
    h = enqueue_request_for_object("agents")
    row = {"id": "agent-1", "company_id": "c1", "machine_id": "m1"}
    reqs = h(row)
    assert len(reqs) == 1
    assert reqs[0].table == "agents"
    assert reqs[0].key == "agent-1"
    assert reqs[0].company_id == "c1"
    assert reqs[0].machine_id == "m1"


def test_enqueue_request_for_object_skips_when_no_id():
    h = enqueue_request_for_object("agents")
    assert h({"id": None}) == []
    assert h({}) == []


def test_enqueue_request_for_owner_basic():
    h = enqueue_request_for_owner("agents", "agent_id")
    row = {"id": "exec-1", "agent_id": "agent-9", "company_id": "c1"}
    reqs = h(row)
    assert len(reqs) == 1
    assert reqs[0].table == "agents"
    assert reqs[0].key == "agent-9"
    assert reqs[0].company_id == "c1"


def test_enqueue_request_for_owner_skips_orphans():
    h = enqueue_request_for_owner("agents", "agent_id")
    assert h({"id": "x", "agent_id": None}) == []
    assert h({"id": "x"}) == []


def test_generation_changed_always_matches():
    p = GenerationChanged()
    assert p.matches({"id": "x"}) is True
    assert p.matches({}) is True


def test_label_selector_match():
    p = LabelSelector("status", "running")
    assert p.matches({"status": "running"}) is True
    assert p.matches({"status": "stopped"}) is False
    assert p.matches({}) is False


def test_status_in_match():
    p = StatusIn("running", "pending")
    assert p.matches({"status": "running"}) is True
    assert p.matches({"status": "pending"}) is True
    assert p.matches({"status": "done"}) is False
    assert p.matches({}) is False
