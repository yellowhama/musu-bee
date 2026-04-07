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

    Returns a dict with response, agent_id, agent_name on success,
    or error on failure.
    """
    cfg = get_bridge_config()

    if channel not in cfg.channel_agent_map:
        return {"error": f"No agent mapped to channel: {channel!r}", "response": None}

    if not text.strip():
        return {"error": "Empty message", "response": None}

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
