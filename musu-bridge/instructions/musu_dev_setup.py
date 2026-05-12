"""One-time provisioning script: create a generic dev-team company.

Reads the bridge URL/token + work-dir from env so operators can target any
machine. No hardcoded paths.

Usage:
    MUSU_BRIDGE_TOKEN=... \\
    MUSU_FUNCTIONS_ROOT=$HOME/musu-functions \\
    python musu_dev_setup.py
"""
from __future__ import annotations

import os
from pathlib import Path

import requests

BASE = os.environ.get("MUSU_BRIDGE_URL", "http://localhost:8070")
TOKEN = os.environ["MUSU_BRIDGE_TOKEN"]
WORK_DIR = os.environ.get("MUSU_FUNCTIONS_ROOT", str(Path.home() / "musu-functions"))
COMPANY_NAME = os.environ.get("MUSU_DEV_COMPANY_NAME", "MUSU Dev Team")

H = {"Authorization": f"Bearer {TOKEN}"}

resp = requests.post(
    f"{BASE}/api/companies",
    headers=H,
    json={
        "name": COMPANY_NAME,
        "template_key": "dev-team",
        "purpose": (
            f"MUSU software development. Working from {WORK_DIR}, "
            "the dev-team agents (lead/planner/engineer/qa) implement features "
            "and run tests against the local checkout."
        ),
        "work_dir": WORK_DIR,
        "test_cmd": f"cd {WORK_DIR} && python -m pytest musu-bridge/tests/ -q",
        "workspace_id": "ws-musu",
    },
)
print(resp.status_code, resp.json())
