"""E2E diagnostic tests: PreHeartbeatDiagnostic detection and cleanup."""
from __future__ import annotations

import time
from pathlib import Path

from diagnostics import PreHeartbeatDiagnostic, DiagnosticReport


def test_diagnostic_clean_state(tmp_path):
    """No issues → needs_attention=False, empty summary."""
    from musu_core.backends.local import LocalBackend
    backend = LocalBackend(str(tmp_path / "test.db"))
    diag = PreHeartbeatDiagnostic(workspace_root=str(tmp_path / "tasks"))
    report = diag.run(backend)
    assert not report.needs_attention
    assert report.summary == ""
    assert report.failed_tasks == []
    assert report.stuck_tasks == []


def test_diagnostic_stale_workspace_cleanup(tmp_path):
    """Stale workspaces (>7 days old) are cleaned up."""
    ws_root = tmp_path / "tasks"
    ws_root.mkdir()
    # Create a "stale" workspace dir
    stale = ws_root / "old-task"
    stale.mkdir()
    (stale / "dummy.json").write_text("{}")
    # Set mtime to 10 days ago
    old_time = time.time() - (10 * 86400)
    import os
    os.utime(stale, (old_time, old_time))

    # Create a "fresh" workspace
    fresh = ws_root / "new-task"
    fresh.mkdir()
    (fresh / "data.json").write_text("{}")

    from musu_core.backends.local import LocalBackend
    backend = LocalBackend(str(tmp_path / "test.db"))
    diag = PreHeartbeatDiagnostic(workspace_root=str(ws_root), stale_workspace_days=7)
    report = diag.run(backend)

    assert report.stale_workspaces_cleaned == 1
    assert not stale.exists()  # cleaned
    assert fresh.exists()  # kept


def test_diagnostic_report_summary(tmp_path):
    """Report with issues produces non-empty summary."""
    report = DiagnosticReport(
        failed_tasks=[{"channel": "engineer", "error": "timeout"}],
        stuck_tasks=[],
        cancelled_tasks=[],
        needs_attention=True,
    )
    # Build summary manually
    diag = PreHeartbeatDiagnostic()
    report.summary = diag._build_summary(report)
    assert "실패" in report.summary
    assert "engineer" in report.summary
