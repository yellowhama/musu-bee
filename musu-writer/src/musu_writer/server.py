"""FastMCP server — Fiction writing pipeline tools.

11 tools: 3 orchestrator + 8 skill tools.
Tools provide references, state management, and validation.
The agent (Claude/Codex/Gemini) does the actual writing and judgment.
"""

import json

from mcp.server.fastmcp import FastMCP

mcp = FastMCP("Musu Writer")


# ── Orchestrator Tools ───────────────────────────────────


@mcp.tool()
async def start_chapter_session(
    chapter: str,
    project: str = "false-dane",
) -> str:
    """Start a new chapter writing session.

    Initializes the pipeline state machine and loads chapter context.
    Returns session_id + available context files + first step.

    Args:
        chapter: Chapter identifier (e.g. "CH01", "CH02")
        project: Project name (default: "false-dane")
    """
    from .models import Session
    from .project_session import is_project_ready
    from .references import get_chapter_context
    from .session import get_next_step, load_previous_chapter_state, save_session

    # Gate: AI-native projects must complete planning first
    # (false-dane and bloodline are human+AI exemptions)
    human_ai_projects = {"false-dane", "bloodline"}
    if project not in human_ai_projects and not is_project_ready(project):
        return json.dumps({
            "error": f"Project '{project}' has not completed planning. "
            "Run start_project_session first and complete all 8 planning stages.",
            "hint": "Use start_project_session → get_planning_context → complete_project_step for each stage.",
        }, ensure_ascii=False)

    session = Session(chapter=chapter, project=project)

    # Gap #5: Auto-load previous chapter state for causality chaining
    prev_state = load_previous_chapter_state(chapter)
    session.previous_chapter_state = prev_state

    save_session(session)

    context = get_chapter_context(chapter, project=project)
    next_step = get_next_step(session)
    save_session(session)

    return json.dumps(
        {
            "session_id": session.session_id,
            "chapter": chapter,
            "state": session.state.value,
            "context": context,
            "previous_chapter": prev_state,
            "next_step": next_step,
        },
        ensure_ascii=False,
    )


@mcp.tool()
async def get_next_step_tool(session_id: str) -> str:
    """Get the next step in the writing pipeline.

    Checks gate conditions and tells you what to do next.
    Returns step name, reason, gate check result, and suggested inputs.

    Args:
        session_id: Session ID from start_chapter_session.
    """
    from .session import get_next_step, load_session, save_session

    session = load_session(session_id)
    if session is None:
        return json.dumps({"error": f"Session not found: {session_id}"})

    next_step = get_next_step(session)
    save_session(session)

    return json.dumps(
        {
            "session_id": session_id,
            "state": session.state.value,
            "next_step": next_step,
        },
        ensure_ascii=False,
    )


@mcp.tool()
async def get_session_status(session_id: str) -> str:
    """Get the full status of a writing session.

    Shows current state, completed steps, pending steps, and all results.

    Args:
        session_id: Session ID from start_chapter_session.
    """
    from .session import load_session

    session = load_session(session_id)
    if session is None:
        return json.dumps({"error": f"Session not found: {session_id}"})

    return json.dumps(session.to_dict(), ensure_ascii=False)


@mcp.tool()
async def complete_step(
    session_id: str,
    step: str,
    status: str = "pass",
    output_path: str = "",
    details_json: str = "{}",
) -> str:
    """Record completion of a pipeline step and advance the state.

    Call this after YOU (the agent) have completed a step.
    The tool validates the result and advances to the next state.

    Args:
        session_id: Session ID.
        step: Step name (audit_continuity, design_characters, build_world_packet,
              write_structure_draft, detect_ai, write_rhythm_draft,
              write_mouth_draft, run_reference_critique).
        status: "pass" or "fail".
        output_path: Path to output file (if applicable).
        details_json: JSON string with additional details.
    """
    from .models import StepResult
    from .session import advance_state, get_next_step, load_session, save_session

    session = load_session(session_id)
    if session is None:
        return json.dumps({"error": f"Session not found: {session_id}"})

    try:
        details = json.loads(details_json)
    except json.JSONDecodeError:
        details = {}

    result = StepResult(
        step=step,
        status=status,
        output_path=output_path,
        details=details,
    )

    advance_state(session, step, result)
    next_step = get_next_step(session)
    save_session(session)

    return json.dumps(
        {
            "session_id": session_id,
            "step_completed": step,
            "new_state": session.state.value,
            "next_step": next_step,
        },
        ensure_ascii=False,
    )


# ── Pre-Pro Skill Tools ──────────────────────────────────


@mcp.tool()
async def audit_continuity(
    chapter: str,
    project: str = "false-dane",
    session_id: str = "",
) -> str:
    """Get continuity audit context — knowledge layers, evidence tracking, forbidden reveals.

    Args:
        chapter: Chapter identifier (e.g. "CH01").
        project: Project name (e.g. "false-dane", "bloodline").
        session_id: Optional session ID.
    """
    from .tools.continuity import get_continuity_context

    ctx = get_continuity_context(chapter, project=project)
    return json.dumps(ctx, ensure_ascii=False)


@mcp.tool()
async def design_characters(
    chapter: str,
    project: str = "false-dane",
    session_id: str = "",
) -> str:
    """Get character design context — card templates, voice rules, visibility debt.

    Args:
        chapter: Chapter identifier.
        project: Project name.
        session_id: Optional session ID.
    """
    from .tools.characters import get_character_context

    ctx = get_character_context(chapter, project=project)
    return json.dumps(ctx, ensure_ascii=False)


@mcp.tool()
async def build_world_packet(
    chapter: str,
    project: str = "false-dane",
    session_id: str = "",
) -> str:
    """Get world/ensemble packet context — place, actors, factions, objects, pressure.

    Args:
        chapter: Chapter identifier.
        project: Project name.
        session_id: Optional session ID.
    """
    from .tools.world_packet import get_world_context

    ctx = get_world_context(chapter, project=project)
    return json.dumps(ctx, ensure_ascii=False)


# ── Draft Skill Tools ────────────────────────────────────


@mcp.tool()
async def get_structure_draft_context(
    chapter: str,
    project: str = "false-dane",
    session_id: str = "",
) -> str:
    """Get structure draft (1안) context — ABC gate, scene engine, user anchors.

    Args:
        chapter: Chapter identifier.
        project: Project name.
        session_id: Optional session ID.
    """
    from .tools.structure_draft import get_structure_context

    ctx = get_structure_context(chapter, project=project)
    return json.dumps(ctx, ensure_ascii=False)


@mcp.tool()
async def get_rhythm_draft_context(
    chapter: str,
    draft_path: str = "",
    project: str = "false-dane",
    session_id: str = "",
) -> str:
    """Get rhythm draft (3안) context — scene tempo targets, rhythm patterns.

    Args:
        chapter: Chapter identifier.
        draft_path: Path to the structure draft to work on.
        project: Project name.
        session_id: Optional session ID.
    """
    from .tools.rhythm_draft import get_rhythm_context

    ctx = get_rhythm_context(chapter, draft_path, project=project)
    return json.dumps(ctx, ensure_ascii=False)


@mcp.tool()
async def get_mouth_draft_context(
    chapter: str,
    draft_path: str = "",
    project: str = "false-dane",
    session_id: str = "",
) -> str:
    """Get mouth draft (2안) context — dialogue, mouthfeel, AI-tell gate, polish.

    Args:
        chapter: Chapter identifier.
        draft_path: Path to the rhythm draft to polish.
        project: Project name.
        session_id: Optional session ID.
    """
    from .tools.mouth_draft import get_mouth_context

    ctx = get_mouth_context(chapter, draft_path, project=project)
    return json.dumps(ctx, ensure_ascii=False)


@mcp.tool()
async def get_critique_context(
    chapter: str,
    draft_path: str = "",
    project: str = "false-dane",
    session_id: str = "",
) -> str:
    """Get reference critique context for comparing against reference works.

    Args:
        chapter: Chapter identifier.
        draft_path: Path to the final draft to critique.
        project: Project name.
        session_id: Optional session ID.
    """
    from .tools.reference_critique import get_critique_context

    ctx = get_critique_context(chapter, draft_path, project=project)
    return json.dumps(ctx, ensure_ascii=False)


# ── Skill Reference Tools ───────────────────────────────


@mcp.tool()
async def get_skill_references(
    skill: str,
    filenames: str = "",
    project: str = "false-dane",
) -> str:
    """Load reference files for a specific writing skill.

    Args:
        skill: Skill name (e.g. "writer", "rhythm", "mouth").
        filenames: Comma-separated filenames to load. Empty = list all available.
        project: Project name (determines which codex skill variant to load).
    """
    from .references import list_skill_refs, load_ref

    if not filenames:
        refs = list_skill_refs(skill, project=project)
        return json.dumps(
            {"skill": skill, "project": project, "available_references": refs},
            ensure_ascii=False,
        )

    results = {}
    for fname in filenames.split(","):
        fname = fname.strip()
        content = load_ref(skill, fname, project=project)
        if content:
            results[fname] = content[:8000]
        else:
            results[fname] = None

    return json.dumps(
        {"skill": skill, "project": project, "references": results},
        ensure_ascii=False,
    )


@mcp.tool()
async def get_chapter_context_tool(
    chapter: str,
    project: str = "false-dane",
) -> str:
    """Load context files for a chapter (canon, planning, drafts, reviews, wiki).

    Use this to understand the current state of a chapter before working on it.

    Args:
        chapter: Chapter identifier (e.g. "CH01").
        project: Project name (e.g. "false-dane", "bloodline").
    """
    from .references import get_chapter_context

    context = get_chapter_context(chapter, project=project)
    return json.dumps(context, ensure_ascii=False)


# ── Project Planning Tools (8 stages) ────────────────────


@mcp.tool()
async def start_project_session(
    project: str,
) -> str:
    """Start a new project planning session (8 stages before any chapter).

    Must complete all 8 stages before starting chapter sessions.
    Stages: direction → theme → characters → synopsis → outline →
            character-driven → event-driven → worldbuilding

    Args:
        project: Project name (e.g. "hunter-reborn").
    """
    from .models import ProjectSession
    from .project_session import get_next_project_step, save_project_session

    session = ProjectSession(project=project)
    save_project_session(session)
    next_step = get_next_project_step(session)
    save_project_session(session)

    return json.dumps({
        "session_id": session.session_id,
        "project": project,
        "state": session.state.value,
        "next_step": next_step,
    }, ensure_ascii=False)


@mcp.tool()
async def get_planning_context(
    project: str,
    step: str,
    chapter: str = "",
) -> str:
    """Get context for a specific planning stage.

    Args:
        project: Project name.
        step: Planning step (set_direction, set_theme, create_character_sheets,
              write_synopsis, write_outline, design_character_driven,
              design_event_driven, finalize_worldbuilding, design_chapter_beats).
        chapter: For design_chapter_beats only — which chapter.
    """
    from .tools.planning import (
        get_direction_context, get_theme_context, get_character_sheets_context,
        get_synopsis_context, get_outline_context, get_character_driven_context,
        get_event_driven_context, get_worldbuilding_context, get_chapter_beats_context,
    )

    step_map = {
        "set_direction": lambda: get_direction_context(project),
        "set_theme": lambda: get_theme_context(project),
        "create_character_sheets": lambda: get_character_sheets_context(project),
        "write_synopsis": lambda: get_synopsis_context(project),
        "write_outline": lambda: get_outline_context(project),
        "design_character_driven": lambda: get_character_driven_context(project),
        "design_event_driven": lambda: get_event_driven_context(project),
        "finalize_worldbuilding": lambda: get_worldbuilding_context(project),
        "design_chapter_beats": lambda: get_chapter_beats_context(project, chapter),
    }

    fn = step_map.get(step)
    if fn is None:
        return json.dumps({"error": f"Unknown step: {step}. Available: {list(step_map.keys())}"})

    return json.dumps(fn(), ensure_ascii=False)


@mcp.tool()
async def complete_project_step(
    session_id: str,
    step: str,
    status: str = "pass",
    output_path: str = "",
    details_json: str = "{}",
) -> str:
    """Record completion of a project planning step and advance the state.

    Args:
        session_id: Project session ID from start_project_session.
        step: Step name (set_direction, set_theme, etc.).
        status: "pass" or "fail".
        output_path: Path to saved output file.
        details_json: Additional details as JSON string.
    """
    from .models import StepResult
    from .project_session import (
        advance_project_state, get_next_project_step,
        load_project_session, save_project_session,
    )

    session = load_project_session(session_id)
    if session is None:
        return json.dumps({"error": f"Project session not found: {session_id}"})

    try:
        details = json.loads(details_json)
    except json.JSONDecodeError:
        details = {}

    result = StepResult(step=step, status=status, output_path=output_path, details=details)
    advance_project_state(session, step, result)
    next_step = get_next_project_step(session)
    save_project_session(session)

    return json.dumps({
        "session_id": session_id,
        "step_completed": step,
        "new_state": session.state.value,
        "next_step": next_step,
    }, ensure_ascii=False)


@mcp.tool()
async def get_review_context_tool(
    review_type: str,
    project: str = "hunter-reborn",
) -> str:
    """Get review criteria for a planning stage (Generator ≠ Evaluator).

    BW-Editor uses this to critique planning outputs. Cross-context review.
    Available types: review_direction, review_characters, review_synopsis,
                     review_outline, review_driven, review_world

    Args:
        review_type: Which planning stage to review.
        project: Project name.
    """
    from .tools.review import get_review_context

    ctx = get_review_context(review_type, project)
    return json.dumps(ctx, ensure_ascii=False)


@mcp.tool()
async def get_project_session_status(session_id: str) -> str:
    """Get the full status of a project planning session.

    Args:
        session_id: Project session ID.
    """
    from .project_session import load_project_session

    session = load_project_session(session_id)
    if session is None:
        return json.dumps({"error": f"Project session not found: {session_id}"})
    return json.dumps(session.to_dict(), ensure_ascii=False)


# ── Business Tools (Market Research + Planning + Analytics + Learning) ────


@mcp.tool()
async def research_market(
    region: str = "all",
    genre: str = "",
) -> str:
    """Get market research context — platforms, trends, templates.

    Returns instructions + templates for the agent to research current trends.
    Agent should use web search to fill the templates.

    Args:
        region: "kr", "us", "jp", or "all".
        genre: Specific genre to focus on (empty = all genres).
    """
    from .tools.market_research import get_market_research_context

    ctx = get_market_research_context(region, genre)
    return json.dumps(ctx, ensure_ascii=False)


@mcp.tool()
async def get_market_report(region: str = "all") -> str:
    """Get the latest saved market research report.

    Args:
        region: "kr", "us", "jp", or "all".
    """
    from .tools.market_research import get_latest_market_report

    report = get_latest_market_report(region)
    return json.dumps(report, ensure_ascii=False)


@mcp.tool()
async def create_project(
    name: str,
    display_name: str = "",
    language: str = "ko",
    genre: str = "",
    tone: str = "",
    protagonist: str = "",
) -> str:
    """Create a new project — directory structure + config.toml + initial files.

    Call this after market research + planning to set up a new novel project.

    Args:
        name: Project identifier (lowercase, hyphenated, e.g. "dark-academy").
        display_name: Human-readable name (e.g. "다크 아카데미").
        language: Primary language ("ko" or "en").
        genre: Genre (e.g. "progression-fantasy", "romance-fantasy").
        tone: Tone (e.g. "picaresque-black-comedy", "dark-thriller").
        protagonist: Protagonist name.
    """
    from .tools.project_creator import create_project_structure

    result = create_project_structure(
        name=name, display_name=display_name, language=language,
        genre=genre, tone=tone, protagonist=protagonist,
    )
    return json.dumps(result, ensure_ascii=False)


@mcp.tool()
async def design_project_foundation(project: str) -> str:
    """Get templates for designing a project's foundation.

    Returns templates for protagonist, world, and act structure.
    Agent fills these based on market research and genre decisions.

    Args:
        project: Project name.
    """
    from .tools.project_creator import get_project_foundation_template

    template = get_project_foundation_template(project)
    return json.dumps(template, ensure_ascii=False)


@mcp.tool()
async def get_analytics_context(
    project: str,
    chapter: str = "",
) -> str:
    """Get analytics templates for collecting reader metrics.

    Args:
        project: Project name.
        chapter: Chapter to collect metrics for (empty = project-wide analysis).
    """
    if chapter:
        from .tools.analytics import ingest_metrics_template
        ctx = ingest_metrics_template(project, chapter)
    else:
        from .tools.analytics import get_feedback_analysis_template
        ctx = get_feedback_analysis_template(project)
    return json.dumps(ctx, ensure_ascii=False)


@mcp.tool()
async def get_learning_context(
    project: str,
    action: str = "extract",
    chapter: str = "",
    from_project: str = "",
) -> str:
    """Get learning system templates — lesson extraction, application, sharing.

    Args:
        project: Target project.
        action: "extract" (lessons from analytics), "apply" (to sprint), "share" (cross-project).
        chapter: For "apply" action — which chapter's sprint to inject into.
        from_project: For "share" action — source project.
    """
    if action == "extract":
        from .tools.learning import get_lesson_extraction_template
        ctx = get_lesson_extraction_template(project)
    elif action == "apply":
        from .tools.learning import apply_lesson_to_sprint
        ctx = apply_lesson_to_sprint(project, chapter, "")
    elif action == "share":
        from .tools.learning import share_lesson_template
        ctx = share_lesson_template(from_project or project, project)
    else:
        ctx = {"error": f"Unknown action: {action}. Use extract/apply/share."}
    return json.dumps(ctx, ensure_ascii=False)


# ── Publishing Tools ─────────────────────────────────────


@mcp.tool()
async def prepare_publish(
    project: str,
    chapter: str,
    platform: str = "",
) -> str:
    """Get publishing context — platform specs, metadata templates, cover prompt.

    Args:
        project: Project name.
        chapter: Chapter to publish.
        platform: Target platform (novelpia, kakaopage, royalroad, kindle). Empty = all.
    """
    from .tools.publishing import get_publish_context

    ctx = get_publish_context(project, chapter, platform)
    return json.dumps(ctx, ensure_ascii=False)


@mcp.tool()
async def crawl_market_data(
    platform: str = "royalroad",
) -> str:
    """Crawl real-time ranking data from web novel platforms using crawl4ai.

    Scrapes actual platform pages for current top rankings, genres, and trends.
    Much more accurate than web search — gets live data.

    Available platforms: kakaopage, novelpia, munpia, royalroad, narou, all

    Args:
        platform: Platform to crawl. Default "royalroad" (most reliable).
    """
    from .tools.crawler import crawl_platform

    result = crawl_platform(platform)
    return json.dumps(result, ensure_ascii=False)


@mcp.tool()
async def get_crawled_data(
    platform: str = "all",
) -> str:
    """Get the latest crawled market data (from a previous crawl_market_data call).

    Args:
        platform: Platform to get data for.
    """
    from .tools.crawler import get_latest_crawl

    result = get_latest_crawl(platform)
    return json.dumps(result, ensure_ascii=False)
