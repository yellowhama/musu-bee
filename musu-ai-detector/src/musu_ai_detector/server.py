"""FastMCP server — AI detection tools for MUSU agents.

These tools extract statistical features from text.
The agent (Claude/Codex/Gemini) interprets the features and makes the judgment.
"""

from mcp.server.fastmcp import FastMCP

mcp = FastMCP("Musu AI Detector")


@mcp.tool()
async def detect_ai(
    text: str,
    language: str = "auto",
) -> str:
    """Extract AI-detection features from text using statistical pre-filters.

    Runs language-specific analysis:
    - Korean: KatFishNet (morpheme analysis, comma patterns, POS n-gram diversity)
    - English: ZipPy (compression-ratio detection)
    - Mixed: both filters on respective segments

    Returns JSON with:
    - language: detected language ("ko", "en", "mixed")
    - score: pre-filter score (0.0=human-like, 1.0=AI-like)
    - features: detailed statistical features for your judgment
    - run_id: for later reference or fix

    YOU (the agent) decide if the text is AI-generated based on these features.
    The tool does NOT make that judgment.

    Args:
        text: Text to analyze.
        language: "auto" (detect), "ko" (Korean), "en" (English).
    """
    import json

    from .router import run_detection

    result = await run_detection(text, language=language)
    return json.dumps(result.to_dict(), ensure_ascii=False)


@mcp.tool()
async def detect_ai_report(run_id: str) -> str:
    """Retrieve a previous detection result by run_id.

    Args:
        run_id: The run ID from a previous detect_ai call.
    """
    import json

    from .store import load_result

    result = load_result(run_id)
    if result is None:
        return json.dumps({"error": f"No result found for run_id: {run_id}"})
    return json.dumps(result.to_dict(), ensure_ascii=False)


@mcp.tool()
async def detect_ai_fix(
    run_id: str,
    spans_json: str = "[]",
) -> str:
    """Prepare humanization workspace for a detected text.

    For Korean: creates im-not-ai workspace with pre-computed findings.
    For English: creates workspace with agent-provided span annotations.

    The agent should provide span annotations from its own judgment
    (not from the pre-filter — the pre-filter only gives statistical features).

    Args:
        run_id: The run ID from a previous detect_ai call.
        spans_json: JSON array of span objects from YOUR analysis.
            Each span: {"text", "start", "end", "category", "severity", "reason", "suggested_fix"}
    """
    import json

    from .fixer import prepare_fix_workspace
    from .models import Span
    from .store import load_result

    result = load_result(run_id)
    if result is None:
        return json.dumps({"error": f"No result found for run_id: {run_id}"})

    # Parse agent-provided spans
    try:
        spans_data = json.loads(spans_json)
        spans = [
            Span(
                text=s.get("text", ""),
                start=s.get("start", 0),
                end=s.get("end", 0),
                category=s.get("category", "agent"),
                severity=s.get("severity", "S2"),
                reason=s.get("reason", ""),
                suggested_fix=s.get("suggested_fix", ""),
            )
            for s in spans_data
        ]
    except (json.JSONDecodeError, TypeError):
        spans = []

    result.spans = spans
    fix_result = await prepare_fix_workspace(result)
    return json.dumps(fix_result.to_dict(), ensure_ascii=False)
