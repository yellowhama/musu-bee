"""One-time script: create the MUSU Dev Team company with purpose-built agents."""
import os
import requests

BASE = "http://localhost:8070"
TOKEN = os.environ["MUSU_BRIDGE_TOKEN"]
H = {"Authorization": f"Bearer {TOKEN}"}

resp = requests.post(
    f"{BASE}/api/companies",
    headers=H,
    json={
        "name": "MUSU Dev Team",
        "template_key": "dev-team",
        "purpose": (
            "MUSU 소프트웨어 개발. "
            "musu-functions 레포 (/home/hugh51/musu-functions)에서 "
            "Phase 52(VNC TTL), Phase 53(musu-core 테스트) 등을 구현한다."
        ),
        "work_dir": "/home/hugh51/musu-functions",
        "test_cmd": (
            "cd /home/hugh51/musu-functions && "
            "python -m pytest musu-bridge/tests/ -q"
        ),
        "workspace_id": "ws-musu",
    },
)
print(resp.status_code, resp.json())
