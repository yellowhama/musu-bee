#!/usr/bin/env python3
"""Seed musu-core with agents matching the bridge channel→bot mapping.

Run after musu-core DB is initialized (first LocalBackend instantiation
creates the schema). Idempotent — skips agents that already exist.

Usage:
    python seed_agents.py                   # auto-detect CLI + cwd
    python seed_agents.py --adapter process # use process adapter (for testing)
"""
from __future__ import annotations

import argparse
import logging
import os
import shutil
import sys
from pathlib import Path

# Ensure musu-core is importable
_MUSU_CORE = Path(__file__).parent.parent / "musu-core" / "src"
if str(_MUSU_CORE) not in sys.path:
    sys.path.insert(0, str(_MUSU_CORE))

from musu_core.backends.local import LocalBackend
from musu_core.config import get_config

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
logger = logging.getLogger(__name__)


# ── CLI auto-detection ────────────────────────────────────────────────────────

def detect_cli() -> tuple[str, str]:
    """Detect which AI CLI is available. Returns (adapter_type, command)."""
    if shutil.which("claude"):
        return "claude_local", "claude"
    if shutil.which("gemini"):
        return "gemini_local", "gemini"
    if shutil.which("codex"):
        return "codex_local", "codex"
    logger.warning("No AI CLI found (claude/gemini/codex). Install one first.")
    return "claude_local", "claude"  # default, will fail at runtime


def model_for_role(role: str, adapter_type: str) -> str:
    """Pick model tier by role. CEO/CTO/Engineer = frontier, Worker = budget."""
    if adapter_type == "gemini_local":
        return "gemini-2.5-flash" if role in ("worker", "cos", "planner") else "gemini-2.5-pro"
    if adapter_type == "codex_local":
        return "gpt-5.5"
    # claude_local
    return "claude-haiku-4-5" if role in ("worker", "cos", "planner") else "claude-sonnet-4-6"


def budget_for_role(role: str) -> float:
    """Per-task budget by role."""
    if role in ("ceo", "cto"):
        return 5.0
    if role in ("engineer", "qa"):
        return 2.0
    return 0.5  # worker, cos, planner


def build_config(role: str, adapter_type: str, command: str, cwd: str) -> dict:
    """Build complete adapter_config with all required fields."""
    instructions_path = f"musu-bridge/instructions/{role}.md"
    return {
        "command": command,
        "model": model_for_role(role, adapter_type),
        "dangerously_skip_permissions": True,
        "timeout_sec": 600,
        "cwd": cwd,
        "instructions_path": instructions_path,
        "disable_mcp": role not in ("ceo", "lead"),
        "max_budget_usd": budget_for_role(role),
    }


# ── Agent definitions ─────────────────────────────────────────────────────────

AGENT_ROLES = [
    ("ceo", "Chief Executive Officer"),
    ("cto", "Chief Technology Officer"),
    ("engineer", "Software Engineer"),
    ("cos", "Chief of Staff"),
    ("qa", "QA Engineer"),
    ("worker", "Worker"),
]


def seed(
    backend: LocalBackend,
    adapter_override: str | None = None,
    company_id: str | None = None,
) -> None:
    # Auto-detect CLI and working directory
    detected_adapter, detected_command = detect_cli()
    cwd = os.getcwd()

    logger.info("Auto-detected: adapter=%s, command=%s, cwd=%s",
                detected_adapter, detected_command, cwd)

    prefix = f"{company_id[:8]}-" if company_id else ""
    for role_name, role_desc in AGENT_ROLES:
        agent_name = f"{prefix}{role_name}"
        existing = backend.get_agent_by_name(agent_name, company_id=company_id)
        if existing is not None:
            # Update existing agent's config if command is missing
            existing_config = existing.get("adapter_config", {})
            if not existing_config.get("command"):
                adapter_type = adapter_override or detected_adapter
                new_config = build_config(role_name, adapter_type, detected_command, cwd)
                # Merge: keep existing values, fill missing
                for k, v in new_config.items():
                    if k not in existing_config:
                        existing_config[k] = v
                backend.agents.update(existing["id"], adapter_config=existing_config)
                logger.info("Updated config for '%s' (added command=%s, cwd=%s)",
                            agent_name, detected_command, cwd)
            else:
                logger.info("Agent '%s' already exists with command, skipping", agent_name)
            continue

        adapter_type = adapter_override or detected_adapter
        adapter_config = build_config(role_name, adapter_type, detected_command, cwd)

        # Build fallback chain
        fallback_chain = []
        if adapter_type == "claude_local":
            if shutil.which("gemini"):
                fallback_chain.append({
                    "adapter_type": "gemini_local",
                    "command": "gemini",
                    "model": model_for_role(role_name, "gemini_local"),
                    "timeout_sec": 600,
                    "cwd": cwd,
                })
            if shutil.which("codex"):
                fallback_chain.append({
                    "adapter_type": "codex_local",
                    "command": "codex",
                    "model": "gpt-5.5",
                    "timeout_sec": 600,
                    "cwd": cwd,
                })

        agent = backend.agents.create(
            name=agent_name,
            role=role_desc,
            adapter_type=adapter_type,
            adapter_config=adapter_config,
            fallback_chain=fallback_chain if fallback_chain else None,
            company_id=company_id,
        )
        logger.info("Created agent '%s' (id=%s, adapter=%s, model=%s, command=%s)",
                     agent_name, agent.id, adapter_type,
                     adapter_config["model"], adapter_config["command"])

    # Summary
    all_agents = backend.list_agents()
    logger.info("Total registered agents: %d", len(all_agents))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Seed musu-core agents for bridge channels")
    parser.add_argument("--adapter", default=None, help="Override adapter_type")
    parser.add_argument("--db-path", default=None, help="Override DB path")
    parser.add_argument("--company-id", default=None, help="Company-scoped agents")
    args = parser.parse_args()

    cfg = get_config()
    db_path = args.db_path or cfg.db_path
    Path(db_path).parent.mkdir(parents=True, exist_ok=True)

    backend = LocalBackend(db_path)
    try:
        seed(backend, adapter_override=args.adapter, company_id=args.company_id)
    finally:
        backend.close()
