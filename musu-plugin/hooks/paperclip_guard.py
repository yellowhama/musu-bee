#!/usr/bin/env python3
"""PreToolUse guard for sensitive Paperclip operations.

Blocks:
- pause_agent without explicit reason confirmation token
- resolve_approval without explicit note confirmation token
"""

from __future__ import annotations

import json
import sys
from typing import Any

PAUSE_TOKEN = "CONFIRM_PAUSE_AGENT"
RESUME_TOKEN = "CONFIRM_RESUME_AGENT"
APPROVAL_TOKEN = "CONFIRM_RESOLVE_APPROVAL"
UPDATE_ISSUE_TOKEN = "CONFIRM_UPDATE_ISSUE"


def _safe_get_str(data: dict[str, Any], key: str) -> str:
    value = data.get(key, "")
    return value if isinstance(value, str) else ""


def _should_guard(tool_name: str) -> bool:
    return (
        "pause_agent" in tool_name
        or "resume_agent" in tool_name
        or "resolve_approval" in tool_name
        or "update_issue" in tool_name
    )


def _pause_is_confirmed(tool_input: dict[str, Any]) -> bool:
    reason = _safe_get_str(tool_input, "reason")
    # Require an auditable token in free-text context.
    return PAUSE_TOKEN in reason


def _resume_is_confirmed(tool_input: dict[str, Any]) -> bool:
    reason = _safe_get_str(tool_input, "reason")
    # Require an auditable token in free-text context.
    return RESUME_TOKEN in reason


def _approval_is_confirmed(tool_input: dict[str, Any]) -> bool:
    note = _safe_get_str(tool_input, "note")
    decision_note = _safe_get_str(tool_input, "decisionNote")
    # Require an auditable token in free-text context.
    return APPROVAL_TOKEN in note or APPROVAL_TOKEN in decision_note


def _issue_update_is_confirmed(tool_input: dict[str, Any]) -> bool:
    comment = _safe_get_str(tool_input, "comment")
    return UPDATE_ISSUE_TOKEN in comment


def _block(message: str) -> int:
    print(message, file=sys.stderr)
    return 2


def main() -> int:
    raw_payload = sys.stdin.read()
    if not raw_payload.strip():
        return _block(
            "Blocked sensitive action: hook payload was empty, cannot verify confirmation."
        )

    try:
        payload = json.loads(raw_payload)
    except json.JSONDecodeError as exc:
        return _block(
            (
                "Blocked sensitive action: hook payload was not valid JSON, cannot verify confirmation.\n"
                f"Parse error: {exc}"
            )
        )

    if not isinstance(payload, dict):
        return _block(
            "Blocked sensitive action: hook payload root must be a JSON object."
        )

    tool_name_raw = payload.get("tool_name")
    if not isinstance(tool_name_raw, str) or not tool_name_raw.strip():
        return _block(
            (
                "Blocked sensitive action: hook payload missing a valid 'tool_name', "
                "cannot verify confirmation."
            )
        )
    tool_name = tool_name_raw.strip()

    tool_input = payload.get("tool_input", {})
    if tool_input is None:
        tool_input = {}
    if not isinstance(tool_input, dict):
        return _block(
            (
                "Blocked sensitive action: hook payload 'tool_input' must be a JSON object, "
                "cannot verify confirmation."
            )
        )

    if not _should_guard(tool_name):
        return 0

    if "pause_agent" in tool_name and not _pause_is_confirmed(tool_input):
        print(
            (
                "Blocked sensitive action: pause_agent requires explicit confirmation.\n"
                f"Retry with reason containing '{PAUSE_TOKEN}'.\n"
                "Example reason: 'CONFIRM_PAUSE_AGENT: outage triage approved by owner'"
            ),
            file=sys.stderr,
        )
        return 2

    if "resume_agent" in tool_name and not _resume_is_confirmed(tool_input):
        print(
            (
                "Blocked sensitive action: resume_agent requires explicit confirmation.\n"
                f"Retry with reason containing '{RESUME_TOKEN}'.\n"
                "Example reason: 'CONFIRM_RESUME_AGENT: outage triage complete, owner approved resume'"
            ),
            file=sys.stderr,
        )
        return 2

    if "resolve_approval" in tool_name and not _approval_is_confirmed(tool_input):
        print(
            (
                "Blocked sensitive action: resolve_approval requires explicit confirmation.\n"
                f"Retry with note containing '{APPROVAL_TOKEN}'.\n"
                "Example note: 'CONFIRM_RESOLVE_APPROVAL: reviewed evidence and accepting risk'"
            ),
            file=sys.stderr,
        )
        return 2

    if "update_issue" in tool_name and not _issue_update_is_confirmed(tool_input):
        print(
            (
                "Blocked sensitive action: update_issue requires explicit confirmation.\n"
                f"Retry with comment containing '{UPDATE_ISSUE_TOKEN}'.\n"
                "Example comment: 'CONFIRM_UPDATE_ISSUE: status transition reviewed with owner'"
            ),
            file=sys.stderr,
        )
        return 2

    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except SystemExit:
        raise
    except Exception as exc:
        print(
            (
                "Blocked sensitive action: guard crashed unexpectedly, "
                "failing closed.\n"
                f"Crash: {exc}"
            ),
            file=sys.stderr,
        )
        raise SystemExit(2)
