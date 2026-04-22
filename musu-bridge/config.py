"""Bridge configuration — no Mattermost dependencies."""
from __future__ import annotations

import os
from dataclasses import dataclass, field


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
    # Channel "engineer" maps to agent named "engineer" in musu-core
    channel_agent_map: dict[str, str] = field(default_factory=lambda: {
        "ceo": "ceo",
        "cto": "cto",
        "engineer": "engineer",
        "cos": "cos",
        "qa": "qa",
        "worker": "worker",
        "team_lead": "lead",
    })


_config: BridgeConfig | None = None


def get_config() -> BridgeConfig:
    global _config
    if _config is None:
        _config = BridgeConfig()
    return _config
