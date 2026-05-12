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
    project: str = "",
) -> str:
    """Start a new chapter writing session.

    Initializes the pipeline state machine and loads chapter context.
    Returns session_id + available context files + first step.

    Args:
        chapter: Chapter identifier (e.g. "CH01", "CH02")
        project: Project name (empty = active default from MUSU_DEFAULT_PROJECT)
    """
    import os

    from .models import Session
    from .project_config import default_project
    from .project_session import is_project_ready
    from .references import get_chapter_context
    from .session import get_next_step, load_previous_chapter_state, save_session

    project = project or default_project()

    # Gate: AI-native projects must complete planning first.
    # MUSU_HUMAN_AI_PROJECTS lists comma-separated project ids that bypass
    # the planning gate (operator's human-coauthored projects).
    human_ai_projects = {
        p.strip() for p in os.environ.get("MUSU_HUMAN_AI_PROJECTS", "").split(",") if p.strip()
    }
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
    project: str = "",
    session_id: str = "",
) -> str:
    """Get continuity audit context — knowledge layers, evidence tracking, forbidden reveals.

    Args:
        chapter: Chapter identifier (e.g. "CH01").
        project: Project name. Empty falls back to MUSU_DEFAULT_PROJECT.
        session_id: Optional session ID.
    """
    from .tools.continuity import get_continuity_context

    ctx = get_continuity_context(chapter, project=project)
    return json.dumps(ctx, ensure_ascii=False)


@mcp.tool()
async def design_characters(
    chapter: str,
    project: str = "",
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
    project: str = "",
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
    project: str = "",
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
    project: str = "",
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
    project: str = "",
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
    project: str = "",
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
    project: str = "",
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
    project: str = "",
) -> str:
    """Load context files for a chapter (canon, planning, drafts, reviews, wiki).

    Use this to understand the current state of a chapter before working on it.

    Args:
        chapter: Chapter identifier (e.g. "CH01").
        project: Project name. Empty falls back to MUSU_DEFAULT_PROJECT.
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
        project: Project name (operator-defined).
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
    project: str = "",
) -> str:
    """Get review criteria for a planning stage (Generator ≠ Evaluator).

    An editor/reviewer agent uses this to critique planning outputs (cross-context review).
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


@mcp.tool()
async def capture_decision(
    project: str,
    decision_type: str,
    statement: str,
    context: str = "",
) -> str:
    """Capture an author decision to decisions/<type>.md (prepend, newest on top).

    LLM call: none. Pure file operation. Part of the AI-augmented authorship
    system — externalizes the author's directional decisions so AI tools
    can auto-reference them in later steps (story_to_structure, etc.).

    Use this when the author makes a directional decision like:
    - tone: "에드릭 = 데드풀 + 한솔로 lock. 하드보일드 금지."
    - character_core: "현진 = 루피 코어. 다른 레퍼런스 양념으로만."
    - publish: "CH001~013 v 잠그고 첫 발행 1편 목표."
    - other: 분류 안 되는 결정

    Args:
        project: Project name (operator-defined)
        decision_type: One of "tone" | "character_core" | "publish" | "other"
        statement: Author's decision in their own words
        context: Optional rationale or background
    """
    from .tools.capture_decision import append_decision

    result = append_decision(project, decision_type, statement, context)
    return json.dumps(result, ensure_ascii=False)


@mcp.tool()
async def story_to_structure(
    project: str,
    story_seed: str,
    chapter_target: int = 1,
    seed_scope: str = "single_chapter",
    slug: str = "",
) -> str:
    """Convert author's story seed → unified 6-slot scene structure template.

    LLM call: none. Returns instructions + filled template for Claude Code
    to complete and save. Auto-references the project's latest tone decision
    (from decisions/tone.md) so the structure stays on-tone.

    Args:
        project: Project name (operator-defined)
        story_seed: Free-form author seed (the "큰 줄기")
        chapter_target: Number of chapters to structure
        seed_scope: "single_chapter" | "arc" | "season"
        slug: Optional output filename slug (auto-derived if empty)
    """
    from .tools.story_to_structure import generate_structure

    result = generate_structure(
        project, story_seed, chapter_target, seed_scope, slug
    )
    return json.dumps(result, ensure_ascii=False)


@mcp.tool()
async def research_to_canon(
    project: str,
    research_file: str,
    canon_category: str = "auto",
) -> str:
    """Extract canon candidates from a research report (research/<file>).

    LLM call: none. Returns research content + existing canon index +
    character_core reference + template/instructions. Claude Code does
    the extraction and writes the candidate file at output_path. Author
    then reviews and promotes the candidates manually (canon/_candidates/
    is the staging area).

    Args:
        project: Project name (operator-defined)
        research_file: File path inside research/ (e.g. "ANGLO_SAXON_LEGAL_STAKES.md"
                       or "references/MAPPING.md")
        canon_category: "world" | "character" | "system" | "rule" | "auto"
    """
    from .tools.research_to_canon import extract_candidates

    result = extract_candidates(project, research_file, canon_category)
    return json.dumps(result, ensure_ascii=False)


@mcp.tool()
async def audit_tone_drift(
    project: str,
    chapter: str,
) -> str:
    """Audit a chapter draft for tone drift against the project's locked tone.

    LLM call: none. Returns the full draft + tone_reference (from
    decisions/tone.md) + audit template. Claude Code performs the comparison
    and writes the audit at output_path.

    Requires:
    - A captured tone decision (decisions/tone.md). Run capture_decision first if missing.
    - An existing chapter draft (drafts/*.md, project-specific naming pattern).

    Args:
        project: Project name (operator-defined)
        chapter: Chapter id ("CH01" / "01" / "1")
    """
    from .tools.audit_tone_drift import audit_tone

    result = audit_tone(project, chapter)
    return json.dumps(result, ensure_ascii=False)


@mcp.tool()
async def audit_canon_drift(
    project: str,
    chapter: str,
) -> str:
    """Audit a chapter draft for conflicts with the project's canon.

    LLM call: none. Returns the full draft + all canon files (full bodies)
    + character_core reference (from decisions/character_core.md) + audit
    template. Claude Code performs the cross-check and writes the audit
    at output_path.

    Args:
        project: Project name (operator-defined)
        chapter: Chapter id ("CH01" / "01" / "1")
    """
    from .tools.audit_canon_drift import audit_canon

    result = audit_canon(project, chapter)
    return json.dumps(result, ensure_ascii=False)


@mcp.tool()
async def promote_canon_candidate(
    project: str,
    candidate_file: str,
    target_canon_path: str,
    mode: str = "by_section",
) -> str:
    """Promote approved canon candidates from canon/_candidates/ to canon/.

    LLM call: none. Pure file operation. Filters candidates by
    'Decision: [x] approve' lines (mode='by_section') or moves the whole
    file (mode='whole_file'). Appends to target if it exists, creates
    a new file otherwise. Records a promotion log inside the candidate file.

    Args:
        project: Project name (operator-defined). Required.
        candidate_file: Filename inside canon/_candidates/ (e.g.
            "ANGLO_SAXON_LEGAL_STAKES_canon_candidates.md")
        target_canon_path: Path inside canon/, relative (e.g. "world/economy.md")
        mode: "by_section" (default) or "whole_file"
    """
    from .tools.promote_canon_candidate import promote

    result = promote(project, candidate_file, target_canon_path, mode)
    return json.dumps(result, ensure_ascii=False)


@mcp.tool()
async def capture_lesson(
    lesson_type: str,
    statement: str,
    source_project: str = "",
    context: str = "",
) -> str:
    """Capture a company-level lesson (not project-scoped).

    LLM call: none. Appends to lessons/<type>.md (prepend, newest on top).
    Use this when the author flags a repeated correction, a failure recovery
    pattern, or a company-wide operational pattern. The lesson is then
    auto-referenced by audit tools (audit_tone_drift, audit_canon_drift).

    Categories:
    - repeated_correction: 작가가 반복 지적한 메타 패턴
    - failure_recovery: 실패 수습 사례 (어떻게 망쳤고 어떻게 고쳤나)
    - company_pattern: 회사 일반 패턴 (작품 무관, 운영/도구/워크플로)

    Args:
        lesson_type: "repeated_correction" | "failure_recovery" | "company_pattern"
        statement: The lesson, in your own words
        source_project: Optional — where the lesson came from
            (one of your project ids, "both", or "" for cross-project)
        context: Optional rationale
    """
    from .tools.capture_lesson import append_lesson

    result = append_lesson(lesson_type, statement, source_project, context)
    return json.dumps(result, ensure_ascii=False)


@mcp.tool()
async def decisions_to_brief(project: str = "") -> str:
    """Compress decisions/ + canon/ into a brief draft (dryrun).

    LLM call: none. Pure context provider. Author/Claude reads
    suggested_brief and decides whether to merge into PROJECT_BRIEF.md.

    Motivation: PROJECT_BRIEF.md grows large through round accumulation.
    This tool returns latest decisions per type + canon titles, plus a
    compact markdown text the author can use as the new brief baseline.

    Args:
        project: Project name (required, no default).
    """
    from .tools.decisions_to_brief import decisions_to_brief as fn

    result = fn(project)
    return json.dumps(result, ensure_ascii=False)


@mcp.tool()
async def audit_dialogue_tone(project: str = "", chapter: str = "") -> str:
    """Audit per-character dialogue tone consistency.

    LLM call: none. Pure context provider. Extracts dialogue lines from
    the latest chapter draft, pairs them with character_core + tone
    decisions, and returns context for Claude Code to judge.

    Complements audit_tone_drift (whole-chapter tone) with per-character
    dialogue checks.

    Args:
        project: Project name (required, no default).
        chapter: Optional chapter id ("CH01" / "01" / "1"). If empty,
            uses the highest-versioned draft in drafts/.
    """
    from .tools.audit_dialogue_tone import audit_dialogue as fn

    result = fn(project, chapter)
    return json.dumps(result, ensure_ascii=False)
