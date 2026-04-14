"""Mesh router — reads nodes.toml and forwards messages to remote musu-bridge nodes."""
from __future__ import annotations

import logging
import tomllib
from pathlib import Path
from typing import Any

import httpx

logger = logging.getLogger(__name__)

_DEFAULT_CONFIG_PATH = Path.home() / ".musu" / "nodes.toml"


class MeshRouter:
    """Resolves agent→node mapping from nodes.toml and forwards requests to remote nodes."""

    def __init__(self, config_path: Path | str | None = None) -> None:
        self._path = Path(config_path) if config_path else _DEFAULT_CONFIG_PATH
        self._self_name: str = ""
        self._node_urls: dict[str, str] = {}       # node_name → musu-bridge URL
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


# ── Module-level singleton ─────────────────────────────────────────────────────

_router: MeshRouter | None = None


def get_mesh_router() -> MeshRouter:
    global _router
    if _router is None:
        _router = MeshRouter()
    return _router
