from __future__ import annotations

import json
import uuid
from copy import deepcopy
from pathlib import Path
from typing import Any

from musu_core.backends.local import LocalBackend

WRITER_COMPANY_ID = "a2699373-3700-4cbc-8477-c70e1d94cf8a"
WRITER_COMPANY_NAME = "Bloodline Writers"


def _normalize_company_row(row: dict[str, Any] | None) -> dict[str, Any] | None:
    if row is None:
        return None
    normalized = dict(row)
    meta = normalized.get("meta")
    if isinstance(meta, str):
        try:
            normalized["meta"] = json.loads(meta or "{}")
        except json.JSONDecodeError:
            pass
    return normalized


def build_writer_company_manifest(workspace_root: str = "/home/hugh51/writer") -> dict[str, Any]:
    workspace = Path(workspace_root).resolve()
    charter_path = workspace / ".musu" / "charter.md"
    defaults_path = workspace / ".musu" / "agent-defaults.json"
    manifest_path = workspace / ".musu" / "company.json"

    return {
        "company": {
            "id": WRITER_COMPANY_ID,
            "name": WRITER_COMPANY_NAME,
            "template_key": "writer-studio",
            "workspace_id": "ws-bloodline-writers",
            "status": "active",
            "purpose": (
                "Shared fiction studio for Bloodline and False Dane. "
                "Multi-agent planning, writing, editing, continuity review, and reference research "
                "for long-form serial fiction."
            ),
            "meta": {
                "workspace_root": str(workspace),
                "charter_path": str(charter_path),
                "agent_defaults_path": str(defaults_path),
                "company_manifest_path": str(manifest_path),
                "generator_evaluator_split": True,
                "contract_first": True,
                "canon_policy": "Project canon stays local. Workflow and craft may be shared.",
                "shared_os_page": str(workspace / "llm-wiki" / "wiki" / "51_BLOODLINE_WRITERS_SHARED_OS.md"),
                "role_contracts_page": str(workspace / "llm-wiki" / "wiki" / "54_AGENT_ROLE_CONTRACTS.md"),
                "workflow_page": str(workspace / "llm-wiki" / "wiki" / "53_SHARED_NOVEL_WORKFLOW.md"),
                "source_paths": {
                    "false_dane": str(workspace),
                    "bloodline_remote": "/home/hugh/bloodline_work",
                },
                "remote_access": {
                    "4060_false_dane": {
                        "base_url": "http://100.126.67.88:8070",
                        "path": str(workspace),
                    },
                    "5070_bloodline": {
                        "base_url": "http://100.121.211.106:8070",
                        "path": "/home/hugh/bloodline_work",
                    },
                },
            },
        },
        "projects": [
            {
                "name": "Bloodline",
                "status": "active",
                "assigned_to": "BW-PM-Bloodline",
            },
            {
                "name": "False Dane",
                "status": "active",
                "assigned_to": "BW-PM-FalseDane",
            },
        ],
        "agents": [
            {
                "name": "BW-Lead",
                "role": "Company Lead",
                "adapter_type": "claude_local",
                "adapter_config": {
                    "command": "claude",
                    "model": "claude-sonnet-4-6",
                    "dangerously_skip_permissions": True,
                    "timeout_sec": 600,
                    "cwd": str(workspace),
                    "instructions_path": "musu-bridge/instructions/team_lead.md",
                    "instructions": (
                        f"You are BW-Lead for {WRITER_COMPANY_NAME}.\n"
                        "You own company-level direction, shared studio rules, and cross-project prioritization.\n"
                        f"Primary workspace: {workspace}\n"
                        f"Read first: {workspace}/AGENTS.md, {workspace}/MEMORY.md, "
                        f"{workspace}/llm-wiki/wiki/51_BLOODLINE_WRITERS_SHARED_OS.md, "
                        f"{workspace}/llm-wiki/wiki/54_AGENT_ROLE_CONTRACTS.md.\n"
                        "Do not write project canon directly. Lock direction and route work."
                    ),
                },
                "fallback_chain": [
                    {"adapter_type": "gemini_local", "command": "gemini", "model": "gemini-2.5-pro"}
                ],
            },
            {
                "name": "BW-PM-Bloodline",
                "role": "Project Manager",
                "adapter_type": "gemini_local",
                "adapter_config": {
                    "command": "gemini",
                    "model": "gemini-2.5-flash",
                    "dangerously_skip_permissions": True,
                    "timeout_sec": 600,
                    "cwd": str(workspace),
                    "instructions_path": "musu-bridge/instructions/project_manager.md",
                    "instructions": (
                        f"You are BW-PM-Bloodline for {WRITER_COMPANY_NAME}.\n"
                        "Own Bloodline scope, canon safety, and sprint sequencing.\n"
                        f"Primary workspace: {workspace}\n"
                        "Never import False Dane canon without explicit approval."
                    ),
                },
                "fallback_chain": [
                    {"adapter_type": "claude_local", "command": "claude", "model": "claude-sonnet-4-6"}
                ],
            },
            {
                "name": "BW-PM-FalseDane",
                "role": "Project Manager",
                "adapter_type": "gemini_local",
                "adapter_config": {
                    "command": "gemini",
                    "model": "gemini-2.5-flash",
                    "dangerously_skip_permissions": True,
                    "timeout_sec": 600,
                    "cwd": str(workspace),
                    "instructions_path": "musu-bridge/instructions/project_manager.md",
                    "instructions": (
                        f"You are BW-PM-FalseDane for {WRITER_COMPANY_NAME}.\n"
                        "Own False Dane scope, canon safety, and sprint sequencing.\n"
                        f"Primary workspace: {workspace}\n"
                        "Never import Bloodline canon without explicit approval."
                    ),
                },
                "fallback_chain": [
                    {"adapter_type": "claude_local", "command": "claude", "model": "claude-sonnet-4-6"}
                ],
            },
            {
                "name": "BW-Researcher",
                "role": "Researcher",
                "adapter_type": "gemini_local",
                "adapter_config": {
                    "command": "gemini",
                    "model": "gemini-2.5-flash",
                    "dangerously_skip_permissions": True,
                    "timeout_sec": 600,
                    "cwd": str(workspace),
                    "instructions": (
                        f"You are BW-Researcher for {WRITER_COMPANY_NAME}.\n"
                        "Own evidence gathering, reference deconstruction, and uncertainty tracking.\n"
                        f"Primary workspace: {workspace}\n"
                        "Separate facts, recommendations, and canon candidates."
                    ),
                },
                "fallback_chain": [
                    {"adapter_type": "claude_local", "command": "claude", "model": "claude-sonnet-4-6"}
                ],
            },
            {
                "name": "BW-Writer",
                "role": "Writer",
                "adapter_type": "claude_local",
                "adapter_config": {
                    "command": "claude",
                    "model": "claude-sonnet-4-6",
                    "dangerously_skip_permissions": True,
                    "timeout_sec": 600,
                    "cwd": str(workspace),
                    "instructions": (
                        f"You are BW-Writer for {WRITER_COMPANY_NAME}.\n"
                        "Own draft production and revision only.\n"
                        f"Primary workspace: {workspace}\n"
                        "Work from sprint contracts, canon, and research. Do not self-approve."
                    ),
                },
                "fallback_chain": [
                    {"adapter_type": "gemini_local", "command": "gemini", "model": "gemini-2.5-pro"}
                ],
            },
            {
                "name": "BW-Editor",
                "role": "Editor",
                "adapter_type": "claude_local",
                "adapter_config": {
                    "command": "claude",
                    "model": "claude-sonnet-4-6",
                    "dangerously_skip_permissions": True,
                    "timeout_sec": 600,
                    "cwd": str(workspace),
                    "instructions": (
                        f"You are BW-Editor for {WRITER_COMPANY_NAME}.\n"
                        "Own quality review, continuity review, and revision briefs.\n"
                        f"Primary workspace: {workspace}\n"
                        "Score drafts, block drift, and issue revision direction. Do not silently expand scope."
                    ),
                },
                "fallback_chain": [
                    {"adapter_type": "gemini_local", "command": "gemini", "model": "gemini-2.5-pro"}
                ],
            },
        ],
    }


def load_writer_company_manifest(path: str | Path) -> dict[str, Any]:
    raw = json.loads(Path(path).read_text(encoding="utf-8"))
    return raw


def _deep_merge(base: dict[str, Any], override: dict[str, Any]) -> dict[str, Any]:
    merged = deepcopy(base)
    for key, value in override.items():
        if isinstance(value, dict) and isinstance(merged.get(key), dict):
            merged[key] = _deep_merge(merged[key], value)
        else:
            merged[key] = value
    return merged


def normalize_writer_company_manifest(raw: dict[str, Any], workspace_root: str = "/home/hugh51/writer") -> dict[str, Any]:
    default = build_writer_company_manifest(workspace_root=workspace_root)
    merged = _deep_merge(default, raw)
    return merged


def upsert_writer_company(backend: LocalBackend, manifest: dict[str, Any]) -> dict[str, Any]:
    company = manifest["company"]
    company_row = backend.create_company(
        company_id=company["id"],
        name=company["name"],
        template_key=company["template_key"],
        workspace_id=company["workspace_id"],
        meta=company["meta"],
    )
    company_row = backend.update_company(
        company["id"],
        status=company.get("status", "active"),
        purpose=company.get("purpose", ""),
        template_key=company.get("template_key", "writer-studio"),
        workspace_id=company.get("workspace_id", ""),
        meta=company.get("meta", {}),
        name=company.get("name", WRITER_COMPANY_NAME),
    )
    company_row = _normalize_company_row(company_row)

    agent_rows: list[dict[str, Any]] = []
    agent_name_to_id: dict[str, str] = {}
    for spec in manifest.get("agents", []):
        existing = backend.get_agent_by_name(spec["name"], company_id=company["id"])
        if existing is None:
            row = backend.agents.create(
                name=spec["name"],
                role=spec["role"],
                adapter_type=spec["adapter_type"],
                adapter_config=spec["adapter_config"],
                fallback_chain=spec.get("fallback_chain"),
                company_id=company["id"],
            )
            row_dict = {
                "id": row.id,
                "name": row.name,
                "role": row.role,
                "adapter_type": row.adapter_type,
                "adapter_config": row.adapter_config,
                "status": row.status,
                "company_id": row.company_id,
            }
        else:
            updated = backend.agents.update(
                existing["id"],
                role=spec["role"],
                adapter_type=spec["adapter_type"],
                adapter_config=spec["adapter_config"],
                status="active",
                fallback_chain=spec.get("fallback_chain"),
            )
            row_dict = {
                "id": updated.id,
                "name": updated.name,
                "role": updated.role,
                "adapter_type": updated.adapter_type,
                "adapter_config": updated.adapter_config,
                "status": updated.status,
                "company_id": company["id"],
            }
        agent_rows.append(row_dict)
        agent_name_to_id[spec["name"]] = row_dict["id"]

    existing_projects = {
        project["project_name"]: project
        for project in backend.list_projects(company_id=company["id"])
    }
    project_rows: list[dict[str, Any]] = []
    for spec in manifest.get("projects", []):
        assigned_to_name = spec.get("assigned_to")
        assigned_to_id = agent_name_to_id.get(assigned_to_name) if assigned_to_name else None
        existing = existing_projects.get(spec["name"])
        if existing is None:
            row = backend.create_project(
                project_id=spec.get("id") or str(uuid.uuid4()),
                company_id=company["id"],
                project_name=spec["name"],
                status=spec.get("status", "active"),
                assigned_to=assigned_to_id,
            )
        else:
            row = backend.update_project(
                existing["id"],
                project_name=spec["name"],
                status=spec.get("status", "active"),
                assigned_to=assigned_to_id,
            )
        project_rows.append(row)

    return {
        "company": company_row,
        "agents": agent_rows,
        "projects": project_rows,
    }
