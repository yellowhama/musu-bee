"""Tests for /api/system/update endpoint — integration style."""
from __future__ import annotations

import os
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parent.parent))
sys.path.insert(0, str(Path(__file__).parent.parent.parent / "musu-core" / "src"))

os.environ.setdefault("MUSU_BRIDGE_TOKEN", "test-token")

from server import app
from fastapi.testclient import TestClient

client = TestClient(app, headers={"Authorization": "Bearer test-token"})


class TestSystemUpdate:
    def test_update_endpoint_returns_200(self):
        """system/update should return 200 with status info."""
        resp = client.post("/api/system/update")
        assert resp.status_code == 200
        data = resp.json()
        # Response has either new format (updated/before/after) or legacy (exit_code/output)
        assert "updated" in data or "exit_code" in data or "output" in data

    def test_update_endpoint_has_commit_info(self):
        """Response should contain commit hash or output."""
        resp = client.post("/api/system/update")
        data = resp.json()
        if "before" in data:
            assert len(data["before"]) >= 7  # short hash
        elif "output" in data:
            assert data["output"]  # non-empty

    def test_update_all_endpoint_exists(self):
        """system/update-all endpoint should be registered (not 404)."""
        # Note: actual call times out in test (makes real HTTP to peers).
        # Just verify route exists via OPTIONS or check openapi.
        from server import app
        routes = [r.path for r in app.routes if hasattr(r, 'path')]
        assert "/api/system/update-all" in routes
