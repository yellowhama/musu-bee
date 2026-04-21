"""QA scoring dataclass for MUSU harness evaluation loop.

The QA Lead returns a QAScore after reviewing Engineer output.
All four criteria must reach PASS_THRESHOLD (7) for overall pass.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Any

PASS_THRESHOLD = 7
MAX_ITERATIONS = 3


@dataclass
class QAScore:
    """4-criteria quality score returned by the QA agent."""

    functionality: int  # 1–10: works as intended
    correctness: int    # 1–10: edge cases, error handling
    completeness: int   # 1–10: all Sprint Contract criteria met
    code_quality: int   # 1–10: readability, patterns, no duplication

    feedback: str = ""
    iteration: int = 1

    # Raw output from QA agent (for debugging)
    raw_output: str = ""

    @property
    def pass_(self) -> bool:
        """True when all four criteria meet PASS_THRESHOLD."""
        return all(
            s >= PASS_THRESHOLD
            for s in (
                self.functionality,
                self.correctness,
                self.completeness,
                self.code_quality,
            )
        )

    @property
    def failing_criteria(self) -> list[str]:
        """Return names of criteria below threshold."""
        result = []
        for name, val in [
            ("functionality", self.functionality),
            ("correctness", self.correctness),
            ("completeness", self.completeness),
            ("code_quality", self.code_quality),
        ]:
            if val < PASS_THRESHOLD:
                result.append(f"{name}={val}")
        return result

    def to_dict(self) -> dict[str, Any]:
        return {
            "pass": self.pass_,
            "scores": {
                "functionality": self.functionality,
                "correctness": self.correctness,
                "completeness": self.completeness,
                "code_quality": self.code_quality,
            },
            "feedback": self.feedback,
            "iteration": self.iteration,
        }

    def to_json(self) -> str:
        return json.dumps(self.to_dict(), ensure_ascii=False, indent=2)

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "QAScore":
        scores = data.get("scores", {})
        return cls(
            functionality=int(scores.get("functionality", 0)),
            correctness=int(scores.get("correctness", 0)),
            completeness=int(scores.get("completeness", 0)),
            code_quality=int(scores.get("code_quality", 0)),
            feedback=data.get("feedback", ""),
            iteration=int(data.get("iteration", 1)),
        )

    REQUIRED_KEYS: tuple[str, ...] = ("functionality", "correctness", "completeness", "code_quality")

    @classmethod
    def parse_agent_output(cls, raw: str, iteration: int = 1) -> "QAScore | None":
        """
        Attempt to parse QA agent output as JSON.
        Expected format:
          {
            "functionality": 8,
            "correctness": 7,
            "completeness": 6,
            "code_quality": 8,
            "feedback": "completeness: missing X"
          }
        Returns None on parse failure.
        Uses a bracket-matching scan to handle nested JSON in feedback strings.
        """
        # Bracket-matching scan: find outermost {...} block
        start = raw.find("{")
        if start == -1:
            return None
        depth = 0
        end = -1
        for i, ch in enumerate(raw[start:], start=start):
            if ch == "{":
                depth += 1
            elif ch == "}":
                depth -= 1
                if depth == 0:
                    end = i + 1
                    break
        if end == -1:
            return None

        try:
            data = json.loads(raw[start:end])
        except json.JSONDecodeError:
            return None

        # Validate all required keys are present with recognizable names
        missing = [k for k in cls.REQUIRED_KEYS if k not in data]
        if missing:
            return None

        try:
            return cls(
                functionality=int(data["functionality"]),
                correctness=int(data["correctness"]),
                completeness=int(data["completeness"]),
                code_quality=int(data["code_quality"]),
                feedback=data.get("feedback", ""),
                iteration=iteration,
                raw_output=raw,
            )
        except (KeyError, ValueError):
            return None
