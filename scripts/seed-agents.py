#!/usr/bin/env python3
"""Seed musu-core LocalBackend with company agents.

Usage:
  python3 scripts/seed-agents.py [--seeds scripts/agent-seeds.json] [--db ~/.musu/musu.db]
  python3 scripts/seed-agents.py --list   # just list existing agents
  python3 scripts/seed-agents.py --reset  # delete all agents and re-seed

Idempotent: agents already registered (by name) are skipped.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).parent.parent
MUSU_CORE_SRC = ROOT / "musu-core" / "src"
if str(MUSU_CORE_SRC) not in sys.path:
    sys.path.insert(0, str(MUSU_CORE_SRC))

DEFAULT_SEEDS = Path(__file__).parent / "agent-seeds.json"


def main() -> int:
    parser = argparse.ArgumentParser(description="Seed musu-core LocalBackend agents")
    parser.add_argument("--seeds", default=str(DEFAULT_SEEDS), help="Path to agent-seeds.json")
    parser.add_argument("--db", default=None, help="Path to musu.db (default: MUSU_DB_PATH or ~/.musu/musu.db)")
    parser.add_argument("--list", action="store_true", help="List existing agents and exit")
    parser.add_argument("--reset", action="store_true", help="Delete all agents before seeding")
    args = parser.parse_args()

    try:
        from musu_core.backends.local import LocalBackend
        from musu_core.config import get_config
    except ImportError as e:
        print(f"[seed-agents] ERROR: Cannot import musu-core: {e}")
        print(f"  Make sure musu-core is installed: pip install -e musu-core[dev]")
        print(f"  Or set PYTHONPATH: export PYTHONPATH={MUSU_CORE_SRC}")
        return 1

    db_path = args.db or os.environ.get("MUSU_DB_PATH") or str(Path.home() / ".musu" / "musu.db")
    Path(db_path).parent.mkdir(parents=True, exist_ok=True)

    backend = LocalBackend(db_path)

    if args.list:
        agents = backend.list_agents()
        if not agents:
            print("[seed-agents] No agents registered.")
        else:
            print(f"[seed-agents] {len(agents)} agent(s) in {db_path}:")
            for a in agents:
                print(f"  • {a['name']:12s}  role={a['role']:12s}  adapter={a['adapter_type']}")
        return 0

    if args.reset:
        agents = backend.list_agents()
        for a in agents:
            backend.agents.update(a["id"], status="retired")
        print(f"[seed-agents] Retired {len(agents)} existing agents.")

    seeds_path = Path(args.seeds)
    if not seeds_path.exists():
        print(f"[seed-agents] ERROR: Seeds file not found: {seeds_path}")
        return 1

    seeds = json.loads(seeds_path.read_text())
    created = 0
    skipped = 0

    for seed in seeds:
        name = seed["name"]
        existing = backend.get_agent_by_name(name)
        if existing and not args.reset:
            print(f"  [skip]   {name} (already registered)")
            skipped += 1
            continue

        fallback_chain = seed.get("fallback_chain")
        backend.agents.create(
            name=name,
            role=seed.get("role", name),
            adapter_type=seed.get("adapter_type", "claude_local"),
            adapter_config=seed.get("adapter_config", {}),
            fallback_chain=fallback_chain,
        )
        print(f"  [create] {name} ({seed.get('role', name)}, {seed.get('adapter_type', 'claude_local')})")
        created += 1

    print(f"\n[seed-agents] Done — {created} created, {skipped} skipped.")
    print(f"  DB: {db_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
