"""Tests for writer_company.py (legacy BW manifest builder).

The BW manifest tests (manifest assembly + drift audit) run only when
MUSU_WRITER_COMPANY_TESTS=1 — they depend on operator-specific data baked
into writer_company.py. Generic-deployment installs should not run them.

The CSV-status and goal-surface backend tests are kept and genericized
because they exercise the LocalBackend, not the BW manifest itself.
"""

import json
import os
import sys
from pathlib import Path

import pytest

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


_BW_TESTS_ENABLED = os.environ.get("MUSU_WRITER_COMPANY_TESTS") == "1"
_BW_SKIP = pytest.mark.skipif(
    not _BW_TESTS_ENABLED,
    reason="MUSU_WRITER_COMPANY_TESTS=1 required (operator's BW manifest fixture).",
)


def _fresh_backend(tmp_path):
    db_path = str(tmp_path / "writer-company.db")
    return LocalBackend(db_path)


@_BW_SKIP
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
    hardening = result["company"]["meta"]["production_hardening"]
    assert "required_order" in hardening
    assert hardening["required_order"][0] == "reader_avatar_check"

    agent_names = [agent["name"] for agent in result["agents"]]
    assert len(agent_names) >= 1
    assert all(name for name in agent_names)


@_BW_SKIP
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
    expected_agent_count = len(manifest["agents"])
    assert len(backend.list_agents(company_id=WRITER_COMPANY_ID)) == expected_agent_count


@_BW_SKIP
def test_audit_writer_company_drift_reports_healthy_for_fresh_manifest(tmp_path):
    backend = _fresh_backend(tmp_path)
    manifest = normalize_writer_company_manifest(
        build_writer_company_manifest(workspace_root=str(tmp_path / "writer"))
    )
    upsert_writer_company(backend, manifest)

    audit = audit_writer_company_drift(backend, manifest)

    assert audit["status"] == "healthy"
    assert audit["gapCount"] == 0


@_BW_SKIP
def test_audit_writer_company_drift_detects_adapter_drift(tmp_path):
    backend = _fresh_backend(tmp_path)
    manifest = normalize_writer_company_manifest(
        build_writer_company_manifest(workspace_root=str(tmp_path / "writer"))
    )
    upsert_writer_company(backend, manifest)
    first_agent_name = manifest["agents"][0]["name"]
    agent = backend.get_agent_by_name(first_agent_name, company_id=WRITER_COMPANY_ID)
    assert agent is not None
    backend.update_agent(agent["id"], adapter_config={"command": "claude", "model": "wrong-model"})

    audit = audit_writer_company_drift(backend, manifest)

    assert audit["status"] == "soft_gap"
    assert any(
        gap["code"] == "agent_adapter_drift" and gap["agent"] == first_agent_name
        for gap in audit["gaps"]
    )


# ── Generic backend tests (no BW dependency) ──────────────


def test_local_backend_list_issues_supports_csv_status(tmp_path):
    backend = _fresh_backend(tmp_path)
    company_id = "test-company-csv"
    backend.create_company(
        company_id=company_id,
        name="Test Company",
        template_key="writer-studio",
        workspace_id="ws",
    )
    backend.create_issue(company_id=company_id, title="open issue", status="open")
    backend.create_issue(company_id=company_id, title="in progress issue", status="in_progress")
    backend.create_issue(company_id=company_id, title="closed issue", status="closed")

    rows = backend.list_issues(company_id, status="open,in_progress")

    assert sorted(row["status"] for row in rows) == ["in_progress", "open"]


def test_local_backend_goal_surface_exposes_project_links(tmp_path):
    backend = _fresh_backend(tmp_path)
    company_id = "test-company-goal"
    backend.create_company(
        company_id=company_id,
        name="Test Company",
        template_key="writer-studio",
        workspace_id="ws",
    )
    project = backend.create_project(
        project_id="project-x",
        company_id=company_id,
        project_name="Demo Project",
        status="active",
    )
    goal = backend.create_goal(
        goal_id="goal-x",
        company_id=company_id,
        title="Demo sprint",
        status="active",
    )
    backend.create_issue(
        company_id=company_id,
        title="writer issue",
        goal_id=goal["id"],
        project_id=project["id"],
    )

    rows = backend.list_goals(company_id)

    assert rows[0]["projectId"] == "project-x"
    assert rows[0]["projectName"] == "Demo Project"
    assert rows[0]["projectIds"] == ["project-x"]
    assert rows[0]["projectNames"] == ["Demo Project"]
    assert rows[0]["linkedIssueCount"] == 1
