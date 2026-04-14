"""musu-bridge cloud registry — heartbeat sender for musu.pro."""
from __future__ import annotations

import asyncio
import logging
import os

import httpx

logger = logging.getLogger(__name__)

_REGISTRY_URL = os.getenv(
    "MUSU_REGISTRY_URL",
    "https://musu.pro/api/v1/nodes/register",
)
_HEARTBEAT_INTERVAL = int(os.getenv("MUSU_HEARTBEAT_INTERVAL", "30"))


async def heartbeat_loop(
    token: str,
    node_name: str,
    public_url: str,
    interval: int = _HEARTBEAT_INTERVAL,
) -> None:
    """Send a registration heartbeat to musu.pro every `interval` seconds.

    Runs forever as an asyncio task. Never raises — all errors are logged
    and retried on the next tick.
    """
    logger.info(
        "registry: heartbeat starting — node=%r url=%r interval=%ds",
        node_name,
        public_url,
        interval,
    )
    while True:
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.post(
                    _REGISTRY_URL,
                    json={"node_name": node_name, "public_url": public_url},
                    headers={
                        "Authorization": f"Bearer {token}",
                        "Content-Type": "application/json",
                    },
                )
                if resp.status_code == 200:
                    logger.debug("registry: heartbeat ok")
                elif resp.status_code == 401:
                    logger.warning("registry: token rejected (401) — check MUSU_TOKEN")
                else:
                    logger.warning(
                        "registry: heartbeat rejected status=%d", resp.status_code
                    )
        except httpx.ConnectError:
            logger.warning("registry: cannot reach musu.pro — will retry in %ds", interval)
        except Exception:
            logger.exception("registry: unexpected error in heartbeat")
        await asyncio.sleep(interval)
