"""ScheduledProcessAdapter — replaces hardcoded RemoteProcessAdapter URL.

Flow:
  1. Build ResourceRequest from ctx.config.requires + agent
  2. INSERT into resource_requests as pending
  3. Await binding: poll resource_requests.bound_machine_id (with
     optional WatchDispatcher subscription for fast wake)
  4. Look up bound machine's bridge URL from ctx.config.machine_urls
  5. POST /execute/process to that bridge (same as RemoteProcessAdapter)

Config keys (in agents.adapter_config):
    requires       dict        resource requirements (gpu_vram_gb, cpu_cores, mem_gb, runtime_class)
    affinity       dict        optional {prefer_machine, avoid_machine}
    priority       int         optional priority (default 0)
    machine_urls   dict        {machine_id: worker_url}
    worker_token   str         optional bearer token (same for all machines)
    command        str         executable to run
    args           list[str]   args
    cwd            str         optional
    timeout_sec    int         per-execution timeout (default 600)
    env            dict        env passthrough
    bind_timeout_sec int       how long to wait for binder (default 60)

If bind_timeout_sec elapses without a binding, returns AdapterResult
with success=False and error="scheduler binding timeout". The CEO
controller (21.E) decides whether to retry.
"""
from __future__ import annotations

import asyncio
import time
from typing import Any

import httpx

from musu_core.adapters.base import AdapterContext, AdapterResult, BaseAdapter
from musu_core.db import get_db
from musu_core.scheduler.request import (
    Affinity,
    Requires,
    ResourceRequest,
)


def _try_transition_to_running(db: Any, request_id: str) -> bool:
    """Guarded 'bound' → 'running' transition. Returns True if the
    row was in 'bound' and is now 'running'. False if the row had
    moved to another state under us (cancelled / completed / missing).
    """
    conn = db._get_conn()
    with db._lock:
        cur = conn.cursor()
        try:
            cur.execute(
                "UPDATE resource_requests SET status='running', "
                "updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') "
                "WHERE id=? AND status='bound'",
                (request_id,),
            )
            changed = cur.rowcount
            conn.commit()
            return changed > 0
        except Exception:
            conn.rollback()
            raise
        finally:
            cur.close()


class ScheduledProcessAdapter(BaseAdapter):
    """Post a ResourceRequest, await scheduler binding, then call the bound bridge."""

    @property
    def adapter_type(self) -> str:
        return "scheduled_process"

    async def execute(self, ctx: AdapterContext) -> AdapterResult:
        cfg = ctx.config

        # Validate minimum config
        machine_urls: dict[str, str] = cfg.get("machine_urls", {})
        if not machine_urls:
            return AdapterResult(
                run_id=ctx.run_id, success=False, summary="",
                error="scheduled_process requires 'machine_urls' map in adapter_config",
            )

        command: str = cfg.get("command", "")
        if not command:
            return AdapterResult(
                run_id=ctx.run_id, success=False, summary="",
                error="scheduled_process requires 'command' in adapter_config",
            )

        requires = Requires.from_dict(cfg.get("requires", {}))
        affinity = Affinity.from_dict(cfg.get("affinity", {}))
        priority = int(cfg.get("priority", 0))
        bind_timeout = int(cfg.get("bind_timeout_sec", 60))

        # 1+2. Post pending request
        db = get_db(cfg.get("db_path") or "")
        request = ResourceRequest.new(
            agent_id=ctx.agent_id,
            requires=requires,
            affinity=affinity,
            company_id=cfg.get("company_id"),
            priority=priority,
        )
        await asyncio.to_thread(request.insert, db)

        # 3. Await binding (poll every 200ms)
        deadline = time.monotonic() + bind_timeout
        bound_machine_id: str | None = None
        while time.monotonic() < deadline:
            rows = await asyncio.to_thread(
                db.execute,
                "SELECT bound_machine_id, status FROM resource_requests WHERE id=?",
                (request.id,),
            )
            if not rows:
                # row disappeared — treat as cancellation
                return AdapterResult(
                    run_id=ctx.run_id, success=False, summary="",
                    error="scheduled_process: request row disappeared",
                )
            mid = rows[0]["bound_machine_id"]
            if mid:
                bound_machine_id = mid
                break
            await asyncio.sleep(0.2)

        if bound_machine_id is None:
            # Cancel the request so scheduler stops trying. The WHERE
            # status='pending' guard means this no-ops if the binder
            # raced us between the last poll and this UPDATE. Re-read
            # after to detect that race — if a machine got bound,
            # honor it instead of leaking the slot with a stale
            # "timeout" error + an orphan 'bound' row.
            await asyncio.to_thread(
                db.execute,
                "UPDATE resource_requests SET status='cancelled', "
                "updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') "
                "WHERE id=? AND status='pending'",
                (request.id,),
            )
            recheck = await asyncio.to_thread(
                db.execute,
                "SELECT bound_machine_id, status "
                "FROM resource_requests WHERE id=?",
                (request.id,),
            )
            if recheck and recheck[0]["bound_machine_id"]:
                bound_machine_id = recheck[0]["bound_machine_id"]
                # fall through — proceed with the dispatch.
            else:
                return AdapterResult(
                    run_id=ctx.run_id, success=False, summary="",
                    error=f"scheduler binding timeout after {bind_timeout}s",
                )

        worker_url = machine_urls.get(bound_machine_id)
        if not worker_url:
            return AdapterResult(
                run_id=ctx.run_id, success=False, summary="",
                error=(
                    f"scheduler bound to machine {bound_machine_id} "
                    f"but no URL in machine_urls map"
                ),
            )

        # 4+5. Same as RemoteProcessAdapter
        worker_token: str | None = cfg.get("worker_token")
        args: list[str] = cfg.get("args", [])
        cwd: str | None = ctx.cwd or cfg.get("cwd")
        timeout_sec: int = int(cfg.get("timeout_sec", 600))
        env_extra: dict[str, str] = cfg.get("env", {})

        headers: dict[str, str] = {"Content-Type": "application/json"}
        if worker_token:
            headers["Authorization"] = f"Bearer {worker_token}"

        payload: dict[str, Any] = {
            "command": command,
            "args": args,
            "timeout_sec": timeout_sec,
        }
        if cwd:
            payload["cwd"] = cwd
        if env_extra:
            payload["env"] = env_extra

        # Mark request running — must succeed, else the row was
        # cancelled/completed/never-bound under us. Don't dispatch
        # work for a row we don't own.
        transitioned = await asyncio.to_thread(
            _try_transition_to_running, db, request.id,
        )
        if not transitioned:
            recheck = await asyncio.to_thread(
                db.execute,
                "SELECT status FROM resource_requests WHERE id=?",
                (request.id,),
            )
            current = recheck[0]["status"] if recheck else "missing"
            return AdapterResult(
                run_id=ctx.run_id, success=False, summary="",
                error=(
                    f"scheduled_process: cannot enter 'running' "
                    f"(current status={current})"
                ),
            )

        try:
            async with httpx.AsyncClient(timeout=timeout_sec + 10) as client:
                resp = await client.post(
                    f"{worker_url.rstrip('/')}/execute/process",
                    json=payload,
                    headers=headers,
                )
        except httpx.ConnectError as exc:
            await self._mark_complete(db, request.id, ok=False, err=str(exc))
            return AdapterResult(
                run_id=ctx.run_id, success=False, summary="",
                error=f"Cannot connect to worker at {worker_url}: {exc}",
            )
        except httpx.TimeoutException:
            await self._mark_complete(db, request.id, ok=False, err="timeout")
            return AdapterResult(
                run_id=ctx.run_id, success=False, summary="",
                error=f"HTTP timeout connecting to worker at {worker_url}",
            )

        if resp.status_code not in (200, 201):
            await self._mark_complete(
                db, request.id, ok=False,
                err=f"HTTP {resp.status_code}",
            )
            return AdapterResult(
                run_id=ctx.run_id, success=False, summary="",
                error=f"Worker returned HTTP {resp.status_code}: {resp.text[:200]}",
                raw={"status_code": resp.status_code},
            )

        try:
            data = resp.json()
        except Exception:
            await self._mark_complete(db, request.id, ok=False, err="non-JSON")
            return AdapterResult(
                run_id=ctx.run_id, success=False, summary="",
                error="Worker returned non-JSON response",
                raw={"body_snippet": resp.text[:200]},
            )

        exit_code: int = data.get("exit_code", -1)
        stdout: str = data.get("stdout", "")
        stderr: str = data.get("stderr", "")
        success: bool = bool(data.get("success", exit_code == 0))

        await self._mark_complete(
            db, request.id, ok=success,
            err=(stderr.strip().splitlines()[0] if (not success and stderr.strip()) else None),
        )

        error: str | None = None
        if not success:
            if stderr.strip():
                error = stderr.strip().splitlines()[0]
            else:
                error = f"Process exited with code {exit_code}"

        return AdapterResult(
            run_id=ctx.run_id, success=success, summary=stdout.strip(),
            error=error,
            raw={
                "exit_code": exit_code,
                "stderr_snippet": stderr[:200],
                "machine_id": bound_machine_id,
                "request_id": request.id,
            },
        )

    @staticmethod
    async def _mark_complete(
        db, request_id: str, ok: bool, err: str | None,
    ) -> None:
        status = "completed" if ok else "failed"
        await asyncio.to_thread(
            db.execute,
            "UPDATE resource_requests SET status=?, "
            "completed_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'), "
            "error=?, updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') "
            "WHERE id=?",
            (status, err, request_id),
        )
