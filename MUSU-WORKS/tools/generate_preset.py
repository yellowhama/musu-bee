#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import shutil
from pathlib import Path


ROOT = Path("/home/hugh51/musu-functions/MUSU-WORKS")
PRESETS_ROOT = ROOT / "presets"

COMPANY_MEMORY_CATEGORIES = ["policy", "playbook", "decisions", "audit_lessons"]
PROJECT_MEMORY_CATEGORIES = ["requirements", "decisions", "outputs", "issues", "runbooks"]
RUNTIME_LANE_KEYS = ["planning", "implementation", "verification", "governance"]

TEMPLATES = {
    "minimal_company": {
        "display_name": "Minimal Company",
        "company_type": "minimal_company",
        "default_roles": ["ceo", "builder", "reviewer"],
        "default_project_types": ["delivery"],
        "default_policy_profiles": ["default_safe", "delivery_light"],
        "projects": [
            {
                "id": "desktop-mcp",
                "display_name": "Desktop MCP",
                "project_type": "delivery",
                "workspace_root": "workspace",
            }
        ],
    },
    "delivery_team": {
        "display_name": "Delivery Team",
        "company_type": "delivery_team",
        "default_roles": [
            "ceo",
            "engineering_manager",
            "builder",
            "reviewer",
            "qa",
            "policy_officer",
        ],
        "default_project_types": ["delivery", "maintenance"],
        "default_policy_profiles": ["default_safe", "delivery_standard", "approval_guarded"],
        "projects": [
            {
                "id": "desktop-mcp",
                "display_name": "Desktop MCP",
                "project_type": "delivery",
                "workspace_root": "workspace",
            }
        ],
    },
    "research_rd": {
        "display_name": "Research / R&D Team",
        "company_type": "research_rd",
        "default_roles": ["ceo", "research_lead", "builder", "design_partner", "qa"],
        "default_project_types": ["research", "prototype"],
        "default_policy_profiles": ["default_safe", "research_flexible"],
        "projects": [
            {
                "id": "self-mcp-lab",
                "display_name": "Self MCP Lab",
                "project_type": "research",
                "workspace_root": "workspace",
            }
        ],
    },
}


ROLE_DEFAULTS = {
    "ceo": {"mode": "oversight", "memory": ["identity", "skills", "work_patterns"]},
    "engineering_manager": {"mode": "coordination", "memory": ["identity", "skills", "work_patterns"]},
    "builder": {
        "mode": "execution",
        "memory": ["identity", "skills", "work_patterns", "failure_patterns", "improvement_notes"],
    },
    "reviewer": {"mode": "review", "memory": ["identity", "skills", "work_patterns"]},
    "qa": {"mode": "qa", "memory": ["identity", "skills", "work_patterns"]},
    "policy_officer": {"mode": "governance", "memory": ["identity", "skills", "work_patterns"]},
    "research_lead": {"mode": "research", "memory": ["identity", "skills", "work_patterns"]},
    "design_partner": {"mode": "design", "memory": ["identity", "skills", "work_patterns"]},
}


def write_json(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2, ensure_ascii=True) + "\n", encoding="utf-8")


def write_readme(path: Path, title: str, body: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(f"# {title}\n\n{body}\n", encoding="utf-8")


def pick_role(available_roles: list[str], preferred_roles: list[str]) -> str:
    for role in preferred_roles:
        if role in available_roles:
            return role
    return available_roles[0]


def build_runtime_contract(template: dict, company_slug: str) -> dict:
    roles = template["default_roles"]
    planner_role = pick_role(roles, ["ceo", "engineering_manager", "research_lead"])
    builder_role = pick_role(roles, ["builder", "research_lead"])
    qa_role = pick_role(roles, ["qa", "reviewer", "design_partner"])
    governance_role = pick_role(roles, ["policy_officer", "ceo", "reviewer"])
    escalation_role = pick_role(roles, ["engineering_manager", "ceo", "policy_officer"])

    lane_owner_map = {
        "planning": planner_role,
        "implementation": builder_role,
        "verification": qa_role,
        "governance": governance_role,
    }

    return {
        "version": "1.0",
        "company_slug": company_slug,
        "execution_topology": {
            "nodes": [
                {
                    "node_key": "gpu_primary",
                    "role": "generation",
                    "profile": "home-gpu-primary",
                    "default_lane": "implementation",
                },
                {
                    "node_key": "gpu_secondary",
                    "role": "vision_qa",
                    "profile": "home-gpu-secondary",
                    "default_lane": "verification",
                },
                {
                    "node_key": "operator_laptop",
                    "role": "review_and_control",
                    "profile": "remote-operator-laptop",
                    "default_lane": "governance",
                },
            ]
        },
        "queue_item_schema": {
            "required_fields": [
                "task_id",
                "workspace",
                "owner",
                "queue",
                "title",
                "body",
                "source",
                "priority",
                "retry_budget",
                "handoff_payload",
            ]
        },
        "lane_state_schema": {
            "required_fields": [
                "lane_key",
                "workspace",
                "owner",
                "status",
                "last_task_id",
                "last_result_status",
                "last_result_reason",
                "last_worker_result",
                "updated_at",
            ]
        },
        "worker_result_schema": {
            "required_fields": [
                "task_id",
                "worker_type",
                "status",
                "reason",
                "provider",
                "auth_mode",
                "artifacts",
                "retryable",
                "created_at",
            ]
        },
        "handoff_payload_schema": {
            "required_fields": [
                "handoff_type",
                "from_owner",
                "to_owner",
                "trigger",
                "context_refs",
                "expected_output",
                "review_required",
            ]
        },
        "lane_owners": lane_owner_map,
        "handoff_contract": [
            {
                "from_lane": "planning",
                "to_lane": "implementation",
                "trigger": "scope_ready",
                "required_outputs": ["task_batch", "acceptance_criteria"],
            },
            {
                "from_lane": "implementation",
                "to_lane": "verification",
                "trigger": "artifact_ready",
                "required_outputs": ["build_artifacts", "implementation_notes"],
            },
            {
                "from_lane": "verification",
                "to_lane": "governance",
                "trigger": "qa_report_ready",
                "required_outputs": ["qa_report", "risk_summary"],
            },
            {
                "from_lane": "governance",
                "to_lane": "planning",
                "trigger": "decision_published",
                "required_outputs": ["board_decision", "next_actions"],
            },
        ],
        "blocker_routing": {
            "route_chain": [
                {
                    "on_status": "blocked",
                    "notify_role": escalation_role,
                    "after_minutes": 0,
                },
                {
                    "on_status": "blocked",
                    "notify_role": planner_role,
                    "after_minutes": 30,
                },
            ],
            "required_blocker_fields": [
                "task_id",
                "lane_key",
                "blocked_reason",
                "needs_role",
                "opened_at",
                "next_escalation_at",
            ],
        },
        "safety_policy": {
            "profiles": {
                "safe_auto": {
                    "requires_approval": False,
                    "max_retry_budget": 2,
                    "allowed_actions": ["read", "non_destructive_write", "test"],
                },
                "approval_guarded": {
                    "requires_approval": True,
                    "max_retry_budget": 1,
                    "allowed_actions": ["deployment", "destructive_command", "new_external_mcp"],
                },
            },
            "default_profile_by_lane": {
                "planning": "safe_auto",
                "implementation": "safe_auto",
                "verification": "safe_auto",
                "governance": "approval_guarded",
            },
        },
        "governance_review_objects": [
            "approval_item",
            "escalation_item",
            "morning_review_packet",
            "board_decision_entry",
        ],
    }


def create_agent(agent_root: Path, role: str, company_id: str) -> None:
    defaults = ROLE_DEFAULTS[role]
    write_json(
        agent_root / "agent.json",
        {
            "agent_id": role,
            "role_template_id": role,
            "company_id": company_id,
            "runtime_mode": defaults["mode"],
            "status": "seeded",
        },
    )
    for category in defaults["memory"]:
        write_readme(
            agent_root / category / "README.md",
            f"{role} {category.replace('_', ' ').title()}",
            f"Seed folder for `{role}` `{category}` memory.",
        )


def create_project(project_root: Path, project: dict, company_id: str) -> None:
    write_json(
        project_root / "project.json",
        {
            "project_id": project["id"],
            "company_id": company_id,
            "display_name": project["display_name"],
            "project_type": project["project_type"],
            "workspace_root": project["workspace_root"],
            "status": "seeded",
        },
    )
    write_readme(project_root / "workspace" / "README.md", "Workspace", "Seed workspace root.")
    for category in PROJECT_MEMORY_CATEGORIES:
        write_readme(
            project_root / "memory" / category / "README.md",
            f"{project['id']} {category.title()}",
            f"Seed folder for `{project['id']}` `{category}` memory.",
        )
    write_readme(project_root / "sessions" / "README.md", "Sessions", "Seed session notes and traces.")
    write_readme(project_root / "artifacts" / "README.md", "Artifacts", "Seed build and delivery artifacts.")


def create_runtime_state(output_dir: Path, template: dict, company_slug: str) -> None:
    contract = build_runtime_contract(template, company_slug)
    lane_owners = contract["lane_owners"]

    write_json(output_dir / "runtime" / "contract.json", contract)
    write_json(output_dir / "runtime" / "queue_items.json", {"items": []})
    write_json(
        output_dir / "runtime" / "lane_states.json",
        {
            "lanes": [
                {
                    "lane_key": lane_key,
                    "workspace": "default",
                    "owner": lane_owners[lane_key],
                    "status": "idle",
                    "last_task_id": None,
                    "last_result_status": None,
                    "last_result_reason": None,
                    "last_worker_result": None,
                    "updated_at": None,
                }
                for lane_key in RUNTIME_LANE_KEYS
            ]
        },
    )
    write_json(output_dir / "runtime" / "worker_results.json", {"results": []})
    write_json(output_dir / "runtime" / "handoff_queue.json", {"items": []})
    write_json(output_dir / "runtime" / "blockers.json", {"open": []})
    write_json(
        output_dir / "runtime" / "governance_reviews.json",
        {
            "approvals": [],
            "escalations": [],
            "morning_reviews": [],
            "board_decisions": [],
        },
    )


def build_preset(output_dir: Path, template_id: str, company_slug: str) -> None:
    template = TEMPLATES[template_id]
    company_id = company_slug.replace("-", "_")
    if output_dir.exists():
        shutil.rmtree(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    write_readme(
        output_dir / "README.md",
        template["display_name"],
        f"Generated preset for `{company_slug}` using `{template_id}`.",
    )
    write_json(
        output_dir / "preset.json",
        {
            "preset_id": template_id,
            "company_slug": company_slug,
            "display_name": template["display_name"],
            "company_type": template["company_type"],
            "default_roles": template["default_roles"],
            "default_project_types": template["default_project_types"],
            "default_memory_categories": {
                "company": COMPANY_MEMORY_CATEGORIES,
                "project": PROJECT_MEMORY_CATEGORIES,
            },
            "default_policy_profiles": template["default_policy_profiles"],
            "default_indexer_roots": ["memory", "agents", "projects", "runtime"],
            "default_runtime_lanes": RUNTIME_LANE_KEYS,
        },
    )
    write_json(
        output_dir / "company.json",
        {
            "company_id": company_id,
            "slug": company_slug,
            "display_name": company_slug.replace("-", " ").title(),
            "company_type": template["company_type"],
            "status": "seeded",
        },
    )
    write_json(
        output_dir / "indexer.json",
        {
            "workspace_root": ".",
            "index_db": ".musu_dev.db",
            "sync_paths": ["memory", "agents", "projects", "runtime"],
            "category_strategy": "path_based_memory_categories",
        },
    )
    write_json(
        output_dir / "seed_manifest.json",
        {
            "company_id": company_id,
            "preset_id": template_id,
            "agent_count": len(template["default_roles"]),
            "project_count": len(template["projects"]),
            "memory_roots": {
                "company": COMPANY_MEMORY_CATEGORIES,
                "project": PROJECT_MEMORY_CATEGORIES,
            },
            "runtime_lanes": RUNTIME_LANE_KEYS,
        },
    )
    write_json(output_dir / "policies" / "default_policy_profiles.json", {"profiles": template["default_policy_profiles"]})
    write_json(output_dir / "approvals" / "queue.json", {"pending": []})
    create_runtime_state(output_dir, template, company_slug)

    for category in COMPANY_MEMORY_CATEGORIES:
        write_readme(
            output_dir / "memory" / category / "README.md",
            category.replace("_", " ").title(),
            f"Seed folder for company-level `{category}` memory.",
        )

    for role in template["default_roles"]:
        create_agent(output_dir / "agents" / role, role, company_id)

    for project in template["projects"]:
        create_project(output_dir / "projects" / project["id"], project, company_id)


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate MUSU-WORKS scaffolding preset trees.")
    parser.add_argument("--template", choices=sorted(TEMPLATES.keys()), required=True)
    parser.add_argument("--slug", required=True, help="Output preset folder name, e.g. delivery-team-alpha")
    parser.add_argument("--output-root", default=str(PRESETS_ROOT))
    args = parser.parse_args()

    output_root = Path(args.output_root)
    build_preset(output_root / args.slug, args.template, args.slug)


if __name__ == "__main__":
    main()
