#!/usr/bin/env python3
"""Mesh healthcheck for musu-worker nodes.

Reads ~/.musu/nodes.toml and checks:
  - GET  http://<tailscale_ip>:<worker_port>/health
  - (optional) GET /capabilities with Bearer token if provided via env/flag

Exit codes:
  0: all nodes healthy
  2: one or more nodes unhealthy
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
import tomllib
import urllib.error
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Any


@dataclass(frozen=True)
class Node:
    name: str
    ip: str
    roles: list[str]
    gpu: str

    @property
    def label(self) -> str:
        return f"{self.name}({self.ip})"


def _read_nodes(config_path: Path) -> tuple[int, list[Node]]:
    if not config_path.exists():
        return 1, []
    data = tomllib.loads(config_path.read_text(encoding="utf-8"))
    mesh = data.get("mesh", {})
    worker_port = int(mesh.get("worker_port", 9700))
    nodes: list[Node] = []
    for nd in mesh.get("nodes", []):
        name = nd.get("name")
        ip = nd.get("tailscale_ip")
        if not name or not ip:
            continue
        nodes.append(
            Node(
                name=str(name),
                ip=str(ip),
                roles=list(nd.get("roles", []) or []),
                gpu=str(nd.get("gpu", "") or ""),
            )
        )
    return worker_port, nodes


def _http_get_json(url: str, *, token: str | None, timeout_sec: float) -> tuple[int, Any]:
    headers = {"Accept": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(url, headers=headers, method="GET")
    with urllib.request.urlopen(req, timeout=timeout_sec) as resp:
        raw = resp.read().decode("utf-8", errors="replace")
        try:
            return resp.status, json.loads(raw) if raw else {}
        except Exception:
            return resp.status, {"_non_json_body": raw[:200]}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--config",
        default=str(Path.home() / ".musu" / "nodes.toml"),
        help="Path to nodes.toml (default: ~/.musu/nodes.toml)",
    )
    parser.add_argument(
        "--token",
        default=os.environ.get("MUSU_WORKER_TOKEN"),
        help="Bearer token for /capabilities (default: env MUSU_WORKER_TOKEN)",
    )
    parser.add_argument(
        "--timeout",
        type=float,
        default=3.0,
        help="Per-request timeout seconds (default: 3.0)",
    )
    parser.add_argument(
        "--capabilities",
        action="store_true",
        help="Also check /capabilities (requires token unless worker is open mode).",
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="Emit JSON summary only.",
    )
    args = parser.parse_args()

    worker_port, nodes = _read_nodes(Path(args.config))
    if not nodes:
        if args.json:
            print(json.dumps({"ok": False, "error": "no nodes found", "config": args.config}))
        else:
            print(f"no nodes found in {args.config}")
        return 2

    results: list[dict[str, Any]] = []
    all_ok = True
    for node in nodes:
        base = f"http://{node.ip}:{worker_port}"
        entry: dict[str, Any] = {
            "name": node.name,
            "ip": node.ip,
            "worker_port": worker_port,
            "roles": node.roles,
            "gpu": node.gpu,
            "health_url": f"{base}/health",
            "ok": False,
        }
        t0 = time.time()
        try:
            status, payload = _http_get_json(f"{base}/health", token=None, timeout_sec=float(args.timeout))
            entry["health_http"] = status
            entry["health"] = payload
            entry["ok"] = status == 200 and isinstance(payload, dict) and payload.get("status") == "ok"
        except urllib.error.HTTPError as e:
            entry["health_http"] = e.code
            entry["error"] = f"HTTPError: {e}"
        except urllib.error.URLError as e:
            entry["error"] = f"URLError: {e.reason}"
        except Exception as e:
            entry["error"] = f"{type(e).__name__}: {e}"
        entry["health_latency_ms"] = int((time.time() - t0) * 1000)

        if args.capabilities:
            t1 = time.time()
            try:
                status, payload = _http_get_json(
                    f"{base}/capabilities",
                    token=args.token,
                    timeout_sec=float(args.timeout),
                )
                entry["capabilities_http"] = status
                entry["capabilities"] = payload
            except urllib.error.HTTPError as e:
                entry["capabilities_http"] = e.code
                entry["capabilities_error"] = f"HTTPError: {e}"
            except urllib.error.URLError as e:
                entry["capabilities_error"] = f"URLError: {e.reason}"
            except Exception as e:
                entry["capabilities_error"] = f"{type(e).__name__}: {e}"
            entry["capabilities_latency_ms"] = int((time.time() - t1) * 1000)

        all_ok = all_ok and bool(entry["ok"])
        results.append(entry)

    if args.json:
        print(json.dumps({"ok": all_ok, "nodes": results}, ensure_ascii=False))
    else:
        for r in results:
            status = "ok" if r["ok"] else "FAIL"
            extra = ""
            if not r["ok"]:
                extra = f" ({r.get('error') or 'unknown error'})"
            print(f"{status} {r['name']} {r['ip']}:{r['worker_port']}{extra}")
            if args.capabilities:
                cap_http = r.get("capabilities_http")
                if cap_http == 200:
                    caps = r.get("capabilities") or {}
                    print(f"  capabilities: clis={caps.get('clis')} adapters={caps.get('adapters')}")
                else:
                    print(f"  capabilities: http={cap_http} err={r.get('capabilities_error')}")

    return 0 if all_ok else 2


if __name__ == "__main__":
    raise SystemExit(main())

