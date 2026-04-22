"""test_wol.py — Wake-on-LAN 단위 및 통합 테스트 (Phase 62)."""
from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient


# ---------------------------------------------------------------------------
# F62-01: wol.py send_magic_packet 단위 테스트
# ---------------------------------------------------------------------------

def test_send_magic_packet_valid():
    """유효한 콜론 구분 MAC → True 반환, UDP sendto 호출."""
    from wol import send_magic_packet

    with patch("socket.socket") as mock_sock_cls:
        mock_sock = MagicMock()
        mock_sock_cls.return_value.__enter__ = lambda s: mock_sock
        mock_sock_cls.return_value.__exit__ = MagicMock(return_value=False)

        result = send_magic_packet("aa:bb:cc:dd:ee:ff")

    assert result is True


def test_send_magic_packet_hyphen():
    """하이픈 구분 MAC 형식도 True 반환."""
    from wol import send_magic_packet

    with patch("socket.socket") as mock_sock_cls:
        mock_sock = MagicMock()
        mock_sock_cls.return_value.__enter__ = lambda s: mock_sock
        mock_sock_cls.return_value.__exit__ = MagicMock(return_value=False)

        result = send_magic_packet("AA-BB-CC-DD-EE-FF")

    assert result is True


def test_send_magic_packet_invalid():
    """잘못된 MAC → False 반환, 소켓 열지 않음."""
    from wol import send_magic_packet

    result = send_magic_packet("not-a-mac")
    assert result is False

    result = send_magic_packet("gg:hh:ii:jj:kk:ll")
    assert result is False

    result = send_magic_packet("")
    assert result is False


def test_send_magic_packet_payload():
    """UDP sendto payload = 0xFF×6 + MAC×16 = 102 바이트."""
    from wol import send_magic_packet

    captured_payload = {}

    def fake_sendto(data, addr):
        captured_payload["data"] = data
        captured_payload["addr"] = addr

    with patch("socket.socket") as mock_sock_cls:
        mock_sock = MagicMock()
        mock_sock.sendto.side_effect = fake_sendto
        mock_sock_cls.return_value.__enter__ = lambda s: mock_sock
        mock_sock_cls.return_value.__exit__ = MagicMock(return_value=False)

        send_magic_packet("aa:bb:cc:dd:ee:ff")

    payload = captured_payload["data"]
    assert len(payload) == 102, f"Expected 102 bytes, got {len(payload)}"
    assert payload[:6] == b"\xff" * 6
    mac_bytes = bytes.fromhex("aabbccddeeff")
    assert payload[6:] == mac_bytes * 16


# ---------------------------------------------------------------------------
# F62-02: POST /api/wol 통합 테스트
# ---------------------------------------------------------------------------

@pytest.fixture()
def client():
    from server import app
    return TestClient(app, raise_server_exceptions=False)


AUTH = {"Authorization": "Bearer test-token"}


def test_api_wol_valid(client):
    """유효한 MAC → 200 {ok: true}."""
    with patch("wol.send_magic_packet", return_value=True):
        resp = client.post(
            "/api/wol",
            json={"mac_address": "aa:bb:cc:dd:ee:ff"},
            headers=AUTH,
        )
    assert resp.status_code == 200
    data = resp.json()
    assert data["ok"] is True


def test_api_wol_invalid_mac(client):
    """잘못된 MAC → 200 {ok: false, error: 'Invalid MAC address format'}."""
    resp = client.post(
        "/api/wol",
        json={"mac_address": "bad"},
        headers=AUTH,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["ok"] is False
    assert data.get("error") == "Invalid MAC address format"


def test_api_wol_no_auth(client):
    """인증 헤더 없이 POST /api/wol → 401."""
    resp = client.post("/api/wol", json={"mac_address": "aa:bb:cc:dd:ee:ff"})
    assert resp.status_code == 401


# ---------------------------------------------------------------------------
# F62-04: POST /api/wol/node/{name} 통합 테스트
# ---------------------------------------------------------------------------

def _make_node_info(mac: str = "aa:bb:cc:dd:ee:ff", broadcast: str = "255.255.255.255"):
    """mesh_router.NodeInfo 생성 헬퍼."""
    from mesh_router import NodeInfo
    return NodeInfo(
        name="test-node",
        url="http://localhost:8070",
        mac_address=mac,
        broadcast_ip=broadcast,
    )


def test_api_wol_node_valid(client):
    """노드에 mac_address 있으면 → 200 {ok: true}."""
    node = _make_node_info()

    with patch("server.mesh_router") as mock_mod:
        mock_mod.node_info.return_value = node
        with patch("wol.send_magic_packet", return_value=True):
            resp = client.post("/api/wol/node/test-node", headers=AUTH)

    assert resp.status_code == 200
    assert resp.json()["ok"] is True


def test_api_wol_node_no_mac(client):
    """노드에 mac_address 없으면 → 422."""
    node = _make_node_info(mac="")

    with patch("server.mesh_router") as mock_mod:
        mock_mod.node_info.return_value = node
        resp = client.post("/api/wol/node/test-node", headers=AUTH)

    assert resp.status_code == 422
    assert "mac_address" in resp.json()["detail"].lower()


def test_api_wol_node_not_found(client):
    """노드 이름 없으면 → 404."""
    with patch("server.mesh_router") as mock_mod:
        mock_mod.node_info.return_value = None
        resp = client.post("/api/wol/node/nonexistent", headers=AUTH)

    assert resp.status_code == 404
