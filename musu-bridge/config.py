"""Bridge configuration — no Mattermost dependencies."""
from __future__ import annotations

import os
from dataclasses import dataclass, field


def _default_channel_agent_map() -> dict[str, str]:
    """Channel→agent map.

    Generic channels (ceo/cto/engineer/qa/cos/worker/lead/team_lead) come from
    env vars with a prefix fallback. User-specific channel routings (BW PM
    channels, custom company channels) live in the active company manifest
    at ``MUSU_COMPANY_YAML``; v11-iso1 moved them out of this file.
    """
    prefix = os.getenv("MUSU_AGENT_PREFIX", "")
    if prefix and not prefix.endswith("-"):
        prefix += "-"
    def _agent(channel: str, default_suffix: str) -> str:
        env_key = f"MUSU_AGENT_{channel.upper()}"
        return os.getenv(env_key, f"{prefix}{default_suffix}")
    generic: dict[str, str] = {
        "ceo": _agent("ceo", "CEO"),
        "cto": _agent("cto", "CTO"),
        "engineer": _agent("engineer", "Engineer"),
        "qa": _agent("qa", "QA"),
        "cos": os.getenv("MUSU_AGENT_COS", f"{prefix}cos"),
        "worker": os.getenv("MUSU_AGENT_WORKER", f"{prefix}worker"),
        "team_lead": os.getenv("MUSU_AGENT_TEAM_LEAD", f"{prefix}TeamLead"),
        "lead": os.getenv("MUSU_AGENT_LEAD", f"{prefix}MD-Lead"),
    }

    # Layer the active company's channel_routing on top.
    try:
        from company_loader import channel_routing, load_company_manifest
        manifest = load_company_manifest()
        generic.update(channel_routing(manifest))
    except Exception:
        # company_loader missing or yaml malformed — generic map only.
        pass

    return generic


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
