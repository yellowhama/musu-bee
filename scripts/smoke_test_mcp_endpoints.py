#!/usr/bin/env python3
"""Smoke test: call all 35 musu-bridge MCP-mapped endpoints, report pass/fail."""
import os, sys, json, asyncio
import httpx

BASE = os.getenv("MUSU_BRIDGE_URL", "http://localhost:8070")
TOKEN = os.getenv("MUSU_BRIDGE_TOKEN", "dev-token")
COMPANY_ID = os.getenv("PAPERCLIP_COMPANY_ID", "f27a9bd2-688a-450b-98b4-f63d24b0ab50")
HEADERS = {"Authorization": f"Bearer {TOKEN}"}

# Each tuple: (method, path, body_or_None)
# Placeholders {cid} are replaced with COMPANY_ID at runtime
ENDPOINTS = [
    # Agent group (6)
    ("GET",   "/api/companies/{cid}/agents",       None),
    ("GET",   "/api/agents/nonexistent-id",        None),  # expect 404, not 5xx
    ("POST",  "/api/agents/nonexistent-id/pause",  None),  # expect 404
    ("POST",  "/api/agents/nonexistent-id/resume", None),  # expect 404
    ("GET",   "/api/companies/{cid}/org-chart",    None),
    ("POST",  "/api/agents/nonexistent-id/heartbeat", None),  # expect 404
    # Issue group (5)
    ("GET",   "/api/companies/{cid}/issues",       None),
    ("POST",  "/api/companies/{cid}/issues",
              {"title": "smoke-test-issue", "description": "auto"}),
    ("GET",   "/api/issues/nonexistent-id",        None),  # 404
    ("PATCH", "/api/issues/nonexistent-id",        {"status": "in_progress"}),  # 404
    ("POST",  "/api/issues/nonexistent-id/checkout", {"agent_id": "smoke"}),  # 404
    # Comment group (2)
    ("GET",   "/api/issues/nonexistent-id/comments", None),  # 404
    ("POST",  "/api/issues/nonexistent-id/comments",
              {"author_id": "smoke", "body": "test"}),  # 404
    # Approval group (2)
    ("GET",   "/api/companies/{cid}/approvals",    None),
    ("POST",  "/api/approvals/nonexistent-id/approve", None),  # 404
    # Project group (3)
    ("GET",   "/api/companies/{cid}/projects",     None),
    ("GET",   "/api/projects/nonexistent-id",      None),  # 404
    ("POST",  "/api/companies/{cid}/projects",
              {"project_name": "smoke-proj"}),
    # Goal group (2)
    ("GET",   "/api/companies/{cid}/goals",        None),
    ("POST",  "/api/companies/{cid}/goals",        {"title": "smoke-goal"}),
    # Cost group (2)
    ("GET",   "/api/companies/{cid}/costs/summary",    None),
    ("GET",   "/api/companies/{cid}/costs/by-agent",   None),
    # Activity (1)
    ("GET",   "/api/companies/{cid}/activity",     None),
    # Watchdog / runs (2)
    ("GET",   "/api/companies/{cid}/runs",         None),
    ("GET",   "/api/runs/nonexistent-id",          None),  # 404
    # Tasks (2)
    ("GET",   "/api/companies/{cid}/tasks",        None),
    ("GET",   "/api/tasks/nonexistent-id",         None),  # 404
    # Delegation (1)
    ("POST",  "/api/companies/{cid}/tasks",
              {"title": "smoke-task", "assigned_to": "smoke-agent"}),
    # Dashboard (1)
    ("GET",   "/api/companies/{cid}/dashboard",    None),
    # Peer / admin (3)
    ("GET",   "/api/admin/peer-status",            None),
    ("GET",   "/api/admin/discovered",             None),
    ("GET",   "/api/nodes",                        None),
    # Index search (1)
    ("GET",   "/api/index-search?q=test",          None),
    # Company CRUD (2)
    ("GET",   "/api/companies",                    None),
    ("GET",   f"/api/companies/{COMPANY_ID}",      None),
]

async def run():
    passed, failed = 0, []
    async with httpx.AsyncClient(headers=HEADERS, timeout=10) as client:
        for method, path, body in ENDPOINTS:
            url = BASE + path.replace("{cid}", COMPANY_ID)
            try:
                if method == "GET":
                    r = await client.get(url)
                elif method == "POST":
                    r = await client.post(url, json=body or {})
                elif method == "PATCH":
                    r = await client.patch(url, json=body or {})
                else:
                    r = await client.request(method, url, json=body)
                ok = r.status_code < 500
                if ok:
                    passed += 1
                    print(f"  ✅ {method:6} {path[:60]:<60} → {r.status_code}")
                else:
                    failed.append((method, path, r.status_code, r.text[:120]))
                    print(f"  ❌ {method:6} {path[:60]:<60} → {r.status_code}")
            except Exception as e:
                failed.append((method, path, "ERR", str(e)))
                print(f"  💥 {method:6} {path[:60]:<60} → {e}")

    print(f"\n{'='*60}")
    print(f"RESULT: {passed}/{len(ENDPOINTS)} passed")
    if failed:
        print("\nFAILED:")
        for m, p, code, body in failed:
            print(f"  {m} {p} → {code}: {body}")
    return 1 if failed else 0

if __name__ == "__main__":
    sys.exit(asyncio.run(run()))
