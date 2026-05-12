import sqlite3
import pytest
from musu_core.db import _SCHEMA
from musu_core.migrations import apply_pending


def make_db():
    conn = sqlite3.connect(":memory:")
    conn.row_factory = sqlite3.Row
    conn.executescript(_SCHEMA)
    apply_pending(conn)
    return conn


def test_companies_has_status_column():
    conn = make_db()
    rows = conn.execute("PRAGMA table_info(companies)").fetchall()
    cols = {r["name"] for r in rows}
    assert "status" in cols
    assert "purpose" in cols


def test_company_status_default_active():
    conn = make_db()
    conn.execute(
        "INSERT INTO companies (id, name) VALUES ('c1', 'Test Co')"
    )
    conn.commit()
    row = conn.execute("SELECT status, purpose FROM companies WHERE id='c1'").fetchone()
    assert row["status"] == "active"
    assert row["purpose"] == ""


from company_templates import get_template, list_template_keys


def test_get_dev_team_template():
    t = get_template("dev-team")
    assert t is not None
    agent_names = [a["name"] for a in t["agents"]]
    assert "engineer" in agent_names
    assert "qa" in agent_names


def test_get_unknown_template_returns_none():
    assert get_template("nonexistent-template") is None


def test_list_template_keys_includes_dev_team():
    keys = list_template_keys()
    assert "dev-team" in keys
    assert "content-team" in keys
    assert "writer-studio" in keys


def test_get_writer_studio_template():
    t = get_template("writer-studio")
    assert t is not None
    agent_names = [a["name"] for a in t["agents"]]
    assert "studio-lead" in agent_names
    assert "studio-pm" in agent_names
    assert "studio-writer" in agent_names
    assert "studio-researcher" in agent_names
    assert "studio-editor" in agent_names


import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from handlers import create_company_from_template, set_company_status
from musu_core.backends.local import LocalBackend


def _fresh_backend(tmp_path):
    db_path = str(tmp_path / "test.db")
    return LocalBackend(db_path)


def test_create_company_from_template_dev_team(tmp_path):
    backend = _fresh_backend(tmp_path)
    result = create_company_from_template(
        name="MUSU Dev",
        template_key="dev-team",
        purpose="MUSU 소프트웨어 개발",
        backend=backend,
    )
    assert result["company"]["name"] == "MUSU Dev"
    assert result["company"]["purpose"] == "MUSU 소프트웨어 개발"
    assert result["company"]["status"] == "active"
    agent_names = [a["name"] for a in result["agents"]]
    # Agent names are prefixed with company_id[:8]
    assert any("engineer" in n for n in agent_names)
    assert any("qa" in n for n in agent_names)
    assert any("planner" in n for n in agent_names)
    # Verify company_id is set on created agents
    for a in result["agents"]:
        assert a["company_id"] == result["company"]["id"]


def test_create_company_from_template_unknown_raises(tmp_path):
    backend = _fresh_backend(tmp_path)
    with pytest.raises(ValueError, match="Unknown template"):
        create_company_from_template(
            name="X", template_key="nonexistent", purpose="", backend=backend
        )


def test_set_company_status_inactive(tmp_path):
    backend = _fresh_backend(tmp_path)
    company = backend.create_company(name="Test", workspace_id="ws1")
    cid = company["id"]
    updated = set_company_status(cid, "inactive", backend=backend)
    assert updated["status"] == "inactive"


def test_set_company_status_invalid_raises(tmp_path):
    backend = _fresh_backend(tmp_path)
    company = backend.create_company(name="Test", workspace_id="ws1")
    with pytest.raises(ValueError, match="status must be"):
        set_company_status(company["id"], "broken", backend=backend)


def _api_client():
    """Return a TestClient using the configured MUSU_BRIDGE_TOKEN."""
    import sys, os
    sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
    from fastapi.testclient import TestClient
    from server import app
    token = os.environ.get("MUSU_BRIDGE_TOKEN", "test-token")
    return TestClient(app, headers={"Authorization": f"Bearer {token}"})


def test_post_companies_with_template():
    client = _api_client()
    resp = client.post("/api/companies", json={
        "name": "MUSU Dev Team",
        "template_key": "dev-team",
        "purpose": "MUSU 소프트웨어 개발",
        "workspace_id": "ws-test",
    })
    assert resp.status_code == 200
    data = resp.json()
    assert "company" in data
    assert data["company"]["status"] == "active"
    assert any("engineer" in a["name"] for a in data["agents"])


def test_post_companies_no_template_returns_plain_company():
    client = _api_client()
    resp = client.post("/api/companies", json={"name": "Plain Co", "workspace_id": "ws-test"})
    assert resp.status_code == 200
    assert "id" in resp.json()


def test_activate_deactivate_company():
    client = _api_client()
    create = client.post("/api/companies", json={"name": "Toggle Co", "workspace_id": "ws-test"})
    assert create.status_code == 200
    cid = create.json()["id"]

    resp = client.post(f"/api/companies/{cid}/deactivate")
    assert resp.status_code == 200
    assert resp.json()["status"] == "inactive"

    resp = client.post(f"/api/companies/{cid}/activate")
    assert resp.status_code == 200
    assert resp.json()["status"] == "active"


# ── Phase 64: /run endpoint tests ────────────────────────────────────────────

def test_company_run_not_found():
    client = _api_client()
    resp = client.post("/api/companies/nonexistent-id/run")
    assert resp.status_code == 404


def test_company_run_inactive():
    client = _api_client()
    create = client.post("/api/companies", json={"name": "Inactive Co", "workspace_id": "ws-test"})
    assert create.status_code == 200
    cid = create.json()["id"]
    client.post(f"/api/companies/{cid}/deactivate")

    resp = client.post(f"/api/companies/{cid}/run")
    assert resp.status_code == 503


def test_company_run_active(monkeypatch):
    from unittest.mock import AsyncMock
    import uuid
    import server

    monkeypatch.setattr(server, "route_chat", AsyncMock(return_value={"id": "task-123", "status": "pending"}))

    client = _api_client()
    create = client.post(
        "/api/companies",
        json={"name": f"Run Co {uuid.uuid4().hex[:8]}", "workspace_id": "ws-test"},
    )
    assert create.status_code == 200
    cid = create.json()["id"]

    resp = client.post(f"/api/companies/{cid}/run")
    assert resp.status_code == 200
    data = resp.json()
    assert data["company_id"] == cid
    assert "task" in data


# ── Phase 64: get_goals / get_recent_tasks handler unit tests ─────────────────

from handlers import get_goals, get_recent_tasks


def test_get_goals_returns_list():
    result = get_goals()
    assert isinstance(result, list)


def test_get_recent_tasks_returns_list():
    result = get_recent_tasks(limit=5)
    assert isinstance(result, list)
