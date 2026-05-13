"""v18.A Phase 2 — integration tests for /api/nodes/{name}/runtimes.

We mount the FastAPI app via TestClient and patch the detector so the
test never shells out to a real CLI. Persistence goes through the real
v27 migration and a temp on-disk SQLite (created when the bridge starts).
"""

from __future__ import annotations

import os
import sys
from pathlib import Path
from unittest.mock import patch

import pytest

sys.path.insert(0, str(Path(__file__).parent.parent))

# server.py refuses to start without MUSU_BRIDGE_TOKEN.
os.environ.setdefault("MUSU_BRIDGE_TOKEN", "test-token")

from fastapi.testclient import TestClient  # noqa: E402

from musu_core.fleet import (  # noqa: E402
    RuntimeCapability,
    RuntimeHealth,
    RuntimeStatus,
)
from server import app  # noqa: E402
from config import get_config  # noqa: E402

client = TestClient(app, headers={"Authorization": "Bearer test-token"})


_NODE = get_config().node_name


def _cap(name: str, *, status="installed", health="healthy", version="1.0.0"):
    return RuntimeCapability(
        name=name,
        status=RuntimeStatus(status),
        health=RuntimeHealth(health),
        version=version,
        binary_path=f"/usr/bin/{name}",
        detection_method="subprocess",
        detected_at=1000.0,
        last_probe_attempt_at=1000.0,
        state_changed_at=1000.0,
    )


# ── GET ──────────────────────────────────────────────────────────────────────


def test_list_runtimes_empty_for_unknown_node():
    """An unknown node has no rows — we don't pretend they exist."""
    r = client.get("/api/nodes/never-seen-this-host/runtimes")
    assert r.status_code == 200
    body = r.json()
    assert body["node_name"] == "never-seen-this-host"
    assert body["runtimes"] == []
    assert body["total"] == 0


# ── POST probe ───────────────────────────────────────────────────────────────


def test_probe_self_persists_runtimes():
    """A self-probe upserts whatever detect_all_runtimes returns."""
    fake_caps = {
        "bridge": _cap("bridge"),
        "claude_cli": _cap("claude_cli", version="2.1.0"),
        "ollama": _cap("ollama", status="missing", health="unknown", version=""),
    }

    async def _fake_detect(*, timeout: float = 5.0):
        return fake_caps

    with patch("runtime_routes.detect_all_runtimes", _fake_detect):
        r = client.post(f"/api/nodes/{_NODE}/runtimes/probe")

    assert r.status_code == 200
    body = r.json()
    assert body["node_name"] == _NODE
    assert body["detected"] == 3
    names = {row["name"] for row in body["runtimes"]}
    assert names == {"bridge", "claude_cli", "ollama"}

    # And the GET reflects them.
    r2 = client.get(f"/api/nodes/{_NODE}/runtimes")
    assert r2.status_code == 200
    body2 = r2.json()
    assert body2["total"] >= 3
    by_name = {row["name"]: row for row in body2["runtimes"]}
    assert by_name["claude_cli"]["version"] == "2.1.0"
    assert by_name["claude_cli"]["status"] == "installed"
    assert by_name["ollama"]["status"] == "missing"


def test_probe_remote_node_returns_400():
    """Phase 2 only knows how to probe self; remote names get a clear 400."""
    r = client.post("/api/nodes/some-other-node/runtimes/probe")
    assert r.status_code == 400
    assert "not yet supported" in r.json()["detail"].lower()
    assert "phase 3" in r.json()["detail"].lower()


# ── status_changed_at semantics through the route ────────────────────────────


def test_repeated_probe_keeps_state_changed_at_when_stable():
    """Two identical probes — state_changed_at should not advance."""
    fake_caps = {
        "claude_cli": _cap("claude_cli", version="2.1.0"),
    }

    async def _fake(*, timeout: float = 5.0):
        return fake_caps

    with patch("runtime_routes.detect_all_runtimes", _fake):
        r1 = client.post(f"/api/nodes/{_NODE}/runtimes/probe").json()
        # Bump the detected_at but keep status+health the same.
        fake_caps["claude_cli"] = _cap("claude_cli", version="2.1.1")
        fake_caps["claude_cli"].detected_at = 2000.0
        fake_caps["claude_cli"].last_probe_attempt_at = 2000.0
        fake_caps["claude_cli"].state_changed_at = 2000.0
        r2 = client.post(f"/api/nodes/{_NODE}/runtimes/probe").json()

    first = next(c for c in r1["runtimes"] if c["name"] == "claude_cli")
    second = next(c for c in r2["runtimes"] if c["name"] == "claude_cli")
    assert second["version"] == "2.1.1"
    assert second["state_changed_at"] == first["state_changed_at"]
