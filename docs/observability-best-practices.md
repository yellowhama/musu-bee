# Observability & Operational Resilience — musu-bridge

> Research date: 2026-04-23. Covers FastAPI + Python AI agent orchestration systems.

---

## 1. Current State Audit (musu-bridge)

| Area | Status | Detail |
|------|--------|--------|
| `GET /health` liveness endpoint | ✅ Exists | `server.py:2055` — returns `{"status": "ok"}` |
| Readiness check (DB connectivity) | ❌ Missing | No downstream health validation |
| Structured (JSON) logging | ⚠️ Partial | Uses stdlib `logging` + `logger.info/warning`. Not JSON-formatted. |
| Request ID correlation | ❌ Missing | No per-request trace ID attached to logs |
| Prometheus / metrics collection | ❌ Missing | No RED metrics (Rate / Errors / Duration) |
| Agent response time tracking | ❌ Missing | Heartbeat logs task done but no duration metric |
| Task failure rate metric | ❌ Missing | Failures logged but not aggregated/counted |
| Circuit breaker (agent unavailability) | ✅ Exists | `server.py:174` — `CIRCUIT_TRIP_THRESHOLD`, exponential backoff up to 1800s |
| Retry with backoff (task execution) | ✅ Exists | `server.py:753` — 1 automatic retry on timeout/runtime error |
| Async task durability (re-dispatch) | ✅ Exists | Pending route_executions re-dispatched on startup, retry_count capped at 3 |

**Summary of gaps:** JSON logging, request ID middleware, readiness endpoint, and Prometheus metrics are the main missing pieces.

---

## 2. FastAPI Observability Best Practices

### 2.1 Structured (JSON) Logging

Replace plain stdlib logging with a JSON formatter so logs are machine-parseable by tools like Loki/Datadog:

```python
import json, logging, time

class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload = {
            "time": self.formatTime(record, "%Y-%m-%dT%H:%M:%S"),
            "level": record.levelname,
            "logger": record.name,
            "msg": record.getMessage(),
        }
        if hasattr(record, "request_id"):
            payload["request_id"] = record.request_id
        if record.exc_info:
            payload["exc"] = self.formatException(record.exc_info)
        return json.dumps(payload, ensure_ascii=False)
```

**Key fields to always include:** `time`, `level`, `logger`, `msg`, plus contextual fields: `agent_name`, `task_id`, `company_id`, `request_id`.

### 2.2 Request ID Middleware

Attach a trace ID to every request so all log lines from one request are correlatable:

```python
import uuid
from starlette.middleware.base import BaseHTTPMiddleware

class RequestIDMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        request_id = request.headers.get("X-Request-ID", str(uuid.uuid4()))
        # Attach to logging context via contextvars or log filter
        response = await call_next(request)
        response.headers["X-Request-ID"] = request_id
        return response
```

### 2.3 RED Metrics with Prometheus

Install `prometheus-fastapi-instrumentator` (zero-config) or implement manually:

```python
from prometheus_client import Counter, Histogram, make_asgi_app
from prometheus_fastapi_instrumentator import Instrumentator

# Zero-config approach:
Instrumentator().instrument(app).expose(app)

# Manual RED metrics:
TASK_DURATION = Histogram(
    "agent_task_duration_seconds", "Agent task execution time",
    ["agent_name", "company_id", "status"],
    buckets=[1, 5, 10, 30, 60, 120, 300]
)
TASK_TOTAL = Counter(
    "agent_tasks_total", "Total tasks dispatched",
    ["agent_name", "company_id", "status"]  # status: success|timeout|error
)
CIRCUIT_STATE = Gauge(
    "agent_circuit_state", "Circuit breaker state (0=closed, 1=open)",
    ["agent_name"]
)
```

**Critical:** Normalize path parameters to avoid high-cardinality explosion (e.g., `/task/{task_id}` → use route template, not actual ID).

### 2.4 Health Check Separation (Liveness vs Readiness)

```
GET /health          → liveness  (is the process alive?)
GET /health/ready    → readiness (can it serve traffic? DB ok?)
```

Current `/health` is liveness-only. A readiness check should verify DB connectivity:

```python
@app.get("/health/ready")
async def health_ready():
    backend = _get_backend()
    try:
        backend.list_agents()  # lightweight DB ping
        return {"status": "ready", "db": "ok"}
    except Exception as e:
        raise HTTPException(503, detail={"status": "not_ready", "db": str(e)})
```

### 2.5 Async Task Monitoring (OpenTelemetry spans)

For tracing individual agent tasks:

```python
from opentelemetry import trace
tracer = trace.get_tracer(__name__)

async def delegate_task(...):
    with tracer.start_as_current_span("agent_task") as span:
        span.set_attribute("agent.name", agent_name)
        span.set_attribute("task.id", task_id)
        # ... task execution
```

Lightweight alternative: log `start_time = time.monotonic()` and emit duration at task completion.

---

## 3. Fault Detection & Auto-Recovery Patterns

### 3.1 Circuit Breaker (already in musu-bridge)

musu-bridge already implements this at `server.py:160–177`. Pattern: track `fail_count` per agent, trip after `CIRCUIT_TRIP_THRESHOLD` consecutive failures, backoff exponentially up to 1800s. **State is not exposed as a metric** — should add Prometheus gauge.

### 3.2 Recommended Libraries

| Library | Purpose | Notes |
|---------|---------|-------|
| `tenacity` | Retry with exponential backoff + jitter | Works with `async/await` natively |
| `pybreaker` | Circuit breaker with Redis state sharing | Good if multi-process |
| `pyresilience` | Unified: retry + circuit breaker + timeout | Single API, avoids state-sharing problem |
| `prometheus-fastapi-instrumentator` | Auto RED metrics for FastAPI | Zero-config |

**State-sharing warning:** Using `tenacity` (retry) + `pybreaker` (circuit) separately means they don't share failure state. Retries can keep firing even after the circuit should be open. Prefer `pyresilience` or custom unified logic like what musu-bridge already has.

### 3.3 Retry Pattern for LLM/Agent Calls

```python
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type

@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=2, max=30),
    retry=retry_if_exception_type((asyncio.TimeoutError, RuntimeError)),
)
async def invoke_agent_with_retry(agent_name: str, prompt: str):
    ...
```

musu-bridge currently does 1 retry manually — `tenacity` would standardize this.

### 3.4 Fallback Strategies

1. **Return cached response** — if agent unavailable, return last known result within TTL
2. **Queue and accept** — return `202 Accepted` immediately, process when agent recovers
3. **Escalate to CTO** — musu already has this: 3 repeated errors → CTO escalation

---

## 4. Priority Improvement Roadmap

| Priority | Item | Effort | Impact |
|----------|------|--------|--------|
| P0 | JSON logging formatter + structured fields | Small | Debug speed |
| P0 | `GET /health/ready` (DB ping) | Small | K8s/systemd restarts |
| P1 | Request ID middleware + log correlation | Small | Traceability |
| P1 | Task duration histogram + failure counter (Prometheus) | Medium | SLA visibility |
| P1 | Circuit breaker state as Prometheus gauge | Tiny | Alert on open circuit |
| P2 | `prometheus-fastapi-instrumentator` for HTTP RED metrics | Small | HTTP-level visibility |
| P3 | OpenTelemetry traces for agent tasks | Large | Deep tracing |

---

## Sources

- [Operations-Friendly FastAPI Observability Guide](https://blog.greeden.me/en/2025/10/07/operations-friendly-observability-a-fastapi-implementation-guide-for-logs-metrics-and-traces-request-id-json-logs-prometheus-opentelemetry-and-dashboard-design/)
- [Circuit Breaker & Fallback in FastAPI (2026)](https://blog.greeden.me/en/2026/04/21/a-practical-introduction-to-circuit-breakers-and-fallback-design-in-fastapi-real-world-patterns-for-preventing-external-api-failures-from-becoming-system-wide-failures/)
- [FastAPI Observability — GitHub blueswen/fastapi-observability](https://github.com/blueswen/fastapi-observability)
- [Building Robust Redis Client with Circuit Breaker + Tenacity](https://dev.to/akarshan/building-a-robust-redis-client-with-retry-logic-in-python-jeg)
- [PyResilience unified patterns](https://pypi.org/project/pyresilience/)
- [Coordinating resilience patterns in Python](https://discuss.python.org/t/how-are-you-coordinating-resilience-patterns-retry-circuit-breaker-timeout-in-python/106597)
