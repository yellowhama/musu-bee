"""Tests for GET/PUT /api/workspace endpoint."""
import sys
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).parent.parent))

from fastapi.testclient import TestClient
from server import app

client = TestClient(app, headers={"Authorization": "Bearer test-token"})


def test_get_workspace_returns_null_when_unset():
    with patch("server.get_kv_record", return_value=None):
        resp = client.get("/api/workspace")
    assert resp.status_code == 200
    assert resp.json() == {"active_company_id": None}


def test_put_workspace_sets_active_company():
    with patch("server.set_kv_record") as mock_set, \
         patch("server.get_kv_record", return_value="company-001"):
        resp = client.put(
            "/api/workspace",
            json={"active_company_id": "company-001"},
        )
    assert resp.status_code == 200
    assert resp.json()["active_company_id"] == "company-001"
    mock_set.assert_called_once_with("active_company_id", "company-001")


def test_put_workspace_rejects_empty_string():
    resp = client.put("/api/workspace", json={"active_company_id": ""})
    assert resp.status_code == 422
