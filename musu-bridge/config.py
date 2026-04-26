"""Bridge configuration — no Mattermost dependencies."""
from __future__ import annotations

import os
from dataclasses import dataclass, field


def _default_channel_agent_map() -> dict[str, str]:
    prefix = os.getenv("MUSU_AGENT_PREFIX", "")
    if prefix and not prefix.endswith("-"):
        prefix += "-"
    def _agent(channel: str, default_suffix: str) -> str:
        env_key = f"MUSU_AGENT_{channel.upper()}"
        return os.getenv(env_key, f"{prefix}{default_suffix}")
    return {
        "ceo": _agent("ceo", "CEO"),
        "cto": _agent("cto", "CTO"),
        "engineer": _agent("engineer", "Engineer"),
        "qa": _agent("qa", "QA"),
        "cos": os.getenv("MUSU_AGENT_COS", "cos"),
        "worker": os.getenv("MUSU_AGENT_WORKER", "worker"),
        "team_lead": os.getenv("MUSU_AGENT_TEAM_LEAD", "MD-Lead"),
        "lead": os.getenv("MUSU_AGENT_LEAD", "MD-Lead"),
        "bw_lead": os.getenv("MUSU_AGENT_BW_LEAD", "BW-Lead"),
    }


@dataclass
class BridgeConfig:
    bridge_host: str = field(default_factory=lambda: os.getenv("BRIDGE_HOST", "127.0.0.1"))
    bridge_port: int = field(default_factory=lambda: int(os.getenv("BRIDGE_PORT", "8070")))
    # Public URL advertised to peers during pairing. Set this to the Tailscale IP.
    # e.g. MUSU_BRIDGE_PUBLIC_URL=http://100.121.211.106:8070
    public_url: str = field(default_factory=lambda: os.getenv("MUSU_BRIDGE_PUBLIC_URL", ""))
    # musu.pro cloud node registry token (from musu.pro/account → Node Tokens).
    # When set, musu-bridge registers itself every 30s.
    musu_token: str = field(default_factory=lambda: os.getenv("MUSU_TOKEN", ""))
    # Human-readable name for this node in the registry. Defaults to hostname.
    node_name: str = field(
        default_factory=lambda: os.getenv("MUSU_NODE_NAME", "") or __import__("socket").gethostname()
    )

    # Cloud relay tunnel (musu-relay)
    # Set MUSU_RELAY_ENABLED=true and MUSU_RELAY_URL=wss://your-relay-host to
    # allow musu.pro to proxy requests to this node from any device.
    relay_enabled: bool = field(
        default_factory=lambda: os.getenv("MUSU_RELAY_ENABLED", "false").lower() == "true"
    )
    relay_url: str = field(default_factory=lambda: os.getenv("MUSU_RELAY_URL", ""))

    # Channel name → agent name mapping
    # Defaults use MUSU_NODE_NAME prefix (e.g. "4060-Engineer") to match actual agent names.
    # Override individual channels via MUSU_AGENT_<CHANNEL>=<name> env vars.
    channel_agent_map: dict[str, str] = field(default_factory=lambda: _default_channel_agent_map())


_config: BridgeConfig | None = None


def get_config() -> BridgeConfig:
    global _config
    if _config is None:
        _config = BridgeConfig()
    return _config
