from __future__ import annotations

import subprocess
import sys
from pathlib import Path


SCRIPT_PATH = Path(__file__).with_name("paperclip_guard.py")


def _run(payload: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, str(SCRIPT_PATH)],
        input=payload,
        text=True,
        capture_output=True,
        check=False,
    )


def test_blocks_malformed_json() -> None:
    result = _run('{"tool_name": ')
    assert result.returncode == 2
    assert "not valid JSON" in result.stderr


def test_blocks_empty_payload() -> None:
    result = _run("")
    assert result.returncode == 2
    assert "payload was empty" in result.stderr


def test_blocks_pause_without_confirmation() -> None:
    result = _run(
        '{"tool_name":"mcp__paperclip__pause_agent","tool_input":{"reason":"maintenance"}}'
    )
    assert result.returncode == 2
    assert "pause_agent requires explicit confirmation" in result.stderr


def test_allows_pause_with_confirmation_token() -> None:
    result = _run(
        '{"tool_name":"mcp__paperclip__pause_agent","tool_input":{"reason":"CONFIRM_PAUSE_AGENT: approved"}}'
    )
    assert result.returncode == 0


def test_blocks_resolve_without_confirmation() -> None:
    result = _run(
        '{"tool_name":"mcp__paperclip__resolve_approval","tool_input":{"note":"ship it"}}'
    )
    assert result.returncode == 2
    assert "resolve_approval requires explicit confirmation" in result.stderr


def test_allows_resolve_with_confirmation_token() -> None:
    result = _run(
        '{"tool_name":"mcp__paperclip__resolve_approval","tool_input":{"note":"CONFIRM_RESOLVE_APPROVAL: reviewed"}}'
    )
    assert result.returncode == 0


def test_allows_unrelated_tools() -> None:
    result = _run('{"tool_name":"mcp__paperclip__list_agents","tool_input":{}}')
    assert result.returncode == 0


def test_blocks_resume_without_confirmation() -> None:
    result = _run('{"tool_name":"mcp__paperclip__resume_agent","tool_input":{"agent_id":"abc"}}')
    assert result.returncode == 2
    assert "resume_agent requires explicit confirmation" in result.stderr


def test_allows_resume_with_confirmation_token() -> None:
    result = _run(
        '{"tool_name":"mcp__paperclip__resume_agent","tool_input":{"agent_id":"abc","reason":"CONFIRM_RESUME_AGENT: approved"}}'
    )
    assert result.returncode == 0


def test_blocks_update_issue_without_confirmation() -> None:
    result = _run(
        '{"tool_name":"mcp__paperclip__update_issue","tool_input":{"issue_id":"MUS-1","status":"in_review"}}'
    )
    assert result.returncode == 2
    assert "update_issue requires explicit confirmation" in result.stderr


def test_allows_update_issue_with_confirmation_token() -> None:
    result = _run(
        '{"tool_name":"mcp__paperclip__update_issue","tool_input":{"issue_id":"MUS-1","status":"in_review","comment":"CONFIRM_UPDATE_ISSUE: reviewed"}}'
    )
    assert result.returncode == 0
