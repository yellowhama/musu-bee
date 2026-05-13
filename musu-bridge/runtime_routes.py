"""Fleet runtime API routes (v18.A Phase 2 + Phase 3 peer forwarding).

Reads and writes the v27 `node_runtimes` table via musu_core.fleet.RuntimeStore.

  GET  /api/nodes/{node_name}/runtimes        — list capabilities
  POST /api/nodes/{node_name}/runtimes/probe  — re-detect

Peer routing (Phase 3): if `node_name` matches a peer registered in
nodes.toml, the request is forwarded over HTTP to that peer's bridge.
Unreachable peers fall back to the locally cached state with a stale
warning rather than 500ing — operators need to see "last known good"
when a peer goes dark, not an error page.
"""

from __future__ import annotations

import logging
from typing import Any

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from musu_core.fleet import RuntimeStore, detect_all_runtimes

logger = logging.getLogger(__name__)

runtime_router = APIRouter(tags=["fleet-runtimes"])


class RuntimeListResponse(BaseModel):
    node_name: str
    runtimes: list[dict[str, Any]]
    total: int
    source: str = "local"  # "local" | "peer" | "cache"
    stale: bool = False    # True when peer was unreachable and we fell back to cache


def _local_node_name() -> str:
    """Resolve the bridge's own node name."""
    from config import get_config  # late import

    return get_config().node_name


def _store() -> RuntimeStore:
    from handlers import _get_backend  # late import: handlers needs ENV in place

    backend = _get_backend()
    return RuntimeStore(backend._db)


def _peer_url(node_name: str) -> str | None:
    """Return the bridge URL for a known peer, or None if not in the mesh."""
    try:
        from mesh_router import get_mesh_router  # late import — avoids cycle

        return get_mesh_router().url_for_node(node_name)
    except Exception:
        logger.exception("runtime_routes: mesh_router lookup failed")
        return None


def _peer_token(node_name: str) -> str:
    try:
        from mesh_router import get_mesh_router

        return get_mesh_router().token_for_node(node_name) or ""
    except Exception:
        return ""


async def _forward_to_peer(
    method: str,
    node_name: str,
    suffix: str,
) -> dict[str, Any] | None:
    """Forward a GET or POST to the peer's own bridge. Returns parsed JSON
    on success, None on any failure (peer unreachable, non-2xx, malformed).
    """
    url_base = _peer_url(node_name)
    if not url_base:
        return None
    target = f"{url_base.rstrip('/')}/api/nodes/{node_name}/runtimes{suffix}"
    headers: dict[str, str] = {}
    token = _peer_token(node_name)
    if token:
        headers["Authorization"] = f"Bearer {token}"

    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            if method == "GET":
                resp = await client.get(target, headers=headers)
            else:
                resp = await client.post(target, headers=headers)
        if resp.status_code != 200:
            logger.warning(
                "runtime_routes: peer %s returned HTTP %d", node_name, resp.status_code
            )
            return None
        return resp.json()
    except Exception:
        logger.warning(
            "runtime_routes: peer %s unreachable", node_name, exc_info=True
        )
        return None


@runtime_router.get(
    "/api/nodes/{node_name}/runtimes",
    summary="List runtime capabilities for a node",
)
async def list_runtimes(node_name: str) -> RuntimeListResponse:
    """Return the recorded capability state for every runtime on a node.

    Self → reads the local store.
    Peer → forwards to the peer's bridge; falls back to the local cache
            and sets `stale=True` if the peer is unreachable.
    Unknown name → empty list, source="local".
    """
    store = _store()
    if node_name == _local_node_name():
        capabilities = store.list_for_node(node_name)
        return RuntimeListResponse(
            node_name=node_name,
            runtimes=[c.to_dict() for c in capabilities],
            total=len(capabilities),
            source="local",
        )

    if _peer_url(node_name) is not None:
        peer_body = await _forward_to_peer("GET", node_name, "")
        if peer_body is not None:
            runtimes = peer_body.get("runtimes", [])
            return RuntimeListResponse(
                node_name=node_name,
                runtimes=runtimes,
                total=len(runtimes),
                source="peer",
            )
        # Peer unreachable — fall back to whatever the local cache holds.
        cached = store.list_for_node(node_name)
        return RuntimeListResponse(
            node_name=node_name,
            runtimes=[c.to_dict() for c in cached],
            total=len(cached),
            source="cache",
            stale=True,
        )

    # Not a known peer and not self — return whatever we have (empty for
    # truly unknown nodes; honest "we don't know this name").
    cached = store.list_for_node(node_name)
    return RuntimeListResponse(
        node_name=node_name,
        runtimes=[c.to_dict() for c in cached],
        total=len(cached),
        source="local",
    )


class ProbeResponse(BaseModel):
    node_name: str
    detected: int
    runtimes: list[dict[str, Any]]
    source: str = "local"  # "local" | "peer"


@runtime_router.post(
    "/api/nodes/{node_name}/runtimes/probe",
    summary="Re-detect all runtimes on this node",
)
async def probe_runtimes(node_name: str) -> ProbeResponse:
    """Run every detector and persist the result.

    Self → runs detect_all_runtimes() in-process and upserts.
    Peer → forwards to the peer's own bridge; that bridge does the
            actual detection and writes its own store.
    Unknown name → 404.
    """
    if node_name == _local_node_name():
        capabilities = await detect_all_runtimes()
        store = _store()
        persisted = store.upsert_many(node_name, capabilities.values())
        return ProbeResponse(
            node_name=node_name,
            detected=len(persisted),
            runtimes=[c.to_dict() for c in persisted],
            source="local",
        )

    if _peer_url(node_name) is None:
        raise HTTPException(
            status_code=404,
            detail=f"unknown node {node_name!r} — not local and not in mesh",
        )

    peer_body = await _forward_to_peer("POST", node_name, "/probe")
    if peer_body is None:
        raise HTTPException(
            status_code=502,
            detail=f"peer {node_name!r} unreachable",
        )
    runtimes = peer_body.get("runtimes", [])
    return ProbeResponse(
        node_name=node_name,
        detected=peer_body.get("detected", len(runtimes)),
        runtimes=runtimes,
        source="peer",
    )


async def probe_self_on_startup() -> None:
    """Bridge startup hook — populate the local node's runtime row set.

    Called once after the DB is ready. Silently swallows detector errors
    (they already record reason=DetectorCrashed) so the bridge boot is
    never blocked on a flaky CLI.
    """
    try:
        capabilities = await detect_all_runtimes()
        store = _store()
        store.upsert_many(_local_node_name(), capabilities.values())
        logger.info(
            "runtime_probe: detected %d runtimes for self", len(capabilities)
        )
    except Exception:
        logger.exception("runtime_probe: startup detect failed")
