"""Event-to-request handlers.

A handler is a callable: `row: dict -> list[ReconcileRequest]`. Called
by KindSource for each row that survives predicate filtering.

Two built-in handlers mirror controller-runtime's
`EnqueueRequestForObject` and `EnqueueRequestForOwner`.
"""
from __future__ import annotations

from typing import Callable

from musu_core.controllers.reconciler import ReconcileRequest


def enqueue_request_for_object(table: str) -> Callable[[dict], list[ReconcileRequest]]:
    """Row -> request for that same row's PK.

    Used when watching the primary object type (e.g. watch `agents` and
    reconcile by agent id).
    """

    def handler(row: dict) -> list[ReconcileRequest]:
        key = row.get("id")
        if not key:
            return []
        return [
            ReconcileRequest(
                table=table,
                key=str(key),
                company_id=row.get("company_id"),
                machine_id=row.get("machine_id"),
            )
        ]

    return handler


def enqueue_request_for_owner(
    parent_table: str,
    parent_key_column: str = "parent_id",
) -> Callable[[dict], list[ReconcileRequest]]:
    """Child row -> request for its parent (OwnerReferences semantic).

    Example:
        # Watch processes, reconcile the parent agent
        KindSource(db, "processes",
                   enqueue_request_for_owner("agents", "agent_id"))
    """

    def handler(row: dict) -> list[ReconcileRequest]:
        parent_key = row.get(parent_key_column)
        if not parent_key:
            return []
        return [
            ReconcileRequest(
                table=parent_table,
                key=str(parent_key),
                company_id=row.get("company_id"),
                machine_id=row.get("machine_id"),
            )
        ]

    return handler
