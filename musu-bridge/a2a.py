"""A2A Protocol (Agent-to-Agent) — JSON-RPC 2.0 binding for MUSU.

Implements the minimum viable A2A server per the v1.0.0 spec:
- GET  /.well-known/agent.json  — Agent Card discovery
- POST /a2a                     — JSON-RPC endpoint (SendMessage, GetTask, CancelTask)

Spec: references/A2A/docs/specification.md
Proto: references/A2A/specification/a2a.proto
"""
from __future__ import annotations

import json
import logging
import os
import uuid
from typing import Any

logger = logging.getLogger("musu.a2a")

# A2A task state mapping: musu status → A2A TaskState
_STATUS_MAP = {
    "pending": "submitted",
    "running": "working",
    "done": "completed",
    "failed": "failed",
    "cancelled": "canceled",
}

# JSON-RPC error codes (A2A spec section 9)
_PARSE_ERROR = -32700
_INVALID_REQUEST = -32600
_METHOD_NOT_FOUND = -32601
_INVALID_PARAMS = -32602
_INTERNAL_ERROR = -32603
_TASK_NOT_FOUND = -32001
_TASK_NOT_CANCELABLE = -32002


def _jsonrpc_error(id: Any, code: int, message: str, data: Any = None) -> dict:
    err: dict[str, Any] = {"code": code, "message": message}
    if data is not None:
        err["data"] = data
    return {"jsonrpc": "2.0", "id": id, "error": err}


def _jsonrpc_result(id: Any, result: Any) -> dict:
    return {"jsonrpc": "2.0", "id": id, "result": result}


def get_agent_card() -> dict:
    """Build the A2A Agent Card for this MUSU instance."""
    bridge_url = os.environ.get("MUSU_BRIDGE_URL", "http://localhost:8070")

    return {
        "name": "MUSU Agent Runtime",
        "description": "AI agent team orchestration runtime. Delegates tasks to specialized agents (CEO, Engineer, QA, etc.) and manages their lifecycle.",
        "version": "1.0.0",
        "supported_interfaces": [
            {
                "url": f"{bridge_url}/a2a",
                "protocol_binding": "JSONRPC",
                "protocol_version": "1.0",
            }
        ],
        "capabilities": {
            "streaming": False,
            "push_notifications": False,
        },
        "default_input_modes": ["text/plain"],
        "default_output_modes": ["text/plain"],
        "security_schemes": {
            "bearer": {
                "http_auth_security_scheme": {
                    "scheme": "Bearer",
                    "description": "MUSU Bridge Token (MUSU_BRIDGE_TOKEN env var)",
                }
            }
        },
        "security_requirements": [{"schemes": {"bearer": []}}],
        "skills": [
            {
                "id": "delegate_task",
                "name": "Delegate Task",
                "description": "Delegate a task to a named agent channel (ceo, engineer, team_lead, qa, etc.)",
            },
            {
                "id": "list_issues",
                "name": "List Issues",
                "description": "List open issues for a company",
            },
            {
                "id": "create_issue",
                "name": "Create Issue",
                "description": "Create a new issue in a company's backlog",
            },
            {
                "id": "ralph_loop",
                "name": "Ralph Loop",
                "description": "Start autonomous iteration loop that processes issues until done",
            },
        ],
    }


async def handle_jsonrpc(body: dict) -> dict:
    """Handle a JSON-RPC 2.0 request per A2A spec.

    Supported methods:
    - SendMessage     → delegates to route_chat, returns task
    - GetTask         → returns task status
    - CancelTask      → cancels a running task
    """
    # Validate JSON-RPC structure
    if body.get("jsonrpc") != "2.0":
        return _jsonrpc_error(body.get("id"), _INVALID_REQUEST, "Missing or invalid jsonrpc version")

    req_id = body.get("id")
    method = body.get("method", "")
    params = body.get("params", {})

    dispatch = {
        "SendMessage": _handle_send_message,
        "GetTask": _handle_get_task,
        "CancelTask": _handle_cancel_task,
    }

    handler = dispatch.get(method)
    if not handler:
        return _jsonrpc_error(req_id, _METHOD_NOT_FOUND, f"Unknown method: {method}")

    try:
        result = await handler(params)
        return _jsonrpc_result(req_id, result)
    except ValueError as exc:
        return _jsonrpc_error(req_id, _INVALID_PARAMS, str(exc))
    except Exception as exc:
        logger.exception("a2a: %s failed — %s", method, exc)
        return _jsonrpc_error(req_id, _INTERNAL_ERROR, str(exc)[:200])


async def _handle_send_message(params: dict) -> dict:
    """SendMessage: accept a message, delegate to an agent, return a task."""
    from handlers import route_chat

    message = params.get("message")
    if not message:
        raise ValueError("Missing 'message' in params")

    # Extract text from parts
    parts = message.get("parts", [])
    text_parts = [p.get("text", "") for p in parts if isinstance(p, dict) and "text" in p]
    text = "\n".join(text_parts).strip()
    if not text:
        raise ValueError("Message has no text content")

    # Configuration
    config = params.get("configuration", {})
    channel = params.get("metadata", {}).get("channel", "team_lead")
    company_id = params.get("metadata", {}).get("company_id")
    sender_id = message.get("message_id", f"a2a-{uuid.uuid4().hex[:8]}")

    # Delegate via route_chat
    result = await route_chat(
        channel=channel,
        sender_id=sender_id,
        text=text,
        company_id=company_id,
    )

    # Build A2A Task response
    response_text = result.get("response", result.get("error", ""))
    task_id = result.get("task_id", str(uuid.uuid4()))

    return {
        "task": {
            "id": task_id,
            "status": {
                "state": "completed" if not result.get("error") else "failed",
                "message": {
                    "message_id": str(uuid.uuid4()),
                    "role": "agent",
                    "parts": [{"text": response_text[:5000]}],
                },
            },
        }
    }


async def _handle_get_task(params: dict) -> dict:
    """GetTask: return task status by ID."""
    from handlers import _get_backend

    task_id = params.get("id")
    if not task_id:
        raise ValueError("Missing 'id' in params")

    backend = _get_backend()
    rows = backend._db.execute(
        "SELECT * FROM route_executions WHERE id = ?", (task_id,)
    )
    if not rows:
        return _jsonrpc_error(None, _TASK_NOT_FOUND, f"Task not found: {task_id}")

    row = dict(rows[0])
    a2a_state = _STATUS_MAP.get(row.get("status", ""), "submitted")

    task: dict[str, Any] = {
        "id": task_id,
        "status": {"state": a2a_state},
    }

    # Include output as artifact if completed
    if row.get("output"):
        task["artifacts"] = [{
            "parts": [{"text": row["output"][:5000]}],
        }]

    # Include error in status message
    if row.get("error"):
        task["status"]["message"] = {
            "message_id": str(uuid.uuid4()),
            "role": "agent",
            "parts": [{"text": row["error"][:2000]}],
        }

    return {"task": task}


async def _handle_cancel_task(params: dict) -> dict:
    """CancelTask: cancel a running task."""
    from handlers import _get_backend

    task_id = params.get("id")
    if not task_id:
        raise ValueError("Missing 'id' in params")

    backend = _get_backend()
    rows = backend._db.execute(
        "SELECT status FROM route_executions WHERE id = ?", (task_id,)
    )
    if not rows:
        return _jsonrpc_error(None, _TASK_NOT_FOUND, f"Task not found: {task_id}")

    status = rows[0]["status"]
    if status in ("done", "failed"):
        return _jsonrpc_error(None, _TASK_NOT_CANCELABLE, f"Task already {status}")

    backend.update_route_execution(task_id, "failed", error="Cancelled via A2A")
    return {
        "task": {
            "id": task_id,
            "status": {"state": "canceled"},
        }
    }
