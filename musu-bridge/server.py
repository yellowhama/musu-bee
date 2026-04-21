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
  GET  /api/tasks/{id}/sprint-contract — Sprint Contract for a delegated task
  GET  /api/tasks/{id}/qa-scores       — QA iteration scores for a delegated task
  POST /api/watchdog/{node}/{command}  — Send watchdog command via QUIC P2P
  GET  /api/watchdog/{node}/status     — Get watchdog/bridge status from node
  POST /api/system/update      — Run auto-update (git pull + restart if changed)
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
from fastapi import FastAPI, HTTPException, Path, Query, Request, Response, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from musu_core.middleware import apply_musu_middlewares
from musu_core.redaction import install_redaction_filter
import audit
import screen_vnc
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
    get_costs_by_agent_global,
    get_costs_by_agent_record,
    get_costs_global,
    get_costs_summary_record,
    get_runs_recent_global,
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
    get_sprint_contract_for_task,
    get_qa_scores_for_task,
    pair_with_node,
    receive_companies,
    receive_messages,
    resolve_approval_record,
    route_chat,
    route_chat_with_qa_loop,
    set_agent_status,
    update_agent_fields,
    sync_companies,
    sync_messages,
    update_company,
    update_goal_record,
    update_issue_record,
    update_project_record,
    get_kv_record,
    set_kv_record,
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


async def _agent_heartbeat_scheduler() -> None:
    """Periodic heartbeat for the CEO agent (or any configured agent).

    Env:
        MUSU_CEO_HEARTBEAT_ENABLED  = "true"   — must be set to activate
        MUSU_CEO_HEARTBEAT_INTERVAL = seconds   — default 1800 (30 min)
        MUSU_CEO_AGENT_NAME         = name      — default "ceo"
    """
    interval = int(os.environ.get("MUSU_CEO_HEARTBEAT_INTERVAL", "1800"))
    agent_name = os.environ.get("MUSU_CEO_AGENT_NAME", "ceo")

    logger.info(
        "heartbeat_scheduler: started (interval=%ds, agent=%s)", interval, agent_name
    )
    # Wait 60s after server start before first heartbeat — let everything settle.
    await asyncio.sleep(60)

    while True:
        try:
            logger.info("heartbeat_scheduler: invoking %s", agent_name)
            await route_chat(
                channel=agent_name,
                sender_id="system",
                text="heartbeat",
            )
            logger.info("heartbeat_scheduler: %s done", agent_name)
        except Exception as exc:
            logger.warning("heartbeat_scheduler: error — %s", exc)
        await asyncio.sleep(interval)


async def _node_manager_heartbeat() -> None:
    """Periodic stats report from the local node manager agent.

    Env:
        MUSU_NODE_HEARTBEAT_ENABLED  = "true"   — must be set to activate
        MUSU_NODE_HEARTBEAT_INTERVAL = seconds   — default 300 (5 min)
    """
    interval = int(os.environ.get("MUSU_NODE_HEARTBEAT_INTERVAL", "300"))
    _cfg = get_config()
    # Use mesh self_name so channel matches nodes.toml topology (not OS hostname)
    from mesh_router import get_router as _get_router
    _router = _get_router()
    mgr_name = f"mgr-{_router._self_name or _cfg.node_name}"

    logger.info(
        "node_heartbeat: started (interval=%ds, agent=%s)", interval, mgr_name
    )
    # Stagger: wait 90s so node manager agent is fully seeded before first ping.
    await asyncio.sleep(90)

    while True:
        try:
            logger.info("node_heartbeat: invoking %s", mgr_name)
            await route_chat(
                channel=mgr_name,
                sender_id="system",
                text="heartbeat: 현재 기기 상태 보고해줘",
            )
            logger.info("node_heartbeat: %s done", mgr_name)
        except Exception as exc:
            logger.warning("node_heartbeat: error — %s", exc)
        await asyncio.sleep(interval)


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
        skipped = 0
        for p in cached:
            try:
                # Skip stale aliases: new name but URL already served by a known node
                if not router.has_node(p.node_name):
                    known_urls = {router.url_for_node(n) for n in router.node_names}
                    if p.public_url in known_urls:
                        logger.debug(
                            "peer_cache: skipping stale alias %r (url=%r already known)",
                            p.node_name, p.public_url,
                        )
                        skipped += 1
                        continue
                router.add_node(p.node_name, p.public_url, agents=[])
            except Exception:
                pass
        loaded = len(cached) - skipped
        if loaded:
            logger.info("peer_cache: pre-loaded %d peer(s) from disk", loaded)
        if skipped:
            logger.info("peer_cache: skipped %d stale alias(es) from disk", skipped)

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

    # Seed canonical company on startup.
    # Priority: PAPERCLIP_COMPANY_ID env → first company in DB → create new.
    # Never hardcodes a UUID — the DB is the source of truth.
    try:
        from handlers import get_company, create_company, list_companies
        _env_company_id = os.environ.get("PAPERCLIP_COMPANY_ID", "")
        if _env_company_id and get_company(_env_company_id):
            _CANONICAL_COMPANY_ID = _env_company_id
            logger.info("startup: canonical company %s (from env)", _CANONICAL_COMPANY_ID)
        else:
            _existing = list_companies()
            if _existing:
                _CANONICAL_COMPANY_ID = _existing[0]["id"]
                logger.info("startup: canonical company %s already exists", _CANONICAL_COMPANY_ID)
            else:
                _new = create_company(name="musu_corp", workspace_id="ws-musu")
                _CANONICAL_COMPANY_ID = _new["id"]
                logger.info("startup: seeded canonical company %s", _CANONICAL_COMPANY_ID)
    except Exception as _e:
        _CANONICAL_COMPANY_ID = ""
        logger.warning("startup: failed to resolve canonical company — %s", _e)

    # Seed node manager agent for this machine.
    # Each machine auto-creates mgr-{node_name} in DB + assigns it in nodes.toml.
    # Use mesh router's self_name (from nodes.toml [mesh] self) so the agent name
    # matches the mesh topology — not the OS hostname which may differ (e.g. WSL2).
    try:
        from handlers import get_agents, _get_backend as _gb2
        _local_node = router._self_name or cfg.node_name
        _mgr_name = f"mgr-{_local_node}"
        _mgr_backend = _gb2()
        _existing_mgr = _mgr_backend.get_agent_by_name(_mgr_name)
        if _existing_mgr is None:
            _mgr_backend.agents.create(
                name=_mgr_name,
                role="Node Manager",
                adapter_type="claude_local",
                adapter_config={
                    "model": "claude-sonnet-4-6",
                    "instructions_path": "musu-bridge/instructions/node_manager.md",
                    "node_name": _local_node,
                },
            )
            logger.info("startup: seeded node manager agent %r for node=%r", _mgr_name, _local_node)
        else:
            logger.info("startup: node manager %r already exists", _mgr_name)
        # Register in nodes.toml so mesh routing knows this agent lives on this node.
        router.auto_assign_agents(_local_node, [_mgr_name])
    except Exception as _e:
        logger.warning("startup: failed to seed node manager — %s", _e)

    # Re-dispatch any pending/running route executions from before last restart.
    # retry_count caps at 3 — executions that repeatedly crash are marked failed.
    try:
        backend = _get_backend()
        backend.fail_stale_route_executions(max_retries=3)
        # Purge old failed/done executions (keep last 30 days)
        purged = backend.purge_old_executions(days=30)
        if purged:
            logger.info("startup: purged %d old route_execution(s) (>30 days)", purged)
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

    # Cloud relay tunnel (optional — only when MUSU_RELAY_ENABLED=true)
    relay_task = None
    if cfg.relay_enabled and cfg.relay_url and musu_token:
        from relay_client import relay_loop
        relay_task = asyncio.create_task(
            relay_loop(
                relay_url=cfg.relay_url,
                musu_token=musu_token,
                node_name=cfg.node_name,
                bridge_url=f"http://127.0.0.1:{cfg.bridge_port}",
            )
        )
        logger.info("relay_client: tunnel task started → %s", cfg.relay_url)
    elif cfg.relay_enabled:
        logger.warning(
            "relay_client: MUSU_RELAY_ENABLED=true but MUSU_RELAY_URL or MUSU_TOKEN not set — skipping"
        )

    # CEO heartbeat scheduler (optional — only when MUSU_CEO_HEARTBEAT_ENABLED=true)
    heartbeat_task = None
    if os.environ.get("MUSU_CEO_HEARTBEAT_ENABLED", "").lower() == "true":
        heartbeat_task = asyncio.create_task(_agent_heartbeat_scheduler())
        logger.info("heartbeat_scheduler: task started")

    # Node manager heartbeat (optional — only when MUSU_NODE_HEARTBEAT_ENABLED=true)
    node_heartbeat_task = None
    if os.environ.get("MUSU_NODE_HEARTBEAT_ENABLED", "").lower() == "true":
        node_heartbeat_task = asyncio.create_task(_node_manager_heartbeat())
        logger.info("node_heartbeat: task started")

    yield

    discovery.close()
    if node_heartbeat_task:
        node_heartbeat_task.cancel()
    if heartbeat_task:
        heartbeat_task.cancel()
    if relay_task:
        relay_task.cancel()
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
    peer_token=os.getenv("MUSU_TOKEN", ""),   # account-level token; lets peer nodes sync
    rate_limit_capacity=60,
    rate_limit_window_seconds=60, # 1 minute
    rate_limit_key_type="ip",
    bypass_path_prefixes=("/screen/novnc",),  # noVNC static files are public; WS auth via one-time token
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

# ── noVNC static files (browser VNC client) ───────────────────────────────────
_novnc_dir = os.path.join(os.path.dirname(__file__), "static", "novnc")
if os.path.isdir(_novnc_dir):
    app.mount("/screen/novnc", StaticFiles(directory=_novnc_dir, html=True), name="novnc")


class RouteRequest(BaseModel):
    channel: str
    sender_id: str
    text: str = Field(max_length=10000)


class DelegateRequest(BaseModel):
    channel: str = Field(min_length=1, max_length=64, pattern=r"^[a-z0-9_-]+$")
    sender_id: str = Field(default="orchestrator", min_length=1, max_length=128)
    text: str = Field(max_length=10000)
    # When True and channel=="engineer", runs QALoop instead of single-shot route_chat.
    # Engineer → QA → rework loop (max qa_loop_max_iter iterations, all criteria ≥ 7).
    use_qa_loop: bool = False
    qa_loop_max_iter: int = Field(default=3, ge=1, le=5)


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
    # QA loop path: use_qa_loop=True + channel=="engineer" → QALoop.run() (max 900s).
    # Standard path: single-shot route_chat with 300s timeout.
    _use_qa = req.use_qa_loop and req.channel == "engineer"
    _timeout = 900 if _use_qa else 300

    async def _run_with_timeout() -> None:
        try:
            if _use_qa:
                await asyncio.wait_for(
                    route_chat_with_qa_loop(
                        task_id=task_id,
                        text=req.text,
                        sender_id=req.sender_id,
                        max_iter=req.qa_loop_max_iter,
                    ),
                    timeout=_timeout,
                )
            else:
                await asyncio.wait_for(
                    route_chat(
                        channel=req.channel,
                        sender_id=req.sender_id,
                        text=req.text,
                        exec_id=task_id,
                    ),
                    timeout=_timeout,
                )
            asyncio.create_task(_broadcast_task_event({"type": "task_update", "task_id": task_id}))
        except asyncio.TimeoutError:
            logger.warning("delegate_task: task %s timed out after %ds", task_id, _timeout)
            cancel_task_record(task_id, error=f"timeout after {_timeout}s")
            asyncio.create_task(_broadcast_task_event({"type": "task_update", "task_id": task_id}))
        except Exception as _exc:
            logger.exception("delegate_task: task %s raised unhandled exception: %s", task_id, _exc)
            cancel_task_record(task_id, error=f"unhandled exception: {_exc}")
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


@app.get("/api/tasks/{task_id}/sprint-contract", summary="Get sprint contract for a task")
async def api_get_sprint_contract(
    task_id: str = Path(min_length=36, max_length=36, pattern=r"^[0-9a-f\-]{36}$"),
) -> dict:
    """Return the sprint contract linked to a task, or 404 if none exists.

    Authentication is enforced globally by apply_musu_middlewares (Bearer token).
    """
    contract = get_sprint_contract_for_task(task_id)
    if contract is None:
        raise HTTPException(status_code=404, detail="No sprint contract for this task")
    return contract


@app.get("/api/tasks/{task_id}/qa-scores", summary="Get QA scores for a task")
async def api_get_qa_scores(
    task_id: str = Path(min_length=36, max_length=36, pattern=r"^[0-9a-f\-]{36}$"),
) -> list[dict]:
    """Return QA iteration scores for a task, ordered by iteration.

    Authentication is enforced globally by apply_musu_middlewares (Bearer token).
    """
    return get_qa_scores_for_task(task_id)


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


class AgentUpdateRequest(BaseModel):
    role: str | None = Field(default=None, description="New role string")
    model: str | None = Field(default=None, description="New model name (stored in adapter_config)")


@app.patch("/api/agents/{agent_id}", summary="Update agent role or model")
async def api_update_agent(agent_id: str, body: AgentUpdateRequest) -> dict:
    """Update editable fields of an agent. Returns 404 if not found, 400 if no fields provided."""
    if body.role is None and body.model is None:
        raise HTTPException(status_code=400, detail="Provide at least one of: role, model")
    result = update_agent_fields(agent_id, role=body.role, model=body.model)
    if not result:
        raise HTTPException(status_code=404, detail=f"Agent '{agent_id}' not found")
    return result


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


# ── Workspace ────────────────────────────────────────────────────────────────

class WorkspaceUpdateRequest(BaseModel):
    active_company_id: str = Field(..., min_length=1)


@app.get("/api/workspace", summary="Get workspace state")
def api_get_workspace() -> dict:
    """Return current workspace state (active_company_id)."""
    val = get_kv_record("active_company_id")
    return {"active_company_id": val}


@app.put("/api/workspace", summary="Update workspace state")
def api_put_workspace(body: WorkspaceUpdateRequest) -> dict:
    """Persist active company selection to musu-core kvstore."""
    set_kv_record("active_company_id", body.active_company_id)
    return {"active_company_id": get_kv_record("active_company_id")}


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


@app.get("/api/runs/recent", summary="Recent route executions (all companies)")
async def api_runs_recent(limit: int = Query(default=50, ge=1, le=500)) -> list[dict]:
    """Return the most recent route_executions across all companies."""
    return get_runs_recent_global(limit=limit)


@app.get("/api/costs/summary", summary="Global execution cost summary")
async def api_costs_summary_global() -> dict:
    """Return execution count summary across all companies."""
    return get_costs_global()


@app.get("/api/costs/by-agent", summary="Global per-agent execution counts")
async def api_costs_by_agent_global() -> list[dict]:
    """Return per-agent execution counts across all companies."""
    return get_costs_by_agent_global()


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


# ──────────────────────────────────────────────────────────────────
# LLM Wiki — Central Memory System
# ──────────────────────────────────────────────────────────────────

import re as _re
from pathlib import Path as _Path

_WIKI_PATH = _Path(os.environ.get("MUSU_WIKI_PATH", str(_Path.home() / "llm-wiki" / "wiki")))
_WIKI_PATH.mkdir(parents=True, exist_ok=True)  # ensure dir exists for new users


def _wiki_title(content: str, fallback: str) -> str:
    for line in content.split("\n"):
        if line.startswith("# "):
            return line[2:].strip()
    return fallback


def _iter_wiki_files():
    """Yield (file_path, folder_name) for all .md files, top-level and one level deep."""
    for f in sorted(_WIKI_PATH.glob("*.md")):
        yield f, ""
    for d in sorted(p for p in _WIKI_PATH.iterdir() if p.is_dir() and not p.name.startswith(".")):
        for f in sorted(d.glob("*.md")):
            yield f, d.name


@app.get("/api/wiki/pages", summary="List all wiki pages")
async def api_wiki_pages() -> list[dict]:
    """Return list of {id, title, folder} for every page in the LLM wiki.
    Top-level files have folder=''. Subfolder files have folder=<dirname> and id=<folder>/<stem>.
    """
    pages = []
    for f, folder in _iter_wiki_files():
        try:
            content = f.read_text(encoding="utf-8")
            title = _wiki_title(content, f.stem)
        except OSError:
            title = f.stem
        page_id = f"{folder}/{f.stem}" if folder else f.stem
        pages.append({"id": page_id, "title": title, "folder": folder})
    return pages


@app.get("/api/wiki/search", summary="Search wiki pages")
async def api_wiki_search(q: str = Query("", max_length=200)) -> list[dict]:
    """Full-text search across all wiki pages. Returns up to 20 results."""
    q_str = q.strip().lower()
    if not q_str:
        return []
    results = []
    for f, folder in _iter_wiki_files():
        try:
            content = f.read_text(encoding="utf-8")
        except OSError:
            continue
        if q_str in content.lower():
            idx = content.lower().find(q_str)
            start = max(0, idx - 120)
            end = min(len(content), idx + 300)
            snippet = content[start:end].replace("\n", " ").strip()
            title = _wiki_title(content, f.stem)
            page_id = f"{folder}/{f.stem}" if folder else f.stem
            results.append({"id": page_id, "title": title, "folder": folder, "snippet": snippet})
    return results[:20]


@app.get("/api/wiki/page/{page_id:path}", summary="Get a wiki page by ID")
async def api_wiki_page(page_id: str = Path(..., max_length=200)) -> dict:
    """Return the full markdown content of a wiki page.
    Supports both flat IDs (e.g. 'index') and folder IDs (e.g. 'musu/getting-started').
    """
    # Sanitize: allow alphanumeric, underscore, hyphen, forward slash only
    safe_id = _re.sub(r"[^a-zA-Z0-9_\-/]", "", page_id).strip("/").replace("//", "/")
    parts = safe_id.split("/", 1)
    if len(parts) == 2:
        folder, stem = parts
        path = _WIKI_PATH / folder / f"{stem}.md"
    else:
        path = _WIKI_PATH / f"{safe_id}.md"
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"Wiki page '{safe_id}' not found.")
    content = path.read_text(encoding="utf-8")
    return {"id": safe_id, "title": _wiki_title(content, safe_id.split("/")[-1]), "content": content}


class _WikiWriteRequest(_BaseModel):
    content: str
    folder: str = ""


@app.post("/api/wiki/page/{page_id:path}", summary="Create or update a wiki page")
async def api_wiki_page_write(
    page_id: str = Path(..., max_length=200),
    body: _WikiWriteRequest = _Body(...),
    _auth=Depends(require_bearer_token),
) -> dict:
    """Create or overwrite a wiki page. page_id is the stem (e.g. 'my-page' or 'folder/my-page')."""
    safe_id = _re.sub(r"[^a-zA-Z0-9_\-/]", "", page_id).strip("/").replace("//", "/")
    if not safe_id:
        raise HTTPException(status_code=400, detail="Invalid page ID")
    parts = safe_id.split("/", 1)
    if len(parts) == 2:
        folder, stem = parts
        dir_path = _WIKI_PATH / folder
    else:
        folder, stem = "", safe_id
        dir_path = _WIKI_PATH
    dir_path.mkdir(parents=True, exist_ok=True)
    path = dir_path / f"{stem}.md"
    path.write_text(body.content, encoding="utf-8")
    title = _wiki_title(body.content, stem)
    return {"id": safe_id, "title": title, "folder": folder}


@app.delete("/api/wiki/page/{page_id:path}", summary="Delete a wiki page")
async def api_wiki_page_delete(
    page_id: str = Path(..., max_length=200),
    _auth=Depends(require_bearer_token),
) -> dict:
    """Delete a wiki page by ID."""
    safe_id = _re.sub(r"[^a-zA-Z0-9_\-/]", "", page_id).strip("/").replace("//", "/")
    parts = safe_id.split("/", 1)
    if len(parts) == 2:
        folder, stem = parts
        path = _WIKI_PATH / folder / f"{stem}.md"
    else:
        path = _WIKI_PATH / f"{safe_id}.md"
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"Wiki page '{safe_id}' not found.")
    path.unlink()
    return {"deleted": safe_id}


@app.get("/health")
async def health() -> dict:
    return {"status": "ok"}


# ── Screen snapshot ────────────────────────────────────────────────────────────
import threading as _threading
_mss_lock = _threading.Lock()


def _find_display_env() -> dict:
    """Return dict with DISPLAY and XAUTHORITY set, or empty dict if not found."""
    import glob
    env: dict = {}

    # DISPLAY: check env, then X11 lock files
    display = os.environ.get("DISPLAY", "")
    if not display:
        locks = sorted(glob.glob("/tmp/.X*-lock"))
        if locks:
            # Extract display number from /tmp/.X1-lock → ":1"
            num = locks[0].replace("/tmp/.X", "").replace("-lock", "")
            display = f":{num}"
        else:
            display = ":0"
    env["DISPLAY"] = display

    # XAUTHORITY: check env first, then common paths
    xauth = os.environ.get("XAUTHORITY", "")
    if not xauth or not os.path.exists(xauth):
        candidates = [
            os.path.expanduser("~/.Xauthority"),
            f"/run/user/{os.getuid()}/gdm/Xauthority",
            f"/run/user/{os.getuid()}/xauthority",
        ] + sorted(glob.glob("/tmp/xauth_*"), reverse=True)  # most recent first
        for c in candidates:
            if os.path.exists(c):
                xauth = c
                break
    if xauth:
        env["XAUTHORITY"] = xauth

    return env


def _capture_mss(tmp_png: str, display_env: dict, monitor_index: int = 1) -> bool:
    """Capture screenshot using python-mss (libX11 direct). Returns True on success."""
    with _mss_lock:
        # mss reads DISPLAY/XAUTHORITY from environment
        old = {k: os.environ.get(k) for k in display_env}
        try:
            os.environ.update(display_env)
            import mss
            import mss.tools
            with mss.mss() as sct:
                idx = monitor_index if 0 < monitor_index < len(sct.monitors) else (1 if len(sct.monitors) > 1 else 0)
                monitor = sct.monitors[idx]
                img = sct.grab(monitor)
                mss.tools.to_png(img.rgb, img.size, output=tmp_png)
            return os.path.exists(tmp_png) and os.path.getsize(tmp_png) > 0
        except Exception as _exc:
            logger.debug("_capture_mss failed: %s", _exc)
            return False
        finally:
            for k, v in old.items():
                if v is None:
                    os.environ.pop(k, None)
                else:
                    os.environ[k] = v


def _png_to_jpeg(png_path: str, jpg_path: str, quality: int = 65) -> bool:
    """Convert PNG to JPEG via Pillow. Returns True on success."""
    try:
        from PIL import Image
        with Image.open(png_path) as im:
            im.convert("RGB").save(jpg_path, "JPEG", quality=quality, optimize=True)
        return True
    except Exception as _exc:
        logger.debug("_png_to_jpeg failed: %s", _exc)
        return False


def _capture_ffmpeg(tmp_jpg: str, display_env: dict) -> bool:
    """Capture screenshot using ffmpeg x11grab. Returns True on success."""
    import subprocess
    import shutil as _shutil
    if not _shutil.which("ffmpeg"):
        return False
    display = display_env.get("DISPLAY", ":0")
    base_display = display.split(".")[0]  # strip any existing ".0" suffix
    env = os.environ.copy()
    env.update(display_env)
    # detect actual resolution
    res = "1920x1080"  # fallback
    if _shutil.which("xdpyinfo"):
        try:
            import subprocess as _sp2
            out = _sp2.run(["xdpyinfo", "-display", base_display],
                           capture_output=True, text=True, timeout=3,
                           env={**os.environ, **display_env}).stdout
            for line in out.splitlines():
                if "dimensions:" in line:
                    res = line.split()[1]  # e.g. "1920x1080"
                    break
        except Exception:
            pass
    try:
        subprocess.run(
            ["ffmpeg", "-y", "-f", "x11grab", "-video_size", res,
             "-i", f"{base_display}.0", "-vframes", "1", "-q:v", "3", tmp_jpg],
            env=env, timeout=15, check=True, capture_output=True,
        )
        return os.path.exists(tmp_jpg) and os.path.getsize(tmp_jpg) > 0
    except Exception as _exc:
        logger.debug("_capture_ffmpeg failed: %s", _exc)
        return False


def _capture_scrot(tmp_jpg: str, display_env: dict) -> bool:
    """Capture screenshot using scrot. Returns True on success."""
    import subprocess
    import shutil
    if not shutil.which("scrot"):
        return False
    env = os.environ.copy()
    env.update(display_env)
    try:
        subprocess.run(
            ["scrot", "-q", "65", "-o", tmp_jpg],
            env=env, timeout=10, check=True, capture_output=True,
        )
        return os.path.exists(tmp_jpg) and os.path.getsize(tmp_jpg) > 0
    except Exception as _exc:
        logger.debug("_capture_scrot failed: %s", _exc)
        return False


def _do_capture_sync(display_env: dict, tmp_png: str, tmp_jpg: str, monitor_index: int = 1) -> bool:
    """Run the mss→ffmpeg→scrot fallback chain synchronously. Returns True on success."""
    if _capture_mss(tmp_png, display_env, monitor_index) and _png_to_jpeg(tmp_png, tmp_jpg):
        return True
    if _capture_ffmpeg(tmp_jpg, display_env):
        return True
    if _capture_scrot(tmp_jpg, display_env):
        return True
    return False


@app.get("/api/screen/monitors")
async def screen_monitors() -> dict:
    """List available monitors on this machine.

    Returns {"monitors": [{"index": 1, "width": 1920, "height": 1080, "left": 0, "top": 0}, ...]}
    Index matches sct.monitors index (1-based for real monitors; 0 = virtual all-in-one).
    """
    display_env = _find_display_env()
    try:
        import mss
        old = {k: os.environ.get(k) for k in display_env}
        try:
            os.environ.update(display_env)
            with mss.mss() as sct:
                result = [
                    {
                        "index": i,
                        "width": m["width"],
                        "height": m["height"],
                        "left": m["left"],
                        "top": m["top"],
                    }
                    for i, m in enumerate(sct.monitors)
                    if i > 0  # skip index 0 (all-in-one virtual)
                ]
        finally:
            for k, v in old.items():
                if v is None:
                    os.environ.pop(k, None)
                else:
                    os.environ[k] = v
        return {"monitors": result}
    except Exception as exc:
        raise HTTPException(500, detail=f"monitor list failed: {exc}") from exc


@app.get("/api/screen/snapshot")
async def screen_snapshot(monitor: int = 1) -> dict:
    """Capture a screenshot of this machine and return as base64 JPEG.

    Tries multiple capture methods in order:
      1. python-mss (libX11 direct) + Pillow PNG→JPEG conversion
      2. ffmpeg -f x11grab -vframes 1
      3. scrot
    Returns {"snapshot": "data:image/jpeg;base64,...", "ts": <epoch_ms>}
    """
    import base64
    import tempfile
    import time

    display_env = _find_display_env()

    # Try mss first (PNG), convert to JPEG
    with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as f:
        tmp_png = f.name
    with tempfile.NamedTemporaryFile(suffix=".jpg", delete=False) as f:
        tmp_jpg = f.name

    try:
        loop = asyncio.get_running_loop()
        captured = await loop.run_in_executor(None, _do_capture_sync, display_env, tmp_png, tmp_jpg, monitor)

        if not captured:
            raise HTTPException(
                status_code=503,
                detail=(
                    f"Screen capture unavailable "
                    f"(display={display_env.get('DISPLAY', 'none')}, "
                    f"xauth={'yes' if display_env.get('XAUTHORITY') else 'no'}) "
                    f"— try: pip install mss pillow"
                ),
            )

        with open(tmp_jpg, "rb") as f:
            data = base64.b64encode(f.read()).decode()
        return {"snapshot": f"data:image/jpeg;base64,{data}", "ts": int(time.time() * 1000)}
    finally:
        for p in (tmp_png, tmp_jpg):
            try:
                os.unlink(p)
            except OSError:
                pass


# ── Watchdog endpoints (P2P remote bridge control via musu-connectsd) ─────────

_WATCHDOG_ALLOWED = frozenset({"bridge:start", "bridge:stop", "bridge:restart", "agents:cleanup"})

# Rate limit: max 1 watchdog command per (node, command) pair per 10s (in-memory, per-process)
_watchdog_rate: dict[str, float] = {}
_WATCHDOG_RATE_WINDOW = 10.0  # seconds


def _watchdog_rate_check(node: str, command: str) -> bool:
    """Return True if allowed, False if rate-limited. Updates the timestamp on True."""
    import time
    key = f"{node}:{command}"
    now = time.monotonic()
    last = _watchdog_rate.get(key, 0.0)
    if now - last < _WATCHDOG_RATE_WINDOW:
        return False
    _watchdog_rate[key] = now
    return True


@app.post("/api/watchdog/{node}/{command}")
async def watchdog_command(node: str, command: str) -> dict:
    """Send a watchdog command to a node's connectsd via QUIC.

    Routes via local musu-connectsd bridge-proxy — musu.pro is not involved.
    The remote connectsd executes the command (systemctl, sqlite3, etc.) locally.
    """
    if command not in _WATCHDOG_ALLOWED:
        raise HTTPException(status_code=400, detail=f"Unknown watchdog command: {command!r}")
    if not _watchdog_rate_check(node, command):
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


@app.get("/api/watchdog/{node}/status")
async def watchdog_status(node: str) -> dict:
    """Get watchdog + bridge status from a node's connectsd."""
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


@app.post("/api/system/update", summary="Run auto-update (git pull + restart if changed)")
async def system_update() -> dict:
    """Execute scripts/auto-update.sh — git pull and restart services if files changed.

    Authentication is enforced globally by apply_musu_middlewares (Bearer token).
    Runs the script with a 90-second timeout; returns exit_code + output.
    """
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


# ── VNC remote desktop endpoints ──────────────────────────────────────────────


@app.post("/api/screen/vnc/start")
async def screen_vnc_start(display: str = Query(default="")) -> dict:
    """Start x11vnc on localhost:5900 for the given DISPLAY.

    If display is not specified, auto-detects via _find_display_env() (same
    logic used by the snapshot endpoint — checks loginctl, /tmp/.X*, etc.)
    Requires x11vnc installed: sudo apt install x11vnc
    Authentication enforced globally by apply_musu_middlewares.
    """
    display_env = _find_display_env()
    if not display:
        display = display_env.get("DISPLAY", ":0")
    xauthority = display_env.get("XAUTHORITY", "")
    try:
        return await asyncio.get_running_loop().run_in_executor(
            None, screen_vnc.start_vnc, display, xauthority
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@app.post("/api/screen/vnc/stop")
async def screen_vnc_stop() -> dict:
    """Stop the x11vnc subprocess if running."""
    return await asyncio.get_running_loop().run_in_executor(None, screen_vnc.stop_vnc)


@app.get("/api/screen/vnc/status")
async def screen_vnc_status() -> dict:
    """Return current VNC server status (running, pid, port)."""
    return screen_vnc.get_vnc_status()


@app.get("/api/screen/vnc/token")
async def screen_vnc_token() -> dict:
    """Issue a one-time WebSocket token (60s TTL).

    Response includes relay_ws_url so the browser can connect via musu-relay
    instead of directly to the bridge (direct access requires Tailscale/LAN).
    """
    tok = screen_vnc.issue_token()
    # Build relay WebSocket URL: convert http(s) → ws(s) and append ws-proxy path
    relay_ws_url = ""
    if cfg.relay_url and cfg.node_name:
        relay_base = (
            cfg.relay_url.rstrip("/")
            .replace("https://", "wss://")
            .replace("http://", "ws://")
        )
        # Railway only allows WS upgrades on /tunnel — no query params needed.
        # Browser will do first-message handshake: {"type":"vnc-proxy","node":..,"token":..}
        relay_ws_url = f"{relay_base}/tunnel"
    return {
        "token": tok,
        "launcher_path": f"/screen/novnc/launcher.html?token={tok}",
        "relay_ws_url": relay_ws_url,
        "node_name": cfg.node_name or "",
    }


@app.websocket("/api/screen/ws-vnc")
async def ws_vnc(websocket: WebSocket, token: str = Query(...)) -> None:
    """WebSocket VNC proxy — bridges noVNC RFB to x11vnc TCP:5900.

    Token must be obtained from GET /api/screen/vnc/token (single-use, 60s TTL).
    Authentication is via the one-time token; no Bearer header needed here.
    """
    await screen_vnc.ws_vnc_proxy(websocket, token)


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
