"""musu-bridge — lightweight routing server (:8070).

Routes agent messages through musu-core without any external dependencies.
No Mattermost, no Docker, no PostgreSQL.

Routes:
  POST /api/route         — Route a message to an agent via musu-core
  GET  /api/agents        — List registered agents
  GET  /api/channels      — Channel-to-agent mapping
  GET  /health            — Liveness check
"""
from __future__ import annotations

import logging

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from config import get_config
from handlers import route_chat, get_agents, get_channel_map

logger = logging.getLogger(__name__)
app = FastAPI(title="musu-bridge", version="0.2.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:3001",
        "http://localhost:1355",
    ],
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)


class RouteRequest(BaseModel):
    channel: str
    sender_id: str
    text: str


@app.post("/api/route")
async def api_route(req: RouteRequest) -> dict:
    """Route a message to the agent mapped to the given channel."""
    return await route_chat(channel=req.channel, sender_id=req.sender_id, text=req.text)


@app.get("/api/agents")
async def api_agents() -> list[dict]:
    """List all registered agents."""
    return get_agents()


@app.get("/api/channels")
async def api_channels() -> dict:
    """Return channel-to-agent mapping."""
    return get_channel_map()


@app.get("/health")
async def health() -> dict:
    return {"status": "ok"}


if __name__ == "__main__":
    cfg = get_config()
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    uvicorn.run(app, host=cfg.bridge_host, port=cfg.bridge_port)
