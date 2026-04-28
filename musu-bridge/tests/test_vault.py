"""Unit tests for vault module (musu-bridge/vault.py)."""
from __future__ import annotations

import os
import stat
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest
from unittest.mock import patch

import vault


@pytest.fixture(autouse=True)
def use_tmp_vault(tmp_path):
    """Redirect VAULT_DIR to tmp_path for isolation."""
    with patch.object(vault, "VAULT_DIR", tmp_path / "secrets"):
        yield


def test_set_and_get_secret():
    """Roundtrip: set then get returns same value."""
    vault.set_secret("my_token", "super-secret-123")
    result = vault.get_secret("my_token")
    assert result == "super-secret-123"


def test_list_secrets():
    """After setting 2 secrets, list_secrets returns both names."""
    vault.set_secret("alpha", "val1")
    vault.set_secret("beta", "val2")
    names = vault.list_secrets()
    assert "alpha" in names
    assert "beta" in names


def test_get_nonexistent():
    """Getting a secret that doesn't exist returns None."""
    result = vault.get_secret("does_not_exist")
    assert result is None


def test_file_permissions():
    """Secret files must have 0o600 permissions."""
    vault.set_secret("perm_test", "value")
    secret_path = vault.VAULT_DIR / "perm_test"
    mode = stat.S_IMODE(os.stat(secret_path).st_mode)
    assert mode == 0o600
