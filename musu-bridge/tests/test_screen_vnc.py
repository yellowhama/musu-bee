"""Tests for screen VNC token/lifecycle logic (screen_vnc.py)."""
from __future__ import annotations

import os
import sys
import time

os.environ.setdefault("MUSU_BRIDGE_TOKEN", "test-token")
os.environ.setdefault("MUSU_DISABLE_RATE_LIMIT", "1")

# Ensure musu-bridge root is on sys.path
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

import screen_vnc


# ── Token tests ───────────────────────────────────────────────────────────────


def test_issue_returns_nonempty_string():
    tok = screen_vnc.issue_token()
    assert isinstance(tok, str) and len(tok) > 10


def test_issue_and_consume_succeeds():
    tok = screen_vnc.issue_token()
    assert screen_vnc.consume_token(tok) is True


def test_token_is_single_use():
    tok = screen_vnc.issue_token()
    assert screen_vnc.consume_token(tok) is True
    assert screen_vnc.consume_token(tok) is False


def test_invalid_token_rejected():
    assert screen_vnc.consume_token("not-a-real-token") is False


def test_garbage_token_rejected():
    assert screen_vnc.consume_token("") is False
    assert screen_vnc.consume_token("garbage!!") is False


def test_expired_token_rejected():
    tok = screen_vnc.issue_token()
    # Force expiry to past
    screen_vnc._tokens[tok] = time.time() - 1
    assert screen_vnc.consume_token(tok) is False


def test_multiple_tokens_independent():
    tok_a = screen_vnc.issue_token()
    tok_b = screen_vnc.issue_token()
    assert screen_vnc.consume_token(tok_a) is True
    # tok_b still valid
    assert screen_vnc.consume_token(tok_b) is True


def test_purge_removes_expired():
    tok = screen_vnc.issue_token()
    screen_vnc._tokens[tok] = time.time() - 1
    screen_vnc._purge_expired_tokens()
    assert tok not in screen_vnc._tokens


# ── Lifecycle tests (no real x11vnc) ─────────────────────────────────────────


def test_vnc_status_when_stopped():
    screen_vnc.stop_vnc()
    status = screen_vnc.get_vnc_status()
    assert status["running"] is False
    assert status["pid"] is None
    assert "port" in status


def test_is_vnc_running_false_when_stopped():
    screen_vnc.stop_vnc()
    assert screen_vnc.is_vnc_running() is False


def test_stop_vnc_is_idempotent():
    # Stop twice — should not raise
    screen_vnc.stop_vnc()
    result = screen_vnc.stop_vnc()
    assert result["running"] is False


def test_start_vnc_raises_if_no_x11vnc(monkeypatch):
    import shutil
    monkeypatch.setattr(shutil, "which", lambda _cmd: None)
    try:
        screen_vnc.start_vnc()
        assert False, "should have raised RuntimeError"
    except RuntimeError as exc:
        assert "x11vnc not found" in str(exc)


def test_try_apt_install_returns_false_when_no_apt(monkeypatch):
    # Patch shutil.which inside screen_vnc's own module namespace
    monkeypatch.setattr(screen_vnc.shutil, "which", lambda _cmd: None)
    result = screen_vnc._try_apt_install(["xvfb"])
    assert result is False


def test_try_apt_install_returns_false_when_no_sudo_and_not_root(monkeypatch):
    monkeypatch.setattr(screen_vnc.shutil, "which", lambda cmd: "/usr/bin/apt-get" if cmd == "apt-get" else None)
    monkeypatch.setattr(screen_vnc.os, "getuid", lambda: 1000)  # not root, no sudo
    result = screen_vnc._try_apt_install(["xvfb"])
    assert result is False


def test_try_apt_install_returns_true_when_apt_succeeds_as_root(monkeypatch):
    # As root, apt-get runs without sudo and returns 0
    monkeypatch.setattr(screen_vnc.shutil, "which", lambda cmd: "/usr/bin/apt-get" if cmd == "apt-get" else None)
    monkeypatch.setattr(screen_vnc.os, "getuid", lambda: 0)
    calls = []
    def _fake_run(cmd, **kw):
        calls.append(cmd)
        return type("R", (), {"returncode": 0, "stderr": b""})()
    monkeypatch.setattr(screen_vnc.subprocess, "run", _fake_run)
    result = screen_vnc._try_apt_install(["xvfb"])
    assert result is True
    # Must not have used sudo when running as root
    assert calls and calls[0][0] == "apt-get"


# ── HTTP endpoint smoke tests ─────────────────────────────────────────────────

from fastapi.testclient import TestClient
from server import app

_HEADERS = {"Authorization": "Bearer test-token"}
_CLIENT = TestClient(app, raise_server_exceptions=False)


def test_vnc_status_endpoint():
    r = _CLIENT.get("/api/screen/vnc/status", headers=_HEADERS)
    assert r.status_code == 200
    data = r.json()
    assert "running" in data
    assert "port" in data


def test_vnc_token_endpoint():
    r = _CLIENT.get("/api/screen/vnc/token", headers=_HEADERS)
    assert r.status_code == 200
    data = r.json()
    assert "token" in data
    assert "launcher_path" in data
    assert data["launcher_path"].startswith("/screen/novnc/launcher.html?token=")


def test_vnc_token_is_unique():
    r1 = _CLIENT.get("/api/screen/vnc/token", headers=_HEADERS)
    r2 = _CLIENT.get("/api/screen/vnc/token", headers=_HEADERS)
    assert r1.json()["token"] != r2.json()["token"]


def test_vnc_stop_endpoint():
    r = _CLIENT.post("/api/screen/vnc/stop", headers=_HEADERS)
    assert r.status_code == 200
    assert r.json()["running"] is False


def test_vnc_start_endpoint_no_x11vnc():
    # x11vnc is probably not installed in test env
    r = _CLIENT.post("/api/screen/vnc/start", headers=_HEADERS)
    # Either 503 (not installed) or 200 (installed and running)
    assert r.status_code in (200, 503)


def test_vnc_endpoints_require_auth():
    for path, method in [
        ("/api/screen/vnc/status", "GET"),
        ("/api/screen/vnc/token", "GET"),
        ("/api/screen/vnc/start", "POST"),
        ("/api/screen/vnc/stop", "POST"),
    ]:
        r = _CLIENT.request(method, path)
        assert r.status_code in (401, 403), f"{method} {path} should require auth"


def test_novnc_launcher_is_served():
    r = _CLIENT.get("/screen/novnc/launcher.html")
    assert r.status_code == 200
    assert "RFB" in r.text or "rfb.js" in r.text
