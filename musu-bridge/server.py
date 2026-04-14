"""musu-bridge — lightweight routing server (:8070).

Routes agent messages through musu-core without any external dependencies.
No Mattermost, no Docker, no PostgreSQL.

Routes:
  POST /api/route              — Route a message to an agent via musu-core
  GET  /api/agents             — List registered agents
  GET  /api/channels           — Channel-to-agent mapping
  GET  /api/messages           — List messages for a session (cursor-based pagination)
  GET  /api/messages/{id}      — Get a single message by id
  DELETE /api/messages/{id}    — Delete a message by id
  GET  /health                 — Liveness check
"""
from __future__ import annotations

import logging
import os

import uvicorn
from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from musu_core.middleware import apply_musu_middlewares
import audit
from config import get_config
from csrf_guard import CSRFOriginGuard
from hostname_guard import HostnameGuard
from handlers import (
    create_company,
    delete_company,
    delete_message_by_id,
    get_agents,
    get_channel_map,
    get_company,
    get_message_by_id,
    list_companies,
    list_messages,
    route_chat,
)

logger = logging.getLogger(__name__)
app = FastAPI(title="musu-bridge", version="0.2.0")

apply_musu_middlewares(
    app,
    bearer_token=os.getenv("MUSU_BRIDGE_TOKEN"),
    rate_limit_capacity=60,
    rate_limit_window_seconds=60, # 1 minute
    rate_limit_key_type="ip",
)

app.add_middleware(CSRFOriginGuard)
app.add_middleware(HostnameGuard)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:3001",
        "http://localhost:1355",
    ],
    allow_methods=["GET", "POST", "DELETE"],
    allow_headers=["Content-Type"],
)


class RouteRequest(BaseModel):
    channel: str
    sender_id: str
    text: str = Field(max_length=10000)


class CompanyCreateRequest(BaseModel):
    name: str
    template_key: str = "default"
    workspace_id: str = ""
    meta: dict = {}


@app.post("/api/route")
async def api_route(req: RouteRequest, request: Request) -> dict:
    """Route a message to the agent mapped to the given channel."""
    result = await route_chat(channel=req.channel, sender_id=req.sender_id, text=req.text)
    audit.record(
        actor_ip=request.client.host if request.client else "",
        method="POST",
        path="/api/route",
        status_code=200 if not result.get("error") else 500,
        agent_id=result.get("agent_id", ""),
        note=f"channel={req.channel} sender={req.sender_id}",
    )
    return result


@app.get("/api/agents")
async def api_agents() -> list[dict]:
    """List all registered agents."""
    return get_agents()


@app.get("/api/channels")
async def api_channels() -> dict:
    """Return channel-to-agent mapping."""
    return get_channel_map()


@app.get("/api/messages", summary="List messages for a session")
async def api_list_messages(
    session_id: str | None = Query(default=None, description="Session / conversation id"),
    conversation_id: str | None = Query(default=None, description="Alias for session_id"),
    limit: int = Query(default=50, ge=1, le=500, description="Max messages to return"),
    before_id: str | None = Query(default=None, description="Cursor: return messages before this id"),
    agent_id: str | None = Query(default=None, description="Filter by agent id"),
    date_from: str | None = Query(default=None, description="Filter: messages at or after this ISO timestamp"),
    date_to: str | None = Query(default=None, description="Filter: messages at or before this ISO timestamp"),
) -> list[dict]:
    """List messages for a session with cursor-based pagination.

    Pass either *session_id* or *conversationId*. Use *before_id* for backward
    pagination (returns messages older than the given message id).
    Optionally filter by *agent_id*, *date_from*, or *date_to* (ISO 8601).
    """
    sid = session_id or conversation_id
    if not sid:
        raise HTTPException(status_code=422, detail="session_id or conversationId query param is required")
    return list_messages(
        session_id=sid,
        limit=limit,
        before_id=before_id,
        agent_id=agent_id,
        date_from=date_from,
        date_to=date_to,
    )


@app.get("/api/messages/{message_id}", summary="Get a message by id")
async def api_get_message(message_id: str) -> dict:
    """Return a single message by id."""
    msg = get_message_by_id(message_id)
    if msg is None:
        raise HTTPException(status_code=404, detail="Message not found")
    return msg


@app.delete("/api/messages/{message_id}", summary="Delete a message by id")
async def api_delete_message(message_id: str, request: Request) -> dict:
    """Delete a message. Returns 404 if not found."""
    deleted = delete_message_by_id(message_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Message not found")
    audit.record(
        actor_ip=request.client.host if request.client else "",
        method="DELETE",
        path=f"/api/messages/{message_id}",
        status_code=200,
        note=f"message_id={message_id}",
    )
    return {"deleted": True, "id": message_id}


@app.get("/api/audit", summary="Recent audit log entries")
async def api_audit(
    limit: int = Query(default=100, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
) -> list[dict]:
    """Return recent audit log entries, newest first."""
    return audit.recent(limit=limit, offset=offset)


@app.get("/api/companies", summary="List companies")
async def api_list_companies(workspace_id: str | None = None) -> list[dict]:
    """List all companies, optionally filtered by workspace_id."""
    return list_companies(workspace_id=workspace_id)


@app.post("/api/companies", summary="Create a company")
async def api_create_company(req: CompanyCreateRequest) -> dict:
    """Create a new company."""
    return create_company(
        name=req.name,
        template_key=req.template_key,
        workspace_id=req.workspace_id,
        meta=req.meta,
    )


@app.get("/api/companies/{company_id}", summary="Get a company")
async def api_get_company(company_id: str) -> dict:
    """Get a company by id."""
    company = get_company(company_id)
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    return company


@app.delete("/api/companies/{company_id}", summary="Delete a company")
async def api_delete_company(company_id: str) -> dict:
    """Delete a company by id."""
    ok = delete_company(company_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Company not found")
    return {"deleted": company_id}


@app.get("/health")
async def health() -> dict:
    return {"status": "ok"}



if __name__ == "__main__":
    cfg = get_config()

    if os.getenv("MUSU_ENV") == "production":
        token = os.getenv("MUSU_BRIDGE_TOKEN")
        if not token or len(token) < 32:
            raise RuntimeError(
                "MUSU_ENV=production requires MUSU_BRIDGE_TOKEN (min 32 chars). "
                "Refusing to start."
            )

    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    uvicorn.run(app, host=cfg.bridge_host, port=cfg.bridge_port)
