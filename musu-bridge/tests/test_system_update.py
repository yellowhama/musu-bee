"""Tests for /api/system/update and /api/system/update-all endpoints."""
from __future__ import annotations

import os
import sys
from pathlib import Path
from unittest.mock import patch, MagicMock

import pytest

sys.path.insert(0, str(Path(__file__).parent.parent))
sys.path.insert(0, str(Path(__file__).parent.parent.parent / "musu-core" / "src"))

os.environ.setdefault("MUSU_BRIDGE_TOKEN", "test-token")

from server import app
from fastapi.testclient import TestClient

client = TestClient(app, headers={"Authorization": "Bearer test-token"})


class TestSystemUpdate:
    @patch("system_routes.subprocess.check_output")
    def test_update_already_up_to_date(self, mock_subprocess):
        """When git pull returns 'Already up to date', updated should be false."""
        mock_subprocess.side_effect = [
            b"abc12345\n",       # git rev-parse HEAD (before)
            b"Already up to date.\n",  # git pull
            b"abc12345\n",       # git rev-parse HEAD (after)
        ]

        resp = client.post("/api/system/update")
        assert resp.status_code == 200
        data = resp.json()
        assert data["updated"] is False
        assert data["before"] == "abc12345"
        assert data["after"] == "abc12345"
        assert data["restart_scheduled"] is False

    @patch("system_routes.subprocess.check_output")
    def test_update_code_changed(self, mock_subprocess):
        """When code changes, updated=True and restart is scheduled."""
        mock_subprocess.side_effect = [
            b"abc12345\n",       # before
            b"Updating abc1234..def5678\n1 file changed\n",  # git pull
            b"def56789\n",       # after
        ]

        resp = client.post("/api/system/update")
        assert resp.status_code == 200
        data = resp.json()
        assert data["updated"] is True
        assert data["before"] == "abc12345"
        assert data["after"] == "def56789"
        assert data["restart_scheduled"] is True

    @patch("system_routes.subprocess.check_output")
    def test_update_git_pull_fails(self, mock_subprocess):
        """When git pull fails, return error."""
        import subprocess
        mock_subprocess.side_effect = [
            b"abc12345\n",       # before
            subprocess.CalledProcessError(1, "git", output=b"merge conflict"),
        ]

        resp = client.post("/api/system/update")
        assert resp.status_code == 200
        data = resp.json()
        assert data["updated"] is False
        assert "error" in data
