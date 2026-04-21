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
    assert "engineer" in agent_names
    assert "qa" in agent_names
    assert "planner" in agent_names


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
