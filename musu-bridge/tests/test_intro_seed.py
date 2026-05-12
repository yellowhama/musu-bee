"""v12-onboarding E — seed_intro_messages keeps the canvas alive after spawn."""
from __future__ import annotations

import os
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from handlers import create_company_from_template, seed_intro_messages  # noqa: E402
from musu_core.backends.local import LocalBackend  # noqa: E402


def _backend(tmp_path):
    return LocalBackend(str(tmp_path / "test.db"))


def _group_messages(backend, group_id: str):
    return list(
        backend._db.execute(
            "SELECT id, content, meta FROM messages WHERE group_id = ?", (group_id,)
        )
    )


def test_seed_intro_messages_inserts_one_per_agent(tmp_path):
    backend = _backend(tmp_path)
    company_id = "test-co-1"
    agents = [
        {"name": "lead-1", "role": "Team Lead"},
        {"name": "eng-1", "role": "Engineer"},
        {"name": "qa-1", "role": "QA"},
    ]
    n = seed_intro_messages(company_id, agents, backend=backend)
    assert n == 3

    msgs = _group_messages(backend, f"company-{company_id}")
    assert len(msgs) == 3
    contents = [m["content"] for m in msgs]
    assert any("Team Lead" in c for c in contents)
    assert any("Engineer" in c for c in contents)
    assert any("QA" in c for c in contents)


def test_seed_intro_messages_empty_agents_noop(tmp_path):
    backend = _backend(tmp_path)
    assert seed_intro_messages("c1", [], backend=backend) == 0
    assert _group_messages(backend, "company-c1") == []


def test_create_company_from_template_seeds_intros(tmp_path):
    """The full spawn path should leave intros on the company channel."""
    backend = _backend(tmp_path)
    result = create_company_from_template(
        name="Intro Co",
        template_key="dev-team",
        purpose="Test that intros are seeded",
        backend=backend,
    )
    cid = result["company"]["id"]
    msgs = _group_messages(backend, f"company-{cid}")
    # dev-team has 4 agents; intros == agent count.
    assert len(msgs) == len(result["agents"])
    assert all(b'"kind": "intro"' in m["meta"].encode() if isinstance(m["meta"], str) else False for m in msgs)
