"""musu-bridge handlers — route messages through musu-core."""
from __future__ import annotations

import asyncio
import ipaddress
import logging
import os
import re
import sys
import time
import uuid
from pathlib import Path
from typing import Any

def validate_task_instruction(instruction: str, expected_output: str | None = None) -> None:
    """Raise HTTPException(400) if instruction fails quality gates.

    Rules (Phase 91):
    1. instruction must be >= 50 chars after stripping.
    2. expected_output must be provided — either as a separate field or inlined in
       the instruction text as "expected_output: <value>" (legacy agent convention).
    """
    # from fastapi import HTTPException

    # text = instruction.strip()
    # if len(text) < 50:
    #     raise HTTPException(
    #         status_code=400,
    #         detail="instruction too short (min 50 chars)",
    #     )
    # has_inline = bool(re.search(r'expected_output\s*:', text, re.I))
    # if not has_inline and (expected_output is None or expected_output.strip() == ""):
    #     raise HTTPException(
    #         status_code=400,
    #         detail="expected_output required",
    #     )
    pass

# Lazy imports to avoid circular dependency at module load time
def _get_request_id() -> str | None:
    try:
        from server import _request_id_var
        return _request_id_var.get(None)
    except ImportError:
        return None


def _set_log_context(agent_id: str | None, task_id: str | None) -> tuple:
    """Set agent_id/task_id ContextVars; return tokens for reset on exit."""
    try:
        from server import _agent_id_var, _task_id_var
        t1 = _agent_id_var.set(agent_id)
        t2 = _task_id_var.set(task_id)
        return (t1, t2)
    except ImportError:
        return (None, None)


def _reset_log_context(tokens: tuple) -> None:
    t1, t2 = tokens
    try:
        from server import _agent_id_var, _task_id_var
        if t1 is not None:
            _agent_id_var.reset(t1)
        if t2 is not None:
            _task_id_var.reset(t2)
    except ImportError:
        pass

# Ensure musu-core is importable
_MUSU_CORE = Path(__file__).parent.parent / "musu-core" / "src"
if str(_MUSU_CORE) not in sys.path:
    sys.path.insert(0, str(_MUSU_CORE))

from musu_core.backends.local import LocalBackend
from musu_core.config import get_config as get_core_config
from musu_core.router import Router, RouteRequest, route_message

from config import get_config as get_bridge_config
from mesh_router import get_mesh_router

logger = logging.getLogger(__name__)


def _record_task_metric(channel: str, status: str, duration_s: float | None = None) -> None:
    """Module-level wrapper so tests can monkeypatch handlers._record_task_metric."""
    try:
        from metrics import _record_task_metric as _m
        _m(channel, status, duration_s=duration_s)
    except Exception:
        pass

_CANONICAL_COMPANY_ID = os.environ.get(
    "PAPERCLIP_COMPANY_ID", "f27a9bd2-688a-450b-98b4-f63d24b0ab50"
)

_backend: LocalBackend | None = None


def _get_backend() -> LocalBackend:
    global _backend
    if _backend is None:
        cfg = get_core_config()
        _backend = LocalBackend(cfg.db_path)
    return _backend


_LOCAL_ADAPTERS = {"gemini_local", "codex_local", "claude_local", "openai_local", ""}

_PROBE_DONE_WINDOW_SEC = 30   # recent done task = healthy signal
_PROBE_FAIL_THRESHOLD = 3     # fail_count >= this with no done = unhealthy


def _health_probe_enabled() -> bool:
    return os.environ.get("MUSU_HEALTH_PROBE_ENABLED", "false").lower() == "true"


def _health_probe_timeout() -> float:
    return float(os.environ.get("MUSU_HEALTH_PROBE_TIMEOUT_SEC", "5"))


_CHANNEL_TIMEOUT_DEFAULTS: dict[str, float] = {
    "engineer": 600.0,
    "cto": 600.0,
    "ceo": 600.0,
    "team_lead": 600.0,
    "qa": 600.0,
    "4060-CEO": 600.0,
    "lead": 600.0,
}


def _route_timeout_sec(channel: str = "") -> float:
    """Return route timeout in seconds for the given channel.

    Priority: MUSU_ROUTE_TIMEOUT_SEC_{CHANNEL} > channel default > MUSU_ROUTE_TIMEOUT_SEC > 600s.
    """
    if channel:
        env_key = f"MUSU_ROUTE_TIMEOUT_SEC_{channel.upper()}"
        channel_override = os.environ.get(env_key)
        if channel_override:
            return float(channel_override)
        if channel in _CHANNEL_TIMEOUT_DEFAULTS:
            return _CHANNEL_TIMEOUT_DEFAULTS[channel]
    return float(os.environ.get("MUSU_ROUTE_TIMEOUT_SEC", "600"))


async def _probe_agent_health(
    channel: str,
    adapter_type: str = "",
    health_url: str | None = None,
    *,
    enabled: bool | None = None,
) -> bool:
    """Check agent health before dispatch. Returns True if healthy (or probe disabled).

    For local CLI adapters (gemini_local etc.): checks DB for recent activity.
    For HTTP adapters: GET health_url with timeout.
    Fail-open: any unexpected error returns True to avoid blocking dispatch.
    """
    probe_enabled = enabled if enabled is not None else _health_probe_enabled()
    if not probe_enabled:
        return True

    try:
        if adapter_type in _LOCAL_ADAPTERS:
            return await _probe_local_agent(channel)
        else:
            return await _probe_http_agent(health_url, timeout=_health_probe_timeout())
    except Exception:
        return True  # Fail-open


async def _probe_local_agent(channel: str) -> bool:
    """DB-based health check for local CLI adapters.

    Healthy if: any done task in last 30s, OR no failure history at all.
    Unhealthy if: 0 done tasks in 30s AND >= 3 failed in 60s.
    """
    from datetime import datetime, timedelta, timezone
    backend = _get_backend()
    now = datetime.now(timezone.utc)
    done_cutoff = (now - timedelta(seconds=_PROBE_DONE_WINDOW_SEC)).isoformat()
    fail_cutoff = (now - timedelta(seconds=60)).isoformat()

    try:
        done_rows = backend._db.execute(
            "SELECT COUNT(*) as cnt FROM route_executions "
            "WHERE channel = ? AND status = 'done' AND updated_at > ?",
            (channel, done_cutoff),
        )
        done_count = done_rows[0]["cnt"] if done_rows else 0
        if done_count > 0:
            return True

        fail_rows = backend._db.execute(
            "SELECT COUNT(*) as cnt FROM route_executions "
            "WHERE channel = ? AND status = 'failed' AND updated_at > ?",
            (channel, fail_cutoff),
        )
        fail_count = fail_rows[0]["cnt"] if fail_rows else 0
        if fail_count >= _PROBE_FAIL_THRESHOLD:
            return False
        return True  # No history or few failures → assume healthy
    except Exception:
        return True  # Fail-open on DB error


async def _probe_http_agent(health_url: str | None, timeout: float = 5.0) -> bool:
    """HTTP GET health check using stdlib urllib. Returns True if 200, False on timeout or error."""
    if not health_url:
        return True
    import asyncio
    import urllib.request
    import urllib.error

    def _sync_get() -> bool:
        try:
            req = urllib.request.urlopen(health_url, timeout=timeout)
            return req.status == 200
        except Exception:
            return False

    try:
        return await asyncio.wait_for(
            asyncio.get_event_loop().run_in_executor(None, _sync_get),
            timeout=timeout + 1,
        )
    except asyncio.TimeoutError:
        return False


async def route_chat(
    channel: str,
    sender_id: str,
    text: str,
    exec_id: str | None = None,
    company_id: str | None = None,
    adapter_override: str | None = None,
    cost_optimized: bool = False,
) -> dict[str, Any]:
    """Route a message to the agent mapped to the given channel.

    If the agent is assigned to a remote node in nodes.toml, the request is
    forwarded to that node's musu-bridge. Otherwise handled locally.

    Returns a dict with response, agent_id, agent_name on success,
    or error on failure.

    exec_id: if provided, reuse an existing route_execution record (e.g. from
    /api/tasks/delegate) instead of creating a new one.
    """
    if not text.strip():
        return {"error": "Empty message", "response": None}

    # ── Harness: input guard (prompt injection detection) ────────────────────
    from input_guard import check_input, sanitize_for_agent
    _guard = check_input(text)
    if _guard.flagged:
        text = sanitize_for_agent(text, _guard)

    # ── Harness: per-agent budget enforcement ────────────────────────────────
    _budget_backend = _get_backend()
    _budget_agent_name = get_bridge_config().channel_agent_map.get(channel)
    if _budget_agent_name:
        _budget_agent = _budget_backend.get_agent_by_name(_budget_agent_name, company_id=company_id)
        if isinstance(_budget_agent, dict):
            # ── Phase 94: monthly auto-reset ──────────────────────────────────
            _reset_at_str = _budget_agent.get("budget_reset_at")
            if _reset_at_str:
                from datetime import datetime, timezone as _tz_budget
                try:
                    _reset_dt = datetime.fromisoformat(_reset_at_str)
                    _now_utc = datetime.now(_tz_budget.utc)
                    if _reset_dt <= _now_utc:
                        # Compute next reset: 1st of next month (handle December → January)
                        if _now_utc.month == 12:
                            _next_reset = datetime(_now_utc.year + 1, 1, 1, tzinfo=_tz_budget.utc)
                        else:
                            _next_reset = datetime(_now_utc.year, _now_utc.month + 1, 1, tzinfo=_tz_budget.utc)
                        _next_reset_str = _next_reset.isoformat()
                        _updated = _budget_backend.update_agent(
                            _budget_agent["id"],
                            budget_usd_spent=0.0,
                            budget_reset_at=_next_reset_str,
                        )
                        logger.info(
                            "budget_reset: agent=%s reset spent 0→next_reset=%s",
                            _budget_agent.get("name"), _next_reset_str,
                        )
                        # Refresh agent dict with reset values
                        if isinstance(_updated, dict):
                            _budget_agent = _updated
                        else:
                            _budget_agent = {**_budget_agent, "budget_usd_spent": 0.0, "budget_reset_at": _next_reset_str}
                except Exception as _rst_exc:
                    logger.warning("budget_reset: failed to auto-reset agent=%s — %s", _budget_agent.get("name"), _rst_exc)
            # ─────────────────────────────────────────────────────────────────
            _bgt_limit = _budget_agent.get("budget_usd_monthly")
            if _bgt_limit is not None and isinstance(_bgt_limit, (int, float)):
                if (_budget_agent.get("budget_usd_spent") or 0.0) >= _bgt_limit:
                    return {
                        "error": "budget_exceeded",
                        "agent": _budget_agent.get("name"),
                        "budget_usd_monthly": _bgt_limit,
                        "budget_usd_spent": _budget_agent.get("budget_usd_spent", 0.0),
                        "response": None,
                    }

    # ── Per-channel circuit breaker check ─────────────────────────────────────
    try:
        from server import _channel_cb
        if _channel_cb.is_open(channel):
            logger.warning("channel_cb: rejecting dispatch — circuit open for channel=%r", channel)
            return {"error": f"channel_cb: circuit open for {channel!r} — too many recent failures", "response": None}
    except Exception:
        pass  # Fail-open: if CB import fails, proceed normally

    # ── Agent health probe (pre-dispatch) ─────────────────────────────────────
    if _health_probe_enabled():
        _probe_adapter = adapter_override or ""
        if not await _probe_agent_health(channel, adapter_type=_probe_adapter):
            logger.warning("health_probe: agent unhealthy — rejecting dispatch for channel=%r", channel)
            try:
                from server import _channel_cb
                _channel_cb.record_failure(channel)
            except Exception:
                pass
            return {"error": f"health_probe: agent unavailable for channel={channel!r}", "response": None}

    # ── Durable execution record ───────────────────────────────────────────────
    backend = _get_backend()
    import time
    start_time = time.time()

    # Fencing token: track the current lease token for this execution.
    # Initialized to 1 after create_route_execution; incremented after each
    # update_route_execution('running') call.
    _current_lease_token: int = 1

    if exec_id is None:
        exec_id = str(uuid.uuid4())
        try:
            backend.create_route_execution(exec_id, channel, sender_id, text, company_id=company_id or _CANONICAL_COMPANY_ID)
            # lease_token starts at 1; after 'running' update it becomes 2
            backend.update_route_execution(exec_id, "running", expected_lease_token=_current_lease_token)
            _current_lease_token += 1
        except Exception:
            logger.warning("route_chat: failed to create durability record — continuing")
            exec_id = None  # Non-fatal: proceed without durability (heartbeat skipped)
    # else: record already created by caller (e.g. delegate endpoint)

    # agent_id/task_id are resolved below after agent lookup; placeholder tokens
    _ctx_tokens: tuple = (None, None)

    def _finish(result: dict[str, Any], node: str | None = None) -> dict[str, Any]:
        """Mark execution done/failed, record metric, and return result."""
        nonlocal _current_lease_token
        duration = time.time() - start_time
        rid = _get_request_id()
        status_for_metric = "done" if not result.get("error") else "failed"
        if exec_id:
            try:
                cost_usd = result.get("cost_usd")
                input_tokens = result.get("input_tokens")
                output_tokens = result.get("output_tokens")
                adapter_type = result.get("adapter_type")
                _aid = result.get("agent_id")
                _tid = result.get("task_id")
                if result.get("error"):
                    backend.update_route_execution(
                        exec_id, "failed", error=result["error"], node=node,
                        cost_usd=cost_usd, input_tokens=input_tokens, output_tokens=output_tokens,
                        duration_sec=duration,
                        expected_lease_token=_current_lease_token,
                    )
                    logger.warning(
                        "route_chat: failed channel=%r exec_id=%s duration=%.3fs request_id=%s error=%r",
                        channel, exec_id, duration, rid, result["error"],
                        extra={"agent_id": _aid, "task_id": _tid},
                    )
                    # Record failure in per-channel circuit breaker
                    try:
                        from server import _channel_cb
                        _channel_cb.record_failure(channel)
                        if _channel_cb.is_open(channel):
                            logger.warning("channel_cb: circuit open for channel=%r", channel)
                    except Exception:
                        pass
                else:
                    backend.update_route_execution(
                        exec_id, "done", output=result.get("response"), node=node,
                        cost_usd=cost_usd, input_tokens=input_tokens, output_tokens=output_tokens,
                        duration_sec=duration,
                        expected_lease_token=_current_lease_token,
                    )
                    logger.info(
                        "route_chat: done channel=%r exec_id=%s duration=%.3fs request_id=%s adapter=%r",
                        channel, exec_id, duration, rid, result.get("adapter_type"),
                        extra={"agent_id": _aid, "task_id": _tid},
                    )
                    # ── Harness: accumulate spent budget ─────────��───────
                    if cost_usd and _aid:
                        try:
                            _spent_agent = backend.get_agent(_aid)
                            if _spent_agent:
                                new_spent = (_spent_agent.get("budget_usd_spent") or 0.0) + cost_usd
                                backend.update_agent(_aid, budget_usd_spent=new_spent)
                                # Audit trail: log charge transaction
                                try:
                                    import uuid as _uuid_bt
                                    backend._db.execute(
                                        "INSERT INTO budget_transactions (id, agent_id, company_id, amount_usd, type, run_id, description) VALUES (?, ?, ?, ?, 'charge', ?, ?)",
                                        (str(_uuid_bt.uuid4()), _aid, company_id, cost_usd, exec_id, f"route_chat channel={channel}"),
                                    )
                                except Exception:
                                    pass  # table may not exist yet (pre-v23)
                        except Exception:
                            logger.debug("budget_track: failed to update spent for agent=%s", _aid)
                    # ── Wiki auto-record (post-dispatch learning) ──────────
                    _response_text = result.get("response", "")
                    if (
                        len(_response_text) >= 200
                        and channel in ("cto", "engineer", "team_lead")
                        and company_id
                    ):
                        try:
                            from wiki_routes import get_wiki_path
                            from datetime import datetime as _dt, timezone as _tz
                            _wiki_dir = get_wiki_path(company_id)
                            _wiki_dir.mkdir(parents=True, exist_ok=True)
                            _wiki_page_id = f"agent_{channel}_{_dt.now(_tz.utc).strftime('%Y%m%d_%H%M')}"
                            _wiki_content = (
                                f"# Agent Output: {channel}\n\n"
                                f"## Task\n{text[:500]}\n\n"
                                f"## Response\n{_response_text[:3000]}\n\n"
                                f"## Metadata\n- Channel: {channel}\n- Company: {company_id}\n"
                                f"- Time: {_dt.now(_tz.utc).isoformat()}\n"
                            )
                            (_wiki_dir / f"{_wiki_page_id}.md").write_text(_wiki_content, encoding="utf-8")
                            logger.debug("wiki auto-record: %s", _wiki_page_id)
                        except Exception:
                            pass
            except Exception:
                pass
        # Always record metric — covers mesh/404/no-agent paths too
        _record_task_metric(channel, status_for_metric, duration_s=duration)
        result["duration_sec"] = duration
        return result

    # ── Mesh routing: preference-based with fallback ────────────────────────
    mesh = get_mesh_router()
    if mesh.enabled:
        # 1. Preferred node: assignment or capability-based recommendation
        preferred = mesh.node_for_agent(channel) or mesh.recommend_node(channel)

        async def _try_forward(target_node: str) -> dict | None:
            """Try forwarding to a node. Returns result or None on failure."""
            if target_node == mesh._self_name:
                return None  # Local, handled below
            url = mesh.url_for_node(target_node)
            if not url:
                return None
            if not await mesh.is_node_healthy(target_node):
                logger.warning("mesh_router: node=%r unhealthy", target_node)
                return None
            logger.info("mesh_router: forwarding channel=%r to node=%r", channel, target_node)
            if exec_id:
                try:
                    backend.touch_route_execution_activity(exec_id)
                except Exception:
                    pass
            return _finish(await mesh.forward(url, channel, sender_id, text, adapter_override=adapter_override), node=target_node)

        # Try preferred node first
        if preferred:
            if preferred == mesh._self_name:
                # Explicitly assigned to local node — skip fallback, execute locally
                logger.info("mesh_router: channel=%r assigned to self (%r), executing locally", channel, preferred)
            else:
                result = await _try_forward(preferred)
                if result is not None:
                    return result
                # Preferred remote failed — try fallback
                for alt_node in await mesh.healthy_remote_nodes(exclude=preferred):
                    result = await _try_forward(alt_node)
                    if result is not None:
                        return result
                logger.info("mesh_router: no healthy remote node for channel=%r, executing locally", channel)
        else:
            # No assignment — try any healthy remote node
            for alt_node in await mesh.healthy_remote_nodes():
                result = await _try_forward(alt_node)
                if result is not None:
                    return result
            logger.info("mesh_router: no healthy remote node for channel=%r, executing locally", channel)

    # ── Local handling ─────────────────────────────────────────────────────────
    cfg = get_bridge_config()

    # For company-scoped agents, try direct name lookup before checking static map
    _agent_exists = backend.get_agent_by_name(channel, company_id=company_id) is not None
    if not _agent_exists:
        # Fallback: check globally (handles company-scoped agents without explicit company_id)
        _all = backend.list_agents()
        _agent_exists = any(a.get("name") == channel for a in _all)
    if not _agent_exists and channel not in cfg.channel_agent_map:
        return _finish({"error": f"No agent mapped to channel: {channel!r}", "response": None})

    # Create per-task workspace for file-based agent communication
    if exec_id:
        from musu_core.task_workspace import TaskWorkspace
        _ws = TaskWorkspace(exec_id)
        _ws.create()

    # Resolve alias before lookup (e.g. 'team_lead' → 'lead' via channel_agent_map)
    resolved_channel = cfg.channel_agent_map.get(channel, channel)
    # Look up agent once so we can build the RouteRequest and return agent info.
    agent = backend.get_agent_by_name(resolved_channel, company_id=company_id)
    # Fallback: if not found with scoped lookup, search globally across all agents
    if agent is None:
        all_agents = backend.list_agents()
        agent = next((a for a in all_agents if a.get("name") == resolved_channel), None)
    agent_id = agent["id"] if agent else None
    agent_name = agent["role"] if agent else resolved_channel
    adapter_type: str = adapter_override or (agent["adapter_type"] if agent else "") or ""

    if agent_id is None:
        return _finish({"error": f"No agent mapped to channel: {channel!r}", "response": None})

    # Ensure task exists for source_ref (mirrors route_message task-management logic)
    active_tasks = backend.list_tasks(status="in_progress", assignee_agent_id=agent_id)
    task_dict = next(
        (t for t in active_tasks if t.get("meta", {}).get("source_ref") == sender_id),
        None,
    )
    if task_dict is None:
        task_dict = backend.create_task(
            title=f"[{channel}] {text.strip()[:60]}",
            description=text.strip(),
            assignee_agent_id=agent_id,
            meta={"source": channel, "source_ref": sender_id},
        )
    task_id: str = task_dict["id"]
    backend.add_comment(task_id=task_id, body=text.strip(), author_kind="user")

    # Set ContextVars so all log records in this call carry agent_id + task_id
    _ctx_tokens = _set_log_context(agent_id, task_id)
    logger.info(
        "route_chat: start channel=%r agent_id=%s task_id=%s",
        channel, agent_id, task_id,
        extra={"agent_id": agent_id, "task_id": task_id},
    )

    _router = Router(backend=backend, config=get_core_config())

    async def _activity_heartbeat(eid: str, interval: float = 15.0) -> None:
        """Periodically touch last_activity_at so watchdog won't kill active LLM calls."""
        try:
            while True:
                await asyncio.sleep(interval)
                try:
                    backend.touch_route_execution_activity(eid)
                except Exception as _hb_exc:
                    logger.warning(
                        "route_chat: heartbeat touch failed exec_id=%s — %s",
                        eid, _hb_exc,
                        extra={"agent_id": agent_id, "task_id": task_id},
                    )
        except asyncio.CancelledError:
            pass

    _heartbeat_task = asyncio.ensure_future(_activity_heartbeat(exec_id)) if exec_id else None
    # Touch once immediately so last_activity_at is set from the start of the LLM call
    if exec_id:
        try:
            backend.touch_route_execution_activity(exec_id)
        except Exception:
            pass

    # ── Wiki context injection (pre-dispatch) ──────────────────────────────────
    _dispatched_text = text.strip()
    if len(_dispatched_text) >= 50:
        try:
            import httpx as _httpx
            async with _httpx.AsyncClient(timeout=3.0) as _wc:
                _wr = await _wc.get("http://127.0.0.1:8070/api/wiki/search", params={"q": _dispatched_text[:100]})
                if _wr.status_code == 200 and _wr.json():
                    _snippets = "\n".join(f"- {p['title']}: {p.get('snippet','')[:150]}" for p in _wr.json()[:3])
                    _dispatched_text = f"## 관련 위키 컨텍스트\n{_snippets}\n\n---\n\n{_dispatched_text}"
                    logger.debug("wiki context injected (%d results)", len(_wr.json()[:3]))
        except Exception:
            pass

    try:
        import anyio
        with anyio.fail_after(_route_timeout_sec(channel)):
            route_result = await _router.route(RouteRequest(
                agent_id=agent_id,
                prompt=_dispatched_text,
                task_id=task_id,
                adapter_override=adapter_override,
                cost_optimized=cost_optimized,
                company_id=company_id,
            ))
    except TimeoutError:
        if _heartbeat_task:
            _heartbeat_task.cancel()
        _timeout = _route_timeout_sec(channel)
        logger.warning("route_chat: route_timeout — LLM call exceeded %.0fs for channel=%r", _timeout, channel)
        return _finish({"error": f"route_timeout: LLM call exceeded {_timeout:.0f}s limit", "response": None,
                        "agent_id": agent_id, "task_id": task_id})
    except Exception as exc:
        if _heartbeat_task:
            _heartbeat_task.cancel()
        logger.exception("route_chat error: %s: %s", type(exc).__name__, exc)
        return _finish({"error": f"Internal error: {type(exc).__name__}: {exc}", "response": None,
                        "agent_id": agent_id, "task_id": task_id})
    finally:
        if _heartbeat_task:
            _heartbeat_task.cancel()
        _reset_log_context(_ctx_tokens)

    if not route_result.success:
        logger.error("route_chat: adapter failure — %s", route_result.error)
        return _finish({"error": "Agent unavailable. Please try again later.", "response": None,
                        "agent_id": agent_id, "task_id": task_id})

    backend.add_comment(task_id=task_id, body=route_result.summary, author_agent_id=agent_id, author_kind="agent")

    usage = route_result.adapter_result.usage if route_result.adapter_result else None
    return _finish({
        "response": route_result.summary,
        "agent_id": agent_id,
        "agent_name": agent_name,
        "task_id": task_id,
        "adapter_type": adapter_type,
        "input_tokens": usage.input_tokens if usage else None,
        "output_tokens": usage.output_tokens if usage else None,
        "cost_usd": route_result.adapter_result.cost_usd if route_result.adapter_result else None,
    })


async def get_metrics(company_id: str) -> dict[str, Any]:
    """Return aggregated performance metrics for the company."""
    backend = _get_backend()
    # Fetch recent route executions for this company
    # LocalBackend doesn't have a direct filter by company for route_executions yet,
    # so we'll fetch all and filter for now (optimization candidate).
    all_runs = backend._db.execute(
        "SELECT cost_usd, duration_sec, created_at FROM route_executions "
        "WHERE company_id = ? AND status = 'done' "
        "ORDER BY created_at DESC LIMIT 100",
        (company_id,)
    )
    
    total_cost = 0.0
    latencies = []
    history = []

    for r in all_runs:
        cost = r["cost_usd"] or 0.0
        duration = r["duration_sec"] or 0.0
        total_cost += cost
        latencies.append(duration)
        history.append({
            "ts": r["created_at"],
            "cost": cost,
            "latency": duration
        })

    avg_latency = sum(latencies) / len(latencies) if latencies else 0.0
    
    return {
        "company_id": company_id,
        "total_cost_usd": total_cost,
        "avg_latency_sec": avg_latency,
        "sample_count": len(latencies),
        "history": history[::-1] # chronological
    }


async def route_chat_with_qa_loop(
    task_id: str,
    text: str,
    sender_id: str,
    max_iter: int = 3,
    company_id: str | None = None,
) -> dict[str, Any]:
    """Run Engineer → QA evaluation loop and update the route_execution record.

    Uses QALoop to iterate:
      Engineer implements → QA scores (4 criteria ≥ 7 to pass) → rework if needed.
    Max iterations: max_iter (default 3). Circuit breaker: same failure 3x → escalate.

    Returns a dict with "response" (summary string) and "qa_loop_result".
    """
    from musu_core.qa_loop import QALoop
    from musu_core.sprint_contract import SprintContract, save_contract, save_qa_score
    from musu_core.router import Router
    from musu_core.config import get_config as get_core_config
    from musu_core.db import get_db

    backend = _get_backend()
    cfg = get_core_config()
    router = Router(backend=backend, config=cfg)

    engineer = backend.get_agent_by_name("engineer", company_id=company_id)
    qa_agent = backend.get_agent_by_name("qa", company_id=company_id)
    if engineer is None or qa_agent is None:
        error = "engineer or qa agent not found in DB — register both agents before using use_qa_loop"
        backend.update_route_execution(task_id, "failed", error=error)
        return {"error": error}

    engineer_id: str = engineer["id"]
    _ctx_tokens = _set_log_context(engineer_id, task_id)
    logger.info(
        "route_chat_with_qa_loop: start task_id=%s agent_id=%s",
        task_id, engineer_id,
        extra={"agent_id": engineer_id, "task_id": task_id},
    )

    # Minimal auto-generated Sprint Contract from the task description.
    # CTO can supply a richer contract via a dedicated endpoint in a future phase.
    contract = SprintContract(
        task=text,
        task_id=task_id,
        scope=[text],
        acceptance_criteria=[
            f"Task is fully implemented as described: {text[:120].rstrip()}{'…' if len(text) > 120 else ''}",
            "All four QA dimensions (functionality, correctness, completeness, code_quality) score ≥ 7",
            "No regressions introduced — existing behaviour is preserved",
        ],
        done_definition="Task implemented and all four QA criteria score ≥ 7",
    )

    # Persist contract so UI can display it immediately.
    try:
        _db = get_db(cfg.db_path)
        save_contract(_db._get_conn(), contract)
    except Exception as _e:
        logger.warning("Could not persist sprint contract: %s", _e)

    loop = QALoop(
        router=router,
        engineer_agent_id=engineer_id,
        qa_agent_id=qa_agent["id"],
        max_iterations=max_iter,
    )

    async def _qa_heartbeat(eid: str, interval: float = 15.0) -> None:
        """Periodically touch last_activity_at so watchdog won't kill long QA loops."""
        try:
            while True:
                await asyncio.sleep(interval)
                try:
                    backend.touch_route_execution_activity(eid)
                except Exception as _hb_exc:
                    logger.warning(
                        "route_chat_with_qa_loop: heartbeat touch failed exec_id=%s — %s",
                        eid, _hb_exc,
                        extra={"agent_id": engineer_id, "task_id": task_id},
                    )
        except asyncio.CancelledError:
            pass

    _heartbeat_task = asyncio.ensure_future(_qa_heartbeat(task_id))
    try:
        backend.touch_route_execution_activity(task_id)
    except Exception:
        pass

    # task_id here is a route_executions.id, NOT a tasks.id — passing it to loop.run()
    # would cause execution_log (which FK-references tasks.id) to fail.  Pass None so
    # inner router calls don't try to link execution_log rows to a non-existent tasks row.
    try:
        result = await loop.run(task_prompt=text, contract=contract, task_id=None)
    finally:
        _heartbeat_task.cancel()
        _reset_log_context(_ctx_tokens)

    if result.final_score:
        score_str = (
            f"func={result.final_score.functionality} "
            f"corr={result.final_score.correctness} "
            f"comp={result.final_score.completeness} "
            f"qual={result.final_score.code_quality}"
        )
    else:
        score_str = "no score"

    summary = (
        f"QA loop: {'PASS ✓' if result.passed else 'FAIL ✗'} "
        f"({result.iterations_used}/{max_iter} iter) | {score_str}"
    )
    if result.escalated:
        summary += f" | ESCALATED: {result.escalation_reason}"

    logger.info(
        "route_chat_with_qa_loop: done task_id=%s %s",
        task_id, summary,
        extra={"agent_id": engineer_id, "task_id": task_id},
    )

    # Persist all QA scores (one row per iteration) so UI can display history.
    if result.all_scores:
        try:
            _db = get_db(cfg.db_path)
            _conn = _db._get_conn()
            for _score in result.all_scores:
                save_qa_score(_conn, contract.id, task_id, _score)
        except Exception as _e:
            logger.warning("Could not persist QA scores: %s", _e)

    if result.passed:
        backend.update_route_execution(task_id, "done", output=summary)
    else:
        backend.update_route_execution(
            task_id, "failed", error=summary,
        )
        logger.warning(
            "route_chat_with_qa_loop: failed task_id=%s %s",
            task_id, summary,
            extra={"agent_id": engineer_id, "task_id": task_id},
        )

    return {"response": summary, "qa_loop_result": result}


def get_agents() -> list[dict[str, Any]]:
    """List all active agents."""
    backend = _get_backend()
    return backend.list_agents()


def get_agent_by_id(agent_id: str) -> dict[str, Any] | None:
    """Get a single agent by ID."""
    backend = _get_backend()
    return backend.get_agent(agent_id)


def set_agent_status(agent_id: str, status: str) -> dict[str, Any] | None:
    """Update agent status (e.g. paused/active). Returns updated agent dict or None if not found."""
    backend = _get_backend()
    return backend.update_agent(agent_id, status=status)


def update_agent_fields(
    agent_id: str,
    *,
    role: str | None = None,
    model: str | None = None,
    adapter_config_patch: dict | None = None,
    adapter_type: str | None = None,
) -> dict[str, Any] | None:
    """Update editable agent fields (role, model, adapter_config, adapter_type). Returns updated agent dict or None if not found.

    `model` is stored inside adapter_config — this helper merges the new value
    without touching any other adapter_config keys.
    `adapter_config_patch` is shallow-merged into the existing adapter_config.
    """
    if role is None and model is None and adapter_config_patch is None and adapter_type is None:
        return None
    backend = _get_backend()
    if model is not None or adapter_config_patch is not None:
        # Read current adapter_config and patch it
        existing = backend.get_agent(agent_id)
        if existing is None:
            return None
        new_config = dict(existing.get("adapter_config") or {})
        if model is not None:
            new_config["model"] = model
        if adapter_config_patch is not None:
            new_config.update(adapter_config_patch)
        kwargs: dict[str, Any] = dict(role=role, adapter_config=new_config)
        if adapter_type is not None:
            kwargs["adapter_type"] = adapter_type
        return backend.update_agent(agent_id, **kwargs)
    kwargs = {}
    if role is not None:
        kwargs["role"] = role
    if adapter_type is not None:
        kwargs["adapter_type"] = adapter_type
    return backend.update_agent(agent_id, **kwargs)


# --- Issues ---


def create_issue_record(
    company_id: str,
    title: str,
    description: str = "",
    status: str = "open",
    priority: str = "medium",
    assignee_id: str | None = None,
    goal_id: str | None = None,
    project_id: str | None = None,
) -> dict[str, Any]:
    """Create a new issue for a company."""
    backend = _get_backend()
    return backend.create_issue(
        company_id=company_id,
        goal_id=goal_id,
        project_id=project_id,
        title=title,
        description=description,
        status=status,
        priority=priority,
        assignee_id=assignee_id,
    )


def get_issue_record(issue_id: str) -> dict[str, Any] | None:
    """Get an issue by id."""
    backend = _get_backend()
    return backend.get_issue(issue_id)


def list_issue_records(
    company_id: str,
    status: str | None = None,
    assignee_id: str | None = None,
    goal_id: str | None = None,
    project_id: str | None = None,
    limit: int = 100,
) -> list[dict[str, Any]]:
    """List issues for a company."""
    backend = _get_backend()
    return backend.list_issues(
        company_id=company_id,
        status=status,
        assignee_id=assignee_id,
        goal_id=goal_id,
        project_id=project_id,
        limit=limit,
    )


def update_issue_record(issue_id: str, **kwargs: Any) -> dict[str, Any] | None:
    """Update an issue. Returns updated issue or None if not found."""
    backend = _get_backend()
    return backend.update_issue(issue_id, **kwargs)


def checkout_issue_record(issue_id: str, agent_id: str) -> dict[str, Any] | None:
    """Checkout an issue to an agent."""
    backend = _get_backend()
    return backend.checkout_issue(issue_id, agent_id)


def list_issue_comment_records(issue_id: str) -> list[dict[str, Any]]:
    """List comments for an issue."""
    backend = _get_backend()
    return backend.list_issue_comments(issue_id)


def add_issue_comment_record(
    issue_id: str,
    body: str,
    author_id: str | None = None,
    author_kind: str = "agent",
) -> dict[str, Any]:
    """Add a comment to an issue."""
    backend = _get_backend()
    return backend.add_issue_comment(issue_id, body=body, author_id=author_id, author_kind=author_kind)


# --- Approvals ---


def list_approval_records(company_id: str, status: str | None = None) -> list[dict[str, Any]]:
    """List approval requests for a company."""
    backend = _get_backend()
    return backend.list_approvals(company_id=company_id, status=status)


def resolve_approval_record(
    approval_id: str,
    decision: str,
    reason: str = "",
) -> dict[str, Any] | None:
    """Resolve an approval (approved/rejected)."""
    backend = _get_backend()
    return backend.resolve_approval(approval_id, decision=decision, reason=reason)


# --- Projects ---


def list_project_records(company_id: str, status: str | None = None) -> list[dict[str, Any]]:
    """List projects for a company."""
    backend = _get_backend()
    return backend.list_projects(company_id=company_id, status=status)


def get_project_record(project_id: str) -> dict[str, Any] | None:
    """Get a project by id."""
    backend = _get_backend()
    return backend.get_project(project_id)


def create_project_record(
    company_id: str,
    project_name: str,
    status: str = "active",
    assigned_to: str | None = None,
) -> dict[str, Any]:
    """Create a project for a company."""
    import uuid
    backend = _get_backend()
    return backend.create_project(
        project_id=str(uuid.uuid4()),
        company_id=company_id,
        project_name=project_name,
        status=status,
        assigned_to=assigned_to,
    )


def update_project_record(project_id: str, **kwargs: Any) -> dict[str, Any] | None:
    """Update a project."""
    backend = _get_backend()
    return backend.update_project(project_id, **kwargs)


def delete_project_record(project_id: str) -> bool:
    """Delete a project. Returns True if deleted."""
    backend = _get_backend()
    return backend.delete_project(project_id)


# --- Goals ---


def list_goal_records(company_id: str, status: str | None = None) -> list[dict[str, Any]]:
    """List goals for a company."""
    backend = _get_backend()
    return backend.list_goals(company_id=company_id, status=status)


def create_goal_record(
    company_id: str,
    title: str,
    description: str = "",
    status: str = "active",
    due_date: str | None = None,
) -> dict[str, Any]:
    """Create a goal for a company."""
    import uuid
    backend = _get_backend()
    return backend.create_goal(
        goal_id=str(uuid.uuid4()),
        company_id=company_id,
        title=title,
        description=description,
        status=status,
        due_date=due_date,
    )


def get_goal_record(goal_id: str) -> dict[str, Any] | None:
    """Get a goal by id."""
    backend = _get_backend()
    return backend.get_goal(goal_id)


def update_goal_record(goal_id: str, **kwargs: Any) -> dict[str, Any] | None:
    """Update a goal."""
    backend = _get_backend()
    return backend.update_goal(goal_id, **kwargs)


def delete_goal_record(goal_id: str) -> bool:
    """Delete a goal. Returns True if deleted."""
    backend = _get_backend()
    return backend.delete_goal(goal_id)


# --- Costs ---


def get_costs_summary_record(company_id: str) -> dict[str, Any]:
    """Get execution cost summary for a company."""
    backend = _get_backend()
    return backend.get_costs_summary(company_id)


def get_costs_by_agent_record(company_id: str) -> list[dict[str, Any]]:
    """Get per-agent execution costs for a company."""
    backend = _get_backend()
    return backend.get_costs_by_agent(company_id)


def get_runs_recent_global(limit: int = 50) -> list[dict[str, Any]]:
    """Return the most recent route_executions across all companies."""
    backend = _get_backend()
    return backend.get_runs_recent(limit=limit)


def get_costs_global() -> dict[str, Any]:
    """Return execution cost summary across all companies."""
    backend = _get_backend()
    return backend.get_costs_global()


def get_costs_by_agent_global() -> list[dict[str, Any]]:
    """Return per-agent execution counts across all companies."""
    backend = _get_backend()
    return backend.get_costs_by_agent_global()


def get_costs_by_node(company_id: str = "") -> list[dict[str, Any]]:
    """Return execution costs grouped by node, using mesh_router agent→node mapping."""
    backend = _get_backend()
    if company_id:
        by_agent = backend.get_costs_by_agent(company_id)
    else:
        by_agent = backend.get_costs_by_agent_global()

    mesh = get_mesh_router()
    node_costs: dict[str, dict[str, Any]] = {}

    for entry in by_agent:
        agent_name = entry.get("agent_name", entry.get("channel", "unknown"))
        node = mesh._agent_nodes.get(agent_name.lower(), mesh._self_name or "local")
        if node not in node_costs:
            node_costs[node] = {"node": node, "total_cost_usd": 0.0, "execution_count": 0, "agents": []}
        node_costs[node]["total_cost_usd"] += entry.get("total_cost_usd", entry.get("cost_usd", 0.0)) or 0.0
        node_costs[node]["execution_count"] += entry.get("count", entry.get("execution_count", 0)) or 0
        node_costs[node]["agents"].append(agent_name)

    return list(node_costs.values())


def get_channel_map(company_id: str | None = None) -> dict[str, Any]:
    """Return channel-to-agent mapping with agent details.

    If company_id is given, includes company-scoped agents alongside global ones.
    """
    cfg = get_bridge_config()
    backend = _get_backend()
    result = {}
    # Static global map
    _all_agents_cache: list[dict] | None = None
    for channel, agent_name in cfg.channel_agent_map.items():
        agent = backend.get_agent_by_name(agent_name, company_id=company_id)
        if agent is None:
            # Fallback: search globally
            if _all_agents_cache is None:
                _all_agents_cache = backend.list_agents()
            agent = next((a for a in _all_agents_cache if a.get("name") == agent_name), None)
        result[channel] = {
            "agent_name": agent_name,
            "agent_id": agent["id"] if agent else None,
            "agent_role": agent["role"] if agent else None,
        }
    # Add global and company-scoped agents
    target_ids = [company_id, 'global'] if company_id else ['global']
    for tid in target_ids:
        for agent in backend.list_agents(company_id=tid):
            name = agent["name"]
            if name not in result:
                result[name] = {
                    "agent_name": name,
                    "agent_id": agent["id"],
                    "agent_role": agent["role"],
                }
    return result


# --- Async task delegation ---

_SUMMARY_MAX_CHARS = 500


def _make_summary(output: str | None) -> str:
    """Produce a short summary from agent output for orchestrator consumption."""
    if not output:
        return "(no output)"
    text = output.strip()
    if len(text) <= _SUMMARY_MAX_CHARS:
        return text
    return text[:_SUMMARY_MAX_CHARS] + f"\n...[truncated, {len(text)} chars total]"


def _is_system_noop(r: dict[str, Any]) -> bool:
    """Return True for system-issued heartbeat records that produced no output.

    These are created when the heartbeat fires but the agent either was not
    found or returned immediately without any LLM call.  They match:
      - sender_id == 'system'
      - no output
      - created_at == updated_at (never transitioned out of initial state)
    """
    if r.get("sender_id") != "system":
        return False
    if r.get("output"):
        return False
    return (r.get("created_at", "")[:19]) == (r.get("updated_at", "")[:19])


def list_task_records(
    status: str | None = None,
    limit: int = 50,
    before_id: str | None = None,
    channel: str | None = None,
    exclude_system_noop: bool = False,
) -> list[dict[str, Any]]:
    """List route executions with summary field for each record.

    exclude_system_noop: when True, omit system-issued heartbeat records that
    have no output and were created == updated (zombie no-ops).
    """
    backend = _get_backend()
    records = backend.list_route_executions(
        status=status, limit=limit, before_id=before_id, channel=channel
    )
    if exclude_system_noop:
        records = [r for r in records if not _is_system_noop(r)]
    return [
        {
            "task_id": r["id"],
            "status": r["status"],
            "channel": r["channel"],
            "sender_id": r["sender_id"],
            "summary": _make_summary(r.get("output")),
            "error": r.get("error"),
            "retry_count": r.get("retry_count", 0),
            "created_at": r.get("created_at"),
            "updated_at": r.get("updated_at"),
        }
        for r in records
    ]


def cancel_task_record(task_id: str, error: str = "cancelled") -> bool:
    """Mark a task as failed/cancelled in the DB.

    Returns False if not found. No-ops if task is already in a terminal
    state (done/failed) to preserve the accurate final status.
    """
    backend = _get_backend()
    rec = backend.get_route_execution(task_id)
    if rec is None:
        return False
    if rec.get("status") in ("done", "failed"):
        # Already terminal — don't overwrite the real final status
        return True
    backend.update_route_execution(task_id, "failed", error=error)
    return True


def get_task_record(task_id: str) -> dict[str, Any] | None:
    """Fetch a route_execution record by id and return it with a summary field."""
    backend = _get_backend()
    rec = backend.get_route_execution(task_id)
    if rec is None:
        return None
    return {
        "task_id": rec["id"],
        "status": rec["status"],
        "channel": rec["channel"],
        "sender_id": rec["sender_id"],
        "summary": _make_summary(rec.get("output")),
        "output": rec.get("output"),
        "error": rec.get("error"),
        "retry_count": rec.get("retry_count", 0),
        "created_at": rec.get("created_at"),
        "updated_at": rec.get("updated_at"),
    }


# --- Sprint Contract + QA Scores ---


def get_sprint_contract_for_task(task_id: str) -> dict[str, Any] | None:
    """Return the sprint contract linked to a task_id, or None.

    Returns None on DB errors (e.g. migration not yet run) so the endpoint
    can surface a 404 rather than an unhandled 500.
    """
    try:
        return _get_backend().get_sprint_contract_for_task(task_id)
    except Exception as exc:
        logger.warning("get_sprint_contract_for_task DB error for %s: %s", task_id, exc)
        return None


def get_qa_scores_for_task(task_id: str) -> list[dict[str, Any]]:
    """Return QA scores linked to a task_id, ordered by iteration.

    Returns empty list on DB errors so the endpoint surfaces [] rather than 500.
    """
    try:
        return _get_backend().get_qa_scores_for_task(task_id)
    except Exception as exc:
        logger.warning("get_qa_scores_for_task DB error for %s: %s", task_id, exc)
        return []


# --- Message history ---


def list_messages(
    session_id: str,
    limit: int = 50,
    before_id: str | None = None,
    agent_id: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
) -> list[dict[str, Any]]:
    """Return messages for a session with cursor-based pagination and optional filters."""
    backend = _get_backend()
    return backend.list_messages(
        session_id,
        limit=limit,
        before_id=before_id,
        agent_id=agent_id,
        date_from=date_from,
        date_to=date_to,
    )


def get_message_by_id(message_id: str) -> dict[str, Any] | None:
    """Return a single message by id, or None if not found."""
    backend = _get_backend()
    return backend.get_message(message_id)


def delete_message_by_id(message_id: str) -> bool:
    """Delete a message by id. Returns True if deleted, False if not found."""
    backend = _get_backend()
    return backend.delete_message(message_id)


# --- Company management ---


def list_companies(workspace_id: str | None = None) -> list[dict[str, Any]]:
    """List all companies, optionally filtered by workspace_id."""
    backend = _get_backend()
    return backend.list_companies(workspace_id=workspace_id)


def create_company(
    name: str,
    template_key: str = "default",
    workspace_id: str = "",
    meta: dict | None = None,
    company_id: str | None = None,
) -> dict[str, Any]:
    """Create a new company. Optionally supply a fixed company_id."""
    backend = _get_backend()
    return backend.create_company(
        name=name,
        template_key=template_key,
        workspace_id=workspace_id,
        meta=meta,
        company_id=company_id,
    )


def get_company(company_id: str) -> dict[str, Any] | None:
    """Get a company by id, or None if not found."""
    backend = _get_backend()
    return backend.get_company(company_id)


def update_company(company_id: str, **kwargs: Any) -> dict[str, Any] | None:
    """Update a company's fields. Returns updated company or None if not found."""
    backend = _get_backend()
    return backend.update_company(company_id, **kwargs)


def delete_company(company_id: str) -> bool:
    """Delete a company: retire its scoped agents, then remove the company record.

    Returns True if found/deleted, False if not found.
    """
    backend = _get_backend()
    company = backend.get_company(company_id)
    if not company:
        return False
    # Retire company-scoped agents first (prevents orphan globals via ON DELETE SET NULL)
    for agent in backend.list_agents(company_id=company_id):
        backend.update_agent(agent["id"], status="retired")
    return backend.delete_company(company_id)


def create_company_from_template(
    name: str,
    template_key: str,
    purpose: str,
    work_dir: str = "",
    test_cmd: str = "python -m pytest -q",
    workspace_id: str = "",
    backend=None,
) -> dict[str, Any]:
    """Create a company and auto-create its agent team from a template.

    Returns {"company": {...}, "agents": [...]}.
    Raises ValueError for unknown templates.
    """
    from company_templates import get_template, render_agent_instructions  # local import to avoid circular

    tmpl = get_template(template_key)
    if tmpl is None:
        raise ValueError(f"Unknown template: {template_key!r}")

    b = backend if backend is not None else _get_backend()
    company = b.create_company(
        name=name,
        template_key=template_key,
        workspace_id=workspace_id,
        meta={"purpose": purpose},
    )
    # ── Harness: store governance config from template ──────────────────────
    import json as _json
    from datetime import datetime, timezone as _tz

    governance = tmpl.get("governance", {})
    company = b.update_company(
        company["id"],
        purpose=purpose,
        status="active",
        governance_config=_json.dumps(governance),
    )
    company_id = company["id"]

    # Budget reset: 1st of next month
    _now = datetime.now(_tz.utc)
    if _now.month == 12:
        reset_at = datetime(_now.year + 1, 1, 1, tzinfo=_tz.utc).isoformat()
    else:
        reset_at = datetime(_now.year, _now.month + 1, 1, tzinfo=_tz.utc).isoformat()

    # Short prefix for agent names: first 8 chars of company_id
    short = company_id[:8]

    created_agents = []
    for tmpl_agent in tmpl["agents"]:
        rendered = render_agent_instructions(
            tmpl_agent, name, purpose, work_dir=work_dir, test_cmd=test_cmd
        )
        # Auto-detect CLI + model based on adapter_type
        from seed_agents import detect_cli, model_for_role
        _detected_adapter, _detected_cmd = detect_cli()
        _adapter = rendered.get("adapter_type", _detected_adapter)
        _role_name = rendered["name"]
        config: dict[str, Any] = {
            "command": _detected_cmd if _adapter == _detected_adapter else (
                "gemini" if "gemini" in _adapter else
                "codex" if "codex" in _adapter else _detected_cmd
            ),
            "model": model_for_role(_role_name, _adapter),
            "dangerously_skip_permissions": os.getenv("MUSU_SKIP_PERMISSIONS", "true").lower() == "true",
            "timeout_sec": 600,
            "cwd": work_dir or os.getcwd(),
            "instructions": rendered["instructions"],
            "disable_mcp": _role_name not in ("lead",),
        }
        # Use instructions_path if provided — resolve to absolute path
        if rendered.get("instructions_path"):
            import pathlib
            _ipath = pathlib.Path(rendered["instructions_path"])
            if not _ipath.is_absolute():
                _ipath = pathlib.Path(os.getcwd()) / _ipath
            config["instructions_path"] = str(_ipath)
        agent = b.create_agent(
            name=f"{short}-{rendered['name']}",
            role=rendered["role"],
            adapter_type=rendered["adapter_type"],
            adapter_config=config,
            company_id=company_id,
        )

        # ── Harness: set per-agent budget from template ──────────────────
        budget = rendered.get("budget_usd_monthly")
        if budget is not None:
            agent = b.update_agent(
                agent["id"],
                budget_usd_monthly=budget,
                budget_usd_spent=0.0,
                budget_reset_at=reset_at,
            )

        created_agents.append(agent)

    # ── Auto-assign agents to local node in nodes.toml ──────────────────────
    try:
        from mesh_router import get_mesh_router
        _router = get_mesh_router()
        if _router.enabled:
            _agent_names = [a["name"] for a in created_agents]
            _router.auto_assign_agents(_router._self_name, _agent_names)
            logger.info("create_company: auto-assigned %d agents to node %s", len(_agent_names), _router._self_name)
    except Exception as _ae:
        logger.warning("create_company: auto-assign failed — %s", _ae)

    # ── Auto-setup workspace: create dir + indexer profile ──────────────────
    if work_dir:
        _setup_company_workspace(work_dir, name, company_id)

    # ── v12-onboarding E: seed intro messages so canvas lights up fast ─────
    try:
        seed_intro_messages(company_id, created_agents, backend=b)
    except Exception as e:
        logger.warning("seed_intro_messages failed: %s", e)

    return {"company": company, "agents": created_agents, "governance": governance}


def _setup_company_workspace(work_dir: str, company_name: str, company_id: str) -> None:
    """Create work directory if missing and initialize musu-indexer profile."""
    import pathlib
    wd = pathlib.Path(work_dir).expanduser()
    wd.mkdir(parents=True, exist_ok=True)

    profile = wd / ".musu-indexer.json"
    if not profile.exists():
        import json
        config = {
            "name": f"{company_name.lower().replace(' ', '-')}-{company_id[:8]}",
            "root": ".",
            "include_roots": ["."],
            "exclude_roots": [],
            "ignore_globs": [
                "*.png", "*.jpg", "*.jpeg", "*.gif", "*.mp4", "*.wav", "*.mp3",
                "*.exe", "*.bin", "*.db", "*.db-*", "*.zip", "*.tar.gz",
                "node_modules/**", ".venv/**", "__pycache__/**", ".git/**",
            ],
        }
        profile.write_text(json.dumps(config, indent=2, ensure_ascii=False), encoding="utf-8")
        logger.info("workspace: created indexer profile at %s", profile)

    # Run initial index (non-blocking, best-effort)
    indexer = pathlib.Path.home() / "musu-functions" / "musu-indexer" / ".venv" / "bin" / "musu-indexer"
    if indexer.exists():
        import subprocess
        try:
            subprocess.Popen(
                [str(indexer), "sync", "--profile", str(profile)],
                cwd=str(wd),
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
            logger.info("workspace: indexer sync started for %s", wd)
        except Exception as exc:
            logger.warning("workspace: indexer sync failed: %s", exc)


def set_company_status(
    company_id: str,
    status: str,
    backend=None,
) -> dict[str, Any]:
    """Set company status to 'active' or 'inactive'. Returns updated company."""
    if status not in ("active", "inactive"):
        raise ValueError("status must be 'active' or 'inactive'")
    b = backend if backend is not None else _get_backend()
    updated = b.update_company(company_id, status=status)
    if updated is None:
        raise KeyError(f"Company not found: {company_id}")
    return updated


# --- Sync pull (for peer nodes to pull from this node) ---


def sync_companies(since: str, limit: int = 500) -> list[dict]:
    """Return companies updated at or after *since* (ISO 8601), up to *limit*."""
    backend = _get_backend()
    rows = backend._db.execute(
        "SELECT * FROM companies WHERE updated_at >= ? ORDER BY updated_at ASC LIMIT ?",
        (since, limit),
    )
    return [dict(r) for r in rows]


def sync_messages(since: str, limit: int = 500) -> list[dict]:
    """Return messages created at or after *since* (ISO 8601), up to *limit*."""
    backend = _get_backend()
    rows = backend._db.execute(
        "SELECT * FROM messages WHERE created_at >= ? ORDER BY created_at ASC LIMIT ?",
        (since, limit),
    )
    return [backend._msg_row_to_dict(r) for r in rows]


# --- Sync receive (for accepting incoming data from peer nodes) ---


def receive_companies(companies: list[dict]) -> int:
    """Bulk-upsert companies received from a peer. Returns count written."""
    backend = _get_backend()
    return backend.bulk_upsert_companies(companies)


def receive_messages(messages: list[dict]) -> int:
    """Bulk-insert messages received from a peer. Returns count written."""
    backend = _get_backend()
    return backend.bulk_insert_messages(messages)


# --- Node management ---


def get_node_info() -> dict[str, Any]:
    """Return this node's identity info for peer exchange."""
    mesh = get_mesh_router()
    cfg = get_bridge_config()
    backend = _get_backend()
    agents = [a["name"] for a in backend.list_agents()]
    # Prefer explicit MUSU_BRIDGE_PUBLIC_URL, fall back to nodes.toml self entry
    self_url = cfg.public_url or mesh.url_for_node(mesh._self_name) or ""
    return {
        "name": mesh._self_name,
        "url": self_url,
        "agents": agents,
        "version": "0.2.0",
    }


def _validate_external_url(url: str) -> None:
    """Raise HTTPException 400 if url is private/loopback (SSRF guard)."""
    from urllib.parse import urlparse
    from fastapi import HTTPException
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        raise HTTPException(status_code=400, detail="Invalid URL scheme")
    host = parsed.hostname or ""
    # Reject localhost aliases
    if host in ("localhost", "localhost.localdomain"):
        raise HTTPException(status_code=400, detail="URL must not target loopback")
    try:
        addr = ipaddress.ip_address(host)
        if addr.is_private or addr.is_loopback or addr.is_link_local:
            raise HTTPException(status_code=400, detail="URL must not target private network")
    except ValueError:
        pass  # hostname — DNS not resolved here, basic check only


def _is_safe_pair_ip(ip: str) -> bool:
    """Return True if the IP is safe to pair with.

    Blocks loopback and link-local ranges to prevent SSRF against local
    services (e.g. AWS metadata at 169.254.169.254). Private LAN and
    Tailscale ranges (100.x.x.x, 192.168.x.x, 10.x.x.x) are allowed
    because pairing over LAN/VPN is the primary use case.
    """
    import ipaddress
    try:
        addr = ipaddress.ip_address(ip)
    except ValueError:
        return False  # reject hostnames — only bare IPs allowed
    return not addr.is_loopback and not addr.is_link_local and not addr.is_unspecified


async def pair_with_node(ip: str, port: int) -> dict[str, Any]:
    """Initiate HTTP pairing with a remote node.

    1. GET remote /api/admin/node-info
    2. POST remote /api/admin/pair/accept with local node info
    3. Update local nodes.toml + reload MeshRouter
    """
    import httpx

    if not _is_safe_pair_ip(ip):
        return {"success": False, "error": f"IP {ip!r} is not a routable address"}

    if not (1 <= port <= 65535):
        return {"success": False, "error": f"Port {port} out of range (1-65535)"}

    remote_base = f"http://{ip}:{port}"

    # 1. Fetch remote node info
    try:
        async with httpx.AsyncClient(timeout=10.0, follow_redirects=False) as client:
            resp = await client.get(f"{remote_base}/api/admin/node-info")
            if resp.status_code != 200:
                return {"success": False, "error": f"Remote returned {resp.status_code}"}
            remote_info = resp.json()
    except (httpx.ConnectError, httpx.TimeoutException) as exc:
        return {"success": False, "error": f"Cannot reach {remote_base}: {exc}"}

    remote_name = remote_info.get("name", "")
    remote_url = remote_info.get("url", "") or remote_base

    # 2. Send local node info to remote so it can add us
    local_info = get_node_info()
    try:
        async with httpx.AsyncClient(timeout=10.0, follow_redirects=False) as client:
            resp = await client.post(
                f"{remote_base}/api/admin/pair/accept",
                json=local_info,
            )
            if resp.status_code != 200:
                return {"success": False, "error": f"Remote pair/accept returned {resp.status_code}"}
    except (httpx.ConnectError, httpx.TimeoutException) as exc:
        return {"success": False, "error": f"pair/accept failed: {exc}"}

    # 3. Update local nodes.toml (store remote agents for NodePanel display)
    mesh = get_mesh_router()
    remote_agents = remote_info.get("agents", [])
    if isinstance(remote_agents, list):
        remote_agents = [str(a) for a in remote_agents]
    mesh.add_node(remote_name, remote_url, agents=remote_agents)

    # 4. Fetch remote Agent Card and auto-assign unassigned agents
    assigned_agents: list[str] = []
    try:
        async with httpx.AsyncClient(timeout=5.0, follow_redirects=False) as client:
            card_resp = await client.get(f"{remote_base}/api/admin/node-card")
            if card_resp.status_code == 200:
                card = card_resp.json()
                card_agents = [
                    a["id"]
                    for a in card.get("capabilities", {}).get("agents", [])
                    if isinstance(a, dict) and a.get("id")
                ]
                if card_agents:
                    assigned_agents = mesh.auto_assign_agents(remote_name, card_agents)
                else:
                    # Fallback: use agents from node-info
                    assigned_agents = mesh.auto_assign_agents(remote_name, remote_agents)
            else:
                assigned_agents = mesh.auto_assign_agents(remote_name, remote_agents)
    except Exception:
        # Agent Card fetch failed — fall back to node-info agents list
        assigned_agents = mesh.auto_assign_agents(remote_name, remote_agents)

    mesh.reload()

    return {
        "success": True,
        "node_name": remote_name,
        "node_url": remote_url,
        "assigned_agents": assigned_agents,
    }


def accept_pair(node_info: dict[str, Any]) -> dict[str, Any]:
    """Accept a pairing request from a remote node — update local nodes.toml."""
    name = node_info.get("name", "")
    url = node_info.get("url", "")
    if not name or not url:
        return {"success": False, "error": "Missing name or url"}
    _validate_external_url(url)
    agents = node_info.get("agents", [])
    if isinstance(agents, list):
        agents = [str(a) for a in agents]
    mesh = get_mesh_router()
    mesh.add_node(name, url, agents=agents)
    mesh.reload()
    logger.info("accept_pair: added node %r url=%r agents=%s", name, url, agents)
    return {"success": True, "node_name": name}


async def list_nodes() -> list[dict[str, Any]]:
    """List all configured nodes with online/offline status."""
    import httpx
    mesh = get_mesh_router()
    nodes = []
    for node_name, node_url in mesh._node_urls.items():
        is_self = node_name == mesh._self_name
        status = "self" if is_self else "unknown"
        if not is_self:
            try:
                async with httpx.AsyncClient(timeout=3.0, follow_redirects=False) as client:
                    resp = await client.get(f"{node_url.rstrip('/')}/health")
                    status = "online" if resp.status_code == 200 else "error"
            except Exception:
                status = "offline"
        # Merge agents from node config + agent_assignments
        node_agents = list(mesh._node_agents.get(node_name, []))
        for agent, assigned_node in mesh._agent_nodes.items():
            if assigned_node == node_name and agent not in node_agents:
                node_agents.append(agent)
        meta = mesh._node_meta.get(node_name, {})
        nodes.append({
            "name": node_name,
            "url": node_url,
            "status": status,
            "is_self": is_self,
            "agents": node_agents,
            "machine": meta.get("machine", node_name),
            "os": meta.get("os", "linux"),
            "gpu": meta.get("gpu", ""),
            "roles": meta.get("roles", []),
            "rustdesk_id": meta.get("rustdesk_id", ""),
        })
    return nodes


def compute_recommended_for(health: dict[str, Any]) -> list[str]:
    """Compute capability tags for a node based on its health stats."""
    tags: list[str] = ["general"]
    gpu = health.get("gpu", {})
    if isinstance(gpu, dict):
        util = gpu.get("utilization_pct", gpu.get("util", 100))
        if util is not None and util < 80:
            tags.extend(["llm", "compute"])
    cpu_pct = health.get("cpu_pct", health.get("cpu", 100))
    if cpu_pct is not None and cpu_pct < 70:
        tags.append("batch")
    return tags


async def route_task_to_node(
    channel: str,
    instruction: str,
    node_name: str = "",
    strategy: str = "auto",
    sender_id: str = "orchestrator",
) -> dict[str, Any]:
    """Route a task to a node. Returns {node, task_id, status}.

    strategy:
      - "explicit": requires node_name, forward directly
      - "recommended": pick best node based on recommended_for tags
      - "auto": use mesh_router default agent→node mapping
    """
    mesh = get_mesh_router()
    if not mesh._self_name:
        return {"error": "Mesh router not initialized (no self_name in nodes.toml)", "status": "error"}

    # Determine target node
    target_node = node_name
    if strategy == "explicit":
        if not target_node or target_node not in mesh._node_urls:
            return {"error": f"Node '{target_node}' not found", "status": "error"}
    elif strategy == "recommended":
        # Gather health from all nodes, pick best match
        nodes = await list_nodes()
        best_node = None
        for n in nodes:
            if n.get("status") in ("online", "self"):
                tags = compute_recommended_for(n)
                # Simple heuristic: prefer nodes with more capability tags
                if best_node is None or len(tags) > len(best_node[1]):
                    best_node = (n["name"], tags)
        target_node = best_node[0] if best_node else mesh._self_name
    else:
        # auto: use mesh_router's agent→node mapping
        agent_node = mesh._agent_nodes.get(channel.lower(), "")
        target_node = agent_node or mesh._self_name

    # Forward to target
    is_self = target_node == mesh._self_name
    if is_self:
        # Route locally via musu-core
        result = await route_chat(channel, sender_id, instruction)
        return {"node": target_node, "status": "routed_local", "result": result}
    else:
        # Forward to remote node via mesh_router
        try:
            result = await mesh.forward(
                mesh._node_urls.get(target_node, ""),
                channel, sender_id, instruction,
            )
            return {"node": target_node, "status": "routed_remote", "result": result}
        except Exception as exc:
            return {"node": target_node, "status": "error", "error": str(exc)}


def disconnect_node(name: str) -> bool:
    """Remove a node from nodes.toml."""
    mesh = get_mesh_router()
    ok = mesh.remove_node(name)
    if ok:
        mesh.reload()
    return ok


import ast as _ast
import pathlib as _pathlib

_STATIC_CONTROL_TOOLS = [
    "list_agents", "get_agent", "pause_agent", "resume_agent",
    "invoke_heartbeat", "get_org_chart",
    "list_issues", "get_issue", "create_issue", "update_issue",
    "checkout_issue", "add_comment", "get_comments",
    "get_dashboard", "list_runs", "watchdog_detect_and_remediate",
    "get_activity", "get_costs_summary", "get_costs_by_agent",
    "list_projects", "get_project", "list_goals",
    "list_approvals", "resolve_approval",
    "delegate_task", "get_task_status", "list_tasks", "cancel_task",
    # Wiki / Memory
    "list_wiki_pages", "search_wiki", "get_wiki_page",
]


def _discover_control_tools() -> list[str]:
    """Parse musu-control/server.py via AST to find @mcp.tool() decorated functions."""
    here = _pathlib.Path(__file__).parent.parent
    server_path = here / "musu-control" / "src" / "musu_control" / "server.py"
    if not server_path.exists():
        return _STATIC_CONTROL_TOOLS
    try:
        tree = _ast.parse(server_path.read_text())
        tools: list[str] = []
        for node in _ast.walk(tree):
            if isinstance(node, _ast.FunctionDef):
                for deco in node.decorator_list:
                    is_mcp_tool = (
                        isinstance(deco, _ast.Call)
                        and isinstance(deco.func, _ast.Attribute)
                        and deco.func.attr == "tool"
                    )
                    if is_mcp_tool:
                        tools.append(node.name)
                        break
        return tools if tools else _STATIC_CONTROL_TOOLS
    except Exception:
        return _STATIC_CONTROL_TOOLS


def _discover_bee_routes() -> list[str]:
    """Scan musu-bee/src/app/api/ for top-level route directories."""
    here = _pathlib.Path(__file__).parent.parent
    api_dir = here / "musu-bee" / "src" / "app" / "api"
    if not api_dir.exists():
        return ["channels", "agents", "tasks", "nodes", "companies"]
    return sorted(
        p.name for p in api_dir.iterdir()
        if p.is_dir() and not p.name.startswith("[") and not p.name.startswith("_")
    )


def get_mcp_tools_manifest() -> dict[str, Any]:
    """Return a service-grouped manifest of all MCP tools in the MUSU stack."""
    from config import get_config as get_bridge_config
    cfg = get_bridge_config()
    bridge_base = f"http://{cfg.bridge_host}:{cfg.bridge_port}"
    bee_base = "http://localhost:3001"
    control_base = "http://localhost:8090"  # musu-control default SSE port

    # musu-bridge exposes its own REST endpoints (not MCP tools, but discoverable)
    bridge_endpoints = [
        "route", "agents", "channels", "messages",
        "tasks", "admin/node-info", "admin/pair", "admin/nodes",
        "admin/discovered", "sync/companies", "sync/messages", "sync/push",
        "companies", "audit", "mcp/tools",
    ]

    # musu-control MCP tools — dynamically discovered via AST parsing
    control_tools = _discover_control_tools()

    # musu-bee Next.js API routes — dynamically scanned
    bee_tools = _discover_bee_routes()

    services: dict[str, Any] = {
        "musu-bridge": {
            "url": bridge_base,
            "description": "Core routing server — REST API + task delegation",
            "type": "rest",
            "endpoints": bridge_endpoints,
            "count": len(bridge_endpoints),
        },
        "musu-control": {
            "url": control_base,
            "description": "MCP server — 28 tools for agent management, issues, tasks",
            "type": "mcp",
            "tools": control_tools,
            "count": len(control_tools),
        },
        "musu-bee": {
            "url": bee_base,
            "description": "Next.js UI — API proxy routes",
            "type": "rest",
            "tools": bee_tools,
            "count": len(bee_tools),
        },
    }

    total = sum(s["count"] for s in services.values())
    return {"services": services, "total_tools": total}


# ── KV store wrappers ────────────────────────────────────────────────────────

def get_kv_record(key: str) -> str | None:
    return _get_backend().get_kv(key)


def set_kv_record(key: str, value: str) -> None:
    _get_backend().set_kv(key, value)


def get_goals(company_id: str | None = None) -> list[dict]:
    """Return goals for a company (or all goals if no company_id)."""
    backend = _get_backend()
    if hasattr(backend, "list_goals"):
        return backend.list_goals(company_id=company_id)
    return []


def get_recent_tasks(limit: int = 10) -> list[dict]:
    """Return recent tasks ordered by created_at DESC."""
    backend = _get_backend()
    rows = backend._db.execute(
        "SELECT * FROM tasks ORDER BY created_at DESC LIMIT ?", (limit,)
    )
    return [dict(r) for r in rows]


# ── v12-onboarding B — template decision ─────────────────────────────────────

_DECISION_STOP_WORDS: set[str] = {
    "a", "an", "the", "of", "for", "to", "and", "or", "in", "on", "at", "with",
    "by", "that", "this", "these", "those", "is", "are", "be", "will", "would",
    "want", "need", "want's", "make", "build", "run", "do", "does", "did", "have",
    "has", "had", "i", "we", "you", "they", "it", "my", "our", "your", "their",
    "company", "team", "business", "work", "job", "people", "person",
    # Korean particles aren't tokenized here, but common single-char ASCII noise:
    "s", "t", "d", "m", "re", "ll", "ve",
}

_DECISION_SCORE_THRESHOLD = 0.4


def _decision_tokens(text: str) -> set[str]:
    """Lower, strip punct, split, drop stop-words. Returns a set of tokens."""
    lowered = text.lower()
    # Keep Korean (BMP CJK) plus ASCII word chars; replace everything else with space.
    cleaned = re.sub(r"[^0-9a-zㄱ-힝\s]+", " ", lowered)
    tokens = {t for t in cleaned.split() if t and t not in _DECISION_STOP_WORDS}
    return tokens


def _decision_score(mission_tokens: set[str], template_tokens: set[str]) -> float:
    """Token overlap normalized by mission size (so longer descriptions don't dominate)."""
    if not mission_tokens:
        return 0.0
    overlap = mission_tokens & template_tokens
    return len(overlap) / max(len(mission_tokens), 1)


def decide_template_for_mission(mission: str, company_name: str) -> dict:
    """Decide whether a built-in template fits the mission, or research is needed.

    Returns one of:
      - {"decision": "found", "template": str, "score": float, "preview": {"agents": [...]}}
      - {"decision": "research", "research_task_id": str, "estimated_seconds": int}

    Pure function — no LLM call, deterministic, no side effects.
    The research_task_id is a placeholder; sub-cycle D will wire the actual task.
    """
    from company_templates import _TEMPLATES  # local import to avoid cycle

    mission_tokens = _decision_tokens(mission)

    best_key: str | None = None
    best_score = 0.0
    for key, tmpl in _TEMPLATES.items():
        description = tmpl.get("description", "")
        # Combine description + role hints from agents so short descriptions still match.
        role_text = " ".join(a.get("role", "") for a in tmpl.get("agents", []))
        template_tokens = _decision_tokens(f"{description} {role_text} {key}")
        score = _decision_score(mission_tokens, template_tokens)
        if score > best_score:
            best_score = score
            best_key = key

    if best_key and best_score >= _DECISION_SCORE_THRESHOLD:
        tmpl = _TEMPLATES[best_key]
        return {
            "decision": "found",
            "template": best_key,
            "score": round(best_score, 3),
            "preview": {
                "agents": [
                    {"name": a.get("name"), "role": a.get("role")}
                    for a in tmpl.get("agents", [])
                ],
            },
        }

    # D: also start the (stub) research task so the same id can be polled.
    task_id = start_research_task(mission=mission, company_name=company_name)
    return {
        "decision": "research",
        "research_task_id": task_id,
        "estimated_seconds": 30,
        "company_name": company_name,
    }


# ── v14.1 — LLM-aware decision + research ────────────────────────────────────

_LLM_DECISION_PROMPT = """You are an operator's assistant deciding how to spin up a new company.

Mission:
{mission}

Company name: {company_name}

Available built-in templates (each is a coherent team of 4-6 agents):
- dev-team — software development (lead / planner / engineer / qa)
- content-team — content production (lead / researcher / writer / editor)
- writer-studio — long-form fiction studio (5 agents incl. PM, researcher)
- marketing-team — marketing operations (6 agents)

If one of these templates clearly fits the mission, return:
  {{"decision": "found", "template": "<key>", "reason": "<one short sentence>"}}

If no template fits and the operator should design a custom org structure, return:
  {{"decision": "research", "reason": "<why no template fits>"}}

Return ONLY the JSON. No prose, no markdown fence."""

_LLM_RESEARCH_PROMPT = """You are designing the org structure for a brand-new company.

Mission:
{mission}

Company name: {company_name}

Design 5 departments across three phases (day-1, month-1+, month-3+).
Each department has one role title + an agent count (1-3).

Return ONLY a JSON object in this exact shape:
{{
  "slug": "<short-slug-of-company-name>-startup",
  "displayName": "<company_name> (<one-line mission tag>)",
  "departments": [
    {{"name": "<dept name>", "role": "<role title>", "agentCount": <int>, "phase": "day-1"|"month-1+"|"month-3+"}},
    ... 5 total
  ]
}}

No prose, no markdown fence."""


def _parse_llm_json(text: str) -> dict | None:
    """Strip code fences + parse JSON. Returns None on failure."""
    import json as _json
    if not text:
        return None
    s = text.strip()
    # Strip ```json ... ``` if present.
    if s.startswith("```"):
        s = re.sub(r"^```(?:json)?\s*", "", s)
        s = re.sub(r"\s*```\s*$", "", s)
    # Some adapters wrap the JSON in extra prose — pull the first balanced object.
    start = s.find("{")
    if start == -1:
        return None
    depth = 0
    end = -1
    for i in range(start, len(s)):
        if s[i] == "{":
            depth += 1
        elif s[i] == "}":
            depth -= 1
            if depth == 0:
                end = i + 1
                break
    if end == -1:
        return None
    try:
        return _json.loads(s[start:end])
    except Exception:
        return None


async def _call_decision_adapter(prompt: str, timeout_seconds: float) -> str | None:
    """Run the gemini_local adapter against `prompt`. Returns text on success
    or None on any failure (caller falls back to deterministic decision)."""
    try:
        from musu_core.adapters.registry import get_adapter
        from musu_core.adapters.base import AdapterContext
    except Exception as e:
        logger.debug("LLM decision: adapter import failed — %s", e)
        return None
    adapter = get_adapter("gemini_local")
    if adapter is None:
        return None
    ctx = AdapterContext(
        run_id=f"decision-{uuid.uuid4().hex[:8]}",
        prompt=prompt,
        agent_id="onboarding-decision",
        agent_name="onboarding-decision",
        agent_role="Decision",
        adapter_type="gemini_local",
        config={"model": "gemini-2.5-flash", "timeout_sec": int(timeout_seconds) + 5, "disable_mcp": True},
    )
    try:
        result = await asyncio.wait_for(adapter.execute(ctx), timeout=timeout_seconds)
    except asyncio.TimeoutError:
        logger.info("LLM decision: timed out after %ss", timeout_seconds)
        return None
    except Exception as e:
        logger.info("LLM decision: adapter error — %s", e)
        return None
    if not result.success:
        return None
    return result.summary or None


async def probe_adapter(adapter_type: str, timeout_seconds: float = 10.0) -> dict:
    """v15.2 — Quick health probe for an adapter. Used by onboarding Step 2.

    Returns {ok: bool, latency_ms: float?, reason: str}. Does a single
    "say ok" round-trip against the live adapter. Total wall-time is
    capped by timeout_seconds; a clean timeout produces a structured
    response rather than an exception.
    """
    try:
        from musu_core.adapters.registry import get_adapter
        from musu_core.adapters.base import AdapterContext
    except Exception as e:
        return {"ok": False, "reason": f"adapter module import failed: {e}"}

    adapter = get_adapter(adapter_type)
    if adapter is None:
        return {"ok": False, "reason": f"adapter '{adapter_type}' not installed"}

    ctx = AdapterContext(
        run_id=f"probe-{uuid.uuid4().hex[:8]}",
        prompt="Reply with one word: ok",
        agent_id="onboarding-probe",
        agent_name="onboarding-probe",
        agent_role="Probe",
        adapter_type=adapter_type,
        config={"timeout_sec": int(timeout_seconds), "disable_mcp": True},
    )
    start = time.monotonic()
    try:
        result = await asyncio.wait_for(adapter.execute(ctx), timeout=timeout_seconds)
    except asyncio.TimeoutError:
        return {
            "ok": False,
            "latency_ms": round((time.monotonic() - start) * 1000, 1),
            "reason": f"timeout ({timeout_seconds:.0f}s)",
        }
    except Exception as e:
        return {"ok": False, "reason": f"{type(e).__name__}: {str(e)[:80]}"}

    latency_ms = round((time.monotonic() - start) * 1000, 1)
    if not result.success:
        return {"ok": False, "latency_ms": latency_ms, "reason": (result.error or "adapter returned success=false")[:120]}
    summary = (result.summary or "").strip()
    return {"ok": True, "latency_ms": latency_ms, "reason": summary[:60]}


async def decide_template_for_mission_with_llm(
    mission: str,
    company_name: str,
    timeout_seconds: float = 8.0,
) -> dict:
    """v14.1 — LLM-driven version of `decide_template_for_mission`.

    Asks gemini for a JSON decision. Falls back to the deterministic
    token-overlap function on adapter unavailable / timeout / malformed JSON.
    """
    prompt = _LLM_DECISION_PROMPT.format(mission=mission, company_name=company_name)
    text = await _call_decision_adapter(prompt, timeout_seconds)
    parsed = _parse_llm_json(text) if text else None
    if parsed and parsed.get("decision") == "found":
        key = parsed.get("template")
        from company_templates import _TEMPLATES
        if isinstance(key, str) and key in _TEMPLATES:
            tmpl = _TEMPLATES[key]
            return {
                "decision": "found",
                "template": key,
                "score": 0.95,  # LLM-confident
                "reason": (parsed.get("reason") or "")[:280],
                "preview": {
                    "agents": [
                        {"name": a.get("name"), "role": a.get("role")}
                        for a in tmpl.get("agents", [])
                    ],
                },
            }
    if parsed and parsed.get("decision") == "research":
        task_id = start_research_task(mission=mission, company_name=company_name)
        return {
            "decision": "research",
            "research_task_id": task_id,
            "estimated_seconds": 60,
            "company_name": company_name,
            "reason": (parsed.get("reason") or "")[:280],
        }
    # Fallback — LLM unavailable or response unparseable.
    return decide_template_for_mission(mission, company_name)


# ── v12-onboarding D — research stub + template persistence ──────────────────

import time as _time  # local alias to keep top-of-file imports stable

# Module-level in-memory store. Wipes on bridge restart — acceptable for MVP.
_RESEARCH_TASKS: dict[str, dict] = {}
_RESEARCH_READY_AFTER_SECONDS = 5  # MVP: stub completes after 5s
_RESEARCH_TIMER_SECONDS = 30  # what we show the user


def _slugify(name: str) -> str:
    s = name.lower().strip()
    s = re.sub(r"[^a-z0-9]+", "-", s)
    s = re.sub(r"-+", "-", s).strip("-")
    return s or "company"


def _build_generic_startup_proposal(company_name: str) -> dict:
    """Return the MVP generic-startup proposal shape.

    Five departments across three phases. v13 will replace this with a real
    LLM-driven proposal; for now it gives the operator something concrete to
    approve and save as their first template.
    """
    slug = _slugify(company_name) + "-startup"
    return {
        "slug": slug,
        "displayName": f"{company_name} (generic startup)",
        "departments": [
            {"name": "CEO Office",  "role": "Lead",       "agentCount": 1, "phase": "day-1"},
            {"name": "Engineering", "role": "Engineer",   "agentCount": 2, "phase": "day-1"},
            {"name": "Marketing",   "role": "Marketing",  "agentCount": 1, "phase": "month-1+"},
            {"name": "Operations",  "role": "Ops",        "agentCount": 1, "phase": "month-1+"},
            {"name": "Research",    "role": "Researcher", "agentCount": 1, "phase": "month-3+"},
        ],
    }


def start_research_task(mission: str, company_name: str) -> str:
    """Start a (stubbed) research task. Returns a task id usable for polling."""
    task_id = f"task-{uuid.uuid4().hex[:8]}"
    _RESEARCH_TASKS[task_id] = {
        "id": task_id,
        "mission": mission,
        "company_name": company_name,
        "started_at": _time.time(),
        "estimated_seconds": _RESEARCH_TIMER_SECONDS,
        "status": "running",
    }
    return task_id


# v14.1 — Background LLM-design tasks keyed by research task id.
_RESEARCH_LLM_TASKS: dict[str, "asyncio.Task[None]"] = {}
_RESEARCH_LLM_TIMEOUT_SEC = 60


async def _run_llm_research(task_id: str, mission: str, company_name: str) -> None:
    """Ask gemini to design a 5-department org. On any failure, fall back to
    `_build_generic_startup_proposal` so the operator always sees something."""
    proposal: dict | None = None
    try:
        prompt = _LLM_RESEARCH_PROMPT.format(mission=mission, company_name=company_name)
        text = await _call_decision_adapter(prompt, timeout_seconds=_RESEARCH_LLM_TIMEOUT_SEC)
        candidate = _parse_llm_json(text) if text else None
        if (
            isinstance(candidate, dict)
            and isinstance(candidate.get("slug"), str)
            and isinstance(candidate.get("departments"), list)
            and len(candidate["departments"]) >= 1
        ):
            proposal = candidate
    except Exception as e:
        logger.info("LLM research: error — %s", e)

    if proposal is None:
        proposal = _build_generic_startup_proposal(company_name)

    task = _RESEARCH_TASKS.get(task_id)
    if task is not None:
        task["status"] = "ready"
        task["proposal"] = proposal


def get_research_task(task_id: str) -> dict | None:
    """Return current state of the research task, advancing it to 'ready' if
    the stub delay has elapsed. Returns None when the id is unknown.

    v14.1: on first poll, kick off an async LLM-design task. If the LLM is
    unavailable, the stub delay still triggers the generic-startup fallback.
    """
    task = _RESEARCH_TASKS.get(task_id)
    if not task:
        return None
    if task["status"] == "running":
        # Kick off the LLM design on first observation.
        if task_id not in _RESEARCH_LLM_TASKS:
            try:
                loop = asyncio.get_event_loop()
                _RESEARCH_LLM_TASKS[task_id] = loop.create_task(
                    _run_llm_research(task_id, task["mission"], task["company_name"])
                )
            except RuntimeError:
                # No running loop (e.g. unit test from sync context) — stub path only.
                pass
        # Stub fallback so the UI gets a result even without an event loop.
        elapsed = _time.time() - task["started_at"]
        if elapsed >= _RESEARCH_READY_AFTER_SECONDS and task["status"] == "running":
            task["status"] = "ready"
            task["proposal"] = _build_generic_startup_proposal(task["company_name"])
    return task


def seed_intro_messages(company_id: str, agents: list[dict], backend=None) -> int:
    """v12-onboarding E — Seed one stub introduction message per agent.

    Inserts into the `company-{company_id}` group so the canvas can show
    "life signs" within its next poll cycle, without waiting for a real
    LLM round-trip. Normal heartbeats take over from here.

    Returns the number of messages seeded.
    """
    import json as _json
    b = backend if backend is not None else _get_backend()
    group_id = f"company-{company_id}"
    count = 0
    for agent in agents:
        role = agent.get("role") or agent.get("name") or "Agent"
        name = agent.get("name") or "unknown"
        text = f"Hi — I'm {role}. Ready to start when you are."
        msg_id = str(uuid.uuid4())
        try:
            b._db.execute(
                "INSERT INTO messages (id, session_id, role, content, group_id, meta) "
                "VALUES (?, ?, 'system', ?, ?, ?)",
                (
                    msg_id,
                    f"group-{group_id}",
                    text,
                    group_id,
                    _json.dumps({"sender_id": name, "kind": "intro"}),
                ),
            )
            count += 1
        except Exception as e:
            logger.warning("seed_intro_messages: insert failed for %s — %s", name, e)
    return count


def save_proposed_template(slug: str, proposal: dict) -> Path:
    """Persist an approved proposal to ~/.musu/companies/_templates/<slug>.yaml.

    Creates parent directories if missing. Overwrites if the file already
    exists (operator approved a refinement of the same slug).
    """
    import yaml  # local import — only used here, keeps top-of-file lean
    templates_dir = Path.home() / ".musu" / "companies" / "_templates"
    templates_dir.mkdir(parents=True, exist_ok=True)
    path = templates_dir / f"{slug}.yaml"
    path.write_text(yaml.safe_dump(proposal, allow_unicode=True, sort_keys=False), encoding="utf-8")
    return path
