"""musu-bridge relay client.

Maintains a persistent outbound WebSocket tunnel to musu-relay.
musu.pro routes proxy requests through the relay → this client
forwards them to the local musu-bridge HTTP API and returns responses.

Usage (via server.py lifespan when MUSU_RELAY_ENABLED=true):
    from relay_client import relay_loop
    asyncio.create_task(relay_loop(...))
"""
from __future__ import annotations

import asyncio
import base64
import json
import logging
from typing import Any

import httpx

logger = logging.getLogger(__name__)

_RECONNECT_DELAY = 5  # seconds between reconnect attempts
_HTTP_TIMEOUT = 25.0  # local bridge call timeout (< relay's 30s)


async def relay_loop(
    relay_url: str,
    musu_token: str,
    node_name: str,
    bridge_url: str = "http://localhost:8070",
) -> None:
    """Run forever: connect to relay, handle requests, reconnect on disconnect."""
    # Lazy import so websockets is optional when relay is disabled
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

                    async for raw in ws:
                        asyncio.create_task(_handle_request(ws, http, raw))

            except asyncio.CancelledError:
                logger.info("relay_client: cancelled — shutting down")
                return
            except Exception as exc:
                logger.warning(
                    "relay_client: tunnel error (%s) — reconnecting in %ds",
                    exc,
                    _RECONNECT_DELAY,
                )
                await asyncio.sleep(_RECONNECT_DELAY)


async def _handle_request(
    ws: Any,
    http: httpx.AsyncClient,
    raw: str | bytes,
) -> None:
    """Forward one proxied request to local bridge and send response back."""
    try:
        req = json.loads(raw)
    except Exception:
        logger.warning("relay_client: non-JSON frame — ignoring")
        return

    req_id: str = req.get("id", "")
    method: str = req.get("method", "GET").upper()
    path: str = req.get("path", "/")
    headers: dict[str, str] = req.get("headers") or {}
    body_b64: str | None = req.get("body")

    # Strip headers that cause issues with local re-request
    _STRIP = {"host", "connection", "transfer-encoding", "content-length"}
    forwarded = {k: v for k, v in headers.items() if k.lower() not in _STRIP}

    body_bytes = base64.b64decode(body_b64) if body_b64 else None

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
