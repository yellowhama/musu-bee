"""CEOReconciler — Company-axis reconciler (frame v9 §3).

Watches: `companies` rows.
Reconcile pass:
    1. Load company row by req.key.
    2. List active agents scoped to this company (agents.company_id =
       req.key AND status='active').
    3. For each agent that has no in-flight ResourceRequest, post a
       new pending request. The scheduler (21.C SchedulerReconciler)
       picks it up and binds it to a machine.

"In-flight" means the agent already has a resource_requests row with
status IN ('pending','bound','running'). We never queue a second
request while one is active — agents are single-track.

Errors do NOT raise to the workqueue; we return ReconcileResult with
.error set so 21.A's rate-limited retry kicks in.

This is the smallest useful CEO behavior. Future 21.x phases add:
    - budget enforcement (agents.budget_usd_spent vs _monthly)
    - goal-driven task generation from sprint_contracts
    - cross-agent dependency ordering
"""
from __future__ import annotations

import asyncio
import json
import logging
from typing import Any

from musu_core.controllers.reconciler import (
    Reconciler,
    ReconcileRequest,
    ReconcileResult,
)
from musu_core.scheduler.request import (
    Affinity,
    Requires,
    ResourceRequest,
)

logger = logging.getLogger(__name__)


class CEOReconciler(Reconciler):
    """One instance per ControllerManager; keyed reconciles by company id."""

    def __init__(self, db: Any) -> None:
        self._db = db

    @property
    def name(self) -> str:
        return "CEOReconciler"

    async def reconcile(self, req: ReconcileRequest) -> ReconcileResult:
        # 1. Load company
        rows = await asyncio.to_thread(
            self._db.execute,
            "SELECT id, name, status FROM companies WHERE id=?",
            (req.key,),
        )
        if not rows:
            return ReconcileResult()  # gone — forget
        company = rows[0]

        # 2. Load active agents in this company
        agents = await asyncio.to_thread(
            self._db.execute,
            "SELECT id, name, adapter_config, isolation_profile "
            "FROM agents "
            "WHERE company_id=? AND status='active'",
            (req.key,),
        )
        if not agents:
            return ReconcileResult()  # idle company — nothing to do

        # 3. For each agent: post a request if none in flight.
        posted = 0
        for agent in agents:
            inflight = await asyncio.to_thread(
                self._db.execute,
                "SELECT COUNT(*) AS n FROM resource_requests "
                "WHERE agent_id=? AND status IN ('pending','bound','running')",
                (agent["id"],),
            )
            if inflight[0]["n"] > 0:
                continue

            requires = _requires_from_agent(agent)
            request = ResourceRequest.new(
                agent_id=agent["id"],
                requires=requires,
                affinity=Affinity(),
                company_id=company["id"],
                priority=0,
            )
            try:
                await asyncio.to_thread(request.insert, self._db)
                posted += 1
            except (ValueError, KeyError) as exc:
                logger.warning(
                    "CEO[%s]: failed to post request for agent=%s: %s",
                    company["id"], agent["id"], exc,
                )
                return ReconcileResult(error=exc)

        if posted:
            logger.info(
                "CEO[%s]: posted %d new resource_requests "
                "(company=%s)", company["id"], posted, company["name"],
            )
        return ReconcileResult()


def _requires_from_agent(agent_row: Any) -> Requires:
    """Extract resource requirements from agent.adapter_config.

    Convention: adapter_config.requires (a JSON object) holds the
    same shape as Requires.from_dict expects. Missing or invalid
    JSON yields a default-empty Requires (any machine satisfies it).
    """
    raw = agent_row["adapter_config"] or "{}"
    try:
        cfg = json.loads(raw)
    except (TypeError, ValueError):
        return Requires()
    if not isinstance(cfg, dict):
        return Requires()
    requires_dict = cfg.get("requires", {})
    if not isinstance(requires_dict, dict):
        return Requires()
    return Requires.from_dict(requires_dict)
