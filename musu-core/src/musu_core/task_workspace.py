"""Per-task workspace for file-based agent communication.

Anthropic pattern: agents write structured JSON handoff files instead of
relying on CEO to relay everything via text prompts.

Directory layout:
    .musu/tasks/{task_id}/
        sprint_contract.json   — written by CEO before delegating
        engineer_output.json   — written by Engineer at end of execution
        qa_feedback.json       — written by QA at end of evaluation
"""
from __future__ import annotations

import json
import os
import tempfile
from pathlib import Path
from typing import Any

_DEFAULT_ROOT = os.path.join(os.environ.get("MUSU_PROJECT_ROOT", os.getcwd()), ".musu", "tasks")


class TaskWorkspace:
    """Manage a per-task workspace directory with structured handoff files."""

    def __init__(self, task_id: str, root: str | None = None) -> None:
        self.task_id = task_id
        self._root = Path(root or os.environ.get("MUSU_TASK_WORKSPACE_ROOT", _DEFAULT_ROOT))
        self.path = self._root / task_id

    def create(self) -> Path:
        """Create workspace directory. Idempotent."""
        self.path.mkdir(parents=True, exist_ok=True)
        return self.path

    # ── Writers (atomic: write tmp then rename) ────────────────────────────

    def _atomic_write(self, filename: str, data: dict[str, Any]) -> Path:
        self.create()
        target = self.path / filename
        fd, tmp = tempfile.mkstemp(dir=str(self.path), suffix=".tmp")
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
            os.replace(tmp, target)
        except BaseException:
            if os.path.exists(tmp):
                os.unlink(tmp)
            raise
        return target

    def write_contract(self, contract: dict[str, Any]) -> Path:
        """Write sprint_contract.json."""
        return self._atomic_write("sprint_contract.json", contract)

    def write_engineer_output(self, output: dict[str, Any]) -> Path:
        """Write engineer_output.json."""
        return self._atomic_write("engineer_output.json", output)

    def write_qa_feedback(self, feedback: dict[str, Any]) -> Path:
        """Write qa_feedback.json."""
        return self._atomic_write("qa_feedback.json", feedback)

    # ── Readers ────────────────────────────────────────────────────────────

    def _read(self, filename: str) -> dict[str, Any] | None:
        target = self.path / filename
        if not target.exists():
            return None
        try:
            return json.loads(target.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            return None

    def read_contract(self) -> dict[str, Any] | None:
        return self._read("sprint_contract.json")

    def read_engineer_output(self) -> dict[str, Any] | None:
        return self._read("engineer_output.json")

    def read_qa_feedback(self) -> dict[str, Any] | None:
        return self._read("qa_feedback.json")

    # ── Utility ────────────────────────────────────────────────────────────

    def exists(self) -> bool:
        return self.path.is_dir()

    def list_files(self) -> list[str]:
        if not self.path.is_dir():
            return []
        return [f.name for f in self.path.iterdir() if f.is_file()]
