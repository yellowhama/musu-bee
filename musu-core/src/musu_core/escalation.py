"""Escalation helpers for musu-core.

When a fallback chain is fully exhausted (every adapter failed), this module
attempts to post a board comment via the Paperclip API so human operators are
notified.  If no Paperclip connection is available the incident is logged at
WARNING level instead.
"""

from __future__ import annotations

import logging
import os
from typing import Literal

logger = logging.getLogger(__name__)


def _is_truthy(value: str | None) -> bool:
    return str(value or "").strip().lower() in {"1", "true", "yes", "on"}


def _is_test_context() -> bool:
    return "PYTEST_CURRENT_TEST" in os.environ


def _comment_post_mode() -> str:
    """Return one of: off, dry-run, live."""
    explicit = os.environ.get("MUSU_ESCALATION_COMMENT_MODE", "").strip().lower()
    if explicit in {"off", "dry-run", "live"}:
        return explicit
    if _is_test_context() and not _is_truthy(os.environ.get("MUSU_ESCALATION_ALLOW_TEST_POSTS")):
        return "off"
    return "live"


def _paperclip_env() -> dict[str, str] | None:
    """Return Paperclip env vars if all required ones are set, else None."""
    api_url = os.environ.get("PAPERCLIP_API_URL", "").rstrip("/")
    api_key = os.environ.get("PAPERCLIP_API_KEY", "")
    task_id = os.environ.get("PAPERCLIP_TASK_ID", "")
    run_id = os.environ.get("PAPERCLIP_RUN_ID", "")
    if api_url and api_key and task_id:
        return {"api_url": api_url, "api_key": api_key, "task_id": task_id, "run_id": run_id}
    return None


def _post_comment(env: dict[str, str], body: str) -> Literal["posted", "suppressed", "dry-run", "failed"]:
    """POST a comment to the current Paperclip task."""
    mode = _comment_post_mode()
    if mode == "off":
        logger.info(
            "escalation: suppressed Paperclip comment (mode=off, task_id=%s, pytest=%s)",
            env.get("task_id", ""),
            _is_test_context(),
        )
        return "suppressed"
    if mode == "dry-run":
        logger.info(
            "escalation: dry-run, skipping Paperclip POST to issue %s",
            env.get("task_id", ""),
        )
        logger.info("escalation: dry-run comment body follows:\n%s", body)
        return "dry-run"

    try:
        import httpx  # optional dependency — only needed at runtime with Paperclip

        headers: dict[str, str] = {"Authorization": f"Bearer {env['api_key']}"}
        if env.get("run_id"):
            headers["X-Paperclip-Run-Id"] = env["run_id"]

        resp = httpx.post(
            f"{env['api_url']}/api/issues/{env['task_id']}/comments",
            json={"body": body},
            headers=headers,
            timeout=5.0,
        )
        if resp.status_code < 300:
            return "posted"
        logger.warning("escalation: Paperclip comment failed %d: %s", resp.status_code, resp.text[:200])
        return "failed"
    except Exception as exc:  # noqa: BLE001
        logger.warning("escalation: could not post Paperclip comment: %s", exc)
        return "failed"


def _build_chain_exhausted_comment(
    agent_id: str,
    agent_name: str,
    run_id: str,
    error: str,
    fallback_adapters_tried: list[str],
    metrics_source: str | None,
) -> str:
    adapters_str = ", ".join(fallback_adapters_tried) if fallback_adapters_tried else "none"
    source = metrics_source or "[TBD: awaiting real data]"
    return (
        f"## Fallback chain exhausted — agent `{agent_name}`\n\n"
        f"All adapters failed for run `{run_id}`.\n\n"
        f"- **Agent ID:** `{agent_id}`\n"
        f"- **Adapters tried:** {adapters_str}\n"
        f"- **Last error:** {error}\n"
        f"- **Traceability key:** `fallback_metrics.run_id = {run_id}`\n"
        f"- **Fallback metrics source:** `{source}`\n\n"
        "Manual intervention may be required."
    )


def escalate_chain_exhausted(
    agent_id: str,
    agent_name: str,
    run_id: str,
    error: str,
    fallback_adapters_tried: list[str],
    metrics_source: str | None = None,
) -> None:
    """Notify operators that all fallback adapters failed for an agent execution.

    Posts a markdown comment to the active Paperclip task when env vars are
    available; otherwise logs at WARNING level.

    Args:
        agent_id:               The agent whose chain was exhausted.
        agent_name:             Human-readable agent name for the comment body.
        run_id:                 The execution run_id for traceability.
        error:                  Last error message from the chain.
        fallback_adapters_tried: Ordered list of adapter types that were attempted.
        metrics_source:         Canonical source location for fallback_metrics rows.
    """
    adapters_str = ", ".join(fallback_adapters_tried) if fallback_adapters_tried else "none"
    body = _build_chain_exhausted_comment(
        agent_id=agent_id,
        agent_name=agent_name,
        run_id=run_id,
        error=error,
        fallback_adapters_tried=fallback_adapters_tried,
        metrics_source=metrics_source,
    )

    env = _paperclip_env()
    if env:
        post_outcome = _post_comment(env, body)
        if post_outcome == "posted":
            logger.info(
                "escalation: posted chain-exhausted comment for agent %s run %s",
                agent_id,
                run_id,
            )
            return
        if post_outcome in {"suppressed", "dry-run"}:
            return

    # Fallback: structured log so operators can alert on it
    logger.warning(
        "FALLBACK_CHAIN_EXHAUSTED agent_id=%s agent_name=%s run_id=%s "
        "adapters_tried=%s last_error=%s",
        agent_id,
        agent_name,
        run_id,
        adapters_str,
        error,
    )
