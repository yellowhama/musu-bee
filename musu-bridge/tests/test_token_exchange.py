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


class TestAcceptPeer:
    def test_accept_peer_returns_our_token(self):
        """accept-peer should return our bridge token."""
        resp = client.post("/api/nodes/accept-peer", json={
            "name": "test-peer",
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
            "name": "new-peer",
            "url": "http://10.0.0.2:8070",
            "token": "their-token",
        })
        # Should NOT return 401 — this endpoint is in bypass_path_prefixes
        assert resp.status_code == 200

    def test_accept_peer_empty_token(self):
        """accept-peer works even with empty token (just registers the node)."""
        resp = client.post("/api/nodes/accept-peer", json={
            "name": "anon-peer",
            "url": "http://10.0.0.3:8070",
            "token": "",
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["accepted"] is True
