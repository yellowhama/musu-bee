"""Tests for HostnameGuard middleware."""
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from hostname_guard import HostnameGuard, _host_allowed


# ---------------------------------------------------------------------------
# Unit tests for _host_allowed
# ---------------------------------------------------------------------------

ALLOWED = frozenset({"localhost", "127.0.0.1", "musu.pro"})


def test_localhost_allowed():
    assert _host_allowed("localhost", ALLOWED) is True


def test_localhost_with_port_allowed():
    assert _host_allowed("localhost:8070", ALLOWED) is True


def test_127_allowed():
    assert _host_allowed("127.0.0.1:8070", ALLOWED) is True


def test_musu_pro_allowed():
    assert _host_allowed("musu.pro", ALLOWED) is True


def test_tailscale_cgnat_allowed():
    assert _host_allowed("100.121.211.106", ALLOWED) is True
    assert _host_allowed("100.64.0.1", ALLOWED) is True


def test_any_ipv4_allowed():
    # All IPv4 addresses are allowed — IPs cannot participate in DNS rebinding
    assert _host_allowed("100.0.0.1", ALLOWED) is True
    assert _host_allowed("192.168.1.100", ALLOWED) is True
    assert _host_allowed("10.0.0.1", ALLOWED) is True


def test_unknown_host_blocked():
    assert _host_allowed("evil.attacker.com", ALLOWED) is False


def test_empty_host_blocked():
    assert _host_allowed("", ALLOWED) is False


# ---------------------------------------------------------------------------
# Integration tests via TestClient
# ---------------------------------------------------------------------------


def _make_app() -> FastAPI:
    app = FastAPI()
    app.add_middleware(HostnameGuard)

    @app.get("/health")
    async def health():
        return {"status": "ok"}

    @app.get("/api/test")
    async def test_route():
        return {"ok": True}

    return app


def test_health_always_passes():
    client = TestClient(_make_app(), raise_server_exceptions=True)
    # Health bypass regardless of host
    r = client.get("/health", headers={"host": "evil.attacker.com"})
    assert r.status_code == 200


def test_allowed_host_passes():
    client = TestClient(_make_app(), raise_server_exceptions=True)
    r = client.get("/api/test", headers={"host": "localhost:8070"})
    assert r.status_code == 200


def test_unknown_host_rejected():
    client = TestClient(_make_app(), raise_server_exceptions=True)
    r = client.get("/api/test", headers={"host": "evil.attacker.com"})
    assert r.status_code == 400
    assert "not allowed" in r.json()["detail"]


def test_tailscale_host_passes():
    client = TestClient(_make_app(), raise_server_exceptions=True)
    r = client.get("/api/test", headers={"host": "100.121.211.106:8070"})
    assert r.status_code == 200
