"""Phase 83: per-channel route timeout tests.

Tests:
1. _route_timeout_sec('engineer') returns 300.0 by default
2. _route_timeout_sec('ceo') returns 300.0 by default
3. _route_timeout_sec('') returns 180.0 (legacy default)
4. MUSU_ROUTE_TIMEOUT_SEC_ENGINEER override works
5. MUSU_ROUTE_TIMEOUT_SEC_CEO override works
6. MUSU_ROUTE_TIMEOUT_SEC global override applies when no channel-specific var
"""
import os
from unittest.mock import patch

import pytest


def _get_timeout(channel: str = "", env: dict | None = None) -> float:
    """Helper: import and call _route_timeout_sec with clean env."""
    import importlib
    import handlers
    importlib.reload(handlers)

    with patch.dict(os.environ, env or {}, clear=False):
        # Remove all timeout envvars first, then apply overrides
        to_remove = [
            "MUSU_ROUTE_TIMEOUT_SEC",
            "MUSU_ROUTE_TIMEOUT_SEC_ENGINEER",
            "MUSU_ROUTE_TIMEOUT_SEC_CEO",
            "MUSU_ROUTE_TIMEOUT_SEC_CTO",
        ]
        with patch.dict(os.environ, {k: "" for k in to_remove}):
            for k in to_remove:
                os.environ.pop(k, None)
            if env:
                os.environ.update(env)
            return handlers._route_timeout_sec(channel)


def test_engineer_default_timeout_300():
    """engineer channel must default to 300s (not 180s) to survive complex coding tasks."""
    import importlib
    import handlers
    importlib.reload(handlers)

    clean = {
        "MUSU_ROUTE_TIMEOUT_SEC": "",
        "MUSU_ROUTE_TIMEOUT_SEC_ENGINEER": "",
    }
    with patch.dict(os.environ, clean):
        os.environ.pop("MUSU_ROUTE_TIMEOUT_SEC", None)
        os.environ.pop("MUSU_ROUTE_TIMEOUT_SEC_ENGINEER", None)
        result = handlers._route_timeout_sec("engineer")

    assert result == 300.0, f"Expected 300.0 for engineer, got {result}"


def test_cto_default_timeout_300():
    """cto channel must default to 300s so it completes before watchdog kill (320s)."""
    import importlib
    import handlers
    importlib.reload(handlers)

    clean = {
        "MUSU_ROUTE_TIMEOUT_SEC": "",
        "MUSU_ROUTE_TIMEOUT_SEC_CTO": "",
    }
    with patch.dict(os.environ, clean):
        os.environ.pop("MUSU_ROUTE_TIMEOUT_SEC", None)
        os.environ.pop("MUSU_ROUTE_TIMEOUT_SEC_CTO", None)
        result = handlers._route_timeout_sec("cto")

    assert result == 300.0, f"Expected 300.0 for cto, got {result}"


def test_ceo_default_timeout_600():
    """ceo channel defaults to 600s — 120s was too short for heartbeat LLM calls."""
    import importlib
    import handlers
    importlib.reload(handlers)

    clean = {
        "MUSU_ROUTE_TIMEOUT_SEC": "",
        "MUSU_ROUTE_TIMEOUT_SEC_CEO": "",
    }
    with patch.dict(os.environ, clean):
        os.environ.pop("MUSU_ROUTE_TIMEOUT_SEC", None)
        os.environ.pop("MUSU_ROUTE_TIMEOUT_SEC_CEO", None)
        result = handlers._route_timeout_sec("ceo")

    assert result == 600.0, f"Expected 600.0 for ceo, got {result}"


def test_unknown_channel_default_timeout_180():
    """Unknown/empty channel must return 180.0 (legacy global default)."""
    import importlib
    import handlers
    importlib.reload(handlers)

    with patch.dict(os.environ, {"MUSU_ROUTE_TIMEOUT_SEC": ""}):
        os.environ.pop("MUSU_ROUTE_TIMEOUT_SEC", None)
        os.environ.pop("MUSU_ROUTE_TIMEOUT_SEC_ENGINEER", None)
        os.environ.pop("MUSU_ROUTE_TIMEOUT_SEC_CEO", None)
        result_empty = handlers._route_timeout_sec("")
        result_unknown = handlers._route_timeout_sec("qa")

    assert result_empty == 180.0, f"Expected 180.0 for empty channel, got {result_empty}"
    assert result_unknown == 180.0, f"Expected 180.0 for qa channel, got {result_unknown}"


def test_engineer_channel_specific_override():
    """MUSU_ROUTE_TIMEOUT_SEC_ENGINEER env var overrides engineer default."""
    import importlib
    import handlers
    importlib.reload(handlers)

    with patch.dict(os.environ, {"MUSU_ROUTE_TIMEOUT_SEC_ENGINEER": "120"}):
        result = handlers._route_timeout_sec("engineer")

    assert result == 120.0, f"Expected 120.0 from MUSU_ROUTE_TIMEOUT_SEC_ENGINEER, got {result}"


def test_ceo_channel_specific_override():
    """MUSU_ROUTE_TIMEOUT_SEC_CEO env var overrides ceo default."""
    import importlib
    import handlers
    importlib.reload(handlers)

    with patch.dict(os.environ, {"MUSU_ROUTE_TIMEOUT_SEC_CEO": "600"}):
        result = handlers._route_timeout_sec("ceo")

    assert result == 600.0, f"Expected 600.0 from MUSU_ROUTE_TIMEOUT_SEC_CEO, got {result}"


def test_global_override_applies_to_unknown_channel():
    """MUSU_ROUTE_TIMEOUT_SEC global override applies when no channel-specific var."""
    import importlib
    import handlers
    importlib.reload(handlers)

    with patch.dict(os.environ, {
        "MUSU_ROUTE_TIMEOUT_SEC": "60",
        "MUSU_ROUTE_TIMEOUT_SEC_ENGINEER": "",
    }):
        os.environ.pop("MUSU_ROUTE_TIMEOUT_SEC_ENGINEER", None)
        os.environ.pop("MUSU_ROUTE_TIMEOUT_SEC_CEO", None)
        result_unknown = handlers._route_timeout_sec("qa")

    assert result_unknown == 60.0, f"Expected 60.0 from global MUSU_ROUTE_TIMEOUT_SEC, got {result_unknown}"
