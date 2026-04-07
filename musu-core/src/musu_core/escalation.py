"""Escalation helpers for musu-core.

When a fallback chain is fully exhausted (every adapter failed), this module
attempts to post a board comment via the Paperclip API so human operators are
notified.  If no Paperclip connection is available the incident is logged at
WARNING level instead.
"""

from __future__ import annotations

import logging
import os
from typing import Any

logger = logging.getLogger(__name__)


def _paperclip_env() -> dict[str, str] | None:
    """Return Paperclip env vars if all required ones are set, else None."""
    api_url = os.environ.get("PAPERCLIP_API_URL", "").rstrip("/")
    api_key = os.environ.get("PAPERCLIP_API_KEY", "")
    task_id = os.environ.get("PAPERCLIP_TASK_ID", "")
    run_id = os.environ.get("PAPERCLIP_RUN_ID", "")
    if api_url and api_key and task_id:
        return {"api_url": api_url, "api_key": api_key, "task_id": task_id, "run_id": run_id}
    return None


def _post_comment(env: dict[str, str], body: str) -> bool:
    """POST a comment to the current Paperclip task.  Returns True on success."""
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
            return True
        logger.warning("escalation: Paperclip comment failed %d: %s", resp.status_code, resp.text[:200])
        return False
    except Exception as exc:  # noqa: BLE001
        logger.warning("escalation: could not post Paperclip comment: %s", exc)
        return False


def escalate_chain_exhausted(
    agent_id: str,
    agent_name: str,
    run_id: str,
    error: str,
    fallback_adapters_tried: list[str],
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
    """
    adapters_str = ", ".join(fallback_adapters_tried) if fallback_adapters_tried else "none"
    body = (
        f"## Fallback chain exhausted — agent `{agent_name}`\n\n"
        f"All adapters failed for run `{run_id}`.\n\n"
        f"- **Agent ID:** `{agent_id}`\n"
        f"- **Adapters tried:** {adapters_str}\n"
        f"- **Last error:** {error}\n\n"
        "Manual intervention may be required."
    )

    env = _paperclip_env()
    if env:
        posted = _post_comment(env, body)
        if posted:
            logger.info(
                "escalation: posted chain-exhausted comment for agent %s run %s",
                agent_id,
                run_id,
            )
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
