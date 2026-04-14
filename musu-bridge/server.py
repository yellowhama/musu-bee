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
import logging
import os
import sys
from contextlib import asynccontextmanager
from typing import Annotated, List

import uvicorn
from fastapi import FastAPI, HTTPException, Path, Query, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from musu_core.middleware import apply_musu_middlewares
import audit
from config import get_config
from csrf_guard import CSRFOriginGuard
from hostname_guard import HostnameGuard
from handlers import (
    accept_pair,
    cancel_task_record,
    create_company,
    delete_company,
    delete_message_by_id,
    disconnect_node,
    get_agents,
    get_channel_map,
    get_company,
    get_message_by_id,
    get_node_info,
    get_task_record,
    list_companies,
    list_messages,
    list_nodes,
    list_task_records,
    pair_with_node,
    receive_companies,
    receive_messages,
    route_chat,
    sync_companies,
    sync_messages,
    update_company,
)

logger = logging.getLogger(__name__)

# In-memory tracking of live asyncio tasks for cancellation support.
# Populated by api_delegate_task; cleaned up via done_callback.
_active_tasks: dict[str, asyncio.Task] = {}


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
    from registry import heartbeat_loop
    from discovery import get_discovery, get_tailscale_ip

    router = get_mesh_router()
    if router.enabled:
        backend = _get_backend()
        engine = get_sync_engine(router, backend)
        task = asyncio.create_task(engine.run())
        logger.info("sync_engine: started as background task")
    else:
        task = None
        logger.info("sync_engine: mesh disabled, skipping sync")

    # Cloud registry heartbeat (optional — only when MUSU_TOKEN is set)
    registry_task = None
    cfg = get_config()
    musu_token = cfg.musu_token
    if musu_token:
        public_url = cfg.public_url or f"http://{socket.gethostname()}:{cfg.bridge_port}"
        node_name = cfg.node_name
        registry_task = asyncio.create_task(
            heartbeat_loop(token=musu_token, node_name=node_name, public_url=public_url)
        )
        logger.info("registry: heartbeat task started for node=%r", node_name)
    else:
        logger.info("registry: MUSU_TOKEN not set — cloud registry disabled")

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
    tailscale_ip = get_tailscale_ip()
    if tailscale_ip:
        try:
            discovery.advertise(cfg.node_name, tailscale_ip, cfg.bridge_port)
            discovery.start_browser()
            logger.info("discovery: mDNS active on %s", tailscale_ip)
        except Exception:
            logger.warning("discovery: mDNS init failed — zero-config discovery disabled")
    else:
        logger.warning(
            "discovery: Tailscale IP not detected — mDNS disabled. "
            "Connect Tailscale or set MUSU_TAILSCALE_IP env."
        )

    yield

    discovery.close()
    if registry_task:
        registry_task.cancel()
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

_default_origins = "http://localhost:3000,http://localhost:3001,http://localhost:1355"
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
        except asyncio.TimeoutError:
            logger.warning("delegate_task: task %s timed out after 300s", task_id)
            cancel_task_record(task_id, error="timeout after 300s")

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
    uvicorn.run(app, host=cfg.bridge_host, port=cfg.bridge_port)
