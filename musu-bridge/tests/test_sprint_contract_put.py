"""v16.C — Integration tests for PUT /api/tasks/{task_id}/sprint-contract.

The endpoint is wired to handlers.update_sprint_contract, which talks to
the backend. We patch at the handlers layer to keep the tests fast and
focused on routing + status-code mapping.
"""
from __future__ import annotations

import os
import sys
from pathlib import Path
from unittest.mock import patch

import pytest

sys.path.insert(0, str(Path(__file__).parent.parent))

# server.py refuses to start without MUSU_BRIDGE_TOKEN. Set it before import.
os.environ.setdefault("MUSU_BRIDGE_TOKEN", "test-token")

from fastapi.testclient import TestClient  # noqa: E402

from server import app  # noqa: E402

client = TestClient(app, headers={"Authorization": "Bearer test-token"})


_VALID_TASK_ID = "11111111-1111-1111-1111-111111111111"

_VALID_BODY = {
    "task": "build a thing",
    "scope": ["a", "b"],
    "out_of_scope": ["c"],
    "acceptance_criteria": ["it works"],
    "done_definition": "shipped",
}

_RETURNED_CONTRACT = {
    "id": "contract-1",
    "task_id": _VALID_TASK_ID,
    "task": "build a thing",
    "scope": ["a", "b"],
    "out_of_scope": ["c"],
    "acceptance_criteria": ["it works"],
    "done_definition": "shipped",
    "locked": False,
    "created_at": 1234567890.0,
}


class TestUpdateSprintContract:
    def test_returns_updated_contract_on_success(self):
        with patch("server.update_sprint_contract", return_value=_RETURNED_CONTRACT) as mock:
            resp = client.put(
                f"/api/tasks/{_VALID_TASK_ID}/sprint-contract",
                json=_VALID_BODY,
            )
        assert resp.status_code == 200
        assert resp.json() == _RETURNED_CONTRACT
        mock.assert_called_once()
        call_kwargs = mock.call_args.kwargs
        assert call_kwargs["task"] == "build a thing"
        assert call_kwargs["scope"] == ["a", "b"]

    def test_returns_404_when_no_contract_exists(self):
        with patch(
            "server.update_sprint_contract",
            side_effect=LookupError("not found"),
        ):
            resp = client.put(
                f"/api/tasks/{_VALID_TASK_ID}/sprint-contract",
                json=_VALID_BODY,
            )
        assert resp.status_code == 404
        assert "No sprint contract" in resp.json()["detail"]

    def test_returns_409_when_contract_locked(self):
        with patch(
            "server.update_sprint_contract",
            side_effect=PermissionError("locked"),
        ):
            resp = client.put(
                f"/api/tasks/{_VALID_TASK_ID}/sprint-contract",
                json=_VALID_BODY,
            )
        assert resp.status_code == 409
        assert "locked" in resp.json()["detail"].lower()

    def test_rejects_malformed_uuid(self):
        # Path validator pattern is r"^[0-9a-f\-]{36}$" with min/max 36.
        # "not-a-uuid" is too short → 422.
        resp = client.put(
            "/api/tasks/not-a-uuid/sprint-contract",
            json=_VALID_BODY,
        )
        assert resp.status_code == 422

    def test_rejects_missing_required_field(self):
        # `task` is required (min_length=1). Empty body → 422.
        resp = client.put(
            f"/api/tasks/{_VALID_TASK_ID}/sprint-contract",
            json={},
        )
        assert resp.status_code == 422

    def test_accepts_empty_lists(self):
        # scope / out_of_scope / acceptance_criteria default to []. A body
        # with only `task` should be valid (operator is wiping the contract
        # to start over).
        body = {"task": "rewrite this"}
        with patch("server.update_sprint_contract", return_value=_RETURNED_CONTRACT):
            resp = client.put(
                f"/api/tasks/{_VALID_TASK_ID}/sprint-contract",
                json=body,
            )
        assert resp.status_code == 200


class TestSprintContractRoundtrip:
    """End-to-end at the backend layer: insert a contract, update it,
    lock it, then verify another update raises PermissionError."""

    def test_backend_roundtrip(self, tmp_path):
        from musu_core.backends.local import LocalBackend
        from musu_core.sprint_contract import SprintContract, save_contract

        db = tmp_path / "test.db"
        backend = LocalBackend(str(db))
        try:
            conn = backend._db._get_conn()
            sc = SprintContract(
                task="initial",
                scope=["a"],
                acceptance_criteria=["x"],
                task_id=_VALID_TASK_ID,
            )
            save_contract(conn, sc)

            updated = backend.update_sprint_contract(
                _VALID_TASK_ID,
                task="updated",
                scope=["a", "b"],
                out_of_scope=[],
                acceptance_criteria=["x", "y"],
                done_definition="shipped",
            )
            assert updated["task"] == "updated"
            assert updated["scope"] == ["a", "b"]
            assert updated["locked"] is False

            assert backend.lock_sprint_contract(_VALID_TASK_ID) is True
            after_lock = backend.get_sprint_contract_for_task(_VALID_TASK_ID)
            assert after_lock["locked"] is True

            with pytest.raises(PermissionError):
                backend.update_sprint_contract(
                    _VALID_TASK_ID,
                    task="third try",
                    scope=[],
                    out_of_scope=[],
                    acceptance_criteria=[],
                    done_definition="",
                )

            # update on missing task → LookupError
            with pytest.raises(LookupError):
                backend.update_sprint_contract(
                    "00000000-0000-0000-0000-000000000000",
                    task="x",
                    scope=[],
                    out_of_scope=[],
                    acceptance_criteria=[],
                    done_definition="",
                )
        finally:
            backend.close()
