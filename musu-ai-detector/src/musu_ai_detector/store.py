"""Run-based result storage."""

from __future__ import annotations

import json
import os
from pathlib import Path

from .models import DetectionResult, FilterResult, Span

STORE_DIR = Path(os.environ.get("MUSU_DETECTOR_STORE", "~/.musu/ai-detector")).expanduser()


def _ensure_dir():
    STORE_DIR.mkdir(parents=True, exist_ok=True)


def save_result(result: DetectionResult) -> str:
    """Save a detection result. Returns run_id."""
    _ensure_dir()
    path = STORE_DIR / f"{result.run_id}.json"
    data = result.to_dict()
    # Also store original text for fix stage
    data["_text"] = result.text
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    return result.run_id


def load_result(run_id: str) -> DetectionResult | None:
    """Load a detection result by run_id."""
    path = STORE_DIR / f"{run_id}.json"
    if not path.exists():
        return None

    data = json.loads(path.read_text(encoding="utf-8"))

    filter_data = data.get("filter_result")
    filter_result = None
    if filter_data:
        filter_result = FilterResult(
            filter_name=filter_data["filter_name"],
            score=filter_data["score"],
            features=filter_data.get("features", {}),
        )

    spans = []
    for s in data.get("spans", []):
        spans.append(
            Span(
                text=s["text"],
                start=s["start"],
                end=s["end"],
                category=s["category"],
                severity=s["severity"],
                reason=s["reason"],
                suggested_fix=s.get("suggested_fix", ""),
            )
        )

    return DetectionResult(
        run_id=data["run_id"],
        text=data.get("_text", ""),
        language=data["language"],
        verdict=data["verdict"],
        score=data["score"],
        escalation_level=data["escalation_level"],
        filter_result=filter_result,
        llm_score=data.get("llm_score"),
        reasons=data.get("reasons", []),
        spans=spans,
        timestamp=data.get("timestamp", 0),
    )


def list_results(limit: int = 20) -> list[dict]:
    """List recent detection results."""
    _ensure_dir()
    files = sorted(STORE_DIR.glob("*.json"), key=lambda f: f.stat().st_mtime, reverse=True)
    results = []
    for f in files[:limit]:
        try:
            data = json.loads(f.read_text(encoding="utf-8"))
            results.append(
                {
                    "run_id": data["run_id"],
                    "language": data["language"],
                    "verdict": data["verdict"],
                    "score": data["score"],
                    "timestamp": data.get("timestamp"),
                }
            )
        except Exception:
            continue
    return results
