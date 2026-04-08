#!/usr/bin/env python3
"""Remote process runner via musu-worker (/execute/process).

Example:
  python scripts/musu_remote_process.py --node main-pc -- echo hello
  python scripts/musu_remote_process.py --url http://100.121.211.106:9700 -- ls -la
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import tomllib
import urllib.error
import urllib.request
from pathlib import Path


def _resolve_worker_url_from_nodes_toml(node: str, config: Path) -> str:
    data = tomllib.loads(config.read_text(encoding="utf-8"))
    mesh = data.get("mesh", {})
    worker_port = int(mesh.get("worker_port", 9700))
    for nd in mesh.get("nodes", []):
        if str(nd.get("name")) == node:
            ip = nd.get("tailscale_ip")
            if not ip:
                break
            return f"http://{ip}:{worker_port}"
    raise SystemExit(f"Unknown node {node!r} in {config}")


def _post_json(url: str, payload: dict, token: str | None, timeout_sec: float) -> tuple[int, str]:
    data = json.dumps(payload).encode("utf-8")
    headers = {"Content-Type": "application/json", "Accept": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(url, data=data, headers=headers, method="POST")
    with urllib.request.urlopen(req, timeout=timeout_sec) as resp:
        return resp.status, resp.read().decode("utf-8", errors="replace")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--node",
        help="Node name from ~/.musu/nodes.toml (resolves worker_url automatically)",
    )
    parser.add_argument(
        "--config",
        default=str(Path.home() / ".musu" / "nodes.toml"),
        help="Path to nodes.toml (default: ~/.musu/nodes.toml)",
    )
    parser.add_argument("--url", help="Worker base URL, e.g. http://100.x.x.x:9700")
    parser.add_argument(
        "--token",
        default=os.environ.get("MUSU_WORKER_TOKEN"),
        help="Bearer token (default: env MUSU_WORKER_TOKEN)",
    )
    parser.add_argument("--cwd", help="Remote working directory")
    parser.add_argument("--timeout", type=float, default=30.0, help="Timeout seconds (default: 30)")
    parser.add_argument("command", nargs=argparse.REMAINDER, help="Command and args after --")
    args = parser.parse_args()

    cmd = [c for c in args.command if c != "--"]
    if not cmd:
        print("Usage: musu_remote_process.py --node <name> -- <command> [args...]", file=sys.stderr)
        return 2

    if args.url:
        worker_url = args.url.rstrip("/")
    elif args.node:
        config_path = Path(args.config)
        if not config_path.exists():
            print(f"nodes.toml not found: {config_path}", file=sys.stderr)
            return 2
        worker_url = _resolve_worker_url_from_nodes_toml(args.node, config_path).rstrip("/")
    else:
        print("Provide --url or --node", file=sys.stderr)
        return 2

    payload: dict = {
        "command": cmd[0],
        "args": cmd[1:],
        "timeout_sec": int(args.timeout),
        "env": {},
    }
    if args.cwd:
        payload["cwd"] = args.cwd

    try:
        status, body = _post_json(f"{worker_url}/execute/process", payload, args.token, timeout_sec=float(args.timeout) + 5.0)
    except urllib.error.HTTPError as e:
        err = e.read().decode("utf-8", errors="replace") if hasattr(e, "read") else str(e)
        print(f"HTTP {e.code}: {err[:400]}", file=sys.stderr)
        return 1
    except urllib.error.URLError as e:
        print(f"Connect error: {e.reason}", file=sys.stderr)
        return 1
    except Exception as e:
        print(f"Error: {type(e).__name__}: {e}", file=sys.stderr)
        return 1

    try:
        data = json.loads(body) if body else {}
    except Exception:
        print(f"Worker returned non-JSON (HTTP {status}): {body[:400]}", file=sys.stderr)
        return 1

    stdout = (data.get("stdout") or "").rstrip("\n")
    stderr = (data.get("stderr") or "").rstrip("\n")
    exit_code = int(data.get("exit_code", -1))
    success = bool(data.get("success", exit_code == 0))

    if stdout:
        print(stdout)
    if stderr:
        print(stderr, file=sys.stderr)
    return 0 if success else (exit_code if exit_code != 0 else 1)


if __name__ == "__main__":
    raise SystemExit(main())

