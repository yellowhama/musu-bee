"""Forward a wake to another machine's musu-bridge (v19.C P3).

When agent.home_node names a non-local node, execute_wake calls
forward_wake_to_peer instead of running the adapter locally. We POST
the wake payload to the peer's /api/dispatch/wake, then open an SSE to
the peer's /runs/{remote_id}/stream and relay every event into the
local heartbeat_run_events with `event_type='forwarded_event'`. When
the peer's `done` message arrives we apply the same terminal status to
the local run row.

Auth: piggybacks on the existing mesh token (v18.A). Bridge middleware
attaches it; we just need the URL.

Failure modes:
  - Unknown home_node (not in nodes.toml) → local run failed,
    error="unknown home_node: <name>"
  - Peer unreachable (connect refused / timeout / non-2xx POST) → local
    run failed, error="peer unreachable: <name>" (FR-010)
  - SSE drops mid-stream → local run failed with the same "peer
    unreachable" error; partial events already relayed remain.

No retries here. A second attempt would create a duplicate remote run.
The user re-triggers the wake if needed.
"""

from __future__ import annotations

import json
import logging
import os
from typing import Any

from musu_core.db import Database
from musu_core.dispatch.wake import record_event

logger = logging.getLogger(__name__)


async def forward_wake_to_peer(
    db: Database,
    run_id: str,
    agent_id: str,
    home_node: str,
    wake_payload: dict[str, Any],
    *,
    http_client_factory=None,
) -> None:
    """Forward a wake to home_node and relay its event stream back.

    Args:
        db: local SQLite handle (for status + event writes).
        run_id: local heartbeat_runs.id to mirror remote state into.
        agent_id: the agent being woken (passed to peer).
        home_node: target mesh node name (must be in nodes.toml).
        wake_payload: original wake_payload dict.
        http_client_factory: optional async-context-manager factory.
            Tests inject a mock here. Default is httpx.AsyncClient.
    """
    from musu_core.mesh import get_registry

    registry = get_registry()
    peer_url = registry.bridge_url_for_node(home_node)
    if not peer_url:
        _fail_local(db, run_id, f"unknown home_node: {home_node}")
        return

    if http_client_factory is None:
        import httpx
        # Long-running SSE — disable per-read timeout. Connect+overall
        # timeouts still apply (we cap at 60s connect; SSE itself runs
        # under the bridge's own 30-min cap).
        timeout = httpx.Timeout(60.0, read=None)
        http_client_factory = lambda: httpx.AsyncClient(timeout=timeout)

    token = os.environ.get("MUSU_BRIDGE_TOKEN", "")
    headers = {
        "X-Musu-Forwarded-From": registry.self_name or "unknown",
    }
    if token:
        # Defense in depth: log every token-bearing forward so an
        # unexpected destination (e.g. a malicious agents-sync that
        # rewrites agents.home_node) is visible in the audit trail. The
        # token is bounded by nodes.toml — only nodes the user
        # registered there can receive it — but we want an observable
        # trail when forwarding actually happens.
        logger.info(
            "forward_wake: bearer-token forward to home_node=%r url=%r run_id=%r",
            home_node, peer_url, run_id,
        )
        headers["Authorization"] = f"Bearer {token}"

    wake_body = {
        "agent_id": agent_id,
        "wake_reason": wake_payload.get("wake_reason", "forwarded"),
        "issue_id": wake_payload.get("issue_id"),
        "parent_run_id": wake_payload.get("parent_run_id"),
        "wake_payload": wake_payload,
    }

    try:
        async with http_client_factory() as client:
            # 1. Create the remote wake.
            resp = await client.post(
                f"{peer_url.rstrip('/')}/api/dispatch/wake",
                json=wake_body,
                headers=headers,
            )
            if resp.status_code >= 400:
                _fail_local(
                    db,
                    run_id,
                    f"peer unreachable: {home_node} (HTTP {resp.status_code})",
                )
                return
            remote = resp.json()
            remote_run_id = remote.get("run_id")
            if not remote_run_id:
                _fail_local(
                    db,
                    run_id,
                    f"peer unreachable: {home_node} (no run_id in response)",
                )
                return

            # Persist remote run_id on the local payload for debugging.
            db.execute(
                "UPDATE heartbeat_runs SET wake_payload=? WHERE id=?",
                (
                    json.dumps(
                        {**wake_payload, "forwarded_run_id": remote_run_id}
                    ),
                    run_id,
                ),
            )

            # 2. Relay the SSE stream.
            stream_url = (
                f"{peer_url.rstrip('/')}/api/dispatch/runs/"
                f"{remote_run_id}/stream"
            )
            async with client.stream(
                "GET", stream_url, headers=headers
            ) as sse_resp:
                if sse_resp.status_code >= 400:
                    _fail_local(
                        db,
                        run_id,
                        f"peer unreachable: {home_node} "
                        f"(stream HTTP {sse_resp.status_code})",
                    )
                    return
                async for line in sse_resp.aiter_lines():
                    if not line or not line.startswith("data:"):
                        continue
                    raw = line[len("data:"):].strip()
                    if not raw:
                        continue
                    try:
                        msg = json.loads(raw)
                    except json.JSONDecodeError:
                        continue
                    if _is_terminal(msg):
                        _apply_terminal(db, run_id, home_node, msg)
                        return
                    _relay_event(db, run_id, home_node, msg)
    except Exception as exc:  # noqa: BLE001 — any connect/read error
        logger.warning("forward_wake_to_peer error: %r", exc)
        _fail_local(
            db,
            run_id,
            f"peer unreachable: {home_node} ({type(exc).__name__})",
        )


def _is_terminal(msg: dict[str, Any]) -> bool:
    """The peer's SSE final marker is {type: 'done', status: ..., ...}."""
    return msg.get("type") == "done"


def _apply_terminal(
    db: Database, run_id: str, home_node: str, msg: dict[str, Any]
) -> None:
    """Mirror the peer's terminal status onto the local run."""
    status = msg.get("status") or "failed"
    summary = msg.get("summary") or ""
    error = msg.get("error") or ""
    if status not in ("completed", "failed", "cancelled"):
        status = "failed"
        if not error:
            error = f"peer returned unknown status: {msg.get('status')!r}"
    db.execute(
        "UPDATE heartbeat_runs "
        "SET status=?, summary=?, error=?, "
        "    ended_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') "
        "WHERE id=?",
        (status, summary, error, run_id),
    )
    # Emit a single 'done'-equivalent event locally so the client UI
    # sees a definitive end.
    if status == "completed":
        record_event(db, run_id, "completed", {"summary": summary[:500]})
    elif status == "cancelled":
        record_event(db, run_id, "cancelled", {"forwarded_from": home_node})
    else:
        record_event(db, run_id, "failed", {"error": error})


def _relay_event(
    db: Database, run_id: str, home_node: str, msg: dict[str, Any]
) -> None:
    """Write one remote event into local heartbeat_run_events.

    Wrapper payload keeps the local timeline parseable: the inner
    event_type lives in `remote_type`, the inner payload in
    `remote_payload`. Client UI re-dispatches on remote_type.
    """
    remote_type = msg.get("event_type") or "unknown"
    remote_payload = msg.get("payload") or {}
    record_event(
        db,
        run_id,
        "forwarded_event",
        {
            "forwarded_from": home_node,
            "remote_event_id": msg.get("id", ""),
            "remote_type": remote_type,
            "remote_payload": remote_payload,
        },
    )


def _fail_local(db: Database, run_id: str, reason: str) -> None:
    """Mark the local run failed (FR-010) with reason and emit event.

    Only transitions out of non-terminal states so we don't trample a
    completed/cancelled/failed row from a concurrent path.
    """
    db.execute(
        "UPDATE heartbeat_runs "
        "SET status='failed', error=?, "
        "    ended_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') "
        "WHERE id=? AND status NOT IN ('completed','failed','cancelled')",
        (reason, run_id),
    )
    record_event(db, run_id, "failed", {"error": reason})
