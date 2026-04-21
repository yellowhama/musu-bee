"""musu-bridge relay client.

Maintains a persistent outbound WebSocket tunnel to musu-relay.
musu.pro routes proxy requests through the relay → this client
forwards them to the local musu-bridge HTTP API and returns responses.

Also handles WebSocket proxy sessions (ws_open/ws_data/ws_close frames),
bridging remote clients to a local WebSocket server (e.g. musu-port :1355).

Usage (via server.py lifespan when MUSU_RELAY_ENABLED=true):
    from relay_client import relay_loop
    asyncio.create_task(relay_loop(...))
"""
from __future__ import annotations

import asyncio
import base64
import json
import logging
import os
import random
import time
from typing import Any, TypedDict

import httpx

logger = logging.getLogger(__name__)

_RECONNECT_BASE_DELAY = 5  # initial reconnect delay in seconds
_RECONNECT_MAX_DELAY = 60  # maximum reconnect delay in seconds
_HTTP_TIMEOUT = 25.0  # local bridge call timeout (< relay's 30s)

# Local WS target for proxied WebSocket connections (musu-port chat server)
_WS_PROXY_TARGET = os.environ.get("MUSU_WS_PROXY_TARGET", "ws://localhost:1355")


async def relay_loop(
    relay_url: str,
    musu_token: str,
    node_name: str,
    bridge_url: str = "http://localhost:8070",
) -> None:
    """Run forever: connect to relay, handle requests, reconnect on disconnect."""
    try:
        import websockets  # type: ignore[import-untyped]
    except ImportError:
        logger.error(
            "relay_client: 'websockets' package not installed. "
            "Run: pip install websockets"
        )
        return

    tunnel_url = relay_url.rstrip("/") + "/tunnel"
    headers = {"Authorization": f"Bearer {musu_token}"}

    logger.info("relay_client: starting tunnel to %s (node=%r)", tunnel_url, node_name)

    reconnect_attempt = 0
    # session_id → asyncio.Task (WS proxy session)
    ws_sessions: dict[str, asyncio.Task[None]] = {}

    # Start session TTL cleanup loop (runs for the lifetime of relay_loop)
    cleanup_task = asyncio.create_task(_session_cleanup_loop())

    async with httpx.AsyncClient(
        base_url=bridge_url,
        timeout=httpx.Timeout(_HTTP_TIMEOUT),
    ) as http:
        while True:
            try:
                async with websockets.connect(tunnel_url, additional_headers=headers) as ws:
                    # Handshake
                    await ws.send(json.dumps({"type": "hello", "node_id": node_name}))
                    ack_raw = await asyncio.wait_for(ws.recv(), timeout=10)
                    ack = json.loads(ack_raw)
                    if ack.get("type") != "hello_ack":
                        logger.warning("relay_client: unexpected handshake response: %s", ack)
                        continue

                    logger.info("relay_client: tunnel established (node=%r)", node_name)
                    reconnect_attempt = 0

                    async for raw in ws:
                        msg: dict[str, Any]
                        try:
                            msg = json.loads(raw)
                        except Exception:
                            logger.warning("relay_client: non-JSON frame — ignoring")
                            continue

                        frame_type = msg.get("type", "")

                        if frame_type == "ws_open":
                            # Open a new WS proxy session to the local WS server
                            session_id: str = msg.get("session_id", "")
                            target_path: str = msg.get("target_path", "/")
                            if session_id and session_id not in ws_sessions:
                                task = asyncio.create_task(
                                    _ws_proxy_session(ws, session_id, target_path)
                                )
                                ws_sessions[session_id] = task
                                task.add_done_callback(
                                    lambda t, sid=session_id: ws_sessions.pop(sid, None)
                                )

                        elif frame_type in ("ws_data", "ws_close"):
                            # Route to existing session task via a per-session queue
                            # (The task reads from _ws_session_queues[session_id])
                            session_id = msg.get("session_id", "")
                            q = _ws_session_queues.get(session_id)
                            if q:
                                await q["queue"].put(msg)

                        else:
                            # HTTP response frame (or unknown)
                            asyncio.create_task(_handle_request(ws, http, raw))

            except asyncio.CancelledError:
                logger.info("relay_client: cancelled — shutting down")
                cleanup_task.cancel()
                for task in ws_sessions.values():
                    task.cancel()
                return
            except Exception as exc:
                delay = min(_RECONNECT_BASE_DELAY * (2 ** reconnect_attempt), _RECONNECT_MAX_DELAY)
                delay += random.uniform(0, 1)
                logger.warning(
                    "relay_client: tunnel error (%s) — reconnecting in %ds (attempt %d)",
                    exc, delay, reconnect_attempt + 1,
                )
                await asyncio.sleep(delay)
                reconnect_attempt += 1


# Per-session message queues: session_id → { queue, created_at }
# Populated by relay_loop, drained by _ws_proxy_session
_SESSION_TTL = 30 * 60  # 30 minutes in seconds


class WsSessionEntry(TypedDict):
    queue: asyncio.Queue[dict[str, Any]]
    created_at: float


_ws_session_queues: dict[str, WsSessionEntry] = {}


async def _session_cleanup_loop() -> None:
    """Periodically close WS sessions that have exceeded the 30-minute TTL."""
    while True:
        await asyncio.sleep(_SESSION_TTL)
        now = time.monotonic()
        expired = [
            sid for sid, entry in list(_ws_session_queues.items())
            if now - entry["created_at"] > _SESSION_TTL
        ]
        for sid in expired:
            logger.info("relay_client: session TTL exceeded — closing session=%s", sid)
            entry = _ws_session_queues.pop(sid, None)
            if entry:
                try:
                    await entry["queue"].put({"type": "ws_close", "session_id": sid})
                except Exception:
                    pass


async def _ws_proxy_session(
    tunnel_ws: Any,
    session_id: str,
    target_path: str,
) -> None:
    """Bridge one WS proxy session: relay client ↔ local WS server (musu-port)."""
    try:
        import websockets  # type: ignore[import-untyped]
    except ImportError:
        return

    queue: asyncio.Queue[dict[str, Any]] = asyncio.Queue()
    _ws_session_queues[session_id] = {"queue": queue, "created_at": time.monotonic()}

    # Route /api/ paths to the local bridge (8070), everything else to musu-port (1355)
    if target_path.startswith("/api/"):
        local_url = "ws://localhost:8070" + target_path
    else:
        local_url = _WS_PROXY_TARGET.rstrip("/") + target_path
    logger.info("relay_client: ws-proxy session %s → %s", session_id, local_url)

    try:
        async with websockets.connect(local_url) as local_ws:
            async def _local_to_tunnel() -> None:
                """Forward messages from local WS → tunnel (as ws_data frames)."""
                async for data in local_ws:
                    buf = data if isinstance(data, bytes) else data.encode()
                    frame = {
                        "type": "ws_data",
                        "session_id": session_id,
                        "data_b64": base64.b64encode(buf).decode(),
                    }
                    try:
                        await tunnel_ws.send(json.dumps(frame))
                    except Exception as exc:
                        logger.warning("relay_client: ws_data send error: %s", exc)
                        return

            async def _queue_to_local() -> None:
                """Forward ws_data frames from tunnel → local WS."""
                while True:
                    msg = await queue.get()
                    if msg.get("type") == "ws_close":
                        await local_ws.close()
                        return
                    if msg.get("type") == "ws_data":
                        data_b64 = msg.get("data_b64", "")
                        buf = base64.b64decode(data_b64)
                        try:
                            await local_ws.send(buf)
                        except Exception as exc:
                            logger.warning("relay_client: local ws send error: %s", exc)
                            return

            await asyncio.gather(_local_to_tunnel(), _queue_to_local())

    except Exception as exc:
        logger.warning("relay_client: ws-proxy session %s error: %s", session_id, exc)
    finally:
        _ws_session_queues.pop(session_id, None)
        # Notify relay that session is closed
        try:
            await tunnel_ws.send(json.dumps({
                "type": "ws_close",
                "session_id": session_id,
                "code": 1001,
                "reason": "local ws closed",
            }))
        except Exception:
            pass
        logger.info("relay_client: ws-proxy session %s ended", session_id)


async def _handle_request(
    ws: Any,
    http: httpx.AsyncClient,
    raw: str | bytes,
) -> None:
    """Forward one proxied HTTP request to local bridge and send response back."""
    try:
        req = json.loads(raw)
    except Exception:
        logger.warning("relay_client: non-JSON frame — ignoring")
        return

    # Skip WS control frames (handled by relay_loop directly)
    frame_type = req.get("type", "")
    if frame_type in ("ws_open", "ws_data", "ws_close"):
        return

    req_id: str = req.get("id", "")
    method: str = req.get("method", "GET").upper()
    path: str = req.get("path", "/")
    headers: dict[str, str] = req.get("headers") or {}
    body_b64: str | None = req.get("body")

    _STRIP = {"host", "connection", "transfer-encoding", "content-length"}
    forwarded = {k: v for k, v in headers.items() if k.lower() not in _STRIP}
    body_bytes = base64.b64decode(body_b64) if body_b64 else None

    # Override Authorization with the local bridge token so the bridge auth
    # middleware accepts relay-proxied requests regardless of what the upstream
    # caller sent (relay clients send RELAY_SECRET, not MUSU_BRIDGE_TOKEN).
    import os as _os
    _bridge_token = _os.environ.get("MUSU_BRIDGE_TOKEN", "")
    if _bridge_token:
        forwarded["authorization"] = f"Bearer {_bridge_token}"

    try:
        resp = await http.request(
            method,
            path,
            headers=forwarded,
            content=body_bytes,
        )
        resp_body_b64 = base64.b64encode(resp.content).decode()
        frame: dict[str, Any] = {
            "id": req_id,
            "status": resp.status_code,
            "headers": dict(resp.headers),
            "body": resp_body_b64,
        }
    except Exception as exc:
        logger.warning("relay_client: local bridge error for %s %s: %s", method, path, exc)
        frame = {
            "id": req_id,
            "status": 502,
            "headers": {"content-type": "application/json"},
            "body": base64.b64encode(
                json.dumps({"error": str(exc)}).encode()
            ).decode(),
        }

    try:
        await ws.send(json.dumps(frame))
    except Exception as exc:
        logger.warning("relay_client: failed to send response frame: %s", exc)
