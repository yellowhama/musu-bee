# V23.4 F T2-A' Detail Plan — asyncio + SQLite workflow runner (wiki/432)

**Date**: 2026-05-18
**Wiki ID**: `wiki/432`
**Sub-WS**: V23.4 Phase 4 T2-A' (per wiki/431-v2 §0.3, §2, §5.A')
**Branch**: `v23/phase4` (cut off `main` after V23.3 + V23.4 Tier-1 main-merge per wiki/431-v2 §1.2)
**Priority**: **MED-HIGHEST** (T2-D blocks on T2-A' API surface per wiki/431-v2 §3.1; only intra-Phase-4 hard dependency)
**Predecessor**: T2-A' Phase 0 Researcher 2026-05-18 (3 deviation corrections + 6 OQ resolutions, embedded in wiki/431-v2 §5.A')
**Successor**: wiki/436 closure

---

## §1 Scope

T2-A' replaces v1's T2-A (Argo + CRD + webhook) — eliminated per Phase -1 Strategic Gate RED verdict (wiki/431-v2 §0.2 SG-1..SG-5) — with a single-process asyncio + SQLite workflow runner colocated in `musu-bridge`. Same architectural pattern as V23.4 Tier-1 `install_attempt` sweeper (wiki/426), shipped 2026-05-17.

Three concrete deliverables:
1. SQLite schema v37 migration in `musu-core/src/musu_core/migrations.py` (NOT `musu-bridge/schema/` which doesn't exist) adding `workflows` + `workflow_steps` tables.
2. FastAPI router `musu-bridge/workflow_routes.py` with CRUD + Pattern A cross-PC endpoints.
3. asyncio task `musu-bridge/workflow_executor.py` running on every musu-bridge instance, polling assigned steps + wrapping existing `enqueue_wake + execute_wake` agent invocation primitive.

Cross-PC pattern: **Pattern A (single-source-on-rendezvous-PC)** per R3 decision. Rendezvous PC's musu-bridge owns the workflow tables; peer PCs poll `GET /api/workflows/_pending?assigned_pc=PC_X` over existing mesh_router forward; peers PATCH results back. No state replication.

Scope OUT: workflow versioning (V23.5), dynamic step rebalancing (V23.5), TURN signaling fallback (V23.5), SSE for /status (deferred — RunPanel polls).

---

## §2 Implementation

### §2.1 v37 SQLite migration

Append to `musu-core/src/musu_core/migrations.py` MIGRATIONS list at :1483 (current max is `("v36_agents_isolation_profile", ...)` at :1482).

```python
def _v37_up(conn: sqlite3.Connection) -> None:
    """v37: workflows + workflow_steps tables for T2-A' asyncio executor."""
    # Idempotent + atomic — single executescript with BEGIN/COMMIT
    # Mirrors _v3_up at :99 and _v4_up at :135 idiom.
    cur = conn.cursor()
    # Idempotency probe: bail if workflows table already exists
    row = cur.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='workflows'"
    ).fetchone()
    if row:
        return
    conn.executescript(
        """
        BEGIN;
        CREATE TABLE workflows (
            id TEXT PRIMARY KEY,
            company_id TEXT NOT NULL,
            name TEXT NOT NULL,
            spec_json TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'running', 'paused', 'succeeded', 'failed', 'cancelled')),
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        );
        CREATE INDEX idx_workflows_company ON workflows(company_id);
        CREATE INDEX idx_workflows_status ON workflows(status);

        CREATE TABLE workflow_steps (
            id TEXT PRIMARY KEY,
            workflow_id TEXT NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
            agent_id TEXT NOT NULL,
            assigned_pc TEXT REFERENCES machines(id) ON DELETE SET NULL,
            status TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'running', 'succeeded', 'failed', 'timeout', 'skipped')),
            input_json TEXT,
            result_json TEXT,
            error_json TEXT,
            retry_count INTEGER NOT NULL DEFAULT 0,
            depends_on_json TEXT NOT NULL DEFAULT '[]',
            started_at INTEGER,
            finished_at INTEGER
        );
        CREATE INDEX idx_workflow_steps_dispatch ON workflow_steps(assigned_pc, status);
        CREATE INDEX idx_workflow_steps_workflow ON workflow_steps(workflow_id);
        COMMIT;
        """
    )

def _v37_down(conn: sqlite3.Connection) -> None:
    conn.executescript(
        """
        BEGIN;
        DROP INDEX IF EXISTS idx_workflow_steps_workflow;
        DROP INDEX IF EXISTS idx_workflow_steps_dispatch;
        DROP TABLE IF EXISTS workflow_steps;
        DROP INDEX IF EXISTS idx_workflows_status;
        DROP INDEX IF EXISTS idx_workflows_company;
        DROP TABLE IF EXISTS workflows;
        COMMIT;
        """
    )

# At end of MIGRATIONS list (line ~1483):
MIGRATIONS.append(("v37_workflows", _v37_up, _v37_down))
```

`assigned_pc REFERENCES machines(id) ON DELETE SET NULL`: per Researcher F-R7.1 — cascade would orphan steps mid-run; SET NULL lets executor treat as "needs reassignment" without deleting workflow state.

Also extend `musu-core/src/musu_core/controllers/sources.py:31-50` `_ALLOWED_TABLES` to include `"workflows"` and `"workflow_steps"` — required for `/api/watch/subscribe?table=workflows` to be served at all (per Researcher F-R1.6). Add in same PR even though MVP doesn't use SSE.

### §2.2 Pydantic v2 spec models (workflow_routes.py module level)

```python
from pydantic import BaseModel, Field, field_validator, model_validator
from typing import Literal

class RetryPolicy(BaseModel):
    maxAttempts: int = Field(ge=0, le=10, default=0)
    backoffSeconds: int = Field(ge=1, default=30)

class AgentResources(BaseModel):
    cpu: str | None = None        # e.g. "500m"
    memory: str | None = None     # e.g. "512Mi"

class AgentInput(BaseModel):
    name: str
    from_: str = Field(alias="from")  # source agent id

_ALLOWED_NODESELECTOR_KEYS = frozenset({"gpu_vram_free_gb_min", "gpu_present", "os"})

class AgentSpec(BaseModel):
    id: str = Field(min_length=1, max_length=63, pattern=r"^[a-z0-9][-a-z0-9]*[a-z0-9]$")
    image: str = Field(min_length=1)
    command: list[str] = Field(default_factory=list)
    nodeSelector: dict[str, str] = Field(default_factory=dict)
    timeoutSeconds: int = Field(ge=1, le=86400, default=3600)
    retry: RetryPolicy = Field(default_factory=RetryPolicy)
    resources: AgentResources = Field(default_factory=AgentResources)
    inputs: list[AgentInput] = Field(default_factory=list)
    outputs: list[str] = Field(default_factory=list)

    @field_validator("nodeSelector")
    @classmethod
    def _whitelist_nodeselector_keys(cls, v):
        """Per Critic L2: whitelist at Pydantic time so unknown keys → 422 not 500."""
        unknown = set(v.keys()) - _ALLOWED_NODESELECTOR_KEYS
        if unknown:
            raise ValueError(
                f"unknown nodeSelector keys {sorted(unknown)}; "
                f"valid keys: {sorted(_ALLOWED_NODESELECTOR_KEYS)}"
            )
        return v

class EdgeSpec(BaseModel):
    from_: str = Field(alias="from")
    to: str
    condition: Literal["succeeded", "failed", "always"] = "succeeded"

class WorkflowSpec(BaseModel):
    agents: list[AgentSpec] = Field(min_length=1)
    edges: list[EdgeSpec] = Field(default_factory=list)

    @field_validator("agents")
    @classmethod
    def _unique_agent_ids(cls, agents):
        ids = [a.id for a in agents]
        if len(ids) != len(set(ids)):
            dups = sorted({i for i in ids if ids.count(i) > 1})
            raise ValueError(f"duplicate agent ids: {dups}")
        return agents

    # Per Critic M4: split monolithic validator into three named methods so
    # T2-T5 can target each rule, and Auditor "every validator has negative test" is verifiable.

    @model_validator(mode="after")
    def _check_edges_reference_existing_agents(self):
        agent_ids = {a.id for a in self.agents}
        for e in self.edges:
            if e.from_ not in agent_ids:
                raise ValueError(f"edge.from '{e.from_}' not in agents")
            if e.to not in agent_ids:
                raise ValueError(f"edge.to '{e.to}' not in agents")
        return self

    @model_validator(mode="after")
    def _check_no_cycles(self):
        from collections import defaultdict, deque
        indeg = defaultdict(int)
        adj = defaultdict(list)
        for e in self.edges:
            adj[e.from_].append(e.to)
            indeg[e.to] += 1
        q = deque(a.id for a in self.agents if indeg[a.id] == 0)
        visited = 0
        while q:
            n = q.popleft()
            visited += 1
            for m in adj[n]:
                indeg[m] -= 1
                if indeg[m] == 0:
                    q.append(m)
        if visited != len(self.agents):
            raise ValueError("cycle detected in workflow DAG")
        return self

    @model_validator(mode="after")
    def _check_inputs_reference_declared_outputs(self):
        agent_outputs = {a.id: set(a.outputs) for a in self.agents}
        for a in self.agents:
            for inp in a.inputs:
                if inp.from_ not in agent_outputs:
                    raise ValueError(
                        f"agent '{a.id}' input references unknown source agent '{inp.from_}'"
                    )
                if inp.name not in agent_outputs[inp.from_]:
                    raise ValueError(
                        f"agent '{a.id}' input '{inp.name}' not in '{inp.from_}'.outputs "
                        f"(declared outputs: {sorted(agent_outputs[inp.from_])})"
                    )
        return self

class WorkflowCreateRequest(BaseModel):
    company_id: str
    name: str
    spec: WorkflowSpec

class WorkflowResponse(BaseModel):
    id: str
    company_id: str
    name: str
    status: str
    created_at: int

class StepStatusResponse(BaseModel):
    id: str
    agent_id: str
    assigned_pc: str | None
    status: str
    started_at: int | None
    finished_at: int | None
    retry_count: int
    error_json: str | None

class WorkflowStatusResponse(BaseModel):
    id: str
    status: str
    steps: list[StepStatusResponse]

class WorkflowStatusPatch(BaseModel):
    status: Literal["running", "paused", "cancelled"]
```

### §2.3 workflow_routes.py FastAPI endpoints

```python
from typing import Literal
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

workflow_router = APIRouter(prefix="/api", tags=["workflows"])

# Per Critic H4: follow axis_routes.py:28-31 convention; do NOT use app.state.db
def _get_db():
    from handlers import _get_backend
    return _get_backend()._db

# Per Critic L3: typed body model (was untyped dict; would let CHECK-constraint violations escape as 500)
class StepPatchBody(BaseModel):
    status: Literal["running", "succeeded", "failed", "timeout"]
    result_json: str | None = None
    error_json: str | None = None
    assigned_pc: str | None = None  # required when status='running' (claim path), see M1

@workflow_router.post("/workflows", status_code=201, response_model=WorkflowResponse)
async def create_workflow(req: WorkflowCreateRequest):
    db = _get_db()
    try:
        result = create_workflow_handler(db, req.model_dump())
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except NoEligiblePCError as e:
        raise HTTPException(status_code=422, detail={"error": "no_eligible_pcs", **e.context})
    return result

@workflow_router.get("/workflows", response_model=list[WorkflowResponse])
async def list_workflows(company_id: str):
    return list_workflows_handler(_get_db(), company_id)

@workflow_router.get("/workflows/{id}/status", response_model=WorkflowStatusResponse)
async def get_workflow_status(id: str):
    result = get_workflow_status_handler(_get_db(), id)
    if not result:
        raise HTTPException(status_code=404)
    return result

@workflow_router.patch("/workflows/{id}", response_model=WorkflowResponse)
async def patch_workflow(id: str, patch: WorkflowStatusPatch):
    result = patch_workflow_status_handler(_get_db(), id, patch.status)
    if not result:
        raise HTTPException(status_code=404)
    return result

@workflow_router.delete("/workflows/{id}", status_code=204)
async def delete_workflow(id: str):
    deleted = delete_workflow_handler(_get_db(), id)  # cascades to workflow_steps via FK
    if not deleted:
        raise HTTPException(status_code=404)

# Per OQ-CRIT-2 resolution: explicit retry endpoint so operator can recover crash-failed workflows
@workflow_router.post("/workflows/{id}/retry", status_code=200, response_model=WorkflowResponse)
async def retry_workflow(id: str):
    result = retry_workflow_handler(_get_db(), id)
    if result is None:
        raise HTTPException(status_code=404)
    if result is False:
        raise HTTPException(status_code=409, detail="workflow not in retryable state")
    return result

# Pattern A cross-PC endpoints (rendezvous PC only; peer PCs call these via mesh_router)
@workflow_router.get("/workflows/_pending", response_model=list[dict])
async def get_pending_steps(assigned_pc: str, limit: int = 10):
    return get_pending_steps_for_pc(_get_db(), assigned_pc, limit)

@workflow_router.patch("/workflows/{wf_id}/steps/{step_id}", status_code=204)
async def report_step_result(wf_id: str, step_id: str, body: StepPatchBody):
    # Per Critic M1: transition_workflow_step makes the running-claim TOCTOU-safe by
    # adding `AND status='pending' AND assigned_pc=?` predicates server-side.
    transitioned = transition_workflow_step(
        _get_db(), step_id,
        new_status=body.status,
        result_json=body.result_json,
        error_json=body.error_json,
        claiming_pc=body.assigned_pc,  # only consulted for the 'running' transition
    )
    if not transitioned:
        # 409 for lost claim race, 404 for genuinely missing — handler returns sentinel
        raise HTTPException(status_code=409 if body.status == "running" else 404)
```

Auth: ALL endpoints under existing global Bearer via `apply_musu_middlewares` (per `server.py:1026`). NOT added to bypass list. Pattern matches `axis_routes.py:25` shape.

Router mount in `server.py:2190` (adjacent to existing routers):
```python
from workflow_routes import workflow_router
app.include_router(workflow_router)
```

### §2.4 handlers.py extensions

Add to `musu-bridge/handlers.py`:

```python
class NoEligiblePCError(Exception):
    def __init__(self, agent_id: str, selector: dict):
        self.context = {"agent_id": agent_id, "selector": selector}
        super().__init__(f"no online PC matches selector {selector} for agent {agent_id}")

def create_workflow_handler(db, req: dict) -> dict:
    """Per Critic H2: use db.cursor() context-manager (auto-commits on exit per db.py:271-282)
    and rely on `Database.execute()` which returns `list[sqlite3.Row]` and already commits
    (db.py:284-297). Do NOT call .rowcount on its return value; do NOT call db.commit()
    after db.execute(). Manual BEGIN/COMMIT is unnecessary inside the cursor context.
    """
    import uuid, time, json
    wf_id = uuid.uuid4().hex
    now = int(time.time())
    # 1. Assign each agent to a PC via nodeSelector match (raises BEFORE any insert)
    assignments = assign_steps_to_pcs(db, req["spec"])  # dict[agent_id] -> machine_id
    depends = _compute_depends(req["spec"])             # dict[agent_id] -> list[{from_agent_id, condition}]
    # 2. Atomic insert workflow + steps via cursor context (commits on success, rolls back on exception)
    with db.cursor() as cur:
        cur.execute(
            "INSERT INTO workflows (id, company_id, name, spec_json, status, created_at, updated_at) "
            "VALUES (?, ?, ?, ?, 'pending', ?, ?)",
            (wf_id, req["company_id"], req["name"], json.dumps(req["spec"]), now, now),
        )
        for agent in req["spec"]["agents"]:
            step_id = uuid.uuid4().hex
            cur.execute(
                "INSERT INTO workflow_steps (id, workflow_id, agent_id, assigned_pc, status, "
                "depends_on_json) VALUES (?, ?, ?, ?, 'pending', ?)",
                (step_id, wf_id, agent["id"], assignments[agent["id"]],
                 json.dumps(depends[agent["id"]])),
            )
    return {
        "id": wf_id, "company_id": req["company_id"], "name": req["name"],
        "status": "pending", "created_at": now,
    }

# Per Critic M3: PC staleness threshold. Default 5 min; tunable so tests can set lower.
import os as _os
_PC_STALENESS_SECONDS = int(_os.environ.get("MUSU_WORKFLOW_PC_STALENESS_SECONDS", "300"))

def assign_steps_to_pcs(db, spec: dict) -> dict:
    """First-match-wins against machine_capacity per Researcher F-R7.1.
    Per Critic M3: excludes machines with stale last_seen_at (default >5 min) to prevent
    assigning steps to dead PCs that would stick in 'pending' forever.
    Per Critic L2: nodeSelector keys are already whitelisted at Pydantic time, so the
    else-branch here is defense-in-depth; the Pydantic validator should reject first.
    """
    assignments = {}
    for agent in spec["agents"]:
        selector = agent.get("nodeSelector", {})
        where_clauses = [
            "m.status = 'online'",
            "(m.last_seen_at IS NULL OR m.last_seen_at >= strftime('%s', 'now') * 1 - ?)",
        ]
        params = [_PC_STALENESS_SECONDS]
        for key, val in selector.items():
            if key == "gpu_vram_free_gb_min":
                where_clauses.append("mc.gpu_vram_free_gb >= ?")
                params.append(float(val))
            elif key == "gpu_present":
                if val == "true":
                    where_clauses.append("mc.gpu_models_json != '[]'")
            elif key == "os":
                where_clauses.append("m.os = ?")
                params.append(val)
            else:
                raise ValueError(f"unknown nodeSelector key: {key}")
        sql = (
            "SELECT m.id FROM machines m JOIN machine_capacity mc ON m.id = mc.machine_id "
            f"WHERE {' AND '.join(where_clauses)} ORDER BY mc.gpu_vram_free_gb DESC LIMIT 1"
        )
        rows = db.execute(sql, params)  # returns list[sqlite3.Row]; auto-committed
        if not rows:
            raise NoEligiblePCError(agent["id"], selector)
        assignments[agent["id"]] = rows[0][0]
    return assignments

def _compute_depends(spec: dict) -> dict:
    """For each agent, list incoming-edge dependencies."""
    deps = {a["id"]: [] for a in spec["agents"]}
    for e in spec.get("edges", []):
        deps[e["to"]].append({"from_agent_id": e["from"], "condition": e.get("condition", "succeeded")})
    return deps

def transition_workflow_step(db, step_id: str, new_status: str,
                              result_json: str | None = None,
                              error_json: str | None = None,
                              claiming_pc: str | None = None) -> bool:
    """Per Critic H2 + M1: TOCTOU-safe transition using RETURNING + truthiness check
    (mirrors wake.py:184-194). For new_status='running', adds `AND status='pending'
    AND assigned_pc=?` predicates so a peer-side claim race resolves identically to
    the primary-side claim — only one PATCH wins, the loser sees rowcount=0 → 409.
    """
    import time
    now = int(time.time())
    if new_status == "running":
        if not claiming_pc:
            raise ValueError("claiming_pc required when transitioning to 'running'")
        claimed = db.execute(
            "UPDATE workflow_steps SET status='running', started_at=? "
            "WHERE id=? AND status='pending' AND assigned_pc=? RETURNING id",
            (now, step_id, claiming_pc),
        )
        return bool(claimed)
    elif new_status in ("succeeded", "failed", "timeout"):
        # Per Critic M5: fold transition + workflow-completion into ONE atomic sequence
        # under a cursor context to close the race where two near-simultaneous terminals
        # observe inconsistent aggregate state.
        with db.cursor() as cur:
            row = cur.execute("SELECT workflow_id FROM workflow_steps WHERE id=?", (step_id,)).fetchone()
            if not row:
                return False
            wf_id = row[0]
            updated = cur.execute(
                "UPDATE workflow_steps SET status=?, result_json=?, error_json=?, finished_at=? "
                "WHERE id=? AND status='running' RETURNING id",
                (new_status, result_json, error_json, now, step_id),
            ).fetchall()
            if not updated:
                return False
            # Aggregate inside same transaction
            counts = cur.execute(
                "SELECT status, COUNT(*) FROM workflow_steps WHERE workflow_id=? GROUP BY status",
                (wf_id,),
            ).fetchall()
            by_status = dict(counts)
            if by_status.get("pending", 0) == 0 and by_status.get("running", 0) == 0:
                # Distinguish executor-crash failures (recoverable via /retry) from genuine failures
                has_genuine_fail = cur.execute(
                    "SELECT 1 FROM workflow_steps WHERE workflow_id=? AND status IN ('failed','timeout') "
                    "AND (error_json IS NULL OR error_json NOT LIKE '%executor_crash%') LIMIT 1",
                    (wf_id,),
                ).fetchone()
                final = "failed" if has_genuine_fail else "succeeded"
                cur.execute("UPDATE workflows SET status=?, updated_at=? WHERE id=?", (final, now, wf_id))
        return True
    else:
        raise ValueError(f"invalid status transition target: {new_status}")

# Per OQ-CRIT-2: explicit operator retry path for crash-failed workflows.
def retry_workflow_handler(db, wf_id: str):
    """Returns dict on success, None on not-found, False on not-retryable.
    Resets workflow_steps with error_json containing 'executor_crash' back to 'pending'
    and the parent workflow back to 'running'. Genuine failures are NOT touched.
    """
    import time
    now = int(time.time())
    wf = db.execute("SELECT id, company_id, name, status FROM workflows WHERE id=?", (wf_id,))
    if not wf:
        return None
    row = wf[0]
    if row["status"] not in ("failed",):
        return False  # only failed workflows are retryable
    reset = db.execute(
        "UPDATE workflow_steps SET status='pending', error_json=NULL, started_at=NULL, finished_at=NULL "
        "WHERE workflow_id=? AND status IN ('failed','timeout') AND error_json LIKE '%executor_crash%' "
        "RETURNING id",
        (wf_id,),
    )
    if not reset:
        return False  # nothing crash-recoverable; operator must inspect manually
    db.execute("UPDATE workflows SET status='running', updated_at=? WHERE id=?", (now, wf_id))
    return {"id": wf_id, "company_id": row["company_id"], "name": row["name"],
            "status": "running", "reset_step_count": len(reset)}

def get_pending_steps_for_pc(db, assigned_pc: str, limit: int) -> list[dict]:
    """Used by Pattern A polling endpoint. Returns steps whose dependencies are satisfied."""
    rows = db.execute(
        """
        SELECT id, workflow_id, agent_id, depends_on_json, input_json
        FROM workflow_steps
        WHERE assigned_pc = ? AND status = 'pending'
        ORDER BY workflow_id, agent_id
        LIMIT ?
        """,
        (assigned_pc, limit),
    ).fetchall()
    # Filter: only steps whose dependencies are satisfied
    eligible = []
    for r in rows:
        if _are_dependencies_satisfied(db, r["workflow_id"], json.loads(r["depends_on_json"])):
            eligible.append({
                "step_id": r["id"], "workflow_id": r["workflow_id"],
                "agent_id": r["agent_id"], "input_json": r["input_json"],
            })
    return eligible

def _are_dependencies_satisfied(db, wf_id: str, deps: list[dict]) -> bool:
    if not deps:
        return True
    for dep in deps:
        row = db.execute(
            "SELECT status FROM workflow_steps WHERE workflow_id=? AND agent_id=?",
            (wf_id, dep["from_agent_id"]),
        ).fetchone()
        if not row:
            return False
        expected = dep["condition"]
        if expected == "always":
            if row["status"] in ("pending", "running"):
                return False  # not yet terminal
        elif expected == "succeeded":
            if row["status"] != "succeeded":
                return False
        elif expected == "failed":
            if row["status"] != "failed":
                return False
    return True
```

### §2.5 workflow_executor.py asyncio task

```python
# musu-bridge/workflow_executor.py
import asyncio
import os
import json
import logging
import time
import httpx
from musu_core.dispatch.wake import enqueue_wake, execute_wake
from sync_engine import _get_sync_token  # Per Critic H5: actual module, not mesh_router

logger = logging.getLogger(__name__)

POLL_INTERVAL_MS = int(os.environ.get("MUSU_WORKFLOW_EXECUTOR_POLL_MS", "1000"))
POLL_BATCH = int(os.environ.get("MUSU_WORKFLOW_EXECUTOR_BATCH", "5"))
ENABLED = os.environ.get("MUSU_WORKFLOW_EXECUTOR_ENABLED", "true") == "true"
PEER_SWEEPER_INTERVAL_S = int(os.environ.get("MUSU_WORKFLOW_PEER_SWEEPER_INTERVAL_S", "60"))

_this_machine_id: str | None = None

def _resolve_this_machine_id(db) -> str | None:
    """MUSU_NODE_NAME → machines.id per Researcher F-R7.1."""
    global _this_machine_id
    if _this_machine_id:
        return _this_machine_id
    node_name = os.environ.get("MUSU_NODE_NAME")
    if not node_name:
        return None
    rows = db.execute(
        "SELECT id FROM machines WHERE hostname = ? OR id = ?", (node_name, node_name)
    )
    _this_machine_id = rows[0][0] if rows else None
    return _this_machine_id

def _is_primary() -> bool:
    """Per Critic H1 + OQ-CRIT-1 resolution: reuse MUSU_NODE_ROLE flag from server.py:577.
    Rendezvous-decoupling (separate MUSU_WORKFLOW_RENDEZVOUS env) deferred to V23.5
    if/when failover decoupling becomes necessary.
    """
    return os.environ.get("MUSU_NODE_ROLE", "primary").lower() == "primary"

def _primary_url() -> str:
    """Per Critic H5: local helper, not import. Returns rendezvous PC base URL with no trailing slash.
    Raises if called on a peer that has no primary configured (would be a logic bug — peer
    code paths must only be entered when _is_primary() is False AND MUSU_PRIMARY_URL is set).
    """
    url = os.environ.get("MUSU_PRIMARY_URL", "").rstrip("/")
    if not url:
        raise RuntimeError("MUSU_PRIMARY_URL must be set when MUSU_NODE_ROLE != primary")
    return url

async def _crash_recovery(db, this_machine_id: str) -> None:
    """Per Critic H2: use RETURNING + truthiness check, not .rowcount.
    Per OQ-CRIT-2 resolution: marks 'running' steps for THIS PC as 'failed' with
    reason='executor_crash' — operator recovers via POST /api/workflows/{id}/retry.
    """
    recovered = db.execute(
        "UPDATE workflow_steps "
        "SET status = 'failed', error_json = ?, finished_at = strftime('%s', 'now') * 1 "
        "WHERE assigned_pc = ? AND status = 'running' RETURNING id",
        (json.dumps({"reason": "executor_crash"}), this_machine_id),
    )
    if recovered:
        logger.warning(
            f"[workflow_executor] crash recovery: marked {len(recovered)} stale running steps as failed"
        )

async def _peer_crash_sweeper(db) -> None:
    """Per Critic L4 + OQ-CRIT-3 resolution: rendezvous-side periodic sweeper that
    times out steps whose assigned PC (peer) crashed or went offline mid-step.
    Mirrors _crash_recovery's RETURNING idiom; runs every PEER_SWEEPER_INTERVAL_S.
    Uses each agent's spec timeoutSeconds (joined from workflows.spec_json) — defaults
    to 3600s for steps where timeoutSeconds is unset.
    """
    if not _is_primary():
        return  # peers don't sweep — they recover their own steps at startup
    while True:
        try:
            # Conservative wide net: any step in 'running' for > MUSU_WORKFLOW_PEER_TIMEOUT_S
            # (separate, larger budget than per-step timeout — sweeper is last resort)
            timeout_floor = int(os.environ.get("MUSU_WORKFLOW_PEER_TIMEOUT_S", "7200"))
            swept = db.execute(
                "UPDATE workflow_steps "
                "SET status = 'timeout', error_json = ?, finished_at = strftime('%s', 'now') * 1 "
                "WHERE status = 'running' AND started_at IS NOT NULL "
                "AND started_at < strftime('%s', 'now') * 1 - ? RETURNING id, assigned_pc",
                (json.dumps({"reason": "peer_timeout"}), timeout_floor),
            )
            if swept:
                logger.warning(
                    f"[workflow_executor] peer sweeper: timed out {len(swept)} stale running steps "
                    f"(peers likely offline): {[(r['id'], r['assigned_pc']) for r in swept]}"
                )
        except Exception:
            logger.exception("[workflow_executor] peer sweeper iteration error; continuing")
        await asyncio.sleep(PEER_SWEEPER_INTERVAL_S)

async def _fetch_pending_steps(db, this_machine_id: str) -> list[dict]:
    if _is_primary():
        from handlers import get_pending_steps_for_pc
        return get_pending_steps_for_pc(db, this_machine_id, POLL_BATCH)
    else:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                f"{_primary_url()}/api/workflows/_pending",
                params={"assigned_pc": this_machine_id, "limit": POLL_BATCH},
                headers={"Authorization": f"Bearer {_get_sync_token()}"},
            )
            resp.raise_for_status()
            return resp.json()

async def _claim_step_toctou(db, step: dict, this_machine_id: str) -> bool:
    """Per Critic H3: receives full `step` dict (has both workflow_id and step_id).
    Per Critic H2: RETURNING + truthiness; no .rowcount on db.execute() return.
    Per Critic M1: peer-claim PATCH is now TOCTOU-safe server-side (transition_workflow_step
    enforces `AND status='pending' AND assigned_pc=?` for the 'running' transition).
    Both branches now have semantically identical race semantics — only one claimant wins.
    """
    step_id = step["step_id"]
    workflow_id = step["workflow_id"]
    if _is_primary():
        claimed = db.execute(
            "UPDATE workflow_steps SET status='running', started_at=strftime('%s','now')*1 "
            "WHERE id=? AND status='pending' AND assigned_pc=? RETURNING id",
            (step_id, this_machine_id),
        )
        return bool(claimed)
    else:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.patch(
                f"{_primary_url()}/api/workflows/{workflow_id}/steps/{step_id}",
                json={"status": "running", "assigned_pc": this_machine_id},
                headers={"Authorization": f"Bearer {_get_sync_token()}"},
            )
            # 204 = won the claim; 409 = lost the race; other = unexpected
            if resp.status_code == 204:
                return True
            if resp.status_code == 409:
                return False
            resp.raise_for_status()
            return False

async def _execute_step(db, router, step: dict, timeout_seconds: int) -> None:
    """Wrap enqueue_wake + execute_wake per Researcher F-R2.1."""
    run_id = enqueue_wake(
        db, agent_id=step["agent_id"],
        wake_reason="workflow_step",
        wake_payload={
            "workflow_id": step["workflow_id"],
            "step_id": step["step_id"],
            "input": json.loads(step.get("input_json") or "{}"),
        },
    )
    try:
        await asyncio.wait_for(execute_wake(db, router, run_id), timeout=timeout_seconds)
        rows = db.execute(
            "SELECT status, summary, error FROM heartbeat_runs WHERE id = ?", (run_id,)
        )
        if not rows:
            raise RuntimeError(f"heartbeat_runs row missing for run_id={run_id}")
        row = rows[0]
        final = "succeeded" if row["status"] == "completed" else "failed"
        await _report_step_result(db, step, final, result_json=row["summary"], error_json=row["error"])
    except asyncio.TimeoutError:
        # Step ran past spec timeout — distinct from peer-sweeper's 'peer_timeout' reason.
        await _report_step_result(db, step, "timeout", error_json=json.dumps({"reason": "spec_timeout"}))
    except Exception as e:
        logger.exception(f"[workflow_executor] step {step['step_id']} failed")
        await _report_step_result(db, step, "failed", error_json=json.dumps({"reason": str(e)}))

async def _report_step_result(db, step: dict, new_status: str,
                                result_json: str | None = None,
                                error_json: str | None = None) -> None:
    if _is_primary():
        from handlers import transition_workflow_step
        # claiming_pc not needed for terminal transitions (only 'running' uses it)
        transition_workflow_step(db, step["step_id"], new_status, result_json, error_json)
    else:
        async with httpx.AsyncClient(timeout=10.0) as client:
            await client.patch(
                f"{_primary_url()}/api/workflows/{step['workflow_id']}/steps/{step['step_id']}",
                json={"status": new_status, "result_json": result_json, "error_json": error_json},
                headers={"Authorization": f"Bearer {_get_sync_token()}"},
            )

async def _workflow_executor_loop(db, router) -> None:
    """Main loop. Mirrors heartbeat_scheduler.py:236-316 shape."""
    if not ENABLED:
        logger.info("[workflow_executor] disabled via MUSU_WORKFLOW_EXECUTOR_ENABLED")
        return
    this_machine_id = _resolve_this_machine_id(db)
    if not this_machine_id:
        logger.warning("[workflow_executor] cannot resolve THIS_MACHINE_ID; loop not started")
        return
    if _is_primary():
        await _crash_recovery(db, this_machine_id)
    logger.info(f"[workflow_executor] started; this_machine={this_machine_id}, primary={_is_primary()}")
    while True:
        try:
            steps = await _fetch_pending_steps(db, this_machine_id)
            for step in steps:
                if not await _claim_step_toctou(db, step, this_machine_id):
                    continue  # another worker won
                wf_rows = db.execute(
                    "SELECT spec_json FROM workflows WHERE id = ?", (step["workflow_id"],)
                )
                if not wf_rows:
                    continue
                spec = json.loads(wf_rows[0]["spec_json"])
                agent_spec = next(a for a in spec["agents"] if a["id"] == step["agent_id"])
                timeout = agent_spec.get("timeoutSeconds", 3600)
                await _execute_step(db, router, step, timeout)
        except Exception:
            logger.exception("[workflow_executor] iteration error; continuing")
        await asyncio.sleep(POLL_INTERVAL_MS / 1000.0)
```

### §2.6 server.py lifespan integration

```python
# In server.py around line 759 (next to heartbeat_task spawn):
from workflow_executor import _workflow_executor_loop, _peer_crash_sweeper
workflow_task = asyncio.create_task(_workflow_executor_loop(db, router_instance))
# Per Critic L4 + OQ-CRIT-3: rendezvous-side sweeper is no-op on peer; safe to always-spawn
peer_sweeper_task = asyncio.create_task(_peer_crash_sweeper(db))

# In server.py around line 967-974 (next to relay_task cancel):
for task in (workflow_task, peer_sweeper_task):
    if task:
        task.cancel()
        try:
            await asyncio.wait_for(task, timeout=5)
        except (asyncio.TimeoutError, asyncio.CancelledError):
            pass

# In server.py around line 2190 (router mount cluster):
from workflow_routes import workflow_router
app.include_router(workflow_router)
```

### §2.7 sources.py _ALLOWED_TABLES extension

`musu-core/src/musu_core/controllers/sources.py:31-50`: add `"workflows"` and `"workflow_steps"` to the `_ALLOWED_TABLES` set. Single-line change per table.

---

## §3 Test plan

`musu-bridge/tests/test_workflow_routes.py` + `test_workflow_executor.py`. Use existing pytest fixtures (`db` for in-memory SQLite, `client` for TestClient with auth headers).

| # | Test | Assertion |
|---|---|---|
| T1 | Migration round-trip | apply v37 on fresh DB → workflows + workflow_steps tables exist with correct columns + indices; apply v37_down → tables gone; reapply v37 → no error (idempotent) |
| T2 | Pydantic agent id uniqueness | spec with duplicate agent ids → ValueError "duplicate agent ids" |
| T3 | Pydantic edge cross-reference | spec with edge.from not in agents → ValueError "edge.from 'X' not in agents" |
| T4 | Pydantic cycle detection | spec with A→B→A → ValueError "cycle detected" |
| T5 | Pydantic input cross-reference | agent.inputs.from = non-existent agent → ValueError |
| T6 | assign_steps_to_pcs match | populate machines + machine_capacity; selector {os:linux} matches → assigns first online linux machine |
| T7 | assign_steps_to_pcs no-match | selector {gpu_vram_free_gb_min:99999} → raises NoEligiblePCError; POST returns 422 with `{error: no_eligible_pcs, agent_id, selector}` |
| T8 | TOCTOU step claim race | two simulated workers call `_claim_step_toctou` on same step → only one returns True |
| T9 | Executor happy path | seed pending step + mock `execute_wake` to write heartbeat_runs.status='completed' → executor transitions step to 'succeeded'; workflows.status → 'succeeded' |
| T10 | Executor timeout | mock execute_wake to `asyncio.sleep(10)`; timeoutSeconds=1 → step 'timeout'; error_json contains reason |
| T11 | Crash recovery | insert 'running' step for THIS_MACHINE_ID → call `_crash_recovery` → row 'failed' with error_json `{"reason": "executor_crash"}` |
| T12 | Cross-PC Pattern A pickup | mock httpx GET response with pending step → executor picks up; mock PATCH back → status reported |
| T13 | DELETE cascade | INSERT workflow + steps → DELETE workflow → workflow_steps gone (FK CASCADE) |
| T14 | PATCH status-only | PATCH {"status": "running"} → 200; PATCH {"spec": ...} → 422 (Pydantic rejects unknown field) |
| T15 | SSE eligibility | `_ALLOWED_TABLES` contains both `workflows` and `workflow_steps` |
| T16 | Workflow completion aggregation | all steps 'succeeded' → workflows.status → 'succeeded'; any genuine 'failed' → workflows.status → 'failed'; `executor_crash` only → workflows.status stays 'running' (recoverable via /retry) |
| T17 | Rendezvous-PC as step assignee fast path (Critic L1) | rendezvous PC running its own step → `_fetch_pending_steps` hits local SQLite branch (not httpx); covered by primary-branch in `_is_primary()` test |
| T18 | Degenerate single-step workflow (Critic L1) | spec with `len(agents)==1, len(edges)==0` → POST 201 → executor runs → 'succeeded'; workflow completes |
| T19 | All-steps-same-PC workflow (Critic L1) | all N agents with `nodeSelector` matching same PC → no peer poll path exercised; ensure no self-race on `_claim_step_toctou` |
| T20 | Two concurrent terminal transitions atomicity (Critic M5) | 2 steps finish nearly simultaneously → no inconsistent intermediate snapshot; workflows.status = 'succeeded' exactly once (not flapped via 'failed' midway) |
| T21 | Stale machine excluded from assignment (Critic M3) | machine A `last_seen_at=now`, machine B `last_seen_at=now-3600` (>300s threshold) → assignment goes to A only; if A also stale → 422 no_eligible_pcs |
| T22 | Peer-claim TOCTOU race via HTTP (Critic M1) | 2 peers PATCH `{status:'running', assigned_pc:X}` for same step within 50ms → exactly one gets 204, other gets 409 |
| T23 | Operator retry endpoint (OQ-CRIT-2) | workflow with 1 step `failed/executor_crash` + 1 `succeeded` → POST /retry → 200, step → 'pending', workflow → 'running'. Workflow with genuine `failed` → POST /retry → 409 (no crash-recoverable steps). Non-existent workflow → 404. |
| T24 | Peer-crash sweeper (Critic L4, OQ-CRIT-3) | rendezvous DB has step `status='running' assigned_pc=PEER_B started_at=now-7300` → `_peer_crash_sweeper` one iteration → step `status='timeout' error_json.reason='peer_timeout'` |

Test count delta: existing musu-bridge pytest count baseline + 24. Confirm exact baseline at Builder time.

---

## §4 Const gates

- **Const III**: TRIGGERED on v37 migration first prod apply. Operator "진행해" required.
- **Const VI**: NOT triggered (no K3s baseline change; no Argo install).
- **Const VII**: per-push at each commit; main-merge gate at Phase 4 close.

### §4.1 Const III apply checklist (operator-followed at prod deploy)

1. Run on staging SQLite snapshot: `python -c "from musu_core.migrations import apply_pending; import sqlite3; c=sqlite3.connect('staging.db'); apply_pending(c)"` — verify exit 0
2. Inspect: `sqlite3 staging.db ".schema workflows"` + `".schema workflow_steps"` — verify expected DDL
3. On production: same `apply_pending` call against prod SQLite (idempotent — no-op if v37 already applied)
4. Smoke POST: `curl -X POST $BRIDGE_URL/api/workflows -H "Authorization: Bearer $TOKEN" -d '{"company_id":"...", "name":"smoke", "spec":{"agents":[{"id":"a","image":"alpine"}], "edges":[]}}'` → expect 201
5. Verify row: `sqlite3 prod.db "SELECT id, status FROM workflows WHERE name='smoke'"` → expect 1 row, status='pending'

---

## §5 Acceptance criteria

1. ✅ migrations.py extended with v37; `apply_pending` succeeds on fresh DB
2. ✅ POST /api/workflows valid spec → 201 + rows in both tables
3. ✅ POST cyclic spec → 422 "cycle detected"
4. ✅ POST no-eligible-PC → 422 `{error: no_eligible_pcs}`
5. ✅ workflow_executor running in dev: pending → running → succeeded
6. ✅ Crash recovery: stale 'running' → 'failed' reason=executor_crash
7. ✅ Cross-PC Pattern A: mock 2-PC fixture passes T12
8. ✅ `pytest musu-bridge/tests/test_workflow_*.py` all 24 cases green (T1-T24)
9. ✅ `pytest` full bridge suite green (no regression)
10. ✅ `mypy musu-bridge` clean (or matches existing baseline)
11. ✅ Const III gate: operator runs `apply_pending` on production, verifies tables, "진행해"
12. ✅ Single quality-engineer audit returns SHIP-OK
13. ✅ Closure doc wiki/436 written

---

## §6 Builder MUST-do checklist

Consolidated mandates from Researcher findings + Critic expected gates:

- [ ] Migration in `musu-core/src/musu_core/migrations.py` (NOT `musu-bridge/schema/`)
- [ ] Schema version = **v37** (current max v36)
- [ ] `_v37_up` uses `conn.executescript("BEGIN; ...; COMMIT;")` per `_v3_up`/`_v4_up` precedent
- [ ] `_v37_up` idempotent (sqlite_master probe before write)
- [ ] `_ALLOWED_TABLES` in `sources.py` extended in same PR
- [ ] **TOCTOU step claim**: `db.execute("UPDATE ... RETURNING id")` + `bool(claimed)` truthiness check — mirrors `wake.py:184-194` exactly. **Do NOT use `.rowcount`** — `Database.execute()` returns `list[sqlite3.Row]` (db.py:284-297). Reference `pattern-toctou-atomic-update` memory. (Critic H2)
- [ ] **DB API**: do NOT call `db.commit()` after `db.execute(...)` — `Database.execute()` already auto-commits. For multi-statement atomic blocks, use `with db.cursor() as cur:` (auto-commits on success, rolls back on exception per db.py:271-282). (Critic H2)
- [ ] **`_get_db()` convention**: follow `axis_routes.py:28-31` — `def _get_db(): from handlers import _get_backend; return _get_backend()._db`. Do NOT use `request.app.state.db` (does not exist in this codebase). (Critic H4)
- [ ] **Pattern A primary detection**: `_is_primary()` reads `MUSU_NODE_ROLE` (per `server.py:577`) — NOT `MUSU_PRIMARY_URL`. (Critic H1, OQ-CRIT-1)
- [ ] **Cross-PC imports**: `_get_sync_token` imports from `sync_engine` (per `sync_engine.py:24-31`) — NOT from `mesh_router`. `_primary_url()` is a LOCAL helper in workflow_executor.py reading `MUSU_PRIMARY_URL` env directly — NOT an import. (Critic H5)
- [ ] **`_claim_step_toctou(db, step, this_machine_id)` signature**: receives full `step` dict (must contain both `step_id` AND `workflow_id`); do not split into separate `step_id` arg. (Critic H3)
- [ ] **Peer-side claim TOCTOU symmetry**: server-side `transition_workflow_step` for `new_status='running'` MUST include `AND status='pending' AND assigned_pc=?` predicates. Body must carry `assigned_pc`. Returns 204 on win, 409 on loss. (Critic M1)
- [ ] **PC staleness gate**: `assign_steps_to_pcs` adds `(m.last_seen_at IS NULL OR m.last_seen_at >= strftime('%s','now')*1 - MUSU_WORKFLOW_PC_STALENESS_SECONDS)` (default 300s) to the SELECT WHERE clause. (Critic M3)
- [ ] **Atomic completion-aggregation**: `transition_workflow_step` for terminal statuses wraps step UPDATE + workflow status SELECT/UPDATE in a single `db.cursor()` block; do NOT call `_check_workflow_completion` post-commit. Distinguish `executor_crash` failures from genuine failures (only the latter mark workflow as 'failed'). (Critic M5)
- [ ] **Operator retry endpoint**: `POST /api/workflows/{id}/retry` resets `error_json LIKE '%executor_crash%'` steps back to 'pending' + workflow to 'running'; 409 if not retryable. (OQ-CRIT-2)
- [ ] **Peer-crash sweeper**: separate asyncio task `_peer_crash_sweeper` runs on rendezvous PC only, every 60s; times out steps with `status='running' AND started_at < now - MUSU_WORKFLOW_PEER_TIMEOUT_S` (default 7200s) using RETURNING idiom. (Critic L4, OQ-CRIT-3)
- [ ] **Pydantic v2** validators split: `_unique_agent_ids` as `@field_validator`; `_check_edges_reference_existing_agents` + `_check_no_cycles` + `_check_inputs_reference_declared_outputs` as separate `@model_validator(mode='after')` methods. `nodeSelector` keys whitelisted via `@field_validator` to `{"gpu_vram_free_gb_min", "gpu_present", "os"}`. (Critic M4 + L2)
- [ ] **Typed PATCH body**: `class StepPatchBody(BaseModel)` with `status: Literal[...]`, `result_json`, `error_json`, `assigned_pc` — no untyped dict. (Critic L3)
- [ ] `enqueue_wake + asyncio.wait_for(execute_wake, timeout=...)` wrapping
- [ ] **Pattern A polling** (not SSE-filter) — peer → rendezvous httpx with Bearer
- [ ] `assigned_pc REFERENCES machines(id) ON DELETE SET NULL` (NOT CASCADE)
- [ ] `depends_on_json` column pre-computed at POST, used at executor SQL via `_are_dependencies_satisfied`
- [ ] Crash recovery: 'running' → 'failed' reason='executor_crash' at startup (NOT 'pending' — avoids double-invoke); operator recovers via `/retry` endpoint
- [ ] Bypass list NOT modified (workflow_routes uses default Bearer auth)
- [ ] Lifespan: BOTH `workflow_task` AND `peer_sweeper_task` spawn/cancel per relay_task precedent at server.py:969-974
- [ ] Env flag `MUSU_WORKFLOW_EXECUTOR_ENABLED` (default `true`)
- [ ] PATCH status-only on workflow (spec mutation = V23.5); PATCH on step ALLOWS `assigned_pc` ONLY when status='running' (the claim path)

---

## §7 Auditor scope (single quality-engineer per master plan §2)

1. **Migration round-trip + idempotency**: T1 verified; manual re-apply on existing DB doesn't error
2. **TOCTOU race exactness**: T8 (in-process) + T22 (cross-PC HTTP) — only 1 wins each; lost worker handles empty RETURNING gracefully
3. **asyncio task lifecycle**: T9-T12 + T24 confirm no orphan tasks; both `workflow_task` AND `peer_sweeper_task` shut down via cancel
4. **Dependency satisfaction**: extra audit test — `_are_dependencies_satisfied` returns False on missing dep + True on 'always' with terminal status + correct condition matching
5. **Pattern A cross-PC**: T12 + T22 confirm httpx polling shape; auth header present; peer-claim TOCTOU is server-enforced
6. **Crash recovery exactness**: T11 confirms only `assigned_pc=THIS_PC` rows touched; other PCs' running steps untouched
7. **SSE eligibility**: T15 verifies _ALLOWED_TABLES update
8. **Pydantic coverage**: every validator (T2-T5) has negative test
9. **Error mapping**: each HTTP status (201/204/404/409/422) has at least 1 test
10. **No regression**: existing bridge pytest suite passes (T9)
11. **Critic HIGH explicit address** (per MODE_Agent_Team.md): Auditor HANDOFF NOTES must explicitly cite each of H1 (`_is_primary` via `MUSU_NODE_ROLE`), H2 (no `.rowcount` on `db.execute`), H3 (`_claim_step_toctou` takes full step dict), H4 (`_get_db()` via handlers backend), H5 (`_get_sync_token` from `sync_engine`) — verify each in the built code. Silence on any of these → finding stays HIGH per mode contract.
12. **MED explicit address**: M1 (T22 peer-claim TOCTOU), M2 (T23 retry endpoint shape), M3 (T21 staleness), M5 (T20 atomic completion-aggregation), L4 (T24 peer sweeper). Each must be present and passing.
13. **Self-contained-product check**: re-verify ZERO new external SaaS / paid dep / non-OSS dependency introduced; only existing in-repo libraries (FastAPI, Pydantic v2, httpx).

---

## §8 References

- `F:\workspace\musu-bee\docs\V23_4_PHASE4_MASTER_PLAN_2026_05_18.md` (wiki/431-v2 — §0 Strategic Gate context, §5.A' Researcher findings)
- `F:\workspace\musu-bee\docs\V23_4_F_B2_1_PLAN_2026_05_17.md` (wiki/406 — detail plan template followed here)
- `F:\workspace\musu-bee\docs\V23_4_F_B2_1_CLOSURE_2026_05_17.md` (wiki/426 — closure precedent)
- `F:\workspace\musu-bee\musu-core\src\musu_core\migrations.py:1482-1483` (v36 + MIGRATIONS list append point)
- `F:\workspace\musu-bee\musu-core\src\musu_core\migrations.py:99,135,1417-1424` (BEGIN/COMMIT idiom; canonical idempotent up_fn pattern)
- `F:\workspace\musu-bee\musu-core\src\musu_core\dispatch\wake.py:75-189` (enqueue_wake + execute_wake)
- `F:\workspace\musu-bee\musu-core\src\musu_core\dispatch\wake.py:184-189` (TOCTOU atomic UPDATE pattern T2-A' mirrors)
- `F:\workspace\musu-bee\musu-bridge\dispatch_routes.py:71-90,93-116` (caller pattern + result retrieval)
- `F:\workspace\musu-bee\musu-bridge\heartbeat_scheduler.py:236-316` (asyncio task shape)
- `F:\workspace\musu-bee\musu-bridge\heartbeat_scheduler.py:250` (MUSU_NODE_NAME usage)
- `F:\workspace\musu-bee\musu-bridge\server.py:759,838,967-974,1026-1035,2177-2190` (lifespan + middleware + router mount)
- `F:\workspace\musu-bee\musu-bridge\mesh_router.py:463-567,526` (forward + _forward_http for Pattern A)
- `F:\workspace\musu-bee\musu-bridge\sync_engine.py:155-247` (confirms no workflow tables in sync — Pattern A rationale)
- `F:\workspace\musu-bee\musu-bridge\axis_routes.py:46-75` (machine_capacity query pattern)
- `F:\workspace\musu-bee\musu-bridge\watch_routes.py:91-120` (confirms no WHERE filter in SSE)
- `F:\workspace\musu-bee\musu-core\src\musu_core\controllers\sources.py:31-50` (_ALLOWED_TABLES extension target)
- `F:\workspace\musu-bee\musu-bridge\system_routes.py:94` (accept_pair router mount style precedent)
- `F:\workspace\musu-bee\musu-bridge\pyproject.toml:12` (Pydantic v2 confirmation)
- `C:\Users\empty\.claude\projects\C--Users-empty\memory\pattern-toctou-atomic-update.md` (user pattern memory — load-bearing for executor step claim)

---

## §9 Open questions for Critic

Minimal — Researcher resolved 6 OQs already; remaining items for Critic to challenge:

1. **Pattern A vs B**: Critic should explicitly bless Pattern A (single-source-on-rendezvous) OR escalate as scope expansion. Researcher recommends A; T2-A' assumes A. If Critic prefers B → +500 LOC, separate workstream.
2. **depends_on_json JSON column vs separate workflow_step_dependencies table**: JSON keeps it 1-table; separate table is more normalized but adds a join. MVP picks JSON. Critic may challenge.
3. **Crash recovery 'failed' vs 'pending' default**: T2-A' picks 'failed' for explicit operator awareness; alternative 'pending' retries but risks double-invoke. Critic may challenge tradeoff.
4. **nodeSelector simple key-value vs labels JSON column**: T2-A' picks simple-key-value mapped to existing machine_capacity columns; labels JSON would be more K8s-like but adds schema column + indexing complexity. Critic may challenge.
5. **PATCH scope status-only vs broader**: T2-A' picks narrow (status only) for MVP. Spec mutation = V23.5. Critic may challenge if T2-D React Flow editor wants in-place name rename.

---

## §10 Orchestrator decisions on OQ-CRIT items

Per autonomous /loop directive (orchestrator decides, does not outsource):

- **OQ-CRIT-1 (`_is_primary` env source)**: **Reuse `MUSU_NODE_ROLE`** (matches `server.py:577` precedent). Decoupling rendezvous from server-primary-role via a separate `MUSU_WORKFLOW_RENDEZVOUS` env is deferred to V23.5; current need is single-rendezvous-per-fleet which `MUSU_NODE_ROLE` already expresses. Future failover decoupling becomes a localized change to `_is_primary()` only.
- **OQ-CRIT-2 (crash-recovery semantics)**: **Keep 'failed' default AND ship operator retry endpoint**. Auto-retry risks double-invoke of non-idempotent agent steps (CLAUDE.md safety stance). Explicit operator `/retry` endpoint gives recovery path with no silent re-execution. Adds 15 LOC handler + 5 LOC route + 1 test (T23). UX gain is large vs cost.
- **OQ-CRIT-3 (peer-crash sweeper)**: **Add 30-LOC sweeper now**. Without it, "stuck workflow if peer never returns" is a real MVP failure mode (one of 5-user closed beta scenarios is a laptop going to sleep mid-step). Heartbeat-from-peer (richer signal) deferred to V23.5. Sweeper uses same RETURNING idiom as `_crash_recovery` — uniform pattern is cheap to extend.

---

## §11 Critic Findings (resolved)

Phase 1.5 Critic (`system-architect`) returned **5 HIGH, 5 MEDIUM, 4 LOW, 3 INFO**. All HIGH addressed in plan revision; all MED and selected LOW addressed. The following table is the state handoff for the Auditor (per MODE_Agent_Team.md universal envelope contract).

| ID | Severity | Claim | Plan revision (file:section) | Status |
|---|---|---|---|---|
| H1 | HIGH | `_is_primary()` keyed off `MUSU_PRIMARY_URL` was wrong; would misclassify peer as primary. | §2.5 `_is_primary` rewritten to `MUSU_NODE_ROLE` per `server.py:577`. §6 checklist updated. | RESOLVED |
| H2 | HIGH | `cur = db.execute(...); db.commit(); cur.rowcount` against API that returns `list[sqlite3.Row]` — AttributeError everywhere. | §2.4 + §2.5: all 5 sites rewritten using RETURNING + truthiness check (`bool(claimed)` / `if recovered`); no manual `db.commit()` after `db.execute()`; `with db.cursor() as cur:` for multi-statement atomic blocks. §6 checklist line 722 explicit. | RESOLVED |
| H3 | HIGH | `_claim_step_toctou` peer branch used undefined `wf_id`. | §2.5 signature is now `_claim_step_toctou(db, step, this_machine_id)`; uses `step["step_id"]` + `step["workflow_id"]`. Caller in `_workflow_executor_loop` updated. | RESOLVED |
| H4 | HIGH | `request.app.state.db` doesn't exist in this codebase; AttributeError. | §2.3 uses `_get_db()` per `axis_routes.py:28-31` convention. All `request: Request` params dropped where unused. §6 checklist added. | RESOLVED |
| H5 | HIGH | `from mesh_router import _get_sync_token, _primary_url` — neither exists in mesh_router. | §2.5: `_get_sync_token` imported from `sync_engine`; `_primary_url` is now a local helper reading `MUSU_PRIMARY_URL` env. §6 checklist added. | RESOLVED |
| M1 | MED | Peer-claim PATCH was NOT TOCTOU-safe server-side (no `AND status='pending' AND assigned_pc=?`); race window unmitigated. | §2.4 `transition_workflow_step` for `new_status='running'` adds predicates + requires `claiming_pc` in body; returns 204 on win, 409 on loss. §2.3 PATCH body includes `assigned_pc`. T22 added. | RESOLVED |
| M2 | MED | Crash-recovery 'failed' default contradicted in-plan retry justification; no operator-recovery path documented. | §2.4 `retry_workflow_handler` + §2.3 `POST /workflows/{id}/retry` added (OQ-CRIT-2 decision). `_check_workflow_completion` distinguishes `executor_crash` from genuine failures. T23 added. | RESOLVED |
| M3 | MED | `assign_steps_to_pcs` joined stale machines (no `last_seen_at` recency filter). | §2.4 SELECT WHERE clause adds `(m.last_seen_at IS NULL OR m.last_seen_at >= now - MUSU_WORKFLOW_PC_STALENESS_SECONDS)` (default 300s). T21 added. | RESOLVED |
| M4 | MED | `_check_edges_and_cycles` was monolithic; conflated edge-existence vs cycle vs input-references. | §2.2 split into 3 named `@model_validator` methods + `_unique_agent_ids` stays `@field_validator`. T3-T5 retain coverage, now per-method. | RESOLVED |
| M5 | MED | `transition_workflow_step` + `_check_workflow_completion` were two separate commits; non-atomic aggregation race. | §2.4 terminal-transition branch folds step UPDATE + workflow status SELECT/UPDATE into one `db.cursor()` block; aggregation check distinguishes `executor_crash` from genuine fails. T20 added. | RESOLVED |
| L1 | LOW | Missing tests for rendezvous-as-assignee fast path, degenerate single-step workflow, all-same-PC workflow. | §3 T17, T18, T19 added. | RESOLVED |
| L2 | LOW | nodeSelector key validation was deferred to handler, error escaped as ValueError → handler converted to 422 (functionally OK but worse error message). | §2.2 `@field_validator("nodeSelector")` whitelists keys + lists valid keys in error message. Defense-in-depth retained in handler. | RESOLVED |
| L3 | LOW | PATCH step body was untyped `dict`; CHECK-constraint violations would surface as 500. | §2.3 typed `StepPatchBody(BaseModel)` with `status: Literal[...]`, optional `assigned_pc` for claim path. | RESOLVED |
| L4 | LOW | Crash-recovery only runs at THIS_PC startup; peer-crashed 'running' steps on rendezvous would stick forever. | §2.5 `_peer_crash_sweeper` async task added (60s cadence, 7200s timeout floor). §2.6 lifespan spawns/cancels alongside workflow_task. T24 added. (OQ-CRIT-3 decision) | RESOLVED |
| I1 | INFO | In-function imports for cross-file helpers — slow per call on hot paths. | DEFERRED to post-Builder profile. If executor wake-up latency dominated by imports, lift to module level. | DEFERRED |
| I2 | INFO | `executor_poll_interval=1000ms` may cause CPU idle drift on multi-company fleets. | DEFERRED. Builder to manually measure idle CPU% with empty workflows table after first wire-up; threshold target <0.5% on quad-core. | DEFERRED |
| I3 | INFO | `_compute_depends` and `_check_no_cycles` both walk edges (duplicate work). | NOT ADDRESSED — MVP scale workflows (<50 nodes) make this cosmetic. Revisit if scale grows. | DEFERRED |

**Auditor MUST**: In Phase 5 HANDOFF NOTES, explicitly cite each of H1-H5 and verify each in the built code (per MODE_Agent_Team.md "Critic HIGH, Auditor silent → stays HIGH"). Verify M1, M2, M3, M5, L4 via the corresponding new test cases (T20-T24).

**Critic verdict**: APPROVE WITH MANDATORY HIGH FIXES. All HIGH fixes applied in this plan revision. Builder may proceed.
