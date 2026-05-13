"""Fleet runtime API routes (v18.A Phase 2).

Reads and writes the v27 `node_runtimes` table via musu_core.fleet.RuntimeStore.
Two endpoints for now:

  GET  /api/nodes/{node_name}/runtimes        — list capabilities
  POST /api/nodes/{node_name}/runtimes/probe  — trigger re-detect on self

Self vs peer routing lands in Phase 3. For now POST .../probe only works
for the local node; calling it with a different node_name returns 400.
"""

from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from musu_core.fleet import RuntimeStore, detect_all_runtimes

logger = logging.getLogger(__name__)

runtime_router = APIRouter(tags=["fleet-runtimes"])


class RuntimeListResponse(BaseModel):
    node_name: str
    runtimes: list[dict[str, Any]]
    total: int


def _local_node_name() -> str:
    """Resolve the bridge's own node name."""
    from config import get_config  # late import

    return get_config().node_name


def _store() -> RuntimeStore:
    from handlers import _get_backend  # late import: handlers needs ENV in place

    backend = _get_backend()
    return RuntimeStore(backend._db)


@runtime_router.get(
    "/api/nodes/{node_name}/runtimes",
    summary="List runtime capabilities for a node",
)
async def list_runtimes(node_name: str) -> RuntimeListResponse:
    """Return the recorded capability state for every runtime on this node.

    Self-node only in Phase 2; Phase 3 adds mesh peer forwarding when
    `node_name` is a known peer.
    """
    store = _store()
    capabilities = store.list_for_node(node_name)
    return RuntimeListResponse(
        node_name=node_name,
        runtimes=[c.to_dict() for c in capabilities],
        total=len(capabilities),
    )


class ProbeResponse(BaseModel):
    node_name: str
    detected: int
    runtimes: list[dict[str, Any]]


@runtime_router.post(
    "/api/nodes/{node_name}/runtimes/probe",
    summary="Re-detect all runtimes on this node",
)
async def probe_runtimes(node_name: str) -> ProbeResponse:
    """Run every detector and persist the result.

    Self-only in Phase 2. If `node_name` is not the local node, the call
    returns 400 with a hint pointing at Phase 3.
    """
    local = _local_node_name()
    if node_name != local:
        raise HTTPException(
            status_code=400,
            detail=(
                f"probe of remote node {node_name!r} not yet supported "
                f"(local node is {local!r}); Phase 3 will add mesh forwarding"
            ),
        )

    capabilities = await detect_all_runtimes()
    store = _store()
    persisted = store.upsert_many(node_name, capabilities.values())
    return ProbeResponse(
        node_name=node_name,
        detected=len(persisted),
        runtimes=[c.to_dict() for c in persisted],
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
