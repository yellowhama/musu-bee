"""English pre-filter using ZipPy compression-ratio detection."""

from __future__ import annotations

from ..models import FilterResult


def run_zippy(text: str) -> FilterResult:
    """Run ZipPy ensemble on English text.

    Returns FilterResult with score 0.0 (human) to 1.0 (AI).
    ZipPy returns (label, confidence) where label is "AI" or "Human".
    We normalize confidence to 0-1 range.
    """
    try:
        from zippy.zippy import EnsembledZippy

        detector = EnsembledZippy()
        result = detector.run_on_text_chunked(text)

        if result is None:
            return FilterResult(
                filter_name="zippy",
                score=0.5,
                features={"error": "could not determine"},
            )

        label, confidence = result

        # ZipPy confidence is unbounded (higher = more confident).
        # Normalize: map confidence to 0-1 using sigmoid-like scaling.
        # Typical confidence range is 0-10.
        normalized = min(confidence / 10.0, 1.0)

        # If label is "Human", invert the score (0 = human, 1 = AI)
        if label == "Human":
            score = max(0.0, 0.5 - normalized)
        else:
            score = min(1.0, 0.5 + normalized)

        return FilterResult(
            filter_name="zippy",
            score=score,
            features={
                "raw_label": label,
                "raw_confidence": confidence,
                "normalized_confidence": normalized,
            },
        )

    except ImportError:
        return FilterResult(
            filter_name="zippy",
            score=0.5,
            features={"error": "thinkst-zippy not installed"},
        )
    except Exception as e:
        return FilterResult(
            filter_name="zippy",
            score=0.5,
            features={"error": str(e)},
        )
