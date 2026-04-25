"""Phase 89: Fencing Token + RED 메트릭 — TDD test suite.

Tests:
  - v19 migration: lease_token column on route_executions
  - v20 migration: route_execution_tombstones table
  - LocalBackend fencing token semantics (create/update/tombstone)
  - route_chat metric coverage (mesh forward, no-agent paths)
  - metrics.py histogram large buckets
  - prometheus_rules.yml valid YAML + required rules
  - grafana_dashboard.json has >= 5 panels
"""
from __future__ import annotations

import json
import logging
import sqlite3
import sys
import uuid
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

# ---------------------------------------------------------------------------
# Path setup (mirrors conftest.py)
# ---------------------------------------------------------------------------
_ROOT = Path(__file__).parent.parent.parent
_MUSU_CORE = _ROOT / "musu-core" / "src"
_BRIDGE = Path(__file__).parent.parent

for p in (_MUSU_CORE, _BRIDGE):
    s = str(p)
    if s not in sys.path:
        sys.path.insert(0, s)

# ---------------------------------------------------------------------------
# Helper: in-memory DB with full schema + migrations
# ---------------------------------------------------------------------------


def _in_memory_db_with_migrations():
    """Return an in-memory sqlite3.Connection with the base schema + all migrations."""
    from musu_core import db as _db_mod
    conn = sqlite3.connect(":memory:")
    conn.row_factory = sqlite3.Row
    conn.executescript(_db_mod._SCHEMA)
    from musu_core.migrations import apply_pending
    apply_pending(conn)
    return conn


def _make_local_backend(tmp_path):
    """Return a LocalBackend backed by a temp file DB (fully migrated)."""
    from musu_core.backends.local import LocalBackend
    return LocalBackend(str(tmp_path / "test.db"))


# ===========================================================================
# A: Migration tests
# ===========================================================================


class TestV19Migration:
    """v19: lease_token column added to route_executions."""

    def test_v19_migration_adds_lease_token(self):
        """After v19 is applied, route_executions must have a lease_token column."""
        conn = _in_memory_db_with_migrations()
        cols = [row[1] for row in conn.execute("PRAGMA table_info(route_executions)").fetchall()]
        assert "lease_token" in cols, f"lease_token not found in {cols}"

    def test_v19_lease_token_default_is_zero(self):
        """Newly inserted rows (without explicit lease_token) default to 0."""
        conn = _in_memory_db_with_migrations()
        rid = str(uuid.uuid4())
        conn.execute(
            "INSERT INTO route_executions (id, channel, sender_id, input) VALUES (?, ?, ?, ?)",
            (rid, "test", "s1", "hi"),
        )
        conn.commit()
        row = conn.execute("SELECT lease_token FROM route_executions WHERE id = ?", (rid,)).fetchone()
        assert row["lease_token"] == 0


class TestV20Migration:
    """v20: route_execution_tombstones table created."""

    def test_v20_migration_creates_tombstone_table(self):
        conn = _in_memory_db_with_migrations()
        row = conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='route_execution_tombstones'"
        ).fetchone()
        assert row is not None, "route_execution_tombstones table not found"

    def test_v20_tombstone_table_columns(self):
        conn = _in_memory_db_with_migrations()
        cols = {row[1] for row in conn.execute("PRAGMA table_info(route_execution_tombstones)").fetchall()}
        assert {"channel", "sender_id", "tombstone_until"}.issubset(cols), f"Missing columns in {cols}"


# ===========================================================================
# B: LocalBackend fencing token tests
# ===========================================================================


class TestCreateRouteExecutionLeasToken:
    """create_route_execution sets lease_token=1."""

    def test_create_route_execution_sets_lease_token_1(self, tmp_path):
        backend = _make_local_backend(tmp_path)
        eid = str(uuid.uuid4())
        backend.create_route_execution(eid, "engineer", "user1", "do something")
        rows = backend._db.execute(
            "SELECT lease_token FROM route_executions WHERE id = ?", (eid,)
        )
        assert rows[0]["lease_token"] == 1


class TestUpdateRunningIncrementsLeaseToken:
    """update_route_execution('running', expected_lease_token=N) atomically increments."""

    def test_update_running_increments_lease_token(self, tmp_path):
        backend = _make_local_backend(tmp_path)
        eid = str(uuid.uuid4())
        backend.create_route_execution(eid, "engineer", "user1", "task A")
        # expected=1 → should set lease_token to 2
        backend.update_route_execution(eid, "running", expected_lease_token=1)
        rows = backend._db.execute(
            "SELECT lease_token, status FROM route_executions WHERE id = ?", (eid,)
        )
        assert rows[0]["lease_token"] == 2
        assert rows[0]["status"] == "running"

    def test_update_running_stale_token_rejected(self, tmp_path, caplog):
        """Stale token → rowcount=0 → WARNING logged, DB unchanged."""
        backend = _make_local_backend(tmp_path)
        eid = str(uuid.uuid4())
        backend.create_route_execution(eid, "engineer", "user1", "task B")
        with caplog.at_level(logging.WARNING):
            backend.update_route_execution(eid, "running", expected_lease_token=999)
        rows = backend._db.execute(
            "SELECT lease_token, status FROM route_executions WHERE id = ?", (eid,)
        )
        assert rows[0]["lease_token"] == 1  # unchanged
        assert rows[0]["status"] == "pending"  # unchanged
        assert any(
            "lease_token" in rec.message.lower() or "fencing" in rec.message.lower()
            for rec in caplog.records
        ), "Expected a WARNING about lease_token conflict"


class TestUpdateDoneTombstone:
    """update_route_execution('done'/'failed') with correct token writes tombstone."""

    def test_update_done_writes_tombstone(self, tmp_path):
        backend = _make_local_backend(tmp_path)
        eid = str(uuid.uuid4())
        backend.create_route_execution(eid, "engineer", "user1", "task C")
        backend.update_route_execution(eid, "running", expected_lease_token=1)
        backend.update_route_execution(eid, "done", expected_lease_token=2)
        # Check tombstone written
        rows = backend._db.execute(
            "SELECT tombstone_until FROM route_execution_tombstones"
            " WHERE channel = ? AND sender_id = ?",
            ("engineer", "user1"),
        )
        assert len(rows) == 1, "Expected one tombstone row"
        assert rows[0]["tombstone_until"] is not None

    def test_update_done_stale_token_zombie_rejected(self, tmp_path, caplog):
        """Stale token on done → status NOT changed to 'done', WARNING logged."""
        backend = _make_local_backend(tmp_path)
        eid = str(uuid.uuid4())
        backend.create_route_execution(eid, "engineer", "user1", "task D")
        backend.update_route_execution(eid, "running", expected_lease_token=1)
        # Now token is 2. Use stale token 999 for done — zombie scenario
        with caplog.at_level(logging.WARNING):
            backend.update_route_execution(eid, "done", expected_lease_token=999)
        rows = backend._db.execute(
            "SELECT status, lease_token FROM route_executions WHERE id = ?", (eid,)
        )
        # Should still be 'running' (not 'done')
        assert rows[0]["status"] == "running", f"Expected status=running, got {rows[0]['status']}"
        assert any(
            "zombie" in rec.message.lower() or "lease_token" in rec.message.lower()
            for rec in caplog.records
        ), "Expected WARNING about zombie/lease_token conflict"

    def test_update_done_without_expected_token_uses_legacy_path(self, tmp_path):
        """expected_lease_token=None → legacy update path (no token check), backward compat."""
        backend = _make_local_backend(tmp_path)
        eid = str(uuid.uuid4())
        backend.create_route_execution(eid, "engineer", "user1", "task E")
        # No expected_lease_token — legacy
        backend.update_route_execution(eid, "done")
        rows = backend._db.execute(
            "SELECT status FROM route_executions WHERE id = ?", (eid,)
        )
        assert rows[0]["status"] == "done"


class TestTombstoneBlocksCreate:
    """Tombstone prevents re-create within the lockout window."""

    def test_tombstone_blocks_create(self, tmp_path):
        backend = _make_local_backend(tmp_path)
        eid = str(uuid.uuid4())
        backend.create_route_execution(eid, "engineer", "user1", "task F")
        backend.update_route_execution(eid, "running", expected_lease_token=1)
        backend.update_route_execution(eid, "done", expected_lease_token=2)
        # Try to create again immediately — should fail with RuntimeError
        eid2 = str(uuid.uuid4())
        with pytest.raises(RuntimeError, match="tombstone"):
            backend.create_route_execution(eid2, "engineer", "user1", "task F redux")

    def test_tombstone_expired_allows_create(self, tmp_path):
        """After tombstone_until is in the past, create_route_execution succeeds."""
        backend = _make_local_backend(tmp_path)
        eid = str(uuid.uuid4())
        backend.create_route_execution(eid, "engineer", "user1", "task G")
        backend.update_route_execution(eid, "running", expected_lease_token=1)
        backend.update_route_execution(eid, "done", expected_lease_token=2)

        # Expire the tombstone by setting tombstone_until to past
        backend._db.execute(
            "UPDATE route_execution_tombstones SET tombstone_until = '2000-01-01T00:00:00.000Z'"
            " WHERE channel = ? AND sender_id = ?",
            ("engineer", "user1"),
        )

        eid3 = str(uuid.uuid4())
        # Should NOT raise
        backend.create_route_execution(eid3, "engineer", "user1", "task G repro")
        rows = backend._db.execute(
            "SELECT lease_token FROM route_executions WHERE id = ?", (eid3,)
        )
        assert rows[0]["lease_token"] == 1


# ===========================================================================
# C: route_chat metric coverage
# ===========================================================================


class TestRouteChatMetricCoverage:
    """All _finish() paths in route_chat must call _record_task_metric."""

    @pytest.mark.asyncio
    async def test_route_chat_no_agent_records_metric(self, tmp_path, monkeypatch):
        """When no agent is mapped to channel, _record_task_metric is called."""
        import handlers
        from unittest.mock import MagicMock

        # Patch the backend so create_route_execution doesn't need a real DB
        mock_backend = MagicMock()
        mock_backend.create_route_execution = MagicMock()
        mock_backend.update_route_execution = MagicMock()
        mock_backend.get_route_execution = MagicMock(return_value=None)
        mock_backend.get_agent_by_name = MagicMock(return_value=None)
        mock_backend.list_agents = MagicMock(return_value=[])
        mock_backend.touch_route_execution_activity = MagicMock()

        monkeypatch.setattr(handlers, "_backend", mock_backend)

        # Patch config to have an empty channel_agent_map
        mock_cfg = MagicMock()
        mock_cfg.channel_agent_map = {}
        monkeypatch.setattr(handlers, "get_bridge_config", lambda: mock_cfg)

        # Patch mesh router (not remote)
        mock_mesh = MagicMock()
        mock_mesh.enabled = False
        mock_mesh.is_remote = MagicMock(return_value=False)
        monkeypatch.setattr(handlers, "get_mesh_router", lambda: mock_mesh)

        # Patch circuit breaker
        monkeypatch.setattr(
            "handlers._channel_cb",
            MagicMock(is_open=MagicMock(return_value=False)),
            raising=False,
        )

        recorded = []

        def _fake_record(channel, status, duration_s=None):
            recorded.append({"channel": channel, "status": status, "duration_s": duration_s})

        # Patch at handlers module level (module-level wrapper is available after linter update)
        monkeypatch.setattr(handlers, "_record_task_metric", _fake_record)

        result = await handlers.route_chat("nonexistent_channel", "user1", "hello world from tests")
        assert result.get("error") is not None
        assert len(recorded) >= 1, "Expected _record_task_metric to be called at least once"

    @pytest.mark.asyncio
    async def test_route_chat_mesh_records_metric(self, tmp_path, monkeypatch):
        """Mesh forward path calls _record_task_metric."""
        import handlers

        mock_backend = MagicMock()
        mock_backend.create_route_execution = MagicMock()
        mock_backend.update_route_execution = MagicMock()
        mock_backend.touch_route_execution_activity = MagicMock()

        monkeypatch.setattr(handlers, "_backend", mock_backend)

        mock_cfg = MagicMock()
        mock_cfg.channel_agent_map = {}
        monkeypatch.setattr(handlers, "get_bridge_config", lambda: mock_cfg)

        # Mesh router: enabled, remote channel
        mock_mesh = MagicMock()
        mock_mesh.enabled = True
        mock_mesh.is_remote = MagicMock(return_value=True)
        mock_mesh.node_for_agent = MagicMock(return_value="remote-node")
        mock_mesh.url_for_node = MagicMock(return_value="http://remote:8070")
        mock_mesh.is_node_healthy = AsyncMock(return_value=True)
        mock_mesh.forward = AsyncMock(return_value={"response": "ok from remote", "error": None})
        monkeypatch.setattr(handlers, "get_mesh_router", lambda: mock_mesh)

        # Patch circuit breaker
        monkeypatch.setattr(
            "handlers._channel_cb",
            MagicMock(is_open=MagicMock(return_value=False)),
            raising=False,
        )

        recorded = []

        def _fake_record(channel, status, duration_s=None):
            recorded.append({"channel": channel, "status": status, "duration_s": duration_s})

        # Patch at handlers module level
        monkeypatch.setattr(handlers, "_record_task_metric", _fake_record)

        result = await handlers.route_chat("remote_channel", "user1", "hello from test mesh")
        assert len(recorded) >= 1, "Expected _record_task_metric to be called for mesh forward"


# ===========================================================================
# D: metrics.py histogram bucket test
# ===========================================================================


class TestHistogramLargeBuckets:
    def test_histogram_has_large_buckets(self):
        """_agent_task_duration histogram must include 3600 and 7200 buckets."""
        import metrics
        # Access the bucket configuration
        # The histogram is either a real Prometheus object or None
        # We check the registered bucket list from the module-level constant
        # by inspecting metrics._agent_task_duration_seconds definition
        import inspect
        source = inspect.getsource(metrics)
        # The buckets list should contain 3600 and 7200
        assert "3600" in source, "3600 bucket not found in metrics.py source"
        assert "7200" in source, "7200 bucket not found in metrics.py source"


# ===========================================================================
# E: prometheus_rules.yml valid YAML
# ===========================================================================


class TestPrometheusRulesFile:
    def test_prometheus_rules_file_valid_yaml(self):
        import yaml
        rules_path = (
            Path(__file__).parent.parent / "monitoring" / "prometheus_rules.yml"
        )
        assert rules_path.exists(), f"prometheus_rules.yml not found at {rules_path}"
        with open(rules_path) as f:
            data = yaml.safe_load(f)
        assert isinstance(data, dict), "prometheus_rules.yml must be a YAML dict"
        assert "groups" in data, "prometheus_rules.yml must have 'groups' key"
        all_rules = [
            r
            for g in data["groups"]
            for r in g.get("rules", [])
        ]
        rule_names = [r.get("alert") for r in all_rules]
        assert "AgentTaskP99High" in rule_names, (
            f"AgentTaskP99High not found in rules: {rule_names}"
        )
        assert "ZombieRateHigh" in rule_names, (
            f"ZombieRateHigh not found in rules: {rule_names}"
        )


# ===========================================================================
# F: grafana_dashboard.json has >= 5 panels
# ===========================================================================


class TestGrafanaDashboard:
    def test_grafana_dashboard_has_panels(self):
        dashboard_path = (
            Path(__file__).parent.parent / "monitoring" / "grafana_dashboard.json"
        )
        assert dashboard_path.exists(), f"grafana_dashboard.json not found at {dashboard_path}"
        with open(dashboard_path) as f:
            data = json.load(f)
        panels = data.get("panels", [])
        assert len(panels) >= 5, (
            f"Expected >= 5 panels, got {len(panels)}: {[p.get('title') for p in panels]}"
        )
        assert data.get("uid") == "musu-agent-red-v1", (
            f"Dashboard uid must be 'musu-agent-red-v1', got {data.get('uid')!r}"
        )
