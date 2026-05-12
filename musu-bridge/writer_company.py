from __future__ import annotations

import json
import uuid
from copy import deepcopy
from pathlib import Path
from typing import Any

from musu_core.backends.local import LocalBackend

# v11-iso1: Company id/name now live in ~/.musu/companies/<id>.yaml. The
# constants below are *legacy fallback only* and used when MUSU_COMPANY_YAML
# is not configured (deployment default = no company configured). Production
# tooling should call company_loader.company_id() / .name() against the
# resolved manifest.
WRITER_COMPANY_ID = "a2699373-3700-4cbc-8477-c70e1d94cf8a"
WRITER_COMPANY_NAME = "Bloodline Writers"
GEMINI_PRO_MODEL = "gemini-2.5-pro"
GEMINI_FLASH_MODEL = "gemini-2.5-flash"
CODEX_MODEL = "gpt-5.3-codex"


def _agent_name_key(value: str) -> str:
    return str(value or "").strip().lower()


def _reassign_company_issues(backend: LocalBackend, company_id: str, from_agent_id: str, to_agent_id: str) -> None:
    if not from_agent_id or not to_agent_id or from_agent_id == to_agent_id:
        return
    backend._db.execute(  # internal maintenance path for writer-company dedupe
        """
        UPDATE issues
        SET assignee_id = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
        WHERE company_id = ? AND assignee_id = ?
        """,
        (to_agent_id, company_id, from_agent_id),
    )


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


def _resolve_default_workspace_root() -> str:
    """Resolve workspace_root from active company yaml; fall back to legacy path."""
    try:
        from company_loader import load_company_manifest, workspace_root as _wr
        manifest = load_company_manifest()
        ws = _wr(manifest)
        if ws:
            return ws
    except Exception:
        pass
    # Legacy fallback. v11-iso1 leaves this for the migration window;
    # remove after all callers pass workspace_root explicitly.
    import os as _os
    return _os.environ.get("MUSU_WRITER_WORKSPACE", str(Path.home() / "writer"))


def build_writer_company_manifest(workspace_root: str | None = None) -> dict[str, Any]:
    if workspace_root is None:
        workspace_root = _resolve_default_workspace_root()
    workspace = Path(workspace_root).resolve()
    charter_path = workspace / ".musu" / "charter.md"
    defaults_path = workspace / ".musu" / "agent-defaults.json"
    manifest_path = workspace / ".musu" / "company.json"
    instructions_root = Path(__file__).resolve().parent / "instructions"
    workflow_hardening_page = workspace / "llm-wiki" / "wiki" / "183_BLOODLINE_WRITERS_AI_WORKFLOW_HARDENING_2026_04_29.md"
    production_hardening = {
        "updated": "2026-04-29",
        "required_order": [
            "reader_avatar_check",
            "curated_context_pack",
            "character_rows",
            "scene_file",
            "primer_accept_or_redo",
            "beat_list",
            "failure_beats",
            "plain_korean_draft",
            "mouthfeel_pass",
            "narrow_checks",
            "limited_revision",
        ],
        "role_gates": {
            "BW-Lead": "Keep the hardened production order mandatory across Bloodline Writers.",
            "BW-PM-FalseDane": "Before prose work, require reader target, curated context, character rows, scene design, small beats, and failure beats.",
            "BW-PM-Hunter-Reborn": "Lock canon SSOT (TAEJAGWI / CANON_CORRECTION_GY / prose_rules) before chapter work. Watch signature-suppression (포식) and INDEX v consistency.",
            "BW-Researcher": "Deliver curated context only. Separate facts, uncertainty, and story-use notes.",
            "BW-TrendResearcher": "Maintain reader avatar, comparison books, trope promises, and packaging notes.",
            "BW-Writer": "Draft only from accepted beats. Plain Korean comes before mouthfeel.",
            "BW-Editor": "Run narrow checks and write an improvement plan before any revision.",
        },
        "reference_pages": [
            str(workflow_hardening_page),
            str(workspace / "llm-wiki" / "wiki" / "179_FALSE_DANE_CH003_V7_CHARACTER_AUTOMATION_2026_04_29.md"),
            str(workspace / "llm-wiki" / "wiki" / "180_FALSE_DANE_PROMPTING_TECHNIQUE_WORKFLOW_2026_04_29.md"),
            str(workspace / "llm-wiki" / "wiki" / "181_FALSE_DANE_AI_BOOK_WORKFLOW_REFERENCE_2026_04_29.md"),
            str(workspace / "llm-wiki" / "wiki" / "182_FALSE_DANE_READER_AVATAR_MARKET_RESEARCH_2026_04_29.md"),
        ],
    }

    def gemini_config(model: str, instructions_file: str | None = None) -> dict[str, Any]:
        config: dict[str, Any] = {
            "command": "gemini",
            "model": model,
            "yolo": True,
            "timeout_sec": 600,
            "cwd": str(workspace),
        }
        if instructions_file:
            config["instructions_path"] = str(instructions_root / instructions_file)
        return config

    def codex_fallback() -> list[dict[str, Any]]:
        return [
            {
                "adapter_type": "codex_local",
                "command": "codex",
                "model": CODEX_MODEL,
                "full_auto": True,
                "timeout_sec": 600,
            }
        ]

    return {
        "company": {
            "id": WRITER_COMPANY_ID,
            "name": WRITER_COMPANY_NAME,
            "template_key": "writer-studio",
            "workspace_id": "ws-bloodline-writers",
            "status": "active",
            "purpose": (
                "Shared fiction studio for Bloodline and False Dane. "
                "Multi-agent planning, writing, editing, continuity review, reference research, "
                "and market/trend research for long-form serial fiction with KR/EN bilingual release intent."
            ),
            "meta": {
                "workspace_root": str(workspace),
                "charter_path": str(charter_path),
                "agent_defaults_path": str(defaults_path),
                "company_manifest_path": str(manifest_path),
                "generator_evaluator_split": True,
                "contract_first": True,
                "canon_policy": "Project canon stays local. Workflow, craft, and market-fit lessons may be shared.",
                "release_languages": ["ko", "en"],
                "trend_markets": ["kr", "us", "jp"],
                "model_policy": {
                    "primary": "gemini",
                    "secondary": "codex",
                    "disabled": ["claude_local", "claude"],
                    "reason": "Avoid Claude Code usage limits; Gemini has the largest remaining quota and should carry the Bloodline Writers workload.",
                    "role_defaults": {
                        "BW-Lead": GEMINI_PRO_MODEL,
                        "BW-Writer": GEMINI_PRO_MODEL,
                        "BW-Editor": GEMINI_PRO_MODEL,
                        "BW-PM-*": GEMINI_FLASH_MODEL,
                        "BW-Researcher": GEMINI_FLASH_MODEL,
                        "BW-TrendResearcher": GEMINI_FLASH_MODEL,
                    },
                    "fallback": {
                        "adapter_type": "codex_local",
                        "model": CODEX_MODEL,
                    },
                },
                "production_hardening": production_hardening,
                "shared_os_page": str(workspace / "llm-wiki" / "wiki" / "51_BLOODLINE_WRITERS_SHARED_OS.md"),
                "role_contracts_page": str(workspace / "llm-wiki" / "wiki" / "54_AGENT_ROLE_CONTRACTS.md"),
                "workflow_page": str(workspace / "llm-wiki" / "wiki" / "53_SHARED_NOVEL_WORKFLOW.md"),
                "workflow_hardening_page": str(workflow_hardening_page),
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
            {
                "name": "Hunter Reborn",
                "status": "active",
                "assigned_to": "BW-PM-Hunter-Reborn",
            },
        ],
        "agents": [
            {
                "name": "BW-Lead",
                "role": "Company Lead",
                "adapter_type": "gemini_local",
                "adapter_config": {
                    **gemini_config(GEMINI_PRO_MODEL, "team_lead.md"),
                    "instructions": (
                        f"You are BW-Lead for {WRITER_COMPANY_NAME}.\n"
                        "You own company-level direction, shared studio rules, and cross-project prioritization.\n"
                        f"Primary workspace: {workspace}\n"
                        f"Read first: {workspace}/AGENTS.md, {workspace}/MEMORY.md, "
                        f"{workspace}/llm-wiki/wiki/51_BLOODLINE_WRITERS_SHARED_OS.md, "
                        f"{workspace}/llm-wiki/wiki/54_AGENT_ROLE_CONTRACTS.md, "
                        f"{workflow_hardening_page}.\n"
                        "Enforce the hardened production order before assigning draft work.\n"
                        "Do not write project canon directly. Lock direction and route work."
                    ),
                },
                "fallback_chain": codex_fallback(),
            },
            {
                "name": "BW-PM-Bloodline",
                "role": "Project Manager",
                "adapter_type": "gemini_local",
                "adapter_config": {
                    **gemini_config(GEMINI_FLASH_MODEL, "project_manager.md"),
                    "instructions": (
                        f"You are BW-PM-Bloodline for {WRITER_COMPANY_NAME}.\n"
                        "Own Bloodline scope, canon safety, and sprint sequencing.\n"
                        f"Primary workspace: {workspace}\n"
                        "Never import False Dane canon without explicit approval."
                    ),
                },
                "fallback_chain": codex_fallback(),
            },
            {
                "name": "BW-PM-FalseDane",
                "role": "Project Manager",
                "adapter_type": "gemini_local",
                "adapter_config": {
                    **gemini_config(GEMINI_FLASH_MODEL, "project_manager.md"),
                    "instructions": (
                        f"You are BW-PM-FalseDane for {WRITER_COMPANY_NAME}.\n"
                        "Own False Dane scope, canon safety, and sprint sequencing.\n"
                        f"Primary workspace: {workspace}\n"
                        "Before prose work, require reader target, curated context, character rows, scene design, small beats, and failure beats.\n"
                        "Never import Bloodline canon without explicit approval."
                    ),
                },
                "fallback_chain": codex_fallback(),
            },
            {
                "name": "BW-PM-Hunter-Reborn",
                "role": "Project Manager",
                "adapter_type": "gemini_local",
                "adapter_config": {
                    **gemini_config(GEMINI_FLASH_MODEL, "project_manager.md"),
                    "instructions": (
                        f"You are BW-PM-Hunter-Reborn for {WRITER_COMPANY_NAME}.\n"
                        "Own Hunter Reborn scope, canon safety, and sprint sequencing.\n"
                        f"Primary workspace: {workspace}\n"
                        "Lock canon SSOT (TAEJAGWI / CANON_CORRECTION_GY / prose_rules) before chapter work.\n"
                        "Watch signature-suppression (포식) and INDEX v consistency.\n"
                        "Never import False Dane or Bloodline canon without explicit approval."
                    ),
                },
                "fallback_chain": codex_fallback(),
            },
            {
                "name": "BW-Researcher",
                "role": "Researcher",
                "adapter_type": "gemini_local",
                "adapter_config": {
                    **gemini_config(GEMINI_FLASH_MODEL),
                    "instructions": (
                        f"You are BW-Researcher for {WRITER_COMPANY_NAME}.\n"
                        "Own evidence gathering, reference deconstruction, and uncertainty tracking.\n"
                        f"Primary workspace: {workspace}\n"
                        "Deliver curated context only. Separate facts, uncertainty, recommendations, and canon candidates."
                    ),
                },
                "fallback_chain": codex_fallback(),
            },
            {
                "name": "BW-TrendResearcher",
                "role": "Trend Researcher",
                "adapter_type": "gemini_local",
                "adapter_config": {
                    **gemini_config(GEMINI_FLASH_MODEL),
                    "instructions": (
                        f"You are BW-TrendResearcher for {WRITER_COMPANY_NAME}.\n"
                        "Own US/JP/KR market and trend reconnaissance for long-form fiction.\n"
                        f"Primary workspace: {workspace}\n"
                        "Track genre, platform, packaging, and release-surface shifts across Korea, the United States, and Japan.\n"
                        "Flag bilingual Korean/English release risks early.\n"
                        "Maintain reader avatar, comparison books, trope promises, packaging notes, market-fit memos, and trend comparisons. Do not dictate canon."
                    ),
                },
                "fallback_chain": codex_fallback(),
            },
            {
                "name": "BW-Writer",
                "role": "Writer",
                "adapter_type": "gemini_local",
                "adapter_config": {
                    **gemini_config(GEMINI_PRO_MODEL),
                    "instructions": (
                        f"You are BW-Writer for {WRITER_COMPANY_NAME}.\n"
                        "Own draft production and revision only.\n"
                        f"Primary workspace: {workspace}\n"
                        "Work from sprint contracts, canon, research, and trend memos when present.\n"
                        "Draft only from accepted beats. Plain Korean comes before mouthfeel.\n"
                        "Default False Dane house style must follow the false-dane-writer skill.\n"
                        "Draft with KR-first prose, but do not ignore EN release viability.\n"
                        "Do not self-approve."
                    ),
                },
                "fallback_chain": codex_fallback(),
            },
            {
                "name": "BW-Editor",
                "role": "Editor",
                "adapter_type": "gemini_local",
                "adapter_config": {
                    **gemini_config(GEMINI_PRO_MODEL),
                    "instructions": (
                        f"You are BW-Editor for {WRITER_COMPANY_NAME}.\n"
                        "Own quality review, continuity review, and revision briefs.\n"
                        f"Primary workspace: {workspace}\n"
                        "Score drafts, block drift, and issue revision direction.\n"
                        "Run narrow checks and write an improvement plan before any revision.\n"
                        "Default False Dane prose review must follow the false-dane-writer skill.\n"
                        "Check KR prose quality and EN portability when the project expects bilingual release.\n"
                        "Do not silently expand scope."
                    ),
                },
                "fallback_chain": codex_fallback(),
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


def _merge_named_specs(default_specs: list[dict[str, Any]], override_specs: list[dict[str, Any]]) -> list[dict[str, Any]]:
    merged_by_name = {str(spec.get("name") or ""): deepcopy(spec) for spec in default_specs}
    order = [str(spec.get("name") or "") for spec in default_specs]
    for override in override_specs:
        name = str(override.get("name") or "")
        if not name:
            continue
        if name not in merged_by_name:
            order.append(name)
            merged_by_name[name] = {}
        merged_by_name[name] = _deep_merge(merged_by_name[name], override)
    return [merged_by_name[name] for name in order if name in merged_by_name]


def normalize_writer_company_manifest(raw: dict[str, Any], workspace_root: str | None = None) -> dict[str, Any]:
    if workspace_root is None:
        workspace_root = _resolve_default_workspace_root()
    default = build_writer_company_manifest(workspace_root=workspace_root)
    merged = _deep_merge(default, raw)
    if isinstance(raw.get("agents"), list):
        merged["agents"] = _merge_named_specs(default.get("agents", []), raw.get("agents", []))
    if isinstance(raw.get("projects"), list):
        merged["projects"] = _merge_named_specs(default.get("projects", []), raw.get("projects", []))
    return merged


def audit_writer_company_drift(backend: LocalBackend, manifest: dict[str, Any]) -> dict[str, Any]:
    company_id = str(manifest.get("company", {}).get("id") or WRITER_COMPANY_ID)
    company = _normalize_company_row(backend.get_company(company_id))
    if company is None:
        return {
            "status": "missing",
            "companyId": company_id,
            "gaps": [
                {
                    "severity": "blocker",
                    "code": "missing_company",
                    "message": "Writer company row is missing.",
                }
            ],
        }

    gaps: list[dict[str, Any]] = []
    company_meta = company.get("meta") if isinstance(company.get("meta"), dict) else {}
    manifest_meta = manifest.get("company", {}).get("meta") if isinstance(manifest.get("company", {}).get("meta"), dict) else {}
    if company.get("template_key") != manifest.get("company", {}).get("template_key"):
        gaps.append(
            {
                "severity": "soft_gap",
                "code": "template_key_mismatch",
                "message": "Company template key differs from writer-company manifest.",
                "expected": manifest.get("company", {}).get("template_key"),
                "actual": company.get("template_key"),
            }
        )
    if company.get("workspace_id") != manifest.get("company", {}).get("workspace_id"):
        gaps.append(
            {
                "severity": "soft_gap",
                "code": "workspace_id_mismatch",
                "message": "Company workspace id differs from writer-company manifest.",
                "expected": manifest.get("company", {}).get("workspace_id"),
                "actual": company.get("workspace_id"),
            }
        )
    if company_meta.get("workspace_root") != manifest_meta.get("workspace_root"):
        gaps.append(
            {
                "severity": "soft_gap",
                "code": "workspace_root_mismatch",
                "message": "Company workspace_root meta differs from manifest.",
                "expected": manifest_meta.get("workspace_root"),
                "actual": company_meta.get("workspace_root"),
            }
        )

    all_agents = backend.list_agents(company_id=company_id)
    active_agents = [agent for agent in all_agents if str(agent.get("status") or "active") == "active"]
    active_by_key: dict[str, list[dict[str, Any]]] = {}
    for agent in active_agents:
        active_by_key.setdefault(_agent_name_key(agent.get("name")), []).append(agent)

    canonical_names = [str(spec.get("name") or "") for spec in manifest.get("agents", [])]
    manifest_agents = {str(spec.get("name") or ""): spec for spec in manifest.get("agents", [])}
    for name in canonical_names:
        key = _agent_name_key(name)
        matches = active_by_key.get(key, [])
        if not matches:
            gaps.append(
                {
                    "severity": "blocker",
                    "code": "missing_agent",
                    "message": f"Canonical agent {name} is missing from the active roster.",
                    "agent": name,
                }
            )
            continue
        exact = next((agent for agent in matches if agent.get("name") == name), None)
        if exact is None:
            gaps.append(
                {
                    "severity": "blocker",
                    "code": "canonical_name_missing",
                    "message": f"Agent {name} exists only as a case-variant, not the canonical handle.",
                    "agent": name,
                    "activeNames": [agent.get("name") for agent in matches],
                }
            )
            continue
        if len(matches) > 1:
            gaps.append(
                {
                    "severity": "soft_gap",
                    "code": "duplicate_active_aliases",
                    "message": f"Agent {name} has multiple active aliases.",
                    "agent": name,
                    "activeNames": [agent.get("name") for agent in matches],
                }
            )
        expected_cfg = manifest_agents[name].get("adapter_config", {}) if isinstance(manifest_agents[name], dict) else {}
        actual_cfg = exact.get("adapter_config", {}) if isinstance(exact.get("adapter_config"), dict) else {}
        for field in ("command", "model", "cwd", "instructions", "instructions_path"):
            if expected_cfg.get(field) != actual_cfg.get(field):
                gaps.append(
                    {
                        "severity": "soft_gap",
                        "code": "agent_adapter_drift",
                        "message": f"Agent {name} field {field} differs from manifest.",
                        "agent": name,
                        "field": field,
                        "expected": expected_cfg.get(field),
                        "actual": actual_cfg.get(field),
                    }
                )

    manifest_projects = {str(project.get("name") or ""): project for project in manifest.get("projects", [])}
    live_projects = backend.list_projects(company_id=company_id)
    live_projects_by_name = {str(project.get("projectName") or project.get("project_name") or ""): project for project in live_projects}
    active_agents_by_id = {str(agent.get("id") or ""): agent for agent in active_agents}
    for name, spec in manifest_projects.items():
        live_project = live_projects_by_name.get(name)
        if live_project is None:
            gaps.append(
                {
                    "severity": "blocker",
                    "code": "missing_project",
                    "message": f"Project {name} is missing from the company project index.",
                    "project": name,
                }
            )
            continue
        if live_project.get("status") != spec.get("status", "active"):
            gaps.append(
                {
                    "severity": "soft_gap",
                    "code": "project_status_drift",
                    "message": f"Project {name} status differs from manifest.",
                    "project": name,
                    "expected": spec.get("status", "active"),
                    "actual": live_project.get("status"),
                }
            )
        expected_assignee = str(spec.get("assigned_to") or "")
        actual_assignee_id = str(live_project.get("assignedTo") or live_project.get("assigned_to") or "")
        actual_assignee_name = str(active_agents_by_id.get(actual_assignee_id, {}).get("name") or "")
        if expected_assignee and actual_assignee_name != expected_assignee:
            gaps.append(
                {
                    "severity": "soft_gap",
                    "code": "project_assignee_drift",
                    "message": f"Project {name} assignee differs from manifest.",
                    "project": name,
                    "expected": expected_assignee,
                    "actual": actual_assignee_name or None,
                }
            )

    worst = "healthy"
    if gaps:
        if any(gap.get("severity") == "blocker" for gap in gaps):
            worst = "blocker"
        else:
            worst = "soft_gap"
    return {
        "status": worst if worst != "healthy" else "healthy",
        "companyId": company_id,
        "canonicalAgents": canonical_names,
        "activeAgentNames": [str(agent.get("name") or "") for agent in active_agents],
        "projectNames": sorted(live_projects_by_name.keys()),
        "gapCount": len(gaps),
        "gaps": gaps,
    }


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

    active_company_agents = backend.list_agents(company_id=company["id"])
    company_agents_by_key: dict[str, list[dict[str, Any]]] = {}
    for agent in active_company_agents:
        company_agents_by_key.setdefault(_agent_name_key(agent["name"]), []).append(agent)

    agent_rows: list[dict[str, Any]] = []
    agent_name_to_id: dict[str, str] = {}
    kept_agent_ids: set[str] = set()
    for spec in manifest.get("agents", []):
        agent_key = _agent_name_key(spec["name"])
        candidates = company_agents_by_key.get(agent_key, [])
        existing = None
        for candidate in candidates:
            if candidate["name"] == spec["name"]:
                existing = candidate
                break
        if existing is None and candidates:
            existing = candidates[0]
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
                name=spec["name"],
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
        kept_agent_ids.add(row_dict["id"])
        agent_name_to_id[spec["name"]] = row_dict["id"]

    canonical_agent_keys = {_agent_name_key(spec["name"]) for spec in manifest.get("agents", [])}
    for agent in active_company_agents:
        agent_key = _agent_name_key(agent["name"])
        if agent_key in canonical_agent_keys and agent["id"] not in kept_agent_ids:
            canonical_id = agent_name_to_id.get(next(spec["name"] for spec in manifest.get("agents", []) if _agent_name_key(spec["name"]) == agent_key))
            if canonical_id:
                _reassign_company_issues(backend, company["id"], agent["id"], canonical_id)
            backend.update_agent(agent["id"], status="retired")

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
