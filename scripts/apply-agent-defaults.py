#!/usr/bin/env python3
"""Apply global agent-defaults.json to local DB.

Run on each node after git pull to sync model distribution.
Usage: python scripts/apply-agent-defaults.py
"""
import json
import fnmatch
import sqlite3
import os
import sys

DB_PATH = os.environ.get("MUSU_DB_PATH", os.path.expanduser("~/.musu/musu.db"))
DEFAULTS_PATH = os.path.join(os.path.dirname(__file__), "..", ".musu", "agent-defaults.json")


def main():
    with open(DEFAULTS_PATH) as f:
        defaults = json.load(f)

    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row

    agents = conn.execute("SELECT id, name, adapter_type FROM agents WHERE status='active'").fetchall()
    updated = 0

    for group_name, group in defaults["model_distribution"].items():
        patterns = group["agents"]
        adapter_type = group["adapter_type"]
        config = group.get("config", {})
        fallback = group.get("fallback")
        fallback_json = json.dumps([fallback]) if fallback else None

        for agent in agents:
            name = agent["name"]
            matched = any(fnmatch.fnmatch(name, p) for p in patterns)
            if not matched:
                continue

            # Update adapter_type + config
            current_config = conn.execute(
                "SELECT adapter_config FROM agents WHERE id = ?", (agent["id"],)
            ).fetchone()
            current = json.loads(current_config["adapter_config"]) if current_config else {}
            current.update(config)

            conn.execute(
                "UPDATE agents SET adapter_type = ?, adapter_config = ?, fallback_chain = ? WHERE id = ?",
                (adapter_type, json.dumps(current), fallback_json, agent["id"]),
            )
            updated += 1
            print(f"  {name:25s} -> {adapter_type} ({group_name})")

    conn.commit()
    conn.close()
    print(f"\nApplied {updated} agent(s) from agent-defaults.json")


if __name__ == "__main__":
    main()
