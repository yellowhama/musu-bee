"""Data models for AI detection results."""

from __future__ import annotations

import time
import uuid
from dataclasses import dataclass, field


@dataclass
class Span:
    """A highlighted span of AI-detected text."""

    text: str
    start: int
    end: int
    category: str  # "A-2", "zippy", "katfish-pos", etc.
    severity: str  # "S1" | "S2" | "S3"
    reason: str
    suggested_fix: str = ""

    def to_dict(self) -> dict:
        return {
            "text": self.text,
            "start": self.start,
            "end": self.end,
            "category": self.category,
            "severity": self.severity,
            "reason": self.reason,
            "suggested_fix": self.suggested_fix,
        }


@dataclass
class FilterResult:
    """Result from a pre-filter (ZipPy or KatFishNet)."""

    filter_name: str  # "zippy" | "katfish"
    score: float  # 0.0 (human) ~ 1.0 (AI)
    features: dict = field(default_factory=dict)
    raw_output: str = ""

    def to_dict(self) -> dict:
        return {
            "filter_name": self.filter_name,
            "score": self.score,
            "features": self.features,
        }


@dataclass
class DetectionResult:
    """Full detection result including all stages."""

    run_id: str = field(default_factory=lambda: f"{int(time.time())}-{uuid.uuid4().hex[:8]}")
    text: str = ""
    language: str = "auto"  # "ko" | "en" | "mixed"
    verdict: str = "uncertain"  # "human" | "ai" | "uncertain"
    score: float = 0.5  # 0.0 (human) ~ 1.0 (AI)
    escalation_level: int = 0  # 0=none, 1=pre-filter, 2=llm
    filter_result: FilterResult | None = None
    llm_score: float | None = None
    reasons: list[str] = field(default_factory=list)
    spans: list[Span] = field(default_factory=list)
    timestamp: float = field(default_factory=time.time)

    def to_dict(self) -> dict:
        return {
            "run_id": self.run_id,
            "language": self.language,
            "verdict": self.verdict,
            "score": self.score,
            "escalation_level": self.escalation_level,
            "filter_result": self.filter_result.to_dict() if self.filter_result else None,
            "llm_score": self.llm_score,
            "reasons": self.reasons,
            "spans": [s.to_dict() for s in self.spans],
            "timestamp": self.timestamp,
        }


@dataclass
class FixResult:
    """Result from humanization/fix stage."""

    run_id: str = ""
    original_text: str = ""
    fixed_text: str = ""
    changes: list[dict] = field(default_factory=list)
    method: str = ""  # "im-not-ai" | "llm-direct"

    def to_dict(self) -> dict:
        return {
            "run_id": self.run_id,
            "fixed_text": self.fixed_text,
            "changes": self.changes,
            "method": self.method,
        }
