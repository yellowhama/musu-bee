#!/usr/bin/env python3
"""Seed musu-core with agents matching the bridge channel→bot mapping.

Run after musu-core DB is initialized (first LocalBackend instantiation
creates the schema). Idempotent — skips agents that already exist.

Usage:
    python seed_agents.py                   # all agents use claude_local
    python seed_agents.py --adapter process # use process adapter (for testing)
"""
from __future__ import annotations

import argparse
import logging
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

# Agent definitions: (name, role, adapter_type, adapter_config)
# name must match the channel name used in handlers.py route_message(source=...)
AGENTS = [
    {
        "name": "ceo",
        "role": "Chief Executive Officer",
        "adapter_type": "claude_local",
        "adapter_config": {
            "model": "claude-sonnet-4-6",
            "instructions_path": "musu-bridge/instructions/ceo.md",
        },
    },
    {
        "name": "cto",
        "role": "Chief Technology Officer",
        "adapter_type": "claude_local",
        "adapter_config": {
            "model": "claude-sonnet-4-6",
            "instructions_path": "musu-bridge/instructions/cto.md",
        },
    },
    {
        "name": "engineer",
        "role": "Software Engineer",
        "adapter_type": "claude_local",
        "adapter_config": {
            "model": "claude-sonnet-4-6",
            "instructions_path": "musu-bridge/instructions/engineer.md",
        },
    },
    {
        "name": "cos",
        "role": "Chief of Staff",
        "adapter_type": "claude_local",
        "adapter_config": {
            "model": "claude-sonnet-4-6",
            "instructions_path": "musu-bridge/instructions/cos.md",
        },
    },
    {
        "name": "qa",
        "role": "QA Engineer",
        "adapter_type": "claude_local",
        "adapter_config": {
            "model": "claude-sonnet-4-6",
            "instructions_path": "musu-bridge/instructions/qa.md",
        },
    },
    {
        "name": "worker",
        "role": "Worker",
        "adapter_type": "claude_local",
        "adapter_config": {
            "model": "claude-sonnet-4-6",
            "instructions_path": "musu-bridge/instructions/worker.md",
        },
    },
]


def seed(
    backend: LocalBackend,
    adapter_override: str | None = None,
    company_id: str | None = None,
) -> None:
    prefix = f"{company_id[:8]}-" if company_id else ""
    for agent_def in AGENTS:
        agent_name = f"{prefix}{agent_def['name']}"
        existing = backend.get_agent_by_name(agent_name, company_id=company_id)
        if existing is not None:
            logger.info("Agent '%s' already exists (id=%s), skipping", agent_name, existing["id"])
            continue

        adapter_type = adapter_override or agent_def["adapter_type"]
        adapter_config = agent_def["adapter_config"] if adapter_override is None else {}

        agent = backend.agents.create(
            name=agent_name,
            role=agent_def["role"],
            adapter_type=adapter_type,
            adapter_config=adapter_config,
            company_id=company_id,
        )
        logger.info("Created agent '%s' (id=%s, adapter=%s, company=%s)",
                     agent_name, agent.id, adapter_type, company_id or "global")

    # Summary
    all_agents = backend.list_agents()
    logger.info("Total registered agents: %d", len(all_agents))
    for a in all_agents:
        logger.info("  - %s (%s) [%s]", a["name"], a["role"], a["adapter_type"])


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Seed musu-core agents for bridge channels")
    parser.add_argument(
        "--adapter",
        default=None,
        help="Override adapter_type for all agents (e.g., 'process' for testing)",
    )
    parser.add_argument(
        "--db-path",
        default=None,
        help="Override musu-core database path",
    )
    parser.add_argument(
        "--company-id",
        default=None,
        help="Create company-scoped agents (name prefix: {id[:8]}-{role})",
    )
    args = parser.parse_args()

    cfg = get_config()
    db_path = args.db_path or cfg.db_path

    # Ensure parent directory exists
    Path(db_path).parent.mkdir(parents=True, exist_ok=True)

    backend = LocalBackend(db_path)
    try:
        seed(backend, adapter_override=args.adapter, company_id=args.company_id)
    finally:
        backend.close()
