"""Tests for musu_worker.auth.py and other security hardening behaviors."""

from __future__ import annotations

import asyncio
import logging
import os
import hmac
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import Depends, FastAPI, HTTPException, status
from fastapi.testclient import TestClient

from musu_worker.auth import warn_if_open_mode, get_token, require_auth
from musu_worker.executors import run_process


class TestWarnIfOpenMode:
    def test_warns_when_token_unset(self, caplog: pytest.LogCaptureFixture) -> None:
        saved = os.environ.pop("MUSU_WORKER_TOKEN", None)
        try:
            with caplog.at_level(logging.WARNING, logger="musu_worker.auth"):
                warn_if_open_mode()
        finally:
            if saved is not None:
                os.environ["MUSU_WORKER_TOKEN"] = saved
        assert any("OPEN AUTH MODE" in r.message for r in caplog.records)

    def test_silent_when_token_set(self, caplog: pytest.LogCaptureFixture) -> None:
        saved = os.environ.get("MUSU_WORKER_TOKEN")
        os.environ["MUSU_WORKER_TOKEN"] = "test-secret"
        try:
            with caplog.at_level(logging.WARNING, logger="musu_worker.auth"):
                warn_if_open_mode()
        finally:
            if saved is None:
                os.environ.pop("MUSU_WORKER_TOKEN", None)
            else:
                os.environ["MUSU_WORKER_TOKEN"] = saved
        assert not any(r.name == "musu_worker.auth" for r in caplog.records)


class TestRequireAuth:
    _TEST_TOKEN = "supersecrettoken"

    @pytest.fixture
    def app_with_auth(self):
        app = FastAPI()

        @app.get("/protected", dependencies=[Depends(require_auth)])
        async def protected_route():
            return {"message": "Access granted"}

        return app

    def test_require_auth_valid_token(self, app_with_auth):
        with patch("musu_worker.auth.get_token", return_value=self._TEST_TOKEN):
            client = TestClient(app_with_auth)
            response = client.get("/protected", headers={"Authorization": f"Bearer {self._TEST_TOKEN}"})
            assert response.status_code == status.HTTP_200_OK
            assert response.json() == {"message": "Access granted"}

    def test_require_auth_invalid_token(self, app_with_auth):
        with patch("musu_worker.auth.get_token", return_value=self._TEST_TOKEN):
            client = TestClient(app_with_auth)
            response = client.get("/protected", headers={"Authorization": "Bearer wrongtoken"})
            assert response.status_code == status.HTTP_401_UNAUTHORIZED
            assert response.json() == {"detail": "Invalid or missing Bearer token"}

    def test_require_auth_missing_token(self, app_with_auth):
        with patch("musu_worker.auth.get_token", return_value=self._TEST_TOKEN):
            client = TestClient(app_with_auth)
            response = client.get("/protected")
            assert response.status_code == status.HTTP_401_UNAUTHORIZED
            assert response.json() == {"detail": "Invalid or missing Bearer token"}

    def test_require_auth_no_configured_token_allows_access(self, app_with_auth):
        with patch("musu_worker.auth.get_token", return_value=None):
            client = TestClient(app_with_auth)
            response = client.get("/protected")
            assert response.status_code == status.HTTP_200_OK
            assert response.json() == {"message": "Access granted"}


class TestRunProcessCwd:
    def test_nonexistent_cwd_returns_exit_code_1(self) -> None:
        result = asyncio.run(
            run_process("echo", [], cwd="/tmp/__nonexistent_musu_test_9z8y7x__")
        )
        assert result.exit_code == 1
        assert "does not exist" in result.stderr

    def test_file_as_cwd_returns_exit_code_1(self, tmp_path: Path) -> None:
        f = tmp_path / "not_a_dir.txt"
        f.write_text("content")
        result = asyncio.run(run_process("echo", [], cwd=str(f)))
        assert result.exit_code == 1
        assert "not a directory" in result.stderr


class TestRunProcessReturncode:
    """MUS-863/MUS-867: proc.returncode None must not be masked as 0."""

    def _make_proc_mock(self, returncode: int | None) -> MagicMock:
        proc = MagicMock()
        proc.returncode = returncode
        proc.communicate = AsyncMock(return_value=(b"hello", b""))
        return proc

    def test_none_returncode_yields_exit_code_minus_one(self) -> None:
        """When proc.returncode is None (process killed), exit_code must be -1."""
        proc = self._make_proc_mock(returncode=None)
        with patch("asyncio.create_subprocess_exec", new=AsyncMock(return_value=proc)):
            result = asyncio.run(run_process("echo", ["hi"], cwd=None))
        assert result.exit_code == -1
        assert result.success is False

    def test_none_returncode_does_not_yield_success(self) -> None:
        """Regression: the old `rc = proc.returncode or 0` returned success=True for None."""
        proc = self._make_proc_mock(returncode=None)
        with patch("asyncio.create_subprocess_exec", new=AsyncMock(return_value=proc)):
            result = asyncio.run(run_process("echo", ["hi"], cwd=None))
        assert result.success is False, "killed process must not report success"

    def test_zero_returncode_still_succeeds(self) -> None:
        """Normal successful exit (returncode=0) must still yield exit_code=0/success=True."""
        proc = self._make_proc_mock(returncode=0)
        with patch("asyncio.create_subprocess_exec", new=AsyncMock(return_value=proc)):
            result = asyncio.run(run_process("echo", ["hi"], cwd=None))
        assert result.exit_code == 0
        assert result.success is True

    def test_nonzero_returncode_yields_failure(self) -> None:
        """Non-zero exit must yield success=False (unchanged by fix)."""
        proc = self._make_proc_mock(returncode=1)
        with patch("asyncio.create_subprocess_exec", new=AsyncMock(return_value=proc)):
            result = asyncio.run(run_process("echo", ["hi"], cwd=None))
        assert result.exit_code == 1
        assert result.success is False


class TestRunProcessEnvFiltering:
    """env_extra filtering: only MUSU_* vars pass through; dangerous vars are blocked."""

    def test_musu_prefixed_vars_pass_through(self) -> None:
        result = asyncio.run(
            run_process("bash", ["-c", "echo $MUSU_TEST_VAR"], cwd=None,
                        env_extra={"MUSU_TEST_VAR": "musu_value"})
        )
        assert result.exit_code == 0
        assert "musu_value" in result.stdout

    def test_non_musu_vars_are_blocked(self) -> None:
        result = asyncio.run(
            run_process("bash", ["-c", "echo ${NON_MUSU_VAR:-not_set}"], cwd=None,
                        env_extra={"NON_MUSU_VAR": "should_be_blocked"})
        )
        assert result.exit_code == 0
        assert "should_be_blocked" not in result.stdout

    def test_dangerous_var_ld_preload_blocked(self) -> None:
        result = asyncio.run(
            run_process("bash", ["-c", "echo ${LD_PRELOAD:-not_set}"], cwd=None,
                        env_extra={"LD_PRELOAD": "/tmp/evil.so"})
        )
        assert result.exit_code == 0
        assert "/tmp/evil.so" not in result.stdout
