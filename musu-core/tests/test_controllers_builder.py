"""Tests for controllers.builder — fluent API."""
from __future__ import annotations

import pytest

from musu_core.controllers.builder import ControllerBuilder
from musu_core.controllers.reconciler import (
    Reconciler,
    ReconcileRequest,
    ReconcileResult,
)
from musu_core.controllers.sources import ChannelSource, KindSource


class _Noop(Reconciler):
    async def reconcile(self, req):
        return ReconcileResult()


def test_builder_for_object_produces_controller(backend):
    ctrl = (
        ControllerBuilder(backend)
        .for_object("tasks")
        .complete(_Noop())
    )
    assert ctrl.name == "_Noop"
    assert len(ctrl.sources) == 1
    assert isinstance(ctrl.sources[0], KindSource)
    assert ctrl.sources[0].table == "tasks"


def test_builder_owns_resolves_parent_from_for_object(backend):
    ctrl = (
        ControllerBuilder(backend)
        .named("agent-ctrl")
        .for_object("agents")
        .owns("execution_log", parent_key_column="agent_id")
        .complete(_Noop())
    )
    assert ctrl.name == "agent-ctrl"
    assert len(ctrl.sources) == 2
    # primary
    assert ctrl.sources[0].table == "agents"
    # owned child
    assert ctrl.sources[1].table == "execution_log"


def test_builder_owns_without_primary_raises(backend):
    with pytest.raises(ValueError):
        ControllerBuilder(backend).owns("execution_log").complete(_Noop())


def test_builder_complete_requires_reconciler(backend):
    with pytest.raises(ValueError):
        ControllerBuilder(backend).for_object("tasks").complete(None)  # type: ignore[arg-type]


def test_builder_watches_arbitrary_source(backend):
    src = ChannelSource(lambda e: [])
    ctrl = (
        ControllerBuilder(backend)
        .watches(src)
        .complete(_Noop())
    )
    assert ctrl.sources == [src]


def test_builder_named_override(backend):
    ctrl = (
        ControllerBuilder(backend)
        .named("custom")
        .for_object("tasks")
        .complete(_Noop())
    )
    assert ctrl.name == "custom"
