"""musu-bridge CLI — one-time setup helpers.

Usage:
    python -m musu_bridge init           # Write ~/.musu/nodes.toml [mesh.self]
    python -m musu_bridge init --seed    # Also seed 6 default agents into DB
    python -m musu_bridge seed           # Seed agents only
"""
from __future__ import annotations

import argparse
import os
import socket
import sys
from pathlib import Path


# ---------------------------------------------------------------------------
# nodes.toml helpers
# ---------------------------------------------------------------------------

_NODES_TOML_PATH = Path.home() / ".musu" / "nodes.toml"


def _get_tailscale_ip() -> str | None:
    """Detect Tailscale IP (100.x.x.x).  Same logic as discovery.py."""
    if env_ip := os.getenv("MUSU_TAILSCALE_IP"):
        return env_ip
    try:
        import socket as _s
        with _s.socket(_s.AF_INET, _s.SOCK_DGRAM) as s:
            s.connect(("100.100.100.100", 80))
            ip = s.getsockname()[0]
            if ip.startswith("100."):
                return ip
    except Exception:
        pass
    try:
        hostname_ip = socket.gethostbyname(socket.gethostname())
        if hostname_ip.startswith("100."):
            return hostname_ip
    except Exception:
        pass
    return None


def cmd_init(args: argparse.Namespace) -> int:
    """Write (or update) ~/.musu/nodes.toml with [mesh] self + public_url."""
    node_name = os.getenv("MUSU_NODE_NAME") or socket.gethostname()
    bridge_port = int(os.getenv("BRIDGE_PORT", "8070"))

    tailscale_ip = _get_tailscale_ip()
    public_url = (
        os.getenv("MUSU_BRIDGE_PUBLIC_URL")
        or (f"http://{tailscale_ip}:{bridge_port}" if tailscale_ip else "")
    )

    _NODES_TOML_PATH.parent.mkdir(parents=True, exist_ok=True)

    # If file already exists, preserve existing content but update [mesh] self/public_url
    if _NODES_TOML_PATH.exists():
        existing = _NODES_TOML_PATH.read_text()
        import re
        # Update or insert self =
        if re.search(r"^self\s*=", existing, re.MULTILINE):
            existing = re.sub(r'^self\s*=.*$', f'self = "{node_name}"', existing, flags=re.MULTILINE)
        else:
            existing = existing.replace("[mesh]", f'[mesh]\nself = "{node_name}"', 1)
        # Update or insert public_url =
        if public_url:
            if re.search(r"^public_url\s*=", existing, re.MULTILINE):
                existing = re.sub(
                    r'^public_url\s*=.*$',
                    f'public_url = "{public_url}"',
                    existing,
                    flags=re.MULTILINE,
                )
            else:
                existing = re.sub(
                    r'^self\s*=.*$',
                    f'self = "{node_name}"\npublic_url = "{public_url}"',
                    existing,
                    flags=re.MULTILINE,
                    count=1,
                )
        _NODES_TOML_PATH.write_text(existing)
        print(f"Updated: {_NODES_TOML_PATH}")
    else:
        url_line = f'public_url = "{public_url}"\n' if public_url else ""
        url_note = "" if public_url else "# Set MUSU_BRIDGE_PUBLIC_URL or connect Tailscale for auto-detection\n"
        content = f"""\
[mesh]
self = "{node_name}"
{url_line}{url_note}
# Add remote nodes below:
# [[mesh.nodes]]
# name = "other-node"
# url = "http://100.x.x.x:8070"
"""
        _NODES_TOML_PATH.write_text(content)
        print(f"Created: {_NODES_TOML_PATH}")

    print(f"  node_name  = {node_name}")
    if public_url:
        print(f"  public_url = {public_url}")
    else:
        print("  public_url = (not set — set MUSU_BRIDGE_PUBLIC_URL or connect Tailscale)")

    if args.seed:
        return cmd_seed(args)
    return 0


def cmd_seed(args: argparse.Namespace) -> int:  # noqa: ARG001
    """Seed 6 default agents into the musu-core database."""
    # Ensure musu-core is on the path
    _core = Path(__file__).parent.parent / "musu-core" / "src"
    if str(_core) not in sys.path:
        sys.path.insert(0, str(_core))

    try:
        from musu_core.config import get_config
        from musu_core.backends.local import LocalBackend
    except ImportError as exc:
        print(f"ERROR: musu-core not found — {exc}", file=sys.stderr)
        return 1

    cfg = get_config()
    backend = LocalBackend(cfg.db_path)

    _AGENTS = [
        ("ceo",      "CEO",           "You are the CEO. Provide strategic guidance and make high-level decisions."),
        ("cto",      "CTO",           "You are the CTO. Provide technical leadership and architectural decisions."),
        ("engineer", "Engineer",      "You are an engineer. Implement tasks and solve technical problems."),
        ("cos",      "Chief of Staff", "You are the Chief of Staff. Coordinate between teams and manage operations."),
        ("qa",       "QA",            "You are the QA engineer. Review work and ensure quality standards."),
        ("worker",   "Worker",        "You are a general worker. Complete assigned tasks efficiently."),
    ]

    seeded = 0
    for agent_id, name, instructions in _AGENTS:
        existing = backend.get_agent(agent_id)
        if existing:
            print(f"  skip  {agent_id} (already exists)")
            continue
        backend.create_agent(
            agent_id=agent_id,
            name=name,
            role=name.lower(),
            adapter_type="claude",
            adapter_config={
                "model": "claude-sonnet-4-6",
                "instructions": instructions,
            },
        )
        print(f"  seeded {agent_id}")
        seeded += 1

    print(f"Seeded {seeded} agents into {cfg.db_path}")
    return 0


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(
        prog="musu-bridge",
        description="musu-bridge setup CLI",
    )
    sub = parser.add_subparsers(dest="command", required=True)

    p_init = sub.add_parser("init", help="Initialize nodes.toml for this machine")
    p_init.add_argument("--seed", action="store_true", help="Also seed 6 default agents")

    sub.add_parser("seed", help="Seed 6 default agents into the database")

    args = parser.parse_args()
    if args.command == "init":
        sys.exit(cmd_init(args))
    elif args.command == "seed":
        sys.exit(cmd_seed(args))


if __name__ == "__main__":
    main()
