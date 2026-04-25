"""Screen capture and VNC routes for musu-bridge.

Extracted from server.py. Provides monitor listing, screenshot capture,
and VNC remote desktop proxy endpoints.
"""
from __future__ import annotations

import asyncio
import base64
import os
import tempfile
import time

from fastapi import APIRouter, HTTPException, Query, WebSocket

import screen_vnc
from config import get_config
from screen_capture import _find_display_env, _do_capture_sync

screen_router = APIRouter(tags=["screen"])


@screen_router.get("/api/screen/monitors")
async def screen_monitors() -> dict:
    """List available monitors on this machine."""
    display_env = _find_display_env()
    try:
        import mss
        old = {k: os.environ.get(k) for k in display_env}
        try:
            os.environ.update(display_env)
            with mss.mss() as sct:
                result = [
                    {
                        "index": i,
                        "width": m["width"],
                        "height": m["height"],
                        "left": m["left"],
                        "top": m["top"],
                    }
                    for i, m in enumerate(sct.monitors)
                    if i > 0
                ]
        finally:
            for k, v in old.items():
                if v is None:
                    os.environ.pop(k, None)
                else:
                    os.environ[k] = v
        return {"monitors": result}
    except Exception as exc:
        raise HTTPException(500, detail=f"monitor list failed: {exc}") from exc


@screen_router.get("/api/screen/snapshot")
async def screen_snapshot(monitor: int = 1) -> dict:
    """Capture a screenshot and return as base64 JPEG."""
    display_env = _find_display_env()

    with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as f:
        tmp_png = f.name
    with tempfile.NamedTemporaryFile(suffix=".jpg", delete=False) as f:
        tmp_jpg = f.name

    try:
        loop = asyncio.get_running_loop()
        captured = await loop.run_in_executor(None, _do_capture_sync, display_env, tmp_png, tmp_jpg, monitor)

        if not captured:
            raise HTTPException(
                status_code=503,
                detail=(
                    f"Screen capture unavailable "
                    f"(display={display_env.get('DISPLAY', 'none')}, "
                    f"xauth={'yes' if display_env.get('XAUTHORITY') else 'no'}) "
                    f"— try: pip install mss pillow"
                ),
            )

        with open(tmp_jpg, "rb") as f:
            data = base64.b64encode(f.read()).decode()
        return {"snapshot": f"data:image/jpeg;base64,{data}", "ts": int(time.time() * 1000)}
    finally:
        for p in (tmp_png, tmp_jpg):
            try:
                os.unlink(p)
            except OSError:
                pass


# ── VNC remote desktop endpoints ──────────────────────────────────────────────


@screen_router.post("/api/screen/vnc/start")
async def screen_vnc_start(display: str = Query(default="")) -> dict:
    """Start x11vnc on localhost:5900. Auto-detects display (Xvfb fallback for WSL2)."""
    try:
        return await asyncio.get_running_loop().run_in_executor(
            None, screen_vnc.start_vnc, display
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@screen_router.post("/api/screen/vnc/stop")
async def screen_vnc_stop() -> dict:
    """Stop the x11vnc subprocess if running."""
    return await asyncio.get_running_loop().run_in_executor(None, screen_vnc.stop_vnc)


@screen_router.get("/api/screen/vnc/status")
async def screen_vnc_status() -> dict:
    """Return current VNC server status (running, pid, port)."""
    return screen_vnc.get_vnc_status()


@screen_router.get("/api/screen/vnc/token")
async def screen_vnc_token() -> dict:
    """Issue a one-time WebSocket token (60s TTL)."""
    tok = screen_vnc.issue_token()
    relay_ws_url = ""
    cfg = get_config()
    if cfg.relay_url and cfg.node_name:
        relay_base = (
            cfg.relay_url.rstrip("/")
            .replace("https://", "wss://")
            .replace("http://", "ws://")
        )
        relay_ws_url = f"{relay_base}/tunnel"
    return {
        "token": tok,
        "launcher_path": f"/screen/novnc/launcher.html?token={tok}",
        "relay_ws_url": relay_ws_url,
        "node_name": cfg.node_name or "",
    }


@screen_router.websocket("/api/screen/ws-vnc")
async def ws_vnc(websocket: WebSocket, token: str = Query(...)) -> None:
    """WebSocket VNC proxy — bridges noVNC RFB to x11vnc TCP:5900."""
    await screen_vnc.ws_vnc_proxy(websocket, token)
