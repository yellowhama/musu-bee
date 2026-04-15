"""musu-mesh: multi-machine node registry.

Parses ~/.musu/nodes.toml and provides:
  - resolve_node()       -> NodeInfo | None
  - resolve_node_url()   -> str  (http://<ip>:<worker_port>)
  - is_local()           -> bool
  - nodes_with_role()    -> list[NodeInfo]
  - llm_for_role()       -> LLMInstance | None
  - check_health()       -> bool   (async, HTTP GET /health)
"""

from __future__ import annotations

import logging
import os
try:
    import tomllib
except ModuleNotFoundError:  # Python < 3.11
    import tomli as tomllib  # type: ignore[no-redef]
import warnings
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

_logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------


@dataclass
class NodeInfo:
    name: str
    tailscale_ip: str
    roles: list[str] = field(default_factory=list)
    gpu: str = ""
    bridge_url: str = ""  # musu-bridge HTTP URL e.g. http://100.x.x.x:8070


@dataclass
class AgentAssignment:
    agent: str
    node: str


@dataclass
class LLMInstance:
    name: str
    node: str
    port: int
    role: str

    @property
    def url(self) -> str:
        raise NotImplementedError("Use registry.llm_url(instance) to resolve URL")


# ---------------------------------------------------------------------------
# Registry
# ---------------------------------------------------------------------------


class MeshRegistry:
    """Loaded from a nodes.toml file; all lookups are O(1)."""

    def __init__(self, config_path: str | Path | None = None) -> None:
        if config_path is None:
            config_path = Path.home() / ".musu" / "nodes.toml"
        self._path = Path(config_path)
        self._self_name: str = ""
        self._worker_port: int = 9700
        self._health_interval: int = 30
        self._nodes: dict[str, NodeInfo] = {}
        self._assignments: list[AgentAssignment] = []
        self._llm_instances: list[LLMInstance] = []
        self._load()

    # ------------------------------------------------------------------
    # Loading
    # ------------------------------------------------------------------

    def _load(self) -> None:
        if not self._path.exists():
            return
        with open(self._path, "rb") as f:
            data = tomllib.load(f)

        mesh = data.get("mesh", {})
        self._self_name = mesh.get("self", "")
        self._worker_port = int(mesh.get("worker_port", 9700))
        self._health_interval = int(mesh.get("health_interval_sec", 30))

        for node_dict in mesh.get("nodes", []):
            node_name = node_dict.get("name")
            tailscale_ip = node_dict.get("tailscale_ip")
            if not node_name or not tailscale_ip:
                raise ValueError(
                    f"nodes.toml: each [[mesh.nodes]] entry must have 'name' and "
                    f"'tailscale_ip' (got: {node_dict!r})"
                )
            n = NodeInfo(
                name=node_name,
                tailscale_ip=tailscale_ip,
                roles=node_dict.get("roles", []),
                gpu=node_dict.get("gpu", ""),
                bridge_url=node_dict.get("url", ""),
            )
            self._nodes[n.name] = n

        if self._self_name and self._self_name not in self._nodes:
            warnings.warn(
                f"nodes.toml: mesh.self = {self._self_name!r} is not in the loaded "
                f"nodes list; is_local() will return False for all nodes. "
                f"Check your [[mesh.nodes]] entries.",
                stacklevel=2,
            )

        for aa in mesh.get("agent_assignments", []):
            self._assignments.append(
                AgentAssignment(agent=aa["agent"], node=aa["node"])
            )

        for llm in mesh.get("llm_instances", []):
            self._llm_instances.append(
                LLMInstance(
                    name=llm["name"],
                    node=llm["node"],
                    port=int(llm["port"]),
                    role=llm["role"],
                )
            )

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def resolve_node(self, name: str) -> NodeInfo | None:
        return self._nodes.get(name)

    def resolve_node_url(self, name: str) -> str:
        node = self._nodes.get(name)
        if node is None:
            raise KeyError(f"Unknown node: {name!r}")
        return f"http://{node.tailscale_ip}:{self._worker_port}"

    def is_local(self, name: str) -> bool:
        return name == self._self_name

    def nodes_with_role(self, role: str) -> list[NodeInfo]:
        return [n for n in self._nodes.values() if role in n.roles]

    def llm_for_role(self, role: str) -> LLMInstance | None:
        for inst in self._llm_instances:
            if inst.role == role:
                return inst
        return None

    def llm_url(self, instance: LLMInstance) -> str:
        node = self._nodes.get(instance.node)
        if node is None:
            raise KeyError(f"Unknown node for LLM instance {instance.name!r}: {instance.node!r}")
        return f"http://{node.tailscale_ip}:{instance.port}"

    def node_for_agent(self, agent: str) -> str | None:
        for aa in self._assignments:
            if aa.agent == agent:
                return aa.node
        return None

    def bridge_url_for_node(self, node_name: str) -> str | None:
        """Return the musu-bridge HTTP URL for the named node, or None."""
        node = self._nodes.get(node_name)
        if node is None:
            return None
        return node.bridge_url or None

    def bridge_url_for_agent(self, agent: str) -> str | None:
        """Return the musu-bridge HTTP URL for the node that runs *agent*."""
        node = self.node_for_agent(agent)
        if node is None:
            return None
        return self.bridge_url_for_node(node)

    def all_nodes(self) -> list[NodeInfo]:
        return list(self._nodes.values())

    async def check_health(self, name: str, timeout: float = 5.0) -> bool:
        """HTTP GET <node_url>/health — returns True if 200."""
        try:
            import httpx
            url = self.resolve_node_url(name)
            async with httpx.AsyncClient(timeout=timeout) as client:
                resp = await client.get(f"{url}/health")
                return resp.status_code == 200
        except Exception:
            return False

    # ------------------------------------------------------------------
    # Properties
    # ------------------------------------------------------------------

    @property
    def self_name(self) -> str:
        return self._self_name

    @property
    def worker_port(self) -> int:
        return self._worker_port


# ---------------------------------------------------------------------------
# Module-level singleton (lazy)
# ---------------------------------------------------------------------------

_registry: MeshRegistry | None = None


def get_registry(config_path: str | Path | None = None) -> MeshRegistry:
    global _registry
    if _registry is None:
        _registry = MeshRegistry(config_path)
    return _registry


def reload_registry(config_path: str | Path | None = None) -> MeshRegistry:
    global _registry
    _registry = MeshRegistry(config_path)
    return _registry
