"""Smoke tests for rootless-computer-control MCP server.

Covers the 5 required acceptance criteria plus G2 gate tests for MUS-680:
  - test_get_screen_size
  - test_take_screenshot
  - test_list_windows
  - test_pty_spawn_and_read
  - test_spy_ingest_and_get

G2 gate (pty round-trip, concurrency, cleanup semantics) is included per
CTO comment on MUS-683.
"""
import json
import os
import sys
import threading
import time
from pathlib import Path
from unittest.mock import patch

import pytest

# ---------------------------------------------------------------------------
# Import server module — add its directory to sys.path first
# ---------------------------------------------------------------------------
SERVER_DIR = Path(__file__).resolve().parent.parent
if str(SERVER_DIR) not in sys.path:
    sys.path.insert(0, str(SERVER_DIR))

import server  # noqa: E402

# ---------------------------------------------------------------------------
# Environment detection — used by skipif markers
# ---------------------------------------------------------------------------
_TERMINAL_ENGINE_PATH = Path(server.TERMINAL_ENGINE)
HAS_TERMINAL_ENGINE = _TERMINAL_ENGINE_PATH.exists()
HAS_DISPLAY = bool(os.environ.get("DISPLAY") or os.environ.get("WAYLAND_DISPLAY"))
HAS_WMCTRL = Path(server.WMCTRL).exists()

# ---------------------------------------------------------------------------
# Spy log (pure in-memory) — always runs
# ---------------------------------------------------------------------------


def test_spy_ingest_and_get():
    """Round-trip: ingest then retrieve."""
    server.spy_ingest_log("smoke_source", "hello_smoke")
    assert server.spy_get_snapshot("smoke_source") == "hello_smoke"


def test_spy_get_missing_source_returns_empty():
    assert server.spy_get_snapshot("__nonexistent_smoke_xyz__") == ""


def test_spy_ingest_overwrites_previous():
    server.spy_ingest_log("overwrite_source", "first")
    server.spy_ingest_log("overwrite_source", "second")
    assert server.spy_get_snapshot("overwrite_source") == "second"


# ---------------------------------------------------------------------------
# Screen size — requires WSLg display
# ---------------------------------------------------------------------------


@pytest.mark.skipif(not HAS_DISPLAY, reason="No DISPLAY/WAYLAND_DISPLAY available")
def test_get_screen_size():
    result = server.get_screen_size()
    data = json.loads(result)
    assert "width" in data, "missing 'width' key"
    assert "height" in data, "missing 'height' key"
    assert data["width"] > 0, f"width must be positive, got {data['width']}"
    assert data["height"] > 0, f"height must be positive, got {data['height']}"


# ---------------------------------------------------------------------------
# Screenshot — helper is mocked to avoid requiring scrot-helper.sh
# ---------------------------------------------------------------------------


def _fake_capture_with_helper(temp_path: Path) -> None:
    """Write a synthetic 1920×1080 PNG so PIL can open it."""
    from PIL import Image as PILImage

    img = PILImage.new("RGB", (1920, 1080), color=(0, 100, 200))
    img.save(str(temp_path))


def test_take_screenshot(tmp_path, monkeypatch):
    monkeypatch.setattr(server, "_capture_with_helper", _fake_capture_with_helper)
    monkeypatch.setattr(server, "SCREENSHOT_DIR", tmp_path)

    result = server.take_screenshot()

    # FastMCP Image wraps a file path; verify the file was created
    assert result is not None
    saved = list(tmp_path.glob("screenshot-*.png"))
    assert len(saved) == 1, f"Expected 1 screenshot file, found: {saved}"


def test_take_screenshot_region(tmp_path, monkeypatch):
    monkeypatch.setattr(server, "_capture_with_helper", _fake_capture_with_helper)
    monkeypatch.setattr(server, "SCREENSHOT_DIR", tmp_path)

    result = server.take_screenshot(x=0, y=0, width=800, height=600)
    assert result is not None
    saved = list(tmp_path.glob("screenshot-*.png"))
    assert len(saved) == 1


# ---------------------------------------------------------------------------
# List windows — requires wmctrl + X11
# ---------------------------------------------------------------------------


@pytest.mark.skipif(
    not HAS_WMCTRL or not HAS_DISPLAY,
    reason="wmctrl binary or display not available",
)
def test_list_windows():
    result = server.list_windows()
    windows = json.loads(result)
    assert isinstance(windows, list), "list_windows must return a JSON array"
    if windows:
        w = windows[0]
        for key in ("id", "x", "y", "width", "height"):
            assert key in w, f"window dict missing key '{key}'"


# ---------------------------------------------------------------------------
# PTY — requires musu-terminal-engine binary
# ---------------------------------------------------------------------------


@pytest.fixture()
def cleanup_all_pty_sessions():
    """Yield then clean up any PTY sessions left open by a test."""
    yield
    with server._PTY_SESSIONS_LOCK:
        session_ids = list(server._PTY_SESSIONS.keys())
    for sid in session_ids:
        try:
            server.pty_cleanup(sid)
        except Exception:
            pass


@pytest.mark.skipif(
    not HAS_TERMINAL_ENGINE, reason="musu-terminal-engine binary not found"
)
def test_pty_spawn_and_read(cleanup_all_pty_sessions):
    """Spawn a bash session; session_id is a UUID and appears in the store."""
    session_id = server.pty_spawn("bash")
    assert isinstance(session_id, str)
    assert len(session_id) == 36  # UUID4 format
    with server._PTY_SESSIONS_LOCK:
        assert session_id in server._PTY_SESSIONS


@pytest.mark.skipif(
    not HAS_TERMINAL_ENGINE, reason="musu-terminal-engine binary not found"
)
def test_pty_round_trip(cleanup_all_pty_sessions):
    """G2 gate: spawn → write → read must echo the payload back."""
    session_id = server.pty_spawn("bash")
    server.pty_write(session_id, "echo hello_pty_round_trip\n")

    output = ""
    deadline = time.time() + 4.0
    while time.time() < deadline and "hello_pty_round_trip" not in output:
        chunk = server.pty_read(session_id, timeout=1.0)
        output += chunk

    assert "hello_pty_round_trip" in output, (
        f"PTY round-trip failed: expected echo output, got: {output!r}"
    )
    result = server.pty_cleanup(session_id)
    assert "cleaned up" in result


@pytest.mark.skipif(
    not HAS_TERMINAL_ENGINE, reason="musu-terminal-engine binary not found"
)
def test_pty_cleanup_removes_session(cleanup_all_pty_sessions):
    """After cleanup, pty_read must raise ValueError for the same session_id."""
    session_id = server.pty_spawn("bash")
    server.pty_cleanup(session_id)
    with pytest.raises(ValueError, match="Unknown session_id"):
        server.pty_read(session_id)


@pytest.mark.skipif(
    not HAS_TERMINAL_ENGINE, reason="musu-terminal-engine binary not found"
)
def test_pty_concurrent_writes(cleanup_all_pty_sessions):
    """Concurrent pty_write from 3 threads must not raise (lock safety)."""
    session_id = server.pty_spawn("bash")
    errors: list[Exception] = []

    def writer():
        try:
            for _ in range(3):
                server.pty_write(session_id, "echo ping\n")
                time.sleep(0.01)
        except Exception as exc:
            errors.append(exc)

    threads = [threading.Thread(target=writer) for _ in range(3)]
    for t in threads:
        t.start()
    for t in threads:
        t.join(timeout=5)
    assert errors == [], f"Concurrent pty_write raised: {errors}"
    server.pty_cleanup(session_id)
