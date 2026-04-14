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


def _sanitize_toml_value(value: str) -> str:
    """Strip characters that would break a TOML bare string literal."""
    # Remove newlines, carriage returns, quotes, and backslashes to prevent injection
    return value.replace("\n", "").replace("\r", "").replace('"', "").replace("\\", "").strip()


def cmd_init(args: argparse.Namespace) -> int:
    """Write (or update) ~/.musu/nodes.toml with [mesh] self + public_url."""
    node_name = _sanitize_toml_value(os.getenv("MUSU_NODE_NAME") or socket.gethostname())
    bridge_port = int(os.getenv("BRIDGE_PORT", "8070"))

    tailscale_ip = _get_tailscale_ip()
    public_url = _sanitize_toml_value(
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
        rc = cmd_seed(args)
        if rc != 0:
            return rc
    if getattr(args, "service", False):
        return cmd_generate_service(node_name, public_url, user_mode=getattr(args, "user", False))
    return 0


def cmd_generate_service(node_name: str, public_url: str, user_mode: bool = False) -> int:
    """Generate a systemd service file for musu-bridge."""
    import shutil

    python_path = shutil.which("python3") or sys.executable
    bridge_dir = str(Path(__file__).parent.resolve())
    wanted_by = "default.target" if user_mode else "multi-user.target"
    env_lines = f"Environment=MUSU_NODE_NAME={node_name}\n"
    if public_url:
        env_lines += f"Environment=MUSU_BRIDGE_PUBLIC_URL={public_url}\n"

    # Quote paths to handle spaces in directory names
    service_content = (
        f"[Unit]\n"
        f"Description=musu-bridge agent routing server ({node_name})\n"
        f"After=network.target\n"
        f"\n"
        f"[Service]\n"
        f"Type=simple\n"
        f'WorkingDirectory="{bridge_dir}"\n'
        f'ExecStart={python_path} "{bridge_dir}/server.py"\n'
        f"Restart=always\n"
        f"RestartSec=5\n"
        f"{env_lines}"
        f"StandardOutput=journal\n"
        f"StandardError=journal\n"
        f"\n"
        f"[Install]\n"
        f"WantedBy={wanted_by}\n"
    )

    if user_mode:
        service_dir = Path.home() / ".config" / "systemd" / "user"
        service_dir.mkdir(parents=True, exist_ok=True)
        out_path = service_dir / "musu-bridge.service"
    else:
        out_path = Path("/etc/systemd/system/musu-bridge.service")

    try:
        out_path.write_text(service_content)
    except PermissionError:
        print(f"ERROR: cannot write to {out_path} — run with sudo or use --user", file=sys.stderr)
        return 1

    print(f"Created: {out_path}")
    if user_mode:
        print("  Run: systemctl --user daemon-reload")
        print("  Run: systemctl --user enable musu-bridge")
        print("  Run: systemctl --user start musu-bridge")
    else:
        print("  Run: sudo systemctl daemon-reload")
        print("  Run: sudo systemctl enable musu-bridge")
        print("  Run: sudo systemctl start musu-bridge")
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
    p_init.add_argument("--service", action="store_true", help="Also generate systemd service file")
    p_init.add_argument("--user", action="store_true", help="Generate user-level service (~/.config/systemd/user/)")

    sub.add_parser("seed", help="Seed 6 default agents into the database")

    p_svc = sub.add_parser("service", help="Generate systemd service file only")
    p_svc.add_argument("--user", action="store_true", help="Generate user-level service (~/.config/systemd/user/)")

    args = parser.parse_args()
    if args.command == "init":
        sys.exit(cmd_init(args))
    elif args.command == "seed":
        sys.exit(cmd_seed(args))
    elif args.command == "service":
        node_name = _sanitize_toml_value(os.getenv("MUSU_NODE_NAME") or __import__("socket").gethostname())
        tailscale_ip = _get_tailscale_ip()
        bridge_port = int(os.getenv("BRIDGE_PORT", "8070"))
        public_url = _sanitize_toml_value(
            os.getenv("MUSU_BRIDGE_PUBLIC_URL")
            or (f"http://{tailscale_ip}:{bridge_port}" if tailscale_ip else "")
        )
        sys.exit(cmd_generate_service(node_name, public_url, user_mode=args.user))


if __name__ == "__main__":
    main()
