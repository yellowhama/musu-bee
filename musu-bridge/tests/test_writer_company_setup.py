import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MUSU_CORE_SRC = ROOT.parent / "musu-core" / "src"
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(MUSU_CORE_SRC))

from musu_core.backends.local import LocalBackend
from writer_company import (
    WRITER_COMPANY_ID,
    audit_writer_company_drift,
    build_writer_company_manifest,
    normalize_writer_company_manifest,
    upsert_writer_company,
)


def _fresh_backend(tmp_path):
    db_path = str(tmp_path / "writer-company.db")
    return LocalBackend(db_path)


def test_upsert_writer_company_creates_company_agents_and_projects(tmp_path):
    backend = _fresh_backend(tmp_path)
    manifest = normalize_writer_company_manifest(
        build_writer_company_manifest(workspace_root=str(tmp_path / "writer"))
    )

    result = upsert_writer_company(backend, manifest)

    assert result["company"]["id"] == WRITER_COMPANY_ID
    assert result["company"]["template_key"] == "writer-studio"
    assert result["company"]["status"] == "active"
    assert result["company"]["purpose"]

    agent_names = sorted(agent["name"] for agent in result["agents"])
    assert agent_names == [
        "BW-Editor",
        "BW-Lead",
        "BW-PM-Bloodline",
        "BW-PM-FalseDane",
        "BW-Researcher",
        "BW-TrendResearcher",
        "BW-Writer",
    ]

    projects = {row["project_name"]: row for row in result["projects"]}
    assert set(projects) == {"Bloodline", "False Dane"}
    assert projects["Bloodline"]["assigned_to"]
    assert projects["False Dane"]["assigned_to"]


def test_upsert_writer_company_updates_existing_company_and_preserves_fixed_handles(tmp_path):
    backend = _fresh_backend(tmp_path)
    manifest = normalize_writer_company_manifest(
        build_writer_company_manifest(workspace_root=str(tmp_path / "writer"))
    )
    upsert_writer_company(backend, manifest)

    mutated = json.loads(json.dumps(manifest))
    mutated["company"]["purpose"] = "updated purpose"
    mutated["company"]["meta"]["contract_first"] = False

    result = upsert_writer_company(backend, mutated)

    assert result["company"]["purpose"] == "updated purpose"
    assert result["company"]["meta"]["contract_first"] is False
    assert len(backend.list_agents(company_id=WRITER_COMPANY_ID)) == 7


def test_upsert_writer_company_merges_case_variant_agents_and_retires_duplicates(tmp_path):
    backend = _fresh_backend(tmp_path)
    backend.create_company(company_id=WRITER_COMPANY_ID, name="Bloodline Writers", template_key="writer-studio", workspace_id="ws")
    lower = backend.create_agent(name="bw-writer", role="Writer", adapter_type="claude_local", adapter_config={"instructions": "old"}, company_id=WRITER_COMPANY_ID)
    backend.create_agent(name="BW-Writer", role="Writer", adapter_type="claude_local", adapter_config={"instructions": "older"}, company_id=WRITER_COMPANY_ID)
    issue = backend.create_issue(company_id=WRITER_COMPANY_ID, title="writer issue", assignee_id=lower["id"])

    manifest = normalize_writer_company_manifest(
        build_writer_company_manifest(workspace_root=str(tmp_path / "writer"))
    )
    result = upsert_writer_company(backend, manifest)

    active_agents = [a for a in backend.list_agents(company_id=WRITER_COMPANY_ID) if a["status"] == "active"]
    writer_agents = [a for a in active_agents if a["name"].lower() == "bw-writer"]
    assert len(writer_agents) == 1
    assert writer_agents[0]["name"] == "BW-Writer"
    assert "trend memos" in writer_agents[0]["adapter_config"]["instructions"]
    retired_agents = [a for a in backend.list_agents(company_id=WRITER_COMPANY_ID) if a["status"] == "retired"]
    assert any(a["name"].lower() == "bw-writer" for a in retired_agents)
    migrated_issue = backend.get_issue(issue["id"])
    assert migrated_issue["assigneeAgentId"] == writer_agents[0]["id"]
    assert any(agent["name"] == "BW-Writer" for agent in result["agents"])


def test_audit_writer_company_drift_reports_healthy_for_fresh_manifest(tmp_path):
    backend = _fresh_backend(tmp_path)
    manifest = normalize_writer_company_manifest(
        build_writer_company_manifest(workspace_root=str(tmp_path / "writer"))
    )
    upsert_writer_company(backend, manifest)

    audit = audit_writer_company_drift(backend, manifest)

    assert audit["status"] == "healthy"
    assert audit["gapCount"] == 0


def test_audit_writer_company_drift_detects_adapter_drift(tmp_path):
    backend = _fresh_backend(tmp_path)
    manifest = normalize_writer_company_manifest(
        build_writer_company_manifest(workspace_root=str(tmp_path / "writer"))
    )
    upsert_writer_company(backend, manifest)
    writer = backend.get_agent_by_name("BW-Writer", company_id=WRITER_COMPANY_ID)
    assert writer is not None
    backend.update_agent(writer["id"], adapter_config={"command": "claude", "model": "wrong-model"})

    audit = audit_writer_company_drift(backend, manifest)

    assert audit["status"] == "soft_gap"
    assert any(gap["code"] == "agent_adapter_drift" and gap["agent"] == "BW-Writer" for gap in audit["gaps"])


def test_local_backend_list_issues_supports_csv_status(tmp_path):
    backend = _fresh_backend(tmp_path)
    backend.create_company(company_id=WRITER_COMPANY_ID, name="Bloodline Writers", template_key="writer-studio", workspace_id="ws")
    backend.create_issue(company_id=WRITER_COMPANY_ID, title="open issue", status="open")
    backend.create_issue(company_id=WRITER_COMPANY_ID, title="in progress issue", status="in_progress")
    backend.create_issue(company_id=WRITER_COMPANY_ID, title="closed issue", status="closed")

    rows = backend.list_issues(WRITER_COMPANY_ID, status="open,in_progress")

    assert sorted(row["status"] for row in rows) == ["in_progress", "open"]


def test_local_backend_goal_surface_exposes_project_links(tmp_path):
    backend = _fresh_backend(tmp_path)
    backend.create_company(company_id=WRITER_COMPANY_ID, name="Bloodline Writers", template_key="writer-studio", workspace_id="ws")
    project = backend.create_project(
        project_id="project-fd",
        company_id=WRITER_COMPANY_ID,
        project_name="False Dane",
        status="active",
    )
    goal = backend.create_goal(
        goal_id="goal-fd",
        company_id=WRITER_COMPANY_ID,
        title="False Dane sprint",
        status="active",
    )
    backend.create_issue(
        company_id=WRITER_COMPANY_ID,
        title="writer issue",
        goal_id=goal["id"],
        project_id=project["id"],
    )

    rows = backend.list_goals(WRITER_COMPANY_ID)

    assert rows[0]["projectId"] == "project-fd"
    assert rows[0]["projectName"] == "False Dane"
    assert rows[0]["projectIds"] == ["project-fd"]
    assert rows[0]["projectNames"] == ["False Dane"]
    assert rows[0]["linkedIssueCount"] == 1
