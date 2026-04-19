"""Tests for kvstore backend methods (v10 migration)."""
import pytest
from musu_core.backends.local import LocalBackend


@pytest.fixture
def backend(tmp_path):
    return LocalBackend(str(tmp_path / "test.db"))


def test_set_and_get_kv(backend):
    backend.set_kv("active_company_id", "company-001")
    assert backend.get_kv("active_company_id") == "company-001"


def test_get_kv_missing_returns_none(backend):
    assert backend.get_kv("nonexistent_key") is None


def test_set_kv_overwrites(backend):
    backend.set_kv("active_company_id", "company-001")
    backend.set_kv("active_company_id", "company-002")
    assert backend.get_kv("active_company_id") == "company-002"
