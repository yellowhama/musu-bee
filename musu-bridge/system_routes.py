"""System, admin, sync, and watchdog routes for musu-bridge.

Extracted from server.py. Provides node pairing, mesh discovery,
data sync, WoL, system management, and watchdog P2P endpoints.
"""
from __future__ import annotations

import asyncio
import logging
import os
from typing import Annotated, List

from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel, Field

from config import get_config
from handlers import (
    accept_pair, disconnect_node, get_mcp_tools_manifest, get_node_info,
    list_nodes, pair_with_node, receive_companies, receive_messages,
    sync_companies, sync_messages,
)
from system_stats import collect_stats_async
from watchdog import _WATCHDOG_ALLOWED, _WATCHDOG_RATE_WINDOW, _watchdog_rate_check
import mesh_router

logger = logging.getLogger("musu.system_routes")

system_router = APIRouter()


# ── Models ────────────────────────────────────────────────────────────────────

class PairRequest(BaseModel):
    ip: str
    port: int = 8070


class PairAcceptRequest(BaseModel):
    name: str
    url: str
    agents: list[str] = []
    version: str = ""


class SyncPushRequest(BaseModel):
    companies: Annotated[List[dict], Field(max_length=2000)] = []
    messages: Annotated[List[dict], Field(max_length=2000)] = []


class WolRequest(BaseModel):
    mac_address: str
    broadcast_ip: str = "255.255.255.255"
    port: int = 9


# ── Agent Card ────────────────────────────────────────────────────────────────

@system_router.get("/.well-known/agent.json", summary="A2A Agent Card", include_in_schema=False)
async def agent_card() -> dict:
    info = get_node_info()
    return {
        "name": info["name"],
        "description": "MUSU Bridge Node",
        "url": info["url"],
        "version": info["version"],
        "capabilities": {
            "agents": [
                {"id": a, "description": f"{a} agent"}
                for a in info.get("agents", [])
            ],
            "sync": True,
            "protocol": "musu-bridge/0.2",
        },
    }


# ── Admin / Node Management ──────────────────────────────────────────────────

@system_router.get("/api/admin/node-info", summary="This node's identity info")
async def api_node_info() -> dict:
    return get_node_info()


@system_router.post("/api/admin/pair", summary="Pair with a remote node")
async def api_pair(req: PairRequest) -> dict:
    result = await pair_with_node(ip=req.ip, port=req.port)
    if not result.get("success"):
        raise HTTPException(status_code=502, detail=result.get("error", "Pairing failed"))
    return result


@system_router.post("/api/admin/pair/accept", summary="Accept a pairing request from a peer")
async def api_pair_accept(req: PairAcceptRequest) -> dict:
    result = accept_pair({"name": req.name, "url": req.url, "agents": req.agents})
    if not result.get("success"):
        raise HTTPException(status_code=400, detail=result.get("error", "Accept failed"))
    return result


@system_router.get("/api/admin/nodes", summary="List connected nodes with status")
async def api_list_nodes() -> list[dict]:
    return await list_nodes()


@system_router.delete("/api/admin/nodes/{node_name}", summary="Disconnect a node")
async def api_disconnect_node(node_name: str) -> dict:
    ok = disconnect_node(node_name)
    if not ok:
        raise HTTPException(status_code=404, detail=f"Node {node_name!r} not found")
    return {"disconnected": node_name}


@system_router.get("/api/admin/peer-status", summary="MUSU_TOKEN peer discovery status")
async def api_peer_status() -> dict:
    cfg = get_config()
    token_set = bool(cfg.musu_token)
    peers: list[dict] = []
    try:
        from peer_cache import get_peer_cache
        cache = get_peer_cache()
        peers = [
            {"node_name": p.node_name, "public_url": p.public_url}
            for p in cache.all()
        ]
    except Exception:
        pass
    return {
        "cloud_registry_enabled": token_set,
        "node_name": cfg.node_name or "",
        "public_url": cfg.public_url or "",
        "peer_count": len(peers),
        "peers": peers,
    }


@system_router.get("/api/admin/discovered", summary="Nodes discovered via mDNS")
async def api_discovered_nodes() -> list[dict]:
    from discovery import get_discovery, enrich_with_agent_card
    discovery = get_discovery()
    peers = discovery.get_discovered()
    enriched = await asyncio.gather(*[enrich_with_agent_card(p) for p in peers])
    return list(enriched)


@system_router.get("/api/admin/events", summary="Bridge lifecycle events (start/stop)")
async def api_node_events(
    limit: int = Query(default=50, ge=1, le=500),
) -> dict:
    from handlers import _get_backend
    events = _get_backend().list_node_events(limit=limit)
    return {"events": events}


# ── Sync ──────────────────────────────────────────────────────────────────────

@system_router.get("/api/sync/companies", summary="Pull companies for sync")
async def api_sync_companies(
    since: str = Query(default="1970-01-01T00:00:00Z"),
    limit: int = Query(default=500, ge=1, le=2000),
) -> list[dict]:
    return sync_companies(since=since, limit=limit)


@system_router.get("/api/sync/messages", summary="Pull messages for sync")
async def api_sync_messages(
    since: str = Query(default="1970-01-01T00:00:00Z"),
    limit: int = Query(default=500, ge=1, le=2000),
) -> list[dict]:
    return sync_messages(since=since, limit=limit)


@system_router.post("/api/sync/push", summary="Receive sync data from a peer")
async def api_sync_push(req: SyncPushRequest) -> dict:
    c_written = receive_companies(req.companies) if req.companies else 0
    m_written = receive_messages(req.messages) if req.messages else 0
    return {"companies_written": c_written, "messages_written": m_written}


# ── MCP Tools Manifest ───────────────────────────────────────────────────────

@system_router.get("/api/mcp/tools", summary="MCP tools manifest")
async def api_mcp_tools() -> dict:
    return get_mcp_tools_manifest()


# ── System Stats ──────────────────────────────────────────────────────────────

@system_router.get("/api/system/stats", summary="System resource usage")
async def api_system_stats() -> dict:
    return await collect_stats_async()


# ── Wake-on-LAN ──────────────────────────────────────────────────────────────

@system_router.post("/api/wol", summary="Send Wake-on-LAN Magic Packet")
async def api_wol(req: WolRequest, request: Request) -> dict:
    from wol import send_magic_packet
    ok = send_magic_packet(req.mac_address, req.broadcast_ip, req.port)
    if not ok:
        return {"ok": False, "error": "Invalid MAC address format"}
    return {"ok": True}


@system_router.post("/api/wol/node/{node_name}", summary="Wake a node by name")
async def api_wol_node(node_name: str, request: Request) -> dict:
    from wol import send_magic_packet
    node = mesh_router.node_info(node_name)
    if node is None:
        raise HTTPException(status_code=404, detail="Node not found")
    if not node.mac_address:
        raise HTTPException(status_code=422, detail="Node has no mac_address configured")
    ok = send_magic_packet(node.mac_address, node.broadcast_ip)
    if not ok:
        raise HTTPException(status_code=500, detail="Failed to send magic packet (invalid MAC)")
    return {"ok": True, "node": node_name, "mac": node.mac_address}


# ── Watchdog P2P Commands ─────────────────────────────────────────────────────

@system_router.post("/api/watchdog/{node}/{command}")
async def watchdog_command(node: str, command: str, request: Request) -> dict:
    """Send a watchdog command to a node's connectsd via QUIC."""
    if command not in _WATCHDOG_ALLOWED:
        raise HTTPException(status_code=400, detail=f"Unknown watchdog command: {command!r}")
    user_id = request.client.host if request.client else "anonymous"
    if not _watchdog_rate_check(user_id, node, command):
        raise HTTPException(
            status_code=429,
            detail=f"Rate limited — watchdog {command!r} on {node!r} allowed once per {int(_WATCHDOG_RATE_WINDOW)}s",
        )
    from mesh_router import get_mesh_router
    router = get_mesh_router()
    if router is None:
        raise HTTPException(status_code=503, detail="Mesh router not initialised")
    try:
        result = await router.forward_watchdog(node, command)
        return result
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Watchdog error: {exc}")


@system_router.get("/api/watchdog/{node}/status")
async def watchdog_status(node: str) -> dict:
    from mesh_router import get_mesh_router
    router = get_mesh_router()
    if router is None:
        raise HTTPException(status_code=503, detail="Mesh router not initialised")
    try:
        return await router.forward_watchdog(node, "status")
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        return {"bridge_running": False, "connectsd_ok": False, "error": str(exc)}


# ── System Management ─────────────────────────────────────────────────────────

@system_router.post("/api/system/restart", summary="Restart MUSU services")
async def system_restart(service: str = Query(default="all", pattern=r"^(all|bridge|portd|bee|worker)$")) -> dict:
    cmds = {
        "bridge": "systemctl --user restart musu-bridge",
        "portd": "systemctl --user restart musu-portd 2>/dev/null || (cd ~/musu-functions && nohup bin/musu-portd &)",
        "bee": "systemctl --user restart musu-bee",
        "worker": "systemctl --user restart musu-worker",
    }
    targets = list(cmds.keys()) if service == "all" else [service]

    results = {}
    for svc in targets:
        try:
            proc = await asyncio.create_subprocess_shell(
                cmds[svc],
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.STDOUT,
            )
            stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=30)
            results[svc] = {"exit_code": proc.returncode, "output": stdout.decode(errors="replace").strip()}
        except asyncio.TimeoutError:
            results[svc] = {"exit_code": -1, "output": "timeout"}
        except Exception as e:
            results[svc] = {"exit_code": -1, "output": str(e)}

    return {"restarted": targets, "results": results}


@system_router.get("/api/system/services", summary="List MUSU service statuses")
async def system_services() -> dict:
    services = ["musu-bridge", "musu-bee", "musu-portd", "musu-worker", "musu-connectsd"]
    result = {}
    for svc in services:
        try:
            proc = await asyncio.create_subprocess_exec(
                "systemctl", "--user", "is-active", f"{svc}.service",
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=5)
            result[svc] = stdout.decode().strip()
        except Exception:
            result[svc] = "unknown"
    return {"node": os.environ.get("MUSU_NODE_NAME", "unknown"), "services": result}


@system_router.post("/api/system/update", summary="Run auto-update")
async def system_update() -> dict:
    from pathlib import Path
    script = Path(__file__).parent.parent / "scripts" / "auto-update.sh"
    if not script.exists():
        raise HTTPException(status_code=503, detail="auto-update.sh not found")
    try:
        proc = await asyncio.create_subprocess_exec(
            str(script),
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
        )
        stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=90)
        output = stdout.decode(errors="replace").strip()
        logger.info("system_update: exit=%d output=%s", proc.returncode, output[:200])
        return {"exit_code": proc.returncode, "output": output}
    except asyncio.TimeoutError:
        raise HTTPException(status_code=504, detail="auto-update timed out after 90s")


# ── Admin shell exec (allowlisted commands only) ─────────────────────────────

_EXEC_ALLOWED_PREFIXES = (
    "docker ",
    "docker-compose ",
)


class AdminExecRequest(BaseModel):
    command: str = Field(..., description="Shell command to run (must start with an allowed prefix)")
    cwd: str | None = Field(None, description="Working directory")
    timeout_sec: int = Field(60, ge=1, le=300)


@system_router.post("/api/admin/exec", summary="Run an allowlisted shell command")
async def admin_exec(req: AdminExecRequest) -> dict:
    cmd = req.command.strip()
    if not any(cmd.startswith(p) for p in _EXEC_ALLOWED_PREFIXES):
        raise HTTPException(status_code=403, detail=f"Command not allowed. Permitted prefixes: {_EXEC_ALLOWED_PREFIXES}")
    try:
        proc = await asyncio.create_subprocess_shell(
            cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
            cwd=req.cwd,
        )
        stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=req.timeout_sec)
        output = stdout.decode(errors="replace").strip()
        logger.info("admin_exec: cmd=%r exit=%d", cmd[:80], proc.returncode)
        return {"exit_code": proc.returncode, "output": output}
    except asyncio.TimeoutError:
        raise HTTPException(status_code=504, detail=f"Command timed out after {req.timeout_sec}s")
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


# ── Sandbox Bash ─────────────────────────────────────────────────────────────


class SandboxBashRequest(BaseModel):
    command: str = Field(..., description="Bash command to execute")
    cwd: str | None = Field(None, description="Working directory")
    timeout: int = Field(30, ge=1, le=120, description="Timeout in seconds")


@system_router.post("/api/admin/bash", summary="Execute a bash command with safety guards")
async def admin_bash(req: SandboxBashRequest) -> dict:
    """Run a bash command locally with blocked-command safety checks."""
    from sandbox_bash import execute_bash
    result = await execute_bash(req.command, cwd=req.cwd, timeout=req.timeout)
    if "error" in result and "exit_code" not in result:
        raise HTTPException(status_code=403, detail=result["error"])
    return result


# ── System event logging (for activity timeline) ─────────────────────────────


@system_router.post("/api/auto-distribute/pause", summary="Pause auto-distribution")
async def api_auto_distribute_pause() -> dict:
    """Pause the CEO agent auto-distribution loop."""
    from heartbeat_scheduler import _auto_distribute_enabled
    import heartbeat_scheduler
    heartbeat_scheduler._auto_distribute_enabled = False
    return {"auto_distribute": "paused"}


@system_router.post("/api/auto-distribute/resume", summary="Resume auto-distribution")
async def api_auto_distribute_resume() -> dict:
    """Resume the CEO agent auto-distribution loop."""
    import heartbeat_scheduler
    heartbeat_scheduler._auto_distribute_enabled = True
    return {"auto_distribute": "resumed"}


class SystemEvent(BaseModel):
    event_type: str
    node_name: str = ""
    detail: str = ""


@system_router.post("/api/system/event", summary="Log a system event for activity timeline")
async def api_system_event(event: SystemEvent) -> dict:
    """Record a system event (node join/leave, relay reconnect, etc.) in execution_log."""
    from handlers import _get_backend
    backend = _get_backend()
    try:
        backend._db.execute(
            "INSERT INTO execution_log (agent_name, channel, instruction, status) VALUES (?, ?, ?, ?)",
            (event.node_name or "system", event.event_type, event.detail, "done"),
        )
    except Exception as exc:
        logger.warning("system_event: failed to log — %s", exc)
    return {"logged": True, "event_type": event.event_type}
