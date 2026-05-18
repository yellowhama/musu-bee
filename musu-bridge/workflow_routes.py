"""FastAPI router for V23.4 Phase 4 T2-A' workflow CRUD + cross-PC endpoints.

Per wiki/432 §2.2 + §2.3. Pattern A (single-source-on-rendezvous-PC):
rendezvous PC's musu-bridge owns the workflow tables; peer PCs poll
`GET /api/workflows/_pending?assigned_pc=PC_X` over existing mesh_router
forward; peers PATCH results back. No state replication.

Auth: ALL endpoints under existing global Bearer via `apply_musu_middlewares`
(per server.py:1026). NOT added to bypass list. Pattern matches axis_routes.py.

Critic findings addressed:
- H4: `_get_db()` follows axis_routes.py:28-31 convention; NO `request.app.state.db`.
- M4: Pydantic v2 model validators split into three named methods so T2-T5 can
  target each rule. nodeSelector keys whitelisted via @field_validator (L2).
- L3: PATCH step body is typed `StepPatchBody`, not untyped dict.
- M1: Peer-claim PATCH carries `assigned_pc`; server enforces TOCTOU predicates
  in handlers.transition_workflow_step.
- OQ-CRIT-2: explicit POST /workflows/{id}/retry endpoint.
"""
from __future__ import annotations

from collections import defaultdict, deque
from typing import Any, Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field, field_validator, model_validator


workflow_router = APIRouter(prefix="/api", tags=["workflows"])


def _get_db() -> Any:
    """Lazy backend lookup — same pattern axis_routes.py:28-31 uses.

    Per Critic H4: do NOT use request.app.state.db (does not exist in this
    codebase). Bridge handlers consistently reach into the singleton backend
    via handlers._get_backend().
    """
    from handlers import _get_backend  # noqa: PLC0415 — avoid circular import
    return _get_backend()._db


# ---------------------------------------------------------------------------
# Pydantic models — wiki/432 §2.2
# ---------------------------------------------------------------------------

_ALLOWED_NODESELECTOR_KEYS = frozenset(
    {"gpu_vram_free_gb_min", "gpu_present", "os"}
)


class RetryPolicy(BaseModel):
    maxAttempts: int = Field(ge=0, le=10, default=0)
    backoffSeconds: int = Field(ge=1, default=30)


class AgentResources(BaseModel):
    cpu: str | None = None
    memory: str | None = None


class AgentInput(BaseModel):
    name: str
    from_: str = Field(alias="from")

    model_config = {"populate_by_name": True}


class AgentSpec(BaseModel):
    id: str = Field(
        min_length=1,
        max_length=63,
        pattern=r"^[a-z0-9][-a-z0-9]*[a-z0-9]$|^[a-z0-9]$",
    )
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
    def _whitelist_nodeselector_keys(
        cls, v: dict[str, str]
    ) -> dict[str, str]:
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

    model_config = {"populate_by_name": True}


class WorkflowSpec(BaseModel):
    agents: list[AgentSpec] = Field(min_length=1)
    edges: list[EdgeSpec] = Field(default_factory=list)

    @field_validator("agents")
    @classmethod
    def _unique_agent_ids(cls, agents: list[AgentSpec]) -> list[AgentSpec]:
        ids = [a.id for a in agents]
        if len(ids) != len(set(ids)):
            dups = sorted({i for i in ids if ids.count(i) > 1})
            raise ValueError(f"duplicate agent ids: {dups}")
        return agents

    # Per Critic M4: split monolithic validator into three named methods so
    # T2-T5 can target each rule, and Auditor "every validator has negative
    # test" is verifiable.

    @model_validator(mode="after")
    def _check_edges_reference_existing_agents(self) -> "WorkflowSpec":
        agent_ids = {a.id for a in self.agents}
        for e in self.edges:
            if e.from_ not in agent_ids:
                raise ValueError(f"edge.from '{e.from_}' not in agents")
            if e.to not in agent_ids:
                raise ValueError(f"edge.to '{e.to}' not in agents")
        return self

    @model_validator(mode="after")
    def _check_no_cycles(self) -> "WorkflowSpec":
        indeg: dict[str, int] = defaultdict(int)
        adj: dict[str, list[str]] = defaultdict(list)
        for e in self.edges:
            adj[e.from_].append(e.to)
            indeg[e.to] += 1
        q: deque = deque(a.id for a in self.agents if indeg[a.id] == 0)
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
    def _check_inputs_reference_declared_outputs(self) -> "WorkflowSpec":
        agent_outputs = {a.id: set(a.outputs) for a in self.agents}
        for a in self.agents:
            for inp in a.inputs:
                if inp.from_ not in agent_outputs:
                    raise ValueError(
                        f"agent '{a.id}' input references unknown source "
                        f"agent '{inp.from_}'"
                    )
                if inp.name not in agent_outputs[inp.from_]:
                    raise ValueError(
                        f"agent '{a.id}' input '{inp.name}' not in "
                        f"'{inp.from_}'.outputs (declared outputs: "
                        f"{sorted(agent_outputs[inp.from_])})"
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


class WorkflowDetailResponse(BaseModel):
    """Full workflow record + decoded spec (V23.4 audit-fix A1, wiki/435 v2).

    Editor needs the spec to repopulate the form when re-opening an existing
    workflow. The `spec` field is the raw decoded JSON dict (keys `agents` +
    `edges`, with edges using alias-form keys `from` / `to`) — matches the
    shape `frontend/src/lib/workflow-spec.ts:decodeWorkflow` consumes. We keep
    it as `dict[str, Any]` rather than `WorkflowSpec` so FastAPI serialization
    preserves the alias-form keys without an explicit `by_alias=True` dance.
    """
    id: str
    company_id: str
    name: str
    status: str
    spec: dict[str, Any]
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

    # Per Pydantic v2: explicit extra='forbid' so PATCH {"spec": ...} → 422
    # instead of silently dropping fields (test T14).
    model_config = {"extra": "forbid"}


class StepPatchBody(BaseModel):
    """PATCH body for /api/workflows/{wf_id}/steps/{step_id}.

    Per Critic L3: typed (was untyped dict; would let CHECK-constraint
    violations escape as 500).

    Per Critic M1: `assigned_pc` required when status='running' (the
    peer-side claim path). `transition_workflow_step` enforces TOCTOU
    predicates server-side.
    """
    status: Literal["running", "succeeded", "failed", "timeout"]
    result_json: str | None = None
    error_json: str | None = None
    assigned_pc: str | None = None


# ---------------------------------------------------------------------------
# FastAPI routes — wiki/432 §2.3
# ---------------------------------------------------------------------------


@workflow_router.post(
    "/workflows", status_code=201, response_model=WorkflowResponse
)
async def create_workflow(req: WorkflowCreateRequest) -> dict:
    from handlers import (  # noqa: PLC0415 — avoid circular
        NoEligiblePCError,
        create_workflow_handler,
    )

    db = _get_db()
    try:
        return create_workflow_handler(db, req.model_dump(by_alias=True))
    except NoEligiblePCError as e:
        raise HTTPException(
            status_code=422,
            detail={"error": "no_eligible_pcs", **e.context},
        )
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))


@workflow_router.get("/workflows", response_model=list[WorkflowResponse])
async def list_workflows(company_id: str) -> list[dict]:
    from handlers import list_workflows_handler  # noqa: PLC0415

    return list_workflows_handler(_get_db(), company_id)


@workflow_router.get(
    "/workflows/{id}/status", response_model=WorkflowStatusResponse
)
async def get_workflow_status(id: str) -> dict:
    from handlers import get_workflow_status_handler  # noqa: PLC0415

    result = get_workflow_status_handler(_get_db(), id)
    if not result:
        raise HTTPException(status_code=404)
    return result


@workflow_router.patch(
    "/workflows/{id}", response_model=WorkflowResponse
)
async def patch_workflow(id: str, patch: WorkflowStatusPatch) -> dict:
    from handlers import patch_workflow_status_handler  # noqa: PLC0415

    result = patch_workflow_status_handler(_get_db(), id, patch.status)
    if not result:
        raise HTTPException(status_code=404)
    return result


@workflow_router.delete("/workflows/{id}", status_code=204)
async def delete_workflow(id: str) -> None:
    from handlers import delete_workflow_handler  # noqa: PLC0415

    deleted = delete_workflow_handler(_get_db(), id)
    if not deleted:
        raise HTTPException(status_code=404)


@workflow_router.post(
    "/workflows/{id}/retry",
    status_code=200,
    response_model=None,
)
async def retry_workflow(id: str) -> dict:
    """Per OQ-CRIT-2: explicit retry endpoint for crash-failed workflows.

    Returns dict on success, 404 on not-found, 409 on not-retryable.
    """
    from handlers import retry_workflow_handler  # noqa: PLC0415

    result = retry_workflow_handler(_get_db(), id)
    if result is None:
        raise HTTPException(status_code=404)
    if result is False:
        raise HTTPException(
            status_code=409, detail="workflow not in retryable state"
        )
    return result


# Pattern A cross-PC endpoints (rendezvous PC only; peer PCs call via mesh_router)


@workflow_router.get("/workflows/_pending", response_model=list[dict])
async def get_pending_steps(
    assigned_pc: str, limit: int = 10
) -> list[dict]:
    from handlers import get_pending_steps_for_pc  # noqa: PLC0415

    return get_pending_steps_for_pc(_get_db(), assigned_pc, limit)


@workflow_router.get(
    "/workflows/{wf_id}", response_model=WorkflowDetailResponse
)
async def get_workflow_detail(wf_id: str) -> dict:
    """Per V23.4 audit-fix A1 (wiki/435 v2): editor needs full spec.

    Registered AFTER /workflows/_pending so `wf_id="_pending"` cannot shadow
    the literal-path endpoint (FastAPI matches routes in registration order).
    """
    from handlers import get_workflow_detail_handler  # noqa: PLC0415

    result = get_workflow_detail_handler(_get_db(), wf_id)
    if not result:
        raise HTTPException(status_code=404)
    return result


@workflow_router.patch(
    "/workflows/{wf_id}/steps/{step_id}", status_code=204
)
async def report_step_result(
    wf_id: str, step_id: str, body: StepPatchBody
) -> None:
    """Peer-side step result PATCH.

    Per Critic M1: transition_workflow_step makes the running-claim
    TOCTOU-safe by adding `AND status='pending' AND assigned_pc=?`
    predicates server-side.

    Status semantics:
      - running + lost-race    → 409
      - terminal + not-running → 404 (already terminal or wrong state)
      - success                → 204
    """
    from handlers import transition_workflow_step  # noqa: PLC0415

    transitioned = transition_workflow_step(
        _get_db(),
        step_id,
        new_status=body.status,
        result_json=body.result_json,
        error_json=body.error_json,
        claiming_pc=body.assigned_pc,
    )
    if not transitioned:
        # 409 for lost claim race, 404 for genuinely missing / wrong state.
        raise HTTPException(
            status_code=409 if body.status == "running" else 404
        )
