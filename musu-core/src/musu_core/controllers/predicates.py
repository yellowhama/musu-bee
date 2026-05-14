"""Row-filter predicates for KindSource.

Predicates run client-side AFTER the row is fetched (musu has no
etcd-style server-side filter). They drop rows before the handler
runs, reducing reconciler load.
"""
from __future__ import annotations

from typing import Any, Protocol, runtime_checkable


@runtime_checkable
class Predicate(Protocol):
    """Anything with `.matches(row) -> bool`."""

    def matches(self, row: dict) -> bool: ...


class GenerationChanged:
    """Pass-through predicate.

    musu rows don't carry a K8s-style `generation` column today; this
    slot is here so the rest of the framework can call .matches()
    uniformly even on tables without versioned spec semantics. When
    musu later adds a `spec_revision` column, swap this for one that
    actually compares old vs new.
    """

    def matches(self, row: dict) -> bool:  # noqa: ARG002 — row unused on purpose
        return True


class LabelSelector:
    """Match a single column == value pair.

    Example:
        LabelSelector("status", "running")  # passes only rows where
                                            # row["status"] == "running"
    """

    def __init__(self, column: str, value: Any) -> None:
        self.column = column
        self.value = value

    def matches(self, row: dict) -> bool:
        return row.get(self.column) == self.value


class StatusIn:
    """Match rows whose `status` column is in the allowed set."""

    def __init__(self, *statuses: str) -> None:
        self.allowed = set(statuses)

    def matches(self, row: dict) -> bool:
        return row.get("status") in self.allowed
