"""musu-bridge cloud registry — heartbeat sender + peer discovery for musu.pro."""
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
_PEER_REFRESH_INTERVAL = int(os.getenv("MUSU_PEER_REFRESH_INTERVAL", "300"))

# Derive list URL from register URL: strip "/register" suffix
_NODES_LIST_URL = _REGISTRY_URL.removesuffix("/register")


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
                payload: dict = {"node_name": node_name, "public_url": public_url}
                fingerprint = os.getenv("MUSU_QUIC_FINGERPRINT", "")
                if fingerprint:
                    payload["cert_fingerprint"] = fingerprint
                resp = await client.post(
                    _REGISTRY_URL,
                    json=payload,
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


async def fetch_peers(token: str) -> list[dict]:
    """GET /api/v1/nodes → list of peer dicts (excludes invalid entries).

    Returns empty list on any error — callers should tolerate failure.
    """
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                _NODES_LIST_URL,
                headers={"Authorization": f"Bearer {token}"},
            )
            if resp.status_code == 200:
                data = resp.json()
                # API may return list or {"nodes": [...]}
                if isinstance(data, list):
                    return data
                return data.get("nodes", [])
            elif resp.status_code == 401:
                logger.warning("registry: token rejected (401) on peer fetch")
            else:
                logger.warning("registry: peer fetch status=%d", resp.status_code)
    except httpx.ConnectError:
        logger.warning("registry: cannot reach musu.pro for peer fetch")
    except Exception:
        logger.exception("registry: unexpected error in fetch_peers")
    return []


async def peer_discovery_loop(
    token: str,
    self_node_name: str,
    cache: "PeerCache",  # type: ignore[name-defined]  # imported at call site
    router: "MeshRouter",  # type: ignore[name-defined]
    interval: int = _PEER_REFRESH_INTERVAL,
) -> None:
    """Periodically fetch peers from musu.pro, update cache, and register in router.

    Runs forever as an asyncio task. Never raises.
    Initial run happens immediately (no leading sleep) so peers are available fast.
    """
    from peer_cache import PeerEntry

    logger.info(
        "registry: peer discovery starting — self=%r interval=%ds",
        self_node_name,
        interval,
    )
    while True:
        peers = await fetch_peers(token)
        added = 0
        for raw in peers:
            name = raw.get("node_name") or raw.get("name")
            url = raw.get("public_url") or raw.get("url")
            if not name or not url:
                continue
            if name == self_node_name:
                continue  # skip self
            entry = PeerEntry(
                node_name=name,
                public_url=url,
                last_seen=PeerEntry.now_iso(),
                source="musu.pro",
            )
            cache.upsert(entry)
            # Register in router; add_node is idempotent
            try:
                router.add_node(name, url, agents=[])
                added += 1
            except Exception:
                logger.warning("registry: could not add peer %r to router", name)
        if added:
            cache.flush()
            logger.info("registry: peer discovery — %d peer(s) registered", added)
        else:
            logger.debug("registry: peer discovery — no new peers found")
        await asyncio.sleep(interval)
