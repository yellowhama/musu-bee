"""Experience store for self-improving agents (Learning Level 2).

Stores successful task trajectories as reusable examples.
When a similar task comes up, the experience is injected as few-shot context.

Storage: .musu/experience/{channel}/{hash}.json
"""
from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
from typing import Any

_DEFAULT_ROOT = os.path.join(
    os.environ.get("MUSU_PROJECT_ROOT", os.getcwd()), ".musu", "experience"
)


class ExperienceStore:
    """Store and retrieve successful task experiences for few-shot learning."""

    def __init__(self, root: str | None = None) -> None:
        self._root = Path(root or os.environ.get("MUSU_EXPERIENCE_ROOT", _DEFAULT_ROOT))

    def save(
        self,
        channel: str,
        task_summary: str,
        result_summary: str,
        scores: dict[str, int] | None = None,
        tags: list[str] | None = None,
    ) -> Path:
        """Save a successful experience. Returns the file path."""
        channel_dir = self._root / channel
        channel_dir.mkdir(parents=True, exist_ok=True)

        # Hash the task summary for dedup
        h = hashlib.sha256(task_summary.encode()).hexdigest()[:12]
        entry = {
            "task": task_summary[:500],
            "result": result_summary[:1000],
            "scores": scores or {},
            "tags": tags or [],
        }
        path = channel_dir / f"{h}.json"
        path.write_text(json.dumps(entry, ensure_ascii=False, indent=2), encoding="utf-8")
        return path

    def find_similar(self, channel: str, query: str, limit: int = 3) -> list[dict[str, Any]]:
        """Find experiences for a channel, sorted by keyword overlap with query.

        Simple keyword matching — no embeddings needed.
        """
        channel_dir = self._root / channel
        if not channel_dir.is_dir():
            return []

        query_words = set(query.lower().split())
        scored: list[tuple[float, dict]] = []

        for f in channel_dir.glob("*.json"):
            try:
                entry = json.loads(f.read_text(encoding="utf-8"))
                task_words = set(entry.get("task", "").lower().split())
                tag_words = set(t.lower() for t in entry.get("tags", []))
                overlap = len(query_words & (task_words | tag_words))
                if overlap > 0:
                    scored.append((overlap, entry))
            except (json.JSONDecodeError, OSError):
                continue

        scored.sort(key=lambda x: x[0], reverse=True)
        return [e for _, e in scored[:limit]]

    def count(self, channel: str | None = None) -> int:
        """Count stored experiences, optionally per channel."""
        if channel:
            d = self._root / channel
            return len(list(d.glob("*.json"))) if d.is_dir() else 0
        total = 0
        if self._root.is_dir():
            for d in self._root.iterdir():
                if d.is_dir():
                    total += len(list(d.glob("*.json")))
        return total
