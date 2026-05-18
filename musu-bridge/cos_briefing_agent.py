"""V23.5 C-3 — CoS agent LLM synthesis (opt-in path Y).

Wraps the Anthropic client behind 4 hard constraints set by the V23.5 Phase -1
mini-gate (see docs/V23_5_IMPL_PLAN_2026_05_19.md §4):

  (a) Graceful degrade to C-1 — every failure mode returns
      ``SynthesisResult(synthesis=None, degraded=True, ...)`` instead of
      raising, so the caller can fall back to the algorithmic
      ``recent_wiki_pages`` list from C-1.
  (b) Explicit user API key — reads ``MUSU_USER_LLM_API_KEY`` only. No bundled
      key, no auto-default. If unset, ``is_synthesis_enabled()`` returns False
      and ``synthesize_briefing()`` short-circuits with
      ``degrade_reason='api_key_not_configured'``.
  (c) UI cost preview — out of scope here; handled in the musu-bee proxy /
      frontend onClick. This module is callable only after the UI has
      confirmed the cost preview.
  (d) Local-only telemetry — uses ``logger.info`` / ``logger.error`` with
      structured ``extra`` fields. No phone-home, no metrics endpoint,
      no schema migration. Follows the H-1 structured-logging pattern.

The ``anthropic`` library is NOT a hard dependency. It is imported lazily
inside ``synthesize_briefing`` and any ImportError degrades gracefully so the
bridge keeps running without it. Add ``anthropic>=0.40`` as an optional dep
if you want LLM synthesis; without it everything still works in degraded
mode.
"""
from __future__ import annotations

import logging
import os
import time
from dataclasses import dataclass

logger = logging.getLogger("musu.cos_briefing_agent")


@dataclass
class SynthesisResult:
    """Return value of ``synthesize_briefing``.

    ``synthesis`` is the LLM-produced text on success; ``None`` on any
    failure. ``degraded=True`` is the caller's signal to fall back to the
    C-1 algorithmic list. ``degrade_reason`` is a short stable string
    suitable for logging and for surfacing to the UI without leaking
    sensitive provider details.
    """

    synthesis: str | None
    degraded: bool
    degrade_reason: str | None = None
    duration_ms: int = 0


def _api_key() -> str | None:
    """(b) Read the explicit user-supplied API key only.

    Returns ``None`` when the env var is unset or empty after stripping
    whitespace. No fallback to other env vars (e.g. ANTHROPIC_API_KEY) —
    that would violate constraint (b).
    """
    key = os.environ.get("MUSU_USER_LLM_API_KEY", "").strip()
    return key if key else None


def is_synthesis_enabled() -> bool:
    """(b) Cheap predicate for the status endpoint + UI button state.

    True iff the user has explicitly provided ``MUSU_USER_LLM_API_KEY``.
    Does NOT validate the key against the provider — that would cost a
    request per page load.
    """
    return _api_key() is not None


def synthesize_briefing(
    recent_pages: list[dict],
    company_id: str,
    timeout_sec: float = 8.0,
    model: str = "claude-haiku-4-5",
    max_tokens: int = 512,
) -> SynthesisResult:
    """Synthesize ``recent_pages`` (from C-1) into 2-3 actionable bullets.

    Hard contract: NEVER raises. Every failure path returns a
    ``SynthesisResult`` with ``degraded=True`` so the caller can ship a
    degraded-but-useful response to the UI.

    Args:
        recent_pages: ``recent_wiki_pages`` list from C-1
            ``_scan_recent_wiki_pages``. Each dict has ``page_id``,
            ``title``, ``scope``, ``updated_at``, ``summary_excerpt``.
            Empty list → degraded ``no_pages_to_synthesize``.
        company_id: company id (used only in prompt context, never logged).
        timeout_sec: per-request timeout. 8s is generous for Haiku.
        model: Anthropic model id. Haiku is the cheap default per the
            Phase -1 mini-gate cost preview ("~$0.20").
        max_tokens: cap output length.
    """
    start = time.monotonic()

    key = _api_key()
    if not key:
        # (b) Explicit API key gate — endpoint should have already returned
        # 503 here; this branch is the defence-in-depth case for direct
        # programmatic callers.
        return SynthesisResult(
            synthesis=None,
            degraded=True,
            degrade_reason="api_key_not_configured",
        )

    if not recent_pages:
        return SynthesisResult(
            synthesis=None,
            degraded=True,
            degrade_reason="no_pages_to_synthesize",
        )

    pages_text = "\n\n".join(
        f"## {p.get('title') or p.get('page_id', '')}\n"
        f"{p.get('summary_excerpt', '')}"
        for p in recent_pages[:5]
    )
    prompt = (
        f"Summarize these recent wiki updates for company {company_id} "
        f"into 2-3 actionable bullets (max 200 words total). Focus on "
        f"what changed and what the chairman needs to know:\n\n"
        f"{pages_text}"
    )

    try:
        # Lazy import so the bridge keeps running when anthropic is not
        # installed. Constraint (a): no hard dep on anthropic.
        import anthropic  # type: ignore[import-not-found]
    except ImportError:
        logger.warning(
            "cos_synthesis_degraded",
            extra={"site": "cos_synthesis", "reason": "anthropic_lib_missing"},
        )
        return SynthesisResult(
            synthesis=None,
            degraded=True,
            degrade_reason="anthropic_lib_missing",
            duration_ms=int((time.monotonic() - start) * 1000),
        )

    try:
        client = anthropic.Anthropic(api_key=key, timeout=timeout_sec)
        msg = client.messages.create(
            model=model,
            max_tokens=max_tokens,
            messages=[{"role": "user", "content": prompt}],
        )
        # Anthropic SDK returns content blocks; join text blocks only.
        text_parts: list[str] = []
        for block in getattr(msg, "content", []) or []:
            block_text = getattr(block, "text", None)
            if isinstance(block_text, str):
                text_parts.append(block_text)
        text = "\n".join(text_parts).strip()
        if not text:
            # Provider returned 200 but empty content — degrade rather than
            # ship "" to the UI.
            logger.warning(
                "cos_synthesis_degraded",
                extra={"site": "cos_synthesis", "reason": "empty_response"},
            )
            return SynthesisResult(
                synthesis=None,
                degraded=True,
                degrade_reason="empty_response",
                duration_ms=int((time.monotonic() - start) * 1000),
            )

        duration_ms = int((time.monotonic() - start) * 1000)
        usage = getattr(msg, "usage", None)
        # (d) Local-only structured log. No phone-home; tokens stay in
        # local stderr/stdout per the H-1 logging pattern. We deliberately
        # do NOT log the prompt or the response — only counts + duration.
        logger.info(
            "cos_synthesis_ok",
            extra={
                "site": "cos_synthesis",
                "duration_ms": duration_ms,
                "input_tokens": getattr(usage, "input_tokens", 0) if usage else 0,
                "output_tokens": getattr(usage, "output_tokens", 0) if usage else 0,
                "model": model,
                "page_count": len(recent_pages[:5]),
            },
        )
        return SynthesisResult(
            synthesis=text,
            degraded=False,
            duration_ms=duration_ms,
        )
    except Exception as exc:  # noqa: BLE001 — graceful degrade is the spec
        # (a) Catch-all so every provider error (timeout, auth, rate limit,
        # network, parse) degrades instead of 500-ing.
        duration_ms = int((time.monotonic() - start) * 1000)
        err_class = exc.__class__.__name__
        logger.error(
            "cos_synthesis_failed",
            extra={
                "site": "cos_synthesis",
                "error_class": err_class,
                "error_msg": str(exc)[:200],
                "duration_ms": duration_ms,
            },
        )
        return SynthesisResult(
            synthesis=None,
            degraded=True,
            degrade_reason=f"llm_error:{err_class}",
            duration_ms=duration_ms,
        )
