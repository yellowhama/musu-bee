"""Heartbeat schedulers for CEO, Team Lead, and Node Manager agents.

Extracted from server.py. Manages periodic agent heartbeat loops with
circuit breaker gating, diagnostic pre-checks, and per-company isolation.
"""
from __future__ import annotations

import asyncio
import logging
import os
import uuid

from channel_circuit_breaker import (
    CIRCUIT_TRIP_THRESHOLD,
    CIRCUIT_BACKOFF_BASE_SECONDS,
    CIRCUIT_WINDOW_MINUTES,
)
from metrics import _increment_stuck_counter
from handlers import route_chat, cancel_task_record

logger = logging.getLogger("musu.heartbeat")

# Serializes heartbeat iterations within a single process — prevents concurrent CEO tasks
# when the interval is shorter than agent response time.
_heartbeat_lock = asyncio.Lock()


def _get_heartbeat_backend():
    """Return the backend for heartbeat guard checks (thin wrapper for testability)."""
    from handlers import _get_backend
    return _get_backend()


def _should_skip_heartbeat(backend, channel: str = "ceo") -> tuple[bool, str]:
    """Circuit breaker for heartbeat. Returns (should_skip, reason).

    Fail-open: DB errors return (False, '') so heartbeat continues rather than
    silently stopping forever.
    """
    from datetime import datetime, timedelta, timezone

    try:
        rows = backend._db.execute(
            "SELECT id FROM route_executions WHERE channel = ? AND status = 'running' LIMIT 1",
            (channel,),
        )
        if rows:
            return True, "already running"

        cutoff = (datetime.now(timezone.utc) - timedelta(minutes=CIRCUIT_WINDOW_MINUTES)).isoformat()
        fail_rows = backend._db.execute(
            "SELECT status, COUNT(*) as cnt FROM route_executions "
            "WHERE channel = ? AND status IN ('failed', 'cancelled', 'zombie') AND created_at > ? "
            "GROUP BY status",
            (channel, cutoff),
        )
        fail_count = sum(r["cnt"] for r in fail_rows) if fail_rows else 0

        if fail_count >= CIRCUIT_TRIP_THRESHOLD:
            backoff = min(CIRCUIT_BACKOFF_BASE_SECONDS * (2 ** (fail_count - 1)), 1800)
            breakdown = ", ".join(f"{r['status']}={r['cnt']}" for r in fail_rows) if fail_rows else ""
            detail = f"{breakdown}, " if breakdown else ""
            return True, f"circuit open ({detail}{fail_count} recent failures, backoff={backoff}s)"

        return False, ""
    except Exception:
        return False, ""


def _has_running_ceo_task(backend, channel: str = "ceo") -> bool:
    should_skip, reason = _should_skip_heartbeat(backend, channel=channel)
    return should_skip and reason == "already running"


async def _heartbeat_iteration(
    agent_name: str,
    company_id: str | None,
    diag_summary: str,
    role: str = "ceo",
) -> None:
    """Single guarded heartbeat iteration. Lock held only for guard check, not LLM call."""
    # Guard check under lock — prevents concurrent starts for same channel
    async with _heartbeat_lock:
        try:
            backend = _get_heartbeat_backend()
        except Exception:
            backend = None

        if backend is not None:
            should_skip, reason = _should_skip_heartbeat(backend, channel=agent_name)
            if should_skip:
                if "circuit open" in reason:
                    logger.warning(
                        "heartbeat_scheduler: circuit open — skipping %s (%s)", agent_name, reason
                    )
                else:
                    logger.info(
                        "heartbeat_scheduler: skipping — %s (%s)", agent_name, reason
                    )
                return
    # Lock released — LLM call runs without blocking other schedulers
    logger.info("heartbeat_scheduler: invoking %s (role: %s)", agent_name, role)
    prompt_parts = []
    if diag_summary and role == "ceo":
        prompt_parts.append(
            f"## 진단 결과 (자동 감지)\n\n{diag_summary}\n\n"
            "위 이슈를 확인하고 필요 시 create_issue로 등록한 후, 개발 루프를 진행하라.\n\n---\n\n"
        )

    if role == "ceo":
        prompt_parts.append(
            "집사 루프 실행 (wiki/010):\n"
            "1. 시스템 점검: get_dashboard(), check_notifications(), read_board_messages('ceo-board')\n"
            "2. 문제 감지 → 선제 처리 (stuck task cancel, 에러 이슈 생성)\n"
            "3. 회사 확인: read_charter(), list_goals(), list_issues()\n"
            "4. Lead에게 위임 (직접 engineer 안 시킴): delegate_task(channel='{short}-Lead', ...)\n"
            "5. 브리핑 준비: 다음에 주인 오면 즉시 보고할 수 있게\n"
            "6. #ceo-board에 상태 공유\n\n"
            "## 위임 패턴 (fire-and-check) — 필수\n"
            "delegate_task 후 즉시 종료한다. task_id를 이슈 코멘트에 기록하고 heartbeat 종료.\n"
            "다음 heartbeat에서 get_task_status(task_id)로 완료 여부 확인.\n"
            "폴링 루프 금지: while True + sleep 루프 절대 실행 금지 — heartbeat timeout 초과 원인."
        )
    elif role == "team_lead":
        prompt_parts.append(
            "자율 팀장 루프 실행:\n"
            "1. get_task_status('assigned') — 본인에게 할당된 이슈/작업 확인\n"
            "2. 판단: 진행해야 할 작업이 있다면 엔지니어/QA에게 구체적 명세(Sprint Contract)와 함께 delegate_task 실행\n"
            "3. 진행 상황 확인: 하위 태스크의 상태를 폴링하지 말고, 다음 하트비트에서 확인\n"
            "4. 완료 보고: 하위 태스크가 완료되면 CEO가 할당한 원본 이슈/태스크에 코멘트로 결과 보고\n"
        )

    _hb_timeout = int(os.environ.get("MUSU_HEARTBEAT_TIMEOUT_SEC", "600"))
    _hb_exec_id = str(uuid.uuid4())
    _hb_backend = _get_heartbeat_backend()
    try:
        _hb_backend.create_route_execution(_hb_exec_id, agent_name, "system", "".join(prompt_parts), company_id=company_id)
        _hb_backend.update_route_execution(_hb_exec_id, "running")
    except Exception:
        _hb_exec_id = ""  # Proceed without durability if DB write fails

    try:
        await asyncio.wait_for(
            route_chat(
                channel=agent_name,
                sender_id="system",
                text="".join(prompt_parts),
                exec_id=_hb_exec_id or None,
                company_id=company_id,
            ),
            timeout=_hb_timeout,
        )
        logger.info("heartbeat_scheduler: %s done", agent_name)
    except asyncio.TimeoutError:
        if _hb_exec_id:
            cancel_task_record(_hb_exec_id, error=f"heartbeat_timeout after {_hb_timeout}s")
        _increment_stuck_counter(agent_name, "heartbeat_timeout")
        logger.warning(
            "heartbeat_scheduler: %s timed out after %ds",
            agent_name, _hb_timeout,
        )
    except Exception as exc:
        if _hb_exec_id:
            cancel_task_record(_hb_exec_id, error=f"heartbeat_error: {exc}")
        logger.warning("heartbeat_scheduler: %s error — %s", agent_name, exc)
        raise


_company_locks: dict[str, asyncio.Lock] = {}


def _get_company_lock(company_id: str) -> asyncio.Lock:
    """Per-company lock for heartbeat isolation."""
    if company_id not in _company_locks:
        _company_locks[company_id] = asyncio.Lock()
    return _company_locks[company_id]


async def _agent_heartbeat_scheduler() -> None:
    """Periodic heartbeat for the CEO agent.

    Two modes:
      - Single company: MUSU_CEO_COMPANY_ID set -> only that company
      - Multi-company: not set -> iterate all active companies

    Env:
        MUSU_CEO_HEARTBEAT_ENABLED  = "true"   — must be set to activate
        MUSU_CEO_HEARTBEAT_INTERVAL = seconds   — default 1800 (30 min)
        MUSU_CEO_AGENT_NAME         = name      — default "ceo"
        MUSU_CEO_COMPANY_ID         = id        — single company mode (optional)
    """
    interval = int(os.environ.get("MUSU_CEO_HEARTBEAT_INTERVAL", "1800"))
    _node = os.environ.get("MUSU_NODE_NAME", "local")
    agent_name = os.environ.get("MUSU_CEO_AGENT_NAME", f"{_node}-CEO")
    single_company_id = os.environ.get("MUSU_CEO_COMPANY_ID") or None

    mode = f"single={single_company_id}" if single_company_id else "multi-company"
    logger.info(
        "heartbeat_scheduler: started (interval=%ds, agent=%s, mode=%s)",
        interval, agent_name, mode,
    )
    await asyncio.sleep(60)

    _self_healing = os.environ.get("MUSU_SELF_HEALING_ENABLED", "true").lower() == "true"

    while True:
        # Determine which companies to heartbeat
        if single_company_id:
            company_ids = [single_company_id]
        else:
            try:
                from handlers import list_companies as _list_hb_co
                company_ids = [c["id"] for c in _list_hb_co() if c.get("status") == "active"]
            except Exception:
                company_ids = []

        if not company_ids:
            logger.info("heartbeat_scheduler: no active companies, sleeping")
            await asyncio.sleep(interval)
            continue

        # Run diagnostic once (not per company)
        diag_summary = ""
        if _self_healing:
            try:
                from diagnostics import PreHeartbeatDiagnostic
                from handlers import _get_backend as _diag_backend
                _ws_root = os.path.join(os.getcwd(), ".musu", "tasks")
                report = PreHeartbeatDiagnostic(workspace_root=_ws_root).run(_diag_backend())
                if report.needs_attention:
                    diag_summary = report.summary
                    logger.info("heartbeat_scheduler: diagnostic found issues:\n%s", diag_summary)
            except Exception as diag_exc:
                logger.warning("heartbeat_scheduler: diagnostic error — %s", diag_exc)

        # Heartbeat each company (sequential with per-company lock)
        for cid in company_ids:
            try:
                logger.info("heartbeat_scheduler: company %s", cid[:8])
                await _heartbeat_iteration(
                    agent_name=agent_name,
                    company_id=cid,
                    diag_summary=diag_summary,
                )
            except Exception as exc:
                logger.warning("heartbeat_scheduler: company %s error — %s", cid[:8], exc)

        await asyncio.sleep(interval)


async def _team_lead_heartbeat_scheduler() -> None:
    """Periodic heartbeat for Team Lead agents.

    Operates similarly to the CEO heartbeat but defaults to a faster cycle.
    Shares the _heartbeat_lock so it cannot run concurrently with the CEO,
    preventing SQLite 'database is locked' errors.
    """
    interval = int(os.environ.get("MUSU_TEAM_LEAD_HEARTBEAT_INTERVAL", "600"))
    agent_name = os.environ.get("MUSU_TEAM_LEAD_AGENT_NAME", "team_lead")
    single_company_id = os.environ.get("MUSU_TEAM_LEAD_COMPANY_ID") or None

    mode = f"single={single_company_id}" if single_company_id else "multi-company"
    logger.info(
        "team_lead_scheduler: started (interval=%ds, agent=%s, mode=%s)",
        interval, agent_name, mode,
    )
    await asyncio.sleep(30)

    while True:
        if single_company_id:
            company_ids = [single_company_id]
        else:
            try:
                from handlers import list_companies as _list_hb_co
                company_ids = [c["id"] for c in _list_hb_co() if c.get("status") == "active"]
            except Exception:
                company_ids = []

        if not company_ids:
            await asyncio.sleep(interval)
            continue

        for cid in company_ids:
            try:
                logger.info("team_lead_scheduler: company %s", cid[:8])
                await _heartbeat_iteration(
                    agent_name=agent_name,
                    company_id=cid,
                    diag_summary="",
                    role="team_lead",
                )
            except Exception as exc:
                logger.warning("team_lead_scheduler: company %s error — %s", cid[:8], exc)

        await asyncio.sleep(interval)


async def _node_manager_heartbeat() -> None:
    """Periodic stats report from the local node manager agent.

    Env:
        MUSU_NODE_HEARTBEAT_ENABLED  = "true"   — must be set to activate
        MUSU_NODE_HEARTBEAT_INTERVAL = seconds   — default 300 (5 min)
    """
    interval = int(os.environ.get("MUSU_NODE_HEARTBEAT_INTERVAL", "300"))
    from config import get_config
    _cfg = get_config()
    # Use mesh self_name so channel matches nodes.toml topology (not OS hostname)
    from mesh_router import get_mesh_router as _get_router
    _router = _get_router()
    mgr_name = f"mgr-{_router._self_name or _cfg.node_name}"

    logger.info(
        "node_heartbeat: started (interval=%ds, agent=%s)", interval, mgr_name
    )
    # Stagger: wait 90s so node manager agent is fully seeded before first ping.
    await asyncio.sleep(90)

    while True:
        _nm_exec_id = str(uuid.uuid4())
        _nm_text = "heartbeat: 현재 기기 상태 보고해줘"
        try:
            _nm_backend = _get_heartbeat_backend()
            _nm_backend.create_route_execution(_nm_exec_id, mgr_name, "system", _nm_text)
            _nm_backend.update_route_execution(_nm_exec_id, "running")
        except Exception:
            _nm_exec_id = ""

        try:
            logger.info("node_heartbeat: invoking %s", mgr_name)
            await route_chat(
                channel=mgr_name,
                sender_id="system",
                text=_nm_text,
                exec_id=_nm_exec_id or None,
            )
            logger.info("node_heartbeat: %s done", mgr_name)
        except Exception as exc:
            if _nm_exec_id:
                cancel_task_record(_nm_exec_id, error=f"node_heartbeat_error: {exc}")
            logger.warning("node_heartbeat: error — %s", exc)
        await asyncio.sleep(interval)


# ── Auto-distribution: CEO agent automatically routes unassigned tasks ────────

_auto_distribute_enabled = True


def _load_auto_distribute_config() -> dict:
    """Load auto-distribution policy from ~/.musu/auto_distribute.toml."""
    import tomllib
    from pathlib import Path
    path = Path.home() / ".musu" / "auto_distribute.toml"
    if not path.exists():
        return {"enabled": True, "max_concurrent": 3, "cooldown_minutes": 5}
    try:
        with open(path, "rb") as f:
            data = tomllib.load(f)
        return data.get("policy", {"enabled": True, "max_concurrent": 3, "cooldown_minutes": 5})
    except Exception:
        return {"enabled": True, "max_concurrent": 3, "cooldown_minutes": 5}


async def auto_distribute_loop(bridge_url: str = "http://localhost:8070") -> None:
    """Periodically check for unassigned tasks and route them to optimal nodes.

    Env:
        MUSU_AUTO_DISTRIBUTE_ENABLED = "true" — must be set to activate
        MUSU_AUTO_DISTRIBUTE_INTERVAL = seconds — default 300 (5 min)
    """
    import httpx

    interval = int(os.environ.get("MUSU_AUTO_DISTRIBUTE_INTERVAL", "300"))
    logger.info("auto_distribute: started (interval=%ds)", interval)
    await asyncio.sleep(120)  # Wait for agents to be ready

    async with httpx.AsyncClient(base_url=bridge_url, timeout=30.0) as http:
        while True:
            global _auto_distribute_enabled
            if not _auto_distribute_enabled:
                await asyncio.sleep(interval)
                continue

            policy = _load_auto_distribute_config()
            if not policy.get("enabled", True):
                await asyncio.sleep(interval)
                continue

            max_concurrent = policy.get("max_concurrent", 3)

            try:
                # Check running tasks count
                backend = _get_heartbeat_backend()
                running = backend._db.execute(
                    "SELECT COUNT(*) as cnt FROM route_executions WHERE status = 'running'"
                )
                running_count = running[0]["cnt"] if running else 0

                if running_count >= max_concurrent:
                    logger.debug("auto_distribute: %d tasks running (max %d) — skipping", running_count, max_concurrent)
                    await asyncio.sleep(interval)
                    continue

                # Find pending tasks that haven't been assigned
                pending = backend._db.execute(
                    "SELECT id, channel, input FROM route_executions "
                    "WHERE status = 'pending' ORDER BY created_at ASC LIMIT ?",
                    (max_concurrent - running_count,),
                )

                if not pending:
                    await asyncio.sleep(interval)
                    continue

                for task in pending:
                    try:
                        # Mark as dispatching to prevent duplicate dispatch on next iteration
                        backend._db.execute(
                            "UPDATE route_executions SET status = 'running' WHERE id = ? AND status = 'pending'",
                            (task["id"],),
                        )
                        resp = await http.post("/api/tasks/route", json={
                            "channel": task["channel"],
                            "instruction": task["input"],
                            "strategy": "recommended",
                            "sender_id": "auto_distribute",
                        })
                        if resp.status_code == 200:
                            logger.info(
                                "auto_distribute: routed task %s (channel=%s) → %s",
                                task["id"], task["channel"],
                                resp.json().get("node", "?"),
                            )
                    except Exception as exc:
                        logger.warning("auto_distribute: failed to route task %s — %s", task["id"], exc)

            except Exception as exc:
                logger.warning("auto_distribute: error — %s", exc)

            await asyncio.sleep(interval)


# ── Morning report cron — daily at 08:00 KST ────────────────────────────────


async def morning_report_cron(bridge_url: str = "http://localhost:8070") -> None:
    """Generate and post a morning report every day at 08:00 KST.

    Env:
        MUSU_MORNING_REPORT_ENABLED = "true" — must be set to activate
        MUSU_MORNING_REPORT_HOUR = 8  — hour in KST (default 8)
    """
    from datetime import datetime, timezone, timedelta
    import httpx

    kst = timezone(timedelta(hours=9))
    target_hour = int(os.environ.get("MUSU_MORNING_REPORT_HOUR", "8"))
    logger.info("morning_report_cron: started (target=%02d:00 KST)", target_hour)

    async with httpx.AsyncClient(base_url=bridge_url, timeout=30.0) as http:
        while True:
            now = datetime.now(kst)
            # Calculate seconds until next target hour
            target = now.replace(hour=target_hour, minute=0, second=0, microsecond=0)
            if now >= target:
                target += timedelta(days=1)
            wait_seconds = (target - now).total_seconds()
            logger.info("morning_report_cron: next report in %.0f seconds (%s)", wait_seconds, target.isoformat())
            await asyncio.sleep(wait_seconds)

            try:
                # Call dashboard for report data — use canonical company from env
                _company_id = os.environ.get("PAPERCLIP_COMPANY_ID", "")
                _dash_path = f"/api/companies/{_company_id}/dashboard" if _company_id else "/health"
                resp = await http.get(_dash_path)
                dashboard = resp.json() if resp.status_code == 200 else {}

                costs_resp = await http.get("/api/costs/summary")
                costs = costs_resp.json() if costs_resp.status_code == 200 else {}

                nodes = dashboard.get("nodes", [])
                tasks = dashboard.get("tasks", {})

                # Build report
                lines = [
                    f"# 🐝 MUSU Morning Report — {datetime.now(kst).strftime('%Y-%m-%d %H:%M KST')}",
                    "",
                    "## Devices",
                ]
                for n in nodes:
                    icon = "🟢" if n.get("status") in ("online", "self") else "🔴"
                    lines.append(f"- {icon} **{n.get('name')}** — {n.get('status')} | agents: {', '.join(n.get('agents', []))}")
                lines.extend([
                    "",
                    "## Tasks",
                    f"- Pending: {tasks.get('pending', 0)}, Running: {tasks.get('running', 0)}, Done: {tasks.get('done', 0)}, Failed: {tasks.get('failed', 0)}",
                    "",
                    "## Costs",
                    f"- Total: ${costs.get('total_cost_usd', 0):.4f}" if isinstance(costs.get('total_cost_usd'), (int, float)) else f"- {costs}",
                ])
                report = "\n".join(lines)

                # Post as board message
                await http.post("/api/groups/general/messages", json={
                    "sender_id": "morning_report",
                    "text": report,
                })
                logger.info("morning_report_cron: report posted")
            except Exception as exc:
                logger.warning("morning_report_cron: error — %s", exc)
