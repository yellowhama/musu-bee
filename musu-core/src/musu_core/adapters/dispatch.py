"""Parallel asyncio dispatch for multiple RouteRequests.

Usage:
    from musu_core.adapters.dispatch import dispatch_parallel
    from musu_core.router import RouteRequest, make_router

    router = make_router()
    results = await dispatch_parallel(router, [
        RouteRequest(agent_id="ceo-id",      prompt="summarise sprint"),
        RouteRequest(agent_id="engineer-id", prompt="run cargo build"),
    ])
    for r in results:
        print(r.agent_id, r.success, r.summary[:80])
"""

from __future__ import annotations

import asyncio
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from musu_core.router import RouteRequest, RouteResult, Router


async def dispatch_parallel(
    router: "Router",
    requests: list["RouteRequest"],
) -> list["RouteResult"]:
    """Execute multiple RouteRequests concurrently via asyncio.gather.

    Results are returned in the same order as *requests*.  Individual
    failures are captured inside RouteResult (success=False) rather than
    raising, so callers can inspect each outcome independently.
    """
    if not requests:
        return []

    coroutines = [router.route(req) for req in requests]
    raw = await asyncio.gather(*coroutines, return_exceptions=True)

    # Import here to avoid a circular import at module load time.
    from musu_core.router import RouteResult  # noqa: PLC0415

    out: list[RouteResult] = []
    for req, res in zip(requests, raw):
        if isinstance(res, BaseException):
            out.append(
                RouteResult(
                    run_id="",
                    agent_id=req.agent_id,
                    success=False,
                    summary="",
                    error=f"Dispatch exception: {res}",
                )
            )
        else:
            out.append(res)  # type: ignore[arg-type]
    return out
