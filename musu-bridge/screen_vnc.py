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


def start_vnc(display: str = ":0", xauthority: str = "") -> dict:
    """Start x11vnc on localhost:VNC_PORT for the given DISPLAY.

    Returns status dict. Raises RuntimeError if x11vnc binary not found.
    Waits up to 2 seconds for x11vnc to open its port before returning.
    xauthority: path to .Xauthority file, forwarded as XAUTHORITY env var.
    """
    global _vnc_proc
    if is_vnc_running():
        return {"ok": True, "already_running": True, **get_vnc_status()}
    if not shutil.which("x11vnc"):
        raise RuntimeError(
            "x11vnc not found — install with: sudo apt install x11vnc"
        )
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
                break
        except OSError:
            time.sleep(0.1)
    return {"ok": True, "already_running": False, **get_vnc_status()}


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
