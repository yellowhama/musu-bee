#!/usr/bin/env python3
"""Seed Bloodline Writers agents into musu-core.

Registers 7 BW-* agents scoped to the writer company.
Idempotent — skips agents that already exist.

Usage:
    python seed_bw_agents.py
"""
from __future__ import annotations

import logging
import sys
from pathlib import Path

_MUSU_CORE = Path(__file__).parent.parent / "musu-core" / "src"
if str(_MUSU_CORE) not in sys.path:
    sys.path.insert(0, str(_MUSU_CORE))

from musu_core.backends.local import LocalBackend
from musu_core.config import get_config

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
logger = logging.getLogger(__name__)

WRITER_COMPANY_ID = "a2699373-3700-4cbc-8477-c70e1d94cf8a"
WRITER_CWD = "/home/hugh51/writer"

BW_AGENTS = [
    {
        "name": "BW-Lead",
        "role": "Company Lead",
        "adapter_type": "gemini_local",
        "adapter_config": {
            "command": "gemini",
            "model": "gemini-2.5-pro",
            "yolo": True,
            "cwd": WRITER_CWD,
            "instructions_path": f"{WRITER_CWD}/agents/bw_lead.md",
            "timeout_sec": 600,
        },
    },
    {
        "name": "BW-PM-FalseDane",
        "role": "PM False Dane",
        "adapter_type": "gemini_local",
        "adapter_config": {
            "command": "gemini",
            "model": "gemini-2.5-flash",
            "yolo": True,
            "cwd": WRITER_CWD,
            "instructions_path": f"{WRITER_CWD}/agents/bw_pm.md",
            "timeout_sec": 300,
        },
    },
    {
        "name": "BW-PM-Bloodline",
        "role": "PM Bloodline",
        "adapter_type": "gemini_local",
        "adapter_config": {
            "command": "gemini",
            "model": "gemini-2.5-flash",
            "yolo": True,
            "cwd": WRITER_CWD,
            "instructions_path": f"{WRITER_CWD}/agents/bw_pm.md",
            "timeout_sec": 300,
        },
    },
    {
        "name": "BW-PM-Hunter-Reborn",
        "role": "PM Hunter Reborn",
        "adapter_type": "gemini_local",
        "adapter_config": {
            "command": "gemini",
            "model": "gemini-2.5-flash",
            "yolo": True,
            "cwd": WRITER_CWD,
            "instructions_path": f"{WRITER_CWD}/agents/bw_pm.md",
            "timeout_sec": 300,
        },
    },
    {
        "name": "BW-Researcher",
        "role": "Researcher",
        "adapter_type": "gemini_local",
        "adapter_config": {
            "command": "gemini",
            "model": "gemini-2.5-flash",
            "yolo": True,
            "cwd": WRITER_CWD,
            "instructions_path": f"{WRITER_CWD}/agents/bw_researcher.md",
            "timeout_sec": 300,
        },
    },
    {
        "name": "BW-TrendResearcher",
        "role": "Trend Researcher",
        "adapter_type": "gemini_local",
        "adapter_config": {
            "command": "gemini",
            "model": "gemini-2.5-flash",
            "yolo": True,
            "cwd": WRITER_CWD,
            "instructions_path": f"{WRITER_CWD}/agents/bw_trend_researcher.md",
            "timeout_sec": 300,
        },
    },
    {
        "name": "BW-Writer",
        "role": "Writer",
        "adapter_type": "gemini_local",
        "adapter_config": {
            "command": "gemini",
            "model": "gemini-2.5-pro",
            "yolo": True,
            "cwd": WRITER_CWD,
            "instructions_path": f"{WRITER_CWD}/agents/bw_writer.md",
            "timeout_sec": 600,
        },
    },
    {
        "name": "BW-Editor",
        "role": "Editor",
        "adapter_type": "gemini_local",
        "adapter_config": {
            "command": "gemini",
            "model": "gemini-2.5-pro",
            "yolo": True,
            "cwd": WRITER_CWD,
            "instructions_path": f"{WRITER_CWD}/agents/bw_editor.md",
            "timeout_sec": 600,
        },
    },
]


def main():
    config = get_config()
    db_path = config.db_path
    backend = LocalBackend(db_path)

    for agent_def in BW_AGENTS:
        name = agent_def["name"]
        existing = backend.get_agent_by_name(name, company_id=WRITER_COMPANY_ID)
        if existing is not None:
            logger.info("Agent '%s' already exists (id=%s), skipping", name, existing["id"])
            continue

        agent = backend.agents.create(
            name=name,
            role=agent_def["role"],
            adapter_type=agent_def["adapter_type"],
            adapter_config=agent_def["adapter_config"],
            company_id=WRITER_COMPANY_ID,
        )
        logger.info("Created agent '%s' (id=%s, adapter=%s)", name, agent.id, agent_def["adapter_type"])

    # Summary
    all_agents = backend.list_agents()
    bw_agents = [a for a in all_agents if a["name"].startswith("BW-")]
    logger.info("BW-* agents registered: %d", len(bw_agents))
    for a in bw_agents:
        logger.info("  - %s (%s) [%s] company=%s", a["name"], a["role"], a["adapter_type"], a.get("company_id", "global"))


if __name__ == "__main__":
    main()
