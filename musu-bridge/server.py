"""musu-bridge — lightweight routing server (:8070).

Routes agent messages through musu-core without any external dependencies.
No Mattermost, no Docker, no PostgreSQL.

Routes:
  POST /api/route              — Route a message to an agent via musu-core
  GET  /api/agents             — List registered agents
  GET  /api/channels           — Channel-to-agent mapping
  GET  /api/messages           — List messages for a session (cursor-based pagination)
  GET  /api/messages/{id}      — Get a single message by id
  DELETE /api/messages/{id}    — Delete a message by id
  GET  /health                 — Liveness check
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import sys
from contextlib import asynccontextmanager
from typing import Annotated, List, Literal

import uvicorn
from fastapi import FastAPI, HTTPException, Path, Query, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from musu_core.middleware import apply_musu_middlewares
from musu_core.redaction import install_redaction_filter
import audit
from config import get_config
from system_stats import collect_stats_async
from csrf_guard import CSRFOriginGuard
from hostname_guard import HostnameGuard
from handlers import (
    accept_pair,
    add_issue_comment_record,
    cancel_task_record,
    checkout_issue_record,
    create_company,
    create_issue_record,
    delete_company,
    delete_message_by_id,
    disconnect_node,
    get_agent_by_id,
    get_agents,
    get_channel_map,
    get_company,
    get_costs_by_agent_record,
    get_costs_summary_record,
    get_issue_record,
    get_mcp_tools_manifest,
    get_message_by_id,
    get_node_info,
    get_project_record,
    get_task_record,
    list_approval_records,
    list_companies,
    create_goal_record,
    create_project_record,
    delete_goal_record,
    delete_project_record,
    get_goal_record,
    get_project_record,
    list_goal_records,
    list_issue_comment_records,
    list_issue_records,
    list_messages,
    list_nodes,
    list_project_records,
    list_task_records,
    pair_with_node,
    receive_companies,
    receive_messages,
    resolve_approval_record,
    route_chat,
    set_agent_status,
    sync_companies,
    sync_messages,
    update_company,
    update_goal_record,
    update_issue_record,
    update_project_record,
)

logger = logging.getLogger(__name__)

# In-memory tracking of live asyncio tasks for cancellation support.
# Populated by api_delegate_task; cleaned up via done_callback.
_active_tasks: dict[str, asyncio.Task] = {}
_task_event_queues: dict[str, asyncio.Queue] = {}


async def _broadcast_task_event(event: dict) -> None:
    """SSE 구독자에게 task 이벤트 브로드캐스트."""
    dead = []
    for sid, q in _task_event_queues.items():
        try:
            q.put_nowait(event)
        except asyncio.QueueFull:
            dead.append(sid)
    for sid in dead:
        _task_event_queues.pop(sid, None)


_token = os.environ.get("MUSU_BRIDGE_TOKEN", "")
if not _token:
    print("FATAL: MUSU_BRIDGE_TOKEN is not set. Refusing to start without auth.", file=sys.stderr)
    sys.exit(1)

_MAX_CONCURRENT_TASKS = int(os.environ.get("MUSU_MAX_CONCURRENT_TASKS", "20"))


@asynccontextmanager
async def lifespan(app: FastAPI):
    import socket
    from mesh_router import get_mesh_router
    from sync_engine import get_sync_engine
    from handlers import _get_backend
    from registry import heartbeat_loop, peer_discovery_loop
    from discovery import get_discovery, get_tailscale_ip, detect_public_ip

    router = get_mesh_router()
    if router.enabled:
        backend = _get_backend()
        engine = get_sync_engine(router, backend)
        task = asyncio.create_task(engine.run())
        logger.info("sync_engine: started as background task")
    else:
        task = None
        logger.info("sync_engine: mesh disabled, skipping sync")

    # Detect network identity early — reused by registry + mDNS blocks
    cfg = get_config()
    tailscale_ip = get_tailscale_ip()
    # detect_public_ip only when needed: no Tailscale AND cloud registry is configured
    if not tailscale_ip and cfg.musu_token:
        _detected_public_ip = await detect_public_ip()
    else:
        _detected_public_ip = None

    # Cloud registry heartbeat + peer discovery (optional — only when MUSU_TOKEN is set)
    registry_task = None
    peer_discovery_task = None
    musu_token = cfg.musu_token
    if musu_token:
        if cfg.public_url:
            public_url = cfg.public_url
        elif tailscale_ip:
            public_url = f"http://{tailscale_ip}:{cfg.bridge_port}"
        elif _detected_public_ip:
            public_url = f"http://{_detected_public_ip}:{cfg.bridge_port}"
        else:
            public_url = f"http://{socket.gethostname()}:{cfg.bridge_port}"
        node_name = cfg.node_name
        registry_task = asyncio.create_task(
            heartbeat_loop(token=musu_token, node_name=node_name, public_url=public_url)
        )
        logger.info("registry: heartbeat task started for node=%r", node_name)

        # Bootstrap peers from local cache (fast path — no network call)
        from peer_cache import get_peer_cache
        peer_cache = get_peer_cache()
        cached = peer_cache.all()
        for p in cached:
            try:
                router.add_node(p.node_name, p.public_url, agents=[])
            except Exception:
                pass
        if cached:
            logger.info("peer_cache: pre-loaded %d peer(s) from disk", len(cached))

        # Start peer discovery loop (fetches musu.pro, updates cache + router)
        peer_discovery_task = asyncio.create_task(
            peer_discovery_loop(
                token=musu_token,
                self_node_name=node_name,
                cache=peer_cache,
                router=router,
            )
        )
        logger.info("registry: peer discovery task started")
    else:
        logger.info("registry: MUSU_TOKEN not set — cloud registry disabled")

    # Seed canonical company on startup — ensures MCP config company ID always exists.
    _CANONICAL_COMPANY_ID = os.environ.get(
        "PAPERCLIP_COMPANY_ID", "f27a9bd2-688a-450b-98b4-f63d24b0ab50"
    )
    try:
        from handlers import get_company, create_company
        if not get_company(_CANONICAL_COMPANY_ID):
            create_company(
                name="musu_corp",
                workspace_id="ws-musu",
                company_id=_CANONICAL_COMPANY_ID,
            )
            logger.info("startup: seeded canonical company %s", _CANONICAL_COMPANY_ID)
        else:
            logger.info("startup: canonical company %s already exists", _CANONICAL_COMPANY_ID)
    except Exception as _e:
        logger.warning("startup: failed to seed canonical company — %s", _e)

    # Re-dispatch any pending/running route executions from before last restart.
    # retry_count caps at 3 — executions that repeatedly crash are marked failed.
    try:
        backend = _get_backend()
        backend.fail_stale_route_executions(max_retries=3)
        pending = backend.list_pending_route_executions()  # retry_count < 3 only
        if pending:
            logger.info("durability: re-dispatching %d pending route executions", len(pending))
            for rec in pending:
                backend.increment_retry_count(rec["id"])
                asyncio.create_task(route_chat(
                    channel=rec["channel"],
                    sender_id=rec["sender_id"],
                    text=rec["input"],
                ))
    except Exception:
        logger.warning("durability: failed to re-dispatch pending executions")

    # mDNS zero-config discovery (optional — graceful if zeroconf not installed)
    try:
        import zeroconf as _zc  # noqa: F401 — presence check only
    except ImportError:
        logger.warning("discovery: 'zeroconf' not installed — mDNS disabled. Run: pip install zeroconf")

    discovery = get_discovery()
    mdns_task = None
    if tailscale_ip:
        try:
            await discovery.advertise_async(cfg.node_name, tailscale_ip, cfg.bridge_port)
            discovery.start_browser()
            logger.info("discovery: mDNS active on %s", tailscale_ip)

            async def _mdns_register_loop() -> None:
                """Periodically push mDNS-discovered peers into mesh_router."""
                while True:
                    await asyncio.sleep(15)
                    for peer in discovery.get_discovered():
                        name = peer["name"]
                        url = peer["url"]
                        if not router.has_node(name):
                            router.add_node(name, url)
                            logger.info(
                                "discovery: auto-registered mDNS peer %r → %s", name, url
                            )

            mdns_task = asyncio.create_task(_mdns_register_loop())
        except Exception:
            logger.warning("discovery: mDNS init failed — zero-config discovery disabled")
    else:
        logger.warning(
            "discovery: Tailscale IP not detected — mDNS disabled. "
            "Connect Tailscale or set MUSU_TAILSCALE_IP env."
        )

    yield

    discovery.close()
    if mdns_task:
        mdns_task.cancel()
    if registry_task:
        registry_task.cancel()
    if peer_discovery_task:
        peer_discovery_task.cancel()
    if task:
        task.cancel()


app = FastAPI(title="musu-bridge", version="0.2.0", lifespan=lifespan)

apply_musu_middlewares(
    app,
    bearer_token=os.getenv("MUSU_BRIDGE_TOKEN"),
    rate_limit_capacity=60,
    rate_limit_window_seconds=60, # 1 minute
    rate_limit_key_type="ip",
)

app.add_middleware(CSRFOriginGuard)
app.add_middleware(HostnameGuard)

_default_origins = "https://musu.pro,http://localhost:3000,http://localhost:3001,http://localhost:1355"
_allowed_origins = [
    o.strip()
    for o in os.getenv("MUSU_BRIDGE_ALLOWED_ORIGINS", _default_origins).split(",")
    if o.strip()
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["Content-Type"],
)


class RouteRequest(BaseModel):
    channel: str
    sender_id: str
    text: str = Field(max_length=10000)


class DelegateRequest(BaseModel):
    channel: str = Field(min_length=1, max_length=64, pattern=r"^[a-z0-9_-]+$")
    sender_id: str = Field(default="orchestrator", min_length=1, max_length=128)
    text: str = Field(max_length=10000)


class CompanyCreateRequest(BaseModel):
    name: str
    id: str | None = None  # optional: caller can supply a fixed UUID
    template_key: str = "default"
    workspace_id: str = ""
    meta: dict = {}


class CompanyUpdateRequest(BaseModel):
    name: str | None = None
    template_key: str | None = None
    workspace_id: str | None = None
    meta: dict | None = None


@app.post("/api/route")
async def api_route(req: RouteRequest, request: Request) -> dict:
    """Route a message to the agent mapped to the given channel."""
    result = await route_chat(channel=req.channel, sender_id=req.sender_id, text=req.text)
    audit.record(
        actor_ip=request.client.host if request.client else "",
        method="POST",
        path="/api/route",
        status_code=200 if not result.get("error") else 500,
        agent_id=result.get("agent_id", ""),
        note=f"channel={req.channel} sender={req.sender_id}",
    )
    return result


@app.post("/api/tasks/delegate", status_code=202, summary="Delegate a task asynchronously")
async def api_delegate_task(req: DelegateRequest, request: Request, response: Response) -> dict:
    """Submit a task to an agent and return immediately with a task_id.

    The agent runs in the background. Poll GET /api/tasks/{task_id} for status.
    This is the preferred endpoint for AI orchestrators — avoids long blocking calls.
    Returns 202 Accepted. Returns 400 if channel is unknown.
    """
    import uuid
    from handlers import _get_backend

    # W2/W5: Validate channel exists before touching DB
    channel_map = get_channel_map()
    if req.channel not in channel_map:
        raise HTTPException(status_code=400, detail=f"Unknown channel: {req.channel!r}")

    if len(_active_tasks) >= _MAX_CONCURRENT_TASKS:
        raise HTTPException(status_code=429, detail=f"Too many concurrent tasks (max {_MAX_CONCURRENT_TASKS})")

    task_id = str(uuid.uuid4())
    backend = _get_backend()
    try:
        backend.create_route_execution(task_id, req.channel, req.sender_id, req.text)
        backend.update_route_execution(task_id, "running")
    except Exception as exc:
        logger.error("delegate_task: failed to create durability record — %s", exc)
        raise HTTPException(status_code=500, detail="Failed to record task — try again")

    # Pass task_id so route_chat reuses this record instead of creating a new one.
    # Wrap with 300s timeout — auto-fails the DB record if the agent hangs.
    async def _run_with_timeout() -> None:
        try:
            await asyncio.wait_for(
                route_chat(
                    channel=req.channel,
                    sender_id=req.sender_id,
                    text=req.text,
                    exec_id=task_id,
                ),
                timeout=300,
            )
            asyncio.create_task(_broadcast_task_event({"type": "task_update", "task_id": task_id}))
        except asyncio.TimeoutError:
            logger.warning("delegate_task: task %s timed out after 300s", task_id)
            cancel_task_record(task_id, error="timeout after 300s")
            asyncio.create_task(_broadcast_task_event({"type": "task_update", "task_id": task_id}))
        except Exception:
            asyncio.create_task(_broadcast_task_event({"type": "task_update", "task_id": task_id}))

    task = asyncio.create_task(_run_with_timeout())
    _active_tasks[task_id] = task
    task.add_done_callback(lambda _: _active_tasks.pop(task_id, None))
    response.headers["Location"] = f"/api/tasks/{task_id}"
    audit.record(
        actor_ip=request.client.host if request.client else "",
        method="POST",
        path="/api/tasks/delegate",
        status_code=202,
        agent_id="",
        note=f"task_id={task_id} channel={req.channel} sender={req.sender_id}",
    )
    return {"task_id": task_id, "status": "running", "channel": req.channel}


@app.get("/api/tasks", summary="List delegated tasks")
async def api_list_tasks(
    status: str | None = Query(default=None, description="Filter: pending|running|done|failed"),
    limit: int = Query(default=50, ge=1, le=500),
    before_id: str | None = Query(default=None, description="Cursor: return tasks older than this id"),
    channel: str | None = Query(default=None, description="Filter by channel/agent name"),
) -> list[dict]:
    """List delegated tasks, newest first. Supports status/channel filters and cursor pagination."""
    if channel is not None:
        channel_map = get_channel_map()
        if channel not in channel_map:
            raise HTTPException(status_code=400, detail=f"Unknown channel: {channel!r}")
    return list_task_records(status=status, limit=limit, before_id=before_id, channel=channel)


@app.get("/api/tasks/{task_id}", summary="Get async task status")
async def api_get_task(
    task_id: str = Path(min_length=36, max_length=36, pattern=r"^[0-9a-f\-]{36}$"),
) -> dict:
    """Poll the status of a delegated task.

    Returns status, a short summary (≤500 chars) for orchestrators,
    and the full output for human consumption.
    """
    record = get_task_record(task_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Task not found")
    return record


@app.delete("/api/tasks/{task_id}", summary="Cancel a running task")
async def api_cancel_task(
    task_id: str = Path(min_length=36, max_length=36, pattern=r"^[0-9a-f\-]{36}$"),
) -> dict:
    """Cancel a delegated task.

    Cancels the live asyncio task if still running and marks the record as failed/cancelled.
    Returns 404 if task_id is not found.
    """
    record = get_task_record(task_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Task not found")
    # Cancel live asyncio task if it exists
    live_task = _active_tasks.pop(task_id, None)
    if live_task and not live_task.done():
        live_task.cancel()
    cancel_task_record(task_id)
    return {"cancelled": task_id}


@app.get("/api/agents")
async def api_agents() -> list[dict]:
    """List all registered agents."""
    return get_agents()


@app.get("/api/agents/{agent_id}", summary="Get a single agent by ID")
async def api_get_agent(agent_id: str) -> dict:
    """Return full agent record. Returns 404 if not found."""
    agent = get_agent_by_id(agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail=f"Agent '{agent_id}' not found")
    return agent


@app.post("/api/agents/{agent_id}/pause", summary="Pause an agent")
async def api_pause_agent(agent_id: str) -> dict:
    """Set agent status to 'paused'. Returns 404 if agent not found."""
    result = set_agent_status(agent_id, "paused")
    if not result:
        raise HTTPException(status_code=404, detail=f"Agent '{agent_id}' not found")
    return {"id": agent_id, "status": "paused"}


@app.post("/api/agents/{agent_id}/resume", summary="Resume a paused agent")
async def api_resume_agent(agent_id: str) -> dict:
    """Set agent status back to 'active'. Returns 404 if agent not found."""
    result = set_agent_status(agent_id, "active")
    if not result:
        raise HTTPException(status_code=404, detail=f"Agent '{agent_id}' not found")
    return {"id": agent_id, "status": "active"}


@app.get("/api/channels")
async def api_channels() -> dict:
    """Return channel-to-agent mapping."""
    return get_channel_map()


@app.get("/api/messages", summary="List messages for a session")
async def api_list_messages(
    session_id: str | None = Query(default=None, description="Session / conversation id"),
    conversation_id: str | None = Query(default=None, description="Alias for session_id"),
    limit: int = Query(default=50, ge=1, le=500, description="Max messages to return"),
    before_id: str | None = Query(default=None, description="Cursor: return messages before this id"),
    agent_id: str | None = Query(default=None, description="Filter by agent id"),
    date_from: str | None = Query(default=None, description="Filter: messages at or after this ISO timestamp"),
    date_to: str | None = Query(default=None, description="Filter: messages at or before this ISO timestamp"),
) -> list[dict]:
    """List messages for a session with cursor-based pagination.

    Pass either *session_id* or *conversationId*. Use *before_id* for backward
    pagination (returns messages older than the given message id).
    Optionally filter by *agent_id*, *date_from*, or *date_to* (ISO 8601).
    """
    sid = session_id or conversation_id
    if not sid:
        raise HTTPException(status_code=422, detail="session_id or conversationId query param is required")
    return list_messages(
        session_id=sid,
        limit=limit,
        before_id=before_id,
        agent_id=agent_id,
        date_from=date_from,
        date_to=date_to,
    )


@app.get("/api/messages/{message_id}", summary="Get a message by id")
async def api_get_message(message_id: str) -> dict:
    """Return a single message by id."""
    msg = get_message_by_id(message_id)
    if msg is None:
        raise HTTPException(status_code=404, detail="Message not found")
    return msg


@app.delete("/api/messages/{message_id}", summary="Delete a message by id")
async def api_delete_message(message_id: str, request: Request) -> dict:
    """Delete a message. Returns 404 if not found."""
    deleted = delete_message_by_id(message_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Message not found")
    audit.record(
        actor_ip=request.client.host if request.client else "",
        method="DELETE",
        path=f"/api/messages/{message_id}",
        status_code=200,
        note=f"message_id={message_id}",
    )
    return {"deleted": True, "id": message_id}


@app.get("/api/audit", summary="Recent audit log entries")
async def api_audit(
    limit: int = Query(default=100, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
) -> list[dict]:
    """Return recent audit log entries, newest first."""
    return audit.recent(limit=limit, offset=offset)


@app.get("/api/companies", summary="List companies")
async def api_list_companies(workspace_id: str | None = None) -> list[dict]:
    """List all companies, optionally filtered by workspace_id."""
    return list_companies(workspace_id=workspace_id)


@app.post("/api/companies", summary="Create a company")
async def api_create_company(req: CompanyCreateRequest) -> dict:
    """Create a new company."""
    return create_company(
        name=req.name,
        template_key=req.template_key,
        workspace_id=req.workspace_id,
        meta=req.meta,
        company_id=req.id,
    )


@app.get("/api/companies/{company_id}", summary="Get a company")
async def api_get_company(company_id: str) -> dict:
    """Get a company by id."""
    company = get_company(company_id)
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    return company


@app.put("/api/companies/{company_id}", summary="Update a company")
async def api_update_company(company_id: str, req: CompanyUpdateRequest) -> dict:
    """Update a company's fields."""
    updates = {k: v for k, v in req.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(status_code=422, detail="No fields to update")
    updated = update_company(company_id, **updates)
    if not updated:
        raise HTTPException(status_code=404, detail="Company not found")
    return updated


@app.delete("/api/companies/{company_id}", summary="Delete a company")
async def api_delete_company(company_id: str) -> dict:
    """Delete a company by id."""
    ok = delete_company(company_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Company not found")
    return {"deleted": company_id}


@app.get("/api/companies/{company_id}/agents", summary="List agents for a company")
async def api_company_agents(company_id: str) -> list[dict]:
    """List all agents scoped to a company.
    Since agents are currently global (no company_id column), returns all agents
    when the company exists.
    """
    company = get_company(company_id)
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    return get_agents()


@app.get("/api/companies/{company_id}/activity", summary="Activity feed for a company")
async def api_company_activity(
    company_id: str,
    limit: int = Query(default=50, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
) -> list[dict]:
    """Return recent route_executions scoped to a company.

    Returns only executions tagged with company_id, not the global audit log.
    A 404 is returned if the company doesn't exist.
    """
    company = get_company(company_id)
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    return audit.activity_for_company(company_id, limit=limit, offset=offset)


@app.get("/api/companies/{company_id}/dashboard", summary="Dashboard summary for a company")
async def api_company_dashboard(company_id: str) -> dict:
    """Return a summary dashboard for the company."""
    company = get_company(company_id)
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    from handlers import list_task_records as list_tasks
    agents = get_agents()
    tasks = list_tasks(limit=100)
    active_agents = [a for a in agents if a.get("status") == "active"]
    pending_tasks = [t for t in tasks if t.get("status") == "pending"]
    running_tasks = [t for t in tasks if t.get("status") == "running"]
    done_tasks = [t for t in tasks if t.get("status") == "done"]
    failed_tasks = [t for t in tasks if t.get("status") == "failed"]
    return {
        "company_id": company_id,
        "company_name": company.get("name"),
        "agents": {"total": len(agents), "active": len(active_agents)},
        "tasks": {
            "total": len(tasks),
            "pending": len(pending_tasks),
            "running": len(running_tasks),
            "done": len(done_tasks),
            "failed": len(failed_tasks),
        },
    }


class PairRequest(BaseModel):
    ip: str
    port: int = 8070


class PairAcceptRequest(BaseModel):
    name: str
    url: str
    agents: list[str] = []
    version: str = ""


@app.get("/.well-known/agent.json", summary="A2A Agent Card", include_in_schema=False)
async def agent_card() -> dict:
    """A2A-compatible agent card advertising this node's capabilities."""
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


@app.get("/api/admin/node-info", summary="This node's identity info")
async def api_node_info() -> dict:
    """Return this node's name, URL, and agent list for peer exchange."""
    return get_node_info()


@app.post("/api/admin/pair", summary="Pair with a remote node")
async def api_pair(req: PairRequest) -> dict:
    """Initiate pairing with remote node at {ip}:{port}. Updates nodes.toml on both sides."""
    result = await pair_with_node(ip=req.ip, port=req.port)
    if not result.get("success"):
        raise HTTPException(status_code=502, detail=result.get("error", "Pairing failed"))
    return result


@app.post("/api/admin/pair/accept", summary="Accept a pairing request from a peer")
async def api_pair_accept(req: PairAcceptRequest) -> dict:
    """Called by remote node during pairing — adds them to local nodes.toml."""
    result = accept_pair({"name": req.name, "url": req.url, "agents": req.agents})
    if not result.get("success"):
        raise HTTPException(status_code=400, detail=result.get("error", "Accept failed"))
    return result


@app.get("/api/admin/nodes", summary="List connected nodes with status")
async def api_list_nodes() -> list[dict]:
    """Return all configured nodes with online/offline status."""
    return await list_nodes()


@app.delete("/api/admin/nodes/{node_name}", summary="Disconnect a node")
async def api_disconnect_node(node_name: str) -> dict:
    """Remove a node from nodes.toml."""
    ok = disconnect_node(node_name)
    if not ok:
        raise HTTPException(status_code=404, detail=f"Node {node_name!r} not found")
    return {"disconnected": node_name}


@app.get("/api/admin/peer-status", summary="MUSU_TOKEN peer discovery status")
async def api_peer_status() -> dict:
    """Return cloud registry and peer discovery state.

    Shows whether MUSU_TOKEN is configured, the node's public identity,
    and peers currently known from the registry cache.
    """
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


@app.get("/api/admin/discovered", summary="Nodes discovered via mDNS")
async def api_discovered_nodes() -> list[dict]:
    """Return musu-bridge nodes found on the local network via mDNS.

    Each entry includes name, url, and agents (fetched from Agent Card).
    """
    from discovery import get_discovery, enrich_with_agent_card

    discovery = get_discovery()
    peers = discovery.get_discovered()
    enriched = await asyncio.gather(*[enrich_with_agent_card(p) for p in peers])
    return list(enriched)


@app.get("/api/sync/companies", summary="Pull companies for sync")
async def api_sync_companies(
    since: str = Query(default="1970-01-01T00:00:00Z", description="ISO 8601 lower bound (updated_at >=)"),
    limit: int = Query(default=500, ge=1, le=2000),
) -> list[dict]:
    """Return companies updated at or after *since*. Used by peer sync engines."""
    return sync_companies(since=since, limit=limit)


@app.get("/api/sync/messages", summary="Pull messages for sync")
async def api_sync_messages(
    since: str = Query(default="1970-01-01T00:00:00Z", description="ISO 8601 lower bound (created_at >=)"),
    limit: int = Query(default=500, ge=1, le=2000),
) -> list[dict]:
    """Return messages created at or after *since*. Used by peer sync engines."""
    return sync_messages(since=since, limit=limit)


class SyncPushRequest(BaseModel):
    companies: Annotated[List[dict], Field(max_length=2000)] = []
    messages: Annotated[List[dict], Field(max_length=2000)] = []


@app.post("/api/sync/push", summary="Receive sync data from a peer")
async def api_sync_push(req: SyncPushRequest) -> dict:
    """Accept bulk company and message data from a peer node."""
    c_written = receive_companies(req.companies) if req.companies else 0
    m_written = receive_messages(req.messages) if req.messages else 0
    return {"companies_written": c_written, "messages_written": m_written}


@app.get("/api/mcp/tools", summary="MCP tools manifest — all services")
async def api_mcp_tools() -> dict:
    """Return service-grouped list of all MCP tools and REST endpoints in the MUSU stack."""
    return get_mcp_tools_manifest()


@app.get("/api/tasks/events")
async def api_task_events(request: Request) -> StreamingResponse:
    """Server-Sent Events — task 상태 변경 시 즉시 이벤트 전송."""
    import uuid as _uuid
    sid = str(_uuid.uuid4())
    q: asyncio.Queue = asyncio.Queue(maxsize=100)
    _task_event_queues[sid] = q

    async def event_stream():
        try:
            yield f"data: {json.dumps({'type': 'connected'})}\n\n"
            while True:
                if await request.is_disconnected():
                    break
                try:
                    event = await asyncio.wait_for(q.get(), timeout=30)
                    yield f"data: {json.dumps(event)}\n\n"
                except asyncio.TimeoutError:
                    yield ": keepalive\n\n"
        finally:
            _task_event_queues.pop(sid, None)

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.get("/api/system/stats", summary="System resource usage (CPU, RAM, disk, GPU)")
async def api_system_stats() -> dict:
    """Return current CPU, RAM, disk, and GPU stats for this node."""
    return await collect_stats_async()


class WolRequest(BaseModel):
    mac_address: str
    broadcast_ip: str = "255.255.255.255"
    port: int = 9


@app.post("/api/wol", summary="Send Wake-on-LAN Magic Packet")
async def api_wol(req: WolRequest, request: Request) -> dict:
    """Send a Magic Packet to wake a machine on the local LAN.

    Requires Bearer token auth (same MUSU_BRIDGE_TOKEN as all endpoints).
    This endpoint is called by musu.pro proxying a user's Wake request through
    an active node on the same LAN as the sleeping target machine.
    """
    from wol import send_magic_packet

    ok = send_magic_packet(req.mac_address, req.broadcast_ip, req.port)
    if not ok:
        return {"ok": False, "error": "Invalid MAC address format"}
    return {"ok": True}


# ──────────────────────────────────────────────────────────────────────────────
# Issues
# ──────────────────────────────────────────────────────────────────────────────


class IssueCreateRequest(BaseModel):
    title: str
    description: str = ""
    status: str = "open"
    priority: str = "medium"
    assignee_id: str | None = None


class ProjectCreateRequest(BaseModel):
    project_name: str
    status: Literal["active", "paused", "archived"] = "active"
    assigned_to: str | None = None


class ProjectUpdateRequest(BaseModel):
    project_name: str | None = None
    status: Literal["active", "paused", "archived"] | None = None
    assigned_to: str | None = None


class IssueUpdateRequest(BaseModel):
    title: str | None = None
    description: str | None = None
    status: str | None = None
    priority: str | None = None
    assignee_id: str | None = None


class IssueCommentRequest(BaseModel):
    body: str
    author_id: str | None = None
    author_kind: str = "agent"


class IssueCheckoutRequest(BaseModel):
    agent_id: str


@app.get("/api/companies/{company_id}/issues", summary="List issues for a company")
async def api_list_issues(
    company_id: str,
    status: str | None = Query(default=None),
    assignee_id: str | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
) -> list[dict]:
    """List issues for a company, optionally filtered by status or assignee."""
    company = get_company(company_id)
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    return list_issue_records(company_id=company_id, status=status, assignee_id=assignee_id, limit=limit)


@app.post("/api/companies/{company_id}/issues", summary="Create an issue", status_code=201)
async def api_create_issue(company_id: str, req: IssueCreateRequest) -> dict:
    """Create a new issue for a company."""
    company = get_company(company_id)
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    return create_issue_record(
        company_id=company_id,
        title=req.title,
        description=req.description,
        status=req.status,
        priority=req.priority,
        assignee_id=req.assignee_id,
    )


@app.get("/api/issues/{issue_id}", summary="Get an issue by id")
async def api_get_issue(issue_id: str) -> dict:
    """Return a single issue. Returns 404 if not found."""
    issue = get_issue_record(issue_id)
    if not issue:
        raise HTTPException(status_code=404, detail="Issue not found")
    return issue


@app.patch("/api/issues/{issue_id}", summary="Update an issue")
async def api_update_issue(issue_id: str, req: IssueUpdateRequest) -> dict:
    """Update issue fields. Returns 404 if not found."""
    updates = {k: v for k, v in req.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(status_code=422, detail="No fields to update")
    updated = update_issue_record(issue_id, **updates)
    if not updated:
        raise HTTPException(status_code=404, detail="Issue not found")
    return updated


@app.post("/api/issues/{issue_id}/checkout", summary="Checkout an issue to an agent")
async def api_checkout_issue(issue_id: str, req: IssueCheckoutRequest) -> dict:
    """Mark the issue as checked out by the given agent."""
    updated = checkout_issue_record(issue_id, req.agent_id)
    if not updated:
        raise HTTPException(status_code=404, detail="Issue not found")
    return updated


@app.get("/api/issues/{issue_id}/comments", summary="List comments for an issue")
async def api_list_issue_comments(issue_id: str) -> list[dict]:
    """List all comments on an issue. Returns 404 if the issue doesn't exist."""
    issue = get_issue_record(issue_id)
    if not issue:
        raise HTTPException(status_code=404, detail="Issue not found")
    return list_issue_comment_records(issue_id)


@app.post("/api/issues/{issue_id}/comments", summary="Add a comment to an issue", status_code=201)
async def api_add_issue_comment(issue_id: str, req: IssueCommentRequest) -> dict:
    """Add a comment to an issue."""
    issue = get_issue_record(issue_id)
    if not issue:
        raise HTTPException(status_code=404, detail="Issue not found")
    return add_issue_comment_record(issue_id, body=req.body, author_id=req.author_id, author_kind=req.author_kind)


# ──────────────────────────────────────────────────────────────────────────────
# Heartbeat-runs (alias over route_executions)
# ──────────────────────────────────────────────────────────────────────────────


@app.get("/api/companies/{company_id}/heartbeat-runs", summary="List heartbeat runs for a company")
async def api_list_heartbeat_runs(
    company_id: str,
    status: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=500),
) -> list[dict]:
    """List agent run records (route_executions) for a company."""
    company = get_company(company_id)
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    return list_task_records(status=status, limit=limit)


@app.get("/api/heartbeat-runs/{run_id}", summary="Get a heartbeat run by id")
async def api_get_heartbeat_run(run_id: str) -> dict:
    """Get a single run record by id."""
    record = get_task_record(run_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Run not found")
    return record


@app.post("/api/heartbeat-runs/{run_id}/cancel", summary="Cancel a heartbeat run")
async def api_cancel_heartbeat_run(run_id: str) -> dict:
    """Cancel a heartbeat run."""
    record = get_task_record(run_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Run not found")
    live_task = _active_tasks.pop(run_id, None)
    if live_task and not live_task.done():
        live_task.cancel()
    cancel_task_record(run_id)
    return {"cancelled": run_id}


class HeartbeatInvokeRequest(BaseModel):
    prompt: str = Field(default="heartbeat", max_length=2000)
    sender_id: str = Field(default="system", max_length=128)


@app.post("/api/agents/{agent_id}/heartbeat/invoke", summary="Invoke a heartbeat run for an agent")
async def api_invoke_heartbeat(agent_id: str, req: HeartbeatInvokeRequest) -> dict:
    """Trigger a heartbeat run for the given agent by routing a message to its channel."""
    agent = get_agent_by_id(agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    channel = agent.get("name", agent_id)
    result = await route_chat(channel=channel, sender_id=req.sender_id, text=req.prompt)
    return result


# ──────────────────────────────────────────────────────────────────────────────
# Approvals
# ──────────────────────────────────────────────────────────────────────────────


@app.get("/api/companies/{company_id}/approvals", summary="List approval requests for a company")
async def api_list_approvals(
    company_id: str,
    status: str | None = Query(default=None),
) -> list[dict]:
    """List approval requests, optionally filtered by status."""
    company = get_company(company_id)
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    return list_approval_records(company_id=company_id, status=status)


@app.post("/api/approvals/{approval_id}/{decision}", summary="Resolve an approval request")
async def api_resolve_approval(
    approval_id: str,
    decision: str = Path(pattern=r"^(approved|rejected)$"),
    reason: str = Query(default=""),
) -> dict:
    """Approve or reject a pending approval. decision must be 'approved' or 'rejected'."""
    updated = resolve_approval_record(approval_id, decision=decision, reason=reason)
    if not updated:
        raise HTTPException(status_code=404, detail="Approval not found")
    return updated


# ──────────────────────────────────────────────────────────────────────────────
# Projects
# ──────────────────────────────────────────────────────────────────────────────


@app.get("/api/companies/{company_id}/projects", summary="List projects for a company")
async def api_list_projects(
    company_id: str,
    status: str | None = Query(default=None),
) -> list[dict]:
    """List projects for a company."""
    company = get_company(company_id)
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    return list_project_records(company_id=company_id, status=status)


@app.post("/api/companies/{company_id}/projects", summary="Create a project", status_code=201)
async def api_create_project(company_id: str, body: "ProjectCreateRequest") -> dict:
    """Create a new project for a company."""
    company = get_company(company_id)
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    return create_project_record(
        company_id=company_id,
        project_name=body.project_name,
        status=body.status,
        assigned_to=body.assigned_to,
    )


@app.get("/api/projects/{project_id}", summary="Get a project by id")
async def api_get_project(project_id: str) -> dict:
    """Get a project. Returns 404 if not found."""
    project = get_project_record(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


@app.patch("/api/projects/{project_id}", summary="Update a project")
async def api_update_project(project_id: str, body: "ProjectUpdateRequest") -> dict:
    """Update a project's fields."""
    project = get_project_record(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    updated = update_project_record(project_id, **body.model_dump(exclude_none=True))
    return updated or project


@app.delete("/api/projects/{project_id}", summary="Delete a project")
async def api_delete_project(project_id: str) -> dict:
    """Delete a project by id."""
    project = get_project_record(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    delete_project_record(project_id)
    return {"deleted": True, "id": project_id}


# ──────────────────────────────────────────────────────────────────────────────
# Goals
# ──────────────────────────────────────────────────────────────────────────────


class GoalCreateRequest(BaseModel):
    title: str
    description: str = ""
    status: Literal["active", "completed", "cancelled"] = "active"
    due_date: str | None = None


class GoalUpdateRequest(BaseModel):
    title: str | None = None
    description: str | None = None
    status: Literal["active", "completed", "cancelled"] | None = None
    due_date: str | None = None


@app.get("/api/companies/{company_id}/goals", summary="List goals for a company")
async def api_list_goals(
    company_id: str,
    status: str | None = Query(default=None),
) -> list[dict]:
    """Return goals for a company, optionally filtered by status."""
    company = get_company(company_id)
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    return list_goal_records(company_id, status=status)


@app.post("/api/companies/{company_id}/goals", summary="Create a goal", status_code=201)
async def api_create_goal(company_id: str, body: GoalCreateRequest) -> dict:
    """Create a new goal for a company."""
    company = get_company(company_id)
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    return create_goal_record(
        company_id=company_id,
        title=body.title,
        description=body.description,
        status=body.status,
        due_date=body.due_date,
    )


@app.get("/api/goals/{goal_id}", summary="Get a goal by id")
async def api_get_goal(goal_id: str) -> dict:
    """Return a single goal by id."""
    goal = get_goal_record(goal_id)
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found")
    return goal


@app.patch("/api/goals/{goal_id}", summary="Update a goal")
async def api_update_goal(goal_id: str, body: GoalUpdateRequest) -> dict:
    """Update a goal's fields."""
    goal = get_goal_record(goal_id)
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found")
    updated = update_goal_record(goal_id, **body.model_dump(exclude_none=True))
    return updated or goal


@app.delete("/api/goals/{goal_id}", summary="Delete a goal")
async def api_delete_goal(goal_id: str) -> dict:
    """Delete a goal by id."""
    goal = get_goal_record(goal_id)
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found")
    delete_goal_record(goal_id)
    return {"deleted": True, "id": goal_id}


# ──────────────────────────────────────────────────────────────────────────────
# Costs
# ──────────────────────────────────────────────────────────────────────────────


@app.get("/api/companies/{company_id}/costs/summary", summary="Cost summary for a company")
async def api_costs_summary(company_id: str) -> dict:
    """Return execution cost summary derived from route_executions."""
    company = get_company(company_id)
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    return get_costs_summary_record(company_id)


@app.get("/api/companies/{company_id}/costs/by-agent", summary="Per-agent costs for a company")
async def api_costs_by_agent(company_id: str) -> list[dict]:
    """Return per-agent execution counts derived from route_executions."""
    company = get_company(company_id)
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    return get_costs_by_agent_record(company_id)


@app.get("/api/index-search", summary="Search indexed codebase")
async def api_index_search(q: str = Query("", max_length=200)) -> list[dict]:
    """Full-text search on the musu-indexer SQLite database.

    Returns up to 20 matching entries with path, snippet, and type.
    Falls back to empty list if the indexer DB is not present.
    """
    import sqlite3

    db_path = os.environ.get(
        "MUSU_INDEXER_DB",
        os.path.join(os.path.dirname(__file__), "..", "musu-indexer", ".musu_dev.db"),
    )
    q = q.strip()
    if not q:
        return []
    try:
        conn = sqlite3.connect(db_path)
        conn.row_factory = sqlite3.Row
        rows = conn.execute(
            """
            SELECT path, snippet(search_index, 2, '<b>', '</b>', '…', 20) AS snippet, type
            FROM search_index
            WHERE search_index MATCH ?
            ORDER BY rank
            LIMIT 20
            """,
            (q,),
        ).fetchall()
        conn.close()
        return [dict(r) for r in rows]
    except Exception as exc:  # noqa: BLE001
        return [{"error": str(exc), "path": "", "snippet": "", "type": "error"}]


@app.get("/health")
async def health() -> dict:
    return {"status": "ok"}



if __name__ == "__main__":
    cfg = get_config()

    if os.getenv("MUSU_ENV") == "production":
        token = os.getenv("MUSU_BRIDGE_TOKEN")
        if not token or len(token) < 32:
            raise RuntimeError(
                "MUSU_ENV=production requires MUSU_BRIDGE_TOKEN (min 32 chars). "
                "Refusing to start."
            )

    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    install_redaction_filter()
    uvicorn.run(app, host=cfg.bridge_host, port=cfg.bridge_port)
