"""Pre-heartbeat diagnostic checks for self-healing.

Runs before the CEO dev loop to detect and remediate issues:
- Failed tasks in last N hours
- Stuck tasks (running past timeout)
- Stale workspace directories (older than N days)
"""
from __future__ import annotations

import logging
import shutil
import time
from dataclasses import dataclass, field
from pathlib import Path

logger = logging.getLogger(__name__)


@dataclass
class DiagnosticReport:
    """Result of a pre-heartbeat diagnostic run."""

    failed_tasks: list[dict] = field(default_factory=list)
    stuck_tasks: list[dict] = field(default_factory=list)
    cancelled_tasks: list[str] = field(default_factory=list)
    stale_workspaces_cleaned: int = 0
    needs_attention: bool = False
    summary: str = ""


class PreHeartbeatDiagnostic:
    """Run diagnostic checks before kicking the CEO dev loop."""

    def __init__(
        self,
        workspace_root: str | None = None,
        failed_window_hours: int = 2,
        stuck_timeout_multiplier: float = 2.0,
        stale_workspace_days: int = 7,
    ) -> None:
        self._workspace_root = Path(workspace_root) if workspace_root else None
        self._failed_hours = failed_window_hours
        self._stuck_mult = stuck_timeout_multiplier
        self._stale_days = stale_workspace_days

    def run(self, backend) -> DiagnosticReport:
        """Execute all diagnostic checks and return a report."""
        report = DiagnosticReport()

        # 1. Check recent failed tasks
        report.failed_tasks = self._check_failed_tasks(backend)

        # 2. Check stuck tasks and auto-cancel
        report.stuck_tasks = self._check_stuck_tasks(backend)
        for task in report.stuck_tasks:
            task_id = task.get("id", "")
            try:
                backend.update_route_execution(task_id, "failed", error="auto-cancelled by diagnostic: stuck")
                report.cancelled_tasks.append(task_id)
                logger.info("diagnostic: cancelled stuck task %s", task_id)
            except Exception as exc:
                logger.warning("diagnostic: failed to cancel stuck task %s: %s", task_id, exc)

        # 3. Cleanup stale workspaces
        if self._workspace_root and self._workspace_root.is_dir():
            report.stale_workspaces_cleaned = self._cleanup_stale_workspaces()

        # 4. Build summary
        report.needs_attention = bool(report.failed_tasks) or bool(report.cancelled_tasks)
        report.summary = self._build_summary(report)
        return report

    def _check_failed_tasks(self, backend) -> list[dict]:
        """Find tasks that failed in the last N hours."""
        try:
            from datetime import datetime, timedelta, timezone
            cutoff = (datetime.now(timezone.utc) - timedelta(hours=self._failed_hours)).isoformat()
            rows = backend._db.execute(
                "SELECT id, channel, error, created_at FROM route_executions "
                "WHERE status = 'failed' AND created_at >= ? "
                "ORDER BY created_at DESC LIMIT 20",
                (cutoff,),
            )
            return [dict(r) for r in rows]
        except Exception as exc:
            logger.warning("diagnostic: failed to check failed tasks: %s", exc)
            return []

    def _check_stuck_tasks(self, backend) -> list[dict]:
        """Find tasks that are running past their expected timeout."""
        try:
            from datetime import datetime, timedelta, timezone
            # Default timeout 300s * multiplier = 600s = 10min
            cutoff = (datetime.now(timezone.utc) - timedelta(seconds=300 * self._stuck_mult)).isoformat()
            rows = backend._db.execute(
                "SELECT id, channel, created_at FROM route_executions "
                "WHERE status = 'running' AND created_at < ? "
                "ORDER BY created_at LIMIT 10",
                (cutoff,),
            )
            return [dict(r) for r in rows]
        except Exception as exc:
            logger.warning("diagnostic: failed to check stuck tasks: %s", exc)
            return []

    def _cleanup_stale_workspaces(self) -> int:
        """Remove workspace directories older than N days."""
        if not self._workspace_root or not self._workspace_root.is_dir():
            return 0
        cutoff = time.time() - (self._stale_days * 86400)
        cleaned = 0
        for d in self._workspace_root.iterdir():
            if d.is_dir():
                try:
                    if d.stat().st_mtime < cutoff:
                        shutil.rmtree(d)
                        cleaned += 1
                except OSError:
                    pass
        if cleaned:
            logger.info("diagnostic: cleaned %d stale workspaces", cleaned)
        return cleaned

    def _build_summary(self, report: DiagnosticReport) -> str:
        """Generate a CEO-readable diagnostic summary."""
        parts: list[str] = []
        if report.failed_tasks:
            parts.append(f"최근 {self._failed_hours}시간 실패 태스크 {len(report.failed_tasks)}개")
            for t in report.failed_tasks[:5]:
                parts.append(f"  - [{t.get('channel')}] {t.get('error', 'unknown')[:80]}")
        if report.cancelled_tasks:
            parts.append(f"stuck 태스크 {len(report.cancelled_tasks)}개 자동 취소: {', '.join(report.cancelled_tasks[:5])}")
        if report.stale_workspaces_cleaned:
            parts.append(f"오래된 workspace {report.stale_workspaces_cleaned}개 정리")
        if not parts:
            return ""
        return "\n".join(parts)
