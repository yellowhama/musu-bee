"""VNC lifecycle manager and WebSocket proxy for musu-bridge screen feature.

Provides:
  - x11vnc process management (start/stop/status)
  - One-time WebSocket token store (issue/consume, 60s TTL)
  - Async WebSocket ↔ TCP VNC proxy (RFB over WebSocket)
"""
from __future__ import annotations

import asyncio
import os
import secrets
import shutil
import signal
import subprocess
import time
from collections import OrderedDict
from typing import Optional

from fastapi import WebSocket, WebSocketDisconnect

# ── Configuration ─────────────────────────────────────────────────────────────

VNC_PORT = int(os.getenv("MUSU_VNC_PORT", "5900"))


def _try_apt_install(packages: list[str]) -> bool:
    """Best-effort apt-get install for missing screen/VNC dependencies.

    Returns True if apt-get ran without error, False otherwise.
    Tries without sudo when running as root; uses sudo otherwise.
    """
    if not shutil.which("apt-get"):
        return False
    # Running as root — no sudo needed (and sudo may not exist in containers)
    cmd_prefix = [] if os.getuid() == 0 else (["sudo"] if shutil.which("sudo") else [])
    if not cmd_prefix and os.getuid() != 0:
        return False  # Not root and no sudo available
    try:
        result = subprocess.run(
            cmd_prefix + ["apt-get", "install", "-y", "-q"] + packages,
            timeout=120,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.PIPE,
            check=False,
        )
        return result.returncode == 0
    except (subprocess.TimeoutExpired, OSError):
        return False


TOKEN_TTL = 60  # seconds

# ── x11vnc lifecycle ──────────────────────────────────────────────────────────

_vnc_proc: Optional[subprocess.Popen] = None  # type: ignore[type-arg]


def is_vnc_running() -> bool:
    """Return True if x11vnc subprocess is alive."""
    return _vnc_proc is not None and _vnc_proc.poll() is None


def get_vnc_status() -> dict:
    """Return current VNC server status dict."""
    if is_vnc_running():
        return {"running": True, "pid": _vnc_proc.pid, "port": VNC_PORT}  # type: ignore[union-attr]
    return {"running": False, "pid": None, "port": VNC_PORT}


_xvfb_proc: Optional[subprocess.Popen] = None  # type: ignore[type-arg]
_xvfb_display: str = ":99"  # tracks the display Xvfb was started on
_vnc_restart_count: int = 0
_VNC_MAX_RESTARTS: int = 3


def _pick_free_display(start: int = 99) -> int:
    """Return lowest display number >= start with no running X server."""
    for num in range(start, start + 10):
        lock = f"/tmp/.X{num}-lock"
        if not os.path.exists(lock):
            return num
        # Lock exists — check if owner process is still alive
        try:
            pid = int(open(lock).read().strip())
            os.kill(pid, 0)  # raises OSError if pid doesn't exist
        except (OSError, ValueError):
            return num  # Stale lock — display is safe to reuse
    return start  # Fallback: try start and let Xvfb fail with a clear error


def _detect_display() -> tuple[str, str]:
    """Detect or create an X11 display. Returns (display, xauthority).

    Priority:
    1. Existing DISPLAY env var with working X11
    2. Find X lock files (/tmp/.X*-lock)
    3. Start Xvfb virtual framebuffer (WSL2/headless)
    """
    import glob

    # Check for Wayland (not supported by x11vnc)
    if os.environ.get("WAYLAND_DISPLAY") or os.environ.get("XDG_SESSION_TYPE") == "wayland":
        # Wayland detected — fall through to Xvfb
        pass
    else:
        # Try existing DISPLAY
        display = os.environ.get("DISPLAY", "")
        if display:
            try:
                subprocess.run(
                    ["xdpyinfo", "-display", display],
                    stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                    timeout=2,
                )
                # Find Xauthority
                for candidate in [
                    os.path.expanduser("~/.Xauthority"),
                    f"/run/user/{os.getuid()}/gdm/Xauthority",
                ]:
                    if os.path.exists(candidate):
                        return display, candidate
                return display, ""
            except (subprocess.TimeoutExpired, FileNotFoundError, OSError):
                pass

        # Try X lock files
        locks = sorted(glob.glob("/tmp/.X*-lock"))
        for lock in locks:
            num = lock.replace("/tmp/.X", "").replace("-lock", "")
            d = f":{num}"
            try:
                subprocess.run(
                    ["xdpyinfo", "-display", d],
                    stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                    timeout=2,
                )
                return d, ""
            except (subprocess.TimeoutExpired, FileNotFoundError, OSError):
                continue

    # No X11 display found — start Xvfb (virtual framebuffer)
    global _xvfb_proc, _xvfb_display
    if _xvfb_proc is None or _xvfb_proc.poll() is not None:
        install_attempted = False
        if not shutil.which("Xvfb"):
            install_attempted = True
            _try_apt_install(["xvfb", "x11vnc", "x11-utils"])
        if not shutil.which("Xvfb"):
            hint = (
                "Auto-install was attempted but failed (check sudo/apt permissions). "
                if install_attempted
                else ""
            )
            raise RuntimeError(
                f"No X11 display and Xvfb not found. {hint}"
                "Install with: sudo apt install xvfb"
            )
        # Pick a free display number, cleaning up stale lock files if needed
        display_num = _pick_free_display()
        xvfb_display = f":{display_num}"
        lock = f"/tmp/.X{display_num}-lock"
        if os.path.exists(lock):
            try:
                os.unlink(lock)
            except OSError:
                pass
        _xvfb_proc = subprocess.Popen(
            ["Xvfb", xvfb_display, "-screen", "0", "1920x1080x24"],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        )
        # Wait up to 3s for Xvfb to be ready
        for _ in range(30):
            time.sleep(0.1)
            if _xvfb_proc.poll() is not None:
                raise RuntimeError(
                    f"Xvfb exited immediately on display {xvfb_display}. "
                    "Check that no other process owns that display."
                )
            try:
                result = subprocess.run(
                    ["xdpyinfo", "-display", xvfb_display],
                    stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                    timeout=1,
                )
                if result.returncode == 0:
                    break
            except (subprocess.TimeoutExpired, FileNotFoundError, OSError):
                pass
        else:
            _xvfb_proc.kill()
            _xvfb_proc = None
            raise RuntimeError(
                f"Xvfb started but display {xvfb_display} not ready after 3s. "
                "Install x11-utils for diagnostics: sudo apt install x11-utils"
            )
        _xvfb_display = xvfb_display
        return _xvfb_display, ""
    return _xvfb_display, ""


def start_vnc(display: str = "", xauthority: str = "") -> dict:
    """Start x11vnc on localhost:VNC_PORT.

    Auto-detects display (X11 → Xvfb fallback for WSL2/headless).
    Returns status dict. Raises RuntimeError if x11vnc binary not found.
    """
    global _vnc_proc, _vnc_restart_count
    if is_vnc_running():
        return {"ok": True, "already_running": True, **get_vnc_status()}
    if not shutil.which("x11vnc"):
        _try_apt_install(["x11vnc", "xvfb", "x11-utils"])
    if not shutil.which("x11vnc"):
        raise RuntimeError(
            "x11vnc not found — install with: sudo apt install x11vnc"
        )

    # Auto-detect display if not provided
    if not display:
        display, xauthority = _detect_display()

    env = os.environ.copy()
    env["DISPLAY"] = display
    if xauthority:
        env["XAUTHORITY"] = xauthority
    _vnc_proc = subprocess.Popen(
        [
            "x11vnc",
            "-display", display,
            "-localhost",
            "-nopw",
            "-rfbport", str(VNC_PORT),
            "-forever",
            "-shared",
            "-noxdamage",
            "-noxfixes",
            "-quiet",
        ],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        env=env,
    )
    # Wait up to 2s for x11vnc to start listening
    import socket
    for _ in range(20):
        try:
            with socket.create_connection(("127.0.0.1", VNC_PORT), timeout=0.1):
                _vnc_restart_count = 0  # Reset on successful start
                break
        except OSError:
            time.sleep(0.1)

    # Check if VNC actually started
    if not is_vnc_running():
        return {
            "ok": False,
            "already_running": False,
            "running": False,
            "error": "x11vnc exited immediately. Likely no X11 display available.",
        }

    return {"ok": True, "already_running": False, **get_vnc_status()}


def ensure_vnc_running(display: str = "", xauthority: str = "") -> dict:
    """Health check: restart VNC if crashed (max 3 restarts)."""
    global _vnc_restart_count
    if is_vnc_running():
        return get_vnc_status()
    if _vnc_restart_count >= _VNC_MAX_RESTARTS:
        return {"running": False, "error": f"VNC crashed {_vnc_restart_count} times, not restarting"}
    _vnc_restart_count += 1
    return start_vnc(display, xauthority)


def stop_vnc() -> dict:
    """Stop x11vnc subprocess if running."""
    global _vnc_proc
    if _vnc_proc is not None and _vnc_proc.poll() is None:
        _vnc_proc.send_signal(signal.SIGTERM)
        try:
            _vnc_proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            _vnc_proc.kill()
    _vnc_proc = None
    return {"ok": True, "running": False}


# ── One-time token store ──────────────────────────────────────────────────────

_tokens: OrderedDict[str, float] = OrderedDict()  # token → expiry_epoch


def issue_token() -> str:
    """Generate and store a one-time WebSocket token (60s TTL)."""
    _purge_expired_tokens()
    tok = secrets.token_urlsafe(32)
    _tokens[tok] = time.time() + TOKEN_TTL
    return tok


def consume_token(token: str) -> bool:
    """Return True and delete token if valid and not expired, False otherwise."""
    _purge_expired_tokens()
    if token in _tokens and _tokens[token] > time.time():
        del _tokens[token]
        return True
    return False


def _purge_expired_tokens() -> None:
    now = time.time()
    expired = [k for k, v in list(_tokens.items()) if v <= now]
    for k in expired:
        _tokens.pop(k, None)


# ── WebSocket ↔ TCP VNC proxy ─────────────────────────────────────────────────


async def ws_vnc_proxy(websocket: WebSocket, token: str) -> None:
    """Bridge a browser WebSocket connection to x11vnc TCP:VNC_PORT.

    Protocol: RFB (VNC) over binary WebSocket.
    Validates one-time token before accepting the WebSocket.
    """
    if not consume_token(token):
        await websocket.close(code=4403, reason="invalid or expired token")
        return
    if not is_vnc_running():
        await websocket.close(code=4503, reason="VNC server not running")
        return

    await websocket.accept(subprotocol="binary")

    try:
        reader, writer = await asyncio.wait_for(
            asyncio.open_connection("127.0.0.1", VNC_PORT),
            timeout=5.0,
        )
    except Exception as exc:
        try:
            await websocket.close(code=4503, reason=f"VNC connect failed: {exc}")
        except Exception:
            pass
        return

    async def browser_to_vnc() -> None:
        try:
            while True:
                data = await websocket.receive_bytes()
                writer.write(data)
                await writer.drain()
        except (WebSocketDisconnect, RuntimeError, Exception):
            pass
        finally:
            try:
                writer.close()
            except Exception:
                pass

    async def vnc_to_browser() -> None:
        try:
            while True:
                data = await asyncio.wait_for(reader.read(65536), timeout=30.0)
                if not data:
                    break
                await websocket.send_bytes(data)
        except (WebSocketDisconnect, asyncio.TimeoutError, RuntimeError, Exception):
            pass

    await asyncio.gather(browser_to_vnc(), vnc_to_browser(), return_exceptions=True)

    try:
        await websocket.close()
    except Exception:
        pass
