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
    assert len(backend.list_agents(company_id=WRITER_COMPANY_ID)) == 6
