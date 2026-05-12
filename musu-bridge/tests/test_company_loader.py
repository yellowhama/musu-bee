"""company_loader: yaml-driven company manifest loading (v11-iso1)."""
from __future__ import annotations

import os
from pathlib import Path

import pytest

from company_loader import (
    adapter_config_for_agent,
    agents,
    channel_routing,
    company_id,
    load_company_manifest,
    resolve_company_yaml_path,
    workspace_root,
)


VALID_YAML = """
id: 00000000-0000-0000-0000-000000000001
name: "Test Company"
workspace_root: /tmp/test-company
agents:
  - name: TC-Lead
    role: Lead
    adapter_type: gemini_local
    model: gemini-2.5-pro
    instructions_path: agents/lead.md
    timeout_sec: 600
channel_routing:
  team_lead: TC-Lead
  ceo: TC-Lead
"""


def test_load_returns_empty_when_no_env_no_explicit(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("MUSU_COMPANY_YAML", raising=False)
    monkeypatch.delenv("MUSU_COMPANY_ID", raising=False)
    manifest = load_company_manifest()
    assert manifest == {}
    assert company_id(manifest) is None
    assert workspace_root(manifest) is None
    assert agents(manifest) == []
    assert channel_routing(manifest) == {}


def test_load_valid_yaml(tmp_path: Path) -> None:
    yaml_path = tmp_path / "tc.yaml"
    yaml_path.write_text(VALID_YAML)

    manifest = load_company_manifest(yaml_path)
    assert manifest["id"] == "00000000-0000-0000-0000-000000000001"
    assert manifest["name"] == "Test Company"
    assert workspace_root(manifest) == "/tmp/test-company"
    assert len(agents(manifest)) == 1
    assert agents(manifest)[0]["name"] == "TC-Lead"
    assert channel_routing(manifest) == {"team_lead": "TC-Lead", "ceo": "TC-Lead"}


def test_load_env_var_resolves(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    yaml_path = tmp_path / "tc.yaml"
    yaml_path.write_text(VALID_YAML)

    monkeypatch.setenv("MUSU_COMPANY_YAML", str(yaml_path))
    manifest = load_company_manifest()
    assert manifest["id"] == "00000000-0000-0000-0000-000000000001"


def test_load_missing_required_key_raises(tmp_path: Path) -> None:
    bad = tmp_path / "bad.yaml"
    bad.write_text("id: 1\nname: x\n")  # missing workspace_root/agents/channel_routing

    with pytest.raises(ValueError, match="missing required keys"):
        load_company_manifest(bad)


def test_load_missing_file_returns_empty(tmp_path: Path) -> None:
    manifest = load_company_manifest(tmp_path / "does-not-exist.yaml")
    assert manifest == {}


def test_resolve_path_priority(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    explicit = tmp_path / "explicit.yaml"
    env_path = tmp_path / "env.yaml"
    monkeypatch.setenv("MUSU_COMPANY_YAML", str(env_path))

    # explicit beats env
    assert resolve_company_yaml_path(explicit) == explicit
    # env beats id
    monkeypatch.setenv("MUSU_COMPANY_ID", "some-id")
    assert resolve_company_yaml_path() == env_path

    # only id → ~/.musu/companies/<id>.yaml under MUSU_HOME
    monkeypatch.delenv("MUSU_COMPANY_YAML", raising=False)
    monkeypatch.setenv("MUSU_HOME", str(tmp_path))
    assert resolve_company_yaml_path() == tmp_path / "companies" / "some-id.yaml"


def test_adapter_config_for_agent_resolves_relative_instructions(tmp_path: Path) -> None:
    spec = {
        "name": "X",
        "model": "gemini-2.5-pro",
        "instructions_path": "agents/x.md",
        "timeout_sec": 120,
    }
    cfg = adapter_config_for_agent(spec, workspace_root_path=str(tmp_path))
    assert cfg["instructions_path"] == str(tmp_path / "agents" / "x.md")
    assert cfg["cwd"] == str(tmp_path)
    assert cfg["model"] == "gemini-2.5-pro"
    assert cfg["timeout_sec"] == 120
