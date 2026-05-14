"""Tests for controllers.reconciler — ABC + dataclasses."""
from __future__ import annotations

import pytest

from musu_core.controllers.reconciler import (
    Reconciler,
    ReconcileRequest,
    ReconcileResult,
)


def test_reconcile_request_str_format():
    req = ReconcileRequest(
        table="agents", key="agent-1",
        company_id="co1", machine_id="m1",
    )
    assert str(req) == "agents:agent-1[co1/m1]"


def test_reconcile_request_str_without_axes():
    req = ReconcileRequest(table="agents", key="agent-1")
    assert str(req) == "agents:agent-1[-/-]"


def test_reconcile_request_frozen():
    req = ReconcileRequest(table="t", key="k")
    with pytest.raises((AttributeError, Exception)):
        req.table = "other"  # type: ignore[misc]


def test_reconcile_request_hashable():
    a = ReconcileRequest(table="t", key="k")
    b = ReconcileRequest(table="t", key="k")
    assert hash(a) == hash(b)
    assert a == b
    s = {a, b}
    assert len(s) == 1


def test_reconcile_result_default_no_error():
    r = ReconcileResult()
    assert not r.failed
    assert r.error is None
    assert r.requeue is False
    assert r.requeue_after_ms == 0


def test_reconcile_result_failed_property():
    r = ReconcileResult(error=RuntimeError("boom"))
    assert r.failed is True


def test_reconciler_abc_blocks_direct_instantiation():
    with pytest.raises(TypeError):
        Reconciler()  # type: ignore[abstract]


async def test_reconciler_subclass_instantiates():
    class MyR(Reconciler):
        async def reconcile(self, req):
            return ReconcileResult()
    r = MyR()
    assert r.name == "MyR"
    res = await r.reconcile(ReconcileRequest(table="t", key="k"))
    assert isinstance(res, ReconcileResult)
