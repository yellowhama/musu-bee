"""musu-bridge handlers — route messages through musu-core."""
from __future__ import annotations

import logging
import sys
import uuid
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

    # ── Durable execution record ───────────────────────────────────────────────
    exec_id = str(uuid.uuid4())
    backend = _get_backend()
    try:
        backend.create_route_execution(exec_id, channel, sender_id, text)
        backend.update_route_execution(exec_id, "running")
    except Exception:
        logger.warning("route_chat: failed to create durability record — continuing")
        exec_id = ""  # Non-fatal: proceed without durability

    def _finish(result: dict[str, Any], node: str | None = None) -> dict[str, Any]:
        """Mark execution done/failed and return result."""
        if exec_id:
            try:
                if result.get("error"):
                    backend.update_route_execution(exec_id, "failed", error=result["error"], node=node)
                else:
                    backend.update_route_execution(exec_id, "done", output=result.get("response"), node=node)
            except Exception:
                pass
        return result

    # ── Mesh routing: forward to remote node if assigned ──────────────────────
    mesh = get_mesh_router()
    if mesh.enabled and mesh.is_remote(channel):
        node = mesh.node_for_agent(channel)
        url = mesh.url_for_node(node)  # type: ignore[arg-type]
        if url:
            if not await mesh.is_node_healthy(node):  # type: ignore[arg-type]
                logger.warning(
                    "mesh_router: node=%r unhealthy — falling back to local for channel=%r",
                    node, channel,
                )
                # Fall through to local handler below
            else:
                logger.info("mesh_router: forwarding channel=%r to node=%r url=%r", channel, node, url)
                return _finish(await mesh.forward(url, channel, sender_id, text), node=node)
        else:
            logger.warning("mesh_router: no URL for node=%r, falling through to local", node)

    # ── Local handling ─────────────────────────────────────────────────────────
    cfg = get_bridge_config()

    if channel not in cfg.channel_agent_map:
        return _finish({"error": f"No agent mapped to channel: {channel!r}", "response": None})

    try:
        response = await route_message(
            source=channel,
            source_ref=sender_id,
            message=text.strip(),
            backend=_get_backend(),
        )
    except ValueError as exc:
        logger.warning("route_chat: no agent for channel %r — %s", channel, exc)
        return _finish({"error": "No agent available for this channel.", "response": None})
    except RuntimeError as exc:
        logger.error("route_chat: adapter failure — %s", exc)
        return _finish({"error": "Agent unavailable. Please try again later.", "response": None})
    except Exception as exc:
        logger.exception("route_chat: unexpected error — %s", exc)
        return _finish({"error": "Internal error. Please try again.", "response": None})

    # Look up agent info
    agent = backend.get_agent_by_name(channel)
    agent_id = agent["id"] if agent else None
    agent_name = agent["role"] if agent else channel

    return _finish({
        "response": response,
        "agent_id": agent_id,
        "agent_name": agent_name,
    })


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


# --- Node management ---


def get_node_info() -> dict[str, Any]:
    """Return this node's identity info for peer exchange."""
    mesh = get_mesh_router()
    cfg = get_bridge_config()
    backend = _get_backend()
    agents = [a["name"] for a in backend.list_agents()]
    # Prefer explicit MUSU_BRIDGE_PUBLIC_URL, fall back to nodes.toml self entry
    self_url = cfg.public_url or mesh.url_for_node(mesh._self_name) or ""
    return {
        "name": mesh._self_name,
        "url": self_url,
        "agents": agents,
        "version": "0.2.0",
    }


def _is_safe_pair_ip(ip: str) -> bool:
    """Return True if the IP is safe to pair with.

    Blocks loopback and link-local ranges to prevent SSRF against local
    services (e.g. AWS metadata at 169.254.169.254). Private LAN and
    Tailscale ranges (100.x.x.x, 192.168.x.x, 10.x.x.x) are allowed
    because pairing over LAN/VPN is the primary use case.
    """
    import ipaddress
    try:
        addr = ipaddress.ip_address(ip)
    except ValueError:
        return False  # reject hostnames — only bare IPs allowed
    return not addr.is_loopback and not addr.is_link_local and not addr.is_unspecified


async def pair_with_node(ip: str, port: int) -> dict[str, Any]:
    """Initiate HTTP pairing with a remote node.

    1. GET remote /api/admin/node-info
    2. POST remote /api/admin/pair/accept with local node info
    3. Update local nodes.toml + reload MeshRouter
    """
    import httpx

    if not _is_safe_pair_ip(ip):
        return {"success": False, "error": f"IP {ip!r} is not a routable address"}

    if not (1 <= port <= 65535):
        return {"success": False, "error": f"Port {port} out of range (1-65535)"}

    remote_base = f"http://{ip}:{port}"

    # 1. Fetch remote node info
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(f"{remote_base}/api/admin/node-info")
            if resp.status_code != 200:
                return {"success": False, "error": f"Remote returned {resp.status_code}"}
            remote_info = resp.json()
    except (httpx.ConnectError, httpx.TimeoutException) as exc:
        return {"success": False, "error": f"Cannot reach {remote_base}: {exc}"}

    remote_name = remote_info.get("name", "")
    remote_url = remote_info.get("url", "") or remote_base

    # 2. Send local node info to remote so it can add us
    local_info = get_node_info()
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(
                f"{remote_base}/api/admin/pair/accept",
                json=local_info,
            )
            if resp.status_code != 200:
                return {"success": False, "error": f"Remote pair/accept returned {resp.status_code}"}
    except (httpx.ConnectError, httpx.TimeoutException) as exc:
        return {"success": False, "error": f"pair/accept failed: {exc}"}

    # 3. Update local nodes.toml (store remote agents for NodePanel display)
    mesh = get_mesh_router()
    remote_agents = remote_info.get("agents", [])
    if isinstance(remote_agents, list):
        remote_agents = [str(a) for a in remote_agents]
    mesh.add_node(remote_name, remote_url, agents=remote_agents)

    # 4. Fetch remote Agent Card and auto-assign unassigned agents
    assigned_agents: list[str] = []
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            card_resp = await client.get(f"{remote_base}/.well-known/agent.json")
            if card_resp.status_code == 200:
                card = card_resp.json()
                card_agents = [
                    a["id"]
                    for a in card.get("capabilities", {}).get("agents", [])
                    if isinstance(a, dict) and a.get("id")
                ]
                if card_agents:
                    assigned_agents = mesh.auto_assign_agents(remote_name, card_agents)
                else:
                    # Fallback: use agents from node-info
                    assigned_agents = mesh.auto_assign_agents(remote_name, remote_agents)
            else:
                assigned_agents = mesh.auto_assign_agents(remote_name, remote_agents)
    except Exception:
        # Agent Card fetch failed — fall back to node-info agents list
        assigned_agents = mesh.auto_assign_agents(remote_name, remote_agents)

    mesh.reload()

    return {
        "success": True,
        "node_name": remote_name,
        "node_url": remote_url,
        "assigned_agents": assigned_agents,
    }


def accept_pair(node_info: dict[str, Any]) -> dict[str, Any]:
    """Accept a pairing request from a remote node — update local nodes.toml."""
    name = node_info.get("name", "")
    url = node_info.get("url", "")
    if not name or not url:
        return {"success": False, "error": "Missing name or url"}
    agents = node_info.get("agents", [])
    if isinstance(agents, list):
        agents = [str(a) for a in agents]
    mesh = get_mesh_router()
    mesh.add_node(name, url, agents=agents)
    mesh.reload()
    logger.info("accept_pair: added node %r url=%r agents=%s", name, url, agents)
    return {"success": True, "node_name": name}


async def list_nodes() -> list[dict[str, Any]]:
    """List all configured nodes with online/offline status."""
    import httpx
    mesh = get_mesh_router()
    nodes = []
    for node_name, node_url in mesh._node_urls.items():
        is_self = node_name == mesh._self_name
        status = "self" if is_self else "unknown"
        if not is_self:
            try:
                async with httpx.AsyncClient(timeout=3.0) as client:
                    resp = await client.get(f"{node_url.rstrip('/')}/health")
                    status = "online" if resp.status_code == 200 else "error"
            except Exception:
                status = "offline"
        nodes.append({
            "name": node_name,
            "url": node_url,
            "status": status,
            "is_self": is_self,
            "agents": mesh._node_agents.get(node_name, []),
        })
    return nodes


def disconnect_node(name: str) -> bool:
    """Remove a node from nodes.toml."""
    mesh = get_mesh_router()
    ok = mesh.remove_node(name)
    if ok:
        mesh.reload()
    return ok
