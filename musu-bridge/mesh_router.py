"""Mesh router — reads nodes.toml and forwards messages to remote musu-bridge nodes."""
from __future__ import annotations

import logging
import os
import threading
import time
from collections import defaultdict, deque
from dataclasses import dataclass, field
try:
    import tomllib
except ModuleNotFoundError:  # Python < 3.11
    import tomli as tomllib  # type: ignore[no-redef]
from pathlib import Path
from typing import Any

import httpx


# ── Per-channel circuit breaker ───────────────────────────────────────────────

class CircuitBreaker:
    """Per-channel circuit breaker (CLOSED / OPEN / HALF-OPEN).

    CLOSED  → normal operation
    OPEN    → after failure_threshold failures; skip forwarding for cooldown_seconds
    HALF-OPEN → after cooldown expires; allow one probe; success → CLOSED, failure → OPEN
    """

    def __init__(self, failure_threshold: int = 3, cooldown_seconds: int = 60) -> None:
        self._threshold = failure_threshold
        self._cooldown = cooldown_seconds
        self._failures: dict[str, deque] = defaultdict(deque)
        self._tripped_at: dict[str, float] = {}

    @classmethod
    def from_env(cls) -> "CircuitBreaker":
        threshold = int(os.environ.get("MUSU_MESH_CB_FAIL_THRESHOLD", "3"))
        cooldown = int(os.environ.get("MUSU_MESH_CB_COOLDOWN_SECONDS", "60"))
        return cls(failure_threshold=threshold, cooldown_seconds=cooldown)

    def is_open(self, channel: str) -> bool:
        now = time.time()
        tripped = self._tripped_at.get(channel)
        if tripped is not None:
            if now - tripped >= self._cooldown:
                # Cooldown expired → HALF-OPEN (allow probe)
                self._tripped_at.pop(channel, None)
                self._failures[channel].clear()
                return False
            return True
        return False

    def record_failure(self, channel: str) -> None:
        self._failures[channel].append(time.time())
        if (
            len(self._failures[channel]) >= self._threshold
            and channel not in self._tripped_at
        ):
            self._tripped_at[channel] = time.time()

    def record_success(self, channel: str) -> None:
        self._tripped_at.pop(channel, None)
        self._failures[channel].clear()


@dataclass
class NodeInfo:
    """Metadata for a mesh node parsed from nodes.toml."""
    name: str
    url: str
    agents: list[str] = field(default_factory=list)
    mac_address: str = ""
    broadcast_ip: str = "255.255.255.255"
    cert_fingerprint: str | None = None
    machine: str = ""         # Physical machine group (e.g., "4060-pc")
    os: str = ""              # "wsl2", "linux", "windows", "macos"
    gpu: str = ""             # GPU description
    rustdesk_id: str = ""     # RustDesk peer ID for remote desktop

logger = logging.getLogger(__name__)

# QUIC proxy sidecar URL (musu-connectsd bridge-proxy).
# Set to "" to disable QUIC and always use HTTP.
# Default: disabled (P2P mesh archived, relay-only architecture)
_QUIC_PROXY_URL = os.getenv("MUSU_QUIC_PROXY_URL", "")

_DEFAULT_CONFIG_PATH = Path.home() / ".musu" / "nodes.toml"
_TOML_WRITE_LOCK = threading.Lock()
_HEALTH_CACHE_TTL = 10.0  # seconds


class MeshRouter:
    """Resolves agent→node mapping from nodes.toml and forwards requests to remote nodes."""

    def __init__(self, config_path: Path | str | None = None) -> None:
        self._path = Path(config_path) if config_path else _DEFAULT_CONFIG_PATH
        self._self_name: str = ""
        self._node_urls: dict[str, str] = {}       # node_name → musu-bridge URL
        self._node_agents: dict[str, list[str]] = {}  # node_name → agent list
        self._agent_nodes: dict[str, str] = {}     # agent_name (lowercase) → node_name
        self._node_tokens: dict[str, str] = {}     # node_name → peer bridge token (optional)
        self._node_mac: dict[str, str] = {}         # node_name → MAC address for Wake-on-LAN
        self._node_broadcast: dict[str, str] = {}   # node_name → broadcast IP for Wake-on-LAN
        self._node_fingerprints: dict[str, str] = {} # node_name → TLS cert fingerprint
        self._node_meta: dict[str, dict] = {}       # node_name → {machine, os, gpu, roles, rustdesk_id}
        self._health_cache: dict[str, tuple[bool, float]] = {}  # node → (alive, checked_at)
        self._cb: CircuitBreaker = CircuitBreaker.from_env()
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
                    token = node.get("token", "")
                    if token:
                        self._node_tokens[name] = token
                    mac = node.get("mac_address", "")
                    if mac:
                        self._node_mac[name] = mac
                    broadcast = node.get("broadcast_ip", "")
                    if broadcast:
                        self._node_broadcast[name] = broadcast
                    fingerprint = node.get("cert_fingerprint", "")
                    if fingerprint:
                        self._node_fingerprints[name] = fingerprint
                    # Machine grouping + OS + GPU + RustDesk
                    self._node_meta[name] = {
                        "machine": node.get("machine", name),
                        "os": node.get("os", "linux"),
                        "gpu": node.get("gpu", ""),
                        "roles": node.get("roles", []),
                        "rustdesk_id": node.get("rustdesk_id", ""),
                        "tailscale_ip": node.get("tailscale_ip", ""),
                    }

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

    def token_for_node(self, node_name: str) -> str:
        """Return the peer bridge token for a node.

        Priority: node-specific token → MUSU_BRIDGE_TOKEN (bridge server auth) → MUSU_TOKEN (account-level) → empty.
        """
        node_token = self._node_tokens.get(node_name, "")
        if node_token:
            return node_token
        # Fallback 1: MUSU_BRIDGE_TOKEN (bridge server authentication)
        bridge_token = os.environ.get("MUSU_BRIDGE_TOKEN", "")
        if bridge_token:
            return bridge_token
        # Fallback 2: account-level MUSU_TOKEN (shared across all nodes)
        try:
            token_file = os.path.expanduser("~/.musu/musu_token")
            if os.path.exists(token_file):
                import pathlib
                return pathlib.Path(token_file).read_text().strip()
        except Exception:
            pass
        return os.environ.get("MUSU_TOKEN", "")

    def set_node_token(self, node_name: str, token: str) -> None:
        """Set (or update) the peer token for a node and persist to nodes.toml."""
        self._node_tokens[node_name] = token
        self._write_toml()
        logger.info("mesh_router: saved token for node %r", node_name)

    def has_node(self, node_name: str) -> bool:
        """Check if a node exists in the mesh."""
        return node_name in self._node_urls

    def mac_for_node(self, node_name: str) -> str:
        """Return the MAC address for Wake-on-LAN, or '' if not configured."""
        return self._node_mac.get(node_name, "")

    def broadcast_for_node(self, node_name: str) -> str:
        """Return the broadcast IP for Wake-on-LAN, or '255.255.255.255' if not set."""
        return self._node_broadcast.get(node_name, "255.255.255.255")

    def fingerprint_for_node(self, node_name: str) -> str | None:
        """Return the TLS cert fingerprint for a node, or None if not known."""
        return self._node_fingerprints.get(node_name)

    def node_info(self, node_name: str) -> NodeInfo | None:
        """Return NodeInfo for a node, or None if not found."""
        url = self._node_urls.get(node_name)
        if url is None:
            return None
        return NodeInfo(
            name=node_name,
            url=url,
            agents=list(self._node_agents.get(node_name, [])),
            mac_address=self._node_mac.get(node_name, ""),
            broadcast_ip=self._node_broadcast.get(node_name, "255.255.255.255"),
            cert_fingerprint=self._node_fingerprints.get(node_name),
        )

    @property
    def node_names(self) -> list[str]:
        """Return a snapshot of all registered node names."""
        return list(self._node_urls)

    def canonical_name_for_agent(self, agent_name: str) -> str:
        """Return the canonical lowercase name for an agent.

        Strips common suffixes (e.g. node-qualified names like "ceo@main-pc")
        and normalises to lowercase. Used for cross-node deduplication so that
        agents with the same role name on different machines are treated as one.
        """
        name = agent_name.lower()
        # Strip @node suffix if present (e.g. "ceo@main-pc" → "ceo")
        if "@" in name:
            name = name.split("@", 1)[0]
        return name

    def agents_on_node(self, node_name: str) -> list[str]:
        """Return the list of agent names assigned to a specific node."""
        return list(self._node_agents.get(node_name, []))

    async def is_node_healthy(self, node_name: str) -> bool:
        """Return True if the node's /health endpoint responds 200.

        Results are cached for _HEALTH_CACHE_TTL seconds to avoid
        hammering the remote on every message.
        """
        cached = self._health_cache.get(node_name)
        if cached is not None and time.time() - cached[1] < _HEALTH_CACHE_TTL:
            return cached[0]
        url = self.url_for_node(node_name)
        if not url:
            self._health_cache[node_name] = (False, time.time())
            return False
        try:
            async with httpx.AsyncClient(timeout=3.0) as client:
                resp = await client.get(f"{url.rstrip('/')}/health")
                alive = resp.status_code == 200
        except Exception:
            alive = False
        self._health_cache[node_name] = (alive, time.time())
        return alive

    async def healthy_remote_nodes(self, exclude: str | None = None) -> list[str]:
        """Return list of healthy remote nodes (excluding self and optionally another)."""
        result = []
        for name in list(self._node_urls.keys()):
            if name == self._self_name or name == exclude:
                continue
            if await self.is_node_healthy(name):
                result.append(name)
        return result

    def recommend_node(self, channel: str) -> str | None:
        """Recommend a node for a channel based on agent role + node capabilities.

        GPU-heavy agents prefer nodes with GPU. Otherwise any remote node.
        Returns None if no suitable remote node found.
        """
        gpu_hints = ("engineer", "worker", "researcher", "builder", "inference")
        needs_gpu = any(h in channel.lower() for h in gpu_hints)

        if needs_gpu:
            for name, meta in self._node_meta.items():
                if name == self._self_name:
                    continue
                if meta.get("gpu"):
                    return name

        # Fallback: any remote node
        for name in self._node_urls:
            if name != self._self_name:
                return name
        return None

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

    def add_node(self, name: str, url: str, agents: list[str] | None = None, cert_fingerprint: str | None = None) -> None:
        """Add a node to the in-memory map and persist to nodes.toml."""
        self._node_urls[name] = url
        if agents is not None:
            self._node_agents[name] = agents
        if cert_fingerprint:
            self._node_fingerprints[name] = cert_fingerprint
        self._write_toml()
        logger.info("mesh_router: added node %r url=%r agents=%s fingerprint=%s", name, url, agents, cert_fingerprint)

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
        self._node_meta: dict[str, dict] = {}
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
                data = tomllib.load(f)
        except Exception:
            logger.exception("mesh_router: failed to read %s for write", self._path)
            return

        mesh = data.get("mesh", {})

        # Rebuild nodes list: keep existing metadata, upsert new nodes
        existing_nodes: list[dict] = mesh.get("nodes", [])
        existing_by_name = {n["name"]: n for n in existing_nodes if "name" in n}
        for node_name, node_url in self._node_urls.items():
            agents = self._node_agents.get(node_name, [])
            fingerprint = self._node_fingerprints.get(node_name)
            token = self._node_tokens.get(node_name)
            if node_name in existing_by_name:
                existing_by_name[node_name]["url"] = node_url
                if agents:
                    existing_by_name[node_name]["agents"] = agents
                if fingerprint:
                    existing_by_name[node_name]["cert_fingerprint"] = fingerprint
                if token:
                    existing_by_name[node_name]["token"] = token
            else:
                entry: dict = {"name": node_name, "url": node_url}
                if agents:
                    entry["agents"] = agents
                if fingerprint:
                    entry["cert_fingerprint"] = fingerprint
                if token:
                    entry["token"] = token
                existing_by_name[node_name] = entry
        # Remove nodes that are no longer in _node_urls
        new_nodes = [v for k, v in existing_by_name.items() if k in self._node_urls]
        mesh["nodes"] = new_nodes

        # Rebuild agent_assignments: merge file (preserve external edits) with
        # memory _agent_nodes (runtime source of truth). Memory wins on conflict.
        existing_assignments = mesh.get("agent_assignments", [])
        existing_by_agent: dict[str, str] = {}
        for a in existing_assignments:
            agent_name = a.get("agent", "")
            node_name = a.get("node", "")
            if agent_name and node_name:
                existing_by_agent[agent_name.lower()] = node_name

        merged = {**existing_by_agent, **self._agent_nodes}
        mesh["agent_assignments"] = [
            {"agent": agent, "node": node}
            for agent, node in merged.items()
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
        adapter_override: str | None = None,
    ) -> dict[str, Any]:
        """Forward a message to a remote musu-bridge node.

        Tries QUIC sidecar first (musu-connectsd bridge-proxy), falls back to HTTP.
        Per-channel circuit breaker blocks forwarding when channel is OPEN.
        """
        if self._cb.is_open(channel):
            logger.warning("mesh_router: circuit open for channel=%r — skipping forward", channel)
            return {"error": f"circuit open for channel {channel!r}", "response": None}

        node_name = self.node_for_agent(channel)
        fingerprint = self.fingerprint_for_node(node_name) if node_name else None

        if _QUIC_PROXY_URL:
            try:
                result = await self._forward_quic(node_url, channel, sender_id, text, adapter_override, fingerprint)
                self._cb.record_success(channel)
                return result
            except Exception as exc:
                logger.warning(
                    "mesh_router: QUIC proxy failed (%s) — falling back to HTTP", exc
                )
        result = await self._forward_http(node_url, channel, sender_id, text, adapter_override, fingerprint)
        if result.get("error"):
            self._cb.record_failure(channel)
        else:
            self._cb.record_success(channel)
        return result

    async def _forward_quic(
        self,
        node_url: str,
        channel: str,
        sender_id: str,
        text: str,
        adapter_override: str | None = None,
        expected_fingerprint: str | None = None,
    ) -> dict[str, Any]:
        """Forward via local musu-connectsd bridge-proxy (QUIC tunnel)."""
        proxy_target = f"{_QUIC_PROXY_URL.rstrip('/')}/forward"
        payload = {
            "peer_url": node_url,
            "channel": channel,
            "sender_id": sender_id,
            "text": text,
            "adapter_override": adapter_override,
            "expected_fingerprint": expected_fingerprint,
        }
        logger.info(
            "mesh_router: QUIC forward channel=%r → peer=%s (fp=%s)", channel, node_url, expected_fingerprint
        )
        async with httpx.AsyncClient(timeout=305.0) as client:
            resp = await client.post(proxy_target, json=payload)
            resp.raise_for_status()
            return resp.json()

    async def _forward_http(
        self,
        node_url: str,
        channel: str,
        sender_id: str,
        text: str,
        adapter_override: str | None = None,
        expected_fingerprint: str | None = None,
    ) -> dict[str, Any]:
        """HTTP POST to remote musu-bridge /api/route (fallback)."""
        target = f"{node_url.rstrip('/')}/api/route"
        # Note: HTTP fallback does NOT verify fingerprint yet (bridge doesn't use cert pinning for incoming HTTP)
        payload = {
            "channel": channel,
            "sender_id": sender_id,
            "text": text,
            "adapter_override": adapter_override,
        }
        node_name = self.node_for_agent(channel)
        peer_token = self.token_for_node(node_name) if node_name else ""
        headers: dict[str, str] = {}
        if peer_token:
            headers["Authorization"] = f"Bearer {peer_token}"
        logger.info("mesh_router: HTTP forward channel=%r → %s (auth=%s)", channel, target, bool(peer_token))
        try:
            async with httpx.AsyncClient(timeout=300.0) as client:
                resp = await client.post(target, json=payload, headers=headers)
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

    async def forward_watchdog(
        self,
        node_name: str,
        command: str,
    ) -> dict[str, Any]:
        """Send a watchdog command to a node's connectsd via QUIC.

        For the local node: call connectsd HTTP sidecar directly for status.
        For remote nodes: send watchdog frame via QUIC tunnel.

        Allowed commands: "bridge:start" | "bridge:stop" | "bridge:restart" |
                          "agents:cleanup" | "status"
        """
        allowed = {"bridge:start", "bridge:stop", "bridge:restart", "agents:cleanup", "status"}
        if command not in allowed:
            raise ValueError(f"unknown watchdog command: {command!r}")

        quic_proxy = _QUIC_PROXY_URL or "http://127.0.0.1:9443"

        if command == "status" or node_name == self._self_name:
            # "status" always queries local connectsd — the vibecode-town watchdog
            # route ensures status requests always reach the target's own bridge.
            target = f"{quic_proxy.rstrip('/')}/watchdog/status"
            logger.info("mesh_router: watchdog status (local) → %s", target)
            try:
                async with httpx.AsyncClient(timeout=5.0) as client:
                    resp = await client.get(target)
                    resp.raise_for_status()
                    return resp.json()
            except Exception as exc:
                logger.warning("mesh_router: watchdog status failed: %s", exc)
                return {"bridge_running": False, "connectsd_ok": False, "error": str(exc)}

        node_url = self._node_urls.get(node_name)
        if not node_url:
            raise ValueError(f"unknown node: {node_name!r}")

        target = f"{quic_proxy.rstrip('/')}/watchdog/forward"
        payload = {"peer_url": node_url, "command": command}
        logger.info(
            "mesh_router: watchdog forward command=%r → node=%s (%s)",
            command, node_name, node_url,
        )
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(target, json=payload)
            resp.raise_for_status()
            return resp.json()


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


def node_info(node_name: str) -> NodeInfo | None:
    """Module-level shortcut: return NodeInfo for node_name via the singleton router."""
    return get_mesh_router().node_info(node_name)
