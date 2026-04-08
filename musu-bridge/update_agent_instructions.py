#!/usr/bin/env python3
"""Update agent instructions_path in musu-core to point to role-specific prompts.

Idempotent — safe to run multiple times. Updates adapter_config.instructions_path
for each agent to the file in the instructions/ directory alongside this script.
"""
from __future__ import annotations

import sys
from pathlib import Path

_MUSU_CORE = Path(__file__).parent.parent / "musu-core" / "src"
if str(_MUSU_CORE) not in sys.path:
    sys.path.insert(0, str(_MUSU_CORE))

from musu_core.backends.local import LocalBackend
from musu_core.config import get_config

INSTRUCTIONS_DIR = Path(__file__).parent / "instructions"

AGENT_INSTRUCTIONS = {
    "ceo":      INSTRUCTIONS_DIR / "ceo.md",
    "cto":      INSTRUCTIONS_DIR / "cto.md",
    "engineer": INSTRUCTIONS_DIR / "engineer.md",
    "cos":      INSTRUCTIONS_DIR / "cos.md",
    "qa":       INSTRUCTIONS_DIR / "qa.md",
    "worker":   INSTRUCTIONS_DIR / "worker.md",
}


def main() -> None:
    cfg = get_config()
    db = LocalBackend(cfg.db_path)
    try:
        agents = db.list_agents()
        print(f"Found {len(agents)} agents in {cfg.db_path}")
        for agent in agents:
            name = agent["name"]
            if name not in AGENT_INSTRUCTIONS:
                print(f"  skip {name!r} — no instructions file defined")
                continue

            instructions_path = AGENT_INSTRUCTIONS[name]
            if not instructions_path.exists():
                print(f"  skip {name!r} — instructions file missing: {instructions_path}")
                continue

            current_config = agent.get("adapter_config", {})
            if current_config.get("instructions_path") == str(instructions_path):
                print(f"  {name}: already up to date")
                continue

            new_config = {**current_config, "instructions_path": str(instructions_path)}
            result = db.agents.update(agent["id"], adapter_config=new_config)
            if result:
                print(f"  {name}: updated → {instructions_path.name}")
            else:
                print(f"  {name}: update failed")
    finally:
        db.close()
    print("Done.")


if __name__ == "__main__":
    main()
