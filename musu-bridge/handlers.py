"""musu-bridge handlers — route messages through musu-core."""
from __future__ import annotations

import asyncio
import ipaddress
import logging
import os
import re
import sys
import uuid
from pathlib import Path
from typing import Any

# ── Task instruction validation ────────────────────────────────────────────────
# Reference: wiki/agent-task-reliability §3 — CrewAI expected_output pattern.
# Prevents watchdog kills caused by vague dispatch instructions.

_VAGUE_VERBS = re.compile(r'\b(implement|fix|do|handle|make|update|add)\b', re.I)
_SPECIFICITY_SIGNALS = re.compile(
    r'(\.py|\.ts|\.rs|\.json|function|class|endpoint|table|column|test|assert|should|must|pytest|def )',
    re.I,
)


def validate_task_instruction(instruction: str) -> str | None:
    """Return an error string if instruction is too vague to dispatch, else None.

    Rules (from wiki/agent-task-reliability §3):
    1. Must be >= 50 chars (too short = not actionable)
    2. If it contains a vague verb without a specificity signal, reject.
    """
    text = instruction.strip()
    if len(text) < 50:
        return f"Instruction too short ({len(text)} chars, minimum 50). Add: what specifically to do, in what file/function."
    if _VAGUE_VERBS.search(text) and not _SPECIFICITY_SIGNALS.search(text):
        return (
            "Instruction uses a general verb (implement/fix/do/handle/make/update/add) "
            "without a specific target. Add a file path, function name, or test command."
        )
    return None

# Lazy import to avoid circular dependency at module load time
def _get_request_id() -> str | None:
    try:
        from server import _request_id_var
        return _request_id_var.get(None)
    except ImportError:
        return None

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
    "engineer": 300.0,
    "ceo": 120.0,
    "team_lead": 90.0,
    "4060-CEO": 600.0,
    "lead": 300.0,
}


def _route_timeout_sec(channel: str = "") -> float:
    """Return route timeout in seconds for the given channel.

    Priority: MUSU_ROUTE_TIMEOUT_SEC_{CHANNEL} > channel default > MUSU_ROUTE_TIMEOUT_SEC > 180s.
    """
    if channel:
        env_key = f"MUSU_ROUTE_TIMEOUT_SEC_{channel.upper()}"
        channel_override = os.environ.get(env_key)
        if channel_override:
            return float(channel_override)
        if channel in _CHANNEL_TIMEOUT_DEFAULTS:
            return _CHANNEL_TIMEOUT_DEFAULTS[channel]
    return float(os.environ.get("MUSU_ROUTE_TIMEOUT_SEC", "180"))


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

    if exec_id is None:
        exec_id = str(uuid.uuid4())
        try:
            backend.create_route_execution(exec_id, channel, sender_id, text, company_id=company_id or _CANONICAL_COMPANY_ID)
            backend.update_route_execution(exec_id, "running")
        except Exception:
            logger.warning("route_chat: failed to create durability record — continuing")
            exec_id = ""  # Non-fatal: proceed without durability
    # else: record already created by caller (e.g. delegate endpoint)

    def _finish(result: dict[str, Any], node: str | None = None) -> dict[str, Any]:
        """Mark execution done/failed and return result (with cost if available)."""
        duration = time.time() - start_time
        rid = _get_request_id()
        if exec_id:
            try:
                cost_usd = result.get("cost_usd")
                input_tokens = result.get("input_tokens")
                output_tokens = result.get("output_tokens")
                adapter_type = result.get("adapter_type")
                if result.get("error"):
                    backend.update_route_execution(exec_id, "failed", error=result["error"], node=node,
                                                   cost_usd=cost_usd, input_tokens=input_tokens, output_tokens=output_tokens,
                                                   duration_sec=duration)
                    logger.warning("route_chat: failed channel=%r exec_id=%s duration=%.3fs request_id=%s error=%r",
                                   channel, exec_id, duration, rid, result["error"])
                    # Record failure in per-channel circuit breaker
                    try:
                        from server import _channel_cb
                        _channel_cb.record_failure(channel)
                        if _channel_cb.is_open(channel):
                            logger.warning("channel_cb: circuit open for channel=%r", channel)
                    except Exception:
                        pass
                else:
                    backend.update_route_execution(exec_id, "done", output=result.get("response"), node=node,
                                                   cost_usd=cost_usd, input_tokens=input_tokens, output_tokens=output_tokens,
                                                   duration_sec=duration)
                    logger.info("route_chat: done channel=%r exec_id=%s duration=%.3fs request_id=%s adapter=%r",
                                channel, exec_id, duration, rid, result.get("adapter_type"))
            except Exception:
                pass
        result["duration_sec"] = duration
        return result

    # ── Mesh routing: forward to remote node if assigned ──────────────────────
    mesh = get_mesh_router()
    if mesh.enabled and mesh.is_remote(channel):
        node = mesh.node_for_agent(channel)
        url = mesh.url_for_node(node)  # type: ignore[arg-type]
        if url:
            if not await mesh.is_node_healthy(node):  # type: ignore[arg-type]
                logger.warning(
                    "mesh_router: node=%r unhealthy — falling back to local for channel=%r",
                    node, channel,
                )
                # Fall through to local handler below
            else:
                logger.info("mesh_router: forwarding channel=%r to node=%r url=%r", channel, node, url)
                return _finish(await mesh.forward(url, channel, sender_id, text, adapter_override=adapter_override), node=node)
        else:
            logger.warning("mesh_router: no URL for node=%r, falling through to local", node)

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

    _router = Router(backend=backend, config=get_core_config())

    async def _activity_heartbeat(eid: str, interval: float = 30.0) -> None:
        """Periodically touch last_activity_at so watchdog won't kill active LLM calls."""
        try:
            while True:
                await asyncio.sleep(interval)
                try:
                    backend.touch_route_execution_activity(eid)
                except Exception:
                    pass
        except asyncio.CancelledError:
            pass

    _heartbeat_task = asyncio.ensure_future(_activity_heartbeat(exec_id)) if exec_id else None
    # Touch once immediately so last_activity_at is set from the start of the LLM call
    if exec_id:
        try:
            backend.touch_route_execution_activity(exec_id)
        except Exception:
            pass

    try:
        import anyio
        with anyio.fail_after(_route_timeout_sec(channel)):
            route_result = await _router.route(RouteRequest(
                agent_id=agent_id,
                prompt=text.strip(),
                task_id=task_id,
                adapter_override=adapter_override,
                cost_optimized=cost_optimized,
            ))
    except TimeoutError:
        if _heartbeat_task:
            _heartbeat_task.cancel()
        _timeout = _route_timeout_sec(channel)
        logger.warning("route_chat: route_timeout — LLM call exceeded %.0fs for channel=%r", _timeout, channel)
        return _finish({"error": f"route_timeout: LLM call exceeded {_timeout:.0f}s limit", "response": None})
    except Exception as exc:
        if _heartbeat_task:
            _heartbeat_task.cancel()
        logger.exception("route_chat: unexpected error — %s", exc)
        return _finish({"error": "Internal error. Please try again.", "response": None})
    finally:
        if _heartbeat_task:
            _heartbeat_task.cancel()

    if not route_result.success:
        logger.error("route_chat: adapter failure — %s", route_result.error)
        return _finish({"error": "Agent unavailable. Please try again later.", "response": None})

    backend.add_comment(task_id=task_id, body=route_result.summary, author_agent_id=agent_id, author_kind="agent")

    usage = route_result.adapter_result.usage if route_result.adapter_result else None
    return _finish({
        "response": route_result.summary,
        "agent_id": agent_id,
        "agent_name": agent_name,
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
        engineer_agent_id=engineer["id"],
        qa_agent_id=qa_agent["id"],
        max_iterations=max_iter,
    )

    # task_id here is a route_executions.id, NOT a tasks.id — passing it to loop.run()
    # would cause execution_log (which FK-references tasks.id) to fail.  Pass None so
    # inner router calls don't try to link execution_log rows to a non-existent tasks row.
    result = await loop.run(task_prompt=text, contract=contract, task_id=None)

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

    logger.info("route_chat_with_qa_loop: task=%s %s", task_id, summary)

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
        backend.update_route_execution(task_id, "failed", error=summary)

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
) -> dict[str, Any] | None:
    """Update editable agent fields (role, model, adapter_config). Returns updated agent dict or None if not found.

    `model` is stored inside adapter_config — this helper merges the new value
    without touching any other adapter_config keys.
    `adapter_config_patch` is shallow-merged into the existing adapter_config.
    """
    if role is None and model is None and adapter_config_patch is None:
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
        return backend.update_agent(agent_id, role=role, adapter_config=new_config)
    return backend.update_agent(agent_id, role=role)


# --- Issues ---


def create_issue_record(
    company_id: str,
    title: str,
    description: str = "",
    status: str = "open",
    priority: str = "medium",
    assignee_id: str | None = None,
) -> dict[str, Any]:
    """Create a new issue for a company."""
    backend = _get_backend()
    return backend.create_issue(
        company_id=company_id,
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
    limit: int = 100,
) -> list[dict[str, Any]]:
    """List issues for a company."""
    backend = _get_backend()
    return backend.list_issues(company_id=company_id, status=status, assignee_id=assignee_id, limit=limit)


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
    # Add company-scoped agents not in static map
    if company_id:
        for agent in backend.list_agents(company_id=company_id):
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


def list_task_records(
    status: str | None = None,
    limit: int = 50,
    before_id: str | None = None,
    channel: str | None = None,
) -> list[dict[str, Any]]:
    """List route executions with summary field for each record."""
    backend = _get_backend()
    records = backend.list_route_executions(
        status=status, limit=limit, before_id=before_id, channel=channel
    )
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
    # store purpose + status in the v13 columns
    company = b.update_company(company["id"], purpose=purpose, status="active")
    company_id = company["id"]

    # Short prefix for agent names: first 8 chars of company_id
    short = company_id[:8]

    created_agents = []
    for tmpl_agent in tmpl["agents"]:
        rendered = render_agent_instructions(
            tmpl_agent, name, purpose, work_dir=work_dir, test_cmd=test_cmd
        )
        config: dict[str, Any] = {
            "command": "claude",
            "model": "claude-sonnet-4-6",
            "dangerously_skip_permissions": True,
            "timeout_sec": 600,
            "instructions": rendered["instructions"],
        }
        # Use instructions_path if provided (e.g., team_lead.md)
        if rendered.get("instructions_path"):
            config["instructions_path"] = rendered["instructions_path"]
        agent = b.create_agent(
            name=f"{short}-{rendered['name']}",
            role=rendered["role"],
            adapter_type=rendered["adapter_type"],
            adapter_config=config,
            company_id=company_id,
        )
        created_agents.append(agent)

    # ── Auto-setup workspace: create dir + indexer profile ──────────────────
    if work_dir:
        _setup_company_workspace(work_dir, name, company_id)

    return {"company": company, "agents": created_agents}


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
            card_resp = await client.get(f"{remote_base}/.well-known/agent.json")
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
        nodes.append({
            "name": node_name,
            "url": node_url,
            "status": status,
            "is_self": is_self,
            "agents": mesh._node_agents.get(node_name, []),
        })
    return nodes


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
