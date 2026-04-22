# musu-bridge/company_templates.py
"""Built-in company team templates."""
from __future__ import annotations

_TEMPLATES: dict[str, dict] = {
    "dev-team": {
        "description": "소프트웨어 개발 전담 팀 — 팀장/기획/구현/QA",
        "agents": [
            {
                "name": "lead",
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
    "research-team": {
        "description": "리서치 팀 — 팀장/분석가/연구원/요약가",
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
}


def get_template(template_key: str) -> dict | None:
    """Return a template dict or None if not found."""
    return _TEMPLATES.get(template_key)


def list_template_keys() -> list[str]:
    """Return all available template keys."""
    return list(_TEMPLATES.keys())


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
