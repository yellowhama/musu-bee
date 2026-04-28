"""Lightweight tracing for agent execution.

Not full OpenTelemetry — just structured JSON trace logs for debugging.
Each agent execution gets a trace with timing, agent info, and result.

Future: replace with opentelemetry-api when the dependency is justified.
"""
from __future__ import annotations

import json
import logging
import time
import uuid
from contextlib import contextmanager
from dataclasses import dataclass, field, asdict
from typing import Any

logger = logging.getLogger("musu.trace")


@dataclass
class Span:
    trace_id: str
    span_id: str
    name: str
    start_time: float = 0.0
    end_time: float = 0.0
    duration_ms: float = 0.0
    attributes: dict[str, Any] = field(default_factory=dict)
    status: str = "ok"  # "ok", "error"
    error: str = ""

    def to_dict(self) -> dict:
        return {k: v for k, v in asdict(self).items() if v}


@contextmanager
def trace_span(name: str, **attributes: Any):
    """Context manager that creates a trace span and logs it on exit.

    Usage:
        with trace_span("route", agent_id="abc", channel="ceo") as span:
            result = await router.route(...)
            span.attributes["result_status"] = result.status
    """
    span = Span(
        trace_id=str(uuid.uuid4())[:8],
        span_id=str(uuid.uuid4())[:8],
        name=name,
        start_time=time.time(),
        attributes=dict(attributes),
    )

    try:
        yield span
    except Exception as exc:
        span.status = "error"
        span.error = str(exc)[:200]
        raise
    finally:
        span.end_time = time.time()
        span.duration_ms = (span.end_time - span.start_time) * 1000
        logger.info("trace: %s", json.dumps(span.to_dict(), default=str))
