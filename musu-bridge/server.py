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
  GET  /health/ready           — Readiness probe (DB connectivity)
  GET  /metrics                — Prometheus metrics (HTTP RED + agent task counters)
  GET  /api/system/circuit-breakers — Circuit breaker state (heartbeat CB + active tasks)
"""
from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import os
import sys
import time
from contextlib import asynccontextmanager
from contextvars import ContextVar
import uuid
from typing import Annotated, List, Literal

# ContextVar for request_id trace propagation — set by RequestIDMiddleware
_request_id_var: ContextVar[str | None] = ContextVar("request_id", default=None)
# ContextVars for agent/task structured logging — set by handlers before dispatch
_agent_id_var: ContextVar[str | None] = ContextVar("agent_id", default=None)
_task_id_var: ContextVar[str | None] = ContextVar("task_id", default=None)

import uvicorn
from fastapi import BackgroundTasks, Body, FastAPI, HTTPException, Path, Query, Request, Response, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from bridge_models import (  # noqa: F401
    RouteRequest, DelegateRequest, CompanyCreateRequest, CompanyUpdateRequest,
    AgentUpdateRequest, WorkspaceUpdateRequest,
    IssueCreateRequest, IssueUpdateRequest, IssueCommentRequest, IssueCheckoutRequest,
    ProjectCreateRequest, ProjectUpdateRequest,
    GoalCreateRequest, GoalUpdateRequest,
    HeartbeatInvokeRequest, GroupMessageRequest, FeedbackRequest,
)
from pydantic import BaseModel, Field  # still needed by Annotated usage
from starlette.middleware.base import BaseHTTPMiddleware

from musu_core.middleware import apply_musu_middlewares
from musu_core.redaction import install_redaction_filter
from writer_company import WRITER_COMPANY_ID, audit_writer_company_drift, build_writer_company_manifest, normalize_writer_company_manifest
import audit
import mesh_router as mesh_router
import screen_vnc

from metrics import (
    _PROMETHEUS_AVAILABLE, _record_task_metric, _increment_stuck_counter,
    _agent_tasks_total, _agent_task_duration, _active_tasks_gauge, _task_stuck_total,
    instrument_app, set_active_tasks_len,
)
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

class LogContextFilter(logging.Filter):
    """Injects ContextVar values (agent_id, task_id) into every LogRecord."""

    def filter(self, record: logging.LogRecord) -> bool:
        if not hasattr(record, "agent_id"):
            record.agent_id = _agent_id_var.get(None)  # type: ignore[attr-defined]
        if not hasattr(record, "task_id"):
            record.task_id = _task_id_var.get(None)  # type: ignore[attr-defined]
        return True


class JsonFormatter(logging.Formatter):
    """Formats log records as single-line JSON objects."""

    def format(self, record: logging.LogRecord) -> str:
        payload: dict = {
            "time": self.formatTime(record, "%Y-%m-%dT%H:%M:%S"),
            "level": record.levelname,
            "logger": record.name,
            "msg": record.getMessage(),
        }
        if hasattr(record, "request_id"):
            payload["request_id"] = record.request_id
        agent_id = getattr(record, "agent_id", None)
        if agent_id:
            payload["agent_id"] = agent_id
        task_id = getattr(record, "task_id", None)
        if task_id:
            payload["task_id"] = task_id
        if record.exc_info:
            payload["exc"] = self.formatException(record.exc_info)
        return json.dumps(payload, ensure_ascii=False)


class RequestIDMiddleware(BaseHTTPMiddleware):
    """Attaches a trace ID to every request, echoing X-Request-ID if provided."""

    async def dispatch(self, request: Request, call_next):
        request_id = request.headers.get("X-Request-ID") or str(uuid.uuid4())
        token = _request_id_var.set(request_id)
        try:
            response = await call_next(request)
        finally:
            _request_id_var.reset(token)
        response.headers["X-Request-ID"] = request_id
        return response


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
_CHANNEL_MAX_TASKS = int(os.environ.get("MUSU_CHANNEL_MAX_TASKS", "5"))

# In-memory dedup cache for duplicate dispatch prevention.
# Maps (channel, sha256(text)) → (task_id, monotonic_timestamp).
_dispatch_hash_cache: dict[tuple[str, str], tuple[str, float]] = {}
_DISPATCH_HASH_TTL_SEC: float = float(os.environ.get("MUSU_DISPATCH_HASH_TTL_SEC", "120"))


def _reregister_failed_hash(req_channel: str, req_text: str, task_id: str) -> None:
    """Refresh the dedup cache entry after a task fails with a 30s TTL window.

    Uses a backdated timestamp so the entry expires 30s from now, preventing
    rapid re-dispatch of a just-failed instruction without blocking it indefinitely.
    """
    _h_key = (req_channel, hashlib.sha256(req_text.encode()).hexdigest())
    # Backdate so TTL expires in ~30s: apparent age = TTL - 30s → remaining = 30s
    _dispatch_hash_cache[_h_key] = (task_id, time.monotonic() - (_DISPATCH_HASH_TTL_SEC - 30))


def _warmup_dispatch_hash_cache() -> None:
    """Populate _dispatch_hash_cache from DB on startup to survive bridge restarts.

    Loads running/done/failed route_executions created within the TTL window so that
    orchestrator re-queued instructions are still deduplicated after a restart.
    Failed tasks are loaded with a backdated timestamp (30s remaining TTL) to
    prevent rapid re-dispatch without blocking indefinitely.
    """
    try:
        from handlers import _get_backend
        backend = _get_backend()
        rows = backend._db.execute(
            "SELECT id, channel, input_hash, status FROM route_executions "
            "WHERE status IN ('running', 'done', 'failed') "
            "AND created_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now', ? || ' seconds')",
            (f"-{int(_DISPATCH_HASH_TTL_SEC)}",),
        )
        loaded = 0
        for row in rows:
            rec_id, channel, input_hash, status = row[0], row[1], row[2], row[3]
            if input_hash:
                if status == "failed":
                    # Backdate so only ~30s of TTL remains — mirrors _reregister_failed_hash()
                    ts = time.monotonic() - (_DISPATCH_HASH_TTL_SEC - 30)
                else:
                    ts = time.monotonic()
                _dispatch_hash_cache[(channel, input_hash)] = (rec_id, ts)
                loaded += 1
        if loaded:
            logger.info("warmup: loaded %d dedup hash(es) from DB into cache", loaded)
    except Exception as _e:
        logger.warning("warmup: failed to warm up dispatch hash cache — %s", _e)


class _ChannelSemaphore:
    """asyncio.Semaphore wrapper that exposes capacity without internal attribute access.

    Semaphore is created lazily on first acquire so that constructing this object
    outside a running event loop (e.g. at module import time) does not raise
    RuntimeError: no running event loop.

    Uses asyncio.Semaphore (not BoundedSemaphore) deliberately: BoundedSemaphore raises
    ValueError on over-release, which surfaces as "semaphore boom" in task logs when the
    _value setter races with in-flight releases. The manual bound check in release() gives
    the same safety guarantee without the ValueError.
    """

    def __init__(self, capacity: int) -> None:
        self._capacity = capacity
        self._available = capacity
        self._sem: asyncio.Semaphore | None = None

    def _ensure_sem(self) -> asyncio.Semaphore:
        if self._sem is None:
            safe_value = max(0, min(self._available, self._capacity))
            self._sem = asyncio.Semaphore(safe_value)
        return self._sem

    @property
    def available(self) -> int:
        return self._available

    @property
    def capacity(self) -> int:
        return self._capacity

    @property
    def _value(self) -> int:
        """Backward-compat shim for tests that read _value directly."""
        return self._available

    @_value.setter
    def _value(self, v: int) -> None:
        """Backward-compat shim for tests that set _value directly.

        Only updates _available — does NOT replace _sem, so in-flight acquire/release
        operations on the existing semaphore are not invalidated.
        """
        self._available = max(0, v)

    async def acquire(self, timeout: float | None = None) -> None:
        """Acquire the semaphore slot.

        Args:
            timeout: If given, raises asyncio.TimeoutError after this many seconds
                     instead of blocking indefinitely.  Prevents the 'semaphore boom'
                     symptom where a task cancelled while blocked on acquire leaves the
                     channel wedged at capacity.
        """
        if timeout is not None:
            await asyncio.wait_for(self._ensure_sem().acquire(), timeout=timeout)
        else:
            await self._ensure_sem().acquire()
        self._available -= 1

    def release(self) -> None:
        if self._sem is None:
            # acquire() was never called — nothing to release
            return
        if self._available >= self._capacity:
            # Already at full capacity — guard against double-release.
            return
        self._sem.release()
        self._available = min(self._available + 1, self._capacity)

    def at_capacity(self) -> bool:
        return self._available <= 0

    async def __aenter__(self) -> "_ChannelSemaphore":
        # Phase 92: raised from 30s to 60s — Phase 89 set task timeout to 600s,
        # so 30s would abandon tasks blocked at capacity before the channel clears.
        _timeout = float(os.environ.get("MUSU_SEMAPHORE_ACQUIRE_TIMEOUT_SEC", "60"))
        try:
            await self.acquire(timeout=_timeout)
        except asyncio.TimeoutError:
            raise RuntimeError("channel_at_capacity") from None
        return self

    async def __aexit__(self, *args: object) -> None:
        self.release()


_channel_semaphores: dict[str, _ChannelSemaphore] = {}


def _get_channel_semaphore(channel: str) -> _ChannelSemaphore:
    if channel not in _channel_semaphores:
        _channel_semaphores[channel] = _ChannelSemaphore(_CHANNEL_MAX_TASKS)
    return _channel_semaphores[channel]


# ── Channel circuit breaker (extracted to channel_circuit_breaker.py) ─────────
from channel_circuit_breaker import (  # noqa: F401
    CIRCUIT_TRIP_THRESHOLD, CIRCUIT_BACKOFF_BASE_SECONDS, CIRCUIT_WINDOW_MINUTES,
    _ChannelCircuitBreaker, _channel_cb,
)

# ── Heartbeat schedulers (extracted to heartbeat_scheduler.py) ────────────────
from heartbeat_scheduler import (  # noqa: F401
    _heartbeat_lock, _get_heartbeat_backend, _should_skip_heartbeat,
    _has_running_ceo_task, _heartbeat_iteration,
    _agent_heartbeat_scheduler, _team_lead_heartbeat_scheduler,
    _node_manager_heartbeat, _company_locks, _get_company_lock,
    auto_distribute_loop,
    morning_report_cron,
    qa_auto_evaluate_loop,
    budget_reset_cron,
    wiki_sync_cron,
)


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
            from seed_agents import detect_cli, build_config
            _det_adapter, _det_cmd = detect_cli()
            _mgr_config = build_config("node_manager", _det_adapter, _det_cmd, os.getcwd())
            _mgr_config["node_name"] = _local_node
            _mgr_backend.agents.create(
                name=_mgr_name,
                role="Node Manager",
                adapter_type=_det_adapter,
                adapter_config=_mgr_config,
            )
            logger.info("startup: seeded node manager agent %r for node=%r", _mgr_name, _local_node)
        else:
            # Fix existing mgr if it's missing command
            _mgr_cfg = _existing_mgr.get("adapter_config", {})
            if not _mgr_cfg.get("command"):
                from seed_agents import detect_cli, build_config
                _det_adapter, _det_cmd = detect_cli()
                _new_cfg = build_config("node_manager", _det_adapter, _det_cmd, os.getcwd())
                _new_cfg["node_name"] = _local_node
                for _k, _v in _new_cfg.items():
                    if _k not in _mgr_cfg:
                        _mgr_cfg[_k] = _v
                _mgr_backend.agents.update(_existing_mgr["id"], adapter_config=_mgr_cfg)
                logger.info("startup: fixed node manager %r config (added command)", _mgr_name)
            else:
                logger.info("startup: node manager %r already exists", _mgr_name)
        # Register local agents in nodes.toml so mesh routing knows they live here.
        # Only assign agents that belong to this node:
        # - Agents without any node prefix (generic: ceo, cto, worker, etc.)
        # - Agents prefixed with this node's name (e.g. 4060-CEO on node 4060)
        # - mgr-{this_node}
        # Skip agents prefixed with other node names (e.g. hugh-main-CEO on node 4060).
        _other_nodes = {n for n in router._node_urls if n != _local_node}
        _local_agents = []
        for _a in _mgr_backend.list_agents():
            if _a.get("company_id"):
                continue
            _aname = _a["name"]
            # Skip if prefixed with another node's name
            _skip = False
            for _on in _other_nodes:
                if _aname.lower().startswith(f"{_on.lower()}-") or _aname.lower().startswith(f"mgr-{_on.lower()}"):
                    _skip = True
                    break
            if not _skip:
                _local_agents.append(_aname)
        router.auto_assign_agents(_local_node, _local_agents)
    except Exception as _e:
        logger.warning("startup: failed to seed node manager — %s", _e)

    # Determine if this is the primary (orchestrator) node.
    # Only primary seeds company agents. Default: True (single-node = always primary).
    _is_primary = os.environ.get("MUSU_NODE_ROLE", "primary").lower() == "primary"

    # Restore channel→agent mapping from DB on startup.
    # channel_agent_map is env-driven (static). Agents must exist in DB for routing to work.
    # Any missing agents are auto-seeded so routing works immediately after restart without
    # requiring a manual `python seed_agents.py` run.
    try:
        from handlers import _get_backend as _gb_chan
        from seed_agents import AGENTS as _SEED_AGENTS
        _chan_backend = _gb_chan()
        _cfg_chan = get_config()
        _all_agents = _chan_backend.list_agents()
        _all_names = {a["name"] for a in _all_agents}  # includes retired
        # Build lookup: channel_key (e.g. "ceo") → seed template
        _seed_by_channel = {a["name"]: a for a in _SEED_AGENTS}
        _broken: list[str] = []
        _ok: list[str] = []
        _seeded: list[str] = []
        for _ch, _agent_name in _cfg_chan.channel_agent_map.items():
            if _agent_name in _all_names:
                _ok.append(_ch)
            elif _is_primary:
                # Only primary node auto-seeds company-level agents (CEO, CTO, etc)
                _tmpl = _seed_by_channel.get(_ch)
                if _tmpl:
                    try:
                        _chan_backend.create_agent(
                            name=_agent_name,
                            role=_tmpl["role"],
                            adapter_type=_tmpl["adapter_type"],
                            adapter_config=_tmpl["adapter_config"],
                            company_id=os.environ.get("PAPERCLIP_COMPANY_ID") or None,
                        )
                        _seeded.append(_ch)
                        _ok.append(_ch)
                        logger.info(
                            "startup: auto-seeded missing agent %r for channel=%r",
                            _agent_name, _ch,
                        )
                    except Exception as _seed_err:
                        _broken.append(f"{_ch}→{_agent_name}")
                        logger.warning(
                            "startup: failed to auto-seed agent %r for channel=%r — %s",
                            _agent_name, _ch, _seed_err,
                        )
                else:
                    _broken.append(f"{_ch}→{_agent_name}")
            else:
                # Secondary node: skip seeding company agents
                pass
        if _seeded:
            logger.info("startup: auto-seeded %d agent(s): %s", len(_seeded), ", ".join(_seeded))
        if _ok:
            logger.info("startup: channel mapping OK for %d channel(s): %s", len(_ok), ", ".join(_ok))
        if _broken:
            logger.warning(
                "startup: %d channel(s) have no active agent in DB — routing will fail: %s",
                len(_broken), "; ".join(_broken),
            )
        else:
            logger.info("startup: all channel→agent mappings resolved from DB")
    except Exception as _e:
        logger.warning("startup: channel mapping check failed — %s", _e)

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
            _now = time.monotonic()
            for rec in pending:
                # Dedup gate: skip if an identical instruction was already dispatched within TTL.
                # Prevents orchestrator re-queue + durability re-dispatch from double-firing.
                _h_key = (rec["channel"], hashlib.sha256(rec["input"].encode()).hexdigest())
                _cached = _dispatch_hash_cache.get(_h_key)
                if _cached is not None:
                    _orig_id, _ts = _cached
                    if _now - _ts < _DISPATCH_HASH_TTL_SEC:
                        logger.info(
                            "durability: skipping re-dispatch (dedup hit) exec_id=%s orig=%s",
                            rec["id"], _orig_id,
                        )
                        continue
                # Phase 92: skip if task_id is already live in _active_tasks.
                # Prevents durability loop from spawning duplicate coroutine for a
                # task that is already executing (e.g. after orchestrator reconnect
                # re-sends the same task_id that is still running in-process).
                if rec["id"] in _active_tasks:
                    logger.info(
                        "durability: skip re-dispatch task_id=%s — already live in _active_tasks",
                        rec["id"],
                    )
                    continue
                backend.increment_retry_count(rec["id"])
                asyncio.create_task(route_chat(
                    channel=rec["channel"],
                    sender_id=rec["sender_id"],
                    text=rec["input"],
                    exec_id=rec["id"],
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
    from relay_client import relay_loop, _session_cleanup_loop
    session_cleanup_task = asyncio.create_task(_session_cleanup_loop())
    logger.info("relay_client: session cleanup task started")
    if cfg.relay_enabled and cfg.relay_url and musu_token:
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

    # Team Lead heartbeat scheduler (optional — enabled by default if CEO is on)
    team_lead_task = None
    if os.environ.get("MUSU_TEAM_LEAD_HEARTBEAT_ENABLED", os.environ.get("MUSU_CEO_HEARTBEAT_ENABLED", "")).lower() == "true":
        team_lead_task = asyncio.create_task(_team_lead_heartbeat_scheduler())
        logger.info("team_lead_scheduler: task started")

    # Node manager heartbeat (optional — only when MUSU_NODE_HEARTBEAT_ENABLED=true)
    node_heartbeat_task = None
    if os.environ.get("MUSU_NODE_HEARTBEAT_ENABLED", "").lower() == "true":
        node_heartbeat_task = asyncio.create_task(_node_manager_heartbeat())
        logger.info("node_heartbeat: task started")

    # Auto-distribution (optional — routes pending tasks to optimal nodes)
    auto_distribute_task = None
    if os.environ.get("MUSU_AUTO_DISTRIBUTE_ENABLED", "").lower() == "true":
        auto_distribute_task = asyncio.create_task(auto_distribute_loop())
        logger.info("auto_distribute: task started")

    # Morning report cron (optional — posts daily report at 08:00 KST)
    morning_report_task = None
    if os.environ.get("MUSU_MORNING_REPORT_ENABLED", "").lower() == "true":
        morning_report_task = asyncio.create_task(morning_report_cron())
        logger.info("morning_report_cron: task started")

    # QA auto-evaluate loop (runs if MUSU_QA_AUTO_ENABLED=true)
    qa_auto_task = asyncio.create_task(qa_auto_evaluate_loop())

    # Budget monthly reset cron (always on — checks hourly, resets on 1st)
    budget_reset_task = asyncio.create_task(budget_reset_cron())

    # Wiki auto-sync cron (every 10 min — syncs all company wikis via git)
    if os.environ.get("MUSU_WIKI_SYNC_ENABLED", "true").lower() != "false":
        wiki_sync_task = asyncio.create_task(wiki_sync_cron())

    # Watchdog rate limit cache cleanup (always on — prevents unbounded memory growth)
    watchdog_cleanup_task = asyncio.create_task(_watchdog_rate_cleanup_loop())

    # Stuck-task watchdog (always on — auto-cancels tasks running > threshold)
    stuck_watchdog_task = asyncio.create_task(_watchdog_loop())

    # Register with portd (wiki/003 — all services must register)
    try:
        import httpx
        async with httpx.AsyncClient(timeout=5) as _portd:
            _port = int(os.environ.get("BRIDGE_PORT", "8070"))
            _sig = f"tcp|python3|0.0.0.0|{_port}"
            await _portd.post("http://127.0.0.1:1355/promote", json={"signature": _sig, "alias": "bridge"})
            logger.info("portd: registered bridge as alias 'bridge'")
    except Exception as _pe:
        logger.info("portd: registration skipped (%s)", _pe)

    # ── Node join: secondary nodes register with primary on startup ────────
    # Auto-detect node identity (OS, GPU, machine group, etc.)
    try:
        from node_identity import detect_node_identity
        _identity = detect_node_identity()
    except Exception as _ide:
        logger.warning("node_identity: detection failed — %s", _ide)
        _identity = {}

    # Store self identity in mesh_router meta (even for primary)
    if _identity:
        router._node_meta[_local_node] = {
            "machine": _identity.get("machine", _local_node),
            "os": _identity.get("os", "linux"),
            "gpu": _identity.get("gpu", ""),
            "roles": list(router._node_agents.get(_local_node, [])),
            "machine_id": _identity.get("machine_id", ""),
            "win_hostname": _identity.get("win_hostname", ""),
            "tailscale_ip": _identity.get("tailscale_ip", ""),
            "rustdesk_id": "",
        }

    if not _is_primary:
        try:
            import httpx
            _primary_url = os.environ.get("MUSU_PRIMARY_URL", "")
            if _primary_url:
                _self_url = router._node_urls.get(_local_node, f"http://127.0.0.1:{os.environ.get('BRIDGE_PORT', '8070')}")
                _self_agents = router._node_agents.get(_local_node, [f"mgr-{_local_node}"])
                async with httpx.AsyncClient(timeout=10) as _join_http:
                    await _join_http.post(f"{_primary_url}/api/nodes/join", json={
                        "name": _local_node, "url": _self_url, "agents": _self_agents,
                        **_identity,
                    })
                logger.info("node_join: registered with primary %s", _primary_url)
            else:
                logger.info("node_join: secondary but MUSU_PRIMARY_URL not set, skipping")
        except Exception as _je:
            logger.warning("node_join: failed — %s", _je)

    # Record bridge_started lifecycle event
    try:
        _node_name = cfg.node_name
        _get_backend().record_node_event(_node_name, "bridge_started")
        logger.info("lifecycle: bridge_started event recorded for node=%r", _node_name)
    except Exception as _le:
        logger.warning("lifecycle: failed to record bridge_started — %s", _le)

    # Warm up dedup hash cache from DB so restart doesn't lose dedup state
    _warmup_dispatch_hash_cache()

    yield

    # Record bridge_stopped lifecycle event
    try:
        _get_backend().record_node_event(cfg.node_name, "bridge_stopped")
        logger.info("lifecycle: bridge_stopped event recorded for node=%r", cfg.node_name)
    except Exception as _le:
        logger.warning("lifecycle: failed to record bridge_stopped — %s", _le)

    stuck_watchdog_task.cancel()
    watchdog_cleanup_task.cancel()
    qa_auto_task.cancel()
    budget_reset_task.cancel()
    session_cleanup_task.cancel()
    discovery.close()
    if morning_report_task:
        morning_report_task.cancel()
    if auto_distribute_task:
        auto_distribute_task.cancel()
    if node_heartbeat_task:
        node_heartbeat_task.cancel()
    if team_lead_task:
        team_lead_task.cancel()
    if heartbeat_task:
        heartbeat_task.cancel()
    if relay_task:
        relay_task.cancel()
        try:
            await asyncio.wait_for(relay_task, timeout=5)
        except (asyncio.TimeoutError, asyncio.CancelledError):
            pass
    if mdns_task:
        mdns_task.cancel()
    if registry_task:
        registry_task.cancel()
    if peer_discovery_task:
        peer_discovery_task.cancel()
    if task:
        task.cancel()


app = FastAPI(title="musu-bridge", version="0.2.0", lifespan=lifespan)

# ── Prometheus metrics (extracted to metrics.py) ─────────────────────────────
instrument_app(app)
set_active_tasks_len(lambda: len(_active_tasks))


# ── Watchdog (extracted to watchdog.py) ────────────────────────────────────────
from watchdog import (  # noqa: F401
    _get_watchdog_backend, _run_watchdog_once, _watchdog_loop,
    _watchdog_rate_check, _watchdog_rate_cleanup_loop,
    _WATCHDOG_ALLOWED, _WATCHDOG_RATE_WINDOW, _watchdog_rate,
    _WATCHDOG_KILL_SEC, _WATCHDOG_ESCALATE_SEC, _WATCHDOG_WARN_SEC,
    _WATCHDOG_STUCK_THRESHOLD_SEC,
)


apply_musu_middlewares(
    app,
    bearer_token=os.getenv("MUSU_BRIDGE_TOKEN"),
    peer_token=os.getenv("MUSU_TOKEN", ""),   # account-level token; lets peer nodes sync
    rate_limit_capacity=60,
    rate_limit_window_seconds=60, # 1 minute
    rate_limit_key_type="ip",
    bypass_path_prefixes=("/screen/novnc",),  # noVNC static files are public; WS auth via one-time token
)

app.add_middleware(RequestIDMiddleware)
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


# Models: RouteRequest, DelegateRequest, CompanyCreateRequest, CompanyUpdateRequest
# → extracted to bridge_models.py


@app.post("/api/route")
async def api_route(req: RouteRequest, request: Request) -> dict:
    """Route a message to the agent mapped to the given channel."""
    result = await route_chat(
        channel=req.channel,
        sender_id=req.sender_id,
        text=req.text,
        adapter_override=req.adapter_override,
        cost_optimized=req.cost_optimized,
    )
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
    from handlers import _get_backend, validate_task_instruction

    # Validate instruction quality before dispatch (Phase 91 gate)
    validate_task_instruction(req.text, expected_output=req.expected_output)

    # Validate company_id if provided
    if req.company_id:
        _company = get_company(req.company_id)
        if not _company:
            raise HTTPException(status_code=400, detail=f"Company not found: {req.company_id!r}")
        if _company.get("status") != "active":
            raise HTTPException(status_code=400, detail=f"Company is not active: {req.company_id!r}")

    # W2/W5: Validate channel exists (check company-scoped agents too)
    channel_map = get_channel_map(company_id=req.company_id)
    if req.channel not in channel_map:
        raise HTTPException(status_code=400, detail=f"Unknown channel: {req.channel!r}")

    if len(_active_tasks) >= _MAX_CONCURRENT_TASKS:
        raise HTTPException(status_code=429, detail=f"Too many concurrent tasks (max {_MAX_CONCURRENT_TASKS})")

    # per-channel 체크 (전역 체크 직후)
    _ch_sem = _get_channel_semaphore(req.channel)
    if _ch_sem.at_capacity():
        raise HTTPException(
            status_code=429,
            detail=f"Channel '{req.channel}' at capacity ({_CHANNEL_MAX_TASKS} concurrent tasks)",
            headers={"Retry-After": "30"},
        )

    # Input hash dedup gate: same channel+instruction within TTL → return original task_id.
    # Instruction-aware: different instructions on the same channel are allowed through.
    if not req.allow_duplicate:
        _hash_key = (req.channel, hashlib.sha256(req.text.encode()).hexdigest())
        _now = time.monotonic()
        _cached = _dispatch_hash_cache.get(_hash_key)
        if _cached is not None:
            _orig_task_id, _ts = _cached
            if _now - _ts < _DISPATCH_HASH_TTL_SEC:
                return JSONResponse(
                    status_code=409,
                    content={
                        "status": "duplicate",
                        "task_id": _orig_task_id,
                        "detail": f"Channel '{req.channel}' has a recent task with same instruction — use allow_duplicate=true to override",
                    },
                    headers={"Retry-After": str(int(_DISPATCH_HASH_TTL_SEC))},
                )

    # Free tier gate: 50 task/day (bypass when MUSU_PLAN=pro)
    _FREE_TASK_LIMIT = 50
    if os.environ.get("MUSU_PLAN", "free").lower() != "pro":
        from handlers import _get_backend as _gb_gate
        _gate_backend = _gb_gate()
        _today = time.strftime("%Y-%m-%d")
        _rows = _gate_backend._db.execute(
            "SELECT COUNT(*) FROM route_executions WHERE created_at >= ?",
            (_today,),
        )
        _today_count = _rows[0][0] if _rows else 0
        if _today_count >= _FREE_TASK_LIMIT:
            raise HTTPException(
                status_code=429,
                detail=f"Daily task limit reached (Free: {_FREE_TASK_LIMIT}/day). Upgrade to Pro for unlimited tasks.",
            )

    task_id = str(uuid.uuid4())
    backend = _get_backend()
    try:
        backend.create_route_execution(task_id, req.channel, req.sender_id, req.text)
        backend.update_route_execution(task_id, "running")
    except Exception as exc:
        logger.error("delegate_task: failed to create durability record — %s", exc)
        raise HTTPException(status_code=500, detail="Failed to record task — try again")

    # Always store in hash cache so subsequent identical dispatches within TTL return duplicate.
    # (allow_duplicate=True bypasses the read-check above but still seeds the cache.)
    _h_key = (req.channel, hashlib.sha256(req.text.encode()).hexdigest())
    _dispatch_hash_cache[_h_key] = (task_id, time.monotonic())
    # Persist input_hash to DB so warmup can reload dedup state after restart.
    try:
        backend._db.execute(
            "UPDATE route_executions SET input_hash = ? WHERE id = ?",
            (_h_key[1], task_id),
        )
    except Exception:
        pass  # Non-critical: in-memory cache is the authoritative gate

    # Pass task_id so route_chat reuses this record instead of creating a new one.
    # QA loop path: use_qa_loop=True + channel=="engineer" → QALoop.run() (max 900s).
    # Standard path: use agent's adapter_config.timeout_sec (default 300s).
    _use_qa = req.use_qa_loop and req.channel == "engineer"
    if _use_qa:
        _timeout = 900
    else:
        _agent_id = channel_map[req.channel].get("agent_id")
        _agent_record = get_agent_by_id(_agent_id) if _agent_id else None
        _agent_timeout = int((_agent_record.get("adapter_config") or {}).get("timeout_sec", 300)) if _agent_record else 300
        _timeout = max(req.timeout_sec or 0, _agent_timeout) or 300

    async def _run_once() -> bool:
        """Run the task once. Returns True if successful."""
        if _use_qa:
            await asyncio.wait_for(
                route_chat_with_qa_loop(
                    task_id=task_id,
                    text=req.text,
                    sender_id=req.sender_id,
                    max_iter=req.qa_loop_max_iter,
                    company_id=req.company_id,
                ),
                timeout=_timeout,
            )
        else:
            _result = await asyncio.wait_for(
                route_chat(
                    channel=req.channel,
                    sender_id=req.sender_id,
                    text=req.text,
                    exec_id=task_id,
                    company_id=req.company_id,
                ),
                timeout=_timeout,
            )
            if isinstance(_result, dict) and "unavailable" in (_result.get("error") or "").lower():
                raise RuntimeError(f"Agent unavailable: {_result.get('error')}")
        return True

    async def _run_with_retry() -> None:
        try:
            async with _get_channel_semaphore(req.channel):
                max_retries = 1  # 1 automatic retry for transient failures
                _task_start = time.monotonic()
                for attempt in range(1 + max_retries):
                    try:
                        await _run_once()
                        _record_task_metric(req.channel, "completed", time.monotonic() - _task_start)
                        asyncio.create_task(_broadcast_task_event({"type": "task_update", "task_id": task_id}))
                        return
                    except asyncio.TimeoutError:
                        if attempt < max_retries:
                            logger.warning("delegate_task: task %s timed out (attempt %d), retrying...", task_id, attempt + 1)
                            backend.update_route_execution(task_id, "running")  # reset status for retry
                            continue
                        logger.warning("delegate_task: task %s timed out after %ds (no more retries)", task_id, _timeout)
                        cancel_task_record(task_id, error=f"timeout after {_timeout}s (retried {max_retries}x)")
                        _reregister_failed_hash(req.channel, req.text, task_id)
                        _record_task_metric(req.channel, "timeout", time.monotonic() - _task_start)
                        asyncio.create_task(_broadcast_task_event({"type": "task_update", "task_id": task_id}))
                    except RuntimeError as _exc:
                        # Adapter crash or agent unavailable — retry once
                        _exc_str = str(_exc)
                        if attempt < max_retries and ("exited with code" in _exc_str or "unavailable" in _exc_str.lower()):
                            logger.warning("delegate_task: task %s crashed (attempt %d): %s, retrying...", task_id, attempt + 1, _exc)
                            backend.update_route_execution(task_id, "running")
                            continue
                        logger.exception("delegate_task: task %s failed: %s", task_id, _exc)
                        cancel_task_record(task_id, error=f"adapter crash: {_exc}")
                        _reregister_failed_hash(req.channel, req.text, task_id)
                        _record_task_metric(req.channel, "failed", time.monotonic() - _task_start)
                        asyncio.create_task(_broadcast_task_event({"type": "task_update", "task_id": task_id}))
                    except Exception as _exc:
                        logger.exception("delegate_task: task %s raised unhandled exception: %s", task_id, _exc)
                        cancel_task_record(task_id, error=f"unhandled exception: {_exc}")
                        _reregister_failed_hash(req.channel, req.text, task_id)
                        _record_task_metric(req.channel, "failed", time.monotonic() - _task_start)
                        asyncio.create_task(_broadcast_task_event({"type": "task_update", "task_id": task_id}))
                        return  # Don't retry unknown exceptions
        except (RuntimeError, asyncio.TimeoutError) as _outer_exc:
            _exc_str = str(_outer_exc)
            if isinstance(_outer_exc, asyncio.TimeoutError) or _exc_str == "channel_at_capacity":
                # _ChannelSemaphore.__aenter__ converts TimeoutError → RuntimeError("channel_at_capacity").
                # When mocked, asyncio.TimeoutError may escape directly — treat both as capacity saturation.
                _sem_timeout = float(os.environ.get("MUSU_SEMAPHORE_ACQUIRE_TIMEOUT_SEC", "60"))
                logger.warning(
                    "delegate_task: task %s channel_at_capacity (semaphore acquire >%ds)",
                    task_id,
                    int(_sem_timeout),
                )
                cancel_task_record(task_id, error="channel_at_capacity")
                _reregister_failed_hash(req.channel, req.text, task_id)
            else:
                logger.exception("delegate_task: task %s outer RuntimeError: %s", task_id, _outer_exc)
                cancel_task_record(task_id, error=f"outer failure: {_outer_exc}")
                _reregister_failed_hash(req.channel, req.text, task_id)
        except Exception as _outer_exc:
            # Safety net: semaphore acquisition or other pre-loop failure must not leave a zombie record
            logger.exception("delegate_task: task %s outer failure: %s", task_id, _outer_exc)
            cancel_task_record(task_id, error=f"outer failure: {_outer_exc}")
            _reregister_failed_hash(req.channel, req.text, task_id)

    task = asyncio.create_task(_run_with_retry())
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
    company_id: str | None = Query(default=None, description="Filter by company ID"),
) -> list[dict]:
    """List delegated tasks, newest first. Supports status/channel/company filters and cursor pagination."""
    if channel is not None:
        channel_map = get_channel_map()
        if channel not in channel_map:
            raise HTTPException(status_code=400, detail=f"Unknown channel: {channel!r}")
    tasks = list_task_records(status=status, limit=limit, before_id=before_id, channel=channel)
    if company_id:
        tasks = [t for t in tasks if t.get("company_id", "") == company_id]
    return tasks


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


class AgentUpdateBody(BaseModel):
    adapter_type: str | None = None
    model: str | None = None
    instructions: str | None = None
    instructions_path: str | None = None
    timeout_sec: int | None = None
    budget_usd_monthly: float | None = None


@app.put("/api/agents/{agent_id}", summary="Update agent configuration")
async def api_update_agent(agent_id: str, body: AgentUpdateBody) -> dict:
    """Update adapter config, model, instructions, or budget for an agent."""
    from handlers import _get_backend
    backend = _get_backend()
    agent = backend.get_agent(agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail=f"Agent '{agent_id}' not found")

    updates: dict = {}
    config = dict(agent.get("adapter_config", {}))

    if body.adapter_type is not None:
        updates["adapter_type"] = body.adapter_type
    if body.model is not None:
        config["model"] = body.model
    if body.instructions is not None:
        config["instructions"] = body.instructions
    if body.instructions_path is not None:
        config["instructions_path"] = body.instructions_path
    if body.timeout_sec is not None:
        config["timeout_sec"] = body.timeout_sec
    if config != agent.get("adapter_config", {}):
        updates["adapter_config"] = config
    if body.budget_usd_monthly is not None:
        updates["budget_usd_monthly"] = body.budget_usd_monthly

    if not updates:
        return agent

    result = backend.update_agent(agent_id, **updates)
    return result if result else agent


@app.patch("/api/agents/{agent_id}", summary="Update agent role, model, or adapter_config")
async def api_update_agent(agent_id: str, body: AgentUpdateRequest) -> dict:
    """Update editable fields of an agent. Returns 404 if not found, 400 if no fields provided."""
    if body.role is None and body.model is None and body.adapter_config_patch is None and body.adapter_type is None:
        raise HTTPException(status_code=400, detail="Provide at least one of: role, model, adapter_config_patch, adapter_type")
    result = update_agent_fields(agent_id, role=body.role, model=body.model, adapter_config_patch=body.adapter_config_patch, adapter_type=body.adapter_type)
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


@app.post("/api/companies", summary="Create a company (optionally from template)")
async def api_create_company(req: CompanyCreateRequest) -> dict:
    """Create a company. Known template → auto-creates agent team.

    Returns {"company": {...}, "agents": [...]} for template-based creation,
    or a flat company dict for plain creation (backward compat).
    """
    from company_templates import get_template
    from handlers import create_company_from_template

    if get_template(req.template_key):
        return create_company_from_template(
            name=req.name,
            template_key=req.template_key,
            purpose=req.purpose,
            work_dir=req.work_dir,
            test_cmd=req.test_cmd,
            workspace_id=req.workspace_id,
        )

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


@app.post("/api/companies/{company_id}/activate", summary="Activate a company")
async def api_activate_company(company_id: str) -> dict:
    """Set company status to 'active'. Agents in this company can receive tasks."""
    from handlers import set_company_status
    try:
        return set_company_status(company_id, "active")
    except KeyError:
        raise HTTPException(status_code=404, detail="Company not found")


@app.post("/api/companies/{company_id}/deactivate", summary="Deactivate a company")
async def api_deactivate_company(company_id: str) -> dict:
    """Set company status to 'inactive'. Task delegation will be rejected."""
    from handlers import set_company_status
    try:
        return set_company_status(company_id, "inactive")
    except KeyError:
        raise HTTPException(status_code=404, detail="Company not found")


@app.post("/api/companies/{company_id}/run", summary="Kick CEO to act on company goals")
async def api_company_run(company_id: str) -> dict:
    """Delegate a CEO task with full company context (purpose + goals + recent activity).

    The CEO reads the company's purpose and goals, reviews recent task history,
    and decides what to work on next.
    """
    company = get_company(company_id)
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    if company.get("status") == "inactive":
        raise HTTPException(status_code=503, detail="Company is inactive")

    from handlers import get_goals, get_recent_tasks
    goals = get_goals(company_id=company_id)
    recent = get_recent_tasks(limit=10)

    goals_text = "\n".join(
        f"- [{g.get('status', 'open')}] {g.get('title', '')}: {g.get('description', '')}"
        for g in goals
    ) or "(no goals set)"
    recent_text = "\n".join(
        f"- [{t.get('status')}] {t.get('input', '')[:80]}"
        for t in recent
    ) or "(no recent tasks)"

    instruction = (
        f"You are the CEO of {company['name']}.\n"
        f"Company purpose: {company.get('purpose', '(none)')}\n\n"
        f"Current goals:\n{goals_text}\n\n"
        f"Recent task activity (last 10):\n{recent_text}\n\n"
        "Review the above. Decide the most important next action. "
        "Delegate tasks to your team as needed. Report what you delegated and why."
    )

    _node = os.environ.get("MUSU_NODE_NAME", "local")
    _ceo_channel = os.environ.get("MUSU_CEO_AGENT_NAME", f"{_node}-CEO")
    result = await route_chat(channel=_ceo_channel, sender_id="orchestrator", text=instruction, company_id=company_id)
    return {"company_id": company_id, "task": result}


# ── Workspace ────────────────────────────────────────────────────────────────

# WorkspaceUpdateRequest → bridge_models.py


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
    """List agents scoped to a company. Returns company-owned agents + global agents."""
    company = get_company(company_id)
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    from handlers import _get_backend as _gb_agents
    backend = _gb_agents()
    # Company-scoped agents
    scoped = backend.list_agents(company_id=company_id)
    # Global agents (company_id IS NULL) — for backwards compat
    global_agents = [a for a in backend.list_agents() if a.get("company_id") is None]
    # Merge: scoped first, then globals not shadowed by scoped names
    scoped_names = {a["name"] for a in scoped}
    return scoped + [a for a in global_agents if a["name"] not in scoped_names]


@app.get("/api/companies/{company_id}/writer-company-health", summary="Audit writer-company drift")
async def api_writer_company_health(
    company_id: str,
    workspace_root: str = Query(default="/home/hugh51/writer"),
) -> dict:
    """Compare live writer-company state against the canonical writer-company manifest."""
    company = get_company(company_id)
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    if company_id != WRITER_COMPANY_ID:
        raise HTTPException(status_code=422, detail="Writer-company health audit only supports the canonical writer company.")
    from handlers import _get_backend as _gb_writer_health

    backend = _gb_writer_health()
    manifest = normalize_writer_company_manifest(
        build_writer_company_manifest(workspace_root=workspace_root),
        workspace_root=workspace_root,
    )
    return audit_writer_company_drift(backend, manifest)


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
    """Return a unified dashboard: agents + tasks + nodes (devices)."""
    company = get_company(company_id)
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    from handlers import list_task_records as list_tasks, _get_backend as _gb_dash, list_nodes
    backend = _gb_dash()
    # Company-scoped + global agents (same merge logic as /companies/{id}/agents)
    scoped = backend.list_agents(company_id=company_id)
    global_agents = [a for a in backend.list_agents() if a.get("company_id") is None]
    scoped_names = {a["name"] for a in scoped}
    agents = scoped + [a for a in global_agents if a["name"] not in scoped_names]
    # Filter tasks to those assigned to this company's agents
    agent_ids = {a["id"] for a in agents}
    all_tasks = list_tasks(limit=200)
    tasks = [t for t in all_tasks if t.get("assignee_agent_id") in agent_ids or not t.get("assignee_agent_id")]
    active_agents = [a for a in agents if a.get("status") == "active"]

    # Fetch node/device status from mesh_router
    try:
        nodes = await list_nodes()
    except Exception:
        nodes = []

    return {
        "company_id": company_id,
        "company_name": company.get("name"),
        "nodes": nodes,
        "agents": {"total": len(agents), "active": len(active_agents)},
        "tasks": {
            "total": len(tasks),
            "pending": len([t for t in tasks if t.get("status") == "pending"]),
            "running": len([t for t in tasks if t.get("status") == "running"]),
            "done": len([t for t in tasks if t.get("status") == "done"]),
            "failed": len([t for t in tasks if t.get("status") == "failed"]),
        },
    }


# ── Node Join Protocol ──────────────────────────────────────────────────────


class NodeJoinRequest(BaseModel):
    name: str
    url: str
    roles: list[str] = []
    gpu: str = ""
    agents: list[str] = []
    # Auto-detected identity fields
    os: str = ""
    machine: str = ""
    machine_id: str = ""
    win_hostname: str = ""
    tailscale_ip: str = ""


@app.post("/api/nodes/join", summary="Register a node in the mesh")
async def api_node_join(req: NodeJoinRequest):
    """Called by a remote bridge on startup to register itself with the primary."""
    router = get_mesh_router()
    existing_agents = router._node_agents.get(req.name, [])
    all_agents = list(set(existing_agents + req.agents))
    router.add_node(req.name, req.url, agents=all_agents)
    for agent_name in req.agents:
        router._agent_nodes[agent_name.lower()] = req.name
    # Store machine metadata from auto-detection
    router._node_meta[req.name] = {
        "machine": req.machine or req.name,
        "os": req.os or "linux",
        "gpu": req.gpu,
        "roles": req.roles,
        "machine_id": req.machine_id,
        "win_hostname": req.win_hostname,
        "tailscale_ip": req.tailscale_ip,
        "rustdesk_id": "",
    }
    router._write_toml()
    router.reload()
    logger.info("node_join: %s registered machine=%s os=%s gpu=%s", req.name, req.machine, req.os, req.gpu)
    return {"status": "joined", "node": req.name, "machine": req.machine, "agents_registered": all_agents}


# ── Governance API ──────────────────────────────────────────────────────────


@app.get("/api/companies/{company_id}/governance", summary="Get governance config")
async def api_get_governance(company_id: str):
    """Return the governance config for a company."""
    import json as _json
    company = get_company(company_id)
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    raw = company.get("governance_config", "{}")
    return _json.loads(raw) if isinstance(raw, str) else raw


@app.put("/api/companies/{company_id}/governance", summary="Update governance config")
async def api_update_governance(company_id: str, body: dict):
    """Update the governance config for a company (merges with existing)."""
    import json as _json
    company = get_company(company_id)
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    existing = _json.loads(company.get("governance_config", "{}"))
    existing.update(body)
    from handlers import update_company
    updated = update_company(company_id, governance_config=_json.dumps(existing))
    return _json.loads(updated.get("governance_config", "{}"))


# ── Agent Budget API ────────────────────────────────────────────────────────


@app.get("/api/agents/{agent_id}/budget", summary="Get agent budget status")
async def api_get_agent_budget(agent_id: str):
    """Return budget info for an agent."""
    from handlers import _get_backend
    backend = _get_backend()
    agent = backend.get_agent(agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    return {
        "agent_id": agent_id,
        "name": agent.get("name"),
        "budget_usd_monthly": agent.get("budget_usd_monthly"),
        "budget_usd_spent": agent.get("budget_usd_spent", 0.0),
        "budget_reset_at": agent.get("budget_reset_at"),
        "remaining": (agent["budget_usd_monthly"] - (agent.get("budget_usd_spent") or 0.0))
            if agent.get("budget_usd_monthly") is not None else None,
    }


# ── Ralph Loop ──────────────────────────────────────────────────────────────


class ResearchRequest(BaseModel):
    topic: str
    max_sources: int = 5


@app.post("/api/research", summary="Research a topic and save to LLM Wiki")
async def api_research(req: ResearchRequest, background_tasks: BackgroundTasks):
    """Research a topic via web search, synthesize with LLM, save as wiki page."""
    from research import research_and_wiki
    background_tasks.add_task(research_and_wiki, req.topic, req.max_sources)
    return {"started": True, "topic": req.topic, "max_sources": req.max_sources}


class RalphStartRequest(BaseModel):
    company_id: str
    max_iterations: int = 20
    channel: str = "team_lead"


@app.post("/api/ralph/start", summary="Start a Ralph Loop for a company")
async def api_ralph_start(req: RalphStartRequest, background_tasks: BackgroundTasks):
    """Start autonomous iteration loop. Returns immediately, runs in background."""
    from ralph_loop import ralph_loop, get_loop_status
    existing = get_loop_status(req.company_id)
    if existing and existing.get("status") == "running":
        return {"error": "Loop already running", "status": existing}

    background_tasks.add_task(ralph_loop, req.company_id, req.max_iterations, req.channel)
    return {"started": True, "company_id": req.company_id, "max_iterations": req.max_iterations}


@app.get("/api/ralph/status/{company_id}", summary="Get Ralph Loop status")
async def api_ralph_status(company_id: str):
    """Get current status of a Ralph Loop."""
    from ralph_loop import get_loop_status
    status = get_loop_status(company_id)
    if not status:
        return {"status": "not_running"}
    return status


@app.post("/api/ralph/cancel/{company_id}", summary="Cancel a Ralph Loop")
async def api_ralph_cancel(company_id: str):
    """Cancel a running Ralph Loop."""
    from ralph_loop import cancel_loop
    cancelled = cancel_loop(company_id)
    return {"cancelled": cancelled}


# ── OpenAI-compatible LLM Proxy ─────────────────────────────────────────────


@app.post("/v1/chat/completions", summary="OpenAI-compatible chat completions")
async def openai_chat_completions(request: Request):
    """Proxy for Hermes/OpenClaw/any OpenAI-compatible client.
    Routes through MUSU's existing adapters (claude_local, gemini_local, etc).
    """
    from openai_compat import handle_chat_completion
    try:
        body = await request.json()
    except Exception:
        return JSONResponse({"error": {"message": "Invalid JSON"}}, status_code=400)
    result = await handle_chat_completion(body)
    return JSONResponse(result)


@app.get("/v1/models", summary="List available models (OpenAI-compatible)")
async def openai_models():
    """Return MUSU channels as OpenAI model list."""
    from openai_compat import get_models_list
    return get_models_list()


# ── A2A Protocol ────────────────────────────────────────────────────────────


@app.get("/.well-known/agent.json", summary="A2A Agent Card discovery")
async def a2a_agent_card():
    """Return the A2A Agent Card for this MUSU instance."""
    from a2a import get_agent_card
    return get_agent_card()


@app.post("/a2a", summary="A2A JSON-RPC 2.0 endpoint")
async def a2a_endpoint(request: Request):
    """Handle A2A JSON-RPC requests (SendMessage, GetTask, CancelTask)."""
    from a2a import handle_jsonrpc
    try:
        body = await request.json()
    except Exception:
        return JSONResponse(
            {"jsonrpc": "2.0", "id": None, "error": {"code": -32700, "message": "Parse error"}},
            status_code=400,
        )
    result = await handle_jsonrpc(body)
    return JSONResponse(result)


@app.post("/a2a/stream", summary="A2A SSE streaming endpoint")
async def a2a_stream_endpoint(request: Request):
    """Handle A2A SendStreamingMessage — returns SSE stream."""
    from a2a import stream_send_message
    try:
        body = await request.json()
    except Exception:
        return JSONResponse(
            {"jsonrpc": "2.0", "id": None, "error": {"code": -32700, "message": "Parse error"}},
            status_code=400,
        )

    req_id = body.get("id", 1)
    params = body.get("params", {})

    async def event_stream():
        async for event in stream_send_message(params, req_id):
            if await request.is_disconnected():
                break
            yield event

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# ── Route Task ──────────────────────────────────────────────────────────────


class RouteTaskRequest(BaseModel):
    channel: str
    instruction: str
    expected_output: str | None = None
    node_name: str = ""
    strategy: str = "auto"  # "explicit" | "recommended" | "auto"
    sender_id: str = "orchestrator"


@app.post("/api/tasks/route", summary="Route a task to a specific node or auto-select")
async def api_route_task(req: RouteTaskRequest) -> dict:
    """Route a task to a node. Supports explicit, recommended, or auto strategy."""
    from handlers import route_task_to_node, validate_task_instruction
    validate_task_instruction(req.instruction, expected_output=req.expected_output)
    return await route_task_to_node(
        channel=req.channel,
        instruction=req.instruction,
        node_name=req.node_name,
        strategy=req.strategy,
        sender_id=req.sender_id,
    )


@app.get("/api/companies/{company_id}/metrics", summary="Performance and cost metrics for a company")
async def api_company_metrics(company_id: str) -> dict:
    """Return aggregated time-series metrics (cost, latency) for the company."""
    from handlers import get_metrics
    return await get_metrics(company_id)


# ── System/admin/sync/watchdog routes (extracted to system_routes.py) ─────────
from system_routes import system_router  # noqa: F401
app.include_router(system_router)


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


# ──────────────────────────────────────────────────────────────────────────────
# Issues
# ──────────────────────────────────────────────────────────────────────────────


# Issue/Project models → bridge_models.py


@app.get("/api/companies/{company_id}/issues", summary="List issues for a company")
async def api_list_issues(
    company_id: str,
    status: str | None = Query(default=None),
    assignee_id: str | None = Query(default=None),
    assignee_agent_id: str | None = Query(default=None, alias="assigneeAgentId"),
    goal_id: str | None = Query(default=None),
    goal_id_alias: str | None = Query(default=None, alias="goalId"),
    project_id: str | None = Query(default=None),
    project_id_alias: str | None = Query(default=None, alias="projectId"),
    limit: int = Query(default=100, ge=1, le=500),
) -> list[dict]:
    """List issues for a company, optionally filtered by status or assignee."""
    company = get_company(company_id)
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    resolved_assignee_id = assignee_id or assignee_agent_id
    resolved_goal_id = goal_id or goal_id_alias
    resolved_project_id = project_id or project_id_alias
    return list_issue_records(
        company_id=company_id,
        status=status,
        assignee_id=resolved_assignee_id,
        goal_id=resolved_goal_id,
        project_id=resolved_project_id,
        limit=limit,
    )


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
        goal_id=req.goal_id,
        project_id=req.project_id,
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


# HeartbeatInvokeRequest → bridge_models.py


@app.post("/api/agents/{agent_id}/heartbeat/invoke", summary="Invoke a heartbeat run for an agent")
async def api_invoke_heartbeat(agent_id: str, req: HeartbeatInvokeRequest) -> dict:
    """Trigger a heartbeat run for the given agent by routing a message to its channel."""
    agent = get_agent_by_id(agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    channel = agent.get("name", agent_id)
    result = await route_chat(
        channel=channel, sender_id=req.sender_id, text=req.prompt,
        company_id=agent.get("company_id"),
    )
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


# Goal models → bridge_models.py


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


@app.get("/api/costs/by-node", summary="Execution costs grouped by node")
async def api_costs_by_node_global() -> list[dict]:
    """Return costs grouped by node using mesh_router agent→node mapping."""
    from handlers import get_costs_by_node
    return get_costs_by_node()


@app.get("/api/companies/{company_id}/costs/by-node", summary="Company costs by node")
async def api_costs_by_node_company(company_id: str) -> list[dict]:
    """Return company costs grouped by node."""
    company = get_company(company_id)
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    from handlers import get_costs_by_node
    return get_costs_by_node(company_id)


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
# ── Wiki routes (extracted to wiki_routes.py) ─────────────────────────────────
from wiki_routes import wiki_router  # noqa: F401
app.include_router(wiki_router)


# ── Remote File Access ─────────────────────────────────────────────────────


@app.get("/api/files/read", summary="Read a file from this device")
async def api_files_read(path: str = Query(..., max_length=500)) -> dict:
    """Read a file from this device. Used for cross-device file access.

    Security: only allows paths under home directory. No traversal above home.
    """
    import pathlib as _pl
    home = _pl.Path.home()
    target = _pl.Path(path).resolve()
    if not str(target).startswith(str(home)):
        raise HTTPException(status_code=403, detail="Access denied: path must be under home directory")
    if not target.exists():
        raise HTTPException(status_code=404, detail=f"File not found: {path}")
    if not target.is_file():
        raise HTTPException(status_code=400, detail="Not a file")
    if target.stat().st_size > 10 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="File too large (max 10MB)")
    try:
        content = target.read_text(encoding="utf-8", errors="replace")
    except Exception:
        content = target.read_bytes().decode("utf-8", errors="replace")
    return {"path": str(target), "size": target.stat().st_size, "content": content}


@app.get("/api/files/list", summary="List files in a directory on this device")
async def api_files_list(
    path: str = Query(default="~", max_length=500),
    pattern: str = Query(default="*", max_length=100),
) -> dict:
    """List files in a directory. Used for cross-device file browsing.

    Supports glob patterns (e.g., *.txt, *.md).
    """
    import pathlib as _pl
    home = _pl.Path.home()
    target = _pl.Path(path).expanduser().resolve()
    if not str(target).startswith(str(home)):
        raise HTTPException(status_code=403, detail="Access denied: path must be under home directory")
    if not target.is_dir():
        raise HTTPException(status_code=404, detail=f"Directory not found: {path}")
    entries = []
    for f in sorted(target.glob(pattern))[:200]:
        entries.append({
            "name": f.name,
            "path": str(f),
            "is_dir": f.is_dir(),
            "size": f.stat().st_size if f.is_file() else 0,
        })
    return {"path": str(target), "entries": entries}


# ── Chairman Briefing (wiki/001) ──────────────────────────────────────────


@app.get("/api/companies/{company_id}/briefing", summary="Executive briefing for chairman")
async def api_company_briefing(company_id: str) -> dict:
    """Secretary-style briefing: what this company does, how it's going, what needs attention.

    Follows wiki/001 Chairman Principle: results not processes, 3-second overview.
    """
    from handlers import _get_backend as _gb_brief
    backend = _gb_brief()
    company = get_company(company_id)
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")

    # 1. Purpose (from charter or company.purpose)
    purpose = company.get("purpose", "")
    import pathlib as _pathlib
    charter_path = _pathlib.Path(os.getcwd()) / ".musu" / "charter.md"
    if charter_path.exists():
        for line in charter_path.read_text(encoding="utf-8").split("\n"):
            if line.startswith("## Mission"):
                continue
            if line.strip() and not line.startswith("#") and not line.startswith(">"):
                purpose = line.strip()
                break

    # 2. Goals
    goals_rows = backend._db.execute(
        "SELECT title, status FROM goals WHERE company_id = ? ORDER BY created_at DESC LIMIT 10",
        (company_id,),
    )
    active_goals = [r["title"] for r in goals_rows if r["status"] == "active"]
    completed_goals = [r["title"] for r in goals_rows if r["status"] == "completed"]

    # 3. Issues (blockers = high priority open)
    issues_rows = backend._db.execute(
        "SELECT title, status, priority FROM issues "
        "WHERE company_id = ? AND status NOT IN ('resolved', 'closed') "
        "ORDER BY CASE priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END "
        "LIMIT 5",
        (company_id,),
    )
    blockers = [{"title": r["title"], "priority": r["priority"]} for r in issues_rows if r["priority"] in ("critical", "high")]
    open_issues = len([r for r in issues_rows])

    # 4. Recent wins (resolved issues, last 7 days)
    from datetime import datetime, timedelta, timezone
    week_ago = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
    wins_rows = backend._db.execute(
        "SELECT title FROM issues WHERE company_id = ? AND status IN ('resolved', 'closed') "
        "AND updated_at > ? ORDER BY updated_at DESC LIMIT 5",
        (company_id, week_ago),
    )
    recent_wins = [r["title"] for r in wins_rows]

    # 5. Agents
    agents = backend.list_agents(company_id=company_id)
    global_agents = [a for a in backend.list_agents() if a.get("company_id") is None]
    all_agents = agents + global_agents
    active_agents = [a for a in all_agents if a.get("status") == "active"]

    # 6. Status determination
    status = "healthy"
    if blockers:
        status = "needs_attention"
    if open_issues > 5:
        status = "busy"

    # 7. Summary (secretary style)
    parts = []
    if recent_wins:
        parts.append(f"Resolved {len(recent_wins)} issue(s) recently.")
    if active_goals:
        parts.append(f"Working on: {active_goals[0]}.")
    if blockers:
        parts.append(f"Blocked: {blockers[0]['title']}.")
    elif not active_goals and not recent_wins:
        parts.append("No active work. Awaiting directives.")
    summary = " ".join(parts) if parts else "All quiet."

    needs_attention = bool(blockers)

    return {
        "company_name": company.get("name", ""),
        "purpose": purpose,
        "status": status,
        "summary": summary,
        "active_goals": [{"title": g} for g in active_goals],
        "completed_goals_count": len(completed_goals),
        "blockers": blockers,
        "open_issues": open_issues,
        "recent_wins": recent_wins[:3],
        "agents": {"total": len(all_agents), "active": len(active_agents)},
        "needs_attention": needs_attention,
        "attention_item": blockers[0]["title"] if blockers else None,
    }


# ── Group Messages (CEO Board / Team Channels) ───────────────────────────


# GroupMessageRequest → bridge_models.py


@app.post("/api/groups/{group_id}/messages", status_code=201, summary="Post to group channel")
async def api_post_group_message(group_id: str, req: GroupMessageRequest) -> dict:
    """Post a message (or reply) to a group channel.

    If reply_to is set, a notification is created for the original author.
    """
    import uuid as _uuid
    from handlers import _get_backend as _gb_grp
    backend = _gb_grp()
    sender = req.sender_id or os.environ.get("MUSU_NODE_NAME", "unknown")
    msg_id = str(_uuid.uuid4())
    backend._db.execute(
        "INSERT INTO messages (id, session_id, role, content, group_id, meta, reply_to) "
        "VALUES (?, ?, 'system', ?, ?, ?, ?)",
        (msg_id, f"group-{group_id}", req.text, group_id,
         json.dumps({"sender_id": sender}), req.reply_to),
    )
    # Create notification for original author if this is a reply
    if req.reply_to:
        original = backend._db.execute(
            "SELECT meta FROM messages WHERE id = ?", (req.reply_to,)
        )
        if original:
            orig_meta = json.loads(original[0]["meta"] or "{}")
            orig_sender = orig_meta.get("sender_id", "")
            if orig_sender and orig_sender != sender:
                backend._db.execute(
                    "INSERT INTO notifications (id, recipient_id, message_id, group_id, sender_id, preview) "
                    "VALUES (?, ?, ?, ?, ?, ?)",
                    (str(_uuid.uuid4()), orig_sender, msg_id, group_id, sender, req.text[:100]),
                )
    return {"id": msg_id, "group_id": group_id, "sender_id": sender, "reply_to": req.reply_to}


@app.get("/api/groups/{group_id}/messages", summary="Read group channel messages")
async def api_read_group_messages(
    group_id: str,
    limit: int = Query(default=20, ge=1, le=100),
    since: str = Query(default=""),
) -> list[dict]:
    """Read messages from a group channel, optionally filtered by timestamp."""
    from handlers import _get_backend as _gb_grp2
    backend = _gb_grp2()
    if since:
        rows = backend._db.execute(
            "SELECT id, content, group_id, meta, created_at FROM messages "
            "WHERE group_id = ? AND created_at > ? ORDER BY created_at DESC LIMIT ?",
            (group_id, since, limit),
        )
    else:
        rows = backend._db.execute(
            "SELECT id, content, group_id, meta, created_at FROM messages "
            "WHERE group_id = ? ORDER BY created_at DESC LIMIT ?",
            (group_id, limit),
        )
    return [dict(r) for r in rows]


@app.get("/api/notifications/{recipient_id}", summary="Get unread notifications")
async def api_get_notifications(recipient_id: str) -> list[dict]:
    """Get unread notifications for an agent/user. Agents check this on heartbeat."""
    from handlers import _get_backend as _gb_notif
    backend = _gb_notif()
    rows = backend._db.execute(
        "SELECT id, message_id, group_id, sender_id, preview, created_at "
        "FROM notifications WHERE recipient_id = ? AND read = 0 ORDER BY created_at DESC LIMIT 20",
        (recipient_id,),
    )
    return [dict(r) for r in rows]


@app.post("/api/notifications/{recipient_id}/read", summary="Mark notifications as read")
async def api_mark_notifications_read(recipient_id: str) -> dict:
    """Mark all notifications as read."""
    from handlers import _get_backend as _gb_notif2
    backend = _gb_notif2()
    backend._db.execute(
        "UPDATE notifications SET read = 1 WHERE recipient_id = ? AND read = 0",
        (recipient_id,),
    )
    return {"marked_read": True, "recipient_id": recipient_id}


# ── Success Rate Tracking ─────────────────────────────────────────────────


@app.get("/api/stats/success-rate", summary="Execution success rate")
async def api_success_rate(days: int = Query(default=7, ge=1, le=90)) -> dict:
    """Return execution success rate for the last N days.

    Legacy failures (pre-2026-04-22) are archived in route_executions_archive.
    """
    from datetime import datetime, timedelta, timezone
    from handlers import _get_backend as _gb_stats
    backend = _gb_stats()
    cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    rows = backend._db.execute(
        "SELECT status, COUNT(*) as cnt FROM route_executions "
        "WHERE created_at >= ? GROUP BY status",
        (cutoff,),
    )
    stats = {r["status"]: r["cnt"] for r in rows}
    total = sum(stats.values())
    done = stats.get("done", 0)
    failed = stats.get("failed", 0)
    rate = round(done / total * 100, 1) if total > 0 else 0
    archived = 0
    try:
        archived = backend._db.execute("SELECT COUNT(*) FROM route_executions_archive")[0][0]
    except Exception:
        pass
    return {
        "period_days": days,
        "total": total,
        "done": done,
        "failed": failed,
        "running": stats.get("running", 0),
        "success_rate_pct": rate,
        "archived_legacy_failures": archived,
    }


# ── User Feedback ──────────────────────────────────────────────────────────


# FeedbackRequest → bridge_models.py


@app.post("/api/feedback", summary="Submit user feedback", status_code=201)
async def api_submit_feedback(req: FeedbackRequest) -> dict:
    """Convert user feedback into an issue for the CEO to process.

    Feedback types: bug (high priority), suggestion (medium), complaint (medium).
    CEO picks these up during heartbeat via list_issues().
    """
    # Use canonical company, falling back to first available
    from handlers import list_companies as _list_co
    _cid = globals().get("_CANONICAL_COMPANY_ID", "")
    if not _cid:
        _cos = _list_co()
        _cid = _cos[0]["id"] if _cos else ""
    issue = create_issue_record(
        company_id=_cid,
        title=f"[{req.type}] {req.title}",
        description=req.description,
        priority="high" if req.type == "bug" else "medium",
    )
    return {"issue_id": issue["id"], "status": "received"}


@app.get("/install.sh", summary="Get node installation script", include_in_schema=False)
async def api_install_sh() -> Response:
    """Serve the musu-node installation script."""
    script_path = os.path.join(os.path.dirname(__file__), "..", "scripts", "install-node.sh")
    if not os.path.exists(script_path):
        raise HTTPException(status_code=404, detail="Install script not found")
    with open(script_path, "r", encoding="utf-8") as f:
        content = f.read()
    return Response(content=content, media_type="text/plain")

@app.get("/health")
async def health() -> dict:
    from relay_client import relay_connected, relay_reconnect_count
    return {
        "status": "ok",
        "relay": {
            "connected": relay_connected,
            "reconnect_count": relay_reconnect_count,
        },
    }


_AGENT_CHANNELS = ("ceo", "cto", "engineer", "qa", "planner", "cos")


@app.get("/health/ready")
async def health_ready() -> Response:
    """Readiness probe — verifies DB connectivity and agent channel circuit breaker state."""
    try:
        backend = _get_heartbeat_backend()
        backend._db.execute("SELECT 1")
    except Exception:
        return Response(
            content=json.dumps({"status": "not_ready", "db": "error"}),
            status_code=503,
            media_type="application/json",
        )

    agents = {
        ch: ("degraded" if _channel_cb.is_open(ch) else "ok")
        for ch in _AGENT_CHANNELS
    }
    return Response(
        content=json.dumps({"status": "ready", "db": "ok", "agents": agents}),
        status_code=200,
        media_type="application/json",
    )


@app.get("/api/system/circuit-breakers", summary="Circuit breaker state for all internal CBs")
async def circuit_breakers_status() -> dict:
    """Expose heartbeat and per-channel circuit breaker state for observability."""
    _node_cb = os.environ.get("MUSU_NODE_NAME", "local")
    _ceo_cb_channel = os.environ.get("MUSU_CEO_AGENT_NAME", f"{_node_cb}-CEO").lower()
    try:
        backend = _get_heartbeat_backend()
        cb_open, reason = _should_skip_heartbeat(backend, _ceo_cb_channel)
        hb_state = "open" if cb_open else "closed"
    except Exception as exc:
        hb_state = "unknown"
        reason = str(exc)

    # Per-channel CB state for all tracked channels
    tracked = set(_channel_cb._failures.keys()) | {"engineer", "cto", _ceo_cb_channel, "qa", "planner", "cos"}
    channels = {ch: _channel_cb.state(ch) for ch in sorted(tracked)}

    return {
        "heartbeat": {
            "channel": _ceo_cb_channel,
            "state": hb_state,
            "reason": reason if hb_state != "closed" else "",
        },
        "channels": channels,
        "active_tasks": len(_active_tasks),
    }


# ── Screen routes (extracted to screen_routes.py) ─────────────────────────────
from screen_routes import screen_router  # noqa: F401
app.include_router(screen_router)






if __name__ == "__main__":
    cfg = get_config()

    if os.getenv("MUSU_ENV") == "production":
        token = os.getenv("MUSU_BRIDGE_TOKEN")
        if not token or len(token) < 32:
            raise RuntimeError(
                "MUSU_ENV=production requires MUSU_BRIDGE_TOKEN (min 32 chars). "
                "Refusing to start."
            )

    handler = logging.StreamHandler()
    handler.setFormatter(JsonFormatter())
    logging.root.handlers.clear()
    logging.root.addHandler(handler)
    logging.root.setLevel(logging.INFO)
    install_redaction_filter()
    uvicorn.run(app, host=cfg.bridge_host, port=cfg.bridge_port)


# ── musu-bee reverse proxy (relay → bridge → bee) ───────────────────────────

_BEE_URL = os.environ.get("MUSU_BEE_URL", "http://localhost:3001")


@app.api_route("/bee/{path:path}", methods=["GET", "POST", "PUT", "DELETE", "PATCH"])
async def proxy_bee(path: str, request: Request):
    """Reverse proxy to local musu-bee for relay HTML access.

    musu.pro → relay → bridge /bee/app → localhost:3001/app
    """
    import httpx as _hx

    target = f"{_BEE_URL}/{path}"
    qs = str(request.url.query)
    if qs:
        target += f"?{qs}"

    try:
        body = await request.body()
        async with _hx.AsyncClient(timeout=15.0, follow_redirects=True) as client:
            resp = await client.request(
                method=request.method,
                url=target,
                headers={
                    k: v for k, v in request.headers.items()
                    if k.lower() not in ("host", "authorization", "content-length")
                },
                content=body if body else None,
            )
            # Forward response
            excluded = {"content-encoding", "transfer-encoding", "content-length"}
            headers = {k: v for k, v in resp.headers.items() if k.lower() not in excluded}
            return Response(content=resp.content, status_code=resp.status_code, headers=headers)
    except Exception as exc:
        return JSONResponse({"error": f"Bee proxy failed: {exc}"}, status_code=502)


# ============================================================
# X-Ray Report Upload (Phase 1+)
# ============================================================

_XRAY_STORE_DIR = os.path.expanduser("~/.musu/xray-reports")


@app.post("/api/xray/upload", status_code=201, summary="Upload X-Ray scan report")
async def api_xray_upload(request: Request):
    """Receive an X-Ray JSON report from `musu xray --sync` and store it."""
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    # Validate minimal fields
    for field in ("version", "generated_at", "repo", "health_score"):
        if field not in body:
            raise HTTPException(status_code=400, detail=f"Missing required field: {field}")

    # Store to filesystem (no DB dependency)
    os.makedirs(_XRAY_STORE_DIR, exist_ok=True)

    ts = body.get("generated_at", "unknown")[:19].replace(":", "").replace("-", "")
    repo_name = body.get("repo", {}).get("path", "unknown").split("/")[-1]
    filename = f"xray-{repo_name}-{ts}.json"
    filepath = os.path.join(_XRAY_STORE_DIR, filename)

    with open(filepath, "w") as f:
        json.dump(body, f)

    # Also update latest per repo
    latest_path = os.path.join(_XRAY_STORE_DIR, f"latest-{repo_name}.json")
    with open(latest_path, "w") as f:
        json.dump(body, f, indent=2)

    logger.info("X-Ray report stored: %s (score: %s)", filename, body.get("health_score", {}).get("overall"))
    return {"stored": filename, "path": filepath}


@app.get("/api/xray/reports", summary="List stored X-Ray reports")
async def api_xray_list(repo: str | None = None, limit: int = 20):
    """List stored X-Ray reports, optionally filtered by repo name."""
    if not os.path.isdir(_XRAY_STORE_DIR):
        return {"reports": []}

    files = sorted(os.listdir(_XRAY_STORE_DIR), reverse=True)
    reports = []
    for fname in files:
        if not fname.startswith("xray-") or not fname.endswith(".json"):
            continue
        if fname.startswith("latest-"):
            continue
        if repo and repo not in fname:
            continue
        fpath = os.path.join(_XRAY_STORE_DIR, fname)
        try:
            with open(fpath) as f:
                data = json.load(f)
            reports.append({
                "filename": fname,
                "repo": data.get("repo", {}).get("path", "?"),
                "score": data.get("health_score", {}).get("overall"),
                "grade": data.get("health_score", {}).get("grade"),
                "generated_at": data.get("generated_at"),
            })
        except Exception:
            continue
        if len(reports) >= limit:
            break

    return {"reports": reports, "total": len(reports)}


@app.get("/api/xray/reports/{filename}", summary="Get a specific X-Ray report")
async def api_xray_get(filename: str = Path(...)):
    """Get a specific X-Ray report by filename."""
    if ".." in filename or "/" in filename:
        raise HTTPException(status_code=400, detail="Invalid filename")
    fpath = os.path.join(_XRAY_STORE_DIR, filename)
    if not os.path.isfile(fpath):
        raise HTTPException(status_code=404, detail="Report not found")
    with open(fpath) as f:
        return json.load(f)


# ============================================================
# Node Management (Multi-Machine P0)
# ============================================================

@app.get("/api/nodes", summary="List connected nodes with health status")
async def api_nodes_list():
    """List all mesh nodes with live health check."""
    from handlers import list_nodes as _list_nodes
    nodes = await _list_nodes()
    return {"nodes": nodes, "total": len(nodes)}


class NodeAddRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=64)
    url: str | None = None
    tailscale_ip: str | None = None
    agents: list[str] = Field(default_factory=list)


@app.post("/api/nodes/add", status_code=201, summary="Add a node to the mesh")
async def api_nodes_add(req: NodeAddRequest):
    """Add a node manually. Provide either url or tailscale_ip (url auto-generated)."""
    router = mesh_router.get_mesh_router()
    if not router:
        raise HTTPException(status_code=503, detail="Mesh router not initialized")

    if router.has_node(req.name):
        raise HTTPException(status_code=409, detail=f"Node '{req.name}' already exists")

    # Build URL from tailscale_ip if not provided
    url = req.url
    if not url and req.tailscale_ip:
        url = f"http://{req.tailscale_ip}:8070"
    if not url:
        raise HTTPException(status_code=400, detail="Provide either 'url' or 'tailscale_ip'")

    router.add_node(req.name, url, req.agents)

    # Health check the new node
    is_healthy = await router.is_node_healthy(req.name)

    logger.info("Node added: %s (%s) healthy=%s", req.name, url, is_healthy)
    return {
        "name": req.name,
        "url": url,
        "agents": req.agents,
        "healthy": is_healthy,
    }


@app.delete("/api/nodes/{node_name}", summary="Remove a node from the mesh")
async def api_nodes_remove(node_name: str):
    """Remove a node and its agent assignments."""
    router = mesh_router.get_mesh_router()
    if not router:
        raise HTTPException(status_code=503, detail="Mesh router not initialized")

    if not router.has_node(node_name):
        raise HTTPException(status_code=404, detail=f"Node '{node_name}' not found")

    if router._self_name == node_name:
        raise HTTPException(status_code=400, detail="Cannot remove self node")

    router.remove_node(node_name)
    logger.info("Node removed: %s", node_name)
    return {"removed": node_name}


class AgentAssignRequest(BaseModel):
    agent_name: str = Field(..., min_length=1)
    node_name: str = Field(..., min_length=1)


@app.post("/api/nodes/assign-agent", summary="Assign an agent to a node")
async def api_nodes_assign_agent(req: AgentAssignRequest):
    """Assign an agent to run on a specific node. Updates nodes.toml."""
    router = mesh_router.get_mesh_router()
    if not router:
        raise HTTPException(status_code=503, detail="Mesh router not initialized")
    if not router.has_node(req.node_name):
        raise HTTPException(status_code=404, detail=f"Node '{req.node_name}' not found")

    assigned = router.auto_assign_agents(req.node_name, [req.agent_name])
    logger.info("Agent '%s' assigned to node '%s'", req.agent_name, req.node_name)
    return {"agent": req.agent_name, "node": req.node_name, "newly_assigned": assigned}


@app.get("/api/templates", summary="List available company templates")
async def api_templates_list():
    """List available templates for company creation."""
    try:
        from company_templates import list_template_keys, get_template
        keys = list_template_keys()
        templates = []
        for key in keys:
            tmpl = get_template(key)
            if tmpl:
                agents = [a.get("name", "?") for a in tmpl.get("agents", [])]
                templates.append({
                    "key": key,
                    "description": tmpl.get("description", ""),
                    "agents": agents,
                    "agent_count": len(agents),
                })
        return {"templates": templates}
    except ImportError:
        return {"templates": [], "error": "company_templates module not found"}
