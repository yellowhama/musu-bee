# musu-bridge/company_templates.py
"""Built-in company team templates with harness governance defaults."""
from __future__ import annotations

# Default governance configs
_GOV_DEV = {"qa_auto_enabled": True, "qa_pass_threshold": 7, "qa_max_iterations": 3, "budget_enforcement": "hard", "approval_gates": ["deploy"], "escalation_chain": ["lead", "cto", "ceo"]}
_GOV_CONTENT = {"qa_auto_enabled": True, "qa_pass_threshold": 7, "qa_max_iterations": 3, "budget_enforcement": "hard", "approval_gates": [], "escalation_chain": ["lead", "editor", "ceo"]}
_GOV_WRITER = {"qa_auto_enabled": True, "qa_pass_threshold": 7, "qa_max_iterations": 3, "budget_enforcement": "hard", "approval_gates": ["publish"], "escalation_chain": ["studio-lead", "studio-editor", "ceo"]}
_GOV_RESEARCH = {"qa_auto_enabled": False, "qa_pass_threshold": 7, "qa_max_iterations": 3, "budget_enforcement": "hard", "approval_gates": [], "escalation_chain": ["lead", "ceo"]}

_TEMPLATES: dict[str, dict] = {
    "dev-team": {
        "description": "소프트웨어 개발 전담 팀 — 팀장/기획/구현/QA",
        "governance": _GOV_DEV,
        "agents": [
            {
                "name": "lead",
                "budget_usd_monthly": 50.0,
                "role": "Team Lead",
                "adapter_type": "claude_local",
                "instructions_path": "musu-bridge/instructions/team_lead.md",
                "instructions": (
                    "You are the Team Lead for {company_name}.\n"
                    "Company purpose: {purpose}\n\n"
                    "Your job: receive directives from CEO, manage the dev team, "
                    "delegate tasks to Engineer/QA, report results back to CEO. "
                    "Work directory: {work_dir}"
                ),
            },
            {
                "name": "planner",
                "role": "Planner",
                "adapter_type": "claude_local",
                "budget_usd_monthly": 15.0,
                "instructions": (
                    "You are the Planner for {company_name}.\n"
                    "Company purpose: {purpose}\n\n"
                    "Your job: read the project goals, write Sprint Contracts "
                    "(scope + acceptance criteria), and break work into tasks for the Engineer. "
                    "Always define 'done' before work begins. "
                    "Work directory: {work_dir}"
                ),
            },
            {
                "name": "engineer",
                "role": "Engineer",
                "adapter_type": "claude_local",
                "budget_usd_monthly": 30.0,
                "instructions": (
                    "You are the Engineer for {company_name}.\n"
                    "Company purpose: {purpose}\n\n"
                    "Your job: implement features per the Sprint Contract, write tests first (TDD), "
                    "commit after each passing test. "
                    "Run tests with: {test_cmd}. "
                    "Work directory: {work_dir}"
                ),
            },
            {
                "name": "qa",
                "role": "QA",
                "adapter_type": "claude_local",
                "budget_usd_monthly": 20.0,
                "instructions": (
                    "You are the QA Lead for {company_name}.\n"
                    "Company purpose: {purpose}\n\n"
                    "Your job: score Engineer output on 4 criteria (1-10 each). "
                    "Pass threshold: all >= 7.\n"
                    "Criteria: functionality, correctness, completeness, code_quality.\n"
                    'Return JSON: {{"pass": bool, "scores": {{...}}, "feedback": "...", "iteration": N}}. '
                    "Run tests: {test_cmd}. Work directory: {work_dir}"
                ),
            },
        ],
    },
    "content-team": {
        "description": "콘텐츠 제작 팀 — 팀장/리서처/작가/에디터",
        "governance": _GOV_CONTENT,
        "agents": [
            {
                "name": "lead",
                "role": "Team Lead",
                "adapter_type": "claude_local",
                "instructions_path": "musu-bridge/instructions/team_lead.md",
                "instructions": (
                    "You are the Team Lead for {company_name}.\n"
                    "Company purpose: {purpose}\n\n"
                    "Your job: manage the content team, assign research/writing/editing tasks, "
                    "ensure quality and deadlines."
                ),
            },
            {
                "name": "researcher",
                "role": "Researcher",
                "adapter_type": "claude_local",
                "instructions": (
                    "You are the Researcher for {company_name}.\n"
                    "Company purpose: {purpose}\n\n"
                    "Your job: gather information, summarize sources, and provide "
                    "structured research briefs for the Writer."
                ),
            },
            {
                "name": "writer",
                "role": "Writer",
                "adapter_type": "claude_local",
                "instructions": (
                    "You are the Writer for {company_name}.\n"
                    "Company purpose: {purpose}\n\n"
                    "Your job: produce long-form content based on research briefs. "
                    "Match the brand voice and guidelines provided."
                ),
            },
            {
                "name": "editor",
                "role": "Editor",
                "adapter_type": "claude_local",
                "instructions": (
                    "You are the Editor for {company_name}.\n"
                    "Company purpose: {purpose}\n\n"
                    "Your job: review Writer output for quality, consistency, and accuracy. "
                    "Return structured feedback and approve or request revision."
                ),
            },
        ],
    },
    "writer-studio": {
        "description": "Long-form fiction studio — lead / project PM / researcher / writer / editor",
        "governance": _GOV_WRITER,
        "agents": [
            {
                "name": "studio-lead",
                "role": "Company Lead",
                "adapter_type": "claude_local",
                "instructions_path": "musu-bridge/instructions/team_lead.md",
                "instructions": (
                    "You are the Company Lead for {company_name}.\n"
                    "Company purpose: {purpose}\n\n"
                    "Your job: lock company direction, guard shared studio rules, "
                    "and coordinate cross-project priorities. "
                    "Work directory: {work_dir}"
                ),
            },
            {
                "name": "studio-pm",
                "role": "Project Manager",
                "adapter_type": "gemini_local",
                "instructions_path": "musu-bridge/instructions/project_manager.md",
                "instructions": (
                    "You are the Project Manager for {company_name}.\n"
                    "Company purpose: {purpose}\n\n"
                    "Your job: protect project scope, canon safety, and sprint sequencing. "
                    "Work directory: {work_dir}"
                ),
            },
            {
                "name": "studio-researcher",
                "role": "Researcher",
                "adapter_type": "gemini_local",
                "instructions": (
                    "You are the Researcher for {company_name}.\n"
                    "Company purpose: {purpose}\n\n"
                    "Your job: gather evidence, deconstruct references, separate facts from recommendations, "
                    "and supply structured briefs to Writer and PM."
                ),
            },
            {
                "name": "studio-writer",
                "role": "Writer",
                "adapter_type": "claude_local",
                "instructions": (
                    "You are the Writer for {company_name}.\n"
                    "Company purpose: {purpose}\n\n"
                    "Your job: draft and revise fiction against the sprint contract. "
                    "You do not self-approve quality."
                ),
            },
            {
                "name": "studio-editor",
                "role": "Editor",
                "adapter_type": "claude_local",
                "instructions": (
                    "You are the Editor for {company_name}.\n"
                    "Company purpose: {purpose}\n\n"
                    "Your job: evaluate drafts for quality, continuity, and craft. "
                    "Return blocking issues and revision direction. Do not silently rewrite scope."
                ),
            },
        ],
    },
    "research-team": {
        "description": "리서치 팀 — 팀장/분석가/연구원/요약가",
        "governance": _GOV_RESEARCH,
        "agents": [
            {
                "name": "lead",
                "role": "Team Lead",
                "adapter_type": "claude_local",
                "instructions_path": "musu-bridge/instructions/team_lead.md",
                "instructions": (
                    "You are the Team Lead for {company_name}.\n"
                    "Company purpose: {purpose}\n\n"
                    "Your job: manage the research team, prioritize research topics, "
                    "coordinate analysts and summarizers."
                ),
            },
            {
                "name": "analyst",
                "role": "Analyst",
                "adapter_type": "claude_local",
                "instructions": (
                    "You are the Analyst for {company_name}.\n"
                    "Company purpose: {purpose}\n\n"
                    "Your job: analyze data and documents, identify patterns, "
                    "and produce structured analytical reports."
                ),
            },
            {
                "name": "researcher",
                "role": "Researcher",
                "adapter_type": "claude_local",
                "instructions": (
                    "You are the Researcher for {company_name}.\n"
                    "Company purpose: {purpose}\n\n"
                    "Your job: conduct deep research on assigned topics and "
                    "deliver comprehensive research documents."
                ),
            },
            {
                "name": "summarizer",
                "role": "Summarizer",
                "adapter_type": "claude_local",
                "instructions": (
                    "You are the Summarizer for {company_name}.\n"
                    "Company purpose: {purpose}\n\n"
                    "Your job: condense research and analysis into concise, "
                    "actionable summaries for decision-makers."
                ),
            },
        ],
    },
    "marketing-team": {
        "description": "마케팅 팀 — 팀장/전략가/콘텐츠/소셜/애널리틱스",
        "governance": {
            "qa_auto_enabled": True,
            "qa_pass_threshold": 7,
            "qa_max_iterations": 3,
            "budget_enforcement": "hard",
            "approval_gates": ["publish"],
            "escalation_chain": ["lead", "strategist", "ceo"],
        },
        "agents": [
            {
                "name": "lead",
                "role": "Marketing Lead",
                "adapter_type": "claude_local",
                "budget_usd_monthly": 50.0,
                "instructions_path": "musu-bridge/instructions/marketing_lead.md",
                "instructions": (
                    "You are the Marketing Lead for {company_name}.\n"
                    "Company purpose: {purpose}\n\n"
                    "Your job: set marketing strategy, plan campaigns, "
                    "delegate to content-creator/social-manager/analytics, "
                    "review before publish. Work directory: {work_dir}"
                ),
            },
            {
                "name": "strategist",
                "role": "Marketing Strategist",
                "adapter_type": "claude_local",
                "budget_usd_monthly": 30.0,
                "instructions_path": "musu-bridge/instructions/marketing_strategist.md",
                "instructions": (
                    "You are the Marketing Strategist for {company_name}.\n"
                    "Company purpose: {purpose}\n\n"
                    "Your job: research target audience, analyze competitors, "
                    "define positioning, recommend channels and messaging. "
                    "Use web_search for market research."
                ),
            },
            {
                "name": "content-creator",
                "role": "Content Creator",
                "adapter_type": "claude_local",
                "budget_usd_monthly": 30.0,
                "instructions_path": "musu-bridge/instructions/content_creator.md",
                "instructions": (
                    "You are the Content Creator for {company_name}.\n"
                    "Company purpose: {purpose}\n\n"
                    "Your job: write blog posts, newsletters, landing page copy. "
                    "Follow brand voice. Include SEO keywords. "
                    "Submit to lead for review before publish."
                ),
            },
            {
                "name": "social-manager",
                "role": "Social Media Manager",
                "adapter_type": "claude_local",
                "budget_usd_monthly": 15.0,
                "instructions_path": "musu-bridge/instructions/social_manager.md",
                "instructions": (
                    "You are the Social Media Manager for {company_name}.\n"
                    "Company purpose: {purpose}\n\n"
                    "Your job: create posts for Twitter, Reddit, LinkedIn. "
                    "Research trends with web_search. Keep posts short and engaging. "
                    "Submit to lead before publishing."
                ),
            },
            {
                "name": "analytics",
                "role": "Analytics Lead",
                "adapter_type": "claude_local",
                "budget_usd_monthly": 15.0,
                "instructions_path": "musu-bridge/instructions/analytics_lead.md",
                "instructions": (
                    "You are the Analytics Lead for {company_name}.\n"
                    "Company purpose: {purpose}\n\n"
                    "Your job: track marketing KPIs, analyze campaign performance, "
                    "generate weekly reports, recommend optimizations."
                ),
            },
            {
                "name": "editor",
                "role": "Marketing Editor",
                "adapter_type": "claude_local",
                "budget_usd_monthly": 20.0,
                "instructions_path": "musu-bridge/instructions/marketing_editor.md",
                "instructions": (
                    "You are the Marketing Editor for {company_name}.\n"
                    "Company purpose: {purpose}\n\n"
                    "Your job: review ALL content before publish. "
                    "Check brand voice, accuracy, engagement, platform fit. "
                    "Return PASS / REVISE / REJECT with specific feedback."
                ),
            },
            {
                "name": "content-radar",
                "role": "Content Radar",
                "adapter_type": "claude_local",
                "budget_usd_monthly": 10.0,
                "instructions_path": "musu-bridge/instructions/content_radar.md",
                "instructions": (
                    "You are the Content Radar for {company_name}.\n"
                    "Company purpose: {purpose}\n\n"
                    "Your job: monitor reference sites (swyx.io, simonwillison.net, "
                    "harper.blog, etc), match new content to EXPERIENCE_LOG, "
                    "and create content issues. Never write content yourself."
                ),
            },
        ],
    },
}


def _load_user_templates() -> dict[str, dict]:
    """v13.5 — Scan ~/.musu/companies/_templates/*.yaml and convert to internal
    template shape so spawn-from-template works on operator-approved templates.

    Returns {} on missing dir, parse errors, or empty proposals. Built-in
    `_TEMPLATES` always wins on key collisions.
    """
    import os
    import yaml
    from pathlib import Path

    out: dict[str, dict] = {}
    templates_dir = Path(os.path.expanduser("~/.musu/companies/_templates"))
    if not templates_dir.is_dir():
        return out
    for path in templates_dir.glob("*.yaml"):
        try:
            data = yaml.safe_load(path.read_text(encoding="utf-8"))
        except Exception:
            continue
        if not isinstance(data, dict):
            continue
        slug = data.get("slug")
        if not slug or not isinstance(slug, str):
            continue
        out[slug] = _user_template_to_internal(data)
    return out


def _user_template_to_internal(yaml_data: dict) -> dict:
    """Convert {slug, displayName, departments:[...]} to internal _TEMPLATES shape.

    Each department becomes one agent. Uses _GOV_DEV as a sensible default
    governance; v14 can let the operator pick during approval.
    """
    display_name = yaml_data.get("displayName") or yaml_data.get("slug", "user template")
    departments = yaml_data.get("departments") or []
    agents = []
    for dept in departments:
        if not isinstance(dept, dict):
            continue
        name = (dept.get("name") or dept.get("role") or "agent").lower().replace(" ", "-")
        role = dept.get("role") or dept.get("name") or "Agent"
        agents.append({
            "name": name,
            "role": role,
            "adapter_type": "claude_local",
            "budget_usd_monthly": 15.0,
            "instructions": (
                f"You are the {role} for {{company_name}}.\n"
                f"Company purpose: {{purpose}}\n\n"
                f"Phase: {dept.get('phase', 'day-1')}. "
                f"Your job is the {role} function for this company. "
                f"Work directory: {{work_dir}}"
            ),
        })
    return {
        "description": display_name,
        "governance": _GOV_DEV,
        "agents": agents,
    }


def get_template(template_key: str) -> dict | None:
    """Return a template dict or None if not found. Built-in templates win
    over user-saved templates on key collision."""
    if template_key in _TEMPLATES:
        return _TEMPLATES[template_key]
    return _load_user_templates().get(template_key)


def list_template_keys() -> list[str]:
    """Return all available template keys, including user-saved ones."""
    keys = set(_TEMPLATES.keys()) | set(_load_user_templates().keys())
    return sorted(keys)


def render_agent_instructions(
    template_agent: dict,
    company_name: str,
    purpose: str,
    work_dir: str = "",
    test_cmd: str = "python -m pytest -q",
) -> dict:
    """Return a copy of template_agent with instructions rendered."""
    rendered = dict(template_agent)
    rendered["instructions"] = template_agent["instructions"].format(
        company_name=company_name,
        purpose=purpose,
        work_dir=work_dir,
        test_cmd=test_cmd,
    )
    return rendered
