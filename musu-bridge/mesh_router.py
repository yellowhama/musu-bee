"""Mesh router — reads nodes.toml and forwards messages to remote musu-bridge nodes."""
from __future__ import annotations

import logging
import threading
import tomllib
from pathlib import Path
from typing import Any

import httpx

logger = logging.getLogger(__name__)

_DEFAULT_CONFIG_PATH = Path.home() / ".musu" / "nodes.toml"
_TOML_WRITE_LOCK = threading.Lock()


class MeshRouter:
    """Resolves agent→node mapping from nodes.toml and forwards requests to remote nodes."""

    def __init__(self, config_path: Path | str | None = None) -> None:
        self._path = Path(config_path) if config_path else _DEFAULT_CONFIG_PATH
        self._self_name: str = ""
        self._node_urls: dict[str, str] = {}       # node_name → musu-bridge URL
        self._node_agents: dict[str, list[str]] = {}  # node_name → agent list
        self._agent_nodes: dict[str, str] = {}     # agent_name (lowercase) → node_name
        self._loaded = False
        self._load()

    # ── Config loading ─────────────────────────────────────────────────────────

    def _load(self) -> None:
        if not self._path.exists():
            logger.warning("mesh_router: nodes.toml not found at %s — mesh disabled", self._path)
            return
        try:
            with open(self._path, "rb") as f:
                data = tomllib.load(f)
            mesh = data.get("mesh", {})
            self._self_name = mesh.get("self", "")

            for node in mesh.get("nodes", []):
                name = node.get("name", "")
                url = node.get("url", "")
                if name and url:
                    self._node_urls[name] = url
                    agents = node.get("agents", [])
                    if isinstance(agents, list):
                        self._node_agents[name] = [str(a) for a in agents]

            for assign in mesh.get("agent_assignments", []):
                agent = assign.get("agent", "").lower()
                node = assign.get("node", "")
                if agent and node:
                    self._agent_nodes[agent] = node

            self._loaded = True
            logger.info(
                "mesh_router: loaded — self=%r, nodes=%s, agents=%s",
                self._self_name,
                list(self._node_urls),
                list(self._agent_nodes),
            )
        except Exception:
            logger.exception("mesh_router: failed to load %s", self._path)

    # ── Public API ─────────────────────────────────────────────────────────────

    @property
    def enabled(self) -> bool:
        return self._loaded and bool(self._self_name)

    def node_for_agent(self, agent_name: str) -> str | None:
        """Return the node name for an agent, or None if local / unknown."""
        return self._agent_nodes.get(agent_name.lower())

    def is_remote(self, agent_name: str) -> bool:
        """True if the agent is assigned to a node other than self."""
        node = self.node_for_agent(agent_name)
        return node is not None and node != self._self_name

    def url_for_node(self, node_name: str) -> str | None:
        """Return the musu-bridge URL for a node name."""
        return self._node_urls.get(node_name)

    # ── Node management ────────────────────────────────────────────────────────

    def auto_assign_agents(self, node_name: str, remote_agents: list[str]) -> list[str]:
        """Assign remote agents to node_name if not already assigned anywhere.

        Existing assignments are preserved (first-write wins).
        Persists the updated agent_assignments to nodes.toml.
        Returns the list of newly assigned agent names.
        """
        newly_assigned: list[str] = []
        for agent in remote_agents:
            key = agent.lower()
            if key not in self._agent_nodes:
                self._agent_nodes[key] = node_name
                newly_assigned.append(agent)
        if newly_assigned:
            self._write_toml()
            logger.info(
                "mesh_router: auto-assigned %s → node=%r", newly_assigned, node_name
            )
        return newly_assigned

    def add_node(self, name: str, url: str, agents: list[str] | None = None) -> None:
        """Add a node to the in-memory map and persist to nodes.toml."""
        self._node_urls[name] = url
        if agents is not None:
            self._node_agents[name] = agents
        self._write_toml()
        logger.info("mesh_router: added node %r url=%r agents=%s", name, url, agents)

    def remove_node(self, name: str) -> bool:
        """Remove a node from the in-memory map and persist to nodes.toml."""
        if name not in self._node_urls:
            return False
        del self._node_urls[name]
        # Also remove agent assignments pointing to this node
        self._agent_nodes = {a: n for a, n in self._agent_nodes.items() if n != name}
        self._write_toml()
        logger.info("mesh_router: removed node %r", name)
        return True

    def reload(self) -> None:
        """Re-read nodes.toml without restarting the server."""
        self._self_name = ""
        self._node_urls = {}
        self._node_agents = {}
        self._agent_nodes = {}
        self._loaded = False
        self._load()
        logger.info("mesh_router: reloaded")

    def _write_toml(self) -> None:
        """Persist current node state back to nodes.toml.

        Reads the existing file to preserve unknown fields (llm_instances, etc.),
        then rewrites the [[mesh.nodes]] section with the current node map.
        Thread-safe via module-level lock.
        """
        with _TOML_WRITE_LOCK:
            self._write_toml_locked()

    def _write_toml_locked(self) -> None:
        """Internal — must be called under _TOML_WRITE_LOCK."""
        # Create file with minimal structure if it doesn't exist yet
        if not self._path.exists():
            self._path.parent.mkdir(parents=True, exist_ok=True)
            data: dict = {"mesh": {"self": self._self_name, "nodes": []}}
            try:
                self._path.write_text(_dict_to_toml(data))
            except Exception:
                logger.exception("mesh_router: failed to create %s", self._path)
                return
        try:
            with open(self._path, "rb") as f:
                import tomllib as _tomllib
                data = _tomllib.load(f)
        except Exception:
            logger.exception("mesh_router: failed to read %s for write", self._path)
            return

        mesh = data.get("mesh", {})

        # Rebuild nodes list: keep existing metadata, upsert new nodes
        existing_nodes: list[dict] = mesh.get("nodes", [])
        existing_by_name = {n["name"]: n for n in existing_nodes if "name" in n}
        for node_name, node_url in self._node_urls.items():
            agents = self._node_agents.get(node_name, [])
            if node_name in existing_by_name:
                existing_by_name[node_name]["url"] = node_url
                if agents:
                    existing_by_name[node_name]["agents"] = agents
            else:
                entry: dict = {"name": node_name, "url": node_url}
                if agents:
                    entry["agents"] = agents
                existing_by_name[node_name] = entry
        # Remove nodes that are no longer in _node_urls
        new_nodes = [v for k, v in existing_by_name.items() if k in self._node_urls]
        mesh["nodes"] = new_nodes

        # Rebuild agent_assignments from _agent_nodes
        mesh["agent_assignments"] = [
            {"agent": agent, "node": node}
            for agent, node in self._agent_nodes.items()
        ]

        data["mesh"] = mesh

        # Serialize to TOML manually (tomllib is read-only, use simple writer)
        try:
            toml_str = _dict_to_toml(data)
            self._path.write_text(toml_str)
            logger.info("mesh_router: nodes.toml updated (%d nodes)", len(new_nodes))
        except Exception:
            logger.exception("mesh_router: failed to write %s", self._path)

    async def forward(
        self,
        node_url: str,
        channel: str,
        sender_id: str,
        text: str,
    ) -> dict[str, Any]:
        """HTTP POST to remote musu-bridge /api/route and return the response dict."""
        target = f"{node_url.rstrip('/')}/api/route"
        payload = {"channel": channel, "sender_id": sender_id, "text": text}
        try:
            async with httpx.AsyncClient(timeout=300.0) as client:
                resp = await client.post(target, json=payload)
                if resp.status_code != 200:
                    logger.warning(
                        "mesh_router: remote %s returned %s", target, resp.status_code
                    )
                    return {"error": "remote_error", "response": None}
                return resp.json()
        except httpx.ConnectError:
            logger.warning("mesh_router: cannot connect to %s", target)
            return {"error": "remote_unreachable", "response": None}
        except httpx.TimeoutException:
            logger.warning("mesh_router: timeout waiting for %s", target)
            return {"error": "agent_timeout", "response": None}
        except Exception:
            logger.exception("mesh_router: unexpected error forwarding to %s", target)
            return {"error": "remote_error", "response": None}


# ── TOML writer (tomllib is read-only) ────────────────────────────────────────

def _toml_value(v: object) -> str:
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, int):
        return str(v)
    if isinstance(v, float):
        return str(v)
    if isinstance(v, str):
        escaped = (
            v.replace("\\", "\\\\")
            .replace('"', '\\"')
            .replace("\n", "\\n")
            .replace("\r", "\\r")
            .replace("\t", "\\t")
        )
        return f'"{escaped}"'
    if isinstance(v, list):
        items = ", ".join(_toml_value(i) for i in v)
        return f"[{items}]"
    return f'"{v}"'


def _dict_to_toml(data: dict) -> str:
    """Minimal TOML serializer sufficient for nodes.toml structure."""
    lines: list[str] = []
    array_of_tables: list[tuple[str, list[dict]]] = []

    # Top-level scalar + inline table keys first
    for key, val in data.items():
        if isinstance(val, dict):
            lines.append(f"\n[{key}]")
            for k2, v2 in val.items():
                if isinstance(v2, list) and v2 and isinstance(v2[0], dict):
                    # array of tables — defer to end
                    array_of_tables.append((f"{key}.{k2}", v2))
                elif isinstance(v2, dict):
                    pass  # nested tables not needed for nodes.toml
                else:
                    lines.append(f"{k2} = {_toml_value(v2)}")
        else:
            lines.append(f"{key} = {_toml_value(val)}")

    for table_key, items in array_of_tables:
        for item in items:
            lines.append(f"\n[[{table_key}]]")
            for k, v in item.items():
                lines.append(f"{k} = {_toml_value(v)}")

    return "\n".join(lines) + "\n"


# ── Module-level singleton ─────────────────────────────────────────────────────

_router: MeshRouter | None = None


def get_mesh_router() -> MeshRouter:
    global _router
    if _router is None:
        _router = MeshRouter()
    return _router
