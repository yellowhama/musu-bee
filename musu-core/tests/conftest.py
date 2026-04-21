"""Shared pytest fixtures for musu-core tests."""

from __future__ import annotations

import pytest

from musu_core.db import Database


@pytest.fixture
def backend():
    """In-memory Database backend for isolated tests."""
    return Database(":memory:")
