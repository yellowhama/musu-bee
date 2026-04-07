"""Tests for MUS-864 security hardening behaviors (musu-worker side).

Covers:
    1. warn_if_open_mode() logs WARNING when MUSU_WORKER_TOKEN is unset
    2. warn_if_open_mode() is silent when token is set
    3. run_process(cwd=non-existent) returns ExecResult(exit_code=1) with 'does not exist' in stderr
    4. run_process(cwd=file path) returns ExecResult(exit_code=1) with 'not a directory' in stderr
    5. run_process() with proc.returncode=None yields exit_code=-1/success=False (MUS-863/MUS-867)
"""

from __future__ import annotations

import asyncio
import logging
import os
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from musu_worker.auth import warn_if_open_mode
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
