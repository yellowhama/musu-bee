"""Tests for /api/nodes/accept-peer token exchange endpoint."""
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


_TEST_PEERS = ["test-peer-tx", "new-peer-tx", "anon-peer-tx"]


@pytest.fixture(autouse=True)
def cleanup_test_peers():
    """Remove test peers from mesh router after each test."""
    yield
    try:
        import mesh_router
        router = mesh_router.get_mesh_router()
        for name in _TEST_PEERS:
            router._node_urls.pop(name, None)
            router._node_tokens.pop(name, None)
            router._agent_nodes = {k: v for k, v in router._agent_nodes.items() if v != name}
    except Exception:
        pass


class TestAcceptPeer:
    def test_accept_peer_returns_our_token(self):
        """accept-peer should return our bridge token."""
        resp = client.post("/api/nodes/accept-peer", json={
            "name": "test-peer-tx",
            "url": "http://10.0.0.1:8070",
            "token": "peer-secret-token",
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["accepted"] is True
        assert "token" in data
        assert data["token"]  # non-empty
        assert "name" in data  # our node name

    def test_accept_peer_no_auth_required(self):
        """accept-peer bypasses auth (first contact, peer has no token yet)."""
        no_auth_client = TestClient(app)  # no Authorization header
        resp = no_auth_client.post("/api/nodes/accept-peer", json={
            "name": "new-peer-tx",
            "url": "http://10.0.0.2:8070",
            "token": "their-token",
        })
        # Should NOT return 401 — this endpoint is in bypass_path_prefixes
        assert resp.status_code == 200

    def test_accept_peer_empty_token(self):
        """accept-peer works even with empty token (just registers the node)."""
        resp = client.post("/api/nodes/accept-peer", json={
            "name": "anon-peer-tx",
            "url": "http://10.0.0.3:8070",
            "token": "",
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["accepted"] is True
