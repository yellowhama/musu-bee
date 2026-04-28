"""E2E HTTP tests for Sandbox Bash endpoint."""
import pytest
from fastapi.testclient import TestClient
from server import app

client = TestClient(app, headers={"Authorization": "Bearer test-token"})


class TestSandboxBashEndpoint:
    def test_bash_echo(self):
        """POST /api/admin/bash with echo → 200 + stdout."""
        r = client.post("/api/admin/bash", json={"command": "echo hi", "timeout": 5})
        assert r.status_code == 200
        data = r.json()
        assert data["exit_code"] == 0
        assert "hi" in data["stdout"]

    def test_bash_exit_code(self):
        """Command that fails → exit_code != 0."""
        r = client.post("/api/admin/bash", json={"command": "false", "timeout": 5})
        assert r.status_code == 200
        assert r.json()["exit_code"] != 0

    def test_bash_blocked_rm_rf(self):
        """POST /api/admin/bash with rm -rf / → 403."""
        r = client.post("/api/admin/bash", json={"command": "rm -rf /", "timeout": 5})
        assert r.status_code == 403

    def test_bash_blocked_shutdown(self):
        """POST /api/admin/bash with shutdown → 403."""
        r = client.post("/api/admin/bash", json={"command": "shutdown now", "timeout": 5})
        assert r.status_code == 403

    def test_bash_timeout(self):
        """POST /api/admin/bash with long sleep → 403 timeout error."""
        r = client.post("/api/admin/bash", json={"command": "sleep 60", "timeout": 1})
        assert r.status_code == 403
        assert "timed out" in r.json()["detail"].lower()

    def test_bash_with_cwd(self):
        """POST /api/admin/bash with cwd → runs in specified directory."""
        r = client.post("/api/admin/bash", json={
            "command": "pwd", "cwd": "/tmp", "timeout": 5
        })
        assert r.status_code == 200
        assert "/tmp" in r.json()["stdout"]
