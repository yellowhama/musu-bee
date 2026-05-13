"""Unit tests for fleet.store.RuntimeStore.

Each test gets a fresh on-disk SQLite via tmp_path so we exercise the
real v27 migration path, not a mock. RuntimeStore is meant to be the
only writer to node_runtimes; if these tests pass, route handlers
upstream cannot construct an inconsistent row.
"""

from __future__ import annotations

import time

import pytest

from musu_core.db import Database
from musu_core.fleet import RuntimeCapability, RuntimeHealth, RuntimeStatus, RuntimeStore


@pytest.fixture
def store(tmp_path):
    db = Database(str(tmp_path / "test.db"))
    return RuntimeStore(db)


def _cap(
    name: str,
    *,
    status: RuntimeStatus = RuntimeStatus.INSTALLED,
    health: RuntimeHealth = RuntimeHealth.HEALTHY,
    version: str = "1.0.0",
    detected_at: float = 1000.0,
    last_probe_attempt_at: float = 1000.0,
    state_changed_at: float = 1000.0,
    **kwargs,
) -> RuntimeCapability:
    return RuntimeCapability(
        name=name,
        status=status,
        health=health,
        version=version,
        detected_at=detected_at,
        last_probe_attempt_at=last_probe_attempt_at,
        state_changed_at=state_changed_at,
        **kwargs,
    )


# ── insert + read ────────────────────────────────────────────────────────────


def test_upsert_inserts_new_row(store):
    cap = _cap("claude_cli", version="2.1.0", binary_path="/usr/bin/claude")
    stored = store.upsert("nodeA", cap)
    assert stored.name == "claude_cli"
    assert stored.version == "2.1.0"
    assert stored.binary_path == "/usr/bin/claude"
    assert stored.status is RuntimeStatus.INSTALLED


def test_get_returns_none_for_missing_pair(store):
    assert store.get("nodeA", "claude_cli") is None


def test_list_for_node_returns_alphabetical(store):
    store.upsert("nodeA", _cap("gemini_cli"))
    store.upsert("nodeA", _cap("claude_cli"))
    store.upsert("nodeA", _cap("bridge"))
    out = store.list_for_node("nodeA")
    assert [c.name for c in out] == ["bridge", "claude_cli", "gemini_cli"]


def test_list_for_node_isolates_by_node(store):
    store.upsert("nodeA", _cap("claude_cli", version="1.0"))
    store.upsert("nodeB", _cap("claude_cli", version="2.0"))
    a = store.list_for_node("nodeA")
    b = store.list_for_node("nodeB")
    assert len(a) == 1 and a[0].version == "1.0"
    assert len(b) == 1 and b[0].version == "2.0"


# ── update behaviour ─────────────────────────────────────────────────────────


def test_upsert_overwrites_version_but_keeps_state_changed_at_when_state_stable(store):
    """K8s lastTransitionTime semantic: same status+health → keep transition timestamp."""
    store.upsert(
        "nodeA",
        _cap("claude_cli", version="2.0.0", state_changed_at=1000.0),
    )
    later = store.upsert(
        "nodeA",
        _cap(
            "claude_cli",
            version="2.1.0",
            detected_at=2000.0,
            last_probe_attempt_at=2000.0,
            state_changed_at=2000.0,  # caller asked for 2000, but state didn't change
        ),
    )
    assert later.version == "2.1.0"
    assert later.detected_at == 2000.0
    # state_changed_at should still be 1000 because (INSTALLED, HEALTHY) didn't flip.
    assert later.state_changed_at == 1000.0


def test_upsert_advances_state_changed_at_on_status_flip(store):
    store.upsert(
        "nodeA",
        _cap("claude_cli", status=RuntimeStatus.INSTALLED, state_changed_at=1000.0),
    )
    flipped = store.upsert(
        "nodeA",
        _cap(
            "claude_cli",
            status=RuntimeStatus.MISSING,
            health=RuntimeHealth.UNKNOWN,
            state_changed_at=2000.0,
            last_probe_attempt_at=2000.0,
        ),
    )
    assert flipped.status is RuntimeStatus.MISSING
    assert flipped.state_changed_at == 2000.0


def test_upsert_advances_state_changed_at_on_health_flip(store):
    store.upsert(
        "nodeA",
        _cap("ollama", health=RuntimeHealth.HEALTHY, state_changed_at=1000.0),
    )
    degraded = store.upsert(
        "nodeA",
        _cap(
            "ollama",
            health=RuntimeHealth.DEGRADED,
            state_changed_at=2000.0,
            last_probe_attempt_at=2000.0,
        ),
    )
    assert degraded.health is RuntimeHealth.DEGRADED
    assert degraded.state_changed_at == 2000.0


def test_upsert_preserves_operator_notes_across_probes(store):
    """notes is operator-authored; detection never overwrites it."""
    store.upsert("nodeA", _cap("claude_cli"))
    store.set_notes("nodeA", "claude_cli", "needs token rotation by 2026-06-01")
    reprobed = store.upsert(
        "nodeA",
        _cap("claude_cli", version="3.0.0", notes="ignore this"),
    )
    assert reprobed.notes == "needs token rotation by 2026-06-01"
    assert reprobed.version == "3.0.0"


# ── delete ───────────────────────────────────────────────────────────────────


def test_delete_node_removes_all_runtimes_for_that_node(store):
    store.upsert("nodeA", _cap("claude_cli"))
    store.upsert("nodeA", _cap("codex_cli"))
    store.upsert("nodeB", _cap("claude_cli"))

    removed = store.delete_node("nodeA")
    assert removed == 2
    assert store.list_for_node("nodeA") == []
    # nodeB untouched
    assert len(store.list_for_node("nodeB")) == 1


def test_delete_node_on_unknown_node_is_noop(store):
    assert store.delete_node("ghost") == 0
