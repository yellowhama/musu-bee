"""Ralph Loop — autonomous iteration engine for MUSU companies.

Inspired by github.com/snarktank/ralph. Each iteration:
1. Fresh context (new route_chat call, no accumulated state)
2. Pick highest-priority open issue
3. Delegate to team_lead → Engineer → QA
4. Record learnings to progress wiki page
5. Close issue if QA passes
6. Repeat until all issues done or max_iterations

Memory lives in: git commits, issue comments, progress wiki page.
Context dies between iterations (the whole point).
"""
from __future__ import annotations

import asyncio
import logging
import uuid
from datetime import datetime, timezone
from typing import Any

logger = logging.getLogger("musu.ralph")

# Active loops: company_id → loop state
_active_loops: dict[str, dict] = {}


async def ralph_loop(
    company_id: str,
    max_iterations: int = 20,
    channel: str = "team_lead",
    cooldown_sec: int = 10,
) -> dict[str, Any]:
    """Run the Ralph Loop for a company until all issues are done.

    Args:
        company_id: Target company
        max_iterations: Safety limit (default 20)
        channel: Agent channel to delegate to (default team_lead)
        cooldown_sec: Pause between iterations (prevent thrashing)

    Returns:
        {"status": "complete"|"max_iterations"|"cancelled", "iterations": N, "closed": [...]}
    """
    from handlers import route_chat, _get_backend

    loop_id = str(uuid.uuid4())[:8]
    _active_loops[company_id] = {
        "loop_id": loop_id,
        "status": "running",
        "iteration": 0,
        "max_iterations": max_iterations,
        "closed_issues": [],
        "started_at": datetime.now(timezone.utc).isoformat(),
    }

    logger.info("ralph_loop: START company=%s max=%d channel=%s loop_id=%s",
                company_id, max_iterations, channel, loop_id)

    backend = _get_backend()
    closed_issues: list[str] = []
    consecutive_failures = 0
    MAX_CONSECUTIVE_FAILURES = 3

    try:
        for i in range(max_iterations):
            # Check cancellation
            state = _active_loops.get(company_id)
            if not state or state.get("status") == "cancelled":
                logger.info("ralph_loop: CANCELLED at iteration %d", i)
                return {"status": "cancelled", "iterations": i, "closed": closed_issues}

            state["iteration"] = i + 1

            # 1. Get remaining open issues
            issues = backend.list_issues(company_id=company_id, status="open", limit=50)
            if not issues:
                logger.info("ralph_loop: COMPLETE — all issues closed after %d iterations", i)
                state["status"] = "complete"
                return {"status": "complete", "iterations": i, "closed": closed_issues}

            # 2. Pick highest priority (first one — already sorted by priority)
            issue = issues[0]
            issue_id = issue["id"]
            issue_title = issue.get("title", "untitled")

            logger.info("ralph_loop: iteration %d/%d — issue=%s title=%r",
                        i + 1, max_iterations, issue_id[:8], issue_title)

            # 3. Build fresh prompt (no accumulated context — Ralph's core principle)
            prompt = (
                f"## Ralph Loop Iteration {i + 1}/{max_iterations}\n\n"
                f"처리할 이슈: **{issue_title}**\n"
                f"ID: {issue_id}\n"
                f"설명: {issue.get('description', '(없음)')}\n\n"
                f"### 지시\n"
                f"1. 이 이슈를 해결하라\n"
                f"2. 코드 변경이 필요하면 Engineer에게 delegate_task\n"
                f"3. 완료되면 이슈에 코멘트로 결과 기록\n"
                f"4. update_issue('{issue_id}', status='closed') 호출\n\n"
                f"⚠ 이 iteration은 fresh context다. 이전 iteration의 결과는 git과 이슈 코멘트에만 있다."
            )

            # 4. Delegate (fresh route_chat = fresh AI instance)
            result = await route_chat(
                channel=channel,
                sender_id=f"ralph-{loop_id}",
                text=prompt,
                company_id=company_id,
            )

            # 5. Record progress
            progress_entry = (
                f"## Iteration {i + 1}\n"
                f"- Issue: {issue_title} ({issue_id[:8]})\n"
                f"- Result: {result.get('response', result.get('error', 'no output'))[:200]}\n"
                f"- Time: {datetime.now(timezone.utc).isoformat()}\n"
            )
            # Append to progress wiki (best effort)
            try:
                _append_progress(backend, company_id, progress_entry)
            except Exception:
                pass

            # 6. Check if issue was closed by the agent
            updated_issue = backend.get_issue(issue_id) if hasattr(backend, 'get_issue') else None
            if updated_issue and updated_issue.get("status") in ("closed", "resolved", "done"):
                closed_issues.append(issue_id)
                consecutive_failures = 0
                logger.info("ralph_loop: issue %s closed by agent", issue_id[:8])
            elif result.get("error"):
                consecutive_failures += 1
                logger.warning("ralph_loop: iteration %d failed (%d/%d) — %s",
                               i + 1, consecutive_failures, MAX_CONSECUTIVE_FAILURES, result["error"][:100])
                if consecutive_failures >= MAX_CONSECUTIVE_FAILURES:
                    logger.error("ralph_loop: ABORT — %d consecutive failures", consecutive_failures)
                    state["status"] = "failed"
                    return {"status": "failed", "iterations": i + 1, "closed": closed_issues,
                            "reason": f"{consecutive_failures} consecutive failures"}
            else:
                consecutive_failures = 0  # non-error result resets counter

            state["closed_issues"] = closed_issues

            # 7. Cooldown between iterations (prevent resource thrashing)
            await asyncio.sleep(cooldown_sec)

    except Exception as exc:
        logger.exception("ralph_loop: ERROR — %s", exc)
        if company_id in _active_loops:
            _active_loops[company_id]["status"] = "error"
            _active_loops[company_id]["error"] = str(exc)
        return {"status": "error", "iterations": i + 1 if 'i' in dir() else 0, "closed": closed_issues, "error": str(exc)}
    finally:
        if company_id in _active_loops:
            _active_loops[company_id]["status"] = _active_loops[company_id].get("status", "complete")

    logger.info("ralph_loop: MAX_ITERATIONS reached (%d)", max_iterations)
    state["status"] = "max_iterations"
    return {"status": "max_iterations", "iterations": max_iterations, "closed": closed_issues}


def get_loop_status(company_id: str) -> dict | None:
    """Get current Ralph Loop status for a company."""
    return _active_loops.get(company_id)


def cancel_loop(company_id: str) -> bool:
    """Cancel a running Ralph Loop."""
    state = _active_loops.get(company_id)
    if state and state.get("status") == "running":
        state["status"] = "cancelled"
        return True
    return False


def _append_progress(backend: Any, company_id: str, entry: str) -> None:
    """Append progress entry to a wiki page or KV store."""
    key = f"ralph_progress_{company_id[:8]}"
    try:
        existing = ""
        rows = backend._db.execute(
            "SELECT value FROM kv_store WHERE key = ?", (key,)
        )
        if rows:
            existing = rows[0]["value"]
        new_value = existing + "\n" + entry
        backend._db.execute(
            "INSERT OR REPLACE INTO kv_store (key, value) VALUES (?, ?)",
            (key, new_value),
        )
    except Exception:
        logger.debug("ralph_loop: progress append failed for %s", key)
