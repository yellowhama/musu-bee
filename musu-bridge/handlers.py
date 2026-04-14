"""musu-bridge handlers — route messages through musu-core."""
from __future__ import annotations

import logging
import sys
from pathlib import Path
from typing import Any

# Ensure musu-core is importable
_MUSU_CORE = Path(__file__).parent.parent / "musu-core" / "src"
if str(_MUSU_CORE) not in sys.path:
    sys.path.insert(0, str(_MUSU_CORE))

from musu_core.backends.local import LocalBackend
from musu_core.config import get_config as get_core_config
from musu_core.router import route_message

from config import get_config as get_bridge_config
from mesh_router import get_mesh_router

logger = logging.getLogger(__name__)

_backend: LocalBackend | None = None


def _get_backend() -> LocalBackend:
    global _backend
    if _backend is None:
        cfg = get_core_config()
        _backend = LocalBackend(cfg.db_path)
    return _backend


async def route_chat(channel: str, sender_id: str, text: str) -> dict[str, Any]:
    """Route a message to the agent mapped to the given channel.

    If the agent is assigned to a remote node in nodes.toml, the request is
    forwarded to that node's musu-bridge. Otherwise handled locally.

    Returns a dict with response, agent_id, agent_name on success,
    or error on failure.
    """
    if not text.strip():
        return {"error": "Empty message", "response": None}

    # ── Mesh routing: forward to remote node if assigned ──────────────────────
    mesh = get_mesh_router()
    if mesh.enabled and mesh.is_remote(channel):
        node = mesh.node_for_agent(channel)
        url = mesh.url_for_node(node)  # type: ignore[arg-type]
        if url:
            logger.info("mesh_router: forwarding channel=%r to node=%r url=%r", channel, node, url)
            return await mesh.forward(url, channel, sender_id, text)
        logger.warning("mesh_router: no URL for node=%r, falling through to local", node)

    # ── Local handling ─────────────────────────────────────────────────────────
    cfg = get_bridge_config()

    if channel not in cfg.channel_agent_map:
        return {"error": f"No agent mapped to channel: {channel!r}", "response": None}

    try:
        response = await route_message(
            source=channel,
            source_ref=sender_id,
            message=text.strip(),
            backend=_get_backend(),
        )
    except ValueError as exc:
        logger.warning("route_chat: no agent for channel %r — %s", channel, exc)
        return {"error": "No agent available for this channel.", "response": None}
    except RuntimeError as exc:
        logger.error("route_chat: adapter failure — %s", exc)
        return {"error": "Agent unavailable. Please try again later.", "response": None}
    except Exception as exc:
        logger.exception("route_chat: unexpected error — %s", exc)
        return {"error": "Internal error. Please try again.", "response": None}

    # Look up agent info
    backend = _get_backend()
    agent = backend.get_agent_by_name(channel)
    agent_id = agent["id"] if agent else None
    agent_name = agent["role"] if agent else channel

    return {
        "response": response,
        "agent_id": agent_id,
        "agent_name": agent_name,
    }


def get_agents() -> list[dict[str, Any]]:
    """List all active agents."""
    backend = _get_backend()
    return backend.list_agents()


def get_channel_map() -> dict[str, Any]:
    """Return channel-to-agent mapping with agent details."""
    cfg = get_bridge_config()
    backend = _get_backend()
    result = {}
    for channel, agent_name in cfg.channel_agent_map.items():
        agent = backend.get_agent_by_name(agent_name)
        result[channel] = {
            "agent_name": agent_name,
            "agent_id": agent["id"] if agent else None,
            "agent_role": agent["role"] if agent else None,
        }
    return result


# --- Message history ---


def list_messages(
    session_id: str,
    limit: int = 50,
    before_id: str | None = None,
    agent_id: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
) -> list[dict[str, Any]]:
    """Return messages for a session with cursor-based pagination and optional filters."""
    backend = _get_backend()
    return backend.list_messages(
        session_id,
        limit=limit,
        before_id=before_id,
        agent_id=agent_id,
        date_from=date_from,
        date_to=date_to,
    )


def get_message_by_id(message_id: str) -> dict[str, Any] | None:
    """Return a single message by id, or None if not found."""
    backend = _get_backend()
    return backend.get_message(message_id)


def delete_message_by_id(message_id: str) -> bool:
    """Delete a message by id. Returns True if deleted, False if not found."""
    backend = _get_backend()
    return backend.delete_message(message_id)


# --- Company management ---


def list_companies(workspace_id: str | None = None) -> list[dict[str, Any]]:
    """List all companies, optionally filtered by workspace_id."""
    backend = _get_backend()
    return backend.list_companies(workspace_id=workspace_id)


def create_company(
    name: str,
    template_key: str = "default",
    workspace_id: str = "",
    meta: dict | None = None,
) -> dict[str, Any]:
    """Create a new company."""
    backend = _get_backend()
    return backend.create_company(
        name=name,
        template_key=template_key,
        workspace_id=workspace_id,
        meta=meta,
    )


def get_company(company_id: str) -> dict[str, Any] | None:
    """Get a company by id, or None if not found."""
    backend = _get_backend()
    return backend.get_company(company_id)


def update_company(company_id: str, **kwargs: Any) -> dict[str, Any] | None:
    """Update a company's fields. Returns updated company or None if not found."""
    backend = _get_backend()
    return backend.update_company(company_id, **kwargs)


def delete_company(company_id: str) -> bool:
    """Delete a company by id. Returns True if deleted, False if not found."""
    backend = _get_backend()
    return backend.delete_company(company_id)


# --- Sync pull (for peer nodes to pull from this node) ---


def sync_companies(since: str, limit: int = 500) -> list[dict]:
    """Return companies updated at or after *since* (ISO 8601), up to *limit*."""
    backend = _get_backend()
    rows = backend._db.execute(
        "SELECT * FROM companies WHERE updated_at >= ? ORDER BY updated_at ASC LIMIT ?",
        (since, limit),
    )
    return [dict(r) for r in rows]


def sync_messages(since: str, limit: int = 500) -> list[dict]:
    """Return messages created at or after *since* (ISO 8601), up to *limit*."""
    backend = _get_backend()
    rows = backend._db.execute(
        "SELECT * FROM messages WHERE created_at >= ? ORDER BY created_at ASC LIMIT ?",
        (since, limit),
    )
    return [backend._msg_row_to_dict(r) for r in rows]


# --- Sync receive (for accepting incoming data from peer nodes) ---


def receive_companies(companies: list[dict]) -> int:
    """Bulk-upsert companies received from a peer. Returns count written."""
    backend = _get_backend()
    return backend.bulk_upsert_companies(companies)


def receive_messages(messages: list[dict]) -> int:
    """Bulk-insert messages received from a peer. Returns count written."""
    backend = _get_backend()
    return backend.bulk_insert_messages(messages)
