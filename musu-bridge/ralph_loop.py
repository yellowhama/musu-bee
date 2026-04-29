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

_KV_PREFIX = "ralph_state_"


def _persist_state(backend: Any, company_id: str, state: dict) -> None:
    """Save loop state to kv_store for crash recovery."""
    import json
    key = f"{_KV_PREFIX}{company_id[:8]}"
    try:
        backend._db.execute(
            "INSERT OR REPLACE INTO kv_store (key, value) VALUES (?, ?)",
            (key, json.dumps(state)),
        )
    except Exception:
        pass


def _restore_state(backend: Any, company_id: str) -> dict | None:
    """Restore loop state from kv_store after restart."""
    import json
    key = f"{_KV_PREFIX}{company_id[:8]}"
    try:
        rows = backend._db.execute("SELECT value FROM kv_store WHERE key = ?", (key,))
        if rows:
            return json.loads(rows[0]["value"])
    except Exception:
        pass
    return None


async def ralph_loop(
    company_id: str,
    max_iterations: int = 20,
    channel: str = "team_lead",
    use_worktree: bool = False,
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

            # 2.5. Worktree isolation (if enabled)
            _worktree_path = None
            _worktree_branch = None
            if use_worktree:
                import subprocess
                _worktree_branch = f"ralph-{loop_id}-{i}"
                _worktree_path = f"/tmp/musu-worktree-{loop_id}-{i}"
                try:
                    subprocess.run(["git", "worktree", "add", "-b", _worktree_branch, _worktree_path], capture_output=True, check=True)
                    logger.info("ralph_loop: worktree created at %s (branch %s)", _worktree_path, _worktree_branch)
                except Exception as _wt_err:
                    logger.warning("ralph_loop: worktree creation failed — %s. Using main.", _wt_err)
                    _worktree_path = None

            # 2.7. Wiki context for this issue (pre-dispatch knowledge)
            _wiki_ctx = ""
            try:
                import httpx as _httpx_rl
                async with _httpx_rl.AsyncClient(timeout=3.0) as _wc:
                    _wr = await _wc.get("http://127.0.0.1:8070/api/wiki/search", params={"q": issue_title})
                    if _wr.status_code == 200 and _wr.json():
                        _wiki_ctx = "\n".join(f"- {p['title']}" for p in _wr.json()[:3])
            except Exception:
                pass

            # 3. Build fresh prompt (no accumulated context — Ralph's core principle)
            prompt = (
                f"## Ralph Loop Iteration {i + 1}/{max_iterations}\n\n"
                + (f"### 관련 위키\n{_wiki_ctx}\n\n" if _wiki_ctx else "")
                + f"처리할 이슈: **{issue_title}**\n"
                f"ID: {issue_id}\n"
                f"설명: {issue.get('description', '(없음)')}\n\n"
                f"### 지시\n"
                f"1. 이 이슈를 해결하라\n"
                f"2. 코드 변경이 필요하면 Engineer에게 delegate_task\n"
                f"3. 완료되면 이슈에 코멘트로 결과 기록\n"
                f"4. update_issue('{issue_id}', status='closed') 호출\n\n"
                f"⚠ 이 iteration은 fresh context다. 이전 iteration의 결과는 git과 이슈 코멘트에만 있다."
                + (f"\n⚠ 작업 디렉토리: {_worktree_path}" if _worktree_path else "")
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
            # Append to progress KV store + wiki (best effort)
            try:
                _append_progress(backend, company_id, progress_entry)
            except Exception:
                pass
            try:
                from wiki_routes import get_wiki_path
                _wiki_dir = get_wiki_path(company_id)
                _wiki_dir.mkdir(parents=True, exist_ok=True)
                _wiki_file = _wiki_dir / f"ralph_{company_id[:8]}_{i:03d}_{issue_id[:8]}.md"
                _wiki_file.write_text(progress_entry, encoding="utf-8")
            except Exception:
                pass

            # 6. Check if issue was closed by the agent
            updated_issue = backend.get_issue(issue_id) if hasattr(backend, 'get_issue') else None
            if updated_issue and updated_issue.get("status") in ("closed", "resolved", "done"):
                closed_issues.append(issue_id)
                consecutive_failures = 0
                logger.info("ralph_loop: issue %s closed by agent", issue_id[:8])
                # Merge worktree if isolation was used
                if _worktree_path and _worktree_branch:
                    try:
                        import subprocess
                        subprocess.run(["git", "merge", _worktree_branch, "--no-edit"], capture_output=True, check=True)
                        logger.info("ralph_loop: merged branch %s", _worktree_branch)
                    except Exception as _mg_err:
                        logger.warning("ralph_loop: merge failed — %s", _mg_err)
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
            _persist_state(backend, company_id, state)

            # Cleanup worktree
            if _worktree_path:
                try:
                    import subprocess, shutil
                    subprocess.run(["git", "worktree", "remove", _worktree_path, "--force"], capture_output=True)
                    if _worktree_branch:
                        subprocess.run(["git", "branch", "-D", _worktree_branch], capture_output=True)
                except Exception:
                    pass

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
    """Get current Ralph Loop status for a company (memory or DB)."""
    state = _active_loops.get(company_id)
    if state:
        return state
    # Try DB fallback
    try:
        from handlers import _get_backend
        return _restore_state(_get_backend(), company_id)
    except Exception:
        return None


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
