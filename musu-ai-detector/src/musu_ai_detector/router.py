"""Language detection and pre-filter routing.

This module extracts statistical features only.
The calling agent (Claude/Codex/Gemini) does the actual AI/human judgment.
"""

from __future__ import annotations

from .models import DetectionResult, FilterResult


def detect_language(text: str) -> str:
    """Detect the primary language of text.

    Returns: "ko", "en", or "mixed".
    """
    from langdetect import detect, DetectorFactory

    DetectorFactory.seed = 0

    paragraphs = [p.strip() for p in text.split("\n\n") if p.strip()]

    if len(paragraphs) <= 1:
        try:
            lang = detect(text)
            return "ko" if lang == "ko" else "en"
        except Exception:
            return "en"

    langs = set()
    for para in paragraphs:
        if len(para) < 20:
            continue
        try:
            lang = detect(para)
            langs.add("ko" if lang == "ko" else "en")
        except Exception:
            continue

    if len(langs) > 1:
        return "mixed"
    return langs.pop() if langs else "en"


def split_by_language(text: str) -> list[tuple[str, str, int, int]]:
    """Split mixed-language text into segments.

    Returns: list of (segment_text, language, start_offset, end_offset)
    """
    from langdetect import detect, DetectorFactory

    DetectorFactory.seed = 0

    segments = []
    offset = 0

    for para in text.split("\n\n"):
        if not para.strip():
            offset += len(para) + 2
            continue

        try:
            lang = detect(para)
            lang = "ko" if lang == "ko" else "en"
        except Exception:
            lang = "en"

        segments.append((para, lang, offset, offset + len(para)))
        offset += len(para) + 2

    return segments


async def run_pre_filter(text: str, language: str) -> tuple[FilterResult, list]:
    """Run the appropriate pre-filter based on language.

    Returns (FilterResult, list[Span]).
    Korean gets both statistical (KatFishNet) + pattern (im-not-ai) analysis.
    English gets ZipPy compression analysis.
    """
    from .models import Span

    if language == "ko":
        from .filters.katfish_filter import run_katfish
        from .filters.pattern_filter import run_pattern_filter

        # Run both filters
        stat_result = run_katfish(text)
        pattern_result, pattern_spans = run_pattern_filter(text)

        # Combine scores: pattern filter is much more informative
        # Weight: 30% statistical + 70% pattern
        combined_score = stat_result.score * 0.3 + pattern_result.score * 0.7

        combined_features = {
            "statistical": stat_result.features,
            "pattern": pattern_result.features,
        }

        combined = FilterResult(
            filter_name="katfish+pattern",
            score=round(combined_score, 3),
            features=combined_features,
        )
        return combined, pattern_spans
    else:
        from .filters.zippy_filter import run_zippy

        return run_zippy(text), []


async def run_detection(
    text: str,
    language: str = "auto",
) -> DetectionResult:
    """Run pre-filter analysis and return statistical features.

    This does NOT make AI/human judgment — that's the agent's job.
    It only extracts features and returns them for the agent to interpret.
    """
    from .store import save_result

    result = DetectionResult(text=text)

    # Step 1: Language detection
    if language == "auto":
        result.language = detect_language(text)
    else:
        result.language = language

    # Step 2: Pre-filter feature extraction (statistical + pattern)
    if result.language == "mixed":
        segments = split_by_language(text)
        ko_text = "\n\n".join(s[0] for s in segments if s[1] == "ko")
        en_text = "\n\n".join(s[0] for s in segments if s[1] == "en")

        ko_result, ko_spans = await run_pre_filter(ko_text, "ko") if ko_text else (None, [])
        en_result, en_spans = await run_pre_filter(en_text, "en") if en_text else (None, [])

        scores = []
        if ko_result:
            scores.append((ko_result.score, len(ko_text)))
        if en_result:
            scores.append((en_result.score, len(en_text)))

        total_len = sum(s[1] for s in scores)
        if total_len > 0:
            weighted_score = sum(s[0] * s[1] for s in scores) / total_len
        else:
            weighted_score = 0.5

        result.filter_result = FilterResult(
            filter_name="mixed",
            score=weighted_score,
            features={
                "ko": ko_result.to_dict() if ko_result else None,
                "en": en_result.to_dict() if en_result else None,
            },
        )
        result.spans = ko_spans + en_spans
    else:
        result.filter_result, result.spans = await run_pre_filter(text, result.language)

    result.score = result.filter_result.score
    result.escalation_level = 1

    # No verdict — agent decides based on features
    result.verdict = "pending"
    result.reasons.append(
        f"Pre-filter ({result.filter_result.filter_name}) score: {result.score:.3f}"
    )

    save_result(result)
    return result
